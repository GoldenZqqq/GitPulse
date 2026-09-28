# Contributing

Thanks for improving GitPulse.

## Setup

```bash
npm install
npm run tauri dev
```

## Verification

Run these before opening a PR:

```bash
npx playwright install chromium   # 首次运行浏览器 e2e 前执行一次
npm run test:release-governance
npm run build
npm run test:e2e:a11y
npm run test:e2e:responsive
npm run test:e2e
cd src-tauri
cargo fmt -- --check
cargo check
cargo test
cargo test --features workspace-benchmark --bin gitpulse-workspace-benchmark
```

GitHub Actions 在每个 `pull_request` 和 `main` 推送上运行 frontend smoke、browser mocked Playwright、a11y/响应式专项、生产构建、Rust `fmt/check/test`、workspace benchmark 专项测试与 `git diff --check`。Windows 还会运行真实 Tauri WebView smoke；Linux 不伪装桌面 WebView，只执行 browser mocked + Rust 门禁。macOS 安装包由 release workflow 在 tag 发布后构建，不参与当前 CI smoke。

### Windows Tauri WebView smoke

真实桌面 smoke 仅在 Windows 上运行，验证应用启动、首次引导跳过、工作台可见，以及 `get_git_identity` 本地命令往返。该流程不会调用 AI、更新器、GitHub API 或远程 Git。

首次本地运行需要：

- 安装与当前 Microsoft Edge **WebView2 Runtime** 版本一致的 `msedgedriver.exe` 并加入 `PATH`。桌面 Edge 浏览器与 WebView2 Runtime 可能版本不同，必须以 `Microsoft\EdgeWebView\Application` 下的 Runtime 版本为准。
- 执行 `cargo install tauri-driver --locked`。

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
npm run build:tauri:smoke
npm run test:tauri-smoke -- src-tauri/target/debug/gitpulse.exe
```

失败产物写入 `artifacts/tauri-smoke/`，包括 driver 标准输出、错误输出、应用交互日志、结构化摘要和可用时的截图。非 Windows 执行 `npm run test:tauri-smoke` 会明确跳过并返回成功；跨平台布局与交互仍由 Playwright 专项负责。

For release-level verification:

```bash
npm run tauri build
```

## Guidelines

- Keep local Git and filesystem access in Rust commands.
- Keep the React frontend focused on state, layout, preview, and interactions.
- Do not persist real API keys in plain app settings. AI integrations may persist direct keys only through OS-backed secure storage; plain settings should store only safe references such as `OPENAI_API_KEY` or `env:OPENAI_API_KEY`.
- Preserve the project mapping format: `project(branch) -> DisplayName-` and `project(*) -> DisplayName-`.
- Keep generated files and local reports out of version control.

## 版本与发布

> 面向维护者，普通使用者无需关心。

### 同步版本号

```bash
# 仅同步版本号到 package.json / package-lock.json / Tauri / Cargo
npm run version:patch
npm run version:minor
npm run version:major
npm run version:set -- 1.2.3
```

### 本地打包（不上传）

```bash
npm run build:patch
npm run build:minor
npm run build:major
```

### 生成 release notes 草稿

```bash
# 根据上一个 tag..HEAD 的提交生成下个 patch 版本的说明草稿
npm run release:notes
# 或为指定版本生成草稿
npm run release:notes:set -- 0.1.1
# 默认对比范围过大时，手动指定起始 tag / ref
node ./scripts/generate-release-notes.mjs patch --from-tag 82d4287
```

### 发布到 GitHub Release（含在线更新包）

```bash
# 发版前门禁：发布治理、smoke、前端、Rust、diff check 与发布计划 dry-run
npm run verify:release
# 需要连本机 Windows 安装包也一起验证时（要求签名环境）
npm run verify:release -- --package

# Windows PowerShell：首次准备配置文件
Copy-Item .release.env.example .release.env.local

# 升级版本、构建、签名并发布到 GitHub Release
npm run release:win            # 等价于 patch
npm run release:win:patch
npm run release:win:minor
npm run release:win:major
npm run release:win:set -- 1.2.3

# 完成已提交但尚未打 tag 的当前版本；已发布版本不会被覆盖
npm run release:win:current

# 预览升级计划：不写文件、不构建、不上传
npm run release:win -- --dry-run
```

发布前在 `.release.env.local` 中配置签名与 GitHub Token：

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=C:\Users\YourName\.gitpulse\updater\gitpulse-updater.key
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=replace-with-your-signing-password

GITPULSE_GITHUB_TOKEN=github_pat_xxx
# 可选，不填时默认从 git remote origin 自动推断
GITPULSE_GITHUB_REPO=GoldenZqqq/GitPulse
# 可选，优先使用本地 markdown 文件作为 GitHub Release 正文
GITPULSE_RELEASE_NOTES_FILE=release-notes/v0.1.1.md
```

`npm run release:win*` 会自动：

- 要求当前位于干净且与 `origin/main` 完全同步的 `main`；dry-run 也执行这项校验
- 提交并推送版本号同步改动（提交信息 `chore: 发布 vX.Y.Z`）
- 等待该版本提交的 `CI` main push run 全部成功，并再次确认主线没有前进
- 构建、签名 Windows 资产，在 draft Release 中完整上传 `.exe`、`.exe.sig` 与 `gitpulse-latest.json`
- 资产齐全后发布 draft，由 GitHub 在已验证的 main 提交上创建 `vX.Y.Z` tag；上传失败会清理本次 draft

Tauri updater 固定读取 `https://github.com/GoldenZqqq/GitPulse/releases/latest/download/gitpulse-latest.json`。Token 需要 GitHub `Contents: Read and write` 与 `Actions: Read` 权限。若存在 `release-notes/vX.Y.Z.md`，发布脚本会优先用它作为 release 正文；否则回退到 `GITPULSE_RELEASE_NOTES` 或默认模板。

### 跨平台安装包（macOS / Linux）

macOS 与 Linux 包不在本地构建（Tauri 必须在对应系统上打包），由 GitHub Actions 自动补齐：

- 上面的 `release:win*` 发布 draft 并创建 `vX.Y.Z` tag 后，`.github/workflows/release.yml` 先验证 tag 属于 `origin/main` 且对应主线 CI 成功，再在 macOS / Ubuntu runner 上分别构建**通用 `.dmg`**（Intel + Apple Silicon）与 **Linux `.AppImage`**，并追加到同一个 Release。
- CI 用基础 `tauri.conf.json` 构建（**不带** `--config tauri.release.conf.json`），不生成 updater 产物，因此**不需要签名私钥、无需配置任何 secret**（仅用默认 `GITHUB_TOKEN` 上传资产）。
- macOS 包**未签名**：用户首次打开需右键「打开」或执行 `xattr -dr com.apple.quarantine`。
- **自动更新仅 Windows**：macOS / Linux 不参与 updater，发新版后用户到 Releases 手动下载即可。
- **AppImage 必须带可解析的 `.DirIcon`**：Tauri CLI `<= 2.11.3` 会把它造成指向构建机绝对路径的软链接（用户机器上等同缺失，AppImageHub 收录测试会报 `FATAL: .DirIcon is missing`）。因此 `@tauri-apps/cli` 锁定 `>= 2.11.4`，`tauri.conf.json` 的 `bundle.category` 保持配置（生成 `.desktop` 的 `Categories`），`release.yml` 中的 `Verify AppImage AppDir` 步骤会在上传前解包自检。
- 想对**已存在的 tag** 补传 mac/Linux 包：在 GitHub Actions 里手动运行该 workflow（`workflow_dispatch`）并填入对应 tag。

> 修改 `tauri.release.conf.json`、发布脚本或 updater manifest 契约时，必须同步 release-governance 测试、`.github/workflows/release.yml` 与 `.trellis/spec/tauri-rust/release-governance.md`。
