import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHistoryEntry, createRepo, createRepoCache, createSettings, expectWorkbench, launchApp } from "./support/tauri";

const original = "# 当前工作日报\n\n- 修复支付异常回退\n- 补充单元测试";
const revised = "# 当前工作日报\n\n- 修复支付异常回退并补充单元测试";
const repos = [createRepo("C:/workspace/gitpulse", "gitpulse", "main")];
const report = createHistoryEntry({ id: "agent-source", mode: "summary", title: "日报 · 助手测试", periodLabel: "2026-07-01", reportText: original, commitCount: 2, projectCount: 1, repoCount: 1 });
const other = createHistoryEntry({ id: "prior-week", title: "周报 · 历史素材", mode: "weekly", periodLabel: "2026-W26", range: { startDate: "2026-06-22", endDate: "2026-06-28" }, reportText: "HISTORY_PRIVATE_MARKER" });

async function launch(page: Page, scenario: Parameters<typeof launchApp>[1] = {}) {
  await launchApp(page, { settings: createSettings({ aiEnabled: true, aiApiKey: "sk-test", aiModel: "model-test" }), secureApiKey: "sk-test",
    repoCache: createRepoCache(["C:/workspace"], repos), storedReportHistory: [report, other], ...scenario });
  await expectWorkbench(page);
  await page.getByRole("tab", { name: /最近/ }).click();
  await page.getByRole("button", { name: /日报 · 助手测试/ }).click();
}

async function openAgent(page: Page) {
  await page.getByRole("button", { name: "打开报告助手" }).click();
  return page.getByRole("region", { name: "报告助手对话" });
}

async function send(page: Page, text: string) {
  await page.getByLabel("向所选 AI 服务发送当前报告与对话").check();
  await page.getByLabel("问题或修改要求").fill(text);
  await page.getByRole("button", { name: "发送给报告助手" }).click();
}

function calls(page: Page) { return page.evaluate(() => window.__mockTauri.calls.filter((call) => call.cmd === "run_report_agent")); }

test("requires explicit sending consent, keeps multi-turn context volatile and excludes history by default", async ({ page }) => {
  await launch(page, { agentResponses: [{ answer: "第一轮回答", patch: null, toolTrace: ["current_report"] }, { answer: "第二轮回答", patch: null, toolTrace: [] }] });
  const panel = await openAgent(page);
  await page.getByLabel("问题或修改要求").fill("PRIVATE_CHAT_QUESTION");
  await expect(page.getByRole("button", { name: "发送给报告助手" })).toBeDisabled();
  expect(await calls(page)).toHaveLength(0);
  await send(page, "PRIVATE_CHAT_QUESTION");
  await expect(panel).toContainText("第一轮回答");
  const first = (await calls(page))[0].args.options;
  expect(first.context).toEqual({ reportText: original, evidence: [], history: [] });
  await send(page, "请继续解释");
  await expect(panel).toContainText("第二轮回答");
  expect((await calls(page))[1].args.options.conversation).toEqual([{ role: "user", content: "PRIVATE_CHAT_QUESTION" }, { role: "assistant", content: "第一轮回答" }]);
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), history: JSON.stringify(window.__mockTauri.reportHistoryStore) }));
  expect(storage.local).not.toContain("PRIVATE_CHAT_QUESTION");
  expect(storage.history).not.toContain("PRIVATE_CHAT_QUESTION");
  await page.getByRole("button", { name: "新建对话" }).click();
  await expect(panel).not.toContainText("第二轮回答");
});

test("only includes explicitly selected historical reports and clears old context when the selection changes", async ({ page }) => {
  await launch(page);
  const panel = await openAgent(page);
  await panel.locator(".agent-context > summary").click();
  await panel.getByLabel("周报 · 历史素材").check();
  await send(page, "比较历史与本次工作");
  await expect(panel).toContainText("当前报告的结论");
  expect((await calls(page))[0].args.options.context.history).toEqual([{ title: other.title, periodLabel: other.periodLabel, reportText: other.reportText }]);
  await panel.getByLabel("周报 · 历史素材").uncheck();
  await expect(panel.locator(".agent-context-reset")).toHaveText("上下文选择已变更，已开始新对话");
  await expect(panel.getByRole("log")).not.toContainText("比较历史与本次工作");
  await expect(panel.getByRole("log")).not.toContainText("当前报告的结论");
});

test("keeps a proposed patch separate until review is accepted and preserves original statistics", async ({ page }) => {
  await launch(page, { agentResponses: [{ answer: "合并重复表述", patch: { mode: "replace", content: revised, reason: "保留全部事实" }, toolTrace: ["current_report"] }] });
  await openAgent(page);
  await send(page, "精简当前报告");
  await expect(page.getByRole("button", { name: "查看修改对照" })).toBeVisible();
  expect(await page.evaluate(() => window.__mockTauri.reportHistoryStore[0].reportText)).toBe(original);
  await page.getByRole("button", { name: "查看修改对照" }).click();
  const review = page.getByRole("region", { name: "修改建议对照" });
  await expect(review).toBeVisible();
  await expect(review.getByRole("heading", { name: "修改建议对照" })).toBeVisible();
  await expect(review.getByRole("region", { name: "原文", exact: true })).toContainText("补充单元测试");
  await expect(review.getByRole("region", { name: "建议稿", exact: true })).toContainText("并补充单元测试");
  await review.getByRole("button", { name: "采纳修改" }).click();
  await expect(review).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__mockTauri.reportHistoryStore[0].reportText)).toBe(revised);
  const stored = await page.evaluate(() => window.__mockTauri.reportHistoryStore);
  expect(stored[0]).toMatchObject({ commitCount: 2, projectCount: 1, repoCount: 1, aiEnhanced: true });
  expect(stored.some((entry) => entry.reportText === original)).toBe(true);
});

for (const failure of ["connection", "malformed"] as const) {
  test(`preserves the draft and question on ${failure} failure`, async ({ page }) => {
    await launch(page, failure === "connection" ? { agentError: "服务连接失败" } : { agentResponses: [{ answer: null }] });
    const panel = await openAgent(page);
    await send(page, "修改请求");
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("问题或修改要求")).toHaveValue("修改请求");
    expect(await page.evaluate(() => window.__mockTauri.reportHistoryStore[0].reportText)).toBe(original);
    await expect(page.getByRole("button", { name: "发送给报告助手" })).toBeEnabled();
  });
}

test("ignores a late answer after switching report and blocks conflicting operations while pending", async ({ page }) => {
  await launch(page, { deferredCommands: ["run_report_agent"], agentResponses: [{ answer: "过期答案标记", patch: null, toolTrace: [] }] });
  await openAgent(page);
  await send(page, "请分析报告");
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await expect(page.getByRole("button", { name: "生成日报" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "编辑报告" })).toBeDisabled();
  await page.getByRole("tab", { name: /最近/ }).click();
  await page.getByRole("button", { name: /周报 · 历史素材/ }).click();
  await page.evaluate(() => window.__mockTauri.releaseCommand("run_report_agent"));
  const panel = await openAgent(page);
  await expect(panel.locator(".agent-pending")).toHaveCount(0);
  await expect(panel).not.toContainText("过期答案标记");
});

test("edits locally without AI and restores the previous draft", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "编辑报告" }).click();
  await expect(page.getByRole("tab", { name: "洞察" })).toBeDisabled();
  await page.getByLabel("报告 Markdown").fill(revised);
  await page.getByRole("button", { name: "保存编辑" }).click();
  await expect(page.locator(".result-summary")).toContainText("已编辑");
  await expect.poll(() => page.evaluate(() => window.__mockTauri.reportHistoryStore[0].reportText)).toBe(revised);
  expect(await calls(page)).toHaveLength(0);
  await page.getByLabel("报告结果操作").getByRole("button", { name: "复制", exact: true }).click();
  expect(await page.evaluate(() => window.__mockTauri.clipboard)).toBe(revised);
  await page.getByRole("button", { name: "恢复编辑前版本" }).click();
  await expect(page.locator(".result-summary")).not.toContainText("已编辑");
  await page.getByLabel("报告结果操作").getByRole("button", { name: "复制", exact: true }).click();
  expect(await page.evaluate(() => window.__mockTauri.clipboard)).toBe(original);
});

for (const size of [{ width: 1440, height: 960 }, { width: 1280, height: 480 }, { width: 640, height: 450 }, { width: 320, height: 900 }]) {
  test(`renders assistant without horizontal overflow at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await launch(page, { settings: createSettings({ aiEnabled: true, aiModel: "model-test", aiApiKey: "sk-test", themeMode: size.width === 1280 ? "dark" : "light" }) });
    const panel = await openAgent(page);
    await send(page, "哪些结论还缺少证据？");
    await expect(panel).toContainText("当前报告的结论");
    for (const selector of ["html", "body", ".studio-grid", ".report-agent"]) expect(await page.locator(selector).evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "发送给报告助手" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("report-agent.png"), fullPage: true });
    const results = await new AxeBuilder({ page }).include(".report-agent").analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  });
}
