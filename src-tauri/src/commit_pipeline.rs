//! 报告编排与提交提取管线：从仓库索引 + 提取选项抽出 commit，渲染成报告，可选 AI 润色，可选落盘。
//!
//! 这一层是纯粹的本地业务编排：它不感知 Tauri IPC，只接 ` models` 结构、`git_ops` 的提交提取与 `report` 的渲染。
//! `lib.rs` 的 `#[tauri::command]` 仅作 transport 薄封装，把进度回调桥接到 Tauri 事件。

use crate::ai;
use crate::git_ops;
use crate::models::{
    AuthorAliasGroup, BatchFailure, BatchReportOptions, BatchReportProgress, BatchReportResult,
    BlankDayFillOptions, BlankDayFillResult, CommitExtractProgress, CommitRecord, ExtractOptions,
    ExtractResult, HeatmapEntry, HeatmapOptions, HeatmapResult, MonthlyReportOptions,
    MonthlyReportResult, PeriodReportOptions, PeriodReportResult, RepoInfo, ReportEnhanceOptions,
    ReportEnhanceResult, TrendOptions, TrendPeriod, TrendProjectShare, TrendResult,
    WorkRhythmOptions, WorkRhythmResult,
};
use crate::report;
use chrono::Datelike;
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

const BATCH_MAX_OUTPUT_FILES: usize = 365;

pub fn generate_monthly_report_sync<F>(
    options: MonthlyReportOptions,
    on_progress: F,
) -> Result<MonthlyReportResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let dates = report::previous_month_range();
    let extract_options = monthly_extract_options(&options, &dates.0, &dates.1);
    let (_, commits, mut warnings) = collect_commits(&extract_options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut report_text = if options.redaction.enabled {
        report::render_monthly_report_with_redaction(
            &commits,
            &options.project_names,
            &dates.0,
            &dates.1,
            &report_author,
            &dates.2,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
            &options.redaction,
        )
    } else {
        report::render_monthly_report_with_template(
            &commits,
            &options.project_names,
            &dates.0,
            &dates.1,
            &report_author,
            &dates.2,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
        )
    };

    report_text = report::append_supplemental_items(
        &report_text,
        &options.supplemental_items,
        &options.redaction,
    )?;

    report_text = apply_ai_if_enabled(report_text, &options, &dates, &report_author, &mut warnings);
    let output_file = save_monthly_if_enabled(&options, &dates.2, &report_text)?;
    let project_count = count_projects(&commits, &options.project_names);
    Ok(report::build_monthly_result(
        report_text,
        output_file,
        warnings,
        dates,
        project_count,
        commits.len(),
    ))
}

pub fn generate_period_report_sync<F>(
    options: PeriodReportOptions,
    on_progress: F,
) -> Result<PeriodReportResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    validate_period_options(&options)?;
    let dates = (
        options.start_date.clone(),
        options.end_date.clone(),
        options.period_label.clone(),
    );
    let extract_options = period_extract_options(&options);
    let (_, commits, mut warnings) = collect_commits(&extract_options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut report_text = match options.report_kind.as_str() {
        "weekly" if options.redaction.enabled => report::render_weekly_report_with_redaction(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.weekly,
            &options.redaction,
        ),
        "weekly" => report::render_weekly_report_with_template(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.weekly,
        ),
        "monthly" if options.redaction.enabled => report::render_monthly_report_with_redaction(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
            &options.redaction,
        ),
        "monthly" => report::render_monthly_report_with_template(
            &commits,
            &options.project_names,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.period_label,
            options.show_evidence_details,
            &options.commit_item_prefix_mode,
            &options.evidence_link_rules,
            &options.report_format_templates.monthly,
        ),
        _ => return Err(format!("未知报告类型：{}", options.report_kind)),
    };

    report_text = report::append_supplemental_items(
        &report_text,
        &options.supplemental_items,
        &options.redaction,
    )?;

    report_text =
        apply_ai_to_period_report(report_text, &options, &dates, &report_author, &mut warnings);
    let output_file = save_period_if_enabled(&options, &report_text)?;
    let projects =
        report::build_report_history_projects(&commits, &options.project_names, &options.redaction);
    Ok(report::build_period_result(
        report_text,
        output_file,
        warnings,
        dates,
        options.report_kind,
        projects,
        commits,
    ))
}

pub fn fill_blank_day_report_sync(
    options: BlankDayFillOptions,
) -> Result<BlankDayFillResult, String> {
    let evidence = options.base_evidence.trim().to_string();
    if evidence.is_empty() {
        return Err("素材周期内没有可用的提交线索".to_string());
    }

    let item_count = options.item_count.clamp(1, 8);
    let report_author = report_author(&options.author_display_name, &options.author);
    let source_commit_count = evidence
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#')
        })
        .count() as u32;

    let draft_text = ai::fill_blank_day_report(
        &evidence,
        &options.target_date,
        &options.source_start_date,
        &options.source_end_date,
        &report_author,
        item_count,
        &options.user_prompt,
        &options.ai,
    )?;

    Ok(BlankDayFillResult {
        draft_text: draft_text.trim().to_string(),
        warnings: Vec::new(),
        item_count,
        source_commit_count,
    })
}

pub fn enhance_report_sync(options: ReportEnhanceOptions) -> Result<ReportEnhanceResult, String> {
    let base_report = options.base_report;
    if base_report.trim().is_empty() {
        return Err("当前报告为空，请先生成报告再润色".to_string());
    }

    let report_author = report_author(&options.author_display_name, &options.author);
    let result = match options.report_kind.as_str() {
        "weekly" => ai::enhance_weekly_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        "monthly" => ai::enhance_monthly_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        _ => ai::enhance_daily_report(
            &base_report,
            &options.start_date,
            &options.end_date,
            &report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
    };

    let mut warnings = Vec::new();
    let report_text = result.unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已保留当前报告：{}", err));
        base_report
    });

    Ok(ReportEnhanceResult {
        report_text,
        warnings,
    })
}

pub fn extract_commits_sync<F>(
    options: ExtractOptions,
    on_progress: F,
) -> Result<ExtractResult, String>
where
    F: FnMut(CommitExtractProgress),
{
    let (repos, commits, warnings) = collect_commits(&options, on_progress)?;
    let report_author = report_author(&options.author_display_name, &options.author);
    let mut result = report::build_extract_result(
        repos,
        commits,
        warnings,
        &options.project_names,
        options.show_project_and_branch,
        &options.commit_item_prefix_mode,
        options.show_evidence_details,
        options.detailed_output,
        &options.redaction,
        report::ExtractReportFormat {
            start_date: &options.start_date,
            end_date: &options.end_date,
            author: &report_author,
            period_label: &options.period_label,
            report_kind: &options.report_kind,
            evidence_link_rules: &options.evidence_link_rules,
            templates: &options.report_format_templates,
        },
    );
    append_supplemental_to_extract_result(&mut result, &options)?;
    apply_ai_to_extract_result(&mut result, &options, &report_author);
    Ok(result)
}

pub fn collect_heatmap_data(options: &HeatmapOptions) -> Result<HeatmapResult, String> {
    let weeks = options.weeks.unwrap_or(52);
    let today = chrono::Local::now().date_naive();
    let start = today - chrono::Duration::weeks(weeks as i64);
    let start_date = start.format("%Y-%m-%d").to_string();
    let end_date = today.format("%Y-%m-%d").to_string();

    let repos = git_ops::find_git_repos(&options.workspace_roots)?;

    let mut seen_hashes = HashSet::new();
    let mut day_counts: HashMap<String, u32> = HashMap::new();

    for repo in &repos {
        let entries =
            git_ops::get_commit_dates(repo, &start_date, &end_date, &options.author, true);
        let entries = match entries {
            Ok(v) => v,
            Err(_) => continue,
        };
        for (hash, date) in entries {
            if seen_hashes.insert(hash) {
                *day_counts.entry(date).or_insert(0) += 1;
            }
        }
    }

    let mut entries = Vec::new();
    let mut total_commits: u32 = 0;
    let mut active_days: u32 = 0;
    let mut busiest_day = String::new();
    let mut busiest_count: u32 = 0;

    let mut current = start;
    while current <= today {
        let date_str = current.format("%Y-%m-%d").to_string();
        let count = day_counts.get(&date_str).copied().unwrap_or(0);
        total_commits += count;
        if count > 0 {
            active_days += 1;
        }
        if count > busiest_count {
            busiest_count = count;
            busiest_day = date_str.clone();
        }
        entries.push(HeatmapEntry {
            date: date_str,
            count,
        });
        current += chrono::Duration::days(1);
    }

    let max_streak = compute_max_streak(&entries);

    Ok(HeatmapResult {
        entries,
        total_commits,
        active_days,
        max_streak,
        busiest_day,
        busiest_count,
    })
}

pub fn collect_work_rhythm(options: &WorkRhythmOptions) -> Result<WorkRhythmResult, String> {
    let today = chrono::Local::now().date_naive();
    let weekday_num = today.format("%u").to_string().parse::<i64>().unwrap_or(1);
    let this_week_start = today - chrono::Duration::days(weekday_num - 1);
    let last_week_start = this_week_start - chrono::Duration::days(7);
    let end_date = today.format("%Y-%m-%d").to_string();
    let start_date = last_week_start.format("%Y-%m-%d").to_string();

    let repos = git_ops::find_git_repos(&options.workspace_roots)?;

    let mut seen_hashes = HashSet::new();
    let mut timestamps: Vec<String> = Vec::new();

    for repo in &repos {
        let entries =
            git_ops::get_commit_timestamps(repo, &start_date, &end_date, &options.author, true);
        let entries = match entries {
            Ok(v) => v,
            Err(_) => continue,
        };
        for (hash, ts) in entries {
            if seen_hashes.insert(hash) {
                timestamps.push(ts);
            }
        }
    }

    let mut hourly = vec![0u32; 24];
    let mut weekday = vec![0u32; 7];
    let mut this_week: u32 = 0;
    let mut last_week: u32 = 0;
    let mut overtime_count: u32 = 0;
    let mut weekend_count: u32 = 0;
    let this_week_start_str = this_week_start.format("%Y-%m-%d").to_string();

    for ts in &timestamps {
        let (date_part, time_part) = match parse_iso_date_time(ts) {
            Some(v) => v,
            None => continue,
        };
        let hour = match parse_hour(&time_part) {
            Some(h) => h,
            None => continue,
        };
        let dow = match day_of_week(&date_part) {
            Some(d) => d,
            None => continue,
        };

        if hour < 24 {
            hourly[hour as usize] += 1;
        }
        if dow < 7 {
            weekday[dow as usize] += 1;
        }

        if date_part.as_str() >= this_week_start_str.as_str() {
            this_week += 1;
        } else {
            last_week += 1;
        }

        let is_weekend = dow >= 5;
        if is_weekend {
            weekend_count += 1;
            overtime_count += 1;
        } else if hour >= 21 || hour < 6 {
            overtime_count += 1;
        }
    }

    let total = timestamps.len() as f64;
    let overtime_ratio = if total > 0.0 {
        overtime_count as f64 / total
    } else {
        0.0
    };
    let weekend_ratio = if total > 0.0 {
        weekend_count as f64 / total
    } else {
        0.0
    };

    let busiest_hour = hourly
        .iter()
        .enumerate()
        .max_by_key(|(_, count)| *count)
        .map(|(h, _)| h as u32)
        .unwrap_or(0);

    Ok(WorkRhythmResult {
        hourly_distribution: hourly,
        weekday_distribution: weekday,
        this_week_commits: this_week,
        last_week_commits: last_week,
        overtime_ratio,
        busiest_hour,
        weekend_ratio,
    })
}

pub fn collect_trend_data(options: &TrendOptions) -> Result<TrendResult, String> {
    let is_weekly = options.granularity != "monthly";
    let periods = options.periods.unwrap_or(12);
    let today = chrono::Local::now().date_naive();

    let (start_date, buckets) = if is_weekly {
        build_weekly_buckets(today, periods)
    } else {
        build_monthly_buckets(today, periods)
    };
    let end_date = today.format("%Y-%m-%d").to_string();

    let repos = git_ops::find_git_repos(&options.workspace_roots)?;
    let mut seen_hashes = HashSet::new();
    let mut all_commits: Vec<CommitRecord> = Vec::new();

    for repo in &repos {
        let query = git_ops::GitCommitQuery {
            start_date: &start_date,
            end_date: &end_date,
            author: &options.author,
            extract_all_branches: true,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
        };
        let records = match git_ops::get_git_commits(repo, &query) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for record in records {
            let key = format!("{}:{}", record.repo_path, record.hash);
            if seen_hashes.insert(key) {
                all_commits.push(record);
            }
        }
    }

    let mut period_data: Vec<TrendPeriod> = buckets
        .iter()
        .map(|(label, _, _)| TrendPeriod {
            label: label.clone(),
            commits: 0,
            additions: 0,
            deletions: 0,
            active_projects: 0,
        })
        .collect();
    let mut period_projects: Vec<HashSet<String>> =
        buckets.iter().map(|_| HashSet::new()).collect();

    let mut project_commits: HashMap<String, (u32, u64)> = HashMap::new();

    let weekday_num = today.format("%u").to_string().parse::<i64>().unwrap_or(1);
    let this_week_start = today - chrono::Duration::days(weekday_num - 1);
    let last_week_start = this_week_start - chrono::Duration::days(7);
    let this_month_start_str = today.format("%Y-%m-01").to_string();
    let last_month = if today.month() == 1 {
        chrono::NaiveDate::from_ymd_opt(today.year() - 1, 12, 1).unwrap()
    } else {
        chrono::NaiveDate::from_ymd_opt(today.year(), today.month() - 1, 1).unwrap()
    };
    let last_month_start_str = last_month.format("%Y-%m-%d").to_string();
    let last_month_end_str = {
        let d = if today.month() == 1 {
            chrono::NaiveDate::from_ymd_opt(today.year(), 1, 1).unwrap()
        } else {
            chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap()
        };
        (d - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string()
    };

    let this_week_start_str = this_week_start.format("%Y-%m-%d").to_string();
    let last_week_start_str = last_week_start.format("%Y-%m-%d").to_string();
    let last_week_end_str = (this_week_start - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let mut this_week_commits: u32 = 0;
    let mut last_week_commits: u32 = 0;
    let mut this_month_commits: u32 = 0;
    let mut last_month_commits: u32 = 0;

    for commit in &all_commits {
        let commit_date = extract_date_prefix(&commit.date);

        for (i, (_, bucket_start, bucket_end)) in buckets.iter().enumerate() {
            if commit_date.as_str() >= bucket_start.as_str()
                && commit_date.as_str() <= bucket_end.as_str()
            {
                period_data[i].commits += 1;
                period_data[i].additions += commit.additions;
                period_data[i].deletions += commit.deletions;
                period_projects[i].insert(commit.project_name.clone());
                break;
            }
        }

        let entry = project_commits
            .entry(commit.project_name.clone())
            .or_insert((0, 0));
        entry.0 += 1;
        entry.1 += commit.additions;

        if commit_date.as_str() >= this_week_start_str.as_str() {
            this_week_commits += 1;
        } else if commit_date.as_str() >= last_week_start_str.as_str()
            && commit_date.as_str() <= last_week_end_str.as_str()
        {
            last_week_commits += 1;
        }

        if commit_date.as_str() >= this_month_start_str.as_str() {
            this_month_commits += 1;
        } else if commit_date.as_str() >= last_month_start_str.as_str()
            && commit_date.as_str() <= last_month_end_str.as_str()
        {
            last_month_commits += 1;
        }
    }

    for (i, projects) in period_projects.into_iter().enumerate() {
        period_data[i].active_projects = projects.len() as u32;
    }

    let mut project_shares: Vec<TrendProjectShare> = project_commits
        .into_iter()
        .map(|(project, (commits, additions))| TrendProjectShare {
            project,
            commits,
            additions,
        })
        .collect();
    project_shares.sort_by(|a, b| b.commits.cmp(&a.commits));

    Ok(TrendResult {
        periods: period_data,
        project_shares,
        this_week_commits,
        last_week_commits,
        this_month_commits,
        last_month_commits,
    })
}

fn extract_date_prefix(date_str: &str) -> String {
    date_str.get(..10).unwrap_or(date_str).to_string()
}

fn build_weekly_buckets(
    today: chrono::NaiveDate,
    periods: u32,
) -> (String, Vec<(String, String, String)>) {
    let weekday_num = today.format("%u").to_string().parse::<i64>().unwrap_or(1);
    let this_week_end = today;
    let this_week_start = today - chrono::Duration::days(weekday_num - 1);

    let mut buckets = Vec::new();
    for i in 0..periods {
        let week_start = this_week_start - chrono::Duration::weeks(i as i64);
        let week_end = if i == 0 {
            this_week_end
        } else {
            week_start + chrono::Duration::days(6)
        };
        let label = format!(
            "{}-{}",
            week_start.format("%m-%d"),
            week_end.format("%m-%d")
        );
        buckets.push((
            label,
            week_start.format("%Y-%m-%d").to_string(),
            week_end.format("%Y-%m-%d").to_string(),
        ));
    }
    buckets.reverse();
    let start_date = buckets
        .first()
        .map(|(_, s, _)| s.clone())
        .unwrap_or_default();
    (start_date, buckets)
}

fn build_monthly_buckets(
    today: chrono::NaiveDate,
    periods: u32,
) -> (String, Vec<(String, String, String)>) {
    let mut buckets = Vec::new();
    for i in 0..periods {
        let (y, m) = {
            let total_months = today.year() * 12 + today.month() as i32 - 1 - i as i32;
            let y = total_months / 12;
            let m = (total_months % 12 + 1) as u32;
            (y, m)
        };
        let month_start = chrono::NaiveDate::from_ymd_opt(y, m, 1).unwrap();
        let next_month = if m == 12 {
            chrono::NaiveDate::from_ymd_opt(y + 1, 1, 1).unwrap()
        } else {
            chrono::NaiveDate::from_ymd_opt(y, m + 1, 1).unwrap()
        };
        let month_end = if i == 0 {
            today
        } else {
            next_month - chrono::Duration::days(1)
        };
        let label = month_start.format("%Y-%m").to_string();
        buckets.push((
            label,
            month_start.format("%Y-%m-%d").to_string(),
            month_end.format("%Y-%m-%d").to_string(),
        ));
    }
    buckets.reverse();
    let start_date = buckets
        .first()
        .map(|(_, s, _)| s.clone())
        .unwrap_or_default();
    (start_date, buckets)
}

fn parse_iso_date_time(ts: &str) -> Option<(String, String)> {
    let t_pos = ts.find('T')?;
    let date = ts[..t_pos].to_string();
    let rest = &ts[t_pos + 1..];
    let time_end = rest
        .find('+')
        .or_else(|| rest.rfind('-').filter(|&p| p > 0));
    let time = match time_end {
        Some(pos) => rest[..pos].to_string(),
        None => rest.to_string(),
    };
    Some((date, time))
}

fn parse_hour(time: &str) -> Option<u32> {
    let hour_str = time.split(':').next()?;
    hour_str.parse::<u32>().ok()
}

fn day_of_week(date: &str) -> Option<u32> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y = parts[0].parse::<i32>().ok()?;
    let m = parts[1].parse::<i32>().ok()?;
    let d = parts[2].parse::<i32>().ok()?;
    let (adj_y, adj_m) = if m <= 2 { (y - 1, m + 12) } else { (y, m) };
    let q = d;
    let k = adj_y % 100;
    let j = adj_y / 100;
    let h = (q + (13 * (adj_m + 1)) / 5 + k + k / 4 + j / 4 + 5 * j) % 7;
    let dow = ((h + 5) % 7) as u32;
    Some(dow)
}

fn compute_max_streak(entries: &[HeatmapEntry]) -> u32 {
    let mut max = 0u32;
    let mut current = 0u32;
    for entry in entries {
        if entry.count > 0 {
            current += 1;
            if current > max {
                max = current;
            }
        } else {
            current = 0;
        }
    }
    max
}

fn save_monthly_if_enabled(
    options: &MonthlyReportOptions,
    month_label: &str,
    report_text: &str,
) -> Result<String, String> {
    if !options.output_enabled {
        return Ok(String::new());
    }
    let file_name = format!("monthly_report_{}.md", month_label);
    report::save_report_file(&options.output_dir, &file_name, report_text)
}

fn save_period_if_enabled(
    options: &PeriodReportOptions,
    report_text: &str,
) -> Result<String, String> {
    if !options.output_enabled {
        return Ok(String::new());
    }
    let prefix = match options.report_kind.as_str() {
        "weekly" => "weekly_report",
        "monthly" => "monthly_report",
        _ => "period_report",
    };
    let file_name = format!("{}_{}.md", prefix, options.period_label);
    report::save_report_file(&options.output_dir, &file_name, report_text)
}

fn collect_commits<F>(
    options: &ExtractOptions,
    on_progress: F,
) -> Result<(Vec<RepoInfo>, Vec<CommitRecord>, Vec<String>), String>
where
    F: FnMut(CommitExtractProgress),
{
    let mut on_progress = on_progress;
    let repos = resolve_report_repos(options)?;
    let disabled_repos: HashSet<&str> = options.disabled_repos.iter().map(String::as_str).collect();
    let enabled_repos: Vec<RepoInfo> = repos
        .iter()
        .filter(|repo| !disabled_repos.contains(repo.path.as_str()))
        .cloned()
        .collect();
    let concurrency = commit_extract_parallelism(enabled_repos.len());

    emit_commit_progress(
        &mut on_progress,
        CommitExtractProgress {
            total_repos: enabled_repos.len(),
            completed_repos: 0,
            current_repo: String::new(),
            commit_count: 0,
            warning_count: 0,
            concurrency,
            done: enabled_repos.is_empty(),
        },
    );

    let (mut commits, warnings) = collect_enabled_repo_commits_parallel(
        &enabled_repos,
        options,
        concurrency,
        &mut on_progress,
    )?;
    normalize_commits(&mut commits);
    apply_author_aliases(&mut commits, &options.author_aliases);

    emit_commit_progress(
        &mut on_progress,
        CommitExtractProgress {
            total_repos: enabled_repos.len(),
            completed_repos: enabled_repos.len(),
            current_repo: String::new(),
            commit_count: commits.len(),
            warning_count: warnings.len(),
            concurrency,
            done: true,
        },
    );

    Ok((repos, commits, warnings))
}

fn resolve_report_repos(options: &ExtractOptions) -> Result<Vec<RepoInfo>, String> {
    if options.indexed_repos.is_empty() {
        return git_ops::find_git_repos(&options.root_dirs);
    }

    let mut seen = HashSet::new();
    let mut repos = Vec::new();
    for repo in &options.indexed_repos {
        if repo.path.trim().is_empty() || repo.name.trim().is_empty() {
            continue;
        }
        if seen.insert(repo.path.clone()) {
            repos.push(repo.clone());
        }
    }
    repos.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(repos)
}

fn collect_enabled_repo_commits_parallel<F>(
    repos: &[RepoInfo],
    options: &ExtractOptions,
    concurrency: usize,
    on_progress: &mut F,
) -> Result<(Vec<CommitRecord>, Vec<String>), String>
where
    F: FnMut(CommitExtractProgress),
{
    if repos.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }

    let (receiver, handles) = spawn_commit_workers(repos, options, concurrency);
    let results = gather_commit_results(receiver, repos.len(), concurrency, on_progress);
    wait_commit_workers(handles)?;
    merge_commit_results(results)
}

fn spawn_commit_workers(
    repos: &[RepoInfo],
    options: &ExtractOptions,
    concurrency: usize,
) -> (
    mpsc::Receiver<CommitExtractionResult>,
    Vec<thread::JoinHandle<()>>,
) {
    let jobs = Arc::new(Mutex::new(VecDeque::from(
        repos
            .iter()
            .cloned()
            .enumerate()
            .map(|(index, repo)| CommitExtractionJob { index, repo })
            .collect::<Vec<_>>(),
    )));
    let query = CommitQuerySettings::from(options);
    let (sender, receiver) = mpsc::channel();
    let mut handles = Vec::new();
    for _ in 0..concurrency {
        let jobs = Arc::clone(&jobs);
        let sender = sender.clone();
        let query = query.clone();
        handles.push(thread::spawn(move || loop {
            let job = {
                let mut jobs = jobs.lock().expect("commit extraction job queue poisoned");
                jobs.pop_front()
            };
            let Some(job) = job else {
                break;
            };
            let git_query = git_ops::GitCommitQuery {
                start_date: &query.start_date,
                end_date: &query.end_date,
                author: &query.author,
                extract_all_branches: query.extract_all_branches,
                exclude_merge_commits: query.exclude_merge_commits,
                exclude_revert_commits: query.exclude_revert_commits,
                exclude_bot_commits: query.exclude_bot_commits,
            };
            let records = git_ops::get_git_commits(&job.repo, &git_query);
            if sender
                .send(CommitExtractionResult {
                    index: job.index,
                    repo_name: job.repo.name,
                    records,
                })
                .is_err()
            {
                break;
            }
        }));
    }
    drop(sender);
    (receiver, handles)
}

fn gather_commit_results<F>(
    receiver: mpsc::Receiver<CommitExtractionResult>,
    repo_count: usize,
    concurrency: usize,
    on_progress: &mut F,
) -> Vec<Option<CommitExtractionResult>>
where
    F: FnMut(CommitExtractProgress),
{
    let mut completed_repos = 0;
    let mut commit_count = 0;
    let mut warning_count = 0;
    let mut results: Vec<Option<CommitExtractionResult>> = (0..repo_count).map(|_| None).collect();
    for result in receiver {
        completed_repos += 1;
        match &result.records {
            Ok(records) => commit_count += records.len(),
            Err(_) => warning_count += 1,
        }
        emit_commit_progress(
            on_progress,
            CommitExtractProgress {
                total_repos: repo_count,
                completed_repos,
                current_repo: result.repo_name.clone(),
                commit_count,
                warning_count,
                concurrency,
                done: false,
            },
        );
        let index = result.index;
        results[index] = Some(result);
    }
    results
}

fn wait_commit_workers(handles: Vec<thread::JoinHandle<()>>) -> Result<(), String> {
    for handle in handles {
        handle
            .join()
            .map_err(|_| "提取提交的工作线程异常退出".to_string())?;
    }
    Ok(())
}

fn merge_commit_results(
    results: Vec<Option<CommitExtractionResult>>,
) -> Result<(Vec<CommitRecord>, Vec<String>), String> {
    let mut commits = Vec::new();
    let mut warnings = Vec::new();
    for result in results {
        let result = result.ok_or_else(|| "提取提交任务未完整返回".to_string())?;
        match result.records {
            Ok(mut records) => commits.append(&mut records),
            Err(err) => warnings.push(format!("{}：{}", result.repo_name, err)),
        }
    }

    Ok((commits, warnings))
}

fn emit_commit_progress<F>(on_progress: &mut F, progress: CommitExtractProgress)
where
    F: FnMut(CommitExtractProgress),
{
    on_progress(progress);
}

fn commit_extract_parallelism(repo_count: usize) -> usize {
    if repo_count <= 1 {
        return repo_count;
    }
    let cpu_count = thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4);
    cpu_count.clamp(2, 8).min(repo_count)
}

#[derive(Clone)]
struct CommitQuerySettings {
    start_date: String,
    end_date: String,
    author: String,
    extract_all_branches: bool,
    exclude_merge_commits: bool,
    exclude_revert_commits: bool,
    exclude_bot_commits: bool,
}

impl From<&ExtractOptions> for CommitQuerySettings {
    fn from(options: &ExtractOptions) -> Self {
        Self {
            start_date: options.start_date.clone(),
            end_date: options.end_date.clone(),
            author: options.author.clone(),
            extract_all_branches: options.extract_all_branches,
            exclude_merge_commits: options.exclude_merge_commits,
            exclude_revert_commits: options.exclude_revert_commits,
            exclude_bot_commits: options.exclude_bot_commits,
        }
    }
}

struct CommitExtractionJob {
    index: usize,
    repo: RepoInfo,
}

struct CommitExtractionResult {
    index: usize,
    repo_name: String,
    records: Result<Vec<CommitRecord>, String>,
}

fn normalize_commits(commits: &mut Vec<CommitRecord>) {
    commits.sort_by(|left, right| {
        right
            .date
            .cmp(&left.date)
            .then_with(|| left.repo_path.cmp(&right.repo_path))
            .then_with(|| left.hash.cmp(&right.hash))
    });

    let mut seen = HashSet::new();
    commits.retain(|commit| seen.insert((commit.repo_path.clone(), commit.hash.clone())));
}

fn monthly_extract_options(
    options: &MonthlyReportOptions,
    start: &str,
    end: &str,
) -> ExtractOptions {
    ExtractOptions {
        root_dirs: options.root_dirs.clone(),
        indexed_repos: options.indexed_repos.clone(),
        author: options.author.clone(),
        author_display_name: options.author_display_name.clone(),
        author_aliases: options.author_aliases.clone(),
        supplemental_items: options.supplemental_items.clone(),
        start_date: start.to_string(),
        end_date: end.to_string(),
        period_label: start.to_string(),
        report_kind: "monthly".to_string(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        commit_item_prefix_mode: options.commit_item_prefix_mode.clone(),
        show_evidence_details: options.show_evidence_details,
        evidence_link_rules: options.evidence_link_rules.clone(),
        redaction: options.redaction.clone(),
        project_names: options.project_names.clone(),
        report_format_templates: options.report_format_templates.clone(),
        refinement_instruction: options.refinement_instruction.clone(),
        system_prompt: String::new(),
        ai: options.ai.clone(),
    }
}

fn period_extract_options(options: &PeriodReportOptions) -> ExtractOptions {
    ExtractOptions {
        root_dirs: options.root_dirs.clone(),
        indexed_repos: options.indexed_repos.clone(),
        author: options.author.clone(),
        author_display_name: options.author_display_name.clone(),
        author_aliases: options.author_aliases.clone(),
        supplemental_items: options.supplemental_items.clone(),
        start_date: options.start_date.clone(),
        end_date: options.end_date.clone(),
        period_label: options.period_label.clone(),
        report_kind: options.report_kind.clone(),
        disabled_repos: options.disabled_repos.clone(),
        extract_all_branches: options.extract_all_branches,
        exclude_merge_commits: options.exclude_merge_commits,
        exclude_revert_commits: options.exclude_revert_commits,
        exclude_bot_commits: options.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        commit_item_prefix_mode: options.commit_item_prefix_mode.clone(),
        show_evidence_details: options.show_evidence_details,
        evidence_link_rules: options.evidence_link_rules.clone(),
        redaction: options.redaction.clone(),
        project_names: options.project_names.clone(),
        report_format_templates: options.report_format_templates.clone(),
        refinement_instruction: options.refinement_instruction.clone(),
        system_prompt: String::new(),
        ai: options.ai.clone(),
    }
}

fn append_supplemental_to_extract_result(
    result: &mut ExtractResult,
    options: &ExtractOptions,
) -> Result<(), String> {
    result.summary_text = report::append_supplemental_items(
        &result.summary_text,
        &options.supplemental_items,
        &options.redaction,
    )?;
    if !result.detailed_text.is_empty() {
        result.detailed_text = report::append_supplemental_items(
            &result.detailed_text,
            &options.supplemental_items,
            &options.redaction,
        )?;
    }
    Ok(())
}

fn apply_ai_to_extract_result(
    result: &mut ExtractResult,
    options: &ExtractOptions,
    report_author: &str,
) {
    if !options.ai.enabled {
        return;
    }

    let base_report = if options.detailed_output {
        &result.detailed_text
    } else {
        &result.summary_text
    };
    if base_report.trim().is_empty() {
        return;
    }

    match ai::enhance_daily_report(
        base_report,
        &options.start_date,
        &options.end_date,
        report_author,
        &options.refinement_instruction,
        &options.system_prompt,
        &options.ai,
    ) {
        Ok(enhanced) => {
            if options.detailed_output {
                result.detailed_text = enhanced;
            } else {
                result.summary_text = enhanced;
            }
        }
        Err(err) => result
            .warnings
            .push(format!("AI 润色失败，已使用本地摘要：{}", err)),
    }
}

fn apply_ai_if_enabled(
    report_text: String,
    options: &MonthlyReportOptions,
    dates: &(String, String, String),
    report_author: &str,
    warnings: &mut Vec<String>,
) -> String {
    if !options.ai.enabled {
        return report_text;
    }

    ai::enhance_monthly_report(
        &report_text,
        &dates.0,
        &dates.1,
        report_author,
        &options.refinement_instruction,
        &options.system_prompt,
        &options.ai,
    )
    .unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已使用本地模板：{}", err));
        report_text
    })
}

fn apply_ai_to_period_report(
    report_text: String,
    options: &PeriodReportOptions,
    dates: &(String, String, String),
    report_author: &str,
    warnings: &mut Vec<String>,
) -> String {
    if !options.ai.enabled {
        return report_text;
    }

    let result = match options.report_kind.as_str() {
        "weekly" => ai::enhance_weekly_report(
            &report_text,
            &dates.0,
            &dates.1,
            report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
        _ => ai::enhance_monthly_report(
            &report_text,
            &dates.0,
            &dates.1,
            report_author,
            &options.refinement_instruction,
            &options.system_prompt,
            &options.ai,
        ),
    };

    result.unwrap_or_else(|err| {
        warnings.push(format!("AI 润色失败，已使用本地模板：{}", err));
        report_text
    })
}

fn validate_period_options(options: &PeriodReportOptions) -> Result<(), String> {
    if options.start_date.trim().is_empty() || options.end_date.trim().is_empty() {
        return Err("请选择完整的报告周期".to_string());
    }
    if options.start_date.as_str() > options.end_date.as_str() {
        return Err("报告开始日期不能晚于结束日期".to_string());
    }
    if options.period_label.trim().is_empty() {
        return Err("报告周期标签不能为空".to_string());
    }
    Ok(())
}

fn count_projects(
    commits: &[crate::models::CommitRecord],
    project_names: &HashMap<String, String>,
) -> usize {
    commits
        .iter()
        .map(|commit| {
            let exact = format!("{}({})", commit.project_name, commit.branch_name);
            project_names
                .get(&exact)
                .or_else(|| project_names.get(&format!("{}(*)", commit.project_name)))
                .cloned()
                .unwrap_or_else(|| exact)
        })
        .collect::<HashSet<_>>()
        .len()
}

fn apply_author_aliases(commits: &mut [CommitRecord], groups: &[AuthorAliasGroup]) {
    if groups.is_empty() {
        return;
    }
    for commit in commits {
        if let Some(display_name) =
            resolve_author_alias_display(&commit.author, &commit.author_email, groups)
        {
            commit.author = display_name;
        }
    }
}

fn resolve_author_alias_display(
    author: &str,
    email: &str,
    groups: &[AuthorAliasGroup],
) -> Option<String> {
    for group in groups {
        let display_name = group.display_name.trim();
        if display_name.is_empty() {
            continue;
        }
        if author_identity_matches(display_name, author, email)
            || group
                .aliases
                .iter()
                .any(|alias| author_identity_matches(alias, author, email))
        {
            return Some(display_name.to_string());
        }
    }
    None
}

fn author_identity_matches(candidate: &str, author: &str, email: &str) -> bool {
    let candidate = normalize_author_identity(candidate);
    !candidate.is_empty()
        && (candidate == normalize_author_identity(author)
            || candidate == normalize_author_identity(email))
}

fn normalize_author_identity(value: &str) -> String {
    value.trim().to_lowercase()
}

fn report_author(display_name: &str, author_filter: &str) -> String {
    let display_name = display_name.trim();
    if !display_name.is_empty() {
        return display_name.to_string();
    }
    author_filter.to_string()
}

fn batch_output_total(
    period_count: usize,
    group_count: usize,
    format_count: usize,
) -> Result<usize, String> {
    let total = period_count
        .checked_mul(group_count)
        .and_then(|count| count.checked_mul(format_count))
        .ok_or_else(|| "批量输出文件数量超出支持范围".to_string())?;
    if total > BATCH_MAX_OUTPUT_FILES {
        return Err(format!(
            "本次将生成 {total} 个文件，超过上限 {BATCH_MAX_OUTPUT_FILES}"
        ));
    }
    Ok(total)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum BatchGroup {
    All,
    Author(String),
    Project(String),
}

impl BatchGroup {
    fn label(&self) -> Option<&str> {
        match self {
            Self::All => None,
            Self::Author(name) | Self::Project(name) => Some(name),
        }
    }

    fn author_name(&self, options: &BatchReportOptions) -> String {
        match self {
            Self::Author(name) => name.clone(),
            _ => report_author(&options.author_display_name, &options.author),
        }
    }

    fn project_name(&self) -> String {
        match self {
            Self::Project(name) => name.clone(),
            _ => "全部项目".to_string(),
        }
    }

    fn includes(&self, commit: &CommitRecord, project_names: &HashMap<String, String>) -> bool {
        match self {
            Self::All => true,
            Self::Author(name) => commit.author == *name,
            Self::Project(name) => report::batch_project_name(project_names, commit) == *name,
        }
    }
}

fn normalize_batch_group_mode(mode: &str) -> Result<&'static str, String> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "" | "all" => Ok("all"),
        "author" => Ok("author"),
        "project" => Ok("project"),
        other => Err(format!("暂不支持的批量分组方式：{other}")),
    }
}

fn batch_groups(
    mode: &str,
    commits: &[CommitRecord],
    project_names: &HashMap<String, String>,
) -> Result<Vec<BatchGroup>, String> {
    if mode == "all" {
        return Ok(vec![BatchGroup::All]);
    }
    let mut names = BTreeMap::new();
    for commit in commits {
        let candidate = if mode == "author" {
            commit.author.trim().to_string()
        } else {
            report::batch_project_name(project_names, commit)
        };
        if !candidate.is_empty() {
            names.entry(candidate.to_lowercase()).or_insert(candidate);
        }
    }
    if names.is_empty() {
        let target = if mode == "author" { "作者" } else { "项目" };
        return Err(format!("所选时间范围内没有可按{target}分组的提交记录"));
    }
    Ok(names
        .into_values()
        .map(|name| {
            if mode == "author" {
                BatchGroup::Author(name)
            } else {
                BatchGroup::Project(name)
            }
        })
        .collect())
}

fn select_batch_commits(
    commits: &[CommitRecord],
    group: &BatchGroup,
    project_names: &HashMap<String, String>,
) -> Vec<CommitRecord> {
    commits
        .iter()
        .filter(|commit| group.includes(commit, project_names))
        .cloned()
        .collect()
}

pub fn batch_generate_reports_sync<F>(
    options: BatchReportOptions,
    mut on_progress: F,
) -> Result<BatchReportResult, String>
where
    F: FnMut(BatchReportProgress),
{
    let periods = report::split_date_range(
        &options.range_start,
        &options.range_end,
        &options.split_granularity,
    )?;
    let formats = report::normalize_batch_export_formats(&options.export_formats)?;
    report::validate_batch_file_name_template(&options.file_name_template)?;
    let group_mode = normalize_batch_group_mode(&options.group_mode)?;
    let groups = discover_batch_groups(&options, group_mode)?;
    let total = batch_output_total(periods.len(), groups.len(), formats.len())?;
    let mut run = BatchRunState::new(total);
    let mut used_names = HashSet::new();

    for period in &periods {
        match collect_commits(&batch_period_extract_options(&options, period), |_| {}) {
            Ok((_, commits, _)) => generate_batch_period(
                BatchPeriodJob {
                    options: &options,
                    period,
                    groups: &groups,
                    formats: &formats,
                    commits: &commits,
                    used_names: &mut used_names,
                },
                &mut run,
                &mut on_progress,
            ),
            Err(error) => record_batch_period_failure(
                BatchPeriodFailureJob {
                    period,
                    groups: &groups,
                    formats: &formats,
                    error,
                },
                &mut run,
                &mut on_progress,
            ),
        }
    }
    on_progress(run.progress(String::new(), true));
    Ok(run.into_result(options.output_dir))
}

fn discover_batch_groups(
    options: &BatchReportOptions,
    group_mode: &str,
) -> Result<Vec<BatchGroup>, String> {
    if group_mode == "all" {
        return Ok(vec![BatchGroup::All]);
    }
    let (_, commits, _) = collect_commits(&batch_extract_options(options), |_| {})?;
    batch_groups(group_mode, &commits, &options.project_names)
}

struct BatchPeriodJob<'a> {
    options: &'a BatchReportOptions,
    period: &'a crate::models::SubPeriod,
    groups: &'a [BatchGroup],
    formats: &'a [&'static str],
    commits: &'a [CommitRecord],
    used_names: &'a mut HashSet<String>,
}

fn generate_batch_period<F>(job: BatchPeriodJob<'_>, run: &mut BatchRunState, on_progress: &mut F)
where
    F: FnMut(BatchReportProgress),
{
    for group in job.groups {
        let selected = select_batch_commits(job.commits, group, &job.options.project_names);
        match render_batch_report(BatchRenderJob {
            options: job.options,
            period: job.period,
            group,
            commits: selected,
        }) {
            Ok(content) => export_batch_period(
                BatchExportJob {
                    options: job.options,
                    period: job.period,
                    group,
                    content: &content,
                    formats: job.formats,
                    used_names: job.used_names,
                },
                run,
                on_progress,
            ),
            Err(error) => record_batch_generation_failure(
                BatchFailureJob {
                    period: job.period,
                    group,
                    formats: job.formats,
                    error,
                },
                run,
                on_progress,
            ),
        }
    }
}

struct BatchPeriodFailureJob<'a> {
    period: &'a crate::models::SubPeriod,
    groups: &'a [BatchGroup],
    formats: &'a [&'static str],
    error: String,
}

fn record_batch_period_failure<F>(
    job: BatchPeriodFailureJob<'_>,
    run: &mut BatchRunState,
    on_progress: &mut F,
) where
    F: FnMut(BatchReportProgress),
{
    for group in job.groups {
        record_batch_generation_failure(
            BatchFailureJob {
                period: job.period,
                group,
                formats: job.formats,
                error: job.error.clone(),
            },
            run,
            on_progress,
        );
    }
}

struct BatchRunState {
    total: usize,
    completed: usize,
    succeeded: usize,
    failed: usize,
    failures: Vec<BatchFailure>,
}

impl BatchRunState {
    fn new(total: usize) -> Self {
        Self {
            total,
            completed: 0,
            succeeded: 0,
            failed: 0,
            failures: Vec::new(),
        }
    }

    fn progress(&self, current_label: String, done: bool) -> BatchReportProgress {
        BatchReportProgress {
            total: self.total,
            completed: self.completed,
            current_label,
            succeeded: self.succeeded,
            failed: self.failed,
            done,
        }
    }

    fn succeed(&mut self) {
        self.succeeded += 1;
        self.completed += 1;
    }

    fn fail(&mut self, label: String, error: String) {
        self.failed += 1;
        self.completed += 1;
        self.failures.push(BatchFailure { label, error });
    }

    fn into_result(self, output_dir: String) -> BatchReportResult {
        BatchReportResult {
            total: self.total,
            succeeded: self.succeeded,
            failed: self.failed,
            failures: self.failures,
            output_dir,
        }
    }
}

struct BatchExportJob<'a> {
    options: &'a BatchReportOptions,
    period: &'a crate::models::SubPeriod,
    group: &'a BatchGroup,
    content: &'a str,
    formats: &'a [&'static str],
    used_names: &'a mut HashSet<String>,
}

fn export_batch_period<F>(job: BatchExportJob<'_>, run: &mut BatchRunState, on_progress: &mut F)
where
    F: FnMut(BatchReportProgress),
{
    let author = job.group.author_name(job.options);
    let project = job.group.project_name();
    for format in job.formats {
        let label = batch_output_label(job.period, job.group, format);
        on_progress(run.progress(label.clone(), false));
        let context = report::BatchFileNameContext {
            period: job.period,
            author: &author,
            project: &project,
        };
        let file_name = report::batch_file_name(&job.options.file_name_template, format, context)
            .map(|candidate| {
                report::reserve_batch_file_name(&job.options.output_dir, &candidate, job.used_names)
            });
        let result = file_name.and_then(|name| {
            report::save_report_document(&job.options.output_dir, &name, job.content, format)
        });
        match result {
            Ok(_) => run.succeed(),
            Err(error) => run.fail(label, error),
        }
    }
}

struct BatchFailureJob<'a> {
    period: &'a crate::models::SubPeriod,
    group: &'a BatchGroup,
    formats: &'a [&'static str],
    error: String,
}

fn record_batch_generation_failure<F>(
    job: BatchFailureJob<'_>,
    run: &mut BatchRunState,
    on_progress: &mut F,
) where
    F: FnMut(BatchReportProgress),
{
    for format in job.formats {
        let label = batch_output_label(job.period, job.group, format);
        on_progress(run.progress(label.clone(), false));
        run.fail(label, job.error.clone());
    }
}

fn batch_output_label(
    period: &crate::models::SubPeriod,
    group: &BatchGroup,
    format: &str,
) -> String {
    let format_label = match format {
        "md" => "Markdown",
        "docx" => "Word",
        "pdf" => "PDF",
        _ => format,
    };
    match group.label() {
        Some(group_label) => format!(
            "{} · {} · {}",
            format_period_label(period),
            group_label,
            format_label
        ),
        None => format!("{} · {}", format_period_label(period), format_label),
    }
}

struct BatchRenderJob<'a> {
    options: &'a BatchReportOptions,
    period: &'a crate::models::SubPeriod,
    group: &'a BatchGroup,
    commits: Vec<CommitRecord>,
}

fn render_batch_report(job: BatchRenderJob<'_>) -> Result<String, String> {
    let author = job.group.author_name(job.options);
    match job.period.report_kind.as_str() {
        report_kind @ ("daily" | "custom") => {
            Ok(render_batch_extract_report(job, &author, report_kind))
        }
        "weekly" => Ok(render_batch_weekly_report(&job, &author)),
        "monthly" => Ok(render_batch_monthly_report(&job, &author)),
        _ => Err(format!("未知报告类型：{}", job.period.report_kind)),
    }
}

fn render_batch_extract_report(job: BatchRenderJob<'_>, author: &str, report_kind: &str) -> String {
    report::build_extract_result(
        Vec::new(),
        job.commits,
        Vec::new(),
        &job.options.project_names,
        true,
        &job.options.commit_item_prefix_mode,
        job.options.show_evidence_details,
        false,
        &job.options.redaction,
        report::ExtractReportFormat {
            start_date: &job.period.start,
            end_date: &job.period.end,
            author,
            period_label: &job.period.label,
            report_kind,
            evidence_link_rules: &job.options.evidence_link_rules,
            templates: &job.options.report_format_templates,
        },
    )
    .summary_text
}

fn render_batch_weekly_report(job: &BatchRenderJob<'_>, author: &str) -> String {
    report::render_weekly_report_with_redaction(
        &job.commits,
        &job.options.project_names,
        &job.period.start,
        &job.period.end,
        author,
        &job.period.label,
        job.options.show_evidence_details,
        &job.options.commit_item_prefix_mode,
        &job.options.evidence_link_rules,
        &job.options.report_format_templates.weekly,
        &job.options.redaction,
    )
}

fn render_batch_monthly_report(job: &BatchRenderJob<'_>, author: &str) -> String {
    report::render_monthly_report_with_redaction(
        &job.commits,
        &job.options.project_names,
        &job.period.start,
        &job.period.end,
        author,
        &job.period.label,
        job.options.show_evidence_details,
        &job.options.commit_item_prefix_mode,
        &job.options.evidence_link_rules,
        &job.options.report_format_templates.monthly,
        &job.options.redaction,
    )
}

fn batch_extract_options(opts: &BatchReportOptions) -> ExtractOptions {
    ExtractOptions {
        root_dirs: opts.root_dirs.clone(),
        indexed_repos: opts.indexed_repos.clone(),
        author: opts.author.clone(),
        author_display_name: opts.author_display_name.clone(),
        author_aliases: opts.author_aliases.clone(),
        supplemental_items: Vec::new(),
        start_date: opts.range_start.clone(),
        end_date: opts.range_end.clone(),
        period_label: format!("{}~{}", opts.range_start, opts.range_end),
        report_kind: "custom".to_string(),
        disabled_repos: opts.disabled_repos.clone(),
        extract_all_branches: opts.extract_all_branches,
        exclude_merge_commits: opts.exclude_merge_commits,
        exclude_revert_commits: opts.exclude_revert_commits,
        exclude_bot_commits: opts.exclude_bot_commits,
        detailed_output: false,
        show_project_and_branch: true,
        commit_item_prefix_mode: opts.commit_item_prefix_mode.clone(),
        show_evidence_details: opts.show_evidence_details,
        evidence_link_rules: opts.evidence_link_rules.clone(),
        redaction: opts.redaction.clone(),
        project_names: opts.project_names.clone(),
        report_format_templates: opts.report_format_templates.clone(),
        refinement_instruction: String::new(),
        system_prompt: String::new(),
        ai: crate::models::AiConfig {
            enabled: false,
            provider: String::new(),
            base_url: String::new(),
            model: String::new(),
            api_key: String::new(),
            temperature: 0.0,
            timeout_seconds: 0,
            proxy: Default::default(),
        },
    }
}

fn batch_period_extract_options(
    options: &BatchReportOptions,
    period: &crate::models::SubPeriod,
) -> ExtractOptions {
    let mut extract = batch_extract_options(options);
    extract.start_date = period.start.clone();
    extract.end_date = period.end.clone();
    extract.period_label = period.label.clone();
    extract.report_kind = period.report_kind.clone();
    extract
}

fn format_period_label(period: &crate::models::SubPeriod) -> String {
    match period.report_kind.as_str() {
        "daily" => format!("{} 日报", period.label),
        "weekly" => format!("{} 周报", period.label),
        "monthly" => format!("{} 月报", period.label),
        "custom" => format!("{} 自定义报告", period.label),
        _ => period.label.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AiConfig, CommitRecord};
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn normalize_commits_sorts_newest_first_and_deduplicates_per_repo() {
        let mut commits = vec![
            commit("repo-a", "same", "2026-06-01 10:00:00 +0800"),
            commit("repo-a", "old", "2026-05-30 10:00:00 +0800"),
            commit("repo-a", "same", "2026-06-01 10:00:00 +0800"),
            commit("repo-b", "new", "2026-06-02 10:00:00 +0800"),
        ];

        normalize_commits(&mut commits);

        assert_eq!(
            commits
                .iter()
                .map(|item| (item.repo_path.as_str(), item.hash.as_str()))
                .collect::<Vec<_>>(),
            vec![("repo-b", "new"), ("repo-a", "same"), ("repo-a", "old")]
        );
    }

    #[test]
    fn commit_extract_parallelism_is_bounded_by_repo_count_and_cap() {
        assert_eq!(commit_extract_parallelism(0), 0);
        assert_eq!(commit_extract_parallelism(1), 1);
        assert!(commit_extract_parallelism(2) <= 2);
        assert!(commit_extract_parallelism(32) <= 8);
    }

    #[test]
    fn apply_author_aliases_unifies_author_display_names() {
        let mut commits = vec![
            commit_by_author(
                "repo-a",
                "one",
                "2026-06-01 10:00:00 +0800",
                "zqqq",
                "zqqq@company.com",
            ),
            commit_by_author(
                "repo-a",
                "two",
                "2026-06-02 10:00:00 +0800",
                "Golden",
                "golden@example.com",
            ),
        ];
        let aliases = vec![AuthorAliasGroup {
            display_name: "GoldenZqqq".to_string(),
            aliases: vec!["zqqq".to_string(), "golden@example.com".to_string()],
        }];

        apply_author_aliases(&mut commits, &aliases);

        assert_eq!(commits[0].author, "GoldenZqqq");
        assert_eq!(commits[1].author, "GoldenZqqq");
    }

    #[test]
    fn resolve_report_repos_prefers_indexed_repos_and_deduplicates_paths() {
        let options = ExtractOptions {
            root_dirs: vec!["missing-root".to_string()],
            indexed_repos: vec![
                repo("zeta", "C:\\repo\\zeta"),
                repo("alpha", "C:\\repo\\alpha"),
                repo("zeta-copy", "C:\\repo\\zeta"),
            ],
            author: "tester".to_string(),
            author_display_name: String::new(),
            author_aliases: Vec::new(),
            supplemental_items: Vec::new(),
            start_date: "2026-06-01".to_string(),
            end_date: "2026-06-01".to_string(),
            period_label: "2026-06-01".to_string(),
            report_kind: "daily".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            detailed_output: false,
            show_project_and_branch: true,
            commit_item_prefix_mode: "mapped-project".to_string(),
            show_evidence_details: false,
            evidence_link_rules: Vec::new(),
            redaction: crate::models::ReportRedactionOptions::default(),
            project_names: Default::default(),
            report_format_templates: crate::models::ReportFormatTemplates::default(),
            refinement_instruction: String::new(),
            system_prompt: String::new(),
            ai: AiConfig {
                enabled: false,
                provider: "openai-compatible".to_string(),
                base_url: String::new(),
                model: String::new(),
                api_key: String::new(),
                temperature: 0.2,
                timeout_seconds: 60,
                proxy: Default::default(),
            },
        };

        let repos = resolve_report_repos(&options).unwrap();

        assert_eq!(repos.len(), 2);
        assert_eq!(repos[0].name, "alpha");
        assert_eq!(repos[1].name, "zeta");
    }

    #[test]
    fn period_report_smoke_extracts_commit_and_saves_markdown() {
        let root = temp_root("period-smoke");
        let repo_dir = root.join("repo-a");
        let output_dir = root.join("out");
        fs::create_dir_all(&repo_dir).unwrap();
        fs::create_dir_all(&output_dir).unwrap();
        init_smoke_repo(&repo_dir);

        let options = PeriodReportOptions {
            root_dirs: vec![root.to_string_lossy().to_string()],
            indexed_repos: vec![RepoInfo {
                path: repo_dir.to_string_lossy().to_string(),
                name: "repo-a".to_string(),
                branch: "main".to_string(),
            }],
            output_dir: output_dir.to_string_lossy().to_string(),
            output_enabled: true,
            author: "Smoke Tester".to_string(),
            author_display_name: String::new(),
            author_aliases: Vec::new(),
            supplemental_items: vec!["参加跨团队联调并同步风险".to_string()],
            start_date: "2026-06-10".to_string(),
            end_date: "2026-06-10".to_string(),
            period_label: "2026-W24".to_string(),
            report_kind: "weekly".to_string(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            commit_item_prefix_mode: "mapped-project".to_string(),
            show_evidence_details: true,
            evidence_link_rules: Vec::new(),
            redaction: crate::models::ReportRedactionOptions::default(),
            project_names: Default::default(),
            report_format_templates: crate::models::ReportFormatTemplates::default(),
            refinement_instruction: String::new(),
            system_prompt: String::new(),
            ai: AiConfig {
                enabled: false,
                provider: "openai-compatible".to_string(),
                base_url: String::new(),
                model: String::new(),
                api_key: String::new(),
                temperature: 0.2,
                timeout_seconds: 60,
                proxy: Default::default(),
            },
        };

        let result = generate_period_report_sync(options, |_| {}).unwrap();

        assert_eq!(result.commit_count, 1);
        assert!(result.report_text.contains("# 2026年第24周工作周报"));
        assert!(result.report_text.contains("完成 smoke 验证"));
        assert!(result.report_text.contains("## 用户补充事项（非 Git）"));
        assert!(result.report_text.contains("参加跨团队联调并同步风险"));
        assert!(result.report_text.contains("来源：`repo-a`"));
        assert!(result.output_file.ends_with("weekly_report_2026-W24.md"));
        assert!(Path::new(&result.output_file).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn batch_report_smoke_exports_multiple_formats_and_file_progress() {
        let root = temp_root("batch-smoke");
        let repo_dir = root.join("repo-a");
        let output_dir = root.join("out");
        fs::create_dir_all(&repo_dir).unwrap();
        fs::create_dir_all(&output_dir).unwrap();
        init_smoke_repo(&repo_dir);
        let options = batch_smoke_options(&root, &repo_dir, &output_dir);
        let mut progress = Vec::new();

        let result = batch_generate_reports_sync(options, |item| progress.push(item)).unwrap();

        assert_eq!(2, result.total);
        assert_eq!(2, result.succeeded);
        assert_eq!(0, result.failed);
        assert!(output_dir.join("2026-06-10-Smoke Tester-日报.md").exists());
        assert!(output_dir
            .join("2026-06-10-Smoke Tester-日报.docx")
            .exists());
        assert_eq!(Some(2), progress.last().map(|item| item.completed));
        assert!(progress.last().is_some_and(|item| item.done));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn batch_output_total_limits_actual_file_count() {
        assert_eq!(12, batch_output_total(3, 2, 2).unwrap());
        assert!(batch_output_total(61, 2, 3)
            .unwrap_err()
            .contains("超过上限 365"));
    }

    #[test]
    fn batch_groups_use_alias_normalized_authors_and_project_mappings() {
        let commits = vec![
            commit_by_author("repo-a", "a", "2026-06-10 10:00:00 +0800", "Alice", "a@x"),
            commit_by_author("repo-b", "b", "2026-06-11 10:00:00 +0800", "Bob", "b@x"),
        ];
        let project_names = HashMap::from([
            ("repo-a(*)".to_string(), "平台项目-".to_string()),
            ("repo-b(*)".to_string(), "客户端".to_string()),
        ]);

        assert_eq!(
            vec![
                BatchGroup::Author("Alice".to_string()),
                BatchGroup::Author("Bob".to_string())
            ],
            batch_groups("author", &commits, &project_names).unwrap()
        );
        assert_eq!(
            vec![
                BatchGroup::Project("客户端".to_string()),
                BatchGroup::Project("平台项目".to_string())
            ],
            batch_groups("project", &commits, &project_names).unwrap()
        );
    }

    #[test]
    fn grouped_batch_filters_group_without_skipping_empty_intersections() {
        let commits = vec![
            commit_by_author("repo-a", "a", "2026-06-10 10:00:00 +0800", "Alice", "a@x"),
            commit_by_author("repo-a", "b", "2026-06-11 10:00:00 +0800", "Bob", "b@x"),
        ];
        let selected = select_batch_commits(
            &commits,
            &BatchGroup::Author("Alice".to_string()),
            &HashMap::new(),
        );
        let empty = select_batch_commits(
            &commits,
            &BatchGroup::Author("Carol".to_string()),
            &HashMap::new(),
        );

        assert_eq!(1, selected.len());
        assert!(empty.is_empty());
        assert!(batch_groups("author", &[], &HashMap::new()).is_err());
    }

    #[test]
    fn batch_report_smoke_exports_one_file_per_author_group() {
        let root = temp_root("batch-author-smoke");
        let repo_dir = root.join("repo-a");
        let output_dir = root.join("out");
        fs::create_dir_all(&repo_dir).unwrap();
        fs::create_dir_all(&output_dir).unwrap();
        init_smoke_repo(&repo_dir);
        add_smoke_commit(&repo_dir, "Second Tester", "second@example.com");
        let mut options = batch_smoke_options(&root, &repo_dir, &output_dir);
        options.author = String::new();
        options.author_display_name = String::new();
        options.group_mode = "author".to_string();
        options.export_formats = vec!["markdown".to_string()];
        let mut progress = Vec::new();
        let result = batch_generate_reports_sync(options, |item| progress.push(item)).unwrap();

        assert_eq!(2, result.total);
        assert_eq!(2, result.succeeded);
        assert_eq!(
            Some((2, 2)),
            progress.last().map(|item| (item.total, item.completed))
        );
        assert!(progress.last().is_some_and(|item| item.done));
        assert!(output_dir.join("2026-06-10-Second Tester-日报.md").exists());
        assert!(output_dir.join("2026-06-10-Smoke Tester-日报.md").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn test_heatmap_streak_calculation() {
        let entries = vec![
            HeatmapEntry {
                date: "2026-07-01".to_string(),
                count: 0,
            },
            HeatmapEntry {
                date: "2026-07-02".to_string(),
                count: 3,
            },
            HeatmapEntry {
                date: "2026-07-03".to_string(),
                count: 1,
            },
            HeatmapEntry {
                date: "2026-07-04".to_string(),
                count: 5,
            },
            HeatmapEntry {
                date: "2026-07-05".to_string(),
                count: 0,
            },
            HeatmapEntry {
                date: "2026-07-06".to_string(),
                count: 2,
            },
            HeatmapEntry {
                date: "2026-07-07".to_string(),
                count: 1,
            },
            HeatmapEntry {
                date: "2026-07-08".to_string(),
                count: 4,
            },
            HeatmapEntry {
                date: "2026-07-09".to_string(),
                count: 1,
            },
            HeatmapEntry {
                date: "2026-07-10".to_string(),
                count: 0,
            },
        ];
        assert_eq!(compute_max_streak(&entries), 4);
    }

    #[test]
    fn test_heatmap_streak_all_active() {
        let entries = vec![
            HeatmapEntry {
                date: "2026-07-01".to_string(),
                count: 1,
            },
            HeatmapEntry {
                date: "2026-07-02".to_string(),
                count: 2,
            },
            HeatmapEntry {
                date: "2026-07-03".to_string(),
                count: 3,
            },
        ];
        assert_eq!(compute_max_streak(&entries), 3);
    }

    #[test]
    fn test_heatmap_empty_data() {
        let entries: Vec<HeatmapEntry> = Vec::new();
        assert_eq!(compute_max_streak(&entries), 0);
    }

    #[test]
    fn test_heatmap_all_zeros() {
        let entries = vec![
            HeatmapEntry {
                date: "2026-07-01".to_string(),
                count: 0,
            },
            HeatmapEntry {
                date: "2026-07-02".to_string(),
                count: 0,
            },
            HeatmapEntry {
                date: "2026-07-03".to_string(),
                count: 0,
            },
        ];
        assert_eq!(compute_max_streak(&entries), 0);
    }

    fn commit(repo_path: &str, hash: &str, date: &str) -> CommitRecord {
        commit_by_author(repo_path, hash, date, "tester", "tester@example.com")
    }

    fn commit_by_author(
        repo_path: &str,
        hash: &str,
        date: &str,
        author: &str,
        email: &str,
    ) -> CommitRecord {
        CommitRecord {
            repo_path: repo_path.to_string(),
            project_name: repo_path.to_string(),
            branch_name: "main".to_string(),
            hash: hash.to_string(),
            author: author.to_string(),
            author_email: email.to_string(),
            date: date.to_string(),
            message: "feat: demo".to_string(),
            additions: 0,
            deletions: 0,
            changed_files: 0,
        }
    }

    fn repo(name: &str, path: &str) -> RepoInfo {
        RepoInfo {
            path: path.to_string(),
            name: name.to_string(),
            branch: "main".to_string(),
        }
    }

    fn batch_smoke_options(root: &Path, repo_dir: &Path, output_dir: &Path) -> BatchReportOptions {
        BatchReportOptions {
            root_dirs: vec![root.to_string_lossy().to_string()],
            indexed_repos: vec![repo("repo-a", &repo_dir.to_string_lossy())],
            author: "Smoke Tester".to_string(),
            author_display_name: "Smoke Tester".to_string(),
            author_aliases: Vec::new(),
            disabled_repos: Vec::new(),
            extract_all_branches: false,
            exclude_merge_commits: true,
            exclude_revert_commits: true,
            exclude_bot_commits: true,
            commit_item_prefix_mode: "mapped-project".to_string(),
            show_evidence_details: false,
            evidence_link_rules: Vec::new(),
            redaction: crate::models::ReportRedactionOptions::default(),
            project_names: Default::default(),
            report_format_templates: crate::models::ReportFormatTemplates::default(),
            range_start: "2026-06-10".to_string(),
            range_end: "2026-06-10".to_string(),
            split_granularity: "daily".to_string(),
            group_mode: "all".to_string(),
            export_formats: vec!["markdown".to_string(), "md".to_string(), "docx".to_string()],
            file_name_template: "{period}-{author}-{type}.{ext}".to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
        }
    }

    fn init_smoke_repo(repo_dir: &Path) {
        run_smoke_git(repo_dir, &["init"], &[]);
        run_smoke_git(repo_dir, &["config", "user.name", "Smoke Tester"], &[]);
        run_smoke_git(
            repo_dir,
            &["config", "user.email", "smoke@example.com"],
            &[],
        );
        run_smoke_git(repo_dir, &["config", "commit.gpgsign", "false"], &[]);
        fs::write(repo_dir.join("work.txt"), "smoke").unwrap();
        run_smoke_git(repo_dir, &["add", "."], &[]);
        run_smoke_git(
            repo_dir,
            &["commit", "-m", "feat: 完成 smoke 验证"],
            &[
                ("GIT_AUTHOR_DATE", "2026-06-10T10:00:00+08:00"),
                ("GIT_COMMITTER_DATE", "2026-06-10T10:00:00+08:00"),
            ],
        );
    }

    fn add_smoke_commit(repo_dir: &Path, author: &str, email: &str) {
        run_smoke_git(repo_dir, &["config", "user.name", author], &[]);
        run_smoke_git(repo_dir, &["config", "user.email", email], &[]);
        fs::write(repo_dir.join("second.txt"), "second").unwrap();
        run_smoke_git(repo_dir, &["add", "."], &[]);
        run_smoke_git(
            repo_dir,
            &["commit", "-m", "feat: 完成第二项验证"],
            &[
                ("GIT_AUTHOR_DATE", "2026-06-10T11:00:00+08:00"),
                ("GIT_COMMITTER_DATE", "2026-06-10T11:00:00+08:00"),
            ],
        );
    }

    fn run_smoke_git(repo_dir: &Path, args: &[&str], envs: &[(&str, &str)]) {
        let mut command = Command::new("git");
        command.args(args).current_dir(repo_dir);
        for (key, value) in envs {
            command.env(key, value);
        }
        let output = command.output().unwrap_or_else(|err| {
            panic!("failed to run git {}: {}", args.join(" "), err);
        });
        assert!(
            output.status.success(),
            "git {} failed: {}{}",
            args.join(" "),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn temp_root(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("gitpulse-{label}-{}-{nanos}", std::process::id()))
    }

    #[test]
    fn test_work_rhythm_hour_parsing() {
        assert_eq!(
            parse_iso_date_time("2026-07-10T14:30:00+08:00"),
            Some(("2026-07-10".to_string(), "14:30:00".to_string()))
        );
        assert_eq!(
            parse_iso_date_time("2026-07-10T09:00:00-05:00"),
            Some(("2026-07-10".to_string(), "09:00:00".to_string()))
        );
        assert_eq!(
            parse_iso_date_time("2026-07-10T23:15:30+00:00"),
            Some(("2026-07-10".to_string(), "23:15:30".to_string()))
        );
        assert_eq!(parse_iso_date_time("invalid"), None);

        assert_eq!(parse_hour("14:30:00"), Some(14));
        assert_eq!(parse_hour("09:00:00"), Some(9));
        assert_eq!(parse_hour("0:00:00"), Some(0));
        assert_eq!(parse_hour("23:59:59"), Some(23));
    }

    #[test]
    fn test_day_of_week_calculation() {
        // 2026-07-10 is a Friday => dow=4
        assert_eq!(day_of_week("2026-07-10"), Some(4));
        // 2026-07-06 is a Monday => dow=0
        assert_eq!(day_of_week("2026-07-06"), Some(0));
        // 2026-07-11 is a Saturday => dow=5
        assert_eq!(day_of_week("2026-07-11"), Some(5));
        // 2026-07-12 is a Sunday => dow=6
        assert_eq!(day_of_week("2026-07-12"), Some(6));
    }

    #[test]
    fn test_overtime_ratio_calculation() {
        // Weekday 22:00 -> overtime (hour >= 21)
        let ts_overtime = "2026-07-10T22:00:00+08:00"; // Friday
        let (date, time) = parse_iso_date_time(ts_overtime).unwrap();
        let hour = parse_hour(&time).unwrap();
        let dow = day_of_week(&date).unwrap();
        assert!(dow < 5); // weekday
        assert!(hour >= 21); // overtime hour

        // Weekday 14:00 -> not overtime
        let ts_normal = "2026-07-10T14:00:00+08:00";
        let (date2, time2) = parse_iso_date_time(ts_normal).unwrap();
        let hour2 = parse_hour(&time2).unwrap();
        let dow2 = day_of_week(&date2).unwrap();
        assert!(dow2 < 5);
        assert!(hour2 >= 6 && hour2 < 21); // normal hours

        // Saturday -> always overtime
        let ts_weekend = "2026-07-11T10:00:00+08:00";
        let (date3, _) = parse_iso_date_time(ts_weekend).unwrap();
        let dow3 = day_of_week(&date3).unwrap();
        assert!(dow3 >= 5); // weekend
    }
}
