import {
  CalendarDays,
  ChevronDown,
  Clipboard,
  FileDown,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  MessageSquare,
  Pencil,
  Undo2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { activeTaskLabel, taskCanStart, taskIsActive } from "../hooks/useTaskActivity";
import { usePopover } from "../hooks/useOverlayFocus";
import { convertMarkdownTo, REPORT_FORMAT_PRESETS, type IMFormatPresetId } from "../reportFormat";
import {
  type DateRange,
  type PreviewMode,
  type ReportExportFormat,
} from "../model";
import { CustomRangeDialog } from "./CustomRangeDialog";
import { GenerationScopeStrip, formatActiveRange, getHistoryKindLabel, ReportPeriodControl } from "./WorkbenchControls";
import { ReportPolishReviewPanel } from "./ReportPolishReviewPanel";
import { SupplementalItemsEditor } from "./SupplementalItemsEditor";
import type { WorkbenchProps } from "./Workbench.types";
import { WorkbenchAssistRail } from "./WorkbenchAssistRail";
import { MarkdownPreview } from "./MarkdownPreview";
import { ReportEditor } from "./ReportEditor";

type Props = { workbench: WorkbenchProps; onEditingChange: (editing: boolean) => void };
type AssistPanel = "repos" | "history" | "quality" | "agent";

export function ReportCanvas({ workbench: props, onEditingChange }: Props) {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [polishMenuOpen, setPolishMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [copyAsMenuOpen, setCopyAsMenuOpen] = useState(false);
  const [polishExtra, setPolishExtra] = useState("");
  const [activeAssistPanel, setActiveAssistPanel] = useState<AssistPanel>("repos");
  const polishButtonRef = useRef<HTMLButtonElement>(null);
  const polishMenuButtonRef = useRef<HTMLButtonElement>(null);
  const exportMenuButtonRef = useRef<HTMLButtonElement>(null);
  const copyMenuButtonRef = useRef<HTMLButtonElement>(null);
  const hadPolishReviewRef = useRef(false);
  const polishPopoverRef = usePopover({ open: polishMenuOpen, onClose: () => setPolishMenuOpen(false), anchorRef: polishMenuButtonRef, initialFocusSelector: "textarea" });
  const exportPopoverRef = usePopover({ open: exportMenuOpen, onClose: () => setExportMenuOpen(false), anchorRef: exportMenuButtonRef, itemSelector: "[role='menuitem']", initialFocusSelector: "[role='menuitem']" });
  const copyPopoverRef = usePopover({ open: copyAsMenuOpen, onClose: () => setCopyAsMenuOpen(false), anchorRef: copyMenuButtonRef, itemSelector: "[role='menuitem']", initialFocusSelector: "[role='menuitem']" });
  const isGenerating = taskIsActive(props.activeTasks, "generate");
  const isPolishing = taskIsActive(props.activeTasks, "polish");
  const isExporting = taskIsActive(props.activeTasks, "export");
  const isInteracting = taskIsActive(props.activeTasks, "interaction");
  const reviewPending = Boolean(props.polishReview) || isEditing;
  const generateBlocked = reviewPending || !taskCanStart(props.activeTasks, "generate");
  const polishBlocked = reviewPending || !taskCanStart(props.activeTasks, "polish");
  const exportBlocked = reviewPending || !taskCanStart(props.activeTasks, "export");
  const interactionBlocked = !taskCanStart(props.activeTasks, "interaction");
  const hasReport = Boolean(props.previewText);
  const enabledRepoCount = props.repos.filter((repo) => !props.disabledRepos.includes(repo.path)).length;
  const activeRangeLabel = formatActiveRange(props.activePreview, props.dailyDate, props.weeklyRange, props.monthlyRange, props.customRange);
  const exportConfigured = props.canExport;
  const activeTaskStatus = activeTaskLabel(props.activeTasks);
  const reportKindLabel = getHistoryKindLabel(props.activePreview);
  const generateButtonLabel = isGenerating
    ? "生成中"
    : props.activePreview === "monthly"
      ? "生成月报"
      : props.activePreview === "weekly"
        ? "生成周报"
        : props.activePreview === "custom"
          ? "生成自定义报告"
          : "生成日报";
  const generateButtonIcon = isGenerating
    ? <Loader2 className="spin" size={15} />
    : props.activePreview === "monthly"
      ? <FileDown size={15} />
      : props.activePreview === "weekly" || props.activePreview === "custom"
        ? <CalendarDays size={15} />
        : <GitBranch size={15} />;
  const exportButtonLabel = isExporting ? "导出中" : exportConfigured ? "导出" : "设置导出";
  const exportButtonTitle = exportConfigured
    ? "导出为 Markdown"
    : props.outputEnabled
      ? "请选择输出目录后再导出报告"
      : "请先开启输出到文件并选择输出目录";
  const extractProgressText = props.extractProgress && !props.extractProgress.done
    ? `提取中 · ${props.extractProgress.completedRepos}/${props.extractProgress.totalRepos} 仓库 · ${props.extractProgress.commitCount} 提交`
    : activeTaskStatus || props.status;

  useEffect(() => { onEditingChange(isEditing); }, [isEditing, onEditingChange]);

  useEffect(() => {
    if (props.polishReview) hadPolishReviewRef.current = true;
    else if (hadPolishReviewRef.current && !isExporting) {
      hadPolishReviewRef.current = false;
      polishButtonRef.current?.focus();
    }
  }, [isExporting, props.polishReview]);

  useEffect(() => {
    if (!isPreviewExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreviewExpanded]);

  function handlePreviewChange(preview: PreviewMode) {
    setPolishMenuOpen(false);
    setExportMenuOpen(false);
    setCopyAsMenuOpen(false);
    props.onPreviewChange(preview);
  }

  function handleGenerate() {
    if (props.activePreview === "monthly") props.onGenerateMonthly(props.monthlyMonth);
    else if (props.activePreview === "weekly") props.onGenerateWeekly();
    else if (props.activePreview === "custom") props.onGenerateCustom(props.customRange);
    else props.onExtract();
  }

  function handleExport(format: ReportExportFormat) {
    setExportMenuOpen(false);
    props.onExport(format);
  }

  function generateCustom(range: DateRange) {
    setCustomDialogOpen(false);
    props.onPreviewChange("custom");
    props.onGenerateCustom(range);
  }

  return (
    <>
      {isPreviewExpanded && <div className="canvas-fullscreen-backdrop" aria-hidden="true" onClick={() => setIsPreviewExpanded(false)} />}
      <div className={`studio-grid ${activeAssistPanel === "agent" ? "agent-open" : ""}`}>
        <section className={`report-canvas ${isPreviewExpanded ? "preview-expanded" : ""}`} aria-label="报告工作区">
          <div className="canvas-head">
            <div className="canvas-topline">
              <div className="report-heading">
                <FileText size={18} />
                <div>
                  <h2>生成报告</h2>
                  <p>选择报告类型与周期，确认范围后生成</p>
                </div>
              </div>
              <div className="report-switch" aria-label="报告类型切换">
                {(["summary", "weekly", "monthly", "custom"] as PreviewMode[]).map((mode) => (
                  <button key={mode} type="button" aria-pressed={props.activePreview === mode} className={props.activePreview === mode ? "active" : ""} disabled={reviewPending} onClick={() => handlePreviewChange(mode)}>
                    {mode === "summary" ? "日报" : mode === "weekly" ? "周报" : mode === "monthly" ? "月报" : "自定义"}
                  </button>
                ))}
              </div>
            </div>
            <ReportPeriodControl
              activePreview={props.activePreview}
              dailyDate={props.dailyDate}
              weeklyWeek={props.weeklyWeek}
              weeklyRange={props.weeklyRange}
              monthlyMonth={props.monthlyMonth}
              monthlyRange={props.monthlyRange}
              customRange={props.customRange}
              periodLocked={isGenerating || reviewPending}
              onDailyDateChange={props.onDailyDateChange}
              onWeeklyWeekChange={props.onWeeklyWeekChange}
              onMonthlyMonthChange={props.onMonthlyMonthChange}
              onOpenCustomRange={() => setCustomDialogOpen(true)}
            />
            <GenerationScopeStrip activePreview={props.activePreview} rangeLabel={activeRangeLabel} author={props.author} enabledRepoCount={enabledRepoCount} totalRepoCount={props.repos.length} extractAllBranches={props.extractAllBranches} redactionEnabled={props.redactionEnabled} onOpenSettings={props.onOpenSettings} />
            <SupplementalItemsEditor value={props.supplementalItemsText} disabled={isGenerating || isPolishing || reviewPending} onChange={props.onSupplementalItemsChange} />
          </div>
          <div className={`preview-shell ${!isGenerating && (hasReport || props.polishReview) ? "has-report" : "is-empty"}`}>
            {!isGenerating && (hasReport || props.polishReview) && <div className="result-toolbar" aria-label="报告结果操作">
              <div className="result-summary"><strong>{reportKindLabel}{props.polishReview ? "审核中" : props.draftEdited ? " · 已编辑" : "已生成"}</strong><span>{props.commitCount} 个提交 · {props.projectCount} 个项目</span></div>
              <div className="canvas-actions-group">
                <button ref={editButtonRef} type="button" className="report-tool-icon" title="编辑 Markdown" aria-label="编辑报告" disabled={polishBlocked} onClick={() => setIsEditing(true)}><Pencil size={15} /></button>
                {props.canUndoDraftEdit && <button type="button" className="report-tool-icon" title="恢复编辑前版本" aria-label="恢复编辑前版本" disabled={polishBlocked} onClick={props.onUndoDraftEdit}><Undo2 size={15} /></button>}
                <button type="button" className={`report-tool-icon ${activeAssistPanel === "agent" ? "active" : ""}`} title="报告助手" aria-label="打开报告助手" aria-pressed={activeAssistPanel === "agent"} disabled={isEditing} onClick={() => setActiveAssistPanel("agent")}><MessageSquare size={15} /></button>
                <CopyActions props={props} isInteracting={isInteracting} interactionBlocked={interactionBlocked} copyAsMenuOpen={copyAsMenuOpen} copyMenuButtonRef={copyMenuButtonRef} copyPopoverRef={copyPopoverRef} setCopyAsMenuOpen={setCopyAsMenuOpen} setPolishMenuOpen={setPolishMenuOpen} setExportMenuOpen={setExportMenuOpen} />
                <PolishActions props={props} isPolishing={isPolishing} polishBlocked={polishBlocked} polishMenuOpen={polishMenuOpen} setPolishMenuOpen={setPolishMenuOpen} setExportMenuOpen={setExportMenuOpen} setCopyAsMenuOpen={setCopyAsMenuOpen} polishExtra={polishExtra} setPolishExtra={setPolishExtra} polishButtonRef={polishButtonRef} polishMenuButtonRef={polishMenuButtonRef} polishPopoverRef={polishPopoverRef} />
                <ExportActions props={props} isExporting={isExporting} exportBlocked={exportBlocked} exportConfigured={exportConfigured} exportButtonLabel={exportButtonLabel} exportButtonTitle={exportButtonTitle} exportMenuOpen={exportMenuOpen} exportMenuButtonRef={exportMenuButtonRef} exportPopoverRef={exportPopoverRef} setExportMenuOpen={setExportMenuOpen} setPolishMenuOpen={setPolishMenuOpen} setCopyAsMenuOpen={setCopyAsMenuOpen} onExport={handleExport} />
                <button className="preview-generate-button regenerate-button" type="button" onClick={handleGenerate} disabled={generateBlocked}>{generateButtonIcon}{generateButtonLabel}</button>
              </div>
            </div>}
            {props.polishReview ? (
              <ReportPolishReviewPanel review={props.polishReview} accepting={isExporting} onAccept={props.onAcceptPolishReview} onReject={props.onRejectPolishReview} />
            ) : isGenerating ? (
              <div className="preview-loading" role="status" aria-live="polite"><Loader2 className="spin" size={30} /><p>{extractProgressText}</p><button className="preview-generate-button" type="button" disabled>{generateButtonIcon}{generateButtonLabel}</button></div>
            ) : isEditing ? (
              <ReportEditor text={props.previewText} onSave={props.onSaveManualEdit} onClose={() => { setIsEditing(false); editButtonRef.current?.focus(); }} />
            ) : hasReport ? (
              <MarkdownPreview markdown={props.previewText} emptyText="" />
            ) : (
              <div className="report-empty-state" role="region" aria-label="报告尚未生成">
                <div className="report-empty-icon" aria-hidden="true"><FileText size={24} /></div>
                <div className="report-empty-copy">
                  <h3>准备生成{reportKindLabel}</h3>
                  <p>将为 {props.author.trim() || "全部作者"} 汇总 {enabledRepoCount} 个仓库在{props.extractAllBranches ? "全部分支" : "当前分支"}、{activeRangeLabel} 的提交。</p>
                  <span><ShieldCheck size={14} />Git 数据仅在本机处理</span>
                </div>
                <button className="report-generate-primary" type="button" onClick={handleGenerate} disabled={generateBlocked || enabledRepoCount === 0}>{generateButtonIcon}{generateButtonLabel}</button>
                <details className="generation-more">
                  <summary><Layers size={14} />更多生成方式</summary>
                  <button type="button" onClick={props.onOpenBatch} disabled={generateBlocked}><Layers size={14} />批量</button>
                </details>
              </div>
            )}
            {(hasReport || props.polishReview) && <button className="preview-expand-button" type="button" onClick={() => setIsPreviewExpanded((current) => !current)} aria-label={isPreviewExpanded ? "退出预览全屏" : "全屏查看预览"} title={isPreviewExpanded ? "退出全屏" : "全屏查看"}>{isPreviewExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>}
          </div>
        </section>
        <WorkbenchAssistRail workbench={props} activePanel={activeAssistPanel} enabledRepoCount={enabledRepoCount} hasQualityPanel={Boolean(props.previewText && props.commitCount > 0)} isRepoScanning={taskIsActive(props.activeTasks, "scan")} scanBlocked={!taskCanStart(props.activeTasks, "scan")} generateBlocked={generateBlocked} reviewPending={reviewPending} onPanelChange={setActiveAssistPanel} />
      </div>
      <CustomRangeDialog open={customDialogOpen} initialRange={props.customRange} generationBlocked={generateBlocked} onClose={() => setCustomDialogOpen(false)} onConfirm={generateCustom} />
    </>
  );
}

type PolishActionsProps = {
  props: WorkbenchProps;
  isPolishing: boolean;
  polishBlocked: boolean;
  polishMenuOpen: boolean;
  setPolishMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setExportMenuOpen: (value: boolean) => void;
  setCopyAsMenuOpen: (value: boolean) => void;
  polishExtra: string;
  setPolishExtra: (value: string) => void;
  polishButtonRef: RefObject<HTMLButtonElement | null>;
  polishMenuButtonRef: RefObject<HTMLButtonElement | null>;
  polishPopoverRef: RefObject<HTMLDivElement | null>;
};

function PolishActions({ props, isPolishing, polishBlocked, polishMenuOpen, setPolishMenuOpen, setExportMenuOpen, setCopyAsMenuOpen, polishExtra, setPolishExtra, polishButtonRef, polishMenuButtonRef, polishPopoverRef }: PolishActionsProps) {
  return <div className="polish-split">
    <button ref={polishButtonRef} className={`preview-polish-button ${!props.aiConfigured ? "warning" : ""}`} type="button" onClick={() => props.onPolish()} disabled={polishBlocked || !props.aiConfigured} title={props.aiConfigured ? "使用 AI 润色当前报告" : "请在设置中配置 AI"}>{isPolishing ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}{isPolishing ? "润色中" : "AI润色"}</button>
    <button ref={polishMenuButtonRef} className={`polish-split-toggle ${!props.aiConfigured ? "warning" : ""}`} type="button" onClick={() => { setExportMenuOpen(false); setCopyAsMenuOpen(false); setPolishMenuOpen((current) => !current); }} disabled={polishBlocked || !props.aiConfigured} aria-expanded={polishMenuOpen} aria-haspopup="dialog" aria-controls="polish-extra-popover" aria-label="带本次额外要求润色" title="带本次额外要求润色"><ChevronDown size={14} /></button>
    {polishMenuOpen && <div ref={polishPopoverRef} id="polish-extra-popover" className="polish-popover" role="dialog" aria-label="本次额外要求"><span className="polish-popover-label">本次额外要求（可选）</span><textarea className="polish-popover-input" value={polishExtra} autoFocus onChange={(event) => setPolishExtra(event.target.value)} placeholder="例如：这次用英文 / 更精简 / 重点突出修复" /><div className="polish-popover-actions"><button type="button" className="polish-popover-cancel" onClick={() => setPolishMenuOpen(false)}>取消</button><button type="button" className="polish-popover-submit" onClick={() => { props.onPolish(polishExtra.trim()); setPolishExtra(""); setPolishMenuOpen(false); }} disabled={polishBlocked || !props.aiConfigured}><Sparkles size={14} />带要求润色</button></div></div>}
  </div>;
}

type ExportActionsProps = {
  props: WorkbenchProps;
  isExporting: boolean;
  exportBlocked: boolean;
  exportConfigured: boolean;
  exportButtonLabel: string;
  exportButtonTitle: string;
  exportMenuOpen: boolean;
  exportMenuButtonRef: RefObject<HTMLButtonElement | null>;
  exportPopoverRef: RefObject<HTMLDivElement | null>;
  setExportMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setPolishMenuOpen: (value: boolean) => void;
  setCopyAsMenuOpen: (value: boolean) => void;
  onExport: (format: ReportExportFormat) => void;
};

function ExportActions({ isExporting, exportBlocked, exportConfigured, exportButtonLabel, exportButtonTitle, exportMenuOpen, exportMenuButtonRef, exportPopoverRef, setExportMenuOpen, setPolishMenuOpen, setCopyAsMenuOpen, onExport }: ExportActionsProps) {
  return <div className={`export-split ${exportConfigured ? "has-menu" : "needs-setup"}`}>
    <button className="preview-save-button" type="button" onClick={() => onExport("markdown")} disabled={exportBlocked} title={exportButtonTitle}>{isExporting ? <Loader2 className="spin" size={15} /> : <FileDown size={15} />}{exportButtonLabel}</button>
    {exportConfigured && <><button ref={exportMenuButtonRef} className="export-split-toggle" type="button" onClick={() => { setPolishMenuOpen(false); setCopyAsMenuOpen(false); setExportMenuOpen((current) => !current); }} disabled={exportBlocked} aria-expanded={exportMenuOpen} aria-haspopup="menu" aria-controls="report-export-menu" aria-label="选择导出格式" title="选择导出格式"><ChevronDown size={14} /></button>{exportMenuOpen && <div ref={exportPopoverRef} id="report-export-menu" className="export-popover" role="menu" aria-label="导出格式">{(["markdown", "docx", "pdf"] as ReportExportFormat[]).map((format) => <button key={format} type="button" className="export-option" role="menuitem" onClick={() => onExport(format)}><FileText size={15} /><span><strong>{format === "markdown" ? "Markdown" : format === "docx" ? "Word 文档" : "PDF"}</strong><em>{format === "markdown" ? ".md · 适合复制和继续编辑" : format === "docx" ? ".docx · 适合提交和归档" : ".pdf · 适合发送和留档"}</em></span></button>)}</div>}</>}
  </div>;
}

type CopyActionsProps = {
  props: WorkbenchProps;
  isInteracting: boolean;
  interactionBlocked: boolean;
  copyAsMenuOpen: boolean;
  copyMenuButtonRef: RefObject<HTMLButtonElement | null>;
  copyPopoverRef: RefObject<HTMLDivElement | null>;
  setCopyAsMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setPolishMenuOpen: (value: boolean) => void;
  setExportMenuOpen: (value: boolean) => void;
};

function CopyActions({ props, isInteracting, interactionBlocked, copyAsMenuOpen, copyMenuButtonRef, copyPopoverRef, setCopyAsMenuOpen, setPolishMenuOpen, setExportMenuOpen }: CopyActionsProps) {
  return <div className="copy-split">
    <button className="preview-copy-button" type="button" onClick={props.onCopy} disabled={!props.previewText || interactionBlocked}>{isInteracting ? <Loader2 className="spin" size={15} /> : <Clipboard size={15} />}{isInteracting ? "复制中" : "复制"}</button>
    {props.previewText && <><button ref={copyMenuButtonRef} className="copy-split-toggle" type="button" onClick={() => { setPolishMenuOpen(false); setExportMenuOpen(false); setCopyAsMenuOpen((current) => !current); }} disabled={interactionBlocked} aria-expanded={copyAsMenuOpen} aria-haspopup="menu" aria-controls="report-copy-menu" aria-label="复制为其他格式" title="复制为其他格式"><ChevronDown size={14} /></button>{copyAsMenuOpen && <div ref={copyPopoverRef} id="report-copy-menu" className="copy-as-popover" role="menu" aria-label="复制格式">{REPORT_FORMAT_PRESETS.filter((p) => p.id !== "default").map((preset) => <button key={preset.id} type="button" className="export-option" role="menuitem" onClick={() => { const converted = convertMarkdownTo(props.previewText, preset.id as IMFormatPresetId); navigator.clipboard.writeText(converted); setCopyAsMenuOpen(false); }}><Clipboard size={15} /><span><strong>{preset.name}</strong><em>{preset.description}</em></span></button>)}</div>}</>}
  </div>;
}
