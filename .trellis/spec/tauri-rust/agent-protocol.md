# Agent Protocol Spec

> Covers the `run_report_agent` Tauri command, serde contracts, tool-loop design, and privacy enforcement at the Rust layer.

---

## Scenario: run_report_agent cross-layer contract

### 1. Scope / Trigger

Any change to `src-tauri/src/agent.rs`, `agent/` sub-modules, the `AgentRequest` / `AgentResponse` types in `models.rs`, or any cross-layer payload between `useReportAgent` and the Rust command.

### 2. Signatures

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn run_report_agent(options: AgentOptions, ...) -> Result<AgentResponse, String>

// src-tauri/src/models.rs
pub struct AgentOptions { ... }   // camelCase serde from frontend JSON
pub struct AgentResponse { ... }  // camelCase serde to frontend
pub enum AgentActionKind { ... }  // snake_case serde
```

### 3. Contracts

#### serde naming rules — DO NOT MIX

| Type | serde attribute | Produces |
|------|----------------|---------|
| `AgentActionKind` | `rename_all = "snake_case"` | `"answer"`, `"tool_call"`, `"report_patch"` |
| `AgentResponse` | `rename_all = "camelCase"` | `toolTrace`, `patch`, `answer` |
| `AgentOptions` / `AgentEvidence` / `AgentHistoryItem` | `rename_all = "camelCase"` | `projectName`, `branchName`, `periodLabel`, `reportText` |

The frontend `parseAgentResponse` checks `value.toolTrace` (camelCase). If the serde attribute on `AgentResponse` is changed, the frontend check must change in the same commit.

#### Context privacy — enforced at both layers

- `AgentOptions.context.history` is an array of `AgentHistoryItem`. It is **empty by default**; only items whose IDs appear in `options.selection.historyIds` (an explicit opt-in list) are populated by `buildReportAgentOptions` in the frontend.
- `AgentOptions.context.evidence` is similarly empty by default; only populated when `options.selection.evidence === true`.
- The Rust `build_prompt` function sends **counts only** in the initial system message; actual content is only materialized when the model calls the `current_report` / `evidence_items` tools.

#### Tool loop design

- The tool loop is **read-only**: tools expose existing data (current report text, evidence commits); they never write to disk, update history, or mutate app state.
- Tool execution is bounded: the loop has a hard step limit. A model that calls tools in a cycle will hit the limit and return an error rather than loop forever.

### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| `aiEnabled` is false in settings | Command returns an error string; frontend shows alert |
| Model API call fails (network / auth) | `Err(String)` returned; frontend preserves draft and restores question input |
| Malformed model JSON (no `answer` field) | `AgentResponse { answer: None, patch: None, toolTrace: [] }` — treated as `malformed` failure |
| Tool loop exceeds step limit | Returns partial `answer` with a warning in `toolTrace` |

### 5. Good / Base / Bad Cases

**Good** — normal round trip:
```
options.context.history = []          // default: no history
options.selection.evidence = false    // default: no evidence
→ AgentResponse { answer: "...", patch: null, toolTrace: ["current_report"] }
```

**Base** — user selects a history entry:
```
options.context.history = [{ title, periodLabel, reportText }]
→ model sees historical text via tool; returns answer
```

**Bad** — never populate `history` unconditionally:
```typescript
// WRONG — sends all history items regardless of selection
context: { history: allEntries, ... }

// CORRECT — respect the explicit opt-in list
context: { history: selectedEntries, ... }
```

### 6. Tests Required

- Rust unit tests in `agent/workflow_tests.rs`: verify prompt builder includes only selected history, tool-loop step limit, `AgentActionKind` serialization values.
- E2E `tests/e2e/report-agent.spec.ts`: `calls(page)[n].args.options.context.history` assertion for default-empty and explicit-selection cases.

### 7. Wrong vs Correct

#### Wrong — mixing serde attributes
```rust
#[serde(rename_all = "camelCase")]
pub enum AgentActionKind { Answer, ToolCall, ReportPatch }
// produces "Answer", "ToolCall" — model prompt says "answer", "tool_call" → parse fails
```

#### Correct
```rust
#[serde(rename_all = "snake_case")]
pub enum AgentActionKind { Answer, ToolCall, ReportPatch }
// produces "answer", "tool_call", "report_patch" — matches SYSTEM_PROMPT instructions
```
