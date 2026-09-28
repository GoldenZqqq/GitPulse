# Report Agent Frontend Spec

> Covers `useReportAgent`, `ReportAgentPanel`, `ReportEditor`, and the integration contracts between them and `useReportWorkflow`.

---

## Scenario: Agent context privacy and volatile conversation

### 1. Scope / Trigger

Any change to `useReportAgent`, `buildReportAgentOptions`, `ReportAgentPanel`, or how conversation history is stored.

### 2. Signatures

```typescript
// src/hooks/useReportAgent.ts
function useReportAgent(params: {
  identity: string;          // changes here reset the conversation
  aiSettings: AiSettings;
  onReview: (patch: AgentPatch, sourceText: string) => void;
}): { turns, pending, send, reset, cancel }

// src/model/report-agent.ts
function buildReportAgentOptions(
  reportEntry: ReportHistoryEntry,
  question: string,
  conversation: AgentTurn[],
  selection: AgentContextSelection,   // { evidence: boolean; historyIds: string[] }
  allHistory: ReportHistoryEntry[],
): AgentOptions
```

### 3. Contracts

#### Conversation is volatile-only

`turns` lives in `useState` exclusively. No `localStorage.setItem`, no `save_report_history` call, no Tauri store write. Verified by asserting `localStorage` does not contain user message text after a round trip.

#### Context selection is opt-in, never implicit

`buildReportAgentOptions` populates:
- `context.evidence` only when `selection.evidence === true`
- `context.history` only for entries whose `id` appears in `selection.historyIds`

Default `selection` in `ReportAgentPanel` is `{ evidence: false, historyIds: [] }`. Changing the selection clears the displayed conversation (`agent.clear()` is called from `selectContext`), because a deselected history entry must not keep traveling inside the already-sent conversation. When a reset actually dropped turns, the composer shows a `role="status"` notice `上下文选择已变更，已开始新对话` so the emptying is explained instead of silent.

The same reset applies whenever the report, AI destination, model, or redaction setting changes: those effects restore the default `selection`, drop `consent`, and hide the notice.

#### Identity dependency resets conversation

`useReportAgent` receives an `identity` string derived from `reportEntry.id + aiEnabled + aiProvider + aiModel + aiBaseUrl`. The `useEffect` that wires the agent is keyed on `identity`; when it changes (user switches to a different report, or AI settings change), `reset()` is called automatically.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| `answer` is `null` in response | `malformed` error; draft is not modified; question input retains its text; send button re-enabled |
| Tauri command throws | `connection` error; same draft/input preservation |
| Agent call resolves after report switch | Response is discarded; the stale `identity` check in the callback drops it |
| User sends while another call is in flight | Send button disabled while `pending === true` |

### 5. Good / Base / Bad Cases

**Good** — sending with no context selection:
```typescript
selection = { evidence: false, historyIds: [] }
// context.history = [], context.evidence = []
// frontend never leaks history data by default
```

**Good** — on error, draft is unchanged:
```typescript
// agentError scenario: reportHistoryStore[0].reportText === original after the call
```

**Bad** — never write conversation to storage:
```typescript
// WRONG
localStorage.setItem("agent-turns", JSON.stringify(turns));

// CORRECT — turns live only in useState, gone on navigation or reset
```

### 6. Tests Required

`tests/e2e/report-agent.spec.ts` covers:
- Default context sends `history: []` and `evidence: []`
- Explicit history selection sends only the selected entry
- Uncheck clears conversation (selection-change reset) and surfaces the `上下文选择已变更，已开始新对话` notice
- Error cases preserve draft text and question input
- Stale response after report switch is discarded
- `localStorage` does not contain question text after a round trip

### 7. Wrong vs Correct

#### Wrong — persisting conversation
```typescript
useEffect(() => {
  localStorage.setItem("agent-conversation", JSON.stringify(turns));
}, [turns]);
```

#### Correct — volatile only
```typescript
const [turns, setTurns] = useState<AgentTurn[]>([]);
// no persistence side-effect
```

---

## Scenario: Patch acceptance routes through existing review panel

### 1. Scope / Trigger

Any change to how agent patch results are applied, or how `reviewAgentPatch` integrates with `useReportWorkflow`.

### 2. Signatures

```typescript
// useReportWorkflow.ts
function reviewAgentPatch(patch: AgentPatch, sourceText: string): void
// → calls setPolishReview({ originalText: sourceText, polishedText: patch.content, ... })

function acceptPolishReview(): void
// → writes to report history store; sets aiEnhanced: true

function rejectPolishReview(): void
// → clears polishReview; original draft unchanged
```

### 3. Contracts

- `reviewAgentPatch` never directly assigns to the active draft text. It creates a `ReportPolishReview` value and calls `setPolishReview`.
- The user must explicitly call `acceptPolishReview` (via the "接受润色" button) before the history entry is updated.
- `acceptPolishReview` preserves all Git-derived statistics (`commitCount`, `projectCount`, `projects`) from the original entry.
- Rejecting or navigating away without accepting leaves `reportHistoryStore[0].reportText` unchanged.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Patch received, user rejects | `reportHistoryStore` entry unchanged; `polishReview` cleared |
| Patch received, user accepts | Entry updated with `patch.content`; `aiEnhanced: true`; original snapshot preserved in undo history |
| No patch in response (`patch: null`) | No "查看修改对照" button shown; answer displayed in panel only |

---

## Scenario: Period picker must not reset a displayed report

### 1. Scope / Trigger

Any change to `changeWeeklyWeek`, `changeMonthlyMonth`, or any other picker handler in `useReportWorkflow`.

### 2. Contract

`changeWeeklyWeek` and `changeMonthlyMonth` update the picker state (the date that will be used for the *next* generation). They must **not** call `resetDraft`.

Calling `resetDraft` from a picker handler clears `weeklyReport` / `monthlyReport`, erasing a report the user is currently viewing when they click a "本周"/"本月" shortcut.

```typescript
// WRONG
function changeWeeklyWeek(week: string) {
  setWeeklyWeek(week);
  resetDraft("weekly");   // ← clears the currently displayed report
}

// CORRECT
function changeWeeklyWeek(week: string) {
  setWeeklyWeek(week);
  // period picker change only stages parameters for the next generation
}
```

`resetDraft` is called only when the user explicitly triggers a new generation (e.g., clicking "生成周报"), not on picker value changes.

---

## Scenario: Local edit preserves Git-derived statistics

### 1. Scope / Trigger

Any change to `saveManualEdit` or the local editing flow in `useReportWorkflow`.

### 2. Contract

`saveManualEdit` must copy `commitCount`, `projectCount`, and `projects` from `currentDraftSnapshot()`. It must not recalculate or zero out these values.

```typescript
// CORRECT
const snap = currentDraftSnapshot();
const updated: ReportHistoryEntry = {
  ...snap,
  id: createHistoryId(),
  reportText: editedText,
  generatedAt: new Date().toISOString(),
  // commitCount, projectCount, projects inherited from snap
};
```

This ensures the "已编辑" badge appears but the commit statistics in the history list remain accurate.
