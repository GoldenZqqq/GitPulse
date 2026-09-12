pub fn build_monthly_result(
    report_text: String,
    output_file: String,
    warnings: Vec<String>,
    dates: (String, String, String),
    project_count: usize,
    commit_count: usize,
) -> MonthlyReportResult {
    MonthlyReportResult {
        report_text,
        output_file,
        warnings,
        start_date: dates.0,
        end_date: dates.1,
        month_label: dates.2,
        project_count,
        commit_count,
    }
}

pub fn build_period_result(
    report_text: String,
    output_file: String,
    warnings: Vec<String>,
    dates: (String, String, String),
    report_kind: String,
    projects: Vec<ReportHistoryProject>,
    commits: Vec<CommitRecord>,
) -> PeriodReportResult {
    let project_count = projects.len();
    let commit_count = commits.len();
    PeriodReportResult {
        report_text,
        output_file,
        warnings,
        start_date: dates.0,
        end_date: dates.1,
        period_label: dates.2,
        report_kind,
        project_count,
        commit_count,
        projects,
        commits,
    }
}

fn render_detailed_text(commits: &[CommitRecord]) -> String {
    commits
        .iter()
        .map(|commit| {
            format!(
                "Repository: {}\nHash: {}\nAuthor: {}\nDate: {}\nMessage: {}\n",
                commit.repo_path, commit.hash, commit.author, commit.date, commit.message
            )
        })
        .collect::<Vec<_>>()
        .join("\n========================================\n")
}

fn render_detailed_report(summary_text: &str, commits: &[CommitRecord]) -> String {
    let details = render_detailed_text(commits);
    if details.trim().is_empty() {
        summary_text.to_string()
    } else {
        format!("{}\n\n## 详细日志\n\n{}", summary_text.trim(), details)
    }
}

/// 映射名末尾可能带各种连接符（也可能不带）。统一在此规整：由系统补连接符，
/// 用户无需手动维护，同时兼容历史上已手动加了 "-" 的映射。
const TRAILING_CONNECTORS: [char; 8] = ['-', '_', '：', ':', '；', ';', '、', ' '];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CommitItemPrefixMode {
    MappedProject,
    RepoBranchAndMapped,
    RepoBranch,
    None,
}

impl CommitItemPrefixMode {
    fn from_settings(value: &str, legacy_show_project_and_branch: bool) -> Self {
        match value.trim() {
            "mapped-project" => Self::MappedProject,
            "repo-branch-and-mapped" => Self::RepoBranchAndMapped,
            "repo-branch" => Self::RepoBranch,
            "none" => Self::None,
            "" if legacy_show_project_and_branch => Self::RepoBranchAndMapped,
            "" => Self::MappedProject,
            _ => Self::MappedProject,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProjectCommitItem {
    title: String,
    evidence: String,
    additions: u64,
    deletions: u64,
    changed_files: u32,
}

type ProjectGroups = BTreeMap<String, Vec<ProjectCommitItem>>;
type AuthorProjectGroups = BTreeMap<String, ProjectGroups>;

struct ReportTemplateValues {
    period_label: String,
    start_date: String,
    end_date: String,
    author: String,
    project_count: String,
    commit_count: String,
    project_sections: String,
    commit_items: String,
    summary: String,
    conclusion: String,
    next_steps: String,
    evidence: String,
    notes: String,
    additions: String,
    deletions: String,
    net_lines: String,
    changed_files: String,
}

struct PreparedReportInput<'a> {
    commits: Cow<'a, [CommitRecord]>,
    project_names: Cow<'a, HashMap<String, String>>,
    evidence_link_rules: Cow<'a, [EvidenceLinkRule]>,
    author: Cow<'a, str>,
}

fn build_template_values(
    kind: &str,
    commits: &[CommitRecord],
    project_names: &HashMap<String, String>,
    start_date: &str,
    end_date: &str,
    author: &str,
    period_label: &str,
    show_project_and_branch: bool,
    commit_item_prefix_mode: &str,
    show_evidence_details: bool,
    evidence_link_rules: &[EvidenceLinkRule],
) -> ReportTemplateValues {
    let groups = group_commits_by_project(commits, project_names, evidence_link_rules);
    let author_groups =
        group_commits_by_author_project(commits, project_names, evidence_link_rules);
    let group_by_author = should_group_by_author(author, &author_groups);
    let total_additions: u64 = commits.iter().map(|c| c.additions).sum();
    let total_deletions: u64 = commits.iter().map(|c| c.deletions).sum();
    let net_lines = total_additions as i64 - total_deletions as i64;
    let total_changed_files: u32 = commits.iter().map(|c| c.changed_files).sum();
    ReportTemplateValues {
        period_label: period_label.to_string(),
        start_date: start_date.to_string(),
        end_date: end_date.to_string(),
        author: display_author(author),
        project_count: groups.len().to_string(),
        commit_count: commits.len().to_string(),
        project_sections: if group_by_author {
            lines_to_block(render_author_scoped_content(&author_groups, |groups| {
                render_actual_completion_content(groups, show_evidence_details)
            }))
        } else {
            lines_to_block(render_actual_completion_content(
                &groups,
                show_evidence_details,
            ))
        },
        commit_items: if group_by_author {
            render_author_commit_items(&author_groups, show_evidence_details)
        } else if should_render_structured_commit_items(
            commit_item_prefix_mode,
            show_project_and_branch,
            show_evidence_details,
        ) {
            render_summary_text(
                commits,
                project_names,
                show_project_and_branch,
                commit_item_prefix_mode,
                show_evidence_details,
                evidence_link_rules,
            )
        } else {
            render_flat_commit_items(commits)
        },
        summary: if group_by_author {
            lines_to_block(render_author_scoped_content(&author_groups, |groups| {
                render_summary_content(kind, groups)
            }))
        } else {
            lines_to_block(render_summary_content(kind, &groups))
        },
        conclusion: if group_by_author {
            lines_to_block(render_author_scoped_content(&author_groups, |groups| {
                render_conclusion_content(kind, groups)
            }))
        } else {
            lines_to_block(render_conclusion_content(kind, &groups))
        },
        next_steps: if group_by_author {
            lines_to_block(render_author_scoped_content(&author_groups, |groups| {
                render_next_steps_content(kind, groups)
            }))
        } else {
            lines_to_block(render_next_steps_content(kind, &groups))
        },
        evidence: if group_by_author {
            render_author_evidence_items(&author_groups)
        } else {
            render_evidence_items(commits, evidence_link_rules)
        },
        notes: report_note(kind).to_string(),
        additions: total_additions.to_string(),
        deletions: total_deletions.to_string(),
        net_lines: net_lines.to_string(),
        changed_files: total_changed_files.to_string(),
    }
}

fn render_report_template(
    template: &str,
    fallback_template: &str,
    values: &ReportTemplateValues,
) -> String {
    let source = if template.trim().is_empty() {
        fallback_template
    } else {
        template
    };
    let replacements = [
        ("{periodLabel}", values.period_label.as_str()),
        ("{startDate}", values.start_date.as_str()),
        ("{endDate}", values.end_date.as_str()),
        ("{author}", values.author.as_str()),
        ("{projectCount}", values.project_count.as_str()),
        ("{commitCount}", values.commit_count.as_str()),
        ("{projectSections}", values.project_sections.as_str()),
        ("{commitItems}", values.commit_items.as_str()),
        ("{summary}", values.summary.as_str()),
        ("{conclusion}", values.conclusion.as_str()),
        ("{nextSteps}", values.next_steps.as_str()),
        ("{evidence}", values.evidence.as_str()),
        ("{notes}", values.notes.as_str()),
        ("{additions}", values.additions.as_str()),
        ("{deletions}", values.deletions.as_str()),
        ("{netLines}", values.net_lines.as_str()),
        ("{changedFiles}", values.changed_files.as_str()),
    ];
    let mut output = source.to_string();
    for (token, value) in replacements {
        output = output.replace(token, value);
    }
    output.trim().to_string()
}

fn render_report_template_with_redaction(
    template: &str,
    fallback_template: &str,
    values: &ReportTemplateValues,
    redaction: &ReportRedactionOptions,
) -> String {
    let output = render_report_template(template, fallback_template, values);
    if redaction.enabled {
        apply_redaction_rules_to_text(&output, &redaction.rules)
    } else {
        output
    }
}

fn prepare_report_input<'a>(
    commits: &'a [CommitRecord],
    project_names: &'a HashMap<String, String>,
    evidence_link_rules: &'a [EvidenceLinkRule],
    author: &'a str,
    redaction: &ReportRedactionOptions,
) -> PreparedReportInput<'a> {
    if !redaction.enabled {
        return PreparedReportInput {
            commits: Cow::Borrowed(commits),
            project_names: Cow::Borrowed(project_names),
            evidence_link_rules: Cow::Borrowed(evidence_link_rules),
            author: Cow::Borrowed(author),
        };
    }

    let mut redactor = ReportRedactor::new(&redaction.rules);
    let redacted_commits = commits
        .iter()
        .map(|commit| redactor.redact_commit(commit))
        .collect::<Vec<_>>();

    PreparedReportInput {
        commits: Cow::Owned(redacted_commits),
        project_names: Cow::Owned(HashMap::new()),
        evidence_link_rules: Cow::Owned(Vec::new()),
        author: Cow::Owned(redact_author_scope(author)),
    }
}

struct ReportRedactor<'a> {
    rules: &'a [ReportRedactionRule],
    repo_aliases: HashMap<String, String>,
    branch_aliases: HashMap<String, String>,
    author_aliases: HashMap<String, String>,
    hash_aliases: HashMap<String, String>,
}

impl<'a> ReportRedactor<'a> {
    fn new(rules: &'a [ReportRedactionRule]) -> Self {
        Self {
            rules,
            repo_aliases: HashMap::new(),
            branch_aliases: HashMap::new(),
            author_aliases: HashMap::new(),
            hash_aliases: HashMap::new(),
        }
    }

    fn redact_commit(&mut self, commit: &CommitRecord) -> CommitRecord {
        let mut redacted = commit.clone();
        redacted.project_name = alias_for(&mut self.repo_aliases, &commit.project_name, "仓库");
        redacted.repo_path = redacted.project_name.clone();
        redacted.branch_name = alias_for(&mut self.branch_aliases, &commit.branch_name, "分支");
        let author_key = commit_author_key(commit);
        redacted.author = alias_for(&mut self.author_aliases, &author_key, "作者");
        redacted.author_email = String::new();
        redacted.hash = alias_for(&mut self.hash_aliases, &commit.hash, "commit-");
        redacted.message = apply_redaction_rules_to_text(&commit.message, self.rules);
        redacted
    }
}

fn alias_for(aliases: &mut HashMap<String, String>, value: &str, prefix: &str) -> String {
    let key = value.trim();
    if key.is_empty() {
        return format!("{}未知", prefix.trim_end_matches('-'));
    }
    if let Some(alias) = aliases.get(key) {
        return alias.clone();
    }
    let alias = format!("{}{}", prefix, aliases.len() + 1);
    aliases.insert(key.to_string(), alias.clone());
    alias
}

fn commit_author_key(commit: &CommitRecord) -> String {
    [commit.author.trim(), commit.author_email.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_author_scope(author: &str) -> String {
    if author.trim().is_empty() {
        String::new()
    } else {
        "作者范围已脱敏".to_string()
    }
}

fn apply_redaction_rules_to_text(text: &str, rules: &[ReportRedactionRule]) -> String {
    rules.iter().fold(text.to_string(), |current, rule| {
        let find = rule.find.trim();
        if find.is_empty() {
            return current;
        }
        let replacement = if rule.replacement.trim().is_empty() {
            "***"
        } else {
            rule.replacement.trim()
        };
        current.replace(find, replacement)
    })
}

fn render_summary_content(
    kind: &str,
    groups: &BTreeMap<String, Vec<ProjectCommitItem>>,
) -> Vec<String> {
    match kind {
        "monthly" => render_project_progress_content(groups),
        "weekly" => render_weekly_focus_content(groups),
        _ => render_generic_summary_content(kind, groups),
    }
}

fn render_conclusion_content(
    kind: &str,
    groups: &BTreeMap<String, Vec<ProjectCommitItem>>,
) -> Vec<String> {
    if kind == "monthly" {
        return render_monthly_summary_content(groups);
    }
    if groups.is_empty() {
        return vec!["- 暂无可用于总结的提交记录。".to_string()];
    }
    vec![
        "- 整体来看，本周期工作以交付可验证事项为主，后续可结合测试、上线和业务反馈补充结果指标。"
            .to_string(),
    ]
}

fn render_next_steps_content(
    kind: &str,
    groups: &BTreeMap<String, Vec<ProjectCommitItem>>,
) -> Vec<String> {
    if kind == "weekly" {
        return render_weekly_next_steps_content(groups);
    }
    if groups.is_empty() {
        return vec!["- 暂无基于提交记录推断的后续关注事项。".to_string()];
    }
    groups
        .iter()
        .map(|(project, items)| {
            format!(
                "- {}：建议继续围绕 {} 补充验证、发布或复盘记录。",
                project,
                join_focus_items(items)
            )
        })
        .collect()
}

fn render_generic_summary_content(
    kind: &str,
    groups: &BTreeMap<String, Vec<ProjectCommitItem>>,
) -> Vec<String> {
    if groups.is_empty() {
        let label = if kind == "daily" {
            "今日"
        } else {
            "当前周期"
        };
        return vec![format!("- {}未检索到可用于生成报告的提交记录。", label)];
    }
    let total = groups
        .values()
        .map(|items| unique_items(items).len())
        .sum::<usize>();
    vec![format!(
        "- 本周期共推进 {} 项可追踪事项，主要集中在：{}。",
        total,
        groups
            .values()
            .flat_map(|items| unique_items(items))
            .take(3)
            .map(|item| item.title)
            .collect::<Vec<_>>()
            .join("；")
    )]
}

fn render_flat_commit_items(commits: &[CommitRecord]) -> String {
    if commits.is_empty() {
        return "- 未检索到提交记录。".to_string();
    }
    commits
        .iter()
        .map(|commit| format!("- {}", clean_commit_message(&commit.message)))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_evidence_items(
    commits: &[CommitRecord],
    evidence_link_rules: &[EvidenceLinkRule],
) -> String {
    if commits.is_empty() {
        return "- 暂无提交证据。".to_string();
    }
    commits
        .iter()
        .map(|commit| {
            format!(
                "- {}\n{}",
                clean_commit_message(&commit.message),
                format_evidence_block(commit, evidence_link_rules)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn lines_to_block(lines: Vec<String>) -> String {
    lines.join("\n").trim().to_string()
}

fn display_author(author: &str) -> String {
    if author.trim().is_empty() {
        "全部作者".to_string()
    } else {
        author.to_string()
    }
}

fn resolve_period_label(kind: &str, label: &str, start_date: &str, end_date: &str) -> String {
    let trimmed = label.trim();
    match kind {
        "weekly" => format_week_title(if trimmed.is_empty() {
            start_date
        } else {
            trimmed
        }),
        "monthly" => format_month_title(if trimmed.is_empty() {
            start_date
        } else {
            trimmed
        }),
        "custom" => {
            if trimmed.is_empty() {
                format!("{} 至 {}", start_date, end_date)
            } else {
                trimmed.to_string()
            }
        }
        _ => {
            if trimmed.is_empty() {
                start_date.to_string()
            } else {
                trimmed.to_string()
            }
        }
    }
}

fn report_template_for<'a>(templates: &'a ReportFormatTemplates, kind: &str) -> &'a str {
    match kind {
        "weekly" => &templates.weekly,
        "monthly" => &templates.monthly,
        "custom" => &templates.custom,
        _ => &templates.daily,
    }
}

fn default_template_for(kind: &str) -> &'static str {
    match kind {
        "weekly" => DEFAULT_WEEKLY_REPORT_TEMPLATE,
        "monthly" => DEFAULT_MONTHLY_REPORT_TEMPLATE,
        "custom" => DEFAULT_CUSTOM_REPORT_TEMPLATE,
        _ => DEFAULT_DAILY_REPORT_TEMPLATE,
    }
}
