import * as NodeServices from "@effect/platform-node/NodeServices";
import type { OrchestrationTask } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../../config.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import {
  taskNeedsCompletionRecovery,
  taskNeedsOwnershipReconciliation,
} from "./TaskOwnershipReactor.ts";
import { mergeUntrackedChanges, parseNameStatus } from "../taskChangeSet.ts";

const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-task-ownership-git-",
});

it("revalidates active ownership-managed ready workspaces after restart", () => {
  const task = {
    id: "task-reconcile",
    projectId: "project-reconcile",
    title: "Reconcile",
    objective: "Refresh ownership from disk.",
    role: "builder",
    status: "active",
    threadId: "thread-reconcile",
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:00:00.000Z",
    activatedAt: "2026-08-22T12:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    workspace: {
      status: "ready",
      sourceRepository: "/repo",
      baseCommit: "abc123",
      branch: "nebula/manual/task-reconcile",
      path: "/worktree",
      createdAt: "2026-08-22T12:00:00.000Z",
      removedAt: null,
      failureCode: null,
      failureReason: null,
      updatedAt: "2026-08-22T12:00:00.000Z",
    },
    ownership: {
      required: true,
      rules: [
        {
          id: "src",
          access: "write",
          pattern: "src/**",
          reason: null,
          createdAt: "2026-08-22T12:00:00.000Z",
        },
      ],
      status: "violation",
      validatedAt: "2026-08-22T12:00:00.000Z",
      changedPathCount: 1,
      violations: [],
      errorReason: null,
      updatedAt: "2026-08-22T12:00:00.000Z",
    },
  } as unknown as OrchestrationTask;
  expect(taskNeedsOwnershipReconciliation(task)).toBe(true);
  expect(taskNeedsOwnershipReconciliation({ ...task, status: "completed" })).toBe(false);
  expect(
    taskNeedsOwnershipReconciliation({ ...task, status: "draft" }, [
      { status: "running", scheduledTaskIds: [task.id] },
    ]),
  ).toBe(true);
  expect(taskNeedsOwnershipReconciliation({ ...task, status: "draft" }, [])).toBe(false);
});

it("recovers final completion only for a certified task in a live Mission run", () => {
  const snapshotId = "snapshot-reconcile";
  const task = {
    id: "task-reconcile",
    status: "active",
    workspace: { status: "ready" },
    ownership: {
      required: true,
      rules: [{ access: "write" }],
      status: "valid",
    },
    reviewRequired: true,
    reviewSnapshot: { id: snapshotId, status: "current" },
    handoff: { snapshotId, status: "ready" },
    reviews: [
      {
        id: "review-reconcile",
        snapshotId,
        status: "completed",
        verdict: "approve",
        createdAt: "2026-08-25T12:00:00.000Z",
      },
    ],
  } as unknown as OrchestrationTask;
  const runningMission = [{ status: "running", scheduledTaskIds: [task.id] }];

  expect(taskNeedsCompletionRecovery(task, runningMission)).toBe(true);
  expect(taskNeedsCompletionRecovery(task, [])).toBe(false);
  expect(taskNeedsCompletionRecovery({ ...task, reviews: [] }, runningMission)).toBe(false);
  expect(
    taskNeedsCompletionRecovery(
      {
        ...task,
        reviews: [{ ...task.reviews![0], verdict: "request_changes" }],
      } as unknown as OrchestrationTask,
      runningMission,
    ),
  ).toBe(false);
  expect(
    taskNeedsCompletionRecovery(task, [{ status: "completed", scheduledTaskIds: [task.id] }]),
  ).toBe(false);
});
const layer = Layer.mergeAll(GitVcsDriver.vcsLayer, GitVcsDriver.layer).pipe(
  Layer.provide(ServerConfigLayer),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(layer)("Task ownership Git evidence", (it) => {
  it.effect(
    "collects committed, unstaged, staged, deleted, untracked, and renamed paths from the Task base",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const git = yield* GitVcsDriver.GitVcsDriver;
        const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-ownership-fixture-" });
        const run = (args: ReadonlyArray<string>) =>
          git.execute({ operation: "TaskOwnershipReactor.test", cwd, args });
        const write = (relativePath: string, contents: string) =>
          Effect.gen(function* () {
            const target = path.join(cwd, relativePath);
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(target, contents);
          });

        yield* run(["init"]);
        yield* run(["config", "user.email", "nebula@test.invalid"]);
        yield* run(["config", "user.name", "Nebula Test"]);
        yield* write("src/frontend/a.ts", "export const a = 1;\n");
        yield* write("src/backend/b.ts", "export const b = 1;\n");
        yield* write("shared/schema.ts", "export const schema = 1;\n");
        yield* write("package.json", "{}\n");
        yield* run(["add", "."]);
        yield* run(["commit", "-m", "base"]);
        const base = (yield* run(["rev-parse", "HEAD"])).stdout.trim();

        yield* write("src/frontend/committed.ts", "export const committed = true;\n");
        yield* run(["add", "src/frontend/committed.ts"]);
        yield* run(["commit", "-m", "committed task change"]);
        yield* write("src/frontend/a.ts", "export const a = 2;\n");
        yield* write("shared/schema.ts", "export const schema = 2;\n");
        yield* run(["add", "shared/schema.ts"]);
        yield* fs.remove(path.join(cwd, "package.json"));
        yield* run(["mv", "src/backend/b.ts", "src/frontend/b.ts"]);
        yield* write("src/backend/untracked.ts", "export const nope = true;\n");

        const tracked = yield* run([
          "diff",
          "--name-status",
          "-z",
          "--find-renames",
          "--find-copies",
          base,
          "--",
        ]);
        const untracked = yield* run(["ls-files", "--others", "--exclude-standard", "-z", "--"]);
        const changes = mergeUntrackedChanges(parseNameStatus(tracked.stdout), untracked.stdout);

        expect(changes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: "src/frontend/committed.ts", changeType: "added" }),
            expect.objectContaining({ path: "src/frontend/a.ts", changeType: "modified" }),
            expect.objectContaining({ path: "shared/schema.ts", changeType: "modified" }),
            expect.objectContaining({ path: "package.json", changeType: "deleted" }),
            expect.objectContaining({
              path: "src/frontend/b.ts",
              previousPath: "src/backend/b.ts",
              changeType: "renamed",
            }),
            expect.objectContaining({ path: "src/backend/untracked.ts", changeType: "untracked" }),
          ]),
        );
      }).pipe(Effect.scoped),
  );
});
