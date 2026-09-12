import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENT_REPORT_LIMIT } from "../model";
import "../styles/report-agent.css";

type Props = { text: string; onSave: (value: string) => void; onClose: () => void };

export function ReportEditor({ text, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  function close() { if (draft === text || window.confirm("放弃尚未保存的编辑？")) onClose(); }
  return <section className="report-editor" aria-label="Markdown 报告编辑器">
    <div className="report-editor-toolbar"><strong>本地编辑稿</strong><span>{draft.length} 字符</span><button type="button" aria-label="重置本次编辑" title="重置本次编辑" disabled={draft === text} onClick={() => { if (window.confirm("恢复为编辑前内容？")) setDraft(text); }}><RotateCcw size={15} /></button><button type="button" aria-label="取消编辑" title="取消编辑" onClick={close}><X size={15} /></button><button type="button" disabled={!draft.trim() || draft === text} onClick={() => { onSave(draft); onClose(); }}><Check size={15} />保存编辑</button></div>
    <label className="sr-only" htmlFor="report-editor-source">报告 Markdown</label><textarea ref={ref} id="report-editor-source" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={Math.max(text.length, AGENT_REPORT_LIMIT)} spellCheck={false} />
  </section>;
}
