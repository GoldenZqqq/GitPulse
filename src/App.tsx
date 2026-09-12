import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppMessageHost, type AppMessage, type AppMessageTone } from "./components/AppMessageHost";
import { BatchDialog } from "./components/BatchDialog";
import { BlankDayFillDialog } from "./components/BlankDayFillDialog";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { RepoMappingDialog } from "./components/RepoMappingDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UpdateBanner } from "./components/UpdateBanner";
import { Workbench } from "./components/Workbench";
import { WorkspaceCleanupDialog } from "./components/WorkspaceCleanupDialog";
import { useAppRuntime } from "./hooks/useAppRuntime";
import { useAppSettingsState } from "./hooks/useAppSettingsState";
import { useReportHistoryStorage } from "./hooks/useReportHistoryStorage";
import { useReportWorkflow } from "./hooks/useReportWorkflow";
import { useReportAgent } from "./hooks/useReportAgent";
import { useSupportEvents } from "./hooks/useSupportEvents";
import { useWorkspaceHealth } from "./hooks/useWorkspaceHealth";
import { useWorkspaceDirectoryActions } from "./hooks/useWorkspaceDirectoryActions";
import { useWorkspaceScanning } from "./hooks/useWorkspaceScanning";
import {
  taskIsActive,
  type AppTaskKind,
  useTaskActivity,
} from "./hooks/useTaskActivity";
import {
  type CommitExtractProgress,
  type GitIdentity,
  type RepoInfo,
  type RepoScanProgress,
  type MappingScope,
  clearRepoIndexCache,
  loadRepoIndexCache,
  loadSettingsState,
  parseProjectNames,
  persistRepoIndexCache,
  upsertRepoMapping,
  validateRequiredSettings,
  validateWorkspaceSettings,
} from "./model";
import "./styles/tokens.css";
import "./styles/shadcn.css";
import "./styles/period-picker.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/preview.css";
import "./styles/dialogs.css";
import "./styles/support-bundle.css";
import "./styles/onboarding.css";
import "./styles/theme.css";
import "./styles/workbench.css";
import "./styles/workbench-responsive.css";
import "./styles/workbench-feedback.css";
type RunTaskInput = {
  kind: AppTaskKind;
  label: string;
  task: () => Promise<void>;
  validate?: () => void;
  allowDuringPolishReview?: boolean;
};
function App() {
  const [loadedSettings] = useState(loadSettingsState);
  const [initialRepoCache] = useState(() => loadRepoIndexCache(loadedSettings.settings.rootDirs));
  const [repos, setRepos] = useState<RepoInfo[]>(() => initialRepoCache?.repos ?? []);
  const [repoScannedAt, setRepoScannedAt] = useState(() => initialRepoCache?.scannedAt ?? "");
  const [warnings, setWarnings] = useState<string[]>([]);
  const reportHistoryStorage = useReportHistoryStorage(
    loadedSettings.settings.reportHistoryLimit,
    (message) => {
      setWarnings((current) => current.includes(message) ? current : [message, ...current]);
      setStatus(message, { tone: "warning", notify: true, duration: 0 });
    },
  );
  const [status, setStatusText] = useState(
    loadedSettings.recoveredCorruptedSettings
      ? "本地设置损坏，已保留原文并使用可恢复配置"
      : loadedSettings.recoveredLegacyApiKey
        ? "已迁移旧配置中的 AI 密钥引用"
        : "就绪",
  );
  const [appMessage, setAppMessage] = useState<AppMessage | null>(null);
  const appMessageRef = useRef<AppMessage | null>(null);
  const appMessageSequenceRef = useRef(0);
  const { settings, setSettings, updateSetting, applyConfigProfileSettings } = useAppSettingsState({
    loadedSettings,
    onResizeHistory: reportHistoryStorage.resize,
    setStatus,
  });
  const supportEvents = useSupportEvents();
  const workspaceHealth = useWorkspaceHealth({
    rootDirs: settings.rootDirs,
    indexedRepos: repos,
    disabledRepos: settings.disabledRepos,
  });
  const { activeTasks, tryStartTask, finishTask } = useTaskActivity();
  const isRepoScanning = taskIsActive(activeTasks, "scan");
  const [scanProgress, setScanProgress] = useState<RepoScanProgress | null>(null);
  const [extractProgress, setExtractProgress] = useState<CommitExtractProgress | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [blankDayOpen, setBlankDayOpen] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [editingRepo, setEditingRepo] = useState<RepoInfo | null>(null);
  const {
    appVersion,
    updateSummary,
    updateMessage,
    updateProgress,
    updateBusy,
    startupUpdateNotice,
    checkForUpdates,
    installUpdate,
  } = useAppRuntime({ themeMode: settings.themeMode });
  const projectNames = useMemo(() => parseProjectNames(settings.projectNamesText), [settings.projectNamesText]);
  const aiConfigured =
    settings.aiProvider === "codex-oauth"
      ? Boolean(settings.aiModel.trim())
      : Boolean(settings.aiBaseUrl.trim() && settings.aiModel.trim() && settings.aiApiKey.trim());
  const { chooseOutputDir, addRootDirs, removeRootDir } = useWorkspaceDirectoryActions({ setSettings, updateSetting });
  const dismissAppMessage = useCallback(() => {
    appMessageRef.current = null;
    setAppMessage(null);
  }, []);

  function showMessage(message: string, tone: AppMessageTone = inferMessageTone(message), duration?: number) {
    const current = appMessageRef.current;
    const continuesLoadingMessage = current?.tone === "loading";
    if (!(continuesLoadingMessage && tone === "loading")) {
      supportEvents.record(message, tone);
    }
    const nextMessage: AppMessage = {
      id: continuesLoadingMessage ? current.id : ++appMessageSequenceRef.current,
      message,
      tone,
      duration: duration ?? (tone === "loading" ? 0 : 2800),
    };
    appMessageRef.current = nextMessage;
    setAppMessage(nextMessage);
  }
  function setStatus(message: string, options: { notify?: boolean; tone?: AppMessageTone; duration?: number } = {}) {
    setStatusText(message);
    const shouldNotify = options.notify ?? shouldNotifyStatus(message);
    if (shouldNotify) showMessage(message, options.tone ?? inferMessageTone(message), options.duration);
  }

  const reportWorkflow = useReportWorkflow({
    settings,
    repos,
    projectNames,
    reportHistoryStorage,
    runTask,
    setStatus,
    setWarnings,
    setExtractProgress,
    onOpenSettings: () => setSettingsOpen(true),
    onOpenBlankDay: () => setBlankDayOpen(true),
    onCloseBlankDay: () => setBlankDayOpen(false),
  });
  const {
    reportHistory,
    summaryText,
    dailyDate,
    customReport,
    customRange,
    weeklyReport,
    weeklyWeek,
    monthlyMonth,
    activeHistoryId,
    activePreview,
    polishReview,
    lastOutputFile,
    commitCount,
    projectCount,
    blankDayDraftActive,
    weeklyRange,
    monthlyRange,
    previewText,
    supplementalItemsText,
    changePreview,
    changeDailyDate,
    changeWeeklyWeek,
    changeMonthlyMonth,
    changeSupplementalItems,
    extractCommits,
    generateCustomReport,
    generateWeeklyReport,
    generateMonthlyReport,
    polishReport,
    acceptPolishReview,
    rejectPolishReview,
    copyPreview,
    saveReport,
    openReportHistory,
    copyReportHistory,
    regenerateReportHistory,
    clearHistoryRecords,
    handleGenerateDailyFromCalendar,
    handleOpenBlankDayFillFromCalendar,
    handleBlankDayGenerated,
    handleBlankDayApply,
  } = reportWorkflow;
  const reportAgent = useReportAgent({ settings, reportText: previewText,
    reportIdentity: `${activePreview}|${activeHistoryId}|${dailyDate}|${weeklyWeek}|${monthlyMonth}|${previewText}`,
    commits: reportWorkflow.agentCommits, history: reportHistory, runTask, setStatus,
    onReview: reportWorkflow.reviewAgentPatch });
  const workspaceScanning = useWorkspaceScanning({
    settings,
    repos,
    isRepoScanning,
    workspaceHealth,
    runTask,
    validateSettings: validateWorkspaceSettings,
    setSettings,
    setRepos,
    setRepoScannedAt,
    setScanProgress,
    setWarnings,
    setStatus,
  });

  useEffect(() => {
    if (!startupUpdateNotice) return;
    setUpdateBannerDismissed(false);
  }, [startupUpdateNotice]);

  useEffect(() => {
    function handleDateInputClick(e: MouseEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement && /^(date|month|week)$/.test(target.type)) {
        try { target.showPicker(); } catch { /* showPicker may throw if already open */ }
      }
    }
    document.addEventListener("click", handleDateInputClick);
    return () => document.removeEventListener("click", handleDateInputClick);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<RepoScanProgress>("repo-scan-progress", ({ payload }) => {
      setScanProgress(payload);
      if (payload.cancelled) {
        setStatus("仓库扫描已取消");
        return;
      }
      if (payload.done) return;
      setStatus(`正在扫描仓库：已检查 ${payload.scannedDirs} 个目录，发现 ${payload.foundRepos} 个仓库`, {
        tone: "loading",
        notify: true,
        duration: 0,
      });
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<CommitExtractProgress>("commit-extract-progress", ({ payload }) => {
      setExtractProgress(payload);
      if (payload.done) return;
      setStatus(formatExtractProgress(payload), { tone: "loading", notify: true, duration: 0 });
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (settings.author || settings.onboardingDone) return;

    invoke<GitIdentity>("get_git_identity")
      .then((identity) => {
        if (!identity.userName) return;
        setSettings((current) => {
          if (current.author) return current;
          return { ...current, author: identity.userName };
        });
        setStatus(`已读取本机 Git 作者：${identity.userName}`);
      })
      .catch(() => {
        setStatus("未读取到本机 Git 作者，可手动填写");
      });
  }, []);

  useEffect(() => {
    if (settings.rootDirs.length === 0) {
      setRepos([]);
      setRepoScannedAt("");
      clearRepoIndexCache();
      return;
    }

    const repoCache = loadRepoIndexCache(settings.rootDirs);
    if (repoCache) {
      setRepos(repoCache.repos);
      setRepoScannedAt(repoCache.scannedAt);
      setStatus(`已载入 ${repoCache.repos.length} 个缓存仓库索引`);
      return;
    }

    setRepos([]);
    setRepoScannedAt("");
    if (settings.onboardingDone) {
      setStatus("工作目录已更新，请点击重新扫描仓库索引");
      return;
    }
    workspaceScanning.scanWorkspace();
  }, [settings.rootDirs, settings.onboardingDone]);

  async function cancelRepoScan() {
    setStatus("正在取消仓库扫描");
    try {
      await invoke("cancel_repo_scan");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function runTask({
    kind,
    label,
    task,
    validate = () => validateRequiredSettings(settings),
    allowDuringPolishReview = false,
  }: RunTaskInput): Promise<boolean> {
    if (polishReview && !allowDuringPolishReview && (kind === "generate" || kind === "polish" || kind === "export" || kind === "agent")) {
      setStatus("请先接受或放弃当前 AI 润色结果", { tone: "warning", notify: true });
      return false;
    }
    try {
      validate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { tone: "error", notify: true, duration: 4200 });
      return false;
    }
    const start = tryStartTask(kind, label);
    if (!start.started) {
      setStatus(`请等待“${start.conflictLabel}”完成后再继续`, { tone: "warning", notify: true, duration: 3200 });
      return false;
    }
    setStatus(label, { tone: "loading", notify: true, duration: 0 });
    if (kind !== "interaction" && kind !== "agent") setWarnings([]);
    let succeeded = false;
    try {
      await task();
      succeeded = true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), { tone: "error", notify: true, duration: 4200 });
    } finally {
      finishTask(kind);
    }
    return succeeded;
  }

  function toggleRepo(repoPath: string, enabled: boolean) {
    setSettings((current) => {
      const disabled = current.disabledRepos.filter((path) => path !== repoPath);
      if (!enabled) disabled.push(repoPath);
      return { ...current, disabledRepos: disabled };
    });
    workspaceHealth.setRepoDisabled(repoPath, !enabled);
  }

  function setReposEnabled(repoPaths: string[], enabled: boolean) {
    const uniquePaths = [...new Set(repoPaths.filter(Boolean))];
    const disabledPaths = new Set(settings.disabledRepos);
    const changedPaths = uniquePaths.filter((path) => enabled ? disabledPaths.has(path) : !disabledPaths.has(path));
    if (changedPaths.length === 0) return;
    setSettings((current) => {
      const nextDisabled = new Set(current.disabledRepos);
      for (const path of changedPaths) {
        if (enabled) nextDisabled.delete(path);
        else nextDisabled.add(path);
      }
      return { ...current, disabledRepos: [...nextDisabled] };
    });
    workspaceHealth.setReposDisabled(changedPaths, !enabled);
    setStatus(`已${enabled ? "启用" : "禁用"}当前结果中的 ${changedPaths.length} 个仓库`, { tone: "success", notify: true });
  }

  function removeRepoFromIndex(repoPath: string) {
    const repo = repos.find((item) => item.path === repoPath);
    if (!repo || !window.confirm(`仅从 GitPulse 索引移除“${repo.name}”？本地仓库目录不会被删除。`)) return;
    const nextRepos = repos.filter((item) => item.path !== repoPath);
    setRepos(nextRepos);
    persistRepoIndexCache({ rootDirs: settings.rootDirs, repos: nextRepos, scannedAt: repoScannedAt });
    setSettings((current) => ({
      ...current,
      disabledRepos: current.disabledRepos.filter((path) => path !== repoPath),
    }));
    workspaceHealth.removeRepo(repoPath);
    setStatus(`已从索引移除“${repo.name}”，本地目录未删除`, { tone: "success", notify: true });
  }

  function saveRepoMapping(scope: MappingScope, displayName: string) {
    if (!editingRepo) return;
    setSettings((current) => ({
      ...current,
      projectNamesText: upsertRepoMapping(current.projectNamesText, editingRepo, scope, displayName),
    }));
    setStatus(displayName.trim() ? `已更新「${editingRepo.name}」的映射名称` : `已清除「${editingRepo.name}」的映射名称`);
    setEditingRepo(null);
  }

  if (!settings.onboardingDone) {
    return (
      <OnboardingWizard
        settings={settings}
        repos={repos}
        isScanning={isRepoScanning}
        updateSetting={updateSetting}
        onAddRootDirs={addRootDirs}
        onRemoveRootDir={removeRootDir}
        onComplete={() => updateSetting("onboardingDone", true)}
      />
    );
  }

  const showUpdateBanner = Boolean(updateSummary) && !updateBannerDismissed;



  return (
    <main className="app-root">
      <AppMessageHost message={appMessage} onDismiss={dismissAppMessage} />
      {showUpdateBanner && updateSummary && (
        <UpdateBanner
          version={updateSummary.version}
          updateBusy={updateBusy}
          updateProgress={updateProgress}
          updateMessage={updateMessage}
          onInstall={installUpdate}
          onViewDetails={() => {
            setUpdateBannerDismissed(true);
            setSettingsOpen(true);
          }}
          onDismiss={() => setUpdateBannerDismissed(true)}
        />
      )}

      <Workbench
        agent={reportAgent}
        agentEvidenceCount={reportWorkflow.agentCommits.length}
        aiModel={settings.aiModel}
        aiDestination={settings.aiProvider === "codex-oauth" ? "ChatGPT Codex (实验性)" : settings.aiBaseUrl}
        draftEdited={reportWorkflow.draftEdited}
        canUndoDraftEdit={reportWorkflow.canUndoDraftEdit}
        onSaveManualEdit={reportWorkflow.saveManualEdit}
        onUndoDraftEdit={reportWorkflow.undoDraftEdit}
        repos={repos}
        projectNames={projectNames}
        previewText={previewText}
        activePreview={activePreview}
        status={status}
        warnings={warnings}
        activeTasks={activeTasks}
        polishReview={polishReview}
        scanProgress={scanProgress}
        extractProgress={extractProgress}
        lastOutputFile={lastOutputFile}
        summaryText={activePreview === "weekly" ? weeklyReport : activePreview === "custom" ? customReport : summaryText}
        reportHistory={reportHistory}
        activeHistoryId={activeHistoryId}
        rootDirs={settings.rootDirs}
        repoCount={repos.length}
        repoScannedAt={repoScannedAt}
        workspaceHealth={workspaceHealth.result}
        workspaceHealthLoading={workspaceHealth.loading}
        workspaceHealthError={workspaceHealth.error}
        commitCount={commitCount}
        blankDayDraftActive={blankDayDraftActive}
        projectCount={projectCount}
        author={settings.author}
        dailyDate={dailyDate}
        onDailyDateChange={changeDailyDate}
        weeklyRange={weeklyRange}
        weeklyWeek={weeklyWeek}
        onWeeklyWeekChange={changeWeeklyWeek}
        monthlyMonth={monthlyMonth}
        onMonthlyMonthChange={changeMonthlyMonth}
        monthlyRange={monthlyRange}
        customRange={customRange}
        supplementalItemsText={supplementalItemsText}
        onSupplementalItemsChange={changeSupplementalItems}
        aiConfigured={aiConfigured}
        extractAllBranches={settings.extractAllBranches}
        showEvidenceDetails={settings.showEvidenceDetails}
        redactionEnabled={settings.redactionEnabled}
        outputEnabled={settings.outputEnabled}
        outputDir={settings.outputDir}
        onExtract={extractCommits}
        onGenerateWeekly={generateWeeklyReport}
        onGenerateCustom={generateCustomReport}
        onGenerateMonthly={generateMonthlyReport}
        onPolish={polishReport}
        onAcceptPolishReview={acceptPolishReview}
        onRejectPolishReview={rejectPolishReview}
        onCopy={copyPreview}
        onExport={saveReport}
        onOpenHistory={openReportHistory}
        onCopyHistory={copyReportHistory}
        onRegenerateHistory={regenerateReportHistory}
        onClearHistory={clearHistoryRecords}
        canExport={settings.outputEnabled && Boolean(settings.outputDir.trim())}
        disabledRepos={settings.disabledRepos}
        onToggleRepo={toggleRepo}
        onSetReposEnabled={setReposEnabled}
        onEditRepo={setEditingRepo}
        onRefreshRepos={() => void workspaceScanning.scanWorkspace()}
        onCancelRepoScan={cancelRepoScan}
        onRefreshWorkspaceHealth={() => void workspaceHealth.refresh()}
        onRemoveRepoFromIndex={removeRepoFromIndex}
        onAddRootDirs={addRootDirs}
        onPreviewChange={changePreview}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenBatch={() => setBatchOpen(true)}
        onOpenBlankDayFill={() => setBlankDayOpen(true)}
        onGenerateDailyFromCalendar={handleGenerateDailyFromCalendar}
        onOpenBlankDayFillFromCalendar={handleOpenBlankDayFillFromCalendar}
        onInspectWorkspaceCleanup={workspaceScanning.inspectCleanup}
        onDismissWarnings={() => setWarnings([])}
        workspaceCleanupBlocked={isRepoScanning || workspaceScanning.cleanupBusy}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        repos={repos}
        recentEvents={supportEvents.events}
        currentVersion={appVersion}
        updateSummary={updateSummary}
        updateMessage={updateMessage}
        updateProgress={updateProgress}
        updateBusy={updateBusy}
        updateSetting={updateSetting}
        onApplyConfigProfile={applyConfigProfileSettings}
        onAddRootDirs={addRootDirs}
        onRemoveRootDir={removeRootDir}
        onChooseOutputDir={chooseOutputDir}
        onCheckForUpdates={checkForUpdates}
        onInstallUpdate={installUpdate}
        onClearHistory={clearHistoryRecords}
        onClose={() => setSettingsOpen(false)}
      />
      <BatchDialog
        open={batchOpen}
        settings={settings}
        indexedRepos={repos}
        onNotify={(message, tone) => showMessage(message, tone, 1800)}
        onClose={() => setBatchOpen(false)}
      />
      <BlankDayFillDialog
        open={blankDayOpen}
        settings={settings}
        indexedRepos={repos}
        targetDate={dailyDate}
        aiConfigured={aiConfigured}
        onClose={() => setBlankDayOpen(false)}
        onOpenSettings={() => {
          setBlankDayOpen(false);
          setSettingsOpen(true);
        }}
        onGenerated={handleBlankDayGenerated}
        onApply={handleBlankDayApply}
        onNotify={(message, tone) => showMessage(message, tone, 1800)}
      />
      <RepoMappingDialog
        open={editingRepo !== null}
        repo={editingRepo}
        projectNamesText={settings.projectNamesText}
        onClose={() => setEditingRepo(null)}
        onConfirm={saveRepoMapping}
      />
      <WorkspaceCleanupDialog
        candidate={workspaceScanning.cleanupCandidate}
        busy={workspaceScanning.cleanupBusy}
        onCancel={workspaceScanning.dismissCleanup}
        onConfirm={() => void workspaceScanning.confirmCleanup()}
      />
    </main>
  );
}

function shouldNotifyStatus(message: string) {
  const trimmed = message.trim();
  return Boolean(trimmed && trimmed !== "就绪");
}

function inferMessageTone(message: string): AppMessageTone {
  if (message.includes("失败") || message.includes("错误") || message.includes("无效") || message.includes("无法")) return "error";
  if (message.includes("请选择") || message.includes("请输入") || message.includes("请先") || message.includes("不能为空")) return "warning";
  if (message.includes("取消") || message.includes("未写入") || message.includes("未读取") || message.includes("待配置")) return "warning";
  if (message.startsWith("正在") || message.startsWith("提取中")) return "loading";
  if (message.includes("已") || message.includes("完成") || message.includes("生成")) return "success";
  return "info";
}

function formatExtractProgress(progress: CommitExtractProgress) {
  const total = progress.totalRepos;
  if (total === 0) return "没有启用的仓库可提取";
  return `提取中 · ${progress.completedRepos}/${total} 仓库 · ${progress.commitCount} 提交`;
}

export default App;
