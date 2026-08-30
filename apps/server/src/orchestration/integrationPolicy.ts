import {
  IntegrationBatchId,
  TaskIntegrationArtifactId,
  TaskResultId,
  type IntegrationBatch,
  type OrchestrationProject,
  type OrchestrationTask,
  type TaskId,
} from "@t3tools/contracts";

export interface IntegrationEligibility {
  readonly eligible: boolean;
  readonly reasons: ReadonlyArray<string>;
}

export function taskResultId(task: OrchestrationTask): TaskResultId {
  const snapshotId = task.result?.snapshotId ?? task.reviewSnapshot?.id ?? "missing";
  return TaskResultId.make(`task-result:${task.id}:${snapshotId}`);
}

export function taskArtifactId(task: OrchestrationTask): TaskIntegrationArtifactId {
  return TaskIntegrationArtifactId.make(`task-artifact:${taskResultId(task)}`);
}

export function integrationEligibility(
  project: OrchestrationProject,
  task: OrchestrationTask,
): IntegrationEligibility {
  const reasons: string[] = [];
  const result = task.result ?? null;
  const snapshot = task.reviewSnapshot ?? null;
  const handoff = task.handoff ?? null;

  if (task.replan?.state === "superseded")
    reasons.push("Task was superseded by an applied Replan.");
  if (task.replan?.state === "stale" || task.replan?.state === "requires_review")
    reasons.push("Task evidence is stale after an applied Replan.");

  if (task.projectId !== project.id) reasons.push("Task belongs to another project.");
  if (task.status !== "completed" || result === null) reasons.push("Task is not completed.");
  if (snapshot === null || result?.snapshotId !== snapshot.id) {
    reasons.push("Completed result is not bound to the retained approved snapshot.");
  }
  if (snapshot !== null && snapshot.ownershipStatus !== "valid") {
    reasons.push("Snapshot ownership was not valid.");
  }
  if (task.ownership?.required === true && task.ownership.status !== "valid") {
    reasons.push("Required ownership validation did not pass.");
  }
  if (handoff?.status !== "ready" || handoff.snapshotId !== result?.snapshotId) {
    reasons.push("Task handoff is not ready for the completed snapshot.");
  }

  for (const gate of (project.qualityPolicy?.gates ?? []).filter(
    (candidate) => candidate.enabled && candidate.required && candidate.scope !== "integration",
  )) {
    const passed = (task.qualityGateRuns ?? []).some(
      (run) =>
        run.snapshotId === result?.snapshotId &&
        run.gateId === gate.id &&
        run.command === gate.command &&
        run.status === "passed",
    );
    if (!passed) reasons.push(`Required quality gate '${gate.label}' did not pass.`);
  }

  const reviewRequired = task.reviewRequired === true;
  if (reviewRequired) {
    const approved = (task.reviews ?? []).some(
      (review) =>
        review.snapshotId === result?.snapshotId &&
        review.status === "completed" &&
        (review.verdict === "approve" || review.verdict === "approve_with_notes"),
    );
    if (!approved) reasons.push("Required independent review is not approved.");
  }

  return { eligible: reasons.length === 0, reasons };
}

export function integrationOverlapPaths(tasks: ReadonlyArray<OrchestrationTask>): string[] {
  const owners = new Map<string, Set<string>>();
  for (const task of tasks) {
    for (const file of task.result?.files ?? []) {
      for (const path of [file.path, file.previousPath].filter(
        (candidate): candidate is string => candidate !== null,
      )) {
        const taskIds = owners.get(path) ?? new Set<string>();
        taskIds.add(task.id);
        owners.set(path, taskIds);
      }
    }
  }
  return [...owners.entries()]
    .filter(([, taskIds]) => taskIds.size > 1)
    .map(([path]) => path)
    .sort();
}

export function integrationBranchName(
  batchId: IntegrationBatchId,
  taskTitles: ReadonlyArray<string> = [],
): string {
  const safeId = String(batchId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const safeTitle = taskTitles
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `nebula/integration/${safeId || "batch"}${safeTitle ? `-${safeTitle}` : ""}`;
}

export function buildIntegrationBatch(input: {
  readonly project: OrchestrationProject;
  readonly batchId: IntegrationBatchId;
  readonly taskIds: ReadonlyArray<TaskId>;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly acknowledgeOverlaps: boolean;
  readonly createdAt: string;
}): IntegrationBatch {
  const selected = input.taskIds.map((taskId) => {
    const task = input.tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined || task.result === null || task.result === undefined) {
      throw new Error(`Missing completed Task '${taskId}'.`);
    }
    return task;
  });
  const bases = new Set(selected.map((task) => task.result!.baseCommit));
  if (bases.size !== 1) throw new Error("Selected Tasks do not share one exact base commit.");
  const overlapPaths = integrationOverlapPaths(selected);
  if (overlapPaths.length > 0 && !input.acknowledgeOverlaps) {
    throw new Error("Overlapping Task paths must be acknowledged before integration.");
  }
  const baseCommit = selected[0]?.result?.baseCommit;
  if (baseCommit === undefined) throw new Error("At least one completed Task must be selected.");

  return {
    id: input.batchId,
    projectId: input.project.id,
    title: `Integration ${String(input.batchId).slice(0, 8)}`,
    baseCommit,
    sourceRepository: input.project.workspaceRoot,
    branch: integrationBranchName(
      input.batchId,
      selected.map((task) => task.title),
    ),
    workspacePath: null,
    status: "preparing",
    tasks: selected.map((task, order) => ({
      taskId: task.id,
      taskResultId: taskResultId(task),
      snapshotId: task.result!.snapshotId,
      order,
      status: "pending",
      artifact: null,
      appliedCommit: null,
    })),
    overlapPaths,
    overlapsAcknowledged: input.acknowledgeOverlaps,
    conflict: null,
    validationSnapshot: null,
    qualityGateRuns: [],
    humanChanges: [],
    failureCode: null,
    failureReason: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    readyAt: null,
    removedAt: null,
  };
}
