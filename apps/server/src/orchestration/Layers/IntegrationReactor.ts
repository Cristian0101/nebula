import {
  CommandId,
  QualityGateRunId,
  type IntegrationBatch,
  type IntegrationBatchId,
  type IntegrationQualityGateRun,
  type OrchestrationEvent,
  type OrchestrationTask,
  type ProjectId,
  type TaskIntegrationArtifact,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { GitWorkflowService } from "../../git/GitWorkflowService.ts";
import * as ProcessRunner from "../../processRunner.ts";
import { forkParked } from "../../serverActivation.ts";
import * as GitVcsDriver from "../../vcs/GitVcsDriver.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  IntegrationReactor,
  type IntegrationReactorShape,
} from "../Services/IntegrationReactor.ts";
import { taskArtifactId } from "../integrationPolicy.ts";
import { runQualityGateProcess } from "./TaskQualityReactor.ts";

type IntegrationEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "integration.created"
      | "integration.continue-requested"
      | "integration.abort-requested"
      | "integration.validation-requested"
      | "integration.workspace-remove-requested"
      | "integration.updated";
  }
>;

export const taskIntegrationArtifactRef = (artifactId: string) =>
  `refs/t3/integration-artifacts/${encodeURIComponent(artifactId)}`;

export const createDeterministicTaskArtifact = Effect.fn(
  "IntegrationReactor.createDeterministicTaskArtifact",
)(function* (input: {
  readonly sourceRepository: string;
  readonly artifactId: string;
  readonly checkpointRef: string;
  readonly baseCommit: string;
  readonly taskTitle: string;
  readonly taskId: string;
  readonly taskResultId: string;
  readonly snapshotId: string;
  readonly completedAt: string;
  readonly git: GitVcsDriver.GitVcsDriver["Service"];
}) {
  const ref = taskIntegrationArtifactRef(input.artifactId);
  const run = (
    operation: string,
    args: ReadonlyArray<string>,
    options?: {
      readonly allowNonZeroExit?: boolean;
      readonly stdin?: string;
      readonly env?: NodeJS.ProcessEnv;
    },
  ) => input.git.execute({ cwd: input.sourceRepository, operation, args, ...options });
  const existing = yield* run(
    "Integration.artifact.exists",
    ["rev-parse", "--verify", "--quiet", ref],
    { allowNonZeroExit: true },
  );
  const treeId = (yield* run("Integration.artifact.resolveTree", [
    "rev-parse",
    "--verify",
    `${input.checkpointRef}^{tree}`,
  ])).stdout.trim();
  let commit = existing.exitCode === 0 ? existing.stdout.trim() : "";
  if (commit === "") {
    const message = [
      `nebula task artifact: ${input.taskTitle}`,
      "",
      `Nebula-Task: ${input.taskId}`,
      `Nebula-Task-Result: ${input.taskResultId}`,
      `Nebula-Snapshot: ${input.snapshotId}`,
    ].join("\n");
    const created = yield* run(
      "Integration.artifact.commitTree",
      ["commit-tree", treeId, "-p", input.baseCommit],
      {
        stdin: `${message}\n`,
        env: {
          GIT_AUTHOR_NAME: "Nebula Integration",
          GIT_AUTHOR_EMAIL: "integration@nebula.local",
          GIT_COMMITTER_NAME: "Nebula Integration",
          GIT_COMMITTER_EMAIL: "integration@nebula.local",
          GIT_AUTHOR_DATE: input.completedAt,
          GIT_COMMITTER_DATE: input.completedAt,
        },
      },
    );
    commit = created.stdout.trim();
    yield* run("Integration.artifact.retain", ["update-ref", ref, commit]);
  }
  const artifactTree = (yield* run("Integration.artifact.verifyTree", [
    "rev-parse",
    "--verify",
    `${commit}^{tree}`,
  ])).stdout.trim();
  if (artifactTree !== treeId) {
    return yield* Effect.die(
      new Error("Integration artifact tree does not match its approved snapshot."),
    );
  }
  const artifactParent = (yield* run("Integration.artifact.verifyParent", [
    "rev-parse",
    "--verify",
    `${commit}^`,
  ])).stdout.trim();
  const artifactMessage = (yield* run("Integration.artifact.verifyMetadata", [
    "show",
    "-s",
    "--format=%B",
    commit,
  ])).stdout;
  if (
    artifactParent !== input.baseCommit ||
    !artifactMessage.includes(`Nebula-Task-Result: ${input.taskResultId}`) ||
    !artifactMessage.includes(`Nebula-Snapshot: ${input.snapshotId}`)
  ) {
    return yield* Effect.die(
      new Error("Integration artifact metadata does not match its immutable Task Result."),
    );
  }
  return { treeId, commit } as const;
});

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const workflow = yield* GitWorkflowService;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const platform = yield* HostProcessPlatform;
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const commandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((id) => CommandId.make(`server:${tag}:${id}`)));

  const readBatch = Effect.fn("IntegrationReactor.readBatch")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    const model = yield* snapshots.getCommandReadModel();
    const project = model.projects.find((candidate) => candidate.id === projectId);
    const batch = (project?.integrationBatches ?? []).find((candidate) => candidate.id === batchId);
    return { model, project: project ?? null, batch: batch ?? null };
  });

  const update = Effect.fn("IntegrationReactor.update")(function* (
    projectId: ProjectId,
    batch: IntegrationBatch,
    reason: Extract<
      Parameters<typeof engine.dispatch>[0],
      { type: "integration.update" }
    >["reason"],
  ) {
    yield* engine.dispatch({
      type: "integration.update",
      commandId: yield* commandId(`integration-${reason}`),
      projectId,
      batch,
      reason,
      createdAt: batch.updatedAt,
    });
  });

  const fail = Effect.fn("IntegrationReactor.fail")(function* (
    projectId: ProjectId,
    batch: IntegrationBatch,
    failureCode: string,
    failureReason: string,
  ) {
    const updatedAt = yield* now;
    yield* update(
      projectId,
      {
        ...batch,
        status: "failed",
        failureCode,
        failureReason,
        updatedAt,
      },
      "failed",
    );
  });

  const execute = (
    cwd: string,
    operation: string,
    args: ReadonlyArray<string>,
    options?: {
      readonly allowNonZeroExit?: boolean;
      readonly stdin?: string;
      readonly env?: NodeJS.ProcessEnv;
    },
  ) => git.execute({ cwd, operation, args, ...options });

  const resolve = (cwd: string, revision: string) =>
    execute(cwd, "Integration.resolve", ["rev-parse", "--verify", revision]).pipe(
      Effect.map((result) => result.stdout.trim()),
    );

  const statusPorcelain = (cwd: string) =>
    execute(cwd, "Integration.status", ["status", "--porcelain=v1", "-z"]).pipe(
      Effect.map((result) => result.stdout),
    );

  const unresolvedFiles = (cwd: string) =>
    execute(cwd, "Integration.unresolved", ["diff", "--name-only", "--diff-filter=U", "-z"]).pipe(
      Effect.map((result) => result.stdout.split("\0").filter(Boolean).sort()),
    );

  const captureHumanChanges = Effect.fn("IntegrationReactor.captureHumanChanges")(function* (
    batch: IntegrationBatch,
    headCommit: string,
  ) {
    if (!batch.workspacePath) return batch;
    const applied = new Set(
      batch.tasks.flatMap((task) => (task.appliedCommit ? [task.appliedCommit] : [])),
    );
    const retained = new Set(batch.humanChanges.map((change) => change.commit));
    const commits = (yield* execute(batch.workspacePath, "Integration.humanChanges.list", [
      "rev-list",
      "--reverse",
      `${batch.baseCommit}..${headCommit}`,
    ])).stdout
      .split("\n")
      .filter((commit) => commit !== "" && !applied.has(commit) && !retained.has(commit));
    if (commits.length === 0) return batch;
    const captured = [...batch.humanChanges];
    for (const commit of commits) {
      const metadata = yield* execute(batch.workspacePath, "Integration.humanChanges.metadata", [
        "show",
        "-s",
        "--format=%s%x00%cI",
        commit,
      ]);
      const [summary = "Human Integration change", createdAt = batch.updatedAt] = metadata.stdout
        .trim()
        .split("\0");
      const files = yield* execute(batch.workspacePath, "Integration.humanChanges.files", [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "-z",
        commit,
      ]);
      captured.push({
        commit,
        summary,
        files: files.stdout.split("\0").filter(Boolean).sort(),
        createdAt,
      });
    }
    return { ...batch, humanChanges: captured };
  });

  const createArtifact = Effect.fn("IntegrationReactor.createArtifact")(function* (
    batch: IntegrationBatch,
    task: OrchestrationTask,
  ) {
    const result = task.result!;
    const snapshot = task.reviewSnapshot!;
    const id = taskArtifactId(task);
    const taskResultId = batch.tasks.find((entry) => entry.taskId === task.id)!.taskResultId;
    const { treeId, commit } = yield* createDeterministicTaskArtifact({
      sourceRepository: batch.sourceRepository,
      artifactId: id,
      checkpointRef: snapshot.checkpointRef,
      baseCommit: result.baseCommit,
      taskTitle: task.title,
      taskId: task.id,
      taskResultId,
      snapshotId: snapshot.id,
      completedAt: result.completedAt,
      git,
    });
    return {
      id,
      taskId: task.id,
      taskResultId,
      snapshotId: result.snapshotId,
      checkpointRef: snapshot.checkpointRef,
      baseCommit: result.baseCommit,
      treeId,
      commit,
      createdAt: result.completedAt,
    } satisfies TaskIntegrationArtifact;
  });

  const prepare = Effect.fn("IntegrationReactor.prepare")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    const context = yield* readBatch(projectId, batchId);
    if (!context.project || !context.batch || context.batch.status !== "preparing") return;
    let batch = context.batch;
    const sourceStatus = yield* workflow.localStatus({ cwd: batch.sourceRepository });
    if (!sourceStatus.isRepo)
      return yield* fail(
        projectId,
        batch,
        "git-required",
        "Integration requires a Git repository.",
      );
    const refs = yield* workflow.listRefs({ cwd: batch.sourceRepository });
    const existing = refs.refs.find((ref) => !ref.isRemote && ref.name === batch.branch);
    let workspacePath: string;
    if (existing?.worktreePath) {
      workspacePath = existing.worktreePath;
    } else if (existing) {
      return yield* fail(
        projectId,
        batch,
        "branch-collision",
        "Integration branch exists without its recorded worktree.",
      );
    } else {
      workspacePath = (yield* workflow.createWorktree({
        cwd: batch.sourceRepository,
        refName: batch.baseCommit,
        newRefName: batch.branch,
        path: null,
      })).worktree.path;
    }
    const workspaceHead = yield* workflow.resolveCommit({ cwd: workspacePath, revision: "HEAD" });
    if (workspaceHead.commitSha !== batch.baseCommit) {
      return yield* fail(
        projectId,
        batch,
        "baseline-mismatch",
        "Integration worktree does not match the common base.",
      );
    }
    batch = { ...batch, workspacePath, status: "applying", updatedAt: yield* now };
    yield* update(projectId, batch, "workspace-prepared");
    yield* applyRemaining(projectId, batchId);
  });

  const applyRemaining = Effect.fn("IntegrationReactor.applyRemaining")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    let context = yield* readBatch(projectId, batchId);
    let batch = context.batch;
    if (!batch || batch.status !== "applying" || !batch.workspacePath) return;
    const workspacePath = batch.workspacePath;
    for (const selected of batch.tasks.toSorted((left, right) => left.order - right.order)) {
      if (selected.status === "applied") continue;
      const cherryPickHead = yield* execute(
        workspacePath,
        "Integration.reconcileCherryPick",
        ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"],
        { allowNonZeroExit: true },
      );
      if (cherryPickHead.exitCode === 0) {
        const files = yield* unresolvedFiles(workspacePath);
        const artifactCommit = selected.artifact?.commit ?? cherryPickHead.stdout.trim();
        const detectedAt = yield* now;
        const conflicted: IntegrationBatch = {
          ...batch,
          status: "conflict",
          tasks: batch.tasks.map((entry) =>
            entry.taskId === selected.taskId ? { ...entry, status: "conflict" } : entry,
          ),
          conflict: {
            taskId: selected.taskId,
            artifactCommit,
            files,
            appliedTaskIds: batch.tasks
              .filter((entry) => entry.status === "applied")
              .map((entry) => entry.taskId),
            remainingTaskIds: batch.tasks
              .filter((entry) => entry.status !== "applied" && entry.taskId !== selected.taskId)
              .map((entry) => entry.taskId),
            detectedAt,
          },
          updatedAt: detectedAt,
        };
        yield* update(projectId, conflicted, "reconciled");
        return;
      }
      if (selected.status === "applying" && selected.artifact) {
        const latestMessage = yield* execute(workspacePath, "Integration.reconcileApplied", [
          "show",
          "-s",
          "--format=%B",
          "HEAD",
        ]);
        if (latestMessage.stdout.includes(`Nebula-Task-Result: ${selected.taskResultId}`)) {
          const appliedCommit = yield* resolve(workspacePath, "HEAD");
          batch = {
            ...batch,
            tasks: batch.tasks.map((entry) =>
              entry.taskId === selected.taskId
                ? { ...entry, status: "applied", appliedCommit }
                : entry,
            ),
            updatedAt: yield* now,
          };
          yield* update(projectId, batch, "reconciled");
          continue;
        }
      }
      if ((yield* statusPorcelain(workspacePath)) !== "") {
        return yield* fail(
          projectId,
          batch,
          "unexpected-worktree-changes",
          "Integration worktree changed outside the active apply step.",
        );
      }
      const task = (context.model.tasks ?? []).find(
        (candidate) => candidate.id === selected.taskId,
      );
      if (!task?.result || !task.reviewSnapshot) {
        return yield* fail(
          projectId,
          batch,
          "task-result-missing",
          `Task '${selected.taskId}' no longer has its immutable result.`,
        );
      }
      const artifact: TaskIntegrationArtifact =
        selected.artifact ?? (yield* createArtifact(batch, task));
      batch = {
        ...batch,
        tasks: batch.tasks.map((entry) =>
          entry.taskId === selected.taskId ? { ...entry, artifact, status: "applying" } : entry,
        ),
        updatedAt: yield* now,
      };
      yield* update(projectId, batch, "artifact-created");
      const picked = yield* execute(
        workspacePath,
        "Integration.cherryPick",
        ["cherry-pick", artifact.commit],
        { allowNonZeroExit: true, env: { GIT_EDITOR: "true" } },
      );
      if (picked.exitCode !== 0) {
        const files = yield* unresolvedFiles(workspacePath);
        batch = {
          ...batch,
          status: "conflict",
          tasks: batch.tasks.map((entry) =>
            entry.taskId === selected.taskId ? { ...entry, status: "conflict" } : entry,
          ),
          conflict: {
            taskId: selected.taskId,
            artifactCommit: artifact.commit,
            files,
            appliedTaskIds: batch.tasks
              .filter((entry) => entry.status === "applied")
              .map((entry) => entry.taskId),
            remainingTaskIds: batch.tasks
              .filter((entry) => entry.status !== "applied" && entry.taskId !== selected.taskId)
              .map((entry) => entry.taskId),
            detectedAt: yield* now,
          },
          updatedAt: yield* now,
        };
        yield* update(projectId, batch, "conflict-detected");
        return;
      }
      const appliedCommit: string = yield* resolve(workspacePath, "HEAD");
      batch = {
        ...batch,
        tasks: batch.tasks.map((entry) =>
          entry.taskId === selected.taskId
            ? { ...entry, artifact, status: "applied", appliedCommit }
            : entry,
        ),
        updatedAt: yield* now,
      };
      yield* update(projectId, batch, "artifact-applied");
      context = yield* readBatch(projectId, batchId);
      batch = context.batch ?? batch;
    }
    const latest = (yield* readBatch(projectId, batchId)).batch;
    if (latest) {
      const updatedAt = yield* now;
      yield* update(
        projectId,
        { ...latest, status: "validating", updatedAt },
        "validation-started",
      );
    }
  });

  const continueConflict = Effect.fn("IntegrationReactor.continueConflict")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    const { batch } = yield* readBatch(projectId, batchId);
    if (!batch?.workspacePath || batch.status !== "conflict" || !batch.conflict) return;
    const unresolved = yield* unresolvedFiles(batch.workspacePath);
    if (unresolved.length > 0) {
      return yield* fail(
        projectId,
        batch,
        "unresolved-conflicts",
        "Resolve and stage every conflicted path before continuing.",
      );
    }
    const cherryPickHead = yield* execute(
      batch.workspacePath,
      "Integration.cherryPickHead",
      ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"],
      { allowNonZeroExit: true },
    );
    if (cherryPickHead.exitCode !== 0) {
      return yield* fail(
        projectId,
        batch,
        "cherry-pick-missing",
        "No active cherry-pick remains to continue.",
      );
    }
    const continued = yield* execute(
      batch.workspacePath,
      "Integration.cherryPickContinue",
      ["cherry-pick", "--continue"],
      { allowNonZeroExit: true, env: { GIT_EDITOR: "true" } },
    );
    if (continued.exitCode !== 0) {
      return yield* fail(
        projectId,
        batch,
        "continue-failed",
        continued.stderr.trim() || "Conflict continuation failed.",
      );
    }
    const conflict = batch.conflict;
    const selected = batch.tasks.find((entry) => entry.taskId === conflict.taskId)!;
    const message = [
      "nebula integration: resolve task conflicts",
      "",
      `Nebula-Task: ${conflict.taskId}`,
      `Nebula-Task-Result: ${selected.taskResultId}`,
      `Nebula-Artifact: ${conflict.artifactCommit}`,
    ].join("\n");
    yield* execute(
      batch.workspacePath,
      "Integration.amendConflict",
      ["commit", "--amend", "-m", message],
      {
        env: { GIT_EDITOR: "true" },
      },
    );
    const appliedCommit = yield* resolve(batch.workspacePath, "HEAD");
    const changed = yield* execute(batch.workspacePath, "Integration.conflictFiles", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "HEAD",
    ]);
    const updatedAt = yield* now;
    const next: IntegrationBatch = {
      ...batch,
      status: "applying",
      conflict: null,
      tasks: batch.tasks.map((entry) =>
        entry.taskId === conflict.taskId ? { ...entry, status: "applied", appliedCommit } : entry,
      ),
      humanChanges: [
        ...batch.humanChanges,
        {
          commit: appliedCommit,
          summary: `Resolved conflicts while applying Task ${conflict.taskId}.`,
          files: changed.stdout.split("\0").filter(Boolean).sort(),
          createdAt: updatedAt,
        },
      ],
      updatedAt,
    };
    yield* update(projectId, next, "conflict-resolved");
    yield* applyRemaining(projectId, batchId);
  });

  const reconcileCompletedConflict = Effect.fn("IntegrationReactor.reconcileCompletedConflict")(
    function* (projectId: ProjectId, batchId: IntegrationBatchId) {
      const { batch } = yield* readBatch(projectId, batchId);
      if (!batch?.workspacePath || batch.status !== "conflict" || !batch.conflict) return;
      const active = yield* execute(
        batch.workspacePath,
        "Integration.reconcileConflictHead",
        ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"],
        { allowNonZeroExit: true },
      );
      if (active.exitCode === 0) return;
      const message = yield* execute(batch.workspacePath, "Integration.reconcileConflictMessage", [
        "show",
        "-s",
        "--format=%B",
        "HEAD",
      ]);
      if (!message.stdout.includes(`Nebula-Artifact: ${batch.conflict.artifactCommit}`)) return;
      const appliedCommit = yield* resolve(batch.workspacePath, "HEAD");
      const files = yield* execute(batch.workspacePath, "Integration.reconcileConflictFiles", [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "-z",
        "HEAD",
      ]);
      const updatedAt = yield* now;
      const conflict = batch.conflict;
      const next: IntegrationBatch = {
        ...batch,
        status: "applying",
        conflict: null,
        tasks: batch.tasks.map((entry) =>
          entry.taskId === conflict.taskId ? { ...entry, status: "applied", appliedCommit } : entry,
        ),
        humanChanges: batch.humanChanges.some((change) => change.commit === appliedCommit)
          ? batch.humanChanges
          : [
              ...batch.humanChanges,
              {
                commit: appliedCommit,
                summary: `Resolved conflicts while applying Task ${conflict.taskId}.`,
                files: files.stdout.split("\0").filter(Boolean).sort(),
                createdAt: updatedAt,
              },
            ],
        updatedAt,
      };
      yield* update(projectId, next, "reconciled");
      yield* applyRemaining(projectId, batchId);
    },
  );

  const validate = Effect.fn("IntegrationReactor.validate")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
    acknowledgeExternalChanges: boolean,
  ) {
    const { project, batch } = yield* readBatch(projectId, batchId);
    if (!project || !batch?.workspacePath) return;
    if (!batch.tasks.every((task) => task.status === "applied")) return;
    const dirty = yield* statusPorcelain(batch.workspacePath);
    if (dirty !== "") {
      return yield* fail(
        projectId,
        batch,
        acknowledgeExternalChanges
          ? "external-changes-require-commit"
          : "external-worktree-changes",
        "Integration worktree has external changes. Review and commit them explicitly before validation.",
      );
    }
    const headCommit = yield* resolve(batch.workspacePath, "HEAD");
    const treeId = yield* resolve(batch.workspacePath, "HEAD^{tree}");
    const startedAt = yield* now;
    const capturedBatch = yield* captureHumanChanges(batch, headCommit);
    let next: IntegrationBatch = {
      ...capturedBatch,
      status: "validating",
      validationSnapshot: { headCommit, treeId, status: "current", capturedAt: startedAt },
      qualityGateRuns: [],
      failureCode: null,
      failureReason: null,
      updatedAt: startedAt,
    };
    yield* update(projectId, next, "reconciled");
    const configuredGates = (project.qualityPolicy?.gates ?? []).filter((gate) => gate.enabled);
    const unapprovedGate = configuredGates.find((gate) => gate.approvedCommand !== gate.command);
    if (unapprovedGate) {
      return yield* fail(
        projectId,
        next,
        "quality-gate-not-approved",
        `Quality gate '${unapprovedGate.label}' is not approved for exact execution.`,
      );
    }
    const gates = configuredGates.filter(
      (gate) => gate.enabled && gate.approvedCommand === gate.command,
    );
    for (const gate of gates) {
      const runId = QualityGateRunId.make(yield* crypto.randomUUIDv4);
      const runStarted = yield* now;
      const result = yield* runQualityGateProcess({
        command: gate.command,
        cwd: batch.workspacePath,
        timeoutSeconds: gate.timeoutSeconds,
        platform,
        processRunner,
      });
      const completedAt = yield* now;
      const currentHead = yield* resolve(batch.workspacePath, "HEAD");
      const currentTree = yield* resolve(batch.workspacePath, "HEAD^{tree}");
      const currentDirty = yield* statusPorcelain(batch.workspacePath);
      const mutated = currentHead !== headCommit || currentTree !== treeId || currentDirty !== "";
      const run: IntegrationQualityGateRun = {
        id: runId,
        batchId,
        snapshotTreeId: treeId,
        gateId: gate.id,
        label: gate.label,
        command: gate.command,
        required: gate.required,
        timeoutSeconds: gate.timeoutSeconds,
        status: mutated ? "stale" : result.status,
        cwd: batch.workspacePath,
        exitCode: result.exitCode,
        startedAt: runStarted,
        completedAt,
        outputSummary: mutated
          ? "Quality gate mutated the Integration worktree or HEAD; validation is stale."
          : result.outputSummary,
        outputTruncated: result.outputTruncated,
      };
      next = {
        ...next,
        qualityGateRuns: [...next.qualityGateRuns, run],
        validationSnapshot: mutated
          ? { ...next.validationSnapshot!, status: "stale" }
          : next.validationSnapshot,
        updatedAt: completedAt,
      };
      yield* update(projectId, next, "reconciled");
      if (mutated) {
        return yield* fail(projectId, next, "mutating-quality-gate", run.outputSummary);
      }
      if (gate.required && run.status !== "passed") {
        return yield* fail(
          projectId,
          next,
          "required-quality-gate-failed",
          `Required gate '${gate.label}' did not pass.`,
        );
      }
    }
    const finalHead = yield* resolve(batch.workspacePath, "HEAD");
    const finalTree = yield* resolve(batch.workspacePath, "HEAD^{tree}");
    const finalDirty = yield* statusPorcelain(batch.workspacePath);
    if (finalHead !== headCommit || finalTree !== treeId || finalDirty !== "") {
      next = {
        ...next,
        validationSnapshot: { ...next.validationSnapshot!, status: "stale" },
        updatedAt: yield* now,
      };
      return yield* fail(
        projectId,
        next,
        "integration-mutated-during-validation",
        "Integration changed after validation began and cannot be marked Ready.",
      );
    }
    const readyAt = yield* now;
    next = { ...next, status: "ready", readyAt, updatedAt: readyAt };
    yield* update(projectId, next, "validation-finished");
  });

  const abort = Effect.fn("IntegrationReactor.abort")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    const { batch } = yield* readBatch(projectId, batchId);
    if (!batch) return;
    if (batch.workspacePath) {
      const active = yield* execute(
        batch.workspacePath,
        "Integration.abort.detect",
        ["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"],
        { allowNonZeroExit: true },
      );
      if (active.exitCode === 0) {
        yield* execute(batch.workspacePath, "Integration.abort", ["cherry-pick", "--abort"]);
      }
    }
    const updatedAt = yield* now;
    yield* update(
      projectId,
      { ...batch, status: "cancelled", conflict: null, updatedAt },
      "cancelled",
    );
  });

  const remove = Effect.fn("IntegrationReactor.remove")(function* (
    projectId: ProjectId,
    batchId: IntegrationBatchId,
  ) {
    const { batch } = yield* readBatch(projectId, batchId);
    if (!batch?.workspacePath) return;
    if ((yield* statusPorcelain(batch.workspacePath)) !== "") {
      return yield* fail(
        projectId,
        batch,
        "dirty-workspace",
        "Commit or discard Integration workspace changes before cleanup.",
      );
    }
    if (yield* fs.exists(batch.workspacePath)) {
      yield* workflow.removeWorktree({ cwd: batch.sourceRepository, path: batch.workspacePath });
    }
    const removedAt = yield* now;
    yield* update(
      projectId,
      { ...batch, workspacePath: null, removedAt, updatedAt: removedAt },
      "workspace-removed",
    );
  });

  const process = Effect.fn("IntegrationReactor.process")(function* (event: IntegrationEvent) {
    if (event.type === "integration.updated") {
      if (event.payload.reason === "validation-started") {
        yield* validate(event.payload.projectId, event.payload.batch.id, false);
      }
    } else if (event.type === "integration.created") {
      yield* prepare(event.payload.projectId, event.payload.batch.id);
    } else if (event.type === "integration.continue-requested") {
      yield* continueConflict(event.payload.projectId, event.payload.batchId);
    } else if (event.type === "integration.abort-requested") {
      yield* abort(event.payload.projectId, event.payload.batchId);
    } else if (event.type === "integration.validation-requested") {
      yield* validate(
        event.payload.projectId,
        event.payload.batchId,
        event.payload.acknowledgeExternalChanges === true,
      );
    } else {
      yield* remove(event.payload.projectId, event.payload.batchId);
    }
  });

  const processSafely = (event: IntegrationEvent) =>
    process(event).pipe(
      Effect.catchCause((cause) =>
        readBatch(
          event.payload.projectId,
          "batch" in event.payload ? event.payload.batch.id : event.payload.batchId,
        ).pipe(
          Effect.flatMap(({ batch }) =>
            batch
              ? fail(
                  event.payload.projectId,
                  batch,
                  "integration-operation-failed",
                  "Integration operation failed safely. Inspect the preserved branch and worktree.",
                )
              : Effect.void,
          ),
          Effect.tap(() =>
            Effect.logWarning("Integration operation failed", { cause: Cause.pretty(cause) }),
          ),
          Effect.catchCause(() => Effect.void),
        ),
      ),
    );
  const worker = yield* makeDrainableWorker(processSafely);

  const reconcile = Effect.gen(function* () {
    const model = yield* snapshots.getCommandReadModel();
    for (const project of model.projects) {
      for (const batch of project.integrationBatches ?? []) {
        if (batch.status === "preparing") yield* prepare(project.id, batch.id);
        else if (batch.status === "applying") yield* applyRemaining(project.id, batch.id);
        else if (batch.status === "conflict") {
          yield* reconcileCompletedConflict(project.id, batch.id);
        } else if (batch.status === "validating") {
          yield* fail(
            project.id,
            batch,
            "validation-interrupted",
            "Integration validation was interrupted by server restart; run validation again.",
          );
        }
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Integration startup reconciliation failed", {
        cause: Cause.pretty(cause),
      }),
    ),
  );

  const start: IntegrationReactorShape["start"] = Effect.fn("IntegrationReactor.start")(
    function* () {
      yield* forkParked(
        Stream.runForEach(engine.streamDomainEvents, (event) =>
          event.type === "integration.created" ||
          event.type === "integration.continue-requested" ||
          event.type === "integration.abort-requested" ||
          event.type === "integration.validation-requested" ||
          event.type === "integration.workspace-remove-requested" ||
          (event.type === "integration.updated" && event.payload.reason === "validation-started")
            ? worker.enqueue(event)
            : Effect.void,
        ),
      );
      yield* reconcile;
    },
  );

  return { start, drain: worker.drain } satisfies IntegrationReactorShape;
});

export const IntegrationReactorLive = Layer.effect(IntegrationReactor, make).pipe(
  Layer.provide(ProcessRunner.layer),
);
