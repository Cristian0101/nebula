// @effect-diagnostics nodeBuiltinImport:off - disposable Git and child-process integration fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as GitManager from "./GitManager.ts";
import * as GitWorkflow from "./GitWorkflowService.ts";
import * as GitDriver from "../vcs/GitVcsDriver.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as Registry from "../vcs/VcsDriverRegistry.ts";
import { ServerConfig } from "../config.ts";

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const layer = GitWorkflow.layer.pipe(
  Layer.provide(Layer.mock(GitManager.GitManager)({})),
  Layer.provide(Registry.layer),
  Layer.provideMerge(GitDriver.layer),
  Layer.provide(VcsProcess.layer),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "e4s-config-" })),
  Layer.provide(NodeServices.layer),
);

it.effect(
  "refuses checkout mutation for every activity/identity state without touching disposable worktrees",
  () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflow.GitWorkflowService;
      const base = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nebula-checkout-safety-"));
      const repo = NodePath.join(base, "repo");
      NodeFS.mkdirSync(repo);
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.name", "Safety fixture");
      git(repo, "config", "user.email", "fixture@example.invalid");
      NodeFS.writeFileSync(NodePath.join(repo, "tracked.txt"), "original\n");
      git(repo, "add", "tracked.txt");
      git(repo, "commit", "-m", "fixture");
      git(repo, "branch", "target");
      const taskPath = NodePath.join(base, "task");
      const integrationPath = NodePath.join(base, "integration");
      git(repo, "worktree", "add", "-b", "nebula/manual/task", taskPath);
      git(repo, "worktree", "add", "-b", "nebula/integration/batch", integrationPath);
      const session = { status: "running", cwd: taskPath, runtimeMode: "approval-required" };
      const child = NodeChildProcess.spawn(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        {
          cwd: taskPath,
          stdio: "ignore",
        },
      );
      try {
        const head = git(taskPath, "rev-parse", "HEAD");
        // Reproduce the pre-E4.S primitive path: Git itself has no knowledge of
        // the synthetic provider binding or running process. The old workflow
        // delegated directly to this driver, even for a Task checkout.
        const driver = yield* GitDriver.GitVcsDriver;
        yield* driver.switchRef({ cwd: taskPath, refName: "target" });
        expect(git(taskPath, "branch", "--show-current")).toBe("target");
        expect(session.cwd).toBe(taskPath);
        expect(child.killed).toBe(false);
        yield* driver.switchRef({ cwd: taskPath, refName: "nebula/manual/task" });

        NodeFS.writeFileSync(NodePath.join(taskPath, "tracked.txt"), "user edit\n");
        NodeFS.writeFileSync(NodePath.join(taskPath, "untracked.txt"), "user untracked\n");
        const before = git(taskPath, "status", "--porcelain=v1", "--untracked-files=all");
        // Every state is refused, including clean/idle. No read-only observation
        // (or renderer cwd) can turn this into an authorization decision.
        for (const cwd of [
          taskPath,
          integrationPath,
          repo,
          NodePath.join(base, "missing"),
          "/invalid-renderer/other-repository",
        ]) {
          const errors = yield* Effect.all(
            [
              workflow.switchRef({ cwd, refName: "target" }),
              workflow.createRef({ cwd, refName: "must-not-exist", switchRef: true }),
              workflow.pullCurrentBranch(cwd),
              workflow.removeWorktree({ cwd, path: taskPath, force: true }),
              workflow.removeWorktree({ cwd, path: integrationPath }),
            ].map((effect) => effect.pipe(Effect.flip)),
            { concurrency: "unbounded" },
          );
          expect(errors.every((error) => error.command === "checkout-safety")).toBe(true);
        }
        // Detached checkout and conflicting Git operation also stay untouched.
        git(repo, "checkout", "--detach");
        NodeFS.writeFileSync(NodePath.join(repo, ".git", "MERGE_HEAD"), head + "\n");
        yield* Effect.all(
          Array.from({ length: 20 }, () =>
            workflow.switchRef({ cwd: repo, refName: "target" }).pipe(Effect.flip),
          ),
          { concurrency: "unbounded" },
        );
        expect(git(repo, "branch", "--show-current")).toBe("");
        expect(NodeFS.readFileSync(NodePath.join(repo, ".git", "MERGE_HEAD"), "utf8")).toBe(
          head + "\n",
        );
        expect(git(taskPath, "branch", "--show-current")).toBe("nebula/manual/task");
        expect(git(integrationPath, "branch", "--show-current")).toBe("nebula/integration/batch");
        expect(git(taskPath, "rev-parse", "HEAD")).toBe(head);
        expect(git(taskPath, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before);
        expect(NodeFS.readFileSync(NodePath.join(taskPath, "tracked.txt"), "utf8")).toBe(
          "user edit\n",
        );
        expect(NodeFS.readFileSync(NodePath.join(taskPath, "untracked.txt"), "utf8")).toBe(
          "user untracked\n",
        );
        expect(git(repo, "branch", "--list", "must-not-exist")).toBe("");
        expect(child.exitCode).toBeNull();
        expect(child.killed).toBe(false);
        expect(session).toEqual({
          status: "running",
          cwd: taskPath,
          runtimeMode: "approval-required",
        });
      } finally {
        child.kill();
        // Only this test's newly created directory is disposable.
        NodeFS.rmSync(base, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(layer)),
);

it.effect(
  "keeps branch inspection, non-switching ref creation and new worktree creation available",
  () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflow.GitWorkflowService;
      const base = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nebula-worktree-create-"));
      const repo = NodePath.join(base, "repo");
      NodeFS.mkdirSync(repo);
      try {
        git(repo, "init", "-b", "main");
        git(repo, "config", "user.name", "Fixture");
        git(repo, "config", "user.email", "fixture@example.invalid");
        git(repo, "commit", "--allow-empty", "-m", "fixture");
        yield* workflow.createRef({ cwd: repo, refName: "draft", switchRef: false });
        const result = yield* workflow.createWorktree({
          cwd: repo,
          refName: "draft",
          path: NodePath.join(base, "new"),
        });
        expect(result.worktree.refName).toBe("draft");
        expect(git(repo, "branch", "--show-current")).toBe("main");
        expect(
          (yield* workflow.listRefs({ cwd: repo })).refs.some((ref) => ref.name === "draft"),
        ).toBe(true);
      } finally {
        NodeFS.rmSync(base, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(layer)),
);

it.effect(
  "refuses without attempting identity discovery when the environment cannot be inspected",
  () =>
    Effect.gen(function* () {
      const workflow = yield* GitWorkflow.GitWorkflowService;
      expect(
        (yield* workflow.switchRef({ cwd: "/offline", refName: "main" }).pipe(Effect.flip)).command,
      ).toBe("checkout-safety");
      expect(
        (yield* workflow
          .createRef({ cwd: "/offline", refName: "new", switchRef: true })
          .pipe(Effect.flip)).command,
      ).toBe("checkout-safety");
    }).pipe(
      Effect.provide(
        GitWorkflow.layer.pipe(
          Layer.provide(Layer.mock(Registry.VcsDriverRegistry)({})),
          Layer.provide(Layer.mock(GitDriver.GitVcsDriver)({})),
          Layer.provide(Layer.mock(GitManager.GitManager)({})),
        ),
      ),
    ),
);
