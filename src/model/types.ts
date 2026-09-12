import type { ReportFormatKind, ReportPurposePreset, ReportTemplateProfile } from "../reportFormat";

export type RepoInfo = { path: string; name: string; branch: string };

export type CommitRecord = {
  repoPath: string;
  projectName: string;
  branchName: string;
  hash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
};

export type RepoScanProgress = {
  rootDir: string;
  currentPath: string;
  scannedDirs: number;
  foundRepos: number;
  done: boolean;
  cancelled: boolean;
};

export type RepoScanResult = { repos: RepoInfo[]; warnings: string[] };

export type WorkspaceRootStatus = "healthy" | "missing" | "inaccessible" | "not_directory";
export type WorkspaceRepoStatus = "healthy" | "missing" | "inaccessible" | "not_git" | "branch_unknown" | "branch_changed";
export type WorkspaceRootHealth = { path: string; status: WorkspaceRootStatus; detail: string };
export type WorkspaceRepoHealth = {
  path: string;
  name: string;
  cachedBranch: string;
  currentBranch: string;
  status: WorkspaceRepoStatus;
  detail: string;
  disabled: boolean;
};
export type WorkspaceHealthResult = { roots: WorkspaceRootHealth[]; repos: WorkspaceRepoHealth[] };

export type CommitExtractProgress = {
  totalRepos: number;
  completedRepos: number;
  currentRepo: string;
  commitCount: number;
  warningCount: number;
  concurrency: number;
  done: boolean;
};

export type ReportHistoryProject = { name: string; commitCount: number; evidenceIds: string[] };
export type ExtractResult = {
  repos: RepoInfo[];
  summaryText: string;
  detailedText: string;
  warnings: string[];
  commits: CommitRecord[];
  projects: ReportHistoryProject[];
};
export type MonthlyReportResult = {
  reportText: string;
  outputFile: string;
  warnings: string[];
  monthLabel: string;
  commitCount: number;
};
export type PeriodReportKind = "weekly" | "monthly";
export type ExtractReportKind = Extract<ReportFormatKind, "daily" | "custom">;
export type PeriodReportResult = {
  reportText: string;
  outputFile: string;
  warnings: string[];
  startDate: string;
  endDate: string;
  periodLabel: string;
  reportKind: PeriodReportKind;
  projectCount: number;
  commitCount: number;
  projects: ReportHistoryProject[];
  commits?: CommitRecord[];
};
export type ReportEnhanceResult = { reportText: string; warnings: string[] };
export type BlankDayFillResult = { draftText: string; warnings: string[]; itemCount: number; sourceCommitCount: number };
export type BlankDayItemCount = 3 | 5 | 8;
export type PreviewMode = "summary" | "weekly" | "custom" | "monthly";
export type ReportHistoryLimit = 30 | 60 | 120 | 200;
export type ReportExportFormat = "markdown" | "docx" | "pdf";
export type SplitGranularity = "daily" | "weekly" | "monthly" | "custom";
export type BatchGroupMode = "all" | "author" | "project";
export type BatchReportProgress = {
  total: number;
  completed: number;
  currentLabel: string;
  succeeded: number;
  failed: number;
  done: boolean;
};
export type BatchReportResult = { total: number; succeeded: number; failed: number; failures: BatchFailure[]; outputDir: string };
export type BatchFailure = { label: string; error: string };
export type DateRange = { startDate: string; endDate: string };
export type ReportFormatTemplates = { daily: string; weekly: string; monthly: string; custom: string };
export type ReportHistoryEntry = {
  id: string;
  mode: PreviewMode;
  title: string;
  range: DateRange;
  periodLabel: string;
  generatedAt: string;
  repoCount: number;
  projectCount?: number;
  commitCount: number;
  aiEnhanced: boolean;
  outputFile: string;
  reportText: string;
  supplementalItems?: string[];
  projects?: ReportHistoryProject[];
};
export type LegacyReportHistoryState = { entries: ReportHistoryEntry[]; present: boolean; valid: boolean; warning: string };
export type ReportPolishReview = {
  mode: PreviewMode;
  range: DateRange;
  periodLabel: string;
  originalText: string;
  polishedText: string;
  warnings: string[];
  repoCount: number;
  commitCount: number;
  projectCount: number;
  supplementalItems: string[];
  projects?: ReportHistoryProject[];
};
export type UpdateSummary = { currentVersion: string; version: string; notes: string; date?: string };
export type GitIdentity = { userName: string; userEmail: string };
export type AuthorAliasGroup = { displayName: string; aliases: string[] };
export type EvidenceLinkRule = { prefix: string; urlTemplate: string };
export type ReportRedactionRule = { find: string; replacement: string };
export type ReportRedactionOptions = { enabled: boolean; rules: ReportRedactionRule[] };
export type AiModelInfo = { id: string };
export type ProxyMode = "off" | "custom";
export type ProxyConfig = { mode: ProxyMode; url: string; username: string; password: string; passwordSaved: boolean };
export type ProxyCandidate = { url: string; label: string };
export type ProxyTestResult = { ok: boolean; message: string; latencyMs: number };
export type DiagnosticSeverity = "ok" | "warning" | "error";
export type DiagnosticItem = { id: string; label: string; severity: DiagnosticSeverity; message: string; action: string };
export type DiagnosticResult = { items: DiagnosticItem[]; okCount: number; warningCount: number; errorCount: number };
export type SupportBundleEventLevel = "info" | "success" | "warning" | "error";
export type SupportBundleEventInput = { occurredAt: string; level: SupportBundleEventLevel; message: string };
export type SupportBundlePrivacyContext = { author: string; outputDir: string; aiBaseUrl: string; proxyUrl: string; proxyUsername: string };
export type SupportBundleOptions = {
  diagnostics: DiagnosticResult | null;
  diagnosticError: string;
  workspace: { rootDirs: string[]; indexedRepos: RepoInfo[]; disabledRepos: string[] };
  recentEvents: SupportBundleEventInput[];
  privacy: SupportBundlePrivacyContext;
};
export type SupportBundleEntryPreview = { name: string; description: string; content: string; bytes: number };
export type SupportBundlePreview = {
  schemaVersion: number;
  generatedAt: string;
  suggestedFileName: string;
  entries: SupportBundleEntryPreview[];
  excludedData: string[];
  issueTitle: string;
  issueBody: string;
};
export type SupportBundleExportResult = { outputFile: string; bytes: number };
export type ThemeMode = "system" | "light" | "dark";
export type CommitItemPrefixMode = "mapped-project" | "repo-branch-and-mapped" | "repo-branch" | "none";

export type AppSettings = {
  onboardingDone: boolean;
  rootDirs: string[];
  outputDir: string;
  outputEnabled: boolean;
  themeMode: ThemeMode;
  author: string;
  authorAliasesText: string;
  evidenceLinkPrefixesText: string;
  disabledRepos: string[];
  extractAllBranches: boolean;
  excludeMergeCommits: boolean;
  excludeRevertCommits: boolean;
  excludeBotCommits: boolean;
  detailedOutput: boolean;
  showProjectAndBranch: boolean;
  commitItemPrefixMode: CommitItemPrefixMode;
  showEvidenceDetails: boolean;
  redactionEnabled: boolean;
  redactionRulesText: string;
  projectNamesText: string;
  aiEnabled: boolean;
  aiProvider: "openai-compatible" | "anthropic-native" | "codex-oauth";
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  aiApiKeySaved: boolean;
  refinementInstruction: string;
  reportPurposePreset: ReportPurposePreset;
  reportTemplateProfile: ReportTemplateProfile;
  dailyReportFormatTemplate: string;
  weeklyReportFormatTemplate: string;
  monthlyReportFormatTemplate: string;
  customReportFormatTemplate: string;
  dailySystemPrompt: string;
  monthlySystemPrompt: string;
  aiTemperature: number;
  proxyMode: ProxyMode;
  proxyUrl: string;
  proxyUsername: string;
  proxyPassword: string;
  proxyPasswordSaved: boolean;
  reportHistoryLimit: ReportHistoryLimit;
};

export type LoadedSettingsState = {
  settings: AppSettings;
  recoveredLegacyApiKey: boolean;
  recoveredCorruptedSettings: boolean;
  settingsMigrationPending: boolean;
};
export type RepoIndexCache = { rootDirs: string[]; repos: RepoInfo[]; scannedAt: string };
export type MappingEntry = { key: string; displayName: string };
export type MappingSuggestion = { key: string; displayName: string; repoName: string; branch: string; reason: string };
export type MappingScope = "all" | "branch";
