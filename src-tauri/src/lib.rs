mod agent;
mod ai;
mod codex_oauth;
pub mod commit_pipeline;
mod config_profile_io;
mod diagnostics;
mod docx;
pub mod git_ops;
pub mod models;
mod network;
mod pdf;
mod project_retrospective;
pub mod report;
mod report_history;
mod secure_store;
mod support_bundle;
mod workspace_health;
mod zip_store;

use crate::models::{
    AgentRequest, AgentResponse, AiConfig, AiModelInfo, BatchReportOptions, BatchReportResult,
    BlankDayFillOptions, BlankDayFillResult, DiagnosticOptions, DiagnosticResult, ExtractOptions,
    ExtractResult, GitIdentity, HeatmapOptions, HeatmapResult, MappingEntry, MonthlyReportOptions,
    MonthlyReportResult, PeriodReportOptions, PeriodReportResult, ProxyCandidate, ProxyConfig,
    ProxyTestResult, RepoScanProgress, RepoScanResult, ReportEnhanceOptions, ReportEnhanceResult,
    SupportBundleExportResult, SupportBundleOptions, SupportBundlePreview, TrendOptions,
    TrendResult, WorkRhythmOptions, WorkRhythmResult, WorkspaceHealthOptions,
    WorkspaceHealthResult,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Default)]
struct RepoScanState {
    cancel_requested: Arc<AtomicBool>,
}

#[tauri::command]
async fn scan_repos(
    app: AppHandle,
    state: State<'_, RepoScanState>,
    root_dirs: Vec<String>,
) -> Result<RepoScanResult, String> {
    let cancel_requested = state.cancel_requested.clone();
    cancel_requested.store(false, Ordering::Relaxed);
    let progress_app = app.clone();

    let result = async_runtime::spawn_blocking(move || {
        git_ops::find_git_repos_with_progress(&root_dirs, &cancel_requested, |progress| {
            let _ = progress_app.emit("repo-scan-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("扫描仓库任务中断：{}", err))?;
    if let Err(message) = &result {
        if message.contains("取消") {
            let _ = app.emit(
                "repo-scan-progress",
                RepoScanProgress {
                    root_dir: String::new(),
                    current_path: String::new(),
                    scanned_dirs: 0,
                    found_repos: 0,
                    done: false,
                    cancelled: true,
                },
            );
        }
    }
    result
}

#[tauri::command]
fn cancel_repo_scan(state: State<'_, RepoScanState>) {
    state.cancel_requested.store(true, Ordering::Relaxed);
}

#[tauri::command]
async fn inspect_workspace_health(
    options: WorkspaceHealthOptions,
) -> Result<WorkspaceHealthResult, String> {
    async_runtime::spawn_blocking(move || workspace_health::inspect(options))
        .await
        .map_err(|err| format!("检查工作区健康状态失败：{err}"))
}

#[tauri::command]
async fn load_report_history(
    app: AppHandle,
    legacy_entries: Option<Vec<report_history::ReportHistoryEntry>>,
    limit: usize,
) -> Result<report_history::ReportHistoryLoadResult, String> {
    let directory = report_history_directory(&app)?;
    async_runtime::spawn_blocking(move || report_history::load(&directory, legacy_entries, limit))
        .await
        .map_err(|error| format!("加载报告历史任务中断：{error}"))?
}

#[tauri::command]
async fn save_report_history(
    app: AppHandle,
    entries: Vec<report_history::ReportHistoryEntry>,
    limit: usize,
) -> Result<Vec<report_history::ReportHistoryEntry>, String> {
    let directory = report_history_directory(&app)?;
    async_runtime::spawn_blocking(move || report_history::save(&directory, entries, limit))
        .await
        .map_err(|error| format!("保存报告历史任务中断：{error}"))?
}

#[tauri::command]
async fn clear_report_history(app: AppHandle) -> Result<(), String> {
    let directory = report_history_directory(&app)?;
    async_runtime::spawn_blocking(move || report_history::clear(&directory))
        .await
        .map_err(|error| format!("清空报告历史任务中断：{error}"))?
}

fn report_history_directory(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("获取应用数据目录失败：{error}"))
}

#[tauri::command]
fn get_git_identity() -> GitIdentity {
    git_ops::git_identity()
}

#[tauri::command]
async fn extract_commits(app: AppHandle, options: ExtractOptions) -> Result<ExtractResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        commit_pipeline::extract_commits_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("提取提交任务中断：{}", err))?
}

#[tauri::command]
async fn generate_monthly_report(
    app: AppHandle,
    options: MonthlyReportOptions,
) -> Result<MonthlyReportResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        commit_pipeline::generate_monthly_report_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("生成月报任务中断：{}", err))?
}

#[tauri::command]
async fn generate_period_report(
    app: AppHandle,
    options: PeriodReportOptions,
) -> Result<PeriodReportResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        commit_pipeline::generate_period_report_sync(options, |progress| {
            let _ = progress_app.emit("commit-extract-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("生成报告任务中断：{}", err))?
}

#[tauri::command]
async fn batch_generate_reports(
    app: AppHandle,
    options: BatchReportOptions,
) -> Result<BatchReportResult, String> {
    let progress_app = app.clone();
    async_runtime::spawn_blocking(move || {
        commit_pipeline::batch_generate_reports_sync(options, |progress| {
            let _ = progress_app.emit("batch-report-progress", progress);
        })
    })
    .await
    .map_err(|err| format!("批量生成任务中断：{}", err))?
}

#[tauri::command]
fn open_output_directory(app: AppHandle, path: String) -> Result<(), String> {
    let directory = report::validate_output_directory(&path)?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|err| format!("打开输出目录失败：{}", err))
}

#[tauri::command]
async fn enhance_report(options: ReportEnhanceOptions) -> Result<ReportEnhanceResult, String> {
    async_runtime::spawn_blocking(move || commit_pipeline::enhance_report_sync(options))
        .await
        .map_err(|err| format!("AI 润色任务中断：{}", err))?
}

#[tauri::command]
async fn run_report_agent(options: AgentRequest) -> Result<AgentResponse, String> {
    async_runtime::spawn_blocking(move || agent::run(options))
        .await
        .map_err(|err| format!("报告助手任务中断：{}", err))?
}

#[tauri::command]
async fn fill_blank_day_report(options: BlankDayFillOptions) -> Result<BlankDayFillResult, String> {
    async_runtime::spawn_blocking(move || commit_pipeline::fill_blank_day_report_sync(options))
        .await
        .map_err(|err| format!("空白日补写任务中断：{}", err))?
}

#[tauri::command]
async fn list_ai_models(config: AiConfig) -> Result<Vec<AiModelInfo>, String> {
    async_runtime::spawn_blocking(move || ai::list_models(&config))
        .await
        .map_err(|err| format!("获取模型列表任务中断：{}", err))?
}

#[tauri::command]
async fn run_diagnostics(options: DiagnosticOptions) -> Result<DiagnosticResult, String> {
    async_runtime::spawn_blocking(move || diagnostics::run(options))
        .await
        .map_err(|err| format!("诊断任务中断：{}", err))
}

#[tauri::command]
async fn preview_support_bundle(
    options: SupportBundleOptions,
) -> Result<SupportBundlePreview, String> {
    async_runtime::spawn_blocking(move || support_bundle::preview(options))
        .await
        .map_err(|error| format!("准备支持包预览任务中断：{error}"))?
}

#[tauri::command]
async fn export_support_bundle(
    path: String,
    options: SupportBundleOptions,
) -> Result<SupportBundleExportResult, String> {
    async_runtime::spawn_blocking(move || {
        support_bundle::export(std::path::Path::new(&path), options)
    })
    .await
    .map_err(|error| format!("导出支持包任务中断：{error}"))?
}

#[tauri::command]
async fn get_secure_ai_api_key() -> Result<Option<String>, String> {
    async_runtime::spawn_blocking(secure_store::get_ai_api_key)
        .await
        .map_err(|err| format!("读取 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn set_secure_ai_api_key(api_key: String) -> Result<(), String> {
    async_runtime::spawn_blocking(move || secure_store::set_ai_api_key(&api_key))
        .await
        .map_err(|err| format!("保存 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn clear_secure_ai_api_key() -> Result<(), String> {
    async_runtime::spawn_blocking(secure_store::clear_ai_api_key)
        .await
        .map_err(|err| format!("清除 API Key 任务中断：{}", err))?
}

#[tauri::command]
async fn get_secure_proxy_password() -> Result<Option<String>, String> {
    async_runtime::spawn_blocking(secure_store::get_proxy_password)
        .await
        .map_err(|err| format!("读取代理密码任务中断：{}", err))?
}

#[tauri::command]
async fn set_secure_proxy_password(password: String) -> Result<(), String> {
    async_runtime::spawn_blocking(move || secure_store::set_proxy_password(&password))
        .await
        .map_err(|err| format!("保存代理密码任务中断：{}", err))?
}

#[tauri::command]
async fn clear_secure_proxy_password() -> Result<(), String> {
    async_runtime::spawn_blocking(secure_store::clear_proxy_password)
        .await
        .map_err(|err| format!("清除代理密码任务中断：{}", err))?
}

#[tauri::command]
async fn scan_proxy_candidates() -> Result<Vec<ProxyCandidate>, String> {
    async_runtime::spawn_blocking(network::scan_proxy_candidates)
        .await
        .map_err(|err| format!("扫描代理候选任务中断：{}", err))
}

#[tauri::command]
async fn test_proxy_connection(config: ProxyConfig) -> Result<ProxyTestResult, String> {
    async_runtime::spawn_blocking(move || network::test_proxy_connection(&config))
        .await
        .map_err(|err| format!("测试代理连接任务中断：{}", err))?
}

#[tauri::command]
async fn codex_oauth_start_device_flow(
    proxy: ProxyConfig,
) -> Result<codex_oauth::DeviceFlowInfo, String> {
    async_runtime::spawn_blocking(move || codex_oauth::start_device_flow(&proxy))
        .await
        .map_err(|err| format!("启动 ChatGPT 登录任务中断：{}", err))?
}

#[tauri::command]
async fn codex_oauth_poll(
    device_code: String,
    user_code: String,
    proxy: ProxyConfig,
) -> Result<codex_oauth::PollResult, String> {
    async_runtime::spawn_blocking(move || codex_oauth::poll_once(&device_code, &user_code, &proxy))
        .await
        .map_err(|err| format!("ChatGPT 登录轮询任务中断：{}", err))?
}

#[tauri::command]
fn codex_oauth_status() -> codex_oauth::AuthStatus {
    codex_oauth::status()
}

#[tauri::command]
fn codex_oauth_logout() -> Result<(), String> {
    codex_oauth::logout()
}

#[tauri::command]
async fn get_heatmap_data(options: HeatmapOptions) -> Result<HeatmapResult, String> {
    async_runtime::spawn_blocking(move || commit_pipeline::collect_heatmap_data(&options))
        .await
        .map_err(|err| format!("热力图数据任务中断：{}", err))?
}

#[tauri::command]
async fn get_work_rhythm(options: WorkRhythmOptions) -> Result<WorkRhythmResult, String> {
    async_runtime::spawn_blocking(move || commit_pipeline::collect_work_rhythm(&options))
        .await
        .map_err(|err| format!("工作节奏数据任务中断：{}", err))?
}

#[tauri::command]
async fn get_trend_data(options: TrendOptions) -> Result<TrendResult, String> {
    async_runtime::spawn_blocking(move || commit_pipeline::collect_trend_data(&options))
        .await
        .map_err(|err| format!("趋势数据任务中断：{}", err))?
}

#[tauri::command]
fn save_text_file(
    output_dir: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    report::save_report_file(&output_dir, &file_name, &content)
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    async_runtime::spawn_blocking(move || config_profile_io::read_text_file(&path))
        .await
        .map_err(|error| format!("读取配置方案任务中断：{error}"))?
}

#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    async_runtime::spawn_blocking(move || config_profile_io::write_text_file(&path, &content))
        .await
        .map_err(|error| format!("保存配置方案任务中断：{error}"))?
}

#[tauri::command]
fn save_report_file(
    output_dir: String,
    base_name: String,
    format: String,
    content: String,
) -> Result<String, String> {
    report::save_report_document(&output_dir, &base_name, &content, &format)
}

#[tauri::command]
fn read_mapping_xlsx(path: String) -> Result<Vec<MappingEntry>, String> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> =
        open_workbook(&path).map_err(|err| format!("无法打开 Excel 文件：{}", err))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Excel 中没有工作表".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| format!("读取工作表失败：{}", err))?;

    let mut entries = Vec::new();
    for row in range.rows().skip(1) {
        let key = row.get(0).map(|cell| cell.to_string()).unwrap_or_default();
        let display_name = row.get(1).map(|cell| cell.to_string()).unwrap_or_default();
        let key = key.trim().to_string();
        let display_name = display_name.trim().to_string();
        if !key.is_empty() && !display_name.is_empty() {
            entries.push(MappingEntry { key, display_name });
        }
    }
    Ok(entries)
}

#[tauri::command]
fn write_mapping_template_xlsx(path: String, keys: Vec<String>) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();
    worksheet
        .set_column_width(0, 36.0)
        .map_err(|err| err.to_string())?;
    worksheet
        .set_column_width(1, 24.0)
        .map_err(|err| err.to_string())?;
    worksheet
        .write_with_format(0, 0, "项目(分支)", &header_format)
        .map_err(|err| err.to_string())?;
    worksheet
        .write_with_format(0, 1, "显示名称", &header_format)
        .map_err(|err| err.to_string())?;
    for (index, key) in keys.iter().enumerate() {
        worksheet
            .write((index + 1) as u32, 0, key.as_str())
            .map_err(|err| err.to_string())?;
    }
    workbook
        .save(&path)
        .map_err(|err| format!("保存 Excel 失败：{}", err))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(RepoScanState::default())
        .invoke_handler(tauri::generate_handler![
            scan_repos,
            cancel_repo_scan,
            inspect_workspace_health,
            load_report_history,
            save_report_history,
            clear_report_history,
            get_git_identity,
            extract_commits,
            generate_monthly_report,
            generate_period_report,
            batch_generate_reports,
            open_output_directory,
            enhance_report,
            run_report_agent,
            fill_blank_day_report,
            list_ai_models,
            run_diagnostics,
            preview_support_bundle,
            export_support_bundle,
            get_heatmap_data,
            get_work_rhythm,
            get_trend_data,
            get_secure_ai_api_key,
            set_secure_ai_api_key,
            clear_secure_ai_api_key,
            get_secure_proxy_password,
            set_secure_proxy_password,
            clear_secure_proxy_password,
            scan_proxy_candidates,
            test_proxy_connection,
            save_text_file,
            read_text_file,
            write_text_file,
            save_report_file,
            read_mapping_xlsx,
            write_mapping_template_xlsx,
            codex_oauth_start_device_flow,
            codex_oauth_poll,
            codex_oauth_status,
            codex_oauth_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
