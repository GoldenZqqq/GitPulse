import { expect, type Page } from "@playwright/test";

const STORAGE_KEY = "gitpulse-settings";
const LEGACY_SETTINGS_KEY = "git-report-studio-settings";
const SETTINGS_MIGRATION_BACKUP_KEY = "gitpulse-settings-migration-backup";
const REPO_INDEX_CACHE_KEY = "gitpulse-repo-index-cache";
const REPORT_HISTORY_KEY = "gitpulse-report-history";

type RepoInfo = {
  path: string;
  name: string;
  branch: string;
};

type ReportHistoryEntry = {
  id: string;
  mode: "summary" | "weekly" | "custom" | "monthly";
  title: string;
  range: { startDate: string; endDate: string };
  periodLabel: string;
  generatedAt: string;
  repoCount: number;
  projectCount?: number;
  commitCount: number;
  aiEnhanced: boolean;
  outputFile: string;
  reportText: string;
  supplementalItems?: string[];
  projects?: ReportHistoryProject[];
};

type ReportHistoryProject = {
  name: string;
  commitCount: number;
  evidenceIds: string[];
};

type MockScenario = {
  settings?: Record<string, unknown>;
  settingsRaw?: string;
  legacySettingsRaw?: string;
  settingsMigrationBackupRaw?: string;
  repoCache?: { rootDirs: string[]; repos: RepoInfo[]; scannedAt: string };
  reportHistory?: ReportHistoryEntry[];
  legacyReportHistoryRaw?: string;
  storedReportHistory?: ReportHistoryEntry[];
  reportHistoryLoadError?: string;
  reportHistoryLoadWarning?: string;
  reportHistoryRecoveredFromBackup?: boolean;
  reportHistorySaveError?: string;
  reportHistoryClearError?: string;
  dialogResponses?: unknown[];
  appVersion?: string;
  gitIdentity?: { userName: string; userEmail: string };
  secureApiKey?: string | null;
  secureApiKeySaveError?: string;
  codexAuthStatus?: { authenticated: boolean; email?: string };
  scanRepos?: RepoInfo[];
  scanWarnings?: string[];
  workspaceHealthResult?: Record<string, unknown>;
  workspaceHealthError?: string;
  extractResults?: Array<{
    repos?: RepoInfo[];
    summaryText: string;
    detailedText?: string;
    warnings?: string[];
    commits: unknown[];
    projects?: ReportHistoryProject[];
  }>;
  periodResults?: {
    weekly?: Record<string, unknown>;
    monthly?: Record<string, unknown>;
  };
  diagnosticsResult?: Record<string, unknown>;
  supportBundlePreview?: Record<string, unknown>;
  supportBundlePreviewError?: string;
  supportBundleExportResult?: Record<string, unknown>;
  supportBundleExportError?: string;
  batchResult?: Record<string, unknown>;
  enhanceResult?: Record<string, unknown>;
  agentResponses?: unknown[];
  agentError?: string;
  aiModels?: Array<{ id: string; ownedBy?: string }>;
  deferredCommands?: string[];
  updateMetadata?: Record<string, unknown> | null;
  outputDir?: string;
  textFiles?: Record<string, string>;
};

export function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    onboardingDone: true,
    rootDirs: ["C:/workspace"],
    outputDir: "C:/exports",
    outputEnabled: true,
    themeMode: "light",
    author: "Playwright Tester",
    authorAliasesText: "",
    evidenceLinkPrefixesText: "",
    disabledRepos: [],
    extractAllBranches: false,
    excludeMergeCommits: true,
    excludeRevertCommits: true,
    excludeBotCommits: true,
    detailedOutput: false,
    showProjectAndBranch: true,
    commitItemPrefixMode: "mapped-project",
    showEvidenceDetails: false,
    redactionEnabled: false,
    redactionRulesText: "",
    projectNamesText: "",
    aiEnabled: false,
    aiProvider: "openai-compatible",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "",
    aiApiKey: "",
    aiApiKeySaved: false,
    refinementInstruction: "",
    reportPurposePreset: "custom",
    reportTemplateProfile: "standard",
    dailyReportFormatTemplate: "{commitItems}",
    weeklyReportFormatTemplate:
      "# {periodLabel}工作周报\n\n- 统计周期：{startDate} 至 {endDate}\n- 作者：{author}\n- 项目数量：{projectCount}\n- 提交事项：{commitCount}\n\n## 一、本周重点\n\n{summary}\n\n## 二、实际完成情况\n\n{projectSections}\n\n## 三、下周关注\n\n{nextSteps}\n\n{notes}",
    monthlyReportFormatTemplate:
      "# {periodLabel}工作月报\n\n- 统计周期：{startDate} 至 {endDate}\n- 作者：{author}\n- 项目数量：{projectCount}\n- 提交事项：{commitCount}\n\n## 一、项目进度\n\n{summary}\n\n## 二、实际完成情况\n\n{projectSections}\n\n## 三、当月总结\n\n{conclusion}\n\n{notes}",
    customReportFormatTemplate:
      "# {periodLabel}工作报告\n\n- 统计周期：{startDate} 至 {endDate}\n- 作者：{author}\n- 项目数量：{projectCount}\n- 提交事项：{commitCount}\n\n{projectSections}\n\n{evidence}",
    dailySystemPrompt:
      "你是一个严谨的工作日报写作助手。请基于 Git 提交记录润色为当天或指定周期的工作日报，不要虚构没有依据的业务结果、上线结论或百分比。最终输出保持为简洁纯文本或短列表，方便直接复制到工作汇报中。",
    monthlySystemPrompt:
      "你是一个严谨的绩效月报写作助手。请基于 Git 提交月报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：项目进度、实际完成情况、当月总结。每个模块下必须继续按照项目分组。",
    aiTemperature: 0.2,
    ...overrides,
  };
}

export function createRepo(path: string, name: string, branch: string): RepoInfo {
  return { path, name, branch };
}

export function createRepoCache(rootDirs: string[], repos: RepoInfo[]) {
  return {
    rootDirs,
    repos,
    scannedAt: new Date("2026-07-02T10:00:00.000Z").toISOString(),
  };
}

export function createSupportBundlePreview(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-18T12:00:00Z",
    suggestedFileName: "gitpulse-support-20260718-120000.zip",
    entries: [
      {
        name: "summary.md",
        description: "版本、平台、聚合状态与失败摘要",
        content: "# GitPulse 支持摘要\n\n- GitPulse：v0.5.3\n- 诊断：1 异常 / 1 提醒 / 7 正常\n",
        bytes: 96,
      },
      {
        name: "diagnostics.json",
        description: "机器可读的脱敏诊断与健康计数",
        content: '{\n  "schemaVersion": 1,\n  "workspace": { "repositoryCount": 1 }\n}',
        bytes: 72,
      },
      {
        name: "recent-events.log",
        description: "当前会话最近的脱敏应用事件",
        content: "[2026-07-18T12:00:00Z] [ERROR] <redacted>\n",
        bytes: 55,
      },
    ],
    excludedData: [
      "API Key、OAuth token 与代理密码",
      "绝对路径、仓库名称与分支名称",
      "原始 commit 内容与 Git 历史",
    ],
    issueTitle: "GitPulse 支持请求 · v0.5.3 · windows",
    issueBody: "## Safe summary\n- Diagnostics: 1 errors, 1 warnings, 7 ok\n- Workspace directories: 1\n",
    ...overrides,
  };
}

export function createHistoryEntry(
  overrides: Partial<ReportHistoryEntry> & Pick<ReportHistoryEntry, "id" | "mode" | "title" | "periodLabel" | "reportText">,
): ReportHistoryEntry {
  return {
    id: overrides.id,
    mode: overrides.mode,
    title: overrides.title,
    range: overrides.range ?? { startDate: "2026-07-01", endDate: "2026-07-01" },
    periodLabel: overrides.periodLabel,
    generatedAt: overrides.generatedAt ?? new Date("2026-07-02T10:00:00.000Z").toISOString(),
    repoCount: overrides.repoCount ?? 1,
    projectCount: overrides.projectCount,
    commitCount: overrides.commitCount ?? 2,
    aiEnhanced: overrides.aiEnhanced ?? false,
    outputFile: overrides.outputFile ?? "",
    reportText: overrides.reportText,
    supplementalItems: overrides.supplementalItems,
    projects: overrides.projects,
  };
}

export async function launchApp(page: Page, scenario: MockScenario) {
  const payload = {
    settings: scenario.settings,
    settingsRaw: scenario.settingsRaw,
    legacySettingsRaw: scenario.legacySettingsRaw,
    settingsMigrationBackupRaw: scenario.settingsMigrationBackupRaw,
    repoCache: scenario.repoCache,
    reportHistory: scenario.reportHistory,
    legacyReportHistoryRaw: scenario.legacyReportHistoryRaw,
    storedReportHistory: scenario.storedReportHistory,
    reportHistoryLoadError: scenario.reportHistoryLoadError,
    reportHistoryLoadWarning: scenario.reportHistoryLoadWarning,
    reportHistoryRecoveredFromBackup: scenario.reportHistoryRecoveredFromBackup ?? false,
    reportHistorySaveError: scenario.reportHistorySaveError,
    reportHistoryClearError: scenario.reportHistoryClearError,
    dialogResponses: [...(scenario.dialogResponses ?? [])],
    appVersion: scenario.appVersion ?? "0.3.7-test",
    gitIdentity: scenario.gitIdentity ?? {
      userName: "Playwright Tester",
      userEmail: "playwright@example.com",
    },
    secureApiKey: scenario.secureApiKey ?? null,
    secureApiKeySaveError: scenario.secureApiKeySaveError,
    codexAuthStatus: scenario.codexAuthStatus ?? { authenticated: false },
    scanRepos: scenario.scanRepos ?? scenario.repoCache?.repos ?? [],
    scanWarnings: scenario.scanWarnings ?? [],
    workspaceHealthResult: scenario.workspaceHealthResult ?? { roots: [], repos: [] },
    workspaceHealthError: scenario.workspaceHealthError,
    extractResults: scenario.extractResults ?? [],
    periodResults: scenario.periodResults ?? {},
    diagnosticsResult: scenario.diagnosticsResult ?? {
      items: [],
      okCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    supportBundlePreview: scenario.supportBundlePreview ?? createSupportBundlePreview(),
    supportBundlePreviewError: scenario.supportBundlePreviewError,
    supportBundleExportResult: scenario.supportBundleExportResult ?? {
      outputFile: "C:/exports/gitpulse-support.zip",
      bytes: 4096,
    },
    supportBundleExportError: scenario.supportBundleExportError,
    batchResult: scenario.batchResult ?? null,
    enhanceResult: scenario.enhanceResult ?? null,
    agentResponses: scenario.agentResponses ?? [],
    agentError: scenario.agentError,
    aiModels: scenario.aiModels ?? [],
    deferredCommands: scenario.deferredCommands ?? [],
    updateMetadata: scenario.updateMetadata ?? null,
    outputDir: scenario.outputDir ?? "C:/exports",
    textFiles: { ...(scenario.textFiles ?? {}) },
  };

  await page.addInitScript(
    ({
      state,
      storageKey,
      legacySettingsKey,
      settingsMigrationBackupKey,
      repoIndexCacheKey,
      reportHistoryKey,
    }) => {
      const callbacks = new Map();
      let nextCallbackId = 1;
      let nextEventId = 1;

      const dialogResponses = [...(state.dialogResponses ?? [])];
      const extractResults = [...(state.extractResults ?? [])];
      const agentResponses = [...state.agentResponses];
      const deferredCommands = new Set(state.deferredCommands ?? []);
      const deferredResolvers = new Map();
      const releasedCommands = new Set();
      const mockState = {
        ...state,
        dialogResponses,
        extractResults,
        reportHistoryStore: [...(state.storedReportHistory ?? [])],
        reportHistoryStoreExists: state.storedReportHistory !== undefined,
        textFiles: { ...(state.textFiles ?? {}) },
        calls: [],
        clipboard: "",
        releaseCommand(cmd) {
          const resolvers = deferredResolvers.get(cmd);
          const resolve = resolvers?.shift();
          if (resolve) {
            resolve();
          } else {
            releasedCommands.add(cmd);
          }
        },
      };

      const mediaQueryFallback = {
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      };

      if (typeof window.matchMedia !== "function") {
        window.matchMedia = (query) => ({ ...mediaQueryFallback, media: query });
      }

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          async writeText(text) {
            mockState.clipboard = String(text);
          },
          async readText() {
            return mockState.clipboard;
          },
        },
      });

      window.localStorage.clear();
      if (state.settingsRaw !== undefined) {
        window.localStorage.setItem(storageKey, state.settingsRaw);
      } else if (state.settings) {
        window.localStorage.setItem(storageKey, JSON.stringify(state.settings));
      }
      if (state.legacySettingsRaw !== undefined) {
        window.localStorage.setItem(legacySettingsKey, state.legacySettingsRaw);
      }
      if (state.settingsMigrationBackupRaw !== undefined) {
        window.localStorage.setItem(settingsMigrationBackupKey, state.settingsMigrationBackupRaw);
      }
      if (state.repoCache) {
        window.localStorage.setItem(repoIndexCacheKey, JSON.stringify(state.repoCache));
      }
      if (state.legacyReportHistoryRaw !== undefined) {
        window.localStorage.setItem(reportHistoryKey, state.legacyReportHistoryRaw);
      } else if (state.reportHistory) {
        window.localStorage.setItem(reportHistoryKey, JSON.stringify(state.reportHistory));
      }

      function nextDialogResponse() {
        return dialogResponses.length > 0 ? dialogResponses.shift() : null;
      }

      function nextExtractResult() {
        const result = extractResults.length > 0 ? extractResults.shift() : {
          repos: state.scanRepos ?? [],
          summaryText: "",
          detailedText: "",
          warnings: [],
          commits: [],
        };
        const commits = result?.commits ?? [];
        return {
          repos: result?.repos ?? state.scanRepos ?? [],
          summaryText: result?.summaryText ?? "",
          detailedText: result?.detailedText ?? "",
          warnings: result?.warnings ?? [],
          commits,
          projects: result?.projects ?? projectsFromCommits(commits),
        };
      }

      function projectsFromCommits(commits) {
        const groups = new Map();
        for (const commit of commits) {
          if (!commit?.projectName || !commit?.branchName) continue;
          const name = `${commit.projectName}(${commit.branchName})`;
          const project = groups.get(name) ?? { name, commitCount: 0, evidenceIds: [] };
          project.commitCount += 1;
          const evidenceId = String(commit.hash ?? "").startsWith("commit-")
            ? String(commit.hash)
            : String(commit.hash ?? "").slice(0, 7);
          if (evidenceId && !project.evidenceIds.includes(evidenceId) && project.evidenceIds.length < 20) {
            project.evidenceIds.push(evidenceId);
          }
          groups.set(name, project);
        }
        return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
      }

      function resolvePeriodResult(kind) {
        const fallback = {
          reportText: "",
          outputFile: "",
          warnings: [],
          startDate: "2026-07-01",
          endDate: "2026-07-07",
          periodLabel: kind === "weekly" ? "2026-W27" : "2026-07",
          reportKind: kind,
          projectCount: 1,
          commitCount: 0,
          projects: [],
        };
        return { ...fallback, ...(state.periodResults?.[kind] ?? {}) };
      }

      function saveReportFile(args) {
        const extension = args.format === "markdown" ? "md" : args.format;
        return `${state.outputDir ?? "C:/exports"}/${args.baseName}.${extension}`;
      }

      function normalizeHistory(entries, limit) {
        const maxEntries = [30, 60, 120, 200].includes(limit) ? limit : 120;
        const ids = new Set();
        return (entries ?? []).filter((entry) => {
          if (!entry?.id || ids.has(entry.id)) return false;
          ids.add(entry.id);
          return true;
        }).slice(0, maxEntries);
      }

      function waitForCommandRelease(cmd) {
        if (!deferredCommands.has(cmd) || releasedCommands.delete(cmd)) return Promise.resolve();
        return new Promise((resolve) => {
          const resolvers = deferredResolvers.get(cmd) ?? [];
          resolvers.push(resolve);
          deferredResolvers.set(cmd, resolvers);
        });
      }

      function registerCallback(callback, once = false) {
        const id = nextCallbackId++;
        callbacks.set(id, { callback, once });
        return id;
      }

      function runCallback(id, payload) {
        const entry = callbacks.get(id);
        if (!entry) return;
        entry.callback(payload);
        if (entry.once) callbacks.delete(id);
      }

      window.__mockTauri = mockState;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener() {},
      };
      window.__TAURI_INTERNALS__ = {
        callbacks,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: registerCallback,
        unregisterCallback(id) {
          callbacks.delete(id);
        },
        runCallback,
        convertFileSrc(filePath, protocol = "asset") {
          return `${protocol}://${filePath}`;
        },
        async invoke(cmd, args = {}) {
          mockState.calls.push({ cmd, args });
          await waitForCommandRelease(cmd);

          switch (cmd) {
            case "plugin:app|version":
              return state.appVersion;
            case "plugin:dialog|open":
            case "plugin:dialog|save":
              return nextDialogResponse();
            case "plugin:event|listen":
              return nextEventId++;
            case "plugin:event|unlisten":
              return null;
            case "plugin:window|theme":
              return "light";
            case "plugin:window|set_theme":
              return null;
            case "plugin:opener|open_url":
              return null;
            case "plugin:updater|check":
              return state.updateMetadata;
            case "get_secure_ai_api_key":
              return mockState.secureApiKey;
            case "set_secure_ai_api_key":
              if (state.secureApiKeySaveError) throw new Error(state.secureApiKeySaveError);
              mockState.secureApiKey = String(args.apiKey ?? "");
              return null;
            case "clear_secure_ai_api_key":
              mockState.secureApiKey = null;
              return null;
            case "cancel_repo_scan":
            case "write_mapping_template_xlsx":
            case "codex_oauth_logout":
              return null;
            case "read_text_file": {
              const content = mockState.textFiles[args.path];
              if (typeof content !== "string") throw new Error("读取配置方案失败：文件不存在");
              return content;
            }
            case "write_text_file":
              mockState.textFiles[args.path] = String(args.content ?? "");
              return null;
            case "codex_oauth_status":
              return state.codexAuthStatus;
            case "list_ai_models":
              return state.aiModels;
            case "get_git_identity":
              return state.gitIdentity;
            case "scan_repos":
              return {
                repos: state.scanRepos ?? [],
                warnings: state.scanWarnings ?? [],
              };
            case "inspect_workspace_health":
              if (state.workspaceHealthError) throw new Error(state.workspaceHealthError);
              return state.workspaceHealthResult;
            case "load_report_history": {
              if (state.reportHistoryLoadError) throw new Error(state.reportHistoryLoadError);
              const hasLegacy = Array.isArray(args.legacyEntries);
              if (!mockState.reportHistoryStoreExists && hasLegacy) {
                mockState.reportHistoryStore = normalizeHistory(args.legacyEntries, args.limit);
                mockState.reportHistoryStoreExists = true;
              }
              return {
                entries: [...mockState.reportHistoryStore],
                migrationComplete: hasLegacy && mockState.reportHistoryStoreExists,
                recoveredFromBackup: state.reportHistoryRecoveredFromBackup,
                warning: state.reportHistoryLoadWarning ?? null,
              };
            }
            case "save_report_history":
              if (state.reportHistorySaveError) throw new Error(state.reportHistorySaveError);
              mockState.reportHistoryStore = normalizeHistory(args.entries, args.limit);
              mockState.reportHistoryStoreExists = true;
              return [...mockState.reportHistoryStore];
            case "clear_report_history":
              if (state.reportHistoryClearError) throw new Error(state.reportHistoryClearError);
              mockState.reportHistoryStore = [];
              mockState.reportHistoryStoreExists = true;
              return null;
            case "extract_commits":
              return nextExtractResult();
            case "generate_period_report":
              return resolvePeriodResult(args.options?.reportKind);
            case "batch_generate_reports":
              return state.batchResult;
            case "enhance_report":
              return state.enhanceResult ?? { reportText: args.options?.baseReport ?? "", warnings: [] };
            case "run_report_agent":
              if (state.agentError) throw new Error(state.agentError);
              return agentResponses.shift() ?? { answer: "当前报告的结论需要结合提交证据核对。", patch: null, toolTrace: ["current_report"] };
            case "run_diagnostics":
              return state.diagnosticsResult;
            case "preview_support_bundle":
              if (state.supportBundlePreviewError) throw new Error(state.supportBundlePreviewError);
              return state.supportBundlePreview;
            case "export_support_bundle":
              if (state.supportBundleExportError) throw new Error(state.supportBundleExportError);
              return state.supportBundleExportResult;
            case "save_report_file":
              return saveReportFile(args);
            default:
              return null;
          }
        },
      };
    },
    {
      state: payload,
      storageKey: STORAGE_KEY,
      legacySettingsKey: LEGACY_SETTINGS_KEY,
      settingsMigrationBackupKey: SETTINGS_MIGRATION_BACKUP_KEY,
      repoIndexCacheKey: REPO_INDEX_CACHE_KEY,
      reportHistoryKey: REPORT_HISTORY_KEY,
    },
  );

  await page.goto("/");
}

export async function expectWorkbench(page: Page) {
  await expect(page.getByRole("heading", { name: "工作报告工作台" })).toBeVisible();
}
