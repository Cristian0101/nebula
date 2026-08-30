import type {
  Mission,
  MissionRun,
  MissionRunAttention,
  MissionFinalReport,
  IntegrationBatch,
  IntegrationHumanChange,
  IntegrationQualityGateRun,
  MissionCheckpoint,
  OrchestrationProject,
  OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";

import { computeExecutionWaves } from "./missionGraph.ts";

export interface MissionRunSchedulingDecision {
  readonly kind:
    | "scheduled"
    | "waiting_dependency"
    | "waiting_checkpoint"
    | "waiting_resource"
    | "waiting_concurrency";
  readonly taskId: TaskId;
  readonly reason: string;
  readonly sourceTaskIds: ReadonlyArray<TaskId>;
}

export interface MissionRunSchedulingPlan {
  readonly scheduledTaskIds: ReadonlyArray<TaskId>;
  readonly currentReadyTaskIds: ReadonlyArray<TaskId>;
  readonly attention: ReadonlyArray<MissionRunAttention>;
  readonly decisions: ReadonlyArray<MissionRunSchedulingDecision>;
}

const taskOrder = (mission: Mission) =>
  new Map(mission.taskIds.map((taskId, index) => [taskId, index] as const));

export function deterministicMissionTaskIds(mission: Mission): ReadonlyArray<TaskId> {
  const order = taskOrder(mission);
  return computeExecutionWaves(mission.taskIds, mission.dependencies)
    .flatMap((wave) => wave.taskIds.map((taskId) => ({ taskId, wave: wave.number })))
    .toSorted(
      (left, right) =>
        left.wave - right.wave ||
        (order.get(left.taskId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.taskId) ?? Number.MAX_SAFE_INTEGER) ||
        left.taskId.localeCompare(right.taskId),
    )
    .map(({ taskId }) => taskId);
}

export type MissionCheckpointState =
  | "pending_tasks"
  | "pending_gates"
  | "pending_reviews"
  | "awaiting_human"
  | "passed";

export function resolveMissionCheckpointState(
  checkpoint: MissionCheckpoint,
  tasks: ReadonlyArray<OrchestrationTask>,
  taskGateIds?: ReadonlySet<string>,
): {
  readonly state: MissionCheckpointState;
  readonly blockerTaskIds: ReadonlyArray<TaskId>;
  readonly detail: string;
} {
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const required = checkpoint.requiredTaskIds.map((taskId) => taskById.get(taskId));
  const pendingTasks = checkpoint.requiredTaskIds.filter(
    (taskId) => taskById.get(taskId)?.status !== "completed",
  );
  if (pendingTasks.length > 0)
    return {
      state: "pending_tasks",
      blockerTaskIds: pendingTasks,
      detail: `Waiting for checkpoint '${checkpoint.name}' prerequisite Tasks.`,
    };
  const requiredTaskGateIds = taskGateIds
    ? checkpoint.requiredGateIds.filter((gateId) => taskGateIds.has(gateId))
    : checkpoint.requiredGateIds;
  const gateBlocked = required.filter((task) =>
    requiredTaskGateIds.some(
      (gateId) =>
        !task?.qualityGateRuns?.some(
          (run) =>
            run.gateId === gateId &&
            run.status === "passed" &&
            run.snapshotId === task.reviewSnapshot?.id,
        ),
    ),
  );
  if (gateBlocked.length > 0)
    return {
      state: "pending_gates",
      blockerTaskIds: gateBlocked.flatMap((task) => (task ? [task.id] : [])),
      detail: `Waiting for required quality gates at checkpoint '${checkpoint.name}'.`,
    };
  const reviewBlocked = checkpoint.reviewsRequired
    ? required.filter(
        (task) =>
          !task?.reviews?.some(
            (review) =>
              review.status === "completed" &&
              review.snapshotId === task.reviewSnapshot?.id &&
              (review.verdict === "approve" || review.verdict === "approve_with_notes"),
          ),
      )
    : [];
  if (reviewBlocked.length > 0)
    return {
      state: "pending_reviews",
      blockerTaskIds: reviewBlocked.flatMap((task) => (task ? [task.id] : [])),
      detail: `Waiting for independent review at checkpoint '${checkpoint.name}'.`,
    };
  if (checkpoint.humanApprovalRequired && checkpoint.humanApprovedAt === null)
    return {
      state: "awaiting_human",
      blockerTaskIds: [],
      detail: `Waiting for human approval at checkpoint '${checkpoint.name}'.`,
    };
  return { state: "passed", blockerTaskIds: [], detail: `Checkpoint '${checkpoint.name}' passed.` };
}

function configurationAttention(input: {
  readonly task: OrchestrationTask;
  readonly project: Pick<OrchestrationProject, "sharedResources">;
  readonly providerReadyTaskIds: ReadonlySet<TaskId>;
  readonly autoRoutableTaskIds?: ReadonlySet<TaskId>;
}): MissionRunAttention[] {
  const { task, project, providerReadyTaskIds } = input;
  const attention: MissionRunAttention[] = [];
  if (task.replan?.state === "stale" || task.replan?.state === "requires_review")
    attention.push({
      taskId: task.id,
      code: "replan_context_stale",
      detail: "Task inputs or contract context are stale after an applied Replan.",
      blocksMission: false,
    });
  if (task.role !== "builder")
    attention.push({
      taskId: task.id,
      code: "unsupported_role",
      detail: `Role '${task.role}' has no managed supervised start flow.`,
      blocksMission: false,
    });
  if (!task.modelSelection && !input.autoRoutableTaskIds?.has(task.id))
    attention.push({
      taskId: task.id,
      code: "provider_unassigned",
      detail: "Provider assignment is missing.",
      blocksMission: false,
    });
  else if (
    task.modelSelection &&
    !providerReadyTaskIds.has(task.id) &&
    !input.autoRoutableTaskIds?.has(task.id)
  )
    attention.push({
      taskId: task.id,
      code: "provider_unavailable",
      detail: `Provider '${task.modelSelection.instanceId}' is not ready.`,
      blocksMission: false,
    });
  if (
    task.ownership?.required === true &&
    !task.ownership.rules.some((rule) => rule.access === "write")
  )
    attention.push({
      taskId: task.id,
      code: "ownership_missing",
      detail: "Write ownership is not configured.",
      blocksMission: false,
    });
  if (task.workspace?.status === "failed" || task.workspace?.status === "missing")
    attention.push({
      taskId: task.id,
      code: "workspace_unavailable",
      detail: task.workspace.failureReason ?? "The managed Task workspace is unavailable.",
      blocksMission: false,
    });
  const enabledResources = new Set(
    (project.sharedResources ?? [])
      .filter((resource) => resource.enabled)
      .map((resource) => resource.id),
  );
  const missingResource = (task.requiredResourceIds ?? []).find(
    (resourceId) => !enabledResources.has(resourceId),
  );
  if (missingResource)
    attention.push({
      taskId: task.id,
      code: "resource_unavailable",
      detail: `Required shared resource '${missingResource}' is missing or disabled.`,
      blocksMission: false,
    });
  return attention;
}

export function planMissionRunScheduling(input: {
  readonly mission: Mission;
  readonly run: MissionRun;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly project: Pick<
    OrchestrationProject,
    "sharedResources" | "resourceLeases" | "qualityPolicy"
  >;
  readonly providerReadyTaskIds: ReadonlySet<TaskId>;
  readonly blockedTaskIds?: ReadonlySet<TaskId>;
  readonly autoRoutableTaskIds?: ReadonlySet<TaskId>;
}): MissionRunSchedulingPlan {
  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const prerequisites = new Map<TaskId, TaskId[]>();
  for (const dependency of input.mission.dependencies) {
    prerequisites.set(dependency.dependentTaskId, [
      ...(prerequisites.get(dependency.dependentTaskId) ?? []),
      dependency.prerequisiteTaskId,
    ]);
  }
  const checkpointsByUnlockedTask = new Map<TaskId, MissionCheckpoint[]>();
  for (const checkpoint of input.mission.checkpoints ?? [])
    for (const taskId of checkpoint.unlockTaskIds)
      checkpointsByUnlockedTask.set(taskId, [
        ...(checkpointsByUnlockedTask.get(taskId) ?? []),
        checkpoint,
      ]);
  const taskGateIds = new Set(
    (input.project.qualityPolicy?.gates ?? [])
      .filter((gate) => gate.enabled && gate.scope !== "integration")
      .map((gate) => gate.id),
  );
  const checkpointStateByKey = new Map(
    (input.mission.checkpoints ?? []).map((checkpoint) => [
      checkpoint.key,
      resolveMissionCheckpointState(checkpoint, input.tasks, taskGateIds),
    ]),
  );
  const scheduled = new Set(
    input.run.scheduledTaskIds.filter((taskId) => taskById.get(taskId)?.status !== "completed"),
  );
  const activeTaskIds = input.mission.taskIds.filter(
    (taskId) => taskById.get(taskId)?.status === "active",
  );
  const reservedResources = new Map<string, TaskId>();
  for (const lease of input.project.resourceLeases ?? []) {
    if (lease.status === "held") reservedResources.set(lease.resourceId, lease.taskId);
  }
  for (const taskId of scheduled) {
    const task = taskById.get(taskId);
    for (const resourceId of task?.requiredResourceIds ?? []) {
      if (!reservedResources.has(resourceId)) reservedResources.set(resourceId, taskId);
    }
  }

  const attention: MissionRunAttention[] = [];
  const decisions: MissionRunSchedulingDecision[] = [];
  const currentReadyTaskIds: TaskId[] = [];
  for (const taskId of scheduled) {
    const task = taskById.get(taskId);
    if (!task || task.status !== "draft") continue;
    attention.push(
      ...configurationAttention({
        task,
        project: input.project,
        providerReadyTaskIds: input.providerReadyTaskIds,
        ...(input.autoRoutableTaskIds ? { autoRoutableTaskIds: input.autoRoutableTaskIds } : {}),
      }),
    );
  }
  let occupied = new Set([...scheduled, ...activeTaskIds]).size;
  for (const taskId of deterministicMissionTaskIds(input.mission)) {
    const task = taskById.get(taskId);
    if (!task || task.status !== "draft" || scheduled.has(taskId)) continue;
    const sourceTaskIds = prerequisites.get(taskId) ?? [];
    const checkpointBlocker = (checkpointsByUnlockedTask.get(taskId) ?? [])
      .map((checkpoint) => checkpointStateByKey.get(checkpoint.key)!)
      .find((checkpointState) => checkpointState.state !== "passed");
    if (checkpointBlocker) {
      decisions.push({
        kind: "waiting_checkpoint",
        taskId,
        reason: checkpointBlocker.detail,
        sourceTaskIds: checkpointBlocker.blockerTaskIds,
      });
      continue;
    }
    const blockers = sourceTaskIds.filter((id) => taskById.get(id)?.status !== "completed");
    if (blockers.length > 0) {
      decisions.push({
        kind: "waiting_dependency",
        taskId,
        reason: `Waiting for prerequisite Tasks: ${blockers.join(", ")}.`,
        sourceTaskIds: blockers,
      });
      continue;
    }
    if (input.blockedTaskIds?.has(taskId)) continue;
    const taskAttention = configurationAttention({
      task,
      project: input.project,
      providerReadyTaskIds: input.providerReadyTaskIds,
      ...(input.autoRoutableTaskIds ? { autoRoutableTaskIds: input.autoRoutableTaskIds } : {}),
    });
    if (taskAttention.length > 0) {
      attention.push(...taskAttention);
      continue;
    }
    currentReadyTaskIds.push(taskId);
    const resourceId = (task.requiredResourceIds ?? []).find((candidate) => {
      const holder = reservedResources.get(candidate);
      return holder !== undefined && holder !== task.id;
    });
    if (resourceId) {
      const holder = reservedResources.get(resourceId)!;
      const resource = (input.project.sharedResources ?? []).find(
        (candidate) => candidate.id === resourceId,
      );
      decisions.push({
        kind: "waiting_resource",
        taskId,
        reason: `Waiting for resource '${resource?.name ?? resourceId}', held by Task '${holder}'.`,
        sourceTaskIds: [holder],
      });
      continue;
    }
    if (occupied >= input.run.maxConcurrentTasks) {
      decisions.push({
        kind: "waiting_concurrency",
        taskId,
        reason: `Waiting for an active writable Task slot (${occupied}/${input.run.maxConcurrentTasks} occupied).`,
        sourceTaskIds: [],
      });
      continue;
    }
    scheduled.add(taskId);
    occupied += 1;
    for (const candidate of task.requiredResourceIds ?? [])
      reservedResources.set(candidate, taskId);
    decisions.push({
      kind: "scheduled",
      taskId,
      reason: `Dependencies satisfied, resources available, provider ready, slot ${occupied}/${input.run.maxConcurrentTasks} reserved.`,
      sourceTaskIds,
    });
  }

  return {
    scheduledTaskIds: [...scheduled],
    currentReadyTaskIds,
    attention,
    decisions,
  };
}

const bounded = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 16))}\n[truncated]`;

const lines = (values: ReadonlyArray<string>, limit: number) =>
  values.slice(0, limit).map((value) => `- ${bounded(value, 500)}`);

export interface TaskContextPackage {
  readonly text: string;
  readonly sourceTaskIds: ReadonlyArray<TaskId>;
}

export function missionIntegrationOverlapPaths(
  tasks: ReadonlyArray<OrchestrationTask>,
): ReadonlyArray<string> {
  const owners = new Map<string, Set<TaskId>>();
  for (const task of tasks) {
    for (const file of task.result?.files ?? []) {
      const taskIds = owners.get(file.path) ?? new Set<TaskId>();
      taskIds.add(task.id);
      owners.set(file.path, taskIds);
    }
  }
  return [...owners]
    .filter(([, taskIds]) => taskIds.size > 1)
    .map(([path]) => path)
    .toSorted();
}

const missingArtifactRiskPattern =
  /\b(?:absent|missing|does not exist|neither .+ exists|not currently executable|incomplete)\b/i;
const repositoryPathPattern = /\b(?:apps|docs|packages|src|tests)\/[a-z0-9_./-]+\.[a-z0-9]+\b/gi;

export function reconcileMissionRisks(input: {
  readonly historicalRisks: ReadonlyArray<string>;
  readonly explicitResolvedRisks: ReadonlySet<string>;
  readonly integratedFiles: ReadonlyArray<string>;
  readonly finalEvidenceComplete: boolean;
}) {
  const integratedFiles = new Set(input.integratedFiles.map((file) => file.toLowerCase()));
  const integratedArtifactNames = input.integratedFiles
    .map(
      (file) =>
        file
          .split("/")
          .at(-1)
          ?.replace(/\.[^.]+$/, "")
          .toLowerCase() ?? "",
    )
    .filter((name) => name.length >= 8);
  const hasIntegratedArtifactEvidence = (risk: string) => {
    if (!input.finalEvidenceComplete || !missingArtifactRiskPattern.test(risk)) return false;
    const normalizedRisk = risk.toLowerCase();
    const referencedPaths = [...risk.matchAll(repositoryPathPattern)].map((match) =>
      match[0].toLowerCase(),
    );
    if (referencedPaths.length > 0) {
      return referencedPaths.every((path) => integratedFiles.has(path));
    }
    return integratedArtifactNames.some((name) => normalizedRisk.includes(name));
  };
  const hasCanonicalReplacementEvidence = (risk: string) =>
    input.finalEvidenceComplete && /^builder-reported evidence:\s*none retained\.?$/i.test(risk);
  const resolvedRisks = input.historicalRisks.filter(
    (risk) =>
      input.explicitResolvedRisks.has(risk) ||
      hasIntegratedArtifactEvidence(risk) ||
      hasCanonicalReplacementEvidence(risk),
  );
  const resolved = new Set(resolvedRisks);
  return {
    resolvedRisks,
    remainingRisks: input.historicalRisks.filter((risk) => !resolved.has(risk)),
  };
}

export function buildMissionFinalReport(input: {
  readonly mission: Mission;
  readonly run: MissionRun;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly integrationBranch: string | null;
  readonly finalValidation: MissionFinalReport["finalValidation"];
  readonly integrationQualityGateRuns?: ReadonlyArray<IntegrationQualityGateRun>;
  readonly integrationHumanChanges?: ReadonlyArray<IntegrationHumanChange>;
  readonly integrationConflictCount?: number;
  readonly finalIntegrationCommit?: string | null;
  readonly planVersion?: number;
  readonly planHumanEditCount?: number;
  readonly generatedAt: string;
}): MissionFinalReport {
  const currentTasks = input.tasks.filter((task) => task.replan?.state !== "superseded");
  const recovery = input.run.taskRecovery ?? [];
  const providersUsed = new Set(
    recovery.flatMap((state) => state.attempts.map((attempt) => attempt.providerInstanceId)),
  );
  for (const task of input.tasks) {
    if (task.result?.providerInstanceId) providersUsed.add(task.result.providerInstanceId);
  }
  const reviewSummary = summarizeMissionReviewCoverage(currentTasks);
  const requiredFinalGates = (input.integrationQualityGateRuns ?? []).filter((run) => run.required);
  const waitingResourceTaskIds = new Set(
    input.run.decisions.flatMap((decision) =>
      decision.kind === "waiting_resource" && decision.taskId ? [decision.taskId] : [],
    ),
  );
  const providerReplacementCount = recovery.reduce(
    (count, state) =>
      count + state.attempts.filter((attempt) => attempt.kind === "replacement").length,
    0,
  );
  const appliedReplans = (input.run.replanProposals ?? []).filter(
    (proposal) => proposal.status === "applied",
  );
  const rejectedReplans = (input.run.replanProposals ?? []).filter(
    (proposal) => proposal.status === "rejected",
  );
  const addedTaskIds = new Set(
    (input.mission.planVersions ?? []).flatMap((version) => version.addedTaskIds),
  );
  const remediationRoundCount = recovery.reduce(
    (count, state) => count + state.remediationRounds,
    0,
  );
  const resolvedCoordinationCount = (input.run.coordinationRequests ?? []).filter(
    (request) => request.status !== "pending" && request.resolvedAt !== null,
  ).length;
  const resolvedOwnershipCount = input.tasks.reduce(
    (count, task) =>
      count +
      (task.ownershipRequests ?? []).filter(
        (request) => request.status !== "pending" && request.status !== "cancelled",
      ).length,
    0,
  );
  const reviewRemediationCount = input.tasks.reduce(
    (count, task) =>
      count +
      (task.reviews ?? []).filter(
        (review) => review.verdict === "request_changes" && review.findingsSentAt !== null,
      ).length,
    0,
  );
  const ownershipViolationCount = input.tasks.filter(
    (task) =>
      task.ownership?.status === "violation" || task.resourceCompliance?.status === "violation",
  ).length;
  const filesChanged = [
    ...new Set(input.tasks.flatMap((task) => (task.result?.files ?? []).map((file) => file.path))),
  ].toSorted();
  const historicalRisks = [
    ...new Set(input.tasks.flatMap((task) => task.result?.knownRisks ?? [])),
  ];
  const explicitResolutionEvidence = new Set(
    (input.integrationHumanChanges ?? []).flatMap((change) => change.resolvedRisks ?? []),
  );
  const { resolvedRisks, remainingRisks } = reconcileMissionRisks({
    historicalRisks,
    explicitResolvedRisks: explicitResolutionEvidence,
    integratedFiles: filesChanged,
    finalEvidenceComplete:
      requiredFinalGates.length > 0 &&
      requiredFinalGates.every((run) => run.status === "passed") &&
      reviewSummary.required > 0 &&
      reviewSummary.approved === reviewSummary.required,
  });
  return {
    missionObjective: input.mission.objective,
    ...(input.planVersion ? { planVersion: input.planVersion } : {}),
    taskIds: currentTasks.map((task) => task.id),
    completedTaskIds: currentTasks
      .filter((task) => task.status === "completed")
      .map((task) => task.id),
    attemptCount: recovery.reduce((count, state) => count + state.attempts.length, 0),
    providersUsed: [...providersUsed].toSorted(),
    providerReplacementCount,
    appliedReplanCount: appliedReplans.length,
    taskReplanCount: appliedReplans.filter(
      (proposal) => proposal.scope === "task_repair" || proposal.scope === "task_split",
    ).length,
    subgraphReplanCount: appliedReplans.filter((proposal) => proposal.scope === "mission_subgraph")
      .length,
    missionReplanCount: appliedReplans.filter((proposal) => proposal.scope === "full_mission")
      .length,
    rejectedReplanCount: rejectedReplans.length,
    supersededTaskCount: input.tasks.filter((task) => task.replan?.state === "superseded").length,
    dynamicTaskCount: addedTaskIds.size,
    providerSubstitutionCount: providerReplacementCount,
    retryCount: recovery.reduce((count, state) => count + state.transientRetries, 0),
    remediationRoundCount,
    qualityGateCount: input.tasks.reduce(
      (count, task) => count + (task.qualityGateRuns?.length ?? 0),
      0,
    ),
    reviewCount: input.tasks.reduce((count, task) => count + (task.reviews?.length ?? 0), 0),
    requiredQualityGateCount: requiredFinalGates.length,
    passedQualityGateCount: requiredFinalGates.filter((run) => run.status === "passed").length,
    requiredReviewCount: reviewSummary.required,
    approvedReviewCount: reviewSummary.approved,
    historicalReviewAttemptCount: reviewSummary.historicalAttempts,
    reviewChangesRequestedCount: reviewSummary.changesRequested,
    staleReviewCount: reviewSummary.stale,
    resourceConflictCount: waitingResourceTaskIds.size,
    resourceWaitCount: waitingResourceTaskIds.size,
    serializedResourceConflictCount: [...waitingResourceTaskIds].filter((taskId) =>
      input.tasks.some((task) => task.id === taskId && task.status === "completed"),
    ).length,
    ownershipViolationCount,
    unresolvedOwnershipViolationCount: ownershipViolationCount,
    integrationConflictCount: input.integrationConflictCount ?? 0,
    filesChanged,
    integrationBranch: input.integrationBranch,
    baseCommit: input.mission.baseCommit ?? null,
    finalIntegrationCommit: input.finalIntegrationCommit ?? null,
    finalValidation: input.finalValidation,
    finalGateResults: [...(input.integrationQualityGateRuns ?? [])],
    humanInterventionCount:
      providerReplacementCount +
      reviewRemediationCount +
      resolvedCoordinationCount +
      resolvedOwnershipCount +
      (input.integrationHumanChanges?.length ?? 0) +
      (input.planHumanEditCount ?? 0),
    knownRisks: historicalRisks,
    historicalRisks,
    resolvedRisks,
    remainingRisks,
    followUps: [...new Set(input.tasks.flatMap((task) => task.result?.followUps ?? []))],
    elapsedMilliseconds: Math.max(
      0,
      new Date(input.generatedAt).getTime() - new Date(input.run.startedAt).getTime(),
    ),
    generatedAt: input.generatedAt,
  };
}

export function summarizeMissionReviewCoverage(tasks: ReadonlyArray<OrchestrationTask>) {
  const requiredTasks = tasks.filter((task) => task.reviewRequired === true);
  const approved = requiredTasks.filter((task) => {
    if (task.reviewSnapshot?.status !== "current") return false;
    return (task.reviews ?? []).some(
      (review) =>
        review.status === "completed" &&
        review.snapshotId === task.reviewSnapshot?.id &&
        (review.verdict === "approve" || review.verdict === "approve_with_notes"),
    );
  }).length;
  const history = tasks.flatMap((task) => task.reviews ?? []);
  return {
    required: requiredTasks.length,
    approved,
    historicalAttempts: history.length,
    changesRequested: history.filter((review) => review.verdict === "request_changes").length,
    stale: history.filter((review) => review.status === "stale").length,
  };
}

export function missionRunCompletionBlockers(input: {
  readonly mission: Mission;
  readonly run: MissionRun;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly integrationBatch: IntegrationBatch | null;
}): ReadonlyArray<string> {
  const blockers: string[] = [];
  const requiredTasks = input.tasks.filter((task) => task.replan?.state !== "superseded");
  if (input.run.swarmPolicy?.autoCompleteMission !== true)
    blockers.push("Mission auto-completion is disabled for this Run.");
  if (
    requiredTasks.length !==
      input.mission.taskIds.filter(
        (taskId) => input.tasks.find((task) => task.id === taskId)?.replan?.state !== "superseded",
      ).length ||
    requiredTasks.some((task) => task.status !== "completed")
  )
    blockers.push("All required Tasks must be completed.");
  for (const task of requiredTasks) {
    if (task.reviewRequired === true) {
      const currentApproval =
        task.reviewSnapshot?.status === "current" &&
        (task.reviews ?? []).some(
          (review) =>
            review.status === "completed" &&
            review.snapshotId === task.reviewSnapshot?.id &&
            (review.verdict === "approve" || review.verdict === "approve_with_notes"),
        );
      if (!currentApproval) blockers.push(`Task '${task.id}' requires a current approving review.`);
    }
    const requiredRuns = (task.qualityGateRuns ?? []).filter(
      (run) => run.required && run.snapshotId === task.reviewSnapshot?.id,
    );
    if (requiredRuns.some((run) => run.status !== "passed"))
      blockers.push(`Task '${task.id}' has a required quality gate that is not passed.`);
  }
  const batch = input.integrationBatch;
  if (!batch || batch.status !== "ready" || batch.validationSnapshot?.status !== "current")
    blockers.push("Integration and final validation must be ready on the current snapshot.");
  else if (batch.qualityGateRuns.some((run) => run.required && run.status !== "passed"))
    blockers.push("A required final validation gate is not passed.");
  return blockers;
}

export function buildTaskContextPackage(input: {
  readonly mission: Mission;
  readonly task: OrchestrationTask;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly project: Pick<OrchestrationProject, "sharedResources" | "resourceLeases">;
}): TaskContextPackage {
  const prerequisiteIds = input.mission.dependencies
    .filter((edge) => edge.dependentTaskId === input.task.id)
    .map((edge) => edge.prerequisiteTaskId);
  const prerequisites = prerequisiteIds
    .map((taskId) => input.tasks.find((task) => task.id === taskId))
    .filter((task): task is OrchestrationTask => task?.status === "completed")
    .slice(0, 12);
  const resourceById = new Map(
    (input.project.sharedResources ?? []).map((resource) => [resource.id, resource] as const),
  );
  const resourceContext = (input.task.requiredResourceIds ?? []).map((resourceId) => {
    const resource = resourceById.get(resourceId);
    const holder = (input.project.resourceLeases ?? []).find(
      (lease) => lease.resourceId === resourceId && lease.status === "held",
    );
    return `${resource?.name ?? resourceId}: ${holder ? `held by ${holder.taskId}` : "available at scheduling"}`;
  });
  const prerequisiteSections = prerequisites.flatMap((prerequisite) => {
    const handoff = prerequisite.handoff;
    const result = prerequisite.result;
    const review = prerequisite.reviews?.findLast((candidate) => candidate.status === "completed");
    return [
      `Prerequisite Task: ${prerequisite.title} (${prerequisite.id})`,
      `Handoff: ${bounded(handoff?.summary || result?.summary || "No structured summary retained.", 1_500)}`,
      "Interface changes:",
      ...lines(handoff?.interfaceChanges ?? result?.interfaceChanges ?? [], 12),
      "Known risks:",
      ...lines(handoff?.knownRisks ?? result?.knownRisks ?? [], 12),
      "Relevant changed files:",
      ...lines(
        (result?.files ?? []).map((file) => file.path),
        30,
      ),
      `Review summary: ${bounded(review?.summary ?? "No independent review summary retained.", 1_000)}`,
      "Important assumptions:",
      ...lines(handoff?.assumptions ?? result?.assumptions ?? [], 12),
      "",
    ];
  });
  const text = [
    "Mission context injected by Nebula (not user-authored)",
    `Mission: ${input.mission.title}`,
    `Mission objective: ${bounded(input.mission.objective, 2_000)}`,
    `Task: ${input.task.title}`,
    `Task objective: ${bounded(input.task.objective, 2_000)}`,
    "Acceptance criteria:",
    ...lines(input.task.acceptanceCriteria ?? [], 20),
    "",
    ...prerequisiteSections,
    "Resource context:",
    ...lines(resourceContext, 20),
    "",
    "This bounded package contains durable Mission, handoff, review, file, assumption, risk, and resource evidence only. It excludes provider transcripts, hidden reasoning, credentials, and unbounded diffs.",
  ].join("\n");
  return { text: bounded(text, 16_000), sourceTaskIds: prerequisites.map((task) => task.id) };
}
