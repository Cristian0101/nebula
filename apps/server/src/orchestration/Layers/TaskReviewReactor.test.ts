// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { TaskRestoreId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { describe } from "vite-plus/test";

import * as CheckpointStore from "../../checkpointing/CheckpointStore.ts";
import * as ServerConfig from "../../config.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import {
  restoreTaskWorkspaceToBaseline,
  shouldRecoverReviewPreparation,
  taskBranchIsPublished,
  taskRestoreCheckpointRef,
  taskWorkspacePathsMatch,
  undoTaskWorkspaceRestore,
} from "./TaskReviewReactor.ts";

const serverConfigLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-task-restore-",
});
const vcsProcessLayer = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const vcsRegistryLayer = VcsDriverRegistry.layer.pipe(Layer.provide(vcsProcessLayer));
const checkpointLayer = CheckpointStore.layer.pipe(
  Layer.provide(vcsRegistryLayer),
  Layer.provide(NodeServices.layer),
);
const layer = Layer.mergeAll(GitVcsDriver.layer, checkpointLayer).pipe(
  Layer.provideMerge(vcsRegistryLayer),
  Layer.provideMerge(vcsProcessLayer),
  Layer.provideMerge(serverConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

describe("TaskReviewReactor restore safety", () => {
  it("recovers snapshot preparation after a completed turn", () => {
    expect(
      shouldRecoverReviewPreparation(
        { status: "active", ownership: { status: "valid" } },
        { latestTurn: { state: "completed" } },
        false,
      ),
    ).toBe(true);
    expect(
      shouldRecoverReviewPreparation(
        { status: "active", ownership: { status: "valid" } },
        { latestTurn: { state: "running" } },
        false,
      ),
    ).toBe(false);
  });

  it("uses a Task-scoped hidden recovery ref", () => {
    expect(taskRestoreCheckpointRef("task-1", TaskRestoreId.make("restore-1"))).toBe(
      "refs/t3/checkpoints/tasks/task-1/restore/restore-1",
    );
  });

  it("refuses a branch published to any remote", () => {
    expect(
      taskBranchIsPublished(
        "refs/remotes/origin/feature/task-one\nrefs/remotes/upstream/main\n",
        "feature/task-one",
      ),
    ).toBe(true);
    expect(
      taskBranchIsPublished("refs/remotes/origin/feature/task-two\n", "feature/task-one"),
    ).toBe(false);
  });

  it.effect("accepts lexical aliases for the same managed worktree", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-task-path-" });
      const workspace = path.join(root, "workspace");
      const alias = path.join(root, "workspace-alias");
      yield* fs.makeDirectory(workspace);
      yield* fs.symlink(workspace, alias);

      expect(yield* taskWorkspacePathsMatch(alias, workspace)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

it.layer(layer)("TaskReviewReactor restore fixture", (it) => {
  it.effect(
    "restores only the isolated Task and recovers committed, dirty, and untracked work",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const git = yield* GitVcsDriver.GitVcsDriver;
        const checkpoints = yield* CheckpointStore.CheckpointStore;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-restore-fixture-" });
        const source = path.join(root, "source");
        const taskWorkspace = path.join(root, "task");
        const otherWorkspace = path.join(root, "other-task");
        yield* fs.makeDirectory(source, { recursive: true });
        const run = (cwd: string, args: ReadonlyArray<string>) =>
          git.execute({ operation: "TaskReviewReactor.test", cwd, args });
        const write = (cwd: string, relativePath: string, contents: string) =>
          Effect.gen(function* () {
            const target = path.join(cwd, relativePath);
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(target, contents);
          });

        yield* run(source, ["init", "-b", "main"]);
        yield* run(source, ["config", "user.email", "nebula@test.invalid"]);
        yield* run(source, ["config", "user.name", "Nebula Test"]);
        yield* write(source, "tracked.txt", "baseline\n");
        yield* run(source, ["add", "."]);
        yield* run(source, ["commit", "-m", "base"]);
        const baseCommit = (yield* run(source, ["rev-parse", "HEAD"])).stdout.trim();
        yield* run(source, [
          "worktree",
          "add",
          "-b",
          "nebula/manual/restore-fixture",
          taskWorkspace,
          baseCommit,
        ]);
        yield* run(source, [
          "worktree",
          "add",
          "-b",
          "nebula/manual/other-fixture",
          otherWorkspace,
          baseCommit,
        ]);

        yield* write(taskWorkspace, "committed.txt", "committed Task work\n");
        yield* run(taskWorkspace, ["add", "committed.txt"]);
        yield* run(taskWorkspace, ["commit", "-m", "task commit"]);
        const previousHead = (yield* run(taskWorkspace, ["rev-parse", "HEAD"])).stdout.trim();
        yield* write(taskWorkspace, "tracked.txt", "dirty Task work\n");
        yield* write(taskWorkspace, "untracked.txt", "untracked Task work\n");
        yield* write(otherWorkspace, "other.txt", "other Task remains dirty\n");

        const restoreId = TaskRestoreId.make("restore-fixture");
        const safetyCheckpointRef = taskRestoreCheckpointRef("task-fixture", restoreId);
        const snapshotObserved = yield* Ref.make(false);
        const restoredHead = yield* restoreTaskWorkspaceToBaseline({
          path: taskWorkspace,
          baseCommit,
          safetyCheckpointRef,
          git,
          checkpoints,
          onSnapshotCaptured: (capturedHead) =>
            Effect.gen(function* () {
              expect(capturedHead).toBe(previousHead);
              expect(
                yield* checkpoints.hasCheckpointRef({
                  cwd: taskWorkspace,
                  checkpointRef: safetyCheckpointRef,
                }),
              ).toBe(true);
              yield* Ref.set(snapshotObserved, true);
            }),
        });

        expect(restoredHead).toBe(previousHead);
        expect(yield* Ref.get(snapshotObserved)).toBe(true);
        expect((yield* run(taskWorkspace, ["rev-parse", "HEAD"])).stdout.trim()).toBe(baseCommit);
        expect((yield* run(taskWorkspace, ["status", "--short"])).stdout).toBe("");
        expect(yield* fs.readFileString(NodePath.join(source, "tracked.txt"))).toBe("baseline\n");
        expect(yield* fs.readFileString(NodePath.join(otherWorkspace, "other.txt"))).toBe(
          "other Task remains dirty\n",
        );

        yield* undoTaskWorkspaceRestore({
          path: taskWorkspace,
          previousHead,
          safetyCheckpointRef,
          git,
          checkpoints,
        });
        expect((yield* run(taskWorkspace, ["rev-parse", "HEAD"])).stdout.trim()).toBe(previousHead);
        expect(yield* fs.readFileString(NodePath.join(taskWorkspace, "committed.txt"))).toBe(
          "committed Task work\n",
        );
        expect(yield* fs.readFileString(NodePath.join(taskWorkspace, "tracked.txt"))).toBe(
          "dirty Task work\n",
        );
        expect(yield* fs.readFileString(NodePath.join(taskWorkspace, "untracked.txt"))).toBe(
          "untracked Task work\n",
        );
      }).pipe(Effect.scoped),
  );
});
