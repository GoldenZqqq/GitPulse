import type { AppSettings, CommitRecord, ReportHistoryEntry } from "./types";
import { buildAiOptions } from "./report-options";

export const AGENT_MESSAGE_LIMIT = 4_000;
export const AGENT_REPORT_LIMIT = 20_000;
export const AGENT_HISTORY_LIMIT = 6;
export const AGENT_CONVERSATION_LIMIT = 12;
export const AGENT_EVIDENCE_LIMIT = 80;
export type AgentMessage = { role: "user" | "assistant"; content: string };
export type AgentPatch = { mode: "replace" | "append" | "rewrite"; content: string; reason: string };
export type AgentResponse = { answer: string; patch: AgentPatch | null; toolTrace: string[] };
export type AgentContextSelection = { evidence: boolean; historyIds: string[] };
export type AgentTurn = AgentMessage & { response?: AgentResponse; sourceText?: string };

type AgentRequestInput = {
  settings: AppSettings;
  message: string;
  conversation: AgentMessage[];
  reportText: string;
  commits: CommitRecord[];
  history: ReportHistoryEntry[];
  selection: AgentContextSelection;
};

export function buildReportAgentOptions(input: AgentRequestInput) {
  const { settings, message, reportText, commits, history, selection } = input;
  if (!message.trim()) throw new Error("请输入问题或修改要求");
  if (Array.from(message).length > AGENT_MESSAGE_LIMIT) throw new Error("问题最多 4000 个字符");
  if (!reportText.trim()) throw new Error("请先生成报告");
  if (Array.from(reportText).length > AGENT_REPORT_LIMIT) throw new Error("当前报告超过 20000 字，请缩小报告范围");
  if (selection.evidence && commits.length > AGENT_EVIDENCE_LIMIT) throw new Error("提交证据超过 80 条，请缩小报告周期或取消附加证据");
  if (selection.evidence && settings.redactionEnabled) throw new Error("脱敏模式不附加原始提交证据，请确认当前报告正文后发送");
  if (selection.historyIds.length && settings.redactionEnabled) throw new Error("脱敏设置已开启，请取消附加历史报告");
  if (selection.historyIds.length > AGENT_HISTORY_LIMIT) throw new Error("最多选择 6 份历史报告");
  return {
    message: message.trim(),
    conversation: input.conversation.slice(-AGENT_CONVERSATION_LIMIT).map(({ role, content }) => ({ role, content })),
    context: {
      reportText,
      evidence: selection.evidence ? commits.map(({ projectName, branchName, date, hash, message: commitMessage }) => ({ projectName, branchName, date, hash, message: commitMessage })) : [],
      history: history.filter((entry) => selection.historyIds.includes(entry.id)).map(({ title, periodLabel, reportText: text }) => ({ title, periodLabel, reportText: text })),
    },
    ai: buildAiOptions(settings, true),
  };
}

export function parseAgentResponse(value: unknown): AgentResponse {
  if (!isRecord(value) || typeof value.answer !== "string" || !Array.isArray(value.toolTrace)) throw new Error("报告助手响应格式不正确");
  if (Array.from(value.answer).length > AGENT_MESSAGE_LIMIT) throw new Error("报告助手回答过长");
  if (value.toolTrace.length > 5 || !value.toolTrace.every((tool) => ["current_report", "current_evidence", "selected_history"].includes(tool))) throw new Error("报告助手工具记录不正确");
  const patch = value.patch === null ? null : parseAgentPatch(value.patch);
  if (!value.answer.trim() && !patch) throw new Error("报告助手返回空内容");
  return { answer: value.answer, toolTrace: value.toolTrace, patch };
}

function parseAgentPatch(value: unknown): AgentPatch {
  if (!isRecord(value) || typeof value.content !== "string" || typeof value.reason !== "string") throw new Error("报告助手修改内容不正确");
  if (value.mode !== "replace" && value.mode !== "append" && value.mode !== "rewrite") throw new Error("报告助手修改类型不正确");
  if (!value.content.trim() || Array.from(value.content).length > AGENT_REPORT_LIMIT) throw new Error("报告助手修改内容为空或过长");
  if (Array.from(value.reason).length > 1_000) throw new Error("报告助手修改说明过长");
  return { mode: value.mode, content: value.content, reason: value.reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyAgentPatch(original: string, patch: AgentPatch) {
  const result = patch.mode === "append" ? `${original.trimEnd()}\n\n${patch.content.trim()}` : patch.content;
  if (Array.from(result).length > AGENT_REPORT_LIMIT) throw new Error("修改后的报告超过 20000 个字符");
  return result;
}
