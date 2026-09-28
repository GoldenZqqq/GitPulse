import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSuccessfulCiRun,
  validateReleaseSource,
  validateReleaseTag,
} from "../../scripts/release-governance.mjs";
import {
  findLocalTagAtHead,
  stageAndPublishGitHubRelease,
} from "../../scripts/github-release.mjs";

const tempDirs = [];
const rootDir = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);

test.afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { force: true, recursive: true });
  }
});

test("accepts a clean main checkout aligned with origin/main", () => {
  const repo = createRepositoryFixture();

  const result = validateReleaseSource(repo.worktree);

  assert.equal(result.branch, "main");
  assert.equal(result.headSha, git(repo.worktree, "rev-parse", "HEAD"));
});

test("rejects release dry-run from a non-main branch", () => {
  const repo = createRepositoryFixture();
  git(repo.worktree, "switch", "-c", "feature/release-test");

  assert.throws(
    () => validateReleaseSource(repo.worktree),
    /必须在 main 分支执行/,
  );
});

test("rejects release dry-run from a dirty main worktree", () => {
  const repo = createRepositoryFixture();
  fs.writeFileSync(path.join(repo.worktree, "dirty.txt"), "dirty\n");

  assert.throws(
    () => validateReleaseSource(repo.worktree),
    /工作区必须保持干净/,
  );
});

test("rejects a main checkout that is behind origin/main", () => {
  const repo = createRepositoryFixture();
  const other = cloneRepository(repo.remote);
  writeCommit(other, "remote.txt", "remote\n", "remote advance");
  git(other, "push", "origin", "main");

  assert.throws(
    () => validateReleaseSource(repo.worktree),
    /不是最新 origin\/main/,
  );
});

test("rejects a release tag that is not an origin/main ancestor", () => {
  const repo = createRepositoryFixture();
  git(repo.worktree, "switch", "-c", "feature/tag-test");
  writeCommit(repo.worktree, "tag.txt", "tag\n", "tag commit");
  git(repo.worktree, "tag", "v9.9.9");

  assert.throws(
    () => validateReleaseTag(repo.worktree, "v9.9.9"),
    /不属于 origin\/main/,
  );
});

test("distinguishes a missing current tag from one at HEAD or another commit", () => {
  const repo = createRepositoryFixture();
  assert.equal(findLocalTagAtHead(repo.worktree, "v1.2.3"), null);

  git(repo.worktree, "tag", "v1.2.3");
  assert.equal(
    findLocalTagAtHead(repo.worktree, "v1.2.3"),
    git(repo.worktree, "rev-parse", "HEAD"),
  );

  writeCommit(repo.worktree, "later.txt", "later\n", "later commit");
  assert.throws(
    () => findLocalTagAtHead(repo.worktree, "v1.2.3"),
    /未指向当前主线提交/,
  );
});

test("accepts only a successful main push CI run for the target SHA", async () => {
  const fetchImpl = async () => jsonResponse({
    workflow_runs: [
      {
        conclusion: "success",
        event: "push",
        head_branch: "main",
        head_sha: "abc123",
        html_url: "https://example.test/runs/1",
        id: 1,
        status: "completed",
      },
    ],
  });

  const run = await assertSuccessfulCiRun({
    fetchImpl,
    githubConfig: githubConfig(),
    sha: "abc123",
  });

  assert.equal(run.id, 1);
});

test("rejects a target SHA whose main push CI completed unsuccessfully", async () => {
  const fetchImpl = async () => jsonResponse({
    workflow_runs: [
      {
        conclusion: "failure",
        event: "push",
        head_branch: "main",
        head_sha: "abc123",
        html_url: "https://example.test/runs/2",
        id: 2,
        status: "completed",
      },
    ],
  });

  await assert.rejects(
    () => assertSuccessfulCiRun({ fetchImpl, githubConfig: githubConfig(), sha: "abc123" }),
    /主线 CI 未成功/,
  );
});

test("publishes a new release only after all draft assets upload", async () => {
  const files = createReleaseAssets();
  const calls = [];
  const fetchImpl = createReleaseApiMock(calls);

  const release = await stageAndPublishGitHubRelease({
    filePaths: files,
    fetchImpl,
    githubConfig: githubConfig(),
    releasePayload: releasePayload(),
  });

  assert.equal(release.draft, false);
  assert.equal(calls.filter((call) => call.kind === "upload").length, 3);
  assert.equal(calls.at(-1).kind, "publish");
});

test("deletes its draft when an asset upload fails", async () => {
  const files = createReleaseAssets();
  const calls = [];
  const fetchImpl = createReleaseApiMock(calls, { failUploadAt: 2 });

  await assert.rejects(
    () => stageAndPublishGitHubRelease({
      filePaths: files,
      fetchImpl,
      githubConfig: githubConfig(),
      releasePayload: releasePayload(),
    }),
    /GitHub API 请求失败/,
  );

  assert.equal(calls.some((call) => call.kind === "publish"), false);
  assert.equal(calls.some((call) => call.kind === "delete-draft"), true);
});

test("deletes only the transaction-created tag when a draft upload fails", async () => {
  const files = createReleaseAssets();
  const calls = [];
  const fetchImpl = createReleaseApiMock(calls, {
    draftCreatesTag: true,
    failUploadAt: 2,
  });

  await assert.rejects(() => stageAndPublishGitHubRelease({
    filePaths: files,
    fetchImpl,
    githubConfig: githubConfig(),
    releasePayload: releasePayload(),
  }));

  assert.equal(calls.at(-1).kind, "delete-tag");
});

test("finds and cleans the draft when the create response is lost", async () => {
  const files = createReleaseAssets();
  const calls = [];
  const fetchImpl = createReleaseApiMock(calls, {
    draftCreatesTag: true,
    failDraftResponse: true,
  });

  await assert.rejects(() => stageAndPublishGitHubRelease({
    filePaths: files,
    fetchImpl,
    githubConfig: githubConfig(),
    releasePayload: releasePayload(),
  }));

  assert.equal(calls.some((call) => call.kind === "find-draft"), true);
  assert.equal(calls.some((call) => call.kind === "delete-draft"), true);
  assert.equal(calls.at(-1).kind, "delete-tag");
});

test("keeps the workspace benchmark out of default bundles without losing tests", () => {
  const metadata = JSON.parse(execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps"],
    { cwd: path.join(rootDir, "src-tauri"), encoding: "utf8" },
  ));
  const packageTargets = metadata.packages
    .find((item) => item.name === "gitpulse")?.targets || [];
  const benchmark = packageTargets
    .find((target) => target.name === "gitpulse-workspace-benchmark");

  assert.deepEqual(benchmark?.["required-features"], ["workspace-benchmark"]);
  assert.equal(
    path.relative(path.join(rootDir, "src-tauri"), benchmark?.src_path),
    path.join("src", "workspace_benchmark_cli.rs"),
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, "src-tauri", "src", "bin", "workspace_benchmark")),
    false,
  );

  const benchmarkTestCommand = [
    "cargo test --features workspace-benchmark",
    "--bin gitpulse-workspace-benchmark",
  ].join(" ");
  assert.match(
    fs.readFileSync(path.join(rootDir, ".github", "workflows", "ci.yml"), "utf8"),
    new RegExp(benchmarkTestCommand),
  );
  assert.match(
    fs.readFileSync(path.join(rootDir, "scripts", "verify-release.mjs"), "utf8"),
    /"test",\s*"--features",\s*"workspace-benchmark",\s*"--bin",\s*"gitpulse-workspace-benchmark"/,
  );
});

test("keeps a Linux desktop category so AppImage Categories is never empty", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(rootDir, "src-tauri", "tauri.conf.json"),
    "utf8",
  ));

  assert.ok(
    config.bundle?.category,
    "bundle.category 必须配置：Tauri 用它生成 Linux .desktop 的 Categories",
  );
});

test("keeps the AppImage AppDir self-check in the tag release workflow", () => {
  const releaseWorkflow = fs.readFileSync(
    path.join(rootDir, ".github", "workflows", "release.yml"),
    "utf8",
  );

  // AppImageHub 的 appdir-lint.sh 会挂载 AppImage 并要求 .DirIcon 可解析。
  // Tauri CLI <= 2.11.3 生成绝对路径软链接，用户机器上等同缺失。
  assert.match(releaseWorkflow, /--appimage-extract/);
  assert.match(releaseWorkflow, /test -e "\$appdir\/\.DirIcon"|\[ ! -e "\$appdir\/\.DirIcon" \]/);
  assert.match(releaseWorkflow, /bundle\.category/);
});

function createRepositoryFixture() {
  const root = makeTempDir("gitpulse-release-git-");
  const remote = path.join(root, "origin.git");
  const worktree = path.join(root, "worktree");
  git(root, "-c", "init.defaultBranch=main", "init", "--bare", remote);
  git(root, "clone", remote, worktree);
  git(worktree, "config", "user.name", "Release Test");
  git(worktree, "config", "user.email", "release@example.test");
  git(worktree, "switch", "-c", "main");
  writeCommit(worktree, "README.md", "fixture\n", "initial");
  git(worktree, "push", "-u", "origin", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  return { remote, worktree };
}

function cloneRepository(remote) {
  const worktree = makeTempDir("gitpulse-release-clone-");
  git(path.dirname(worktree), "clone", remote, worktree);
  git(worktree, "config", "user.name", "Release Test");
  git(worktree, "config", "user.email", "release@example.test");
  return worktree;
}

function writeCommit(repo, fileName, content, message) {
  fs.writeFileSync(path.join(repo, fileName), content);
  git(repo, "add", fileName);
  git(repo, "commit", "-m", message);
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeTempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function createReleaseAssets() {
  const directory = makeTempDir("gitpulse-release-assets-");
  return ["GitPulse.exe", "GitPulse.exe.sig", "gitpulse-latest.json"].map((name) => {
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, name);
    return filePath;
  });
}

function githubConfig() {
  return {
    apiBaseUrl: "https://api.example.test",
    repo: "owner/repo",
    token: "test-token",
    webBaseUrl: "https://example.test",
  };
}

function releasePayload() {
  return {
    body: "Release body",
    name: "GitPulse v1.2.3",
    tagName: "v1.2.3",
    targetCommitish: "abc123",
  };
}

function createReleaseApiMock(
  calls,
  { draftCreatesTag = false, failDraftResponse = false, failUploadAt = 0 } = {},
) {
  let uploadCount = 0;
  let draftCreated = false;
  return async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method || "GET";
    if (url.pathname.endsWith("/releases/tags/v1.2.3")) {
      calls.push({ kind: "lookup" });
      return jsonResponse({ message: "Not Found" }, 404);
    }
    if (url.pathname.endsWith("/releases") && method === "POST") {
      calls.push({ kind: "create-draft" });
      draftCreated = true;
      if (failDraftResponse) return jsonResponse({ message: "response lost" }, 500);
      return jsonResponse({
        assets: [],
        draft: true,
        html_url: "https://example.test/releases/1",
        id: 1,
        upload_url: "https://uploads.example.test/repos/owner/repo/releases/1/assets{?name,label}",
      }, 201);
    }
    if (url.hostname === "uploads.example.test") {
      uploadCount += 1;
      calls.push({ kind: "upload", name: url.searchParams.get("name") });
      if (uploadCount === failUploadAt) return jsonResponse({ message: "upload failed" }, 500);
      return jsonResponse({ id: uploadCount, name: url.searchParams.get("name") }, 201);
    }
    if (url.pathname.endsWith("/releases/1") && method === "GET") {
      calls.push({ kind: "inspect-draft" });
      return jsonResponse({ draft: true, id: 1 });
    }
    if (url.pathname.endsWith("/releases") && url.searchParams.get("per_page") === "100") {
      calls.push({ kind: "find-draft" });
      return jsonResponse(draftCreated ? [{ draft: true, id: 1, tag_name: "v1.2.3" }] : []);
    }
    if (url.pathname.endsWith("/releases/1") && method === "DELETE") {
      calls.push({ kind: "delete-draft" });
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/git/ref/tags/v1.2.3") && method === "GET") {
      calls.push({ kind: "lookup-tag" });
      if (!draftCreatesTag || !draftCreated) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ object: { sha: "abc123", type: "commit" }, ref: "refs/tags/v1.2.3" });
    }
    if (url.pathname.endsWith("/git/refs/tags/v1.2.3") && method === "DELETE") {
      calls.push({ kind: "delete-tag" });
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/releases/1") && method === "PATCH") {
      calls.push({ kind: "publish" });
      return jsonResponse({ draft: false, html_url: "https://example.test/releases/1", id: 1 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
