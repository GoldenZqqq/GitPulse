import { FileCheck2, Loader2, MessageSquare, Plus, Send, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENT_HISTORY_LIMIT, AGENT_MESSAGE_LIMIT, type AgentContextSelection } from "../model";
import { taskCanStart } from "../hooks/useTaskActivity";
import type { WorkbenchProps } from "./Workbench.types";
import { MarkdownPreview } from "./MarkdownPreview";
import "../styles/report-agent.css";

const TOOL_NAMES: Record<string, string> = { current_report: "读取当前报告", current_evidence: "检索提交证据", selected_history: "读取所选历史" };

export function ReportAgentPanel({ workbench: props, locked }: { workbench: WorkbenchProps; locked: boolean }) {
  const { agent } = props;
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [selection, setSelection] = useState<AgentContextSelection>({ evidence: false, historyIds: [] });
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blocked = agent.busy || locked || !taskCanStart(props.activeTasks, "agent");
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [agent.turns, agent.busy]);
  useEffect(() => { setConsent(false); }, [props.activeHistoryId, props.aiDestination, props.aiModel]);
  function selectContext(next: AgentContextSelection) { setSelection(next); }
  async function submit() { if (!consent || blocked || !message.trim()) return; if (await agent.ask(message, selection)) setMessage(""); }
  if (!props.aiConfigured) return <section className="agent-unconfigured"><MessageSquare size={28} /><h3>报告助手</h3><p>配置 AI 服务后，可自动润色、分析和改写报告内容</p><button type="button" onClick={props.onOpenSettings}><Settings2 size={15} />配置 AI</button></section>;
  return <section className="report-agent" aria-label="报告助手对话">
    <header className="agent-header"><span title={props.aiModel}>{props.aiModel}</span><button type="button" className="agent-icon" aria-label="新建对话" title="新建对话" disabled={agent.busy || agent.turns.length === 0} onClick={agent.clear}><Plus size={16} /></button></header>
    <AgentContextControls props={props} selection={selection} disabled={blocked} onChange={selectContext} />
    <div className="agent-log" role="log" aria-label="助手消息" aria-live="polite" tabIndex={0} ref={logRef}>
      {agent.turns.length === 0 && <div className="agent-empty"><MessageSquare size={28} /><h3>报告助手</h3><span>分析当前 {props.commitCount} 个提交 · {props.projectCount} 个项目</span><div className="agent-prompts">{["哪些结论还缺少证据？", "精简为三条工作要点", "把当前报告翻译成英文"].map((text) => <button key={text} type="button" onClick={() => { setMessage(text); inputRef.current?.focus(); }}>{text}</button>)}</div></div>}
      {agent.turns.map((turn, index) => <article className={`agent-message ${turn.role}`} key={index}>
        <strong>{turn.role === "user" ? "你" : "报告助手"}</strong><div className="agent-message-text">{turn.role === "assistant" ? <MarkdownPreview markdown={turn.content} emptyText="" /> : turn.content}</div>
        {turn.response?.toolTrace.length ? <ul className="agent-tool-trace">{turn.response.toolTrace.map((tool, toolIndex) => <li key={`${tool}:${toolIndex}`}><ShieldCheck size={12} />{TOOL_NAMES[tool]}</li>)}</ul> : null}
        {turn.response?.patch && <button type="button" className="agent-review-action" disabled={blocked || turn.sourceText !== props.previewText} onClick={() => agent.review(turn)}><FileCheck2 size={14} />查看修改对照</button>}
      </article>)}
      {agent.busy && <div className="agent-pending" role="status"><Loader2 size={14} className="spin" />正在处理请求</div>}
    </div>
    <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {agent.error && <p className="agent-error" role="alert">{agent.error}</p>}
      <label className="agent-consent"><input type="checkbox" checked={consent} disabled={blocked} onChange={(event) => setConsent(event.target.checked)} /><span>同意向所选 AI 服务发送当前报告与对话历史</span></label>
      <label className="sr-only" htmlFor="agent-question">问题或修改要求</label>
      <textarea ref={inputRef} id="agent-question" value={message} disabled={blocked} maxLength={AGENT_MESSAGE_LIMIT} onChange={(event) => setMessage(event.target.value)} placeholder="问题或修改要求" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
      <div className="agent-composer-footer"><span>{message.length}/{AGENT_MESSAGE_LIMIT}</span><button type="submit" aria-label="发送给报告助手" title="发送给报告助手" disabled={blocked || !consent || !message.trim()}><Send size={16} /></button></div>
    </form>
  </section>;
}

function AgentContextControls({ props, selection, disabled, onChange }: { props: WorkbenchProps; selection: AgentContextSelection; disabled: boolean; onChange: (value: AgentContextSelection) => void }) {
  const histories = props.reportHistory.filter((entry) => entry.id !== props.activeHistoryId);
  function toggleHistory(id: string, checked: boolean) {
    onChange({ ...selection, historyIds: checked ? [...selection.historyIds, id] : selection.historyIds.filter((value) => value !== id) });
  }
  return <details className="agent-context"><summary><ShieldCheck size={13} /><span>发送内容</span><span>{selection.evidence ? "含提交证据" : "当前报告"}{selection.historyIds.length ? ` + ${selection.historyIds.length} 份历史` : ""}</span></summary>
    <div className="agent-context-body"><dl><dt>服务地址</dt><dd>{props.aiDestination}</dd><dt>当前报告</dt><dd>{props.previewText.length} 字符（含正文已有证据与补充事项）</dd></dl>
      <details><summary>报告正文</summary><pre>{props.previewText}</pre></details>
      <label><input type="checkbox" checked={selection.evidence} disabled={disabled || props.agentEvidenceCount === 0 || props.redactionEnabled} onChange={(event) => onChange({ ...selection, evidence: event.target.checked })} />附加提交证据 ({props.agentEvidenceCount})</label>
      {props.redactionEnabled && <p>脱敏设置已开启，原始附加上下文已禁用</p>}
      <fieldset disabled={disabled || props.redactionEnabled}><legend>附加历史报告 ({selection.historyIds.length}/{AGENT_HISTORY_LIMIT})</legend><div className="agent-history-options">{histories.map((entry) => <label key={entry.id}><input type="checkbox" checked={selection.historyIds.includes(entry.id)} disabled={!selection.historyIds.includes(entry.id) && selection.historyIds.length >= AGENT_HISTORY_LIMIT} onChange={(event) => toggleHistory(entry.id, event.target.checked)} /><span>{entry.title}</span></label>)}{histories.length === 0 && <span>暂无其他历史报告</span>}</div></fieldset>
    </div>
  </details>;
}
