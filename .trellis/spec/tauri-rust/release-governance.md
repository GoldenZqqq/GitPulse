# Release Governance Contract

## 1. Scope / Trigger

Apply this contract when changing version files, `release:win:*`, updater manifests, GitHub Release API behavior, `.github/workflows/release.yml`, or release verification. It prevents a local branch, stale main checkout, untested version commit, or partial asset upload from becoming a public desktop release.

## 2. Signatures

```text
npm run test:release-governance
npm run release:win -- --dry-run
npm run release:win:minor -- --dry-run
npm run release:win[:patch|:minor|:major]
npm run release:win:set -- X.Y.Z
npm run release:win:current
node scripts/check-release-source.mjs --tag vX.Y.Z
```

Core module boundaries:

```js
validateReleaseSource(rootDir) -> { branch, headSha, remoteSha }
validateReleaseTag(rootDir, tagName) -> { tagSha, remoteSha }
waitForSuccessfulCiRun({ githubConfig, sha }) -> workflowRun
stageAndPublishGitHubRelease({ filePaths, githubConfig, releasePayload }) -> release
```

## 3. Contracts

- Local release source is a clean, named `main` with `HEAD === origin/main` after fetch. Dry-run performs this check before showing success.
- `npm run verify:release` 当前执行默认 patch dry-run；minor、major 或显式版本发布还必须运行对应的 `release:win:minor|major|set -- --dry-run`，确认目标版本而不是只验证发布源。
- Bump/set mode updates the five version files, commits and pushes `main`, waits for a successful `CI` push run on that exact SHA, then fetches again before building.
- `current` mode is only the recovery path after a version commit was pushed but release did not finish: the current-version tag must still be absent, then the normal new draft transaction resumes. Published Windows assets are immutable and the command refuses an existing tag.
- New release tags use `vX.Y.Z`, must not already exist, and target the verified main SHA.
- New Windows assets are uploaded to a draft Release. Only after `.exe`, `.exe.sig`, and `gitpulse-latest.json` all upload does the script publish the draft and make it latest.
- Before draft creation the API must confirm both Release and tag ref are absent. Failure cleanup may delete a tag only when no published Release exists and the new ref points exactly to this transaction's verified SHA.
- If the draft-create response is lost, cleanup lists authorized releases, finds only a still-draft record with the exact transaction tag, and then applies the same guarded cleanup.
- The tag workflow independently verifies that the tag commit is an `origin/main` ancestor and that the exact SHA has a successful `CI` push run before starting macOS/Linux builds.
- `GITPULSE_GITHUB_TOKEN` needs `Contents: Read and write` plus `Actions: Read`. Signing material stays in `.release.env.local` or environment variables.
- Optional CI wait overrides are positive millisecond values: `GITPULSE_RELEASE_CI_TIMEOUT_MS` and `GITPULSE_RELEASE_CI_POLL_MS`.
- The Linux build job must verify the produced AppImage AppDir before any upload: `.DirIcon` resolves, `.DirIcon` is not an absolute-path symlink, `AppRun` is executable, exactly one root `.desktop` file, and `Categories` is non-empty.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Branch is not `main` or is detached | Reject before version preview, build, tag, or API access. |
| Worktree is dirty | Reject and list no release as successful. |
| `HEAD !== origin/main` after fetch | Reject as stale/diverged main. |
| Target version tag already exists | Reject in every local publish mode; never replace published Windows assets in place. |
| Version commit has no CI run yet | Poll until bounded timeout. |
| Exact-SHA main CI completes unsuccessfully | Reject before package build. |
| Main advances while waiting for CI | Reject on the second source validation. |
| Tag is not an `origin/main` ancestor | Release workflow validate job fails; build jobs do not start. |
| Draft asset upload fails | Delete it only if still draft; delete a transaction-created tag only when it exactly matches the verified SHA and no published Release exists. |
| Draft publish succeeds | Fetch tag, confirm main ancestry, then verify latest manifest version. |

## 5. Good / Base / Bad Cases

- Good: clean latest main creates a version commit, its main CI succeeds, Windows assets stage completely, the draft publishes, and the validated tag triggers macOS/Linux packaging.
- Base: dry-run from clean latest main prints the next version and file updates without reading signing keys or writing files.
- Bad: a feature branch, stale main, failed-CI SHA, off-main tag, or failed second asset upload cannot start or complete a public release.

## 6. Tests Required

- `tests/scripts/release-governance.test.mjs`: clean latest main, non-main, stale main, tag ancestry, exact-SHA CI success/failure, draft success, draft cleanup, and exact transaction-tag cleanup.
- The same test file also locks the Linux packaging contract: `bundle.category` stays configured and `release.yml` keeps the AppImage AppDir self-check (`--appimage-extract`, `.DirIcon`, `bundle.category`).
- Main CI runs `npm run test:release-governance` as an independent job.
- Parse both workflow YAML files after edits and assert the release build job depends on `validate`.
- Release-impacting changes still run frontend build/E2E, Rust fmt/check/test, real Windows WebView smoke, and `git diff --check`.
- Before a real release, run `npm run verify:release`; use `--package` only where signing material and Windows packaging are available.

## 7. Wrong vs Correct

### Wrong

```text
feature branch -> build -> push tag -> create Release -> upload assets one by one
```

The tag becomes public before the source, CI result, and asset set are trustworthy.

### Correct

```text
clean latest main -> version commit/push -> exact-SHA CI success -> build
-> upload all assets to draft -> publish draft/tag -> workflow ancestry + CI gate
```

No normal new-release path moves an existing tag or publishes a partially uploaded draft.

## Developer Binary Bundle Isolation

**Symptom**: The macOS universal release build compiles the main app but fails while bundling because it tries to copy `gitpulse-workspace-benchmark` from the universal target directory, where that auxiliary binary was not built.

**Cause**: Cargo auto-discovers `src-tauri/src/bin/*` targets. Tauri's bundle step can treat those targets as desktop binaries even when they are only release-engineering tools; cross-target universal builds do not necessarily produce each auxiliary binary.

**Contract**: Every developer-only Cargo binary must use an explicit opt-in feature through `required-features` and keep its entry file plus support modules outside Cargo's auto-discovered `src/bin` directory. `gitpulse-workspace-benchmark` uses `workspace-benchmark` with `src/workspace_benchmark_cli.rs` and `src/workspace_benchmark/`; default `tauri build` must therefore see only production desktop binaries. CI and `verify:release` must separately run the feature-gated benchmark tests so bundle isolation cannot reduce test coverage silently.

**Release rule**: A fix made after a tag is published must not be backfilled into that immutable tag. Publish a new patch version and require its macOS job to upload at least one `.app.zip` or `.dmg` before declaring cross-platform packaging complete.

**Validation**:

```text
gh run view <mac-linux-workflow-id> --json status,conclusion,jobs
gh release view vX.Y.Z --json assets --jq '.assets[].name'
```

## AppImage AppDir Contract

**Symptom**: AppImageHub (appimage.github.io) 收录测试报 `FATAL: .DirIcon is missing in /tmp/.mount_xxx`，Linux 桌面集成也拿不到图标。

**Cause**: Tauri CLI `<= 2.11.3` 的 appimage bundler 用**绝对路径**创建 `.DirIcon` 与根 `.desktop` 软链接（指向构建机的 `target/release/bundle/appimage/<Product>.AppDir/...`）。测试脚本用 `[ -e "$APPDIR/.DirIcon" ]` 判断，`-e` 会跟随软链接，悬空链接等于缺失。上游修复见 tauri-apps/tauri#15110 / #15596，`2.11.4` 起改为相对链接。

**Contract**: `@tauri-apps/cli` 必须 `>= 2.11.4`（当前锁 `^2.12.0`）；`tauri.conf.json` 的 `bundle.category` 必须配置，否则 Tauri 生成的 `.desktop` 是 `Categories=`（空），appdir-lint 与 `desktop-file-validate` 会继续挑刺。AppImage 打包后由 `release.yml` 的 `Verify AppImage AppDir` 步骤自检，不通过就不上传资产。

**Validation**:

```text
npm run test:release-governance
"<product>.AppImage" --appimage-extract && readlink squashfs-root/.DirIcon   # 必须是相对路径
```
