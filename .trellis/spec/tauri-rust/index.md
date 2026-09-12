# Tauri Rust Development Guidelines

> Rust backend guidelines for GitPulse.

## Overview

Rust owns local Git scanning, commit extraction, report rendering/export, optional AI integration, diagnostics, and secure storage. `src-tauri/src/lib.rs` exposes Tauri commands as thin transport wrappers around domain modules.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Command Boundaries](./command-boundaries.md) | Tauri command and module ownership | Filled |
| [Report History Storage](./report-history-storage.md) | Versioned local history, migration, recovery, and IPC contract | Filled |
| [Configuration Profiles](./config-profile-io.md) | Versioned shareable config and bounded file I/O contract | Filled |
| [Project Retrospective Attribution](./project-retrospective.md) | Structured project attribution, history compatibility, and retrospective projection | Filled |
| [Workspace Performance Benchmark](./workspace-benchmark.md) | Offline synthetic workspace profiles, JSON results, thresholds, and cleanup safety | Filled |
| [Privacy-Safe Support Bundle](./support-bundle.md) | Local redacted snapshot, fixed ZIP entries, event bounds, and no-upload contract | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Rust verification and safety rules | Filled |
| [Desktop Quality Gates](../frontend/desktop-quality-gates.md) | Real Windows WebView startup and IPC smoke contract | Filled |
| [Release Governance](./release-governance.md) | Main-only source, CI ancestry gate, and draft Release transaction | Filled |
| [Agent Protocol](./agent-protocol.md) | `run_report_agent` serde contracts, tool-loop design, and privacy enforcement | Filled |

## Pre-Development Checklist

- [ ] Decide whether the change belongs in `git_ops`, `commit_pipeline`, `report`, `ai`, diagnostics, secure storage, or a Tauri command wrapper.
- [ ] Check `src-tauri/src/models.rs` for request/response shape changes and mirror them in `src/model.ts`.
- [ ] Preserve local-first behavior and AI failure fallback.
- [ ] Keep user-facing Rust errors in Chinese.
- [ ] For report-history work, follow `report-history-storage.md`; do not write report bodies back to WebView localStorage.
- [ ] For project retrospective work, follow `project-retrospective.md`; generate attribution before persistence and never parse Markdown identity.
- [ ] For scan, extraction, or report hot-path changes, follow `workspace-benchmark.md` and compare a release-mode profile against the recorded baseline.
- [ ] For configuration-profile work, follow `config-profile-io.md`; keep schema validation in one frontend owner and file I/O bounded in Rust.
- [ ] For support-bundle work, follow `support-bundle.md`; export must rebuild through Rust redaction and must never upload automatically.
- [ ] For version, tag, updater, or release workflow changes, follow `release-governance.md`; never build from an unverified branch or publish partial new-release assets.
- [ ] For `run_report_agent` or agent protocol changes, follow `agent-protocol.md`; verify serde attribute consistency between `AgentActionKind` (snake_case) and `AgentResponse` (camelCase), and confirm the tool loop remains read-only.

## Quality Check

- [ ] `cd src-tauri && cargo check` passes for Rust changes.
- [ ] `cd src-tauri && cargo test` passes when behavior changes.
- [ ] Cross-layer payload changes are covered by frontend builders/validators.
- [ ] No plain persisted secrets are introduced.
- [ ] Release workflow changes preserve main ancestry, successful-CI, tag immutability, and draft cleanup contracts.
