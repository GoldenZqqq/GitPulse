# GitPulse Progress

## Current Phase

P3 product experience.

GitPulse is already usable as a local-first desktop report generator. P0 reliability, P1 report usefulness, and P2 Git accuracy work remain tracked, while the active product work now focuses on report reuse, richer exports, clearer diagnostics, and smoke verification.

## Completed Before This Phase

- Tauri 2 desktop app with React and Rust.
- Local workspace scanning and commit extraction.
- Daily, custom range, and previous-month report generation.
- Project mapping, including Excel template import/export.
- Optional AI polishing through OpenAI-compatible, Anthropic Native, and ChatGPT Codex OAuth providers.
- Multiple workspace roots, disabled repository filtering, theme settings, and Windows updater flow.

## Completed In This Phase

- [x] Stop persisting raw API keys in browser storage while still allowing environment-variable references.
- [x] Persist direct API keys through the OS credential store so users do not need to re-enter them.
- [x] Recover safely from corrupted local settings JSON.
- [x] Improve Git repository detection for worktree-style `.git` files.
- [x] Normalize collected commits with stable ordering and duplicate removal.
- [x] Add targeted Rust tests for the new behavior.
- [x] Add user-facing diagnostics for missing Git, invalid output directories, and missing environment variables.
- [x] Add a production Tauri CSP instead of disabling CSP.
- [x] Move ChatGPT Codex OAuth login state to the OS credential store with legacy JSON migration.
- [x] Add the Report Assistant: a read-only conversational tool (`run_report_agent`) with bounded context, a bounded tool loop over current report / commit evidence / explicitly selected history, and report patches routed through a review comparison before acceptance.
- [x] Add local Markdown editing of reports with reset / restore-pre-edit controls and an "已编辑" marker.
- [x] Add context privacy for the assistant: evidence and history are opt-in, selection changes reset the conversation with a `role="status"` notice, and conversation stays volatile (never persisted).
- [x] Upgrade the period picker to calendar / month-grid popovers for daily, weekly, and monthly previews.
- [x] Fix the AppImage `.DirIcon` absolute symlink (Tauri CLI 2.11.2 → 2.12.0), add `bundle.category`, and a release workflow check that verifies the AppDir contract.
- [x] Fix Anthropic truncation: raise `max_tokens` with a fallback, surface `stop_reason`/`finish_reason` truncation as a readable error, and pass AI provider error causes through instead of hiding them behind "连接失败".

## Verification

- `npm run build`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo check`
- `npm run tauri:build:release` with updater signing environment

## Completed In P1

- [x] Add weekly report generation with project grouping, AI polishing, export, and progress tracking.
- [x] Add arbitrary month selection for monthly reports, including AI polishing and export through the period report flow.
- [x] Hide the report template profile selector and stop applying hidden profile instructions; style control now stays in AI polishing instructions.
- [x] Add optional evidence details for report items, including repository, branch, date, hash, and original commit message.
- [x] Cache repository indexes between runs and add manual rescanning.

## Completed In P2

- [x] Improve branch attribution when extracting all branches by using Git source refs.
- [x] Add configurable merge commit, revert commit, and bot author filters.
- [x] Add repository scan progress and cancellation.
- [x] Reuse the indexed repository list during report generation and extract commits with bounded parallel workers.
- [x] Move report period selection into the report action bar with daily date, weekly week, monthly month, and custom range controls.
- [x] Add local report history with reopen, copy, regenerate, export-path tracking, and AI-polished markers.

## Completed In P3

- [x] Increase the default desktop window height and compact short-window report history so the report preview remains usable.
- [x] Add manual Word document export alongside Markdown export for generated reports.
- [x] Add PDF export with system CJK font embedding and Markdown-aware report layout.
- [x] Add a settings diagnostics panel for Git, workspace roots, repository indexes, output directories, AI credentials, and PDF font readiness.
- [x] Add a command-flow smoke test that creates a temporary Git repo, extracts a commit, generates a weekly report, and saves Markdown output.
- [x] Add a zero-dependency frontend smoke guard for diagnostics tab wiring and report export controls.
- [x] Extend diagnostics with GitHub network and updater manifest reachability checks.
- [x] Ignore local Codex config files while keeping project-level `.codex/skills` available for sharing.
- [x] Add `verify:release` / `release:check` scripts to run frontend smoke, build, Rust checks, diff checks, and release dry-run together.
- [x] Add browser-level Playwright e2e coverage for onboarding, diagnostics, report export, and report history flows with mocked Tauri runtime support.
- [x] Expand browser-level e2e coverage to weekly and monthly report generation, preview, export, and history marking.
- [x] Extract report orchestration and the parallel commit-extraction pipeline out of `lib.rs` into a dedicated `commit_pipeline` module, leaving `lib.rs` as a thin Tauri IPC transport layer.
- [x] Support multi-author and all-author commit extraction: comma-separated authors are OR-matched, and a blank author no longer yields an empty report.
- [x] Align the author diagnostics with the all-author semantics and flag Git versions below 2.4 in the diagnostics panel so stale `git` no longer silently drops commits.

## Next Backlog

### P3 Product Experience

- Expand browser-level e2e coverage to AI settings and updater flows on top of the new mock harness.
- Group rendered reports by author when multiple (or all) authors are selected, so team weekly reports read naturally.
- Surface a hint in the UI when an empty report is caused by no matching commits versus misconfigured workspace/author.
- Extract the `report.rs` rendering, template, and persistence responsibilities into smaller modules now that the orchestration layer is separated.
- Extract App / SettingsDialog state orchestration into smaller testable modules now that end-to-end coverage exists.

## Notes

- Keep local Git and filesystem work in Rust commands.
- Do not reintroduce Python runtime dependencies on `main`.
- Do not persist raw API keys in plain app settings; use OS-backed secure storage or environment variables.
- Treat ChatGPT Codex OAuth as optional and brittle because it depends on a non-public backend path.
