import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENT_REPORT_LIMIT } from "../model";
import "../styles/report-agent.css";

type Props = { text: string; onSave: (value: string) => void; onClose: () => void };
type ConfirmKind = "close" | "reset";

const CONFIRM_COPY: Record<ConfirmKind, string> = {
  close: "放弃尚未保存的编辑？",
  reset: "恢复为编辑前内容？",
};

export function ReportEditor({ text, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(text);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const dirty = draft !== text;
  function requestClose() { if (dirty) setConfirmKind("close"); else onClose(); }
  function commitConfirm() {
    if (confirmKind === "close") onClose();
    else if (confirmKind === "reset") setDraft(text);
    setConfirmKind(null);
  }
  return <section className="report-editor" aria-label="Markdown 报告编辑器">
    <div className="report-editor-toolbar"><strong>本地编辑稿</strong><span>{draft.length} 字符</span><button type="button" aria-label="重置本次编辑" title="重置本次编辑" disabled={!dirty} onClick={() => setConfirmKind("reset")}><RotateCcw size={15} /></button><button type="button" aria-label="取消编辑" title="取消编辑" onClick={requestClose}><X size={15} /></button><button type="button" disabled={!draft.trim() || !dirty} onClick={() => { onSave(draft); onClose(); }}><Check size={15} />保存编辑</button></div>
    {confirmKind && <div className="report-editor-confirm" role="alert" aria-label={CONFIRM_COPY[confirmKind]}>
      <span>{CONFIRM_COPY[confirmKind]}</span>
      <div className="report-editor-confirm-actions">
        <button type="button" onClick={() => setConfirmKind(null)} autoFocus>取消</button>
        <button type="button" className="confirm" onClick={commitConfirm}>确认</button>
      </div>
    </div>}
    <label className="sr-only" htmlFor="report-editor-source">报告 Markdown</label><textarea ref={ref} id="report-editor-source" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={Math.max(text.length, AGENT_REPORT_LIMIT)} spellCheck={false} />
  </section>;
}