# Technical Design

## Boundaries

- `src-tauri/src/models.rs`: define `AgentRequest`, `AgentContext`, `AgentMessage`, `AgentResponse`, `AgentAction` and bounded tool inputs/outputs. All IPC uses camelCase.
- `src-tauri/src/agent.rs`: bounded orchestration loop. It receives a user message plus explicit context, calls the existing provider transport in `ai.rs`, validates one structured action at a time, executes only in-memory read-only tools, and returns a final response with an optional report patch.
- `src-tauri/src/ai.rs`: expose a small provider-neutral JSON chat helper that reuses existing credential, proxy, timeout and provider selection behavior. Existing polishing APIs remain unchanged.
- `src-tauri/src/lib.rs`: register one thin `run_report_agent` command using `spawn_blocking`.
- `src/model/types.ts` / `src/model.ts`: mirror the protocol and provide builders/guards; no raw response casts in components.
- `src/hooks/useReportAgent.ts`: own in-memory conversation, context consent, loading/error state, bounded message history, and command invocation.
- `src/components/ReportAgentPanel.tsx`: present chat, context controls, tool activity, answer and patch actions. Patch acceptance delegates to the existing review contract rather than mutating preview directly.
- `src/components/ReportCanvas.tsx` and `Workbench.types.ts`: expose the panel and editing actions while keeping report-generation ownership in `App.tsx`/`useReportWorkflow`.
- `src/styles/preview.css` / `workbench*.css`: add dense panel layout and responsive rules using current tokens.

## Agent Protocol

The model receives a system policy plus a JSON transcript. Each turn must be one JSON object:

```json
{
  "kind": "answer | tool_call | report_patch",
  "text": "...",
  "tool": "current_report | current_evidence | selected_history",
  "query": "...",
  "patch": {"mode": "replace | append | rewrite", "content": "...", "reason": "..."}
}
```

The Rust loop allows at most 5 model/tool steps and bounds transcript/context sizes. Tool results are derived only from the request's explicit in-memory context. Invalid JSON, unknown tools, empty answers, oversized patches and repeated tool calls are hard errors with the original report preserved.

## Data Flow

1. User opens a generated report and sees the assistant context summary.
2. User optionally enables evidence/history and submits a message.
3. React builds a bounded request from the current draft, selected commits, and selected history entries, then invokes `run_report_agent`.
4. Rust validates context, runs the provider loop, executes read-only tools, and returns answer/tool trace/optional patch.
5. React appends the answer to volatile conversation state. A patch opens `ReportPolishReviewPanel`-compatible review state; accept/reject remains explicit.
6. Local manual edits and accepted patches update the active draft only through the workflow owner and mark the history snapshot as edited without changing Git-derived counts.

## Privacy And Compatibility

- No new secret persistence. The agent uses the existing secure API key lookup and proxy config.
- Context consent is sent per request and never inferred from settings. The default payload excludes commits and history.
- Existing `enhance_report`, blank-day fill, report history and export payloads are unchanged.
- On provider failure, the UI retains the draft and exposes a retry action; there is no automatic fallback that invents an answer.

## Rollback

The feature is additive. Removing the panel and `run_report_agent` registration restores the pre-agent flow; existing report generation and polish commands remain independent. If protocol validation causes incompatibility, disable the panel behind a frontend readiness check while retaining the stable polishing path.
