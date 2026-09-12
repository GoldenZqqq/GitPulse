use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanProgress {
    pub root_dir: String,
    pub current_path: String,
    pub scanned_dirs: usize,
    pub found_repos: usize,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoScanResult {
    pub repos: Vec<RepoInfo>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealthOptions {
    #[serde(default)]
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    #[serde(default)]
    pub disabled_repos: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceRootStatus {
    Healthy,
    Missing,
    Inaccessible,
    NotDirectory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceRepoStatus {
    Healthy,
    Missing,
    Inaccessible,
    NotGit,
    BranchUnknown,
    BranchChanged,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootHealth {
    pub path: String,
    pub status: WorkspaceRootStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepoHealth {
    pub path: String,
    pub name: String,
    pub cached_branch: String,
    pub current_branch: String,
    pub status: WorkspaceRepoStatus,
    pub detail: String,
    pub disabled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealthResult {
    pub roots: Vec<WorkspaceRootHealth>,
    pub repos: Vec<WorkspaceRepoHealth>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitExtractProgress {
    pub total_repos: usize,
    pub completed_repos: usize,
    pub current_repo: String,
    pub commit_count: usize,
    pub warning_count: usize,
    pub concurrency: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingEntry {
    pub key: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub user_name: String,
    pub user_email: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRecord {
    pub repo_path: String,
    pub project_name: String,
    pub branch_name: String,
    pub hash: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorAliasGroup {
    pub display_name: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceLinkRule {
    pub prefix: String,
    pub url_template: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRedactionRule {
    pub find: String,
    pub replacement: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRedactionOptions {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub rules: Vec<ReportRedactionRule>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    #[serde(default)]
    pub supplemental_items: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub period_label: String,
    #[serde(default = "default_extract_report_kind")]
    pub report_kind: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    pub detailed_output: bool,
    pub show_project_and_branch: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    #[serde(default)]
    pub redaction: ReportRedactionOptions,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub repos: Vec<RepoInfo>,
    pub commits: Vec<CommitRecord>,
    pub projects: Vec<crate::project_retrospective::ReportHistoryProject>,
    pub summary_text: String,
    pub detailed_text: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub enabled: bool,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub temperature: f32,
    pub timeout_seconds: u64,
    #[serde(default)]
    pub proxy: ProxyConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvidence {
    pub project_name: String,
    pub branch_name: String,
    pub date: String,
    pub hash: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHistoryItem {
    pub title: String,
    pub period_label: String,
    pub report_text: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    pub report_text: String,
    #[serde(default)]
    pub evidence: Vec<AgentEvidence>,
    #[serde(default)]
    pub history: Vec<AgentHistoryItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequest {
    pub message: String,
    #[serde(default)]
    pub conversation: Vec<AgentMessage>,
    pub context: AgentContext,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentActionKind {
    Answer,
    ToolCall,
    ReportPatch,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelOutput {
    pub kind: AgentActionKind,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub tool: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub patch: Option<AgentPatch>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPatch {
    pub mode: String,
    pub content: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponse {
    pub answer: String,
    pub patch: Option<AgentPatch>,
    pub tool_trace: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelInfo {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(default = "default_proxy_mode")]
    pub mode: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub password_saved: bool,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            mode: default_proxy_mode(),
            url: String::new(),
            username: String::new(),
            password: String::new(),
            password_saved: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyCandidate {
    pub url: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyTestResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEnhanceOptions {
    pub base_report: String,
    pub start_date: String,
    pub end_date: String,
    pub report_kind: String,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportEnhanceResult {
    pub report_text: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlankDayFillOptions {
    pub base_evidence: String,
    pub target_date: String,
    pub source_start_date: String,
    pub source_end_date: String,
    pub item_count: u32,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub user_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlankDayFillResult {
    pub draft_text: String,
    pub warnings: Vec<String>,
    pub item_count: u32,
    pub source_commit_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticOptions {
    pub root_dirs: Vec<String>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    pub ai_enabled: bool,
    pub ai_provider: String,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key: String,
    #[serde(default)]
    pub proxy: ProxyConfig,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticItem {
    pub id: String,
    pub label: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub action: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    pub items: Vec<DiagnosticItem>,
    pub ok_count: usize,
    pub warning_count: usize,
    pub error_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleEventInput {
    pub occurred_at: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundlePrivacyContext {
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub output_dir: String,
    #[serde(default)]
    pub ai_base_url: String,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default)]
    pub proxy_username: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleOptions {
    pub diagnostics: Option<DiagnosticResult>,
    #[serde(default)]
    pub diagnostic_error: String,
    pub workspace: WorkspaceHealthOptions,
    #[serde(default)]
    pub recent_events: Vec<SupportBundleEventInput>,
    #[serde(default)]
    pub privacy: SupportBundlePrivacyContext,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleEntryPreview {
    pub name: String,
    pub description: String,
    pub content: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundlePreview {
    pub schema_version: u32,
    pub generated_at: String,
    pub suggested_file_name: String,
    pub entries: Vec<SupportBundleEntryPreview>,
    pub excluded_data: Vec<String>,
    pub issue_title: String,
    pub issue_body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleExportResult {
    pub output_file: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportFormatTemplates {
    #[serde(default = "default_daily_report_template")]
    pub daily: String,
    #[serde(default = "default_weekly_report_template")]
    pub weekly: String,
    #[serde(default = "default_monthly_report_template")]
    pub monthly: String,
    #[serde(default = "default_custom_report_template")]
    pub custom: String,
}

impl Default for ReportFormatTemplates {
    fn default() -> Self {
        Self {
            daily: default_daily_report_template(),
            weekly: default_weekly_report_template(),
            monthly: default_monthly_report_template(),
            custom: default_custom_report_template(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReportOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    #[serde(default)]
    pub supplemental_items: Vec<String>,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    #[serde(default)]
    pub redaction: ReportRedactionOptions,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReportResult {
    pub report_text: String,
    pub output_file: String,
    pub warnings: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    pub month_label: String,
    pub project_count: usize,
    pub commit_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodReportOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub output_dir: String,
    pub output_enabled: bool,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    #[serde(default)]
    pub supplemental_items: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    pub period_label: String,
    pub report_kind: String,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    #[serde(default)]
    pub redaction: ReportRedactionOptions,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,
    pub refinement_instruction: String,
    pub system_prompt: String,
    pub ai: AiConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodReportResult {
    pub report_text: String,
    pub output_file: String,
    pub warnings: Vec<String>,
    pub start_date: String,
    pub end_date: String,
    pub period_label: String,
    pub report_kind: String,
    pub project_count: usize,
    pub commit_count: usize,
    pub projects: Vec<crate::project_retrospective::ReportHistoryProject>,
    pub commits: Vec<CommitRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportOptions {
    pub root_dirs: Vec<String>,
    #[serde(default)]
    pub indexed_repos: Vec<RepoInfo>,
    pub author: String,
    #[serde(default)]
    pub author_display_name: String,
    #[serde(default)]
    pub author_aliases: Vec<AuthorAliasGroup>,
    pub disabled_repos: Vec<String>,
    pub extract_all_branches: bool,
    pub exclude_merge_commits: bool,
    pub exclude_revert_commits: bool,
    pub exclude_bot_commits: bool,
    #[serde(default = "default_commit_item_prefix_mode")]
    pub commit_item_prefix_mode: String,
    pub show_evidence_details: bool,
    #[serde(default)]
    pub evidence_link_rules: Vec<EvidenceLinkRule>,
    #[serde(default)]
    pub redaction: ReportRedactionOptions,
    pub project_names: HashMap<String, String>,
    #[serde(default)]
    pub report_format_templates: ReportFormatTemplates,

    pub range_start: String,
    pub range_end: String,
    pub split_granularity: String,
    #[serde(default = "default_batch_group_mode")]
    pub group_mode: String,
    #[serde(default)]
    pub export_formats: Vec<String>,
    #[serde(default = "default_batch_file_name_template")]
    pub file_name_template: String,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportProgress {
    pub total: usize,
    pub completed: usize,
    pub current_label: String,
    pub succeeded: usize,
    pub failed: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReportResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub failures: Vec<BatchFailure>,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFailure {
    pub label: String,
    pub error: String,
}

#[derive(Debug, Clone)]
pub struct SubPeriod {
    pub start: String,
    pub end: String,
    pub label: String,
    pub report_kind: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapOptions {
    pub workspace_roots: Vec<String>,
    pub author: String,
    pub weeks: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapEntry {
    pub date: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapResult {
    pub entries: Vec<HeatmapEntry>,
    pub total_commits: u32,
    pub active_days: u32,
    pub max_streak: u32,
    pub busiest_day: String,
    pub busiest_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkRhythmOptions {
    pub workspace_roots: Vec<String>,
    pub author: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkRhythmResult {
    pub hourly_distribution: Vec<u32>,
    pub weekday_distribution: Vec<u32>,
    pub this_week_commits: u32,
    pub last_week_commits: u32,
    pub overtime_ratio: f64,
    pub busiest_hour: u32,
    pub weekend_ratio: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendOptions {
    pub workspace_roots: Vec<String>,
    pub author: String,
    pub granularity: String,
    pub periods: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendPeriod {
    pub label: String,
    pub commits: u32,
    pub additions: u64,
    pub deletions: u64,
    pub active_projects: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendProjectShare {
    pub project: String,
    pub commits: u32,
    pub additions: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendResult {
    pub periods: Vec<TrendPeriod>,
    pub project_shares: Vec<TrendProjectShare>,
    pub this_week_commits: u32,
    pub last_week_commits: u32,
    pub this_month_commits: u32,
    pub last_month_commits: u32,
}

fn default_extract_report_kind() -> String {
    "daily".to_string()
}

fn default_commit_item_prefix_mode() -> String {
    "mapped-project".to_string()
}

fn default_batch_file_name_template() -> String {
    "{period}-{type}.{ext}".to_string()
}

fn default_batch_group_mode() -> String {
    "all".to_string()
}

fn default_proxy_mode() -> String {
    "off".to_string()
}

fn default_daily_report_template() -> String {
    "{commitItems}".to_string()
}

fn default_weekly_report_template() -> String {
    [
        "# {periodLabel}工作周报",
        "",
        "- 统计周期：{startDate} 至 {endDate}",
        "- 作者：{author}",
        "- 项目数量：{projectCount}",
        "- 提交事项：{commitCount}",
        "",
        "## 一、本周重点",
        "",
        "{summary}",
        "",
        "## 二、实际完成情况",
        "",
        "{projectSections}",
        "",
        "## 三、下周关注",
        "",
        "{nextSteps}",
        "",
        "{notes}",
    ]
    .join("\n")
}

fn default_monthly_report_template() -> String {
    [
        "# {periodLabel}工作月报",
        "",
        "- 统计周期：{startDate} 至 {endDate}",
        "- 作者：{author}",
        "- 项目数量：{projectCount}",
        "- 提交事项：{commitCount}",
        "- 代码变更：+{additions} -{deletions}（净增 {netLines} 行）",
        "",
        "## 一、项目进度",
        "",
        "{summary}",
        "",
        "## 二、实际完成情况",
        "",
        "{projectSections}",
        "",
        "## 三、当月总结",
        "",
        "{conclusion}",
        "",
        "{notes}",
    ]
    .join("\n")
}

fn default_custom_report_template() -> String {
    [
        "# {periodLabel}工作报告",
        "",
        "- 统计周期：{startDate} 至 {endDate}",
        "- 作者：{author}",
        "- 项目数量：{projectCount}",
        "- 提交事项：{commitCount}",
        "",
        "{projectSections}",
        "",
        "{evidence}",
    ]
    .join("\n")
}
