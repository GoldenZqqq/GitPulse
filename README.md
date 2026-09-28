<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand-dark.png" />
  <img src="public/brand-light.png" alt="GitPulse" width="300" />
</picture>

### 本地优先的 Git 工作报告生成器

<em>Local-first Git work reports — turn scattered commits into daily, weekly, custom &amp; monthly reports in one click.</em>

把散落在多个仓库里的提交，**一键**变成可直接交付的日报、周报、自定义区间报告和绩效月报。数据全程不出本机。

<br />

[![Release](https://img.shields.io/github/v/release/GoldenZqqq/GitPulse?style=flat-square&color=01A3B0&label=release)](https://github.com/GoldenZqqq/GitPulse/releases)
[![Downloads](https://img.shields.io/github/downloads/GoldenZqqq/GitPulse/total?style=flat-square&color=FD7319&label=downloads)](https://github.com/GoldenZqqq/GitPulse/releases)
[![License](https://img.shields.io/github/license/GoldenZqqq/GitPulse?style=flat-square&color=01A3B0)](LICENSE)
[![Stars](https://img.shields.io/github/stars/GoldenZqqq/GitPulse?style=flat-square&color=FD7319)](https://github.com/GoldenZqqq/GitPulse/stargazers)

![Windows](https://img.shields.io/badge/Windows-x86__64-2A5E8C?style=flat-square&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-universal-000000?style=flat-square&logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage-444444?style=flat-square&logo=linux&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-DEA584?style=flat-square&logo=rust&logoColor=white)

<b><a href="https://goldenzqqq.github.io/GitPulse/">官网</a> · <a href="#-下载与安装">下载</a> · <a href="#-快速开始">快速开始</a> · <a href="#-功能特性">功能</a> · <a href="#-ai-润色">AI 润色</a> · <a href="#-本地开发">开发</a></b>

</div>

<br />

<div align="center">
  <a href="docs/gitpulse-demo.mp4">
    <img src="docs/gitpulse-demo.gif" alt="GitPulse 操作流程演示" width="820" />
  </a>
  <p><sub>▲ 操作流程演示 · <a href="docs/gitpulse-demo.mp4">点此查看高清 MP4</a></sub></p>
</div>

---

## 🌟 为什么是 GitPulse

每到周五、月底，写日报和绩效月报都是一件麻烦事：要翻多个仓库的 git log、手动拼凑、再润色成人话。GitPulse 把这件事自动化——

- **本地优先**：所有扫描、提取、生成都在本机用 Rust 完成，提交记录与 API Key 不上传任何服务器。
- **多仓库聚合**：指向工作区目录，自动发现下面所有 Git 仓库，按作者和时间一次性汇总。
- **直接能交付**：输出按项目分组、结构清晰的报告，可一键复制进周报系统，或导出 Markdown、Word、PDF 文件。
- **轻量**：基于 Tauri，安装包小、启动快，不依赖 Python 或任何运行时。

## ✨ 功能特性

| | |
|---|---|
| 🔍 **仓库扫描** | 扫描工作区目录下的所有 Git 仓库，自动读取本机 git 作者 |
| 📅 **灵活提取** | 按作者、日期区间、当前分支或全部分支提取 commit |
| 🏷️ **项目名映射** | 把仓库名/分支映射成中文项目名，例如 `api-service(*) -> 后端服务-` |
| 📰 **日报 / 周报** | 一键生成当天提交摘要，也可按本周生成项目分组周报 |
| 🗓️ **自定义区间** | 任意起止日期生成报告 |
| 📊 **绩效月报** | 可选择任意月份生成月报，按项目拆分为「项目进度 / 实际完成情况 / 当月总结」 |
| ➕ **补充工作事项** | 把会议、设计、联调、上线支持等非 Git 事实纳入报告与历史记录 |
| 🤖 **可审计 AI 润色（可选）** | 支持 OpenAI 兼容、Anthropic 原生与实验性 Codex OAuth；接受前可查看原稿/润色稿差异，失败自动回退本地模板 |
| 🤖 **报告助手（可选）** | 对话式分析当前报告、附加提交证据与显式选定的历史报告；只读工具返回修改建议，接受前人工审阅，可在报告侧栏直接对话 |
| ✏️ **本地编辑** | 不依赖 AI 直接编辑报告 Markdown，保存后标记「已编辑」，可随时恢复编辑前版本 |
| 🩺 **工作区健康** | 识别不可访问、重复或状态异常的仓库，并支持搜索、批量启停与快速重扫 |
| 🗂️ **本地报告历史** | 使用带备份恢复的 Tauri 文件存储保存历史，并按项目回看提交、证据、AI 与导出状态 |
| 🔄 **脱敏配置迁移** | 导入/导出作者别名、项目映射、证据规则和模板，不包含 API Key 等敏感凭据 |
| 📋 **预览 / 复制 / 导出** | 实时预览、一键复制到剪贴板、按需导出 Markdown、Word 文档或 PDF |
| 🌗 **明暗主题** | 跟随系统自动切换深色 / 浅色 |
| ⬆️ **在线更新** | 支持 Windows x86_64 在应用内检查并安装更新 |

## 📦 下载与安装

### 直接下载（推荐）

前往 **[Releases](https://github.com/GoldenZqqq/GitPulse/releases)** 下载对应平台的安装包：

- **Windows** — `.exe`（NSIS 安装包），安装后可在应用内一键检查更新
- **macOS** — `.dmg` 或 `.app.zip`（通用包，同时支持 Apple Silicon 与 Intel）
- **Linux** — `.AppImage`（单文件，`chmod +x` 后直接运行）

> **macOS 首次打开**：当前 macOS 包未做 Apple 签名，首次启动可能被 Gatekeeper 拦截。若下载 `.app.zip`，请先解压并将 GitPulse.app 拖入「应用程序」。
> 然后**右键点按** GitPulse.app 选「打开」，或在终端执行：
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/GitPulse.app
> ```
>
> **自动更新目前仅 Windows 支持**；macOS / Linux 请到 Releases 页面手动下载新版本。

### 从源码构建

```bash
git clone https://github.com/GoldenZqqq/GitPulse.git
cd GitPulse
npm install
npm run tauri build      # 产物位于 src-tauri/target/release/bundle/
```

## 🚀 快速开始

首次启动会有引导流程，整体只需四步：

1. **选择工作区目录** — 指向你存放代码的根目录，GitPulse 自动扫描其中的所有 Git 仓库。
2. **确认作者与范围** — 自动读取本机 git 作者（也可手动填写），选择日期区间与分支范围。
3. **一键生成** — 选择「日报 / 周报 / 自定义区间 / 绩效月报」，提交记录会按项目分组汇总成报告。
4. **复制或保存** — 预览结果，一键复制到剪贴板，或按需保存为 Markdown、Word、PDF；需要的话开启 AI 润色，或用报告助手直接对报告提问、改写。

> **项目名映射**：在设置里维护映射规则，把仓库或分支变成可读的项目名。
> 支持 `project(branch) -> 显示名-` 与 `project(*) -> 显示名-` 两种格式，例如 `api-service(*) -> 后端服务-`。

## 🤖 AI 润色

在设置中开启 AI 润色后，按服务填写以下内容即可：

- **协议**：`OpenAI Compatible` 或 `Anthropic Native`
- **Base URL**：例如 `https://api.openai.com/v1` 或 `https://api.anthropic.com/v1`
- **可选预设**：协议选择 `OpenAI Compatible` 后可一键填入 OrcaRouter（Base URL `https://api.orcarouter.ai/v1`、模型 `orcarouter/auto`），再粘贴自己的 OrcaRouter API Key 即可
- **API Key**：输入一次后自动保存到系统凭据库；也可填写 `OPENAI_API_KEY` / `env:OPENAI_API_KEY` 这类环境变量引用
- **模型**：可手动填写，或点「获取模型」从服务返回列表中选择

> 真实 API Key 和 ChatGPT 登录态不会写入普通设置文件，而是交给系统凭据库保存。清空输入框会删除已保存密钥。如果 AI 调用失败，应用会**自动回退到本地月报模板**，不影响出报告。

### 报告助手（可选，与 AI 润色共用 AI 配置）

在报告侧栏打开「报告助手」后，可以：

- 对当前报告提问（如「哪些结论还缺少证据？」），或要求精简、翻译、改写；
- 可选附加**提交证据**与**历史报告**作为上下文——两者都默认不发送，需要显式勾选，且勾选变化会重置会话以避免旧上下文残留；
- 助手只通过只读工具访问报告、证据和选定历史，不会执行写操作；它返回的**修改建议**需要你点开对照面板逐条确认后才应用到报告。

> 对话只在本次报告会话中保留，不写入本地存储。修改建议应用前可对照原稿/建议稿，随时放弃。若 AI 输出被模型的单次上限截断，界面会明确提示「请缩短报告或改用输出上限更高的模型」，不会把截断的半成品当成结果。

### 本地编辑（不依赖 AI）

「编辑报告」直接打开 Markdown 编辑器：保存后报告标记为「已编辑」，工具栏可随时**重置本次编辑**或**恢复编辑前版本**；退出时若存在未保存改动会先确认。

## 🛠️ 技术栈

```text
Tauri 2  ·  React 19  ·  Vite  ·  Rust  ·  lucide-react
```

- `src/` — React 前端（状态、布局、预览、交互）
- `src-tauri/src/git_ops.rs` — 本地 Git 仓库发现与提交提取（Rust）
- `src-tauri/src/report.rs` — 报告渲染与文件输出
- `src-tauri/src/ai.rs` — 可选的 OpenAI 兼容 / Anthropic 原生润色
- `src-tauri/src/lib.rs` — Tauri 命令

> 旧版 Python/Tkinter 实现已归档在分支 `codex/legacy-python-desktop`。

## 🧑‍💻 本地开发

环境要求：[Node.js](https://nodejs.org/) 与 [Rust 工具链](https://www.rust-lang.org/tools/install)。

```bash
npm install            # 安装依赖
npm run tauri dev      # 启动桌面应用（开发模式）
npm run dev            # 仅启动前端（浏览器预览）
npm run verify:release # 发版前检查
npm run tauri build    # 构建安装包
```

官网本地预览：

```bash
cd site
npm install
npm run dev
```

官网使用 Astro 6，建议使用 Node.js 22.12+。`site/.node-version` 已声明当前验证版本，`mise` / `asdf` / `nodenv` 等工具可自动读取。官网采用路径型国际化：`/GitPulse/` 会按浏览器语言或用户上次选择跳转到 `/GitPulse/zh-CN/` 或 `/GitPulse/en/`。

提交前的校验：

```bash
npm run build
cd src-tauri && cargo check && cargo test
```

> 版本号同步、发版与在线更新的完整流程见 **[CONTRIBUTING.md](CONTRIBUTING.md)**。

## 🤝 贡献

欢迎 Issue 与 PR！可通过[产品反馈表](https://github.com/GoldenZqqq/GitPulse/issues/new?template=product-feedback.yml)提交脱敏的使用场景；当前方向与进入实现门槛见[产品验证计划](docs/product-validation-plan.md)。开发规范、验证步骤与发布流程请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

基于 [MIT](LICENSE) 许可证开源。

<div align="center">
<br />
如果 GitPulse 帮你省下了写日报的时间，点个 ⭐ <a href="https://github.com/GoldenZqqq/GitPulse/stargazers">Star</a> 支持一下吧！
</div>
