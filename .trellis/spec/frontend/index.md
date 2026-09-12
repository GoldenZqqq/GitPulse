# Frontend Development Guidelines

> React 19 + Vite frontend guidelines for GitPulse.

---

## Overview

The frontend owns state, layout, validation prompts, preview interactions, and Tauri command invocation. Local Git scanning, report rendering, file export, secure credential storage, and other filesystem work stay behind Rust commands.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks and runtime integration | Filled |
| [State Management](./state-management.md) | Local state, persisted state, derived state | Filled |
| [Settings Migration](./settings-migration.md) | v0.5.x local settings recovery and secure credential handoff | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, verification, forbidden patterns | Filled |
| [Desktop Quality Gates](./desktop-quality-gates.md) | Browser, responsive, accessibility, and real WebView smoke contract | Filled |
| [Type Safety](./type-safety.md) | Type patterns and validation | Filled |
| [Configuration Profiles](../tauri-rust/config-profile-io.md) | Versioned shareable config whitelist, preview, and import semantics | Filled |
| [Privacy-Safe Support Bundle](../tauri-rust/support-bundle.md) | In-memory events, explicit preview confirmation, safe Issue actions, and local ZIP export | Filled |
| [Project Retrospective Attribution](../tauri-rust/project-retrospective.md) | Cross-layer project history and insights projection contract | Filled |
| [Report Agent](./report-agent.md) | `useReportAgent` context privacy, volatile conversation, patch acceptance, period picker, and local edit stats invariant | Filled |

---

## Pre-Development Checklist

- [ ] Identify whether the change belongs in React state/UI or a Rust Tauri command.
- [ ] Check `src/model.ts` before adding new frontend shapes, defaults, validators, or command option builders.
- [ ] Keep report generation controls and current scope visible in the workbench.
- [ ] Preserve local-first privacy language and never put raw API keys in plain persisted settings.
- [ ] For persisted-settings or startup credential changes, follow `settings-migration.md`; never delete the only legacy credential copy before secure-store success.
- [ ] For configuration-profile work, use the explicit versioned whitelist; never export `AppSettings` by spreading it.
- [ ] For support-bundle work, keep events memory-only and use only Rust-returned safe summary text for copy and Issue actions.
- [ ] For desktop startup, responsive, overlay, or CI changes, follow `desktop-quality-gates.md`.
- [ ] For agent panel, `useReportAgent`, or report editor changes, follow `report-agent.md`; confirm conversation is volatile-only, history is opt-in, and patch acceptance routes through `reviewAgentPatch` without touching the draft directly.
- [ ] Period picker handlers (`changeWeeklyWeek`, `changeMonthlyMonth`) must never call `resetDraft`; they only stage parameters for the next generation.

## Quality Check

- [ ] `npm run build` passes for TypeScript and production bundling when frontend code changes.
- [ ] Relevant Playwright checks pass or the reason they were not run is documented.
- [ ] UI text remains clear in Chinese and does not hide primary report actions.
- [ ] Tauri command payloads still match `src-tauri/src/models.rs` camelCase serde models.
