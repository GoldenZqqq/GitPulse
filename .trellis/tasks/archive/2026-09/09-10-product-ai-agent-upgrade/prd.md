# 产品体验与 AI Agent 工作台升级

## Goal

把 GitPulse 从“生成并润色报告”升级为一个可信的本地优先报告工作台：用户可以在当前报告上下文中向 AI 助手提问、查阅可追溯的提交证据，并提出可审阅的修改建议；同时改善报告编辑、状态反馈、隐私说明和窄屏布局。

## Background And Confirmed Facts

- GitPulse 已支持日报、周报、自定义区间、月报、多仓库扫描、补充事项、报告历史、项目回顾、Markdown/Word/PDF 导出、工作区健康和三类 AI 润色提供商。
- AI 润色目前是单轮 rewrite，已有原稿/润色稿对照、事实风险提示和接受/保留流程（`src/components/ReportPolishReviewPanel.tsx`、`src/hooks/useReportWorkflow.ts`）。
- 主工作台已经具备“报告 + 本次范围”双栏结构、洞察/健康视图、响应式布局和共享弹层焦点管理（`src/components/ReportCanvas.tsx`、`src/components/WorkbenchAssistRail.tsx`、`src/styles/workbench*.css`）。
- Rust 已有统一 AI 请求、代理、凭据存储和 Tauri 薄命令边界（`src-tauri/src/ai.rs`、`src-tauri/src/lib.rs`、`src-tauri/src/models.rs`）。
- 产品约束是本地优先、AI 可选、报告即使没有 AI 也必须有用；原始 API Key 不得写入普通持久化配置。
- 基线回归已验证：`npm run test:e2e -- tests/e2e/workbench.spec.ts tests/e2e/responsive-hardening.spec.ts tests/e2e/accessibility.spec.ts`，28 项通过（约 1.9 分钟）。

## Requirements

### R1. 可审计 AI 报告助手

1. 在已有报告结果区提供“报告助手”入口，入口只在有报告且 AI 已配置时启用；未配置时展示明确的设置引导。
2. 支持连续多轮问答。助手可回答当前报告摘要、解释证据、提出结构调整建议和语言风格修改。
3. 助手上下文必须由用户可见、可控制：当前报告正文默认可用；提交证据、补充事项、历史报告必须通过独立开关/确认加入。发送前展示数据范围与隐私提示。
4. Agent 仅能调用只读本地工具：读取当前报告上下文、检索当前范围的已提取提交、读取用户明确选择的历史报告。禁止终端、文件写入、仓库修改和自动导出。
5. Agent 输出结构化为 `answer`、`suggestion` 或 `report_patch`；`report_patch` 必须进入现有对照审阅流程，用户接受前不能覆盖正文。
6. 请求失败、模型输出非法或超出步骤/文本预算时，保留当前报告并显示可操作错误；AI 不可用不阻塞本地生成和编辑。
7. 对话仅保存在当前运行内存中，关闭或重新打开报告后清空，不写入报告历史，不把 API Key 或完整对话写入 localStorage。

### R2. 报告编辑与可恢复交互

1. 生成报告后允许用户直接编辑 Markdown 草稿；编辑状态明确标识为“本地编辑稿”。
2. 提供撤销本地编辑和恢复最近已接受版本；编辑内容可复制、导出或送入 AI 对照。
3. 直接编辑不改变 Git 提交数、项目数、证据计数或报告历史统计；用户保存/导出前显示内容已被编辑的状态。

### R3. 工作台体验与视觉审查修正

1. 维持现有“报告生成阶段 / 结果阶段”条件渲染、范围条、右侧范围栏和当前主操作优先级。
2. 报告助手作为右侧辅助栏的第四个可折叠视图或结果区内联面板，不引入嵌套卡片、营销式大面积装饰或隐藏主操作。
3. 所有新增控件具备可见标签、焦点态、禁用态、加载态、错误态和空状态；使用已有 `useOverlayFocus` 和 Lucide 图标。
4. 在 320px、短窗口、200% 等效视口和明暗主题下不产生横向溢出或内容遮挡。
5. 更新产品文档，说明 Agent 的只读工具边界、上下文发送范围、对话生命周期和报告修改确认流程。

## Acceptance Criteria

- [ ] 有报告时能打开报告助手并完成一轮 mock Tauri 对话；请求 payload 与 `models.rs` camelCase 结构一致。
- [ ] 助手能在 mock 工具响应下返回答案，并能生成一个进入原有对照审阅的报告修改建议。
- [ ] 未配置 AI、空报告、请求失败、非法结构化输出和超出 Agent 步骤上限均有明确状态且当前正文不变。
- [ ] 上下文开关可证明默认不发送提交/历史内容，显式开启后才发送；对话不进入报告历史/localStorage。
- [ ] 本地编辑、撤销、恢复、复制和导出流程保留统计字段与历史语义。
- [ ] `npm run build`、相关 Playwright（a11y、responsive、工作台、Agent）通过；Rust `cargo fmt -- --check`、`cargo check`、`cargo test` 通过；`git diff --check` 通过。
- [ ] 完成一次 UI 审查记录：页面层级、状态覆盖、移动端边界、明暗主题和键盘导航均有证据。

## Out Of Scope

- 自动执行 shell、Git 写操作、网络搜索、自动提交、自动导出或后台常驻 Agent。
- 云端对话同步、团队共享、定时任务、计费系统和新的 AI 提供商协议。
- 修改历史报告正文的不可逆批量迁移。

## Open Questions

- 无阻塞问题。默认采用“当前报告上下文 + 用户显式勾选证据/历史”的隐私策略，并先交付单一只读报告助手。
