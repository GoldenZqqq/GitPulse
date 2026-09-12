# Implementation Plan

1. Add bounded shared agent models, serde guards, provider-neutral AI JSON completion, Rust read-only tool loop, command registration, and focused Rust tests.
2. Mirror protocol types/builders in the frontend and add `useReportAgent` with volatile history, context consent, cancellation-by-task conflict, and error handling.
3. Add `ReportAgentPanel` and connect it to the report canvas; preserve existing report-stage action ordering and review acceptance semantics.
4. Add local Markdown editing with undo/revert markers in the workflow owner, then connect agent patches to the existing review UI.
5. Add responsive/theme/a11y styles and targeted Playwright coverage for normal, empty, failed, context-consent, patch-review and keyboard paths.
6. Update README/CONTEXT/PROGRESS with the agent boundary and product review findings.
7. Run frontend build, focused and full e2e, Rust format/check/test, frontend smoke and diff checks. Review cross-layer payloads before any commit.

## Current Progress

- Completed: additive Agent protocol, provider reuse, read-only tool loop, assistant panel, local editor, initial regression cases.
- In progress: repair and extend regression coverage, review context privacy and report snapshot consistency.
- Pending: desktop/theme/keyboard inspection, product review and roadmap, documentation/spec updates, full verification and real WebView smoke.
- Previous test run: all 11 Agent UI cases stopped in setup because history fixtures omitted required mode/period fields. Correct the fixtures before attributing failures to product behavior.

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
