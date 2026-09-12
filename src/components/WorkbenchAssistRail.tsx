import { CheckSquare2, History, MessageSquare, Sparkles } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import type { WorkbenchProps } from "./Workbench.types";
import { ReportHistoryPanel } from "./ReportHistoryPanel";
import { ReportQualityPanel } from "./ReportQualityPanel";
import { RepositoryPanel } from "./RepositoryPanel";
import { ReportAgentPanel } from "./ReportAgentPanel";

type Props = {
  workbench: WorkbenchProps;
  activePanel: "repos" | "history" | "quality" | "agent";
  enabledRepoCount: number;
  hasQualityPanel: boolean;
  isRepoScanning: boolean;
  scanBlocked: boolean;
  generateBlocked: boolean;
  reviewPending: boolean;
  onPanelChange: (panel: "repos" | "history" | "quality" | "agent") => void;
};

export function WorkbenchAssistRail({
  workbench,
  activePanel,
  enabledRepoCount,
  hasQualityPanel,
  isRepoScanning,
  scanBlocked,
  generateBlocked,
  reviewPending,
  onPanelChange,
}: Props) {
  const visiblePanel = activePanel === "quality" && !hasQualityPanel ? "repos" : activePanel;
  return (
    <aside className="assist-rail" aria-label="本次范围">
      <div className="assist-rail-head">
        <div>
          <h2>{visiblePanel === "agent" ? "报告助手" : "本次范围"}</h2>
        </div>
        <strong>{enabledRepoCount}/{workbench.repos.length}</strong>
      </div>
      <div className="assist-tabs" role="tablist" aria-label="范围辅助视图">
        <AssistTab icon={<CheckSquare2 size={14} />} label="范围" meta={`${enabledRepoCount}/${workbench.repos.length}`} panel="repos" visiblePanel={visiblePanel} onPanelChange={onPanelChange} />
        <AssistTab icon={<History size={14} />} label="最近" meta={String(workbench.reportHistory.length)} panel="history" visiblePanel={visiblePanel} onPanelChange={onPanelChange} />
        <AssistTab icon={<Sparkles size={14} />} label="交付" meta={hasQualityPanel ? "可查" : "待生成"} panel="quality" visiblePanel={visiblePanel} disabled={!hasQualityPanel} onPanelChange={onPanelChange} />
        {workbench.previewText && <AssistTab icon={<MessageSquare size={14} />} label="助手" meta="" panel="agent" visiblePanel={visiblePanel} onPanelChange={onPanelChange} />}
      </div>
      <div className={`assist-panel ${visiblePanel === "agent" ? "agent-assist-panel" : ""}`}>
        {visiblePanel === "agent" && <ReportAgentPanel workbench={workbench} locked={reviewPending} />}
        {visiblePanel === "repos" && (
          <RepositoryPanel
            repos={workbench.repos}
            disabledRepos={workbench.disabledRepos}
            projectNames={workbench.projectNames}
            rootDirs={workbench.rootDirs}
            isScanning={isRepoScanning}
            scanBlocked={scanBlocked}
            scanProgress={workbench.scanProgress}
            onToggleRepo={workbench.onToggleRepo}
            onSetReposEnabled={workbench.onSetReposEnabled}
            onEditRepo={workbench.onEditRepo}
            onRefreshRepos={workbench.onRefreshRepos}
            onCancelRepoScan={workbench.onCancelRepoScan}
            onAddRootDirs={workbench.onAddRootDirs}
            onOpenSettings={workbench.onOpenSettings}
          />
        )}
        {visiblePanel === "history" && (
          <ReportHistoryPanel
            entries={workbench.reportHistory}
            activeHistoryId={workbench.activeHistoryId}
            generationBlocked={generateBlocked}
            reportLocked={reviewPending}
            onOpen={workbench.onOpenHistory}
            onCopy={workbench.onCopyHistory}
            onRegenerate={workbench.onRegenerateHistory}
            onClear={workbench.onClearHistory}
          />
        )}
        {visiblePanel === "quality" && hasQualityPanel && (
          <ReportQualityPanel
            commitCount={workbench.commitCount}
            projectCount={workbench.projectCount}
            enabledRepoCount={enabledRepoCount}
            totalRepoCount={workbench.repos.length}
            aiConfigured={workbench.aiConfigured}
            showEvidenceDetails={workbench.showEvidenceDetails}
            redactionEnabled={workbench.redactionEnabled}
            canExport={workbench.canExport}
          />
        )}
      </div>
    </aside>
  );
}

function AssistTab({ icon, label, meta, panel, visiblePanel, disabled = false, onPanelChange }: {
  icon: ReactNode;
  label: string;
  meta: string;
  panel: Props["activePanel"];
  visiblePanel: Props["activePanel"];
  disabled?: boolean;
  onPanelChange: Props["onPanelChange"];
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)") ?? [],
    );
    if (tabs.length === 0) return;
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].click();
    tabs[nextIndex].focus();
  }
  const selected = visiblePanel === panel;
  return (
    <button type="button" role="tab" aria-selected={selected} className={selected ? "active" : ""} tabIndex={selected ? 0 : -1} disabled={disabled} onClick={() => onPanelChange(panel)} onKeyDown={handleKeyDown}>
      {icon}<span>{label}</span><em>{meta}</em>
    </button>
  );
}
