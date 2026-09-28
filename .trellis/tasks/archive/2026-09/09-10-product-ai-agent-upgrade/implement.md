# Implementation Plan

1. Add bounded shared agent models, serde guards, provider-neutral AI JSON completion, Rust read-only tool loop, command registration, and focused Rust tests.
2. Mirror protocol types/builders in the frontend and add `useReportAgent` with volatile history, context consent, cancellation-by-task conflict, and error handling.
3. Add `ReportAgentPanel` and connect it to the report canvas; preserve existing report-stage action ordering and review acceptance semantics.
4. Add local Markdown editing with undo/revert markers in the workflow owner, then connect agent patches to the existing review UI.
5. Add responsive/theme/a11y styles and targeted Playwright coverage for normal, empty, failed, context-consent, patch-review and keyboard paths.
6. Update README/CONTEXT/PROGRESS with the agent boundary and product review findings.
7. Run frontend build, focused and full e2e, Rust format/check/test, frontend smoke and diff checks. Review cross-layer payloads before any commit.

## Current Progress

- Completed: additive Agent protocol, provider reuse, read-only tool loop, assistant panel, local editor, regression coverage, release-governance tests, AppImage AppDir fix, Anthropic truncation fix.
- Final verification on `feat/report-agent-workbench`: `npm run build`, `cargo fmt -- --check`, `cargo check --all-targets`, `cargo test` (150 passed), `npm run test:release-governance` (15/15), full e2e `npx playwright test` (110/110), `git diff --check` clean.
- Post-completion fixes folded in this task:
  - Restored the "selection change resets conversation" contract in `ReportAgentPanel.selectContext`, plus a `role="status"` notice "上下文选择已变更，已开始新对话"; restored `useReportAgent` identity to report + AI-settings; reverted the e2e-red regression.
  - Anthropic `max_tokens` 4096 → 8192 with fallback, added `finish_reason`/`stop_reason` truncation errors, and passed AI provider causes through in `agent.rs`.
- Known gaps (not blocking task completion, tracked separately):
  - Resolved after archiving: the assistant patch review now shows a distinct "修改建议对照 / 采纳修改" frame instead of polish copy, and `ReportEditor` no longer uses native `window.confirm()` (inline confirm instead); the agent context panel dropped its nested scrollbars in favor of a single outer scroller.
  - Period drift: switching period retains the older body while saving/history titles use the new period label.
  - `evidenceByHistory` holds full commit records in memory (default 120 / max 200).
  - Docs (README/CONTEXT/PROGRESS) and `release-notes/v0.8.0.md` are updated in a separate commit; `release-notes/v0.7.2.md` / `v0.7.3.md` are still missing.

## Risky Files

- `src-tauri/src/ai.rs`, `models.rs`, `lib.rs`: protocol and provider compatibility.
- `src/hooks/useReportWorkflow.ts`, `App.tsx`, `ReportCanvas.tsx`: report state and acceptance invariants.
- `src/styles/preview.css`, `workbench-responsive.css`: narrow-window layout.

## Validation Commands

```powershell
npm run build
npm run test:e2e -- tests/e2e/report-agent.spec.ts tests/e2e/workbench.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/responsive-hardening.spec.ts
cd src-tauri; cargo fmt -- --check; cargo check; cargo test
git diff --check
```

## Rollback Points

- Before connecting UI, verify Rust agent protocol tests.
- Before enabling patch acceptance, verify original report remains unchanged on reject/error.
- Before updating docs, verify existing workbench/history tests remain green.
