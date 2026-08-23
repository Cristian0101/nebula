// @effect-diagnostics nodeBuiltinImport:off
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import * as ServerConfig from "../../config.ts";
import * as VcsDriverRegistry from "../../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import {
  createDeterministicTaskArtifact,
  taskIntegrationArtifactRef,
} from "./IntegrationReactor.ts";

const vcsProcessLayer = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const vcsRegistryLayer = VcsDriverRegistry.layer.pipe(Layer.provide(vcsProcessLayer));
const serverConfigLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "nebula-integration-artifact-",
}).pipe(Layer.provide(NodeServices.layer));
const layer = GitVcsDriver.layer.pipe(
  Layer.provideMerge(vcsRegistryLayer),
  Layer.provideMerge(vcsProcessLayer),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(serverConfigLayer),
);

it("encodes Task artifact IDs into valid Git refs", () => {
  expect(taskIntegrationArtifactRef("task-artifact:task-result:task/snapshot")).toBe(
    "refs/t3/integration-artifacts/task-artifact%3Atask-result%3Atask%2Fsnapshot",
  );
});

it.layer(layer)("deterministic Task Integration artifacts", (it) => {
  it.effect("materializes the approved tree once without checking it out", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const git = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-integration-artifact-" });
      const run = (args: ReadonlyArray<string>) =>
        git.execute({ operation: "IntegrationReactor.test", cwd, args });
      const write = (relativePath: string, contents: string) =>
        fs.writeFileString(path.join(cwd, relativePath), contents);

      yield* run(["init"]);
      yield* run(["config", "user.email", "nebula@test.invalid"]);
      yield* run(["config", "user.name", "Nebula Test"]);
      yield* write("result.txt", "base\n");
      yield* run(["add", "."]);
      yield* run(["commit", "-m", "base"]);
      const baseCommit = (yield* run(["rev-parse", "HEAD"])).stdout.trim();
      yield* write("result.txt", "approved\n");
      yield* write("approved-only.txt", "captured\n");
      yield* run(["add", "."]);
      yield* run(["commit", "-m", "approved snapshot source"]);
      const approvedCommit = (yield* run(["rev-parse", "HEAD"])).stdout.trim();
      const checkpointRef = "refs/t3/checkpoints/tasks/task-a/review/snapshot-a";
      yield* run(["update-ref", checkpointRef, approvedCommit]);
      yield* run(["switch", "--detach", baseCommit]);

      const input = {
        sourceRepository: cwd,
        artifactId: "artifact-a",
        checkpointRef,
        baseCommit,
        taskTitle: "Approved Task",
        taskId: "task-a",
        taskResultId: "task-result-a",
        snapshotId: "snapshot-a",
        completedAt: "2026-08-22T12:00:00.000Z",
        git,
      } as const;
      const first = yield* createDeterministicTaskArtifact(input);
      yield* write("post-approval.txt", "must not enter artifact\n");
      const second = yield* createDeterministicTaskArtifact(input);

      expect(second).toEqual(first);
      expect((yield* run(["rev-parse", `${approvedCommit}^{tree}`])).stdout.trim()).toBe(
        first.treeId,
      );
      expect((yield* run(["rev-parse", `${first.commit}^`])).stdout.trim()).toBe(baseCommit);
      expect((yield* run(["rev-parse", "HEAD"])).stdout.trim()).toBe(baseCommit);
      expect(
        (yield* run(["rev-parse", taskIntegrationArtifactRef("artifact-a")])).stdout.trim(),
      ).toBe(first.commit);
      const message = (yield* run(["show", "-s", "--format=%B", first.commit])).stdout;
      expect(message).toContain("Nebula-Task-Result: task-result-a");
      expect((yield* run(["ls-tree", "-r", "--name-only", first.commit])).stdout).not.toContain(
        "post-approval.txt",
      );
    }).pipe(Effect.scoped),
  );

  it.effect(
    "applies cross-provider artifacts in order and exposes an emergent final-gate failure",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const git = yield* GitVcsDriver.GitVcsDriver;
        const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-integration-apply-" });
        const integrationCwd = yield* fs.makeTempDirectoryScoped({
          prefix: "nebula-integration-worktree-",
        });
        yield* fs.remove(integrationCwd, { recursive: true, force: true });
        const run = (directory: string, args: ReadonlyArray<string>, allowNonZeroExit = false) =>
          git.execute({
            operation: "IntegrationReactor.applyTest",
            cwd: directory,
            args,
            allowNonZeroExit,
          });
        const write = (directory: string, relativePath: string, contents: string) =>
          fs.writeFileString(path.join(directory, relativePath), contents);

        yield* run(cwd, ["init"]);
        yield* run(cwd, ["config", "user.email", "nebula@test.invalid"]);
        yield* run(cwd, ["config", "user.name", "Nebula Test"]);
        yield* write(cwd, "contract.txt", "base\n");
        yield* run(cwd, ["add", "."]);
        yield* run(cwd, ["commit", "-m", "base"]);
        const baseCommit = (yield* run(cwd, ["rev-parse", "HEAD"])).stdout.trim();

        const makeSnapshot = Effect.fn("IntegrationReactor.test.makeSnapshot")(function* (
          taskId: string,
          file: string,
          contents: string,
        ) {
          yield* run(cwd, ["switch", "--detach", baseCommit]);
          yield* write(cwd, file, contents);
          yield* run(cwd, ["add", "."]);
          yield* run(cwd, ["commit", "-m", `snapshot ${taskId}`]);
          const commit = (yield* run(cwd, ["rev-parse", "HEAD"])).stdout.trim();
          const checkpointRef = `refs/t3/checkpoints/tasks/${taskId}/review/snapshot-${taskId}`;
          yield* run(cwd, ["update-ref", checkpointRef, commit]);
          return checkpointRef;
        });
        const codexRef = yield* makeSnapshot("codex-task", "codex.txt", "A\n");
        const antigravityRef = yield* makeSnapshot("antigravity-task", "antigravity.txt", "X\n");
        yield* run(cwd, ["switch", "--detach", baseCommit]);

        const codex = yield* createDeterministicTaskArtifact({
          sourceRepository: cwd,
          artifactId: "codex-artifact",
          checkpointRef: codexRef,
          baseCommit,
          taskTitle: "Codex contract",
          taskId: "codex-task",
          taskResultId: "codex-result",
          snapshotId: "snapshot-codex",
          completedAt: "2026-08-22T12:00:00.000Z",
          git,
        });
        const antigravity = yield* createDeterministicTaskArtifact({
          sourceRepository: cwd,
          artifactId: "antigravity-artifact",
          checkpointRef: antigravityRef,
          baseCommit,
          taskTitle: "Antigravity contract",
          taskId: "antigravity-task",
          taskResultId: "antigravity-result",
          snapshotId: "snapshot-antigravity",
          completedAt: "2026-08-22T12:01:00.000Z",
          git,
        });
        yield* run(cwd, [
          "worktree",
          "add",
          "-b",
          "nebula/integration/cross-provider",
          integrationCwd,
          baseCommit,
        ]);
        yield* run(integrationCwd, ["cherry-pick", codex.commit]);
        yield* run(integrationCwd, ["cherry-pick", antigravity.commit]);

        expect(yield* fs.readFileString(path.join(integrationCwd, "codex.txt"))).toBe("A\n");
        expect(yield* fs.readFileString(path.join(integrationCwd, "antigravity.txt"))).toBe("X\n");
        expect((yield* run(cwd, ["rev-parse", "HEAD"])).stdout.trim()).toBe(baseCommit);
        expect(
          `${(yield* fs.readFileString(path.join(integrationCwd, "codex.txt"))).trim()}${(yield* fs.readFileString(path.join(integrationCwd, "antigravity.txt"))).trim()}`,
        ).toBe("AX");

        yield* write(integrationCwd, "antigravity.txt", "B\n");
        yield* run(integrationCwd, ["add", "antigravity.txt"]);
        yield* run(integrationCwd, ["commit", "-m", "nebula integration: compatibility fix"]);
        expect(
          `${(yield* fs.readFileString(path.join(integrationCwd, "codex.txt"))).trim()}${(yield* fs.readFileString(path.join(integrationCwd, "antigravity.txt"))).trim()}`,
        ).toBe("AB");
      }).pipe(Effect.scoped),
  );

  it.effect("pauses on a real conflict and abort preserves already applied history", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const git = yield* GitVcsDriver.GitVcsDriver;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-integration-conflict-" });
      const integrationCwd = yield* fs.makeTempDirectoryScoped({
        prefix: "nebula-conflict-worktree-",
      });
      yield* fs.remove(integrationCwd, { recursive: true, force: true });
      const run = (directory: string, args: ReadonlyArray<string>, allowNonZeroExit = false) =>
        git.execute({
          operation: "IntegrationReactor.conflictTest",
          cwd: directory,
          args,
          allowNonZeroExit,
        });
      yield* run(cwd, ["init"]);
      yield* run(cwd, ["config", "user.email", "nebula@test.invalid"]);
      yield* run(cwd, ["config", "user.name", "Nebula Test"]);
      yield* fs.writeFileString(path.join(cwd, "shared.txt"), "base\n");
      yield* run(cwd, ["add", "."]);
      yield* run(cwd, ["commit", "-m", "base"]);
      const baseCommit = (yield* run(cwd, ["rev-parse", "HEAD"])).stdout.trim();

      const artifactFor = Effect.fn("IntegrationReactor.test.conflictArtifact")(function* (
        id: string,
        value: string,
      ) {
        yield* run(cwd, ["switch", "--detach", baseCommit]);
        yield* fs.writeFileString(path.join(cwd, "shared.txt"), `${value}\n`);
        yield* run(cwd, ["add", "."]);
        yield* run(cwd, ["commit", "-m", `snapshot ${id}`]);
        const snapshotCommit = (yield* run(cwd, ["rev-parse", "HEAD"])).stdout.trim();
        const checkpointRef = `refs/t3/checkpoints/tasks/${id}/review/${id}`;
        yield* run(cwd, ["update-ref", checkpointRef, snapshotCommit]);
        return yield* createDeterministicTaskArtifact({
          sourceRepository: cwd,
          artifactId: id,
          checkpointRef,
          baseCommit,
          taskTitle: id,
          taskId: id,
          taskResultId: `result-${id}`,
          snapshotId: `snapshot-${id}`,
          completedAt: "2026-08-22T12:00:00.000Z",
          git,
        });
      });
      const first = yield* artifactFor("first", "first");
      const second = yield* artifactFor("second", "second");
      yield* run(cwd, ["switch", "--detach", baseCommit]);
      yield* run(cwd, [
        "worktree",
        "add",
        "-b",
        "nebula/integration/conflict",
        integrationCwd,
        baseCommit,
      ]);
      yield* run(integrationCwd, ["cherry-pick", first.commit]);
      const appliedFirst = (yield* run(integrationCwd, ["rev-parse", "HEAD"])).stdout.trim();
      const conflict = yield* run(integrationCwd, ["cherry-pick", second.commit], true);
      expect(conflict.exitCode).not.toBe(0);
      expect(
        (yield* run(integrationCwd, ["diff", "--name-only", "--diff-filter=U"])).stdout.trim(),
      ).toBe("shared.txt");
      yield* run(integrationCwd, ["cherry-pick", "--abort"]);
      expect((yield* run(integrationCwd, ["rev-parse", "HEAD"])).stdout.trim()).toBe(appliedFirst);
      expect((yield* run(integrationCwd, ["status", "--porcelain"])).stdout).toBe("");
    }).pipe(Effect.scoped),
  );
});
