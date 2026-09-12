import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { activeTaskLabel, taskCanStart, taskIsActive } from "../hooks/useTaskActivity";
import type { HeatmapResult } from "./ContributionHeatmap";
import { InsightsView } from "./InsightsView";
import { ReportCanvas } from "./ReportCanvas";
import type { TrendResult } from "./TrendPanel";
import type { WorkRhythmResult } from "./WorkRhythmPanel";
import { WorkbenchEventLog } from "./WorkbenchEventLog";
import { WorkbenchHeader, type WorkbenchView } from "./WorkbenchHeader";
import type { WorkbenchProps } from "./Workbench.types";
import { WorkspaceHealthView } from "./WorkspaceHealthView";
import { buildEmptyReportAdvice } from "./workbenchAdvice";

export function Workbench(props: WorkbenchProps) {
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>("report");
  const [reportEditing, setReportEditing] = useState(false);
  const [emptyAdviceDismissedKey, setEmptyAdviceDismissedKey] = useState("");
  const [heatmapData, setHeatmapData] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [rhythmData, setRhythmData] = useState<WorkRhythmResult | null>(null);
  const [rhythmLoading, setRhythmLoading] = useState(false);
  const [trendData, setTrendData] = useState<TrendResult | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendGranularity, setTrendGranularity] = useState<"weekly" | "monthly">("weekly");
  const isGenerating = taskIsActive(props.activeTasks, "generate");
  const isRepoScanning = taskIsActive(props.activeTasks, "scan");
  const reviewPending = Boolean(props.polishReview) || reportEditing;
  const generateBlocked = reviewPending || !taskCanStart(props.activeTasks, "generate");
  const scanBlocked = !taskCanStart(props.activeTasks, "scan");
  const activeTaskStatus = activeTaskLabel(props.activeTasks);
  const enabledRepoCount = props.repos.filter((repo) => !props.disabledRepos.includes(repo.path)).length;
  const extractProgressText = props.extractProgress && !props.extractProgress.done
    ? `提取中 · ${props.extractProgress.completedRepos}/${props.extractProgress.totalRepos} 仓库 · ${props.extractProgress.commitCount} 提交`
    : activeTaskStatus || props.status;
  const visibleStatus = isGenerating && props.extractProgress && !props.extractProgress.done
    ? extractProgressText
    : activeTaskStatus || props.status;
  const emptyReportAdvice = props.previewText && props.commitCount === 0 && !props.blankDayDraftActive
    ? buildEmptyReportAdvice({
      activePreview: props.activePreview,
      dailyDate: props.dailyDate,
      weeklyRange: props.weeklyRange,
      monthlyRange: props.monthlyRange,
      customRange: props.customRange,
      author: props.author,
      enabledRepoCount,
    })
    : null;
  const emptyAdviceKey = emptyReportAdvice
    ? `${props.activePreview}|${emptyReportAdvice.scope}|${props.previewText.length}`
    : "";
  const showEmptyReportAdvice = Boolean(emptyReportAdvice && emptyAdviceKey !== emptyAdviceDismissedKey);

  const loadHeatmapData = useCallback(() => {
    if (heatmapLoading) return;
    setHeatmapLoading(true);
    invoke<HeatmapResult>("get_heatmap_data", {
      options: { workspaceRoots: props.rootDirs, author: props.author, weeks: 52 },
    })
      .then((result) => setHeatmapData(result))
      .catch(() => setHeatmapData(null))
      .finally(() => setHeatmapLoading(false));

    if (!rhythmLoading) {
      setRhythmLoading(true);
      invoke<WorkRhythmResult>("get_work_rhythm", {
        options: { workspaceRoots: props.rootDirs, author: props.author },
      })
        .then((result) => setRhythmData(result))
        .catch(() => setRhythmData(null))
        .finally(() => setRhythmLoading(false));
    }
  }, [props.rootDirs, props.author, heatmapLoading, rhythmLoading]);

  const loadTrendData = useCallback((granularity: "weekly" | "monthly") => {
    if (trendLoading) return;
    setTrendLoading(true);
    invoke<TrendResult>("get_trend_data", {
      options: {
        workspaceRoots: props.rootDirs,
        author: props.author,
        granularity,
        periods: granularity === "weekly" ? 12 : 6,
      },
    })
      .then((result) => setTrendData(result))
      .catch(() => setTrendData(null))
      .finally(() => setTrendLoading(false));
  }, [props.rootDirs, props.author, trendLoading]);

  const loadAllInsightsData = useCallback(() => {
    loadHeatmapData();
    loadTrendData(trendGranularity);
  }, [loadHeatmapData, loadTrendData, trendGranularity]);

  const refreshInsightsData = useCallback(() => {
    setHeatmapData(null);
    setRhythmData(null);
    setTrendData(null);
    setHeatmapLoading(false);
    setRhythmLoading(false);
    setTrendLoading(false);
    setTimeout(() => loadAllInsightsData(), 0);
  }, [loadAllInsightsData]);

  function handleViewChange(view: WorkbenchView) {
    setWorkbenchView(view);
    if (view === "insights" && !heatmapData && !heatmapLoading) loadAllInsightsData();
  }

  useEffect(() => {
    if (workbenchView !== "health" || props.workspaceHealth || props.workspaceHealthLoading || props.workspaceHealthError) return;
    props.onRefreshWorkspaceHealth();
  }, [workbenchView, props.workspaceHealth, props.workspaceHealthLoading, props.workspaceHealthError, props.onRefreshWorkspaceHealth]);

  return (
    <section className="workbench">
      <WorkbenchHeader
        activeTasks={props.activeTasks}
        visibleStatus={visibleStatus}
        activeView={workbenchView}
        reviewPending={reviewPending}
        onOpenSettings={props.onOpenSettings}
        onViewChange={handleViewChange}
      />
      {workbenchView === "report" ? (
        <ReportCanvas workbench={props} onEditingChange={setReportEditing} />
      ) : workbenchView === "insights" ? (
        <InsightsView
          heatmapData={heatmapData}
          heatmapLoading={heatmapLoading}
          rhythmData={rhythmData}
          rhythmLoading={rhythmLoading}
          trendData={trendData}
          trendLoading={trendLoading}
          trendGranularity={trendGranularity}
          onTrendGranularityChange={(granularity) => {
            setTrendGranularity(granularity);
            setTrendData(null);
            loadTrendData(granularity);
          }}
          onRefresh={refreshInsightsData}
          reportHistory={props.reportHistory}
          aiConfigured={props.aiConfigured}
          generationBlocked={generateBlocked}
          onOpenHistory={(entry) => {
            setWorkbenchView("report");
            props.onOpenHistory(entry);
          }}
          onGenerateDaily={(date) => {
            setWorkbenchView("report");
            props.onGenerateDailyFromCalendar(date);
          }}
          onOpenBlankDayFill={(date) => {
            setWorkbenchView("report");
            props.onOpenBlankDayFillFromCalendar(date);
          }}
        />
      ) : (
        <WorkspaceHealthView
          result={props.workspaceHealth}
          loading={props.workspaceHealthLoading}
          error={props.workspaceHealthError}
          scannedAt={props.repoScannedAt}
          rootDirs={props.rootDirs}
          rescanning={isRepoScanning}
          scanBlocked={scanBlocked}
          onRefresh={props.onRefreshWorkspaceHealth}
          onRescan={props.onRefreshRepos}
          onOpenSettings={props.onOpenSettings}
          onToggleRepo={props.onToggleRepo}
          onRemoveRepo={props.onRemoveRepoFromIndex}
        />
      )}
      {workbenchView === "report" && (
        <WorkbenchEventLog
          warnings={props.warnings}
          lastOutputFile={props.lastOutputFile}
          emptyReportAdvice={emptyReportAdvice}
          showEmptyReportAdvice={showEmptyReportAdvice}
          scanBlocked={scanBlocked}
          cleanupBlocked={props.workspaceCleanupBlocked}
          onDismissAdvice={() => setEmptyAdviceDismissedKey(emptyAdviceKey)}
          onOpenSettings={props.onOpenSettings}
          onRefreshRepos={props.onRefreshRepos}
          onInspectCleanup={props.onInspectWorkspaceCleanup}
          onDismissWarnings={props.onDismissWarnings}
          canFillBlankDay={props.activePreview === "summary" && props.aiConfigured}
          onOpenBlankDayFill={props.onOpenBlankDayFill}
        />
      )}
    </section>
  );
}
