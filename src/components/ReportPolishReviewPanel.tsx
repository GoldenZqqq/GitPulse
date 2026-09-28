import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReportPolishReview } from "../model";
import { buildReportDiff, detectPolishFactRisks, type ReportDiffLine } from "../reportDiff";

type Props = {
  review: ReportPolishReview;
  accepting: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export function ReportPolishReviewPanel({ review, accepting, onAccept, onReject }: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const isAgentSuggestion = review.source === "agent";
  const diff = useMemo(
    () => buildReportDiff(review.originalText, review.polishedText),
    [review.originalText, review.polishedText],
  );
  const risks = useMemo(
    () => detectPolishFactRisks(review.originalText, diff.lines),
    [review.originalText, diff.lines],
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || accepting) return;
      event.preventDefault();
      onReject();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accepting, onReject]);

  return (
    <section
      ref={containerRef}
      className="polish-review"
      role="region"
      aria-label={isAgentSuggestion ? "修改建议对照" : "AI 润色对照"}
      aria-describedby="polish-review-guidance"
      data-diff-strategy={diff.strategy}
      tabIndex={-1}
    >
      <ReviewToolbar diff={diff} riskCount={risks.length} accepting={accepting} onAccept={onAccept} onReject={onReject} isAgentSuggestion={isAgentSuggestion} />
      <ComparisonColumns originalText={review.originalText} polishedText={review.polishedText} isAgentSuggestion={isAgentSuggestion} />
      <FactRiskPanel risks={risks} isAgentSuggestion={isAgentSuggestion} />
      <DiffSection lines={diff.lines} strategy={diff.strategy} />
    </section>
  );
}

function ReviewToolbar({ diff, riskCount, accepting, onAccept, onReject, isAgentSuggestion }: {
  diff: ReturnType<typeof buildReportDiff>;
  riskCount: number;
  accepting: boolean;
  onAccept: () => void;
  onReject: () => void;
  isAgentSuggestion: boolean;
}) {
  return (
    <header className="polish-review-toolbar">
      <div>
        <h3>{isAgentSuggestion ? "修改建议对照" : "AI 润色对照"}</h3>
        <p id="polish-review-guidance">{isAgentSuggestion ? "原稿尚未被覆盖。请核对建议改动后再决定是否采用。" : "原稿尚未被覆盖。请核对改动与事实提示后再决定是否接受。"}</p>
      </div>
      <div className="polish-review-summary" aria-label="改动统计">
        <span className="added">+{diff.added} 新增</span>
        <span className="removed">−{diff.removed} 删除</span>
        <span>{diff.unchanged} 未变</span>
        <span className={riskCount > 0 ? "attention" : ""}>{riskCount} 风险</span>
      </div>
      <div className="polish-review-actions">
        <button type="button" className="polish-review-reject" disabled={accepting} onClick={onReject}>
          <RotateCcw size={14} /> {isAgentSuggestion ? "放弃修改" : "保留原稿"}
        </button>
        <button type="button" className="polish-review-accept" disabled={accepting} onClick={onAccept}>
          {accepting ? <Loader2 className="spin" size={14} /> : <Check size={14} />}
          {accepting ? (isAgentSuggestion ? "正在采纳" : "正在接受") : (isAgentSuggestion ? "采纳修改" : "接受润色")}
        </button>
      </div>
    </header>
  );
}

function ComparisonColumns({ originalText, polishedText, isAgentSuggestion }: { originalText: string; polishedText: string; isAgentSuggestion: boolean }) {
  const originalLabel = isAgentSuggestion ? "原文" : "原稿";
  const polishedLabel = isAgentSuggestion ? "建议稿" : "润色稿";
  return (
    <div className="polish-review-columns">
      <section role="region" aria-label={originalLabel}><h4>{originalLabel}</h4><pre>{originalText}</pre></section>
      <section role="region" aria-label={polishedLabel}><h4>{polishedLabel}</h4><pre>{polishedText}</pre></section>
    </div>
  );
}

function DiffSection({
  lines,
  strategy,
}: {
  lines: ReportDiffLine[];
  strategy: ReturnType<typeof buildReportDiff>["strategy"];
}) {
  return (
    <section className="polish-diff" aria-label="行级改动">
      <h4>行级改动</h4>
      {strategy === "bounded-fallback" && (
        <p className="polish-diff-fallback" role="note">
          报告较长，已使用快速对照：保留相同的开头与结尾，中间区域按整段删除和新增展示。
        </p>
      )}
      <div className="polish-diff-list">
        {lines.map((line, index) => <DiffLine key={`${index}:${line.kind}:${line.text}`} line={line} />)}
      </div>
    </section>
  );
}

function FactRiskPanel({ risks, isAgentSuggestion }: { risks: ReturnType<typeof detectPolishFactRisks>; isAgentSuggestion: boolean }) {
  return (
    <section className={`polish-risk-panel ${risks.length > 0 ? "has-risks" : "is-clear"}`} aria-label="事实风险提示">
      <div>
        <AlertTriangle size={15} />
        <strong>启发式风险提示，不等于事实错误</strong>
      </div>
      <p>{isAgentSuggestion ? "请结合提交证据与实际结果人工核对；系统不会自动应用建议稿。" : "请结合提交证据、用户补充事项与实际结果人工核对；系统不会自动删除或修改润色稿。"}</p>
      {risks.length > 0 ? (
        <ul>
          {risks.map((risk) => (
            <li key={`${risk.kind}:${risk.line}`}>
              <strong>{risk.label}</strong>
              <span>{risk.detail}</span>
              <code>{risk.line}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="polish-risk-clear">未检测到新增量化结论或证据删除，仍建议人工快速复核。</p>
      )}
    </section>
  );
}

function DiffLine({ line }: { line: ReportDiffLine }) {
  const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";
  const label = line.kind === "added" ? "新增" : line.kind === "removed" ? "删除" : "未变";
  return (
    <div className={`polish-diff-line ${line.kind}`} aria-label={`${label}：${line.text || "空行"}`}>
      <span className="polish-diff-old-line">{line.oldLine ?? ""}</span>
      <span className="polish-diff-new-line">{line.newLine ?? ""}</span>
      <span className="polish-diff-marker" aria-hidden="true">{marker}</span>
      <code>{line.text || " "}</code>
    </div>
  );
}
