import type { ActiveTaskState } from "../hooks/useTaskActivity";
import type { ReportAgentController } from "../hooks/useReportAgent";
import type {
  CommitExtractProgress,
  DateRange,
  PreviewMode,
  ReportExportFormat,
  ReportHistoryEntry,
  ReportPolishReview,
  RepoInfo,
  RepoScanProgress,
  WorkspaceHealthResult,
} from "../model";

export type WorkbenchProps = {
  agent: ReportAgentController;
  agentEvidenceCount: number;
  aiModel: string;
  aiDestination: string;
  draftEdited: boolean;
  canUndoDraftEdit: boolean;
  onSaveManualEdit: (text: string) => void;
  onUndoDraftEdit: () => void;
  repos: RepoInfo[];
  previewText: string;
  activePreview: PreviewMode;
  status: string;
  warnings: string[];
  activeTasks: ActiveTaskState;
  polishReview: ReportPolishReview | null;
  scanProgress: RepoScanProgress | null;
  extractProgress: CommitExtractProgress | null;
  lastOutputFile: string;
  summaryText: string;
  reportHistory: ReportHistoryEntry[];
  activeHistoryId: string;
  repoCount: number;
  repoScannedAt: string;
  workspaceHealth: WorkspaceHealthResult | null;
  workspaceHealthLoading: boolean;
  workspaceHealthError: string;
  commitCount: number;
  blankDayDraftActive?: boolean;
  projectCount: number;
  author: string;
  dailyDate: string;
  onDailyDateChange: (date: string) => void;
  weeklyRange: DateRange;
  weeklyWeek: string;
  onWeeklyWeekChange: (week: string) => void;
  monthlyMonth: string;
  onMonthlyMonthChange: (month: string) => void;
  monthlyRange: DateRange;
  customRange: DateRange;
  supplementalItemsText: string;
  onSupplementalItemsChange: (value: string) => void;
  aiConfigured: boolean;
  extractAllBranches: boolean;
  showEvidenceDetails: boolean;
  redactionEnabled: boolean;
  outputEnabled: boolean;
  outputDir: string;
  onExtract: () => void;
  onGenerateWeekly: () => void;
  onGenerateCustom: (range: DateRange) => void;
  onGenerateMonthly: (month: string) => void;
  onPolish: (extraInstruction?: string) => void;
  onAcceptPolishReview: () => void;
  onRejectPolishReview: () => void;
  onCopy: () => void;
  onExport: (format: ReportExportFormat) => void;
  onOpenHistory: (entry: ReportHistoryEntry) => void;
  onCopyHistory: (entry: ReportHistoryEntry) => void;
  onRegenerateHistory: (entry: ReportHistoryEntry) => void;
  onClearHistory: () => void;
  canExport: boolean;
  disabledRepos: string[];
  projectNames: Record<string, string>;
  onToggleRepo: (path: string, enabled: boolean) => void;
  onSetReposEnabled: (paths: string[], enabled: boolean) => void;
  onEditRepo: (repo: RepoInfo) => void;
  onRefreshRepos: () => void;
  onCancelRepoScan: () => void;
  onRefreshWorkspaceHealth: () => void;
  onRemoveRepoFromIndex: (path: string) => void;
  onPreviewChange: (preview: PreviewMode) => void;
  onOpenSettings: () => void;
  rootDirs: string[];
  onAddRootDirs: () => void;
  onOpenBatch: () => void;
  onOpenBlankDayFill: () => void;
  onGenerateDailyFromCalendar: (date: string) => void;
  onOpenBlankDayFillFromCalendar: (date: string) => void;
  onInspectWorkspaceCleanup: () => void;
  onDismissWarnings: () => void;
  workspaceCleanupBlocked: boolean;
};
