// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  OrchestrationShellSnapshot,
  ProjectId,
  ProjectInventory,
  ProjectWorkspaceContext,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderSession,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import type { ExecuteGitResult } from "../vcs/GitVcsDriver.ts";
import { ServerConfig } from "../config.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { GitVcsDriver, layer as GitLayer } from "../vcs/GitVcsDriver.ts";
import { makeGitInventory } from "../vcs/projectInventory.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { makeProjectInventoryQuery } from "./projectInventoryQuery.ts";

const decodeSnapshot = Schema.decodeUnknownSync(OrchestrationShellSnapshot);
const encodeInventory = Schema.encodeSync(Schema.fromJsonString(ProjectInventory));
const encodeWorkspace = Schema.encodeSync(Schema.fromJsonString(ProjectWorkspaceContext));
const encodeInventoryValue = Schema.encodeSync(ProjectInventory);
const at = "2026-10-01T00:00:00.000Z";
const projectId = ProjectId.make("project-a");
const git = (cwd: string, args: string[]) =>
  NodeChildProcess.execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
  });
function fixture() {
  const root = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nebula-e41-fixture-")),
  );
  const repo = NodePath.join(root, "repo");
  NodeFS.mkdirSync(repo);
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  NodeFS.writeFileSync(NodePath.join(repo, "tracked.txt"), "initial\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "fixture"]);
  const sha = git(repo, ["rev-parse", "HEAD"]).trim();
  const taskPath = NodePath.join(root, "task"),
    integrationPath = NodePath.join(root, "integration"),
    detachedPath = NodePath.join(root, "detached\ncheckout"),
    missingPath = NodePath.join(root, "missing");
  git(repo, ["worktree", "add", "-b", "task", taskPath]);
  git(repo, ["worktree", "add", "-b", "integration", integrationPath]);
  git(repo, ["worktree", "add", "--detach", detachedPath]);
  git(repo, ["worktree", "lock", "--reason", "fixture lock", integrationPath]);
  git(repo, ["worktree", "add", "-b", "missing", missingPath]);
  NodeFS.rmSync(missingPath, { recursive: true });
  git(repo, ["branch", "unattached"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", sha]);
  NodeFS.writeFileSync(NodePath.join(taskPath, "tracked.txt"), "dirty but preserved\n");
  NodeFS.writeFileSync(NodePath.join(taskPath, "untracked.txt"), "preserve me\n");
  const project = {
    id: projectId,
    title: "Project",
    workspaceRoot: repo,
    defaultModelSelection: null,
    scripts: [],
    createdAt: at,
    updatedAt: at,
  };
  const thread = (id: string, path: string | null = taskPath, branch: string | null = "task") => ({
    id,
    projectId,
    title: id,
    modelSelection: { instanceId: "fixture", model: "unused" },
    runtimeMode: "approval-required",
    branch,
    worktreePath: path,
    latestTurn: null,
    createdAt: at,
    updatedAt: at,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  });
  const task = {
    id: "task-a",
    projectId,
    title: "Task",
    objective: "Fixture",
    role: "builder",
    status: "active",
    threadId: "thread-a",
    createdAt: at,
    updatedAt: at,
    activatedAt: at,
    completedAt: null,
    cancelledAt: null,
    workspace: {
      status: "ready",
      sourceRepository: repo,
      baseCommit: sha,
      branch: "task",
      path: taskPath,
      createdAt: at,
      updatedAt: at,
      removedAt: null,
      failureCode: null,
      failureReason: null,
    },
  };
  const batch = {
    id: "batch-a",
    projectId,
    title: "Integration",
    baseCommit: sha,
    sourceRepository: repo,
    branch: "integration",
    workspacePath: integrationPath,
    status: "ready",
    tasks: [],
    overlapPaths: [],
    overlapsAcknowledged: false,
    conflict: null,
    validationSnapshot: null,
    qualityGateRuns: [],
    humanChanges: [],
    failureCode: null,
    failureReason: null,
    createdAt: at,
    updatedAt: at,
    readyAt: at,
    removedAt: null,
    missionId: "mission-a",
  };
  const mission = {
    id: "mission-a",
    projectId,
    title: "Mission",
    objective: "Fixture",
    description: null,
    status: "active",
    taskIds: ["task-a"],
    dependencies: [],
    activities: [],
    integrationBatchId: "batch-a",
    createdAt: at,
    updatedAt: at,
    activatedAt: at,
    completedAt: null,
    cancelledAt: null,
  };
  let snapshot = decodeSnapshot({
    snapshotSequence: 1,
    updatedAt: at,
    projects: [{ ...project, integrationBatches: [batch] }],
    tasks: [task],
    threads: [thread("thread-a"), thread("thread-b")],
    missions: [mission],
  });
  const session: ProviderSession = {
    threadId: ThreadId.make("thread-a"),
    provider: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("fixture"),
    status: "running",
    runtimeMode: "approval-required",
    cwd: taskPath,
    createdAt: at,
    updatedAt: at,
    resumeCursor: { token: "PRIVATE_RESUME_MARKER" },
    lastError: "PRIVATE_ERROR_MARKER",
  };
  return {
    root,
    repo,
    sha,
    taskPath,
    integrationPath,
    detachedPath,
    missingPath,
    thread,
    session,
    get snapshot() {
      return snapshot;
    },
    set snapshot(value) {
      snapshot = value;
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
function fingerprint(root: string): string {
  const hash = NodeCrypto.createHash("sha256");
  const visit = (path: string) => {
    const stat = NodeFS.lstatSync(path);
    hash.update(path);
    if (stat.isSymbolicLink()) hash.update(NodeFS.readlinkSync(path));
    else if (stat.isDirectory())
      NodeFS.readdirSync(path)
        .sort()
        .forEach((name) => visit(NodePath.join(path, name)));
    else hash.update(NodeFS.readFileSync(path));
  };
  visit(root);
  return hash.digest("hex");
}
const infrastructure = GitLayer.pipe(
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "nebula-e41-driver-" })),
  Layer.provideMerge(NodeServices.layer),
);
const withFixture = <A, E, R>(body: (value: Fixture) => Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.acquireRelease(Effect.sync(fixture), (value) =>
      Effect.sync(() => NodeFS.rmSync(value.root, { recursive: true })),
    ).pipe(Effect.flatMap(body)),
  );
function makeQuery(
  f: Fixture,
  environmentId = "host-a",
  alter?: (args: readonly string[], result: ExecuteGitResult) => ExecuteGitResult,
) {
  return Effect.gen(function* () {
    const driver = yield* GitVcsDriver;
    const calls: string[][] = [];
    const observer = yield* makeGitInventory((input) => {
      calls.push([...input.args]);
      return driver
        .execute(input)
        .pipe(Effect.map((result) => (alter ? alter(input.args, result) : result)));
    });
    const query = yield* makeProjectInventoryQuery.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(ProjectionSnapshotQuery)({
            getShellSnapshot: () => Effect.succeed(f.snapshot),
          }),
          Layer.mock(ServerEnvironment)({
            getDescriptor: Effect.succeed({
              environmentId: EnvironmentId.make(environmentId),
              label: environmentId,
              platform: { os: "darwin", arch: "arm64" },
              serverVersion: "fixture",
              capabilities: { repositoryIdentity: true },
            }),
          }),
          Layer.mock(ProviderService)({
            listSessions: (ids) =>
              Effect.succeed(ids?.includes(f.session.threadId) ? [f.session] : []),
          }),
          Layer.mock(GitWorkflowService)({
            observeProjectInventory: observer.observe,
            inspectProjectWorkspace: observer.inspect,
          }),
        ),
      ),
    );
    const readOnly = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const before = fingerprint(f.root);
        const result = yield* effect;
        expect(fingerprint(f.root)).toBe(before);
        for (const args of calls) {
          expect(
            args.some((arg) =>
              [
                "switch",
                "checkout",
                "fetch",
                "prune",
                "remove",
                "reset",
                "clean",
                "add",
                "update-ref",
              ].includes(arg),
            ),
          ).toBe(false);
        }
        return result;
      });
    return { ...query, calls, readOnly };
  });
}

describe("canonical Project inventory and context (disposable repositories, no provider execution)", () => {
  it.effect(
    "enumerates main plus four linked worktrees, detached, locked and missing registrations; refs are locally observed",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const q = yield* makeQuery(f);
          const result = yield* q.readOnly(q.getProjectInventory({ projectId }));
          expect(result.state).toBe("available");
          expect(result.worktrees).toHaveLength(5);
          expect(result.worktrees.find((entry) => entry.path === f.detachedPath)).toMatchObject({
            detached: true,
            headSha: f.sha,
            branchRef: null,
          });
          expect(result.worktrees.find((entry) => entry.path === f.integrationPath)?.locked).toBe(
            true,
          );
          expect(result.worktrees.find((entry) => entry.path === f.missingPath)).toMatchObject({
            availability: "missing",
            prunable: true,
          });
          expect(result.refs.find((entry) => entry.name === "unattached")?.workspaceKeys).toEqual(
            [],
          );
          expect(result.refs.find((entry) => entry.kind === "remote-tracking")?.headSha).toBe(
            f.sha,
          );
          expect(result.remoteFreshness).toBe("not-verified");
          expect(() => encodeInventoryValue(result)).not.toThrow();
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "joins Task, Mission, Integration and many Threads by canonical paths; synthetic running session has no NodeOS-process claim",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const q = yield* makeQuery(f);
          const inventory = yield* q.readOnly(q.getProjectInventory({ projectId }));
          const workspaceKey = inventory.worktrees.find(
            (entry) => entry.path === f.taskPath,
          )!.workspaceKey;
          const result = yield* q.readOnly(
            q.getProjectWorkspaceContext({ projectId, workspaceKey }),
          );
          expect(result.state).toBe("available");
          expect(result.taskIds).toEqual(["task-a"]);
          expect(result.threadIds).toEqual(["thread-a", "thread-b"]);
          expect(result.missionIds).toEqual(["mission-a"]);
          expect(result.git).toMatchObject({
            trackedChanges: 1,
            untrackedCount: 1,
            branchRef: "refs/heads/task",
          });
          expect(result.providerSessions[0]).toMatchObject({ status: "running", updatedAt: at });
          expect(result.terminalActivity).toBe("requires-terminal-api");
          expect(result.processActivity).toBe("not-observed");
          expect(
            result.observations.find((entry) => entry.source === "projection")?.observedAt,
          ).toBe(at);
          const encoded = encodeWorkspace(result);
          expect(encoded).not.toContain("PRIVATE_");
          const integration = yield* q.readOnly(
            q.getProjectWorkspaceContext({
              projectId,
              workspaceKey: inventory.worktrees.find((entry) => entry.path === f.integrationPath)!
                .workspaceKey,
            }),
          );
          expect(integration.integrationBatchIds).toEqual(["batch-a"]);
          expect(integration.missionIds).toEqual(["mission-a"]);
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "does not substitute the primary checkout for missing Projects, missing worktrees, foreign keys or another environment",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const a = yield* makeQuery(f);
          const b = yield* makeQuery(f, "host-b");
          const first = yield* a.readOnly(a.getProjectInventory({ projectId }));
          const other = yield* b.readOnly(b.getProjectInventory({ projectId }));
          expect(first.identity?.repositoryId).not.toBe(other.identity?.repositoryId);
          const key = first.worktrees[0]!.workspaceKey;
          const foreign = yield* b.readOnly(
            b.getProjectWorkspaceContext({ projectId, workspaceKey: key }),
          );
          expect(foreign.state).toBe("invalid");
          expect(foreign.workspace).toBeNull();
          const missing = yield* a.readOnly(
            a.getProjectWorkspaceContext({
              projectId,
              workspaceKey: first.worktrees.find((entry) => entry.path === f.missingPath)!
                .workspaceKey,
            }),
          );
          expect(missing.state).toBe("unavailable");
          expect(missing.git).toBeNull();
          const noProject = yield* a.readOnly(
            a.getProjectInventory({ projectId: ProjectId.make("missing") }),
          );
          expect(noProject.issues).toEqual(["project-unavailable"]);
          f.snapshot = {
            ...f.snapshot,
            projects: [
              { ...f.snapshot.projects[0]!, workspaceRoot: NodePath.join(f.root, "offline") },
            ],
          };
          const offline = yield* a.readOnly(a.getProjectInventory({ projectId }));
          expect(offline.state).toBe("unavailable");
          expect(offline.identity).toBeNull();
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "rejects symlink retargeting and repository membership mismatch without leaking foreign paths or content",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const q = yield* makeQuery(f);
          const inventory = yield* q.readOnly(q.getProjectInventory({ projectId }));
          const workspaceKey = inventory.worktrees.find(
            (entry) => entry.path === f.taskPath,
          )!.workspaceKey;
          NodeFS.renameSync(f.taskPath, `${f.taskPath}-original`);
          NodeFS.symlinkSync(f.repo, f.taskPath, "dir");
          const result = yield* q.readOnly(
            q.getProjectWorkspaceContext({ projectId, workspaceKey }),
          );
          expect(result.state).toBe("unavailable");
          expect(result.threadIds).toEqual([]);
          expect(result.git).toBeNull();
          NodeFS.unlinkSync(f.taskPath);
          NodeFS.mkdirSync(f.taskPath);
          git(f.taskPath, ["init", "--initial-branch=task"]);
          const foreign = yield* q.readOnly(
            q.getProjectWorkspaceContext({ projectId, workspaceKey }),
          );
          expect(foreign.state).toBe("unavailable");
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "does not infer Task ownership or provider execution from a branch label or saved assignment",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          f.snapshot = {
            ...f.snapshot,
            tasks: f.snapshot.tasks!.map((task) => ({
              ...task,
              workspace: { ...task.workspace!, path: f.repo },
            })),
          };
          f.session = { ...f.session, cwd: f.repo };
          const q = yield* makeQuery(f);
          const inventory = yield* q.readOnly(q.getProjectInventory({ projectId }));
          const result = yield* q.readOnly(
            q.getProjectWorkspaceContext({
              projectId,
              workspaceKey: inventory.worktrees.find((entry) => entry.path === f.taskPath)!
                .workspaceKey,
            }),
          );
          expect(result.taskIds).toEqual([]);
          expect(result.providerSessions).toEqual([]);
          expect(result.threadIds).toEqual(["thread-b"]);
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "paginates a large ref inventory, reports cache provenance and coalesces explicit local refresh without fetching",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          for (let i = 0; i < 205; i++)
            git(f.repo, ["update-ref", `refs/heads/fixture-${i}`, f.sha]);
          const q = yield* makeQuery(f);
          let page = yield* q.readOnly(q.getProjectInventory({ projectId, limit: 31 }));
          const all = [...page.refs];
          const firstObserved = page.observations.find(
            (entry) => entry.subject === "refs",
          )!.observedAt;
          while (page.nextCursor) {
            page = yield* q.readOnly(
              q.getProjectInventory({ projectId, limit: 31, cursor: page.nextCursor }),
            );
            all.push(...page.refs);
          }
          expect(new Set(all.map((entry) => entry.fullRefName)).size).toBe(all.length);
          expect(all.length).toBeGreaterThan(205);
          expect(q.calls.filter((args) => args.includes("for-each-ref"))).toHaveLength(1);
          yield* TestClock.adjust("1 second");
          const aged = yield* q.readOnly(q.getProjectInventory({ projectId }));
          expect(aged.observations.find((entry) => entry.subject === "refs")?.ageMs).toBe(1000);
          expect(page.observations.find((entry) => entry.subject === "refs")).toMatchObject({
            cache: "cached",
            observedAt: firstObserved,
          });
          git(f.repo, ["update-ref", "refs/remotes/origin/new", f.sha]);
          const refresh = yield* q.readOnly(
            q.getProjectInventory({ projectId, refresh: true, limit: 1 }),
          );
          expect(refresh.refresh).toBe("refreshed");
          const coalesced = yield* q.readOnly(q.getProjectInventory({ projectId, refresh: true }));
          expect(coalesced.refresh).toBe("coalesced");
          expect(q.calls.filter((args) => args.includes("for-each-ref"))).toHaveLength(2);
          const invalid = yield* q.readOnly(
            q.getProjectInventory({
              projectId,
              cursor: { ...refresh.nextCursor!, snapshotId: "f".repeat(64) },
            }),
          );
          expect(invalid.issues).toEqual(["stale-cursor"]);
        }),
      ).pipe(Effect.provide(infrastructure)),
  );
  it.effect(
    "separates two physical Projects in different environments with identical branch names",
    () =>
      withFixture((a) =>
        withFixture((b) =>
          Effect.gen(function* () {
            const otherId = ProjectId.make("project-b");
            b.snapshot = { ...b.snapshot, projects: [{ ...b.snapshot.projects[0]!, id: otherId }] };
            const firstQuery = yield* makeQuery(a);
            const secondQuery = yield* makeQuery(b, "remote-host");
            const first = yield* firstQuery.readOnly(firstQuery.getProjectInventory({ projectId }));
            const second = yield* secondQuery.readOnly(
              secondQuery.getProjectInventory({ projectId: otherId }),
            );
            expect(first.refs.map((entry) => entry.name)).toEqual(
              second.refs.map((entry) => entry.name),
            );
            expect(first.identity?.repositoryId).not.toBe(second.identity?.repositoryId);
            expect(first.worktrees[0]?.workspaceKey).not.toBe(second.worktrees[0]?.workspaceKey);
          }),
        ),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "represents a real unborn HEAD and reports status without creating a commit or branch",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const unborn = NodePath.join(f.root, "unborn");
          NodeFS.mkdirSync(unborn);
          git(unborn, ["init", "--initial-branch=main"]);
          f.snapshot = {
            ...f.snapshot,
            projects: [{ ...f.snapshot.projects[0]!, workspaceRoot: unborn }],
            tasks: [],
            threads: [],
            missions: [],
          };
          const q = yield* makeQuery(f);
          const inventory = yield* q.readOnly(q.getProjectInventory({ projectId }));
          expect(inventory.worktrees[0]).toMatchObject({
            headState: "unborn",
            headSha: null,
            branchRef: "refs/heads/main",
          });
          const result = yield* q.readOnly(
            q.getProjectWorkspaceContext({
              projectId,
              workspaceKey: inventory.worktrees[0]!.workspaceKey,
            }),
          );
          expect(result.git).toMatchObject({ headSha: null, trackedChanges: 0, untrackedCount: 0 });
        }),
      ).pipe(Effect.provide(infrastructure)),
  );

  it.effect(
    "returns typed partial and unsupported observations for malformed, truncated or unsupported Git output",
    () =>
      withFixture((f) =>
        Effect.gen(function* () {
          const malformed = yield* makeQuery(f, "host-a", (args, result) =>
            args.includes("for-each-ref")
              ? { ...result, stdout: result.stdout + "broken", stdoutTruncated: true }
              : result,
          );
          const partial = yield* malformed.readOnly(malformed.getProjectInventory({ projectId }));
          expect(partial.state).toBe("partial");
          expect(partial.issues).toEqual(expect.arrayContaining(["truncated", "malformed-output"]));
          expect(partial.worktrees).toHaveLength(5);
          const unsupported = yield* makeQuery(f, "host-a", (args, result) =>
            args.includes("worktree")
              ? {
                  ...result,
                  exitCode: 129 as ExecuteGitResult["exitCode"],
                  stdout: "",
                  stderr: "sensitive private diagnostic",
                }
              : result,
          );
          const result = yield* unsupported.readOnly(
            unsupported.getProjectInventory({ projectId }),
          );
          expect(result.issues).toContain("unsupported-output");
          expect(
            result.observations.find((entry) => entry.subject === "worktrees")?.completeness,
          ).toBe("unsupported");
          expect(encodeInventory(result)).not.toContain("sensitive");
        }),
      ).pipe(Effect.provide(infrastructure)),
  );
});
