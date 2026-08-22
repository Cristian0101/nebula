// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProjectId,
  TaskId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationTask,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as ProjectionSnapshotQuery from "./Services/ProjectionSnapshotQuery.ts";
import * as TaskChangeSetQuery from "./TaskChangeSetQuery.ts";
import { createEmptyReadModel } from "./projector.ts";

const now = "2026-08-22T12:00:00.000Z";
let taskFixture: OrchestrationTask | null = null;

const snapshotQuery = ProjectionSnapshotQuery.ProjectionSnapshotQuery.of({
  getCommandReadModel: () =>
    Effect.succeed({
      ...createEmptyReadModel(now),
      tasks: taskFixture ? [taskFixture] : [],
    } satisfies OrchestrationReadModel),
} as unknown as ProjectionSnapshotQuery.ProjectionSnapshotQueryShape);

const serverConfigLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-task-changeset-",
});
const vcsProcessLayer = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const vcsRegistryLayer = VcsDriverRegistry.layer.pipe(Layer.provide(vcsProcessLayer));
const checkpointLayer = CheckpointStore.layer.pipe(
  Layer.provideMerge(vcsRegistryLayer),
  Layer.provideMerge(NodeServices.layer),
);
const layer = TaskChangeSetQuery.layer.pipe(
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(checkpointLayer),
  Layer.provideMerge(vcsRegistryLayer),
  Layer.provideMerge(vcsProcessLayer),
  Layer.provideMerge(Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, snapshotQuery)),
  Layer.provideMerge(serverConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(layer)("TaskChangeSetQuery Git fixture", (it) => {
  it.effect(
    "captures the complete base-to-workspace result and lazily truncates a huge patch",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const git = yield* GitVcsDriver.GitVcsDriver;
        const changes = yield* TaskChangeSetQuery.TaskChangeSetQuery;
        const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-task-diff-fixture-" });
        const run = (args: ReadonlyArray<string>) =>
          git.execute({ operation: "TaskChangeSetQuery.test", cwd, args });
        const write = (relativePath: string, contents: string) =>
          Effect.gen(function* () {
            const target = path.join(cwd, relativePath);
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(target, contents);
          });

        yield* run(["init"]);
        yield* run(["config", "user.email", "nebula@test.invalid"]);
        yield* run(["config", "user.name", "Nebula Test"]);
        yield* write("src/modified.ts", "export const value = 1;\n");
        yield* write("src/deleted.ts", "export const deleted = true;\n");
        yield* write("src/rename-old.ts", "export const renamed = true;\n");
        yield* write("large.txt", "base\n");
        yield* run(["add", "."]);
        yield* run(["commit", "-m", "base"]);
        const baseCommit = (yield* run(["rev-parse", "HEAD"])).stdout.trim();
        yield* run(["checkout", "-b", "nebula/manual/task-diff-fixture"]);

        taskFixture = {
          id: TaskId.make("task-diff-fixture"),
          projectId: ProjectId.make("project-diff-fixture"),
          title: "Task diff fixture",
          objective: "Exercise every Git evidence class.",
          role: "builder",
          status: "active",
          threadId: ThreadId.make("thread-diff-fixture"),
          createdAt: now,
          updatedAt: now,
          activatedAt: now,
          completedAt: null,
          cancelledAt: null,
          workspace: {
            status: "ready",
            sourceRepository: cwd,
            baseCommit,
            branch: "nebula/manual/task-diff-fixture",
            path: cwd,
            createdAt: now,
            removedAt: null,
            failureCode: null,
            failureReason: null,
            updatedAt: now,
          },
          ownership: null,
        };

        expect((yield* changes.collect(taskFixture)).files).toEqual([]);

        yield* write("src/committed.ts", "export const committed = true;\n");
        yield* run(["add", "src/committed.ts"]);
        yield* run(["commit", "-m", "committed task change"]);
        yield* write("src/staged.ts", "export const staged = true;\n");
        yield* run(["add", "src/staged.ts"]);
        yield* write("src/modified.ts", "export const value = 2;\n");
        yield* fs.remove(NodePath.join(cwd, "src/deleted.ts"));
        yield* run(["mv", "src/rename-old.ts", "src/rename-new.ts"]);
        yield* write("src/untracked.ts", "export const untracked = true;\n");
        yield* fs.writeFile(NodePath.join(cwd, "asset.bin"), new Uint8Array([0, 1, 2, 0, 255]));
        yield* write(
          "large.txt",
          Array.from({ length: 240_000 }, (_, index) => `generated line ${index}`).join("\n"),
        );

        const result = yield* changes.getTaskChanges({ taskId: taskFixture.id });
        expect(result.changeSet.files).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: "src/committed.ts", changeType: "added" }),
            expect.objectContaining({ path: "src/staged.ts", changeType: "added" }),
            expect.objectContaining({ path: "src/modified.ts", changeType: "modified" }),
            expect.objectContaining({ path: "src/deleted.ts", changeType: "deleted" }),
            expect.objectContaining({
              path: "src/rename-new.ts",
              previousPath: "src/rename-old.ts",
              changeType: "renamed",
            }),
            expect.objectContaining({ path: "src/untracked.ts", untracked: true }),
            expect.objectContaining({ path: "asset.bin", binary: true, untracked: true }),
            expect.objectContaining({ path: "large.txt", changeType: "modified" }),
          ]),
        );
        expect(result.changeSet.currentHead).not.toBe(baseCommit);

        const patch = yield* changes.getTaskFileDiff({
          taskId: taskFixture.id,
          path: "large.txt",
        });
        expect(patch.binary).toBe(false);
        expect(patch.truncated).toBe(true);
        expect(patch.patch).toBe("");
      }).pipe(Effect.ensuring(Effect.sync(() => (taskFixture = null))), Effect.scoped),
  );
});
