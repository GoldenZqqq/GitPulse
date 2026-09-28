import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildReportAgentOptions, parseAgentResponse, validateAiConnectionSettings,
  type AgentContextSelection, type AgentPatch, type AgentTurn, type AppSettings,
  type CommitRecord, type ReportHistoryEntry } from "../model";

type Params = {
  settings: AppSettings;
  reportText: string;
  reportIdentity: string;
  commits: CommitRecord[];
  history: ReportHistoryEntry[];
  runTask: (input: { kind: "agent"; label: string; task: () => Promise<void>; validate: () => void }) => Promise<unknown>;
  setStatus: (text: string) => void;
  onReview: (patch: AgentPatch, sourceText: string) => void;
};

export type ReportAgentController = ReturnType<typeof useReportAgent>;

export function useReportAgent(params: Params) {
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const running = useRef(false);
  const clear = useCallback(() => { epoch.current += 1; setTurns([]); setError(""); }, []);
  const identity = `${params.reportIdentity}|${params.settings.aiProvider}|${params.settings.aiBaseUrl}|${params.settings.aiModel}|${params.settings.aiEnabled}|${params.settings.redactionEnabled}`;
  useEffect(() => { clear(); }, [identity, clear]);
  useEffect(() => () => { epoch.current += 1; }, []);

  async function ask(message: string, selection: AgentContextSelection) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    const requestEpoch = epoch.current;
    let sent = false;
    let completed = false;
    try {
      validateAiConnectionSettings(params.settings);
      const options = buildReportAgentOptions({ ...params, message, conversation: turns, selection });
      await params.runTask({ kind: "agent", label: "报告助手正在处理", validate: () => undefined, task: async () => {
        sent = true;
        let response;
        try { response = parseAgentResponse(await invoke<unknown>("run_report_agent", { options })); }
        catch (failure) {
          if (requestEpoch === epoch.current) setError(failure instanceof Error ? failure.message : String(failure));
          throw failure;
        }
        if (requestEpoch !== epoch.current) { params.setStatus("报告助手请求已结束，已丢弃旧上下文结果"); return; }
        completed = true;
        setTurns((current) => {
          const userTurn: AgentTurn = { role: "user", content: message };
          const assistantTurn: AgentTurn = {
            role: "assistant", content: response.answer || response.patch?.reason || "修改建议已准备",
            response, sourceText: params.reportText,
          };
          return [...current, userTurn, assistantTurn].slice(-10);
        });
        params.setStatus("报告助手已回复");
      } });
      if (!sent) setError("当前报告任务尚未结束，请稍后重试");
      return completed;
    } catch (failure) {
      if (requestEpoch === epoch.current) setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function review(turn: AgentTurn) {
    if (turn.response?.patch && turn.sourceText !== undefined) params.onReview(turn.response.patch, turn.sourceText);
  }

  return { turns, busy, error, ask, clear, review };
}
