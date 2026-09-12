import { purposeRefinementInstruction } from "../reportFormat";
import { SUPPLEMENTAL_FACT_PRESERVATION_INSTRUCTION, validateSupplementalItems } from "../supplementalItems";
import { getTodayRange } from "./dates";
import { buildProxyConfig } from "./connections";
import { TRAILING_CONNECTORS } from "./repository";
import type {
  AppSettings,
  AuthorAliasGroup,
  BatchGroupMode,
  BlankDayItemCount,
  CommitItemPrefixMode,
  CommitRecord,
  DateRange,
  EvidenceLinkRule,
  ExtractReportKind,
  PeriodReportKind,
  PreviewMode,
  ReportExportFormat,
  ReportFormatTemplates,
  ReportRedactionOptions,
  ReportRedactionRule,
  RepoInfo,
  SplitGranularity,
} from "./types";

export const DEFAULT_BLANK_DAY_ITEM_COUNT: BlankDayItemCount = 5;
export const BLANK_DAY_ITEM_COUNT_OPTIONS: BlankDayItemCount[] = [3, 5, 8];
export const DEFAULT_BLANK_DAY_USER_PROMPT = [
  "请基于我提供的历史 Git 提交线索，为目标日写一份具体、可核对的日报延续草稿。",
  "要求：",
  "1. 每条必须从历史线索中指出一个具体锚点，如已有功能、接口、数据流、页面、脚本、测试、异常路径或技术对象",
  "2. 优先写最可能的代码级延续：功能延伸、缺陷或回归修复、异常/边界/兼容性处理、测试补强，或已有接口与数据流的衔接",
  "3. 不得只写「跟进 / 排查 / 推进 / 联调 / 整理」；如确需使用，必须同时写清具体对象、问题模式和拟采取的动作",
  "4. 多条内容应覆盖不同历史锚点或不同具体动作，避免同义改写和注水",
  "5. 严格输出 N 条短要点列表（每行一条，可用 - 前缀），每条一句话",
  "6. 若历史线索条目带有项目前缀（如「映射项目名 - 」或「仓库(分支) - 」），每条输出必须保留同风格前缀，与日常日报配置一致",
  "7. 潜在缺陷只能写拟采取的保护或修复动作，不得声称故障已经发生；不要写已上线、已完成验收、百分比进度等无法核实的表述",
  "8. 语气正式，可直接粘贴到日报",
].join("\n");
export const DEFAULT_BATCH_FILE_NAME_TEMPLATE = "{period}-{type}.{ext}";
export const DEFAULT_DAILY_SYSTEM_PROMPT =
  "你是一个严谨的工作日报写作助手。请基于 Git 提交记录润色为当天或指定周期的工作日报，不要虚构没有依据的业务结果、上线结论或百分比。最终输出保持为简洁纯文本或短列表，方便直接复制到工作汇报中。";
export const DEFAULT_WEEKLY_SYSTEM_PROMPT =
  "你是一个严谨的工作周报写作助手。请基于 Git 提交周报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：本周重点、实际完成情况、下周关注。每个模块尽量保留项目分组和可追溯事项。";
export const DEFAULT_MONTHLY_SYSTEM_PROMPT =
  "你是一个严谨的绩效月报写作助手。请基于 Git 提交月报草稿改写，不要虚构没有依据的业务结果、上线结论或百分比。最终输出必须是 Markdown，标题之外的正文只包含三大模块：项目进度、实际完成情况、当月总结。每个模块下必须继续按照项目分组。";

const EVIDENCE_PRESERVATION_INSTRUCTION =
  "已启用提交证据详情。请保留每条事项下方的「来源」引用块，不要改写仓库、分支、日期、commit hash 或原始提交信息。";
const REDACTION_PRESERVATION_INSTRUCTION =
  "已启用报告脱敏。请保留仓库、分支、作者和 commit 的脱敏别名，不要推测或还原真实名称。";
const TEMPLATE_PRESERVATION_INSTRUCTION =
  "请保留当前报告草稿的模板结构、标题层级和分段顺序，不要改成其他固定格式。";
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseAuthorAliases(text: string): AuthorAliasGroup[] {
  return text.split(/\r?\n/).reduce<AuthorAliasGroup[]>((groups, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return groups;
    const separatorIndex = line.indexOf("->");
    if (separatorIndex < 0) return groups;
    const displayName = line.slice(0, separatorIndex).trim();
    const aliases = splitAuthorInput(line.slice(separatorIndex + 2));
    if (!displayName || aliases.length === 0) return groups;
    groups.push({ displayName, aliases });
    return groups;
  }, []);
}

export function parseEvidenceLinkRules(text: string): EvidenceLinkRule[] {
  const seen = new Set<string>();
  return text.split(/\r?\n/).reduce<EvidenceLinkRule[]>((rules, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) return rules;
    const separatorIndex = line.indexOf("->");
    if (separatorIndex < 0) return rules;
    const prefix = line.slice(0, separatorIndex).trim();
    const urlTemplate = line.slice(separatorIndex + 2).trim();
    const key = prefix.toLowerCase();
    if (!prefix || !urlTemplate || seen.has(key)) return rules;
    seen.add(key);
    rules.push({ prefix, urlTemplate });
    return rules;
  }, []);
}

export function parseRedactionRules(text: string): ReportRedactionRule[] {
  const seen = new Set<string>();
  return text.split(/\r?\n/).reduce<ReportRedactionRule[]>((rules, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return rules;
    const separatorIndex = line.indexOf("->");
    const find = separatorIndex < 0 ? trimmed : line.slice(0, separatorIndex).trim();
    const replacement = separatorIndex < 0 ? "***" : line.slice(separatorIndex + 2).trim() || "***";
    const key = find.toLowerCase();
    if (!find || seen.has(key)) return rules;
    seen.add(key);
    rules.push({ find, replacement });
    return rules;
  }, []);
}

export function buildAuthorFilter(author: string, groups: AuthorAliasGroup[]): string {
  const authors = splitAuthorInput(author);
  if (authors.length === 0) return "";
  const expanded = new Map<string, string>();
  for (const authorName of authors) {
    addAuthorToken(expanded, authorName);
    const group = findAuthorAliasGroup(authorName, groups);
    if (!group) continue;
    addAuthorToken(expanded, group.displayName);
    for (const alias of group.aliases) addAuthorToken(expanded, alias);
  }
  return [...expanded.values()].join(", ");
}

export function buildAuthorDisplayName(author: string, groups: AuthorAliasGroup[]): string {
  const authors = splitAuthorInput(author);
  if (authors.length === 0) return "";
  return authors
    .map((authorName) => findAuthorAliasGroup(authorName, groups)?.displayName ?? authorName)
    .filter((authorName, index, all) => all.findIndex((item) => item.toLowerCase() === authorName.toLowerCase()) === index)
    .join(", ");
}

function splitAuthorInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(/[\s,，]+/)) {
    const token = part.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

function addAuthorToken(tokens: Map<string, string>, value: string) {
  const token = value.trim();
  if (!token) return;
  const key = token.toLowerCase();
  if (!tokens.has(key)) tokens.set(key, token);
}

function findAuthorAliasGroup(authorName: string, groups: AuthorAliasGroup[]) {
  const key = authorName.trim().toLowerCase();
  return groups.find((group) => (
    group.displayName.trim().toLowerCase() === key
    || group.aliases.some((alias) => alias.trim().toLowerCase() === key)
  ));
}

export function buildExtractOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  dateRange: DateRange | undefined,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
  reportKind: ExtractReportKind = "daily",
  supplementalItems: string[] = [],
) {
  const range = dateRange ?? getTodayRange();
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  const evidenceLinkRules = parseEvidenceLinkRules(settings.evidenceLinkPrefixesText);
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    authorAliases: authorAliasGroups,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: reportKind === "custom" ? `${range.startDate} ~ ${range.endDate}` : range.startDate,
    reportKind,
    supplementalItems: validateSupplementalItems(supplementalItems),
    disabledRepos: settings.disabledRepos,
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    detailedOutput: settings.detailedOutput,
    showProjectAndBranch: settings.showProjectAndBranch,
    commitItemPrefixMode: settings.commitItemPrefixMode,
    showEvidenceDetails: settings.showEvidenceDetails,
    evidenceLinkRules,
    redaction: buildReportRedactionOptions(settings),
    projectNames,
    reportFormatTemplates: buildReportFormatTemplates(settings),
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, "daily"),
    ai: buildAiOptions(settings, aiEnabled),
  };
}

export function buildMonthlyOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
  supplementalItems: string[] = [],
) {
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  const evidenceLinkRules = parseEvidenceLinkRules(settings.evidenceLinkPrefixesText);
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    authorAliases: authorAliasGroups,
    supplementalItems: validateSupplementalItems(supplementalItems),
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    disabledRepos: settings.disabledRepos,
    showEvidenceDetails: settings.showEvidenceDetails,
    commitItemPrefixMode: settings.commitItemPrefixMode,
    evidenceLinkRules,
    redaction: buildReportRedactionOptions(settings),
    projectNames,
    reportFormatTemplates: buildReportFormatTemplates(settings),
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, "monthly"),
    ai: buildAiOptions(settings, aiEnabled),
  };
}

export function buildPeriodReportOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  kind: PeriodReportKind,
  range: DateRange,
  periodLabel: string,
  aiEnabled: boolean,
  extraInstruction = "",
  indexedRepos: RepoInfo[] = [],
  supplementalItems: string[] = [],
) {
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  const evidenceLinkRules = parseEvidenceLinkRules(settings.evidenceLinkPrefixesText);
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    outputDir: settings.outputDir,
    outputEnabled: settings.outputEnabled,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    authorAliases: authorAliasGroups,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel,
    reportKind: kind,
    supplementalItems: validateSupplementalItems(supplementalItems),
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    disabledRepos: settings.disabledRepos,
    showEvidenceDetails: settings.showEvidenceDetails,
    commitItemPrefixMode: settings.commitItemPrefixMode,
    evidenceLinkRules,
    redaction: buildReportRedactionOptions(settings),
    projectNames,
    reportFormatTemplates: buildReportFormatTemplates(settings),
    refinementInstruction: buildReportRefinementInstruction(settings, extraInstruction),
    systemPrompt: buildReportSystemPrompt(settings, kind),
    ai: buildAiOptions(settings, aiEnabled),
  };
}

export function buildBatchReportOptions(
  settings: AppSettings,
  projectNames: Record<string, string>,
  rangeStart: string,
  rangeEnd: string,
  splitGranularity: SplitGranularity,
  groupMode: BatchGroupMode,
  exportFormats: ReportExportFormat[],
  fileNameTemplate: string,
  outputDir: string,
  indexedRepos: RepoInfo[] = [],
) {
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  const evidenceLinkRules = parseEvidenceLinkRules(settings.evidenceLinkPrefixesText);
  return {
    rootDirs: settings.rootDirs,
    indexedRepos,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    authorAliases: authorAliasGroups,
    disabledRepos: settings.disabledRepos,
    extractAllBranches: settings.extractAllBranches,
    excludeMergeCommits: settings.excludeMergeCommits,
    excludeRevertCommits: settings.excludeRevertCommits,
    excludeBotCommits: settings.excludeBotCommits,
    commitItemPrefixMode: settings.commitItemPrefixMode,
    showEvidenceDetails: settings.showEvidenceDetails,
    evidenceLinkRules,
    redaction: buildReportRedactionOptions(settings),
    projectNames,
    reportFormatTemplates: buildReportFormatTemplates(settings),
    rangeStart,
    rangeEnd,
    splitGranularity,
    groupMode,
    exportFormats: [...new Set(exportFormats)],
    fileNameTemplate: fileNameTemplate.trim(),
    outputDir,
  };
}

// 与 Rust report.rs 的 display_prefix / commit_item_prefix 保持一致：
// 映射名去掉末尾连接符后统一补 " - "；未配置映射时前缀为空。
export function resolveCommitMappedProjectName(
  commit: Pick<CommitRecord, "projectName" | "branchName">,
  projectNames: Record<string, string>,
): string {
  const projectName = commit.projectName?.trim() ?? "";
  const branchName = commit.branchName?.trim() ?? "";
  if (!projectName) return "";
  const exactKey = branchName ? `${projectName}(${branchName})` : "";
  const mapped =
    (exactKey ? projectNames[exactKey] : undefined)
    ?? projectNames[`${projectName}(*)`]
    ?? "";
  return mapped.replace(TRAILING_CONNECTORS, "").trim();
}

function displayCommitItemPrefix(displayName: string): string {
  const trimmed = displayName.replace(TRAILING_CONNECTORS, "").trim();
  return trimmed ? `${trimmed} - ` : "";
}

/** 复刻日报 {commitItems} 的项目前缀规则，供空白日补写等前端侧线索拼装使用。 */
export function buildCommitItemPrefix(
  mode: CommitItemPrefixMode,
  commit: Pick<CommitRecord, "projectName" | "branchName">,
  projectNames: Record<string, string>,
): string {
  const mapped = resolveCommitMappedProjectName(commit, projectNames);
  const repoBranch =
    commit.projectName && commit.branchName
      ? `${commit.projectName}(${commit.branchName})`
      : commit.projectName || "";
  switch (mode) {
    case "mapped-project":
      return displayCommitItemPrefix(mapped);
    case "repo-branch-and-mapped":
      return `${displayCommitItemPrefix(repoBranch)}${displayCommitItemPrefix(mapped)}`;
    case "repo-branch":
      return displayCommitItemPrefix(repoBranch);
    case "none":
      return "";
    default:
      return displayCommitItemPrefix(mapped);
  }
}

export function buildBlankDayEvidenceText(
  commits: CommitRecord[],
  selectedRepoPaths: string[],
  projectNames: Record<string, string> = {},
  prefixMode: CommitItemPrefixMode = "mapped-project",
) {
  const selected = new Set(selectedRepoPaths);
  const lines = commits
    .filter((commit) => selected.has(commit.repoPath))
    .slice(0, 80)
    .map((commit) => {
      const prefix = buildCommitItemPrefix(prefixMode, commit, projectNames);
      const message = commit.message.replace(/\s+/g, " ").trim();
      // 与日报一致：有映射时为「项目名 - 事项」；无映射时退回仓库(分支)线索，避免 AI 丢掉来源。
      const fallback =
        !prefix && commit.projectName
          ? `${commit.projectName}${commit.branchName ? `(${commit.branchName})` : ""}: `
          : "";
      return `- [${commit.date.slice(0, 10)}] ${prefix || fallback}${message}`;
    });
  return lines.join("\n");
}

export function collectBlankDayRepoTags(
  commits: CommitRecord[],
  projectNames: Record<string, string> = {},
) {
  const map = new Map<string, { path: string; label: string; count: number }>();
  for (const commit of commits) {
    const existing = map.get(commit.repoPath);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const pathParts = commit.repoPath.split(/[/\\]/).filter(Boolean);
    const mapped = resolveCommitMappedProjectName(commit, projectNames);
    const name = mapped || commit.projectName || pathParts[pathParts.length - 1] || commit.repoPath;
    const branch = !mapped && commit.branchName ? ` (${commit.branchName})` : "";
    map.set(commit.repoPath, {
      path: commit.repoPath,
      label: `${name}${branch}`,
      count: 1,
    });
  }
  return [...map.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

export function buildBlankDayFillOptions(
  settings: AppSettings,
  baseEvidence: string,
  targetDate: string,
  sourceRange: DateRange,
  itemCount: BlankDayItemCount,
  userPrompt: string,
) {
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  return {
    baseEvidence,
    targetDate,
    sourceStartDate: sourceRange.startDate,
    sourceEndDate: sourceRange.endDate,
    itemCount,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    userPrompt,
    ai: buildAiOptions(settings, true),
  };
}

export function buildReportEnhanceOptions(
  settings: AppSettings,
  mode: PreviewMode,
  range: DateRange,
  baseReport: string,
  extraInstruction = "",
  supplementalItems: string[] = [],
) {
  const authorAliasGroups = parseAuthorAliases(settings.authorAliasesText);
  const kind = mode === "summary" ? "daily" : mode;
  return {
    baseReport,
    startDate: range.startDate,
    endDate: range.endDate,
    reportKind: kind,
    author: buildAuthorFilter(settings.author, authorAliasGroups),
    authorDisplayName: buildAuthorDisplayName(settings.author, authorAliasGroups),
    refinementInstruction: buildReportRefinementInstruction(
      settings,
      mergeInstructions(
        extraInstruction,
        validateSupplementalItems(supplementalItems).length > 0
          ? SUPPLEMENTAL_FACT_PRESERVATION_INSTRUCTION
          : "",
      ),
    ),
    systemPrompt: buildReportSystemPrompt(settings, kind === "custom" ? "daily" : kind),
    ai: buildAiOptions(settings, true),
  };
}

export function validateRequiredSettings(settings: AppSettings) {
  validateExtractSettings(settings);
  validateOutputSettings(settings);
}

export function validateMonthlySettings(settings: AppSettings) {
  validateWorkspaceSettings(settings);
  validateOutputSettings(settings);
}

export function validatePeriodReportSettings(settings: AppSettings, range: DateRange) {
  validateWorkspaceSettings(settings);
  validateDateRange(range.startDate, range.endDate);
  validateOutputSettings(settings);
}

export function validateExtractSettings(settings: AppSettings, dateRange?: DateRange) {
  validateWorkspaceSettings(settings);
  const range = dateRange ?? getTodayRange();
  validateDateRange(range.startDate, range.endDate);
}

export function validateWorkspaceSettings(settings: AppSettings) {
  if (settings.rootDirs.filter((dir) => dir.trim()).length === 0) throw new Error("请选择至少一个仓库根目录");
}

export function validateOutputSettings(settings: AppSettings) {
  if (settings.outputEnabled && !settings.outputDir.trim()) throw new Error("已启用自动保存，请在设置中选择输出目录");
}

export function validateAiSettings(settings: AppSettings) {
  if (!settings.aiEnabled) return;
  validateAiConnectionSettings(settings);
}

export function validateAiConnectionSettings(settings: AppSettings) {
  if (!settings.aiModel.trim()) throw new Error("使用 AI 润色前请先在设置中填写模型名");
  if (settings.aiProvider === "codex-oauth") return;
  if (!settings.aiBaseUrl.trim()) throw new Error("使用 AI 润色前请先在设置中填写 Base URL");
  const aiApiKey = settings.aiApiKey.trim();
  if (!aiApiKey) throw new Error("使用 AI 润色前请先在设置中填写 API Key");
  validateAiKeyReference(aiApiKey);
}

export function validateDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) throw new Error("请选择完整的日期范围");
  if (startDate > endDate) throw new Error("开始日期不能晚于结束日期");
}

export function buildAiOptions(settings: AppSettings, enabled = settings.aiEnabled) {
  return {
    enabled,
    provider: settings.aiProvider,
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModel,
    apiKey: settings.aiApiKey.trim(),
    temperature: clampTemperature(settings.aiTemperature),
    timeoutSeconds: 60,
    proxy: buildProxyConfig(settings),
  };
}

function buildReportRedactionOptions(settings: AppSettings): ReportRedactionOptions {
  return {
    enabled: settings.redactionEnabled,
    rules: parseRedactionRules(settings.redactionRulesText),
  };
}

function buildReportFormatTemplates(settings: AppSettings): ReportFormatTemplates {
  return {
    daily: settings.dailyReportFormatTemplate,
    weekly: settings.weeklyReportFormatTemplate,
    monthly: settings.monthlyReportFormatTemplate,
    custom: settings.customReportFormatTemplate,
  };
}

// AI 采样温度：超出 [0,1] 钳到边界，非数字回退默认 0.2（Anthropic 上限为 1，取并集安全区间）。
function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0, value));
}

// 合并常驻润色指令与本次一次性额外要求，二者皆可为空。
function mergeInstructions(base: string, extra: string): string {
  return [base.trim(), extra.trim()].filter(Boolean).join("\n");
}

function buildReportSystemPrompt(settings: AppSettings, kind: "daily" | PeriodReportKind) {
  return (
    kind === "monthly"
      ? settings.monthlySystemPrompt
      : kind === "weekly"
        ? DEFAULT_WEEKLY_SYSTEM_PROMPT
        : settings.dailySystemPrompt
  );
}

function buildReportRefinementInstruction(settings: AppSettings, extraInstruction: string) {
  const evidenceInstruction = settings.showEvidenceDetails ? EVIDENCE_PRESERVATION_INSTRUCTION : "";
  const redactionInstruction = settings.redactionEnabled ? REDACTION_PRESERVATION_INSTRUCTION : "";
  const purposeInstruction = purposeRefinementInstruction(settings.reportPurposePreset);
  return mergeInstructions(
    mergeInstructions(
      mergeInstructions(
        mergeInstructions(
          mergeInstructions(purposeInstruction, settings.refinementInstruction),
          TEMPLATE_PRESERVATION_INSTRUCTION,
        ),
        redactionInstruction,
      ),
      evidenceInstruction,
    ),
    extraInstruction,
  );
}


function validateAiKeyReference(value: string) {
  if (!value.startsWith("env:")) return;
  const name = value.slice(4).trim();
  if (!name) throw new Error("API Key 环境变量引用缺少变量名，请填写 env:OPENAI_API_KEY 这类格式");
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    throw new Error("API Key 环境变量名格式不正确，请使用 env:OPENAI_API_KEY 这类格式");
  }
}
