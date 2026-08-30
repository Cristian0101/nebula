import {
  type IntegrationBatch,
  type Mission,
  type MissionContractVersion,
  type MissionPlanVersion,
  type MissionRun,
  type OrchestrationProject,
  type OrchestrationTask,
  type ReplanChangeSet,
  type ReplanImpactAnalysis,
  type ReplanProposal,
  type ReplanScope,
  type ReplanTrigger,
  type FailureClass,
  type TaskId,
  type ThreadId,
} from "@t3tools/contracts";

import { validateMissionGraph } from "./missionGraph.ts";
import { normalizeOwnershipPattern } from "./ownershipPaths.ts";

const unique = <A>(values: ReadonlyArray<A>): A[] => [...new Set(values)];

const materializeModelSelection = (
  selection: NonNullable<NonNullable<ReplanChangeSet["newTasks"]>[number]["modelSelection"]>,
) => ({
  instanceId: selection.instanceId,
  model: selection.model,
  ...(selection.options !== undefined ? { options: selection.options } : {}),
});

const invalidateTaskEvidence = (task: OrchestrationTask): OrchestrationTask => ({
  ...task,
  reviewSnapshot: task.reviewSnapshot ? { ...task.reviewSnapshot, status: "stale" } : null,
  handoff: task.handoff ? { ...task.handoff, status: "stale" } : null,
  qualityGateRuns: (task.qualityGateRuns ?? []).map((run) =>
    run.status === "passed" ? { ...run, status: "stale" as const } : run,
  ),
  reviews: (task.reviews ?? []).map((review) =>
    review.status === "completed" ? { ...review, status: "stale" as const } : review,
  ),
});

export function replanTriggerForFailure(failureClass: FailureClass): ReplanTrigger | null {
  if (failureClass === "planning_architecture_blocker") return "task_blocked_architecturally";
  if (failureClass === "provider_capability_mismatch") return "provider_repeated_failure";
  return null;
}

export function missionDescendantTaskIds(
  mission: Pick<Mission, "dependencies">,
  sourceTaskIds: ReadonlyArray<TaskId>,
): TaskId[] {
  const outgoing = new Map<TaskId, TaskId[]>();
  for (const edge of mission.dependencies)
    outgoing.set(edge.prerequisiteTaskId, [
      ...(outgoing.get(edge.prerequisiteTaskId) ?? []),
      edge.dependentTaskId,
    ]);
  const seen = new Set<TaskId>();
  const queue = [...sourceTaskIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of outgoing.get(current) ?? []) {
      if (seen.has(dependent) || sourceTaskIds.includes(dependent)) continue;
      seen.add(dependent);
      queue.push(dependent);
    }
  }
  return [...seen];
}

export function analyzeReplanImpact(input: {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly sourceTaskId: TaskId | null;
  readonly scope: ReplanScope;
  readonly trigger: ReplanTrigger;
  readonly integrationBatch?: IntegrationBatch | null;
}): ReplanImpactAnalysis {
  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const seedTaskIds = input.sourceTaskId ? [input.sourceTaskId] : [];
  const downstreamTaskIds = missionDescendantTaskIds(input.mission, seedTaskIds);
  const affectedTaskIds =
    input.scope === "full_mission"
      ? [...input.mission.taskIds]
      : input.scope === "mission_subgraph" || input.scope === "task_split"
        ? unique([...seedTaskIds, ...downstreamTaskIds])
        : seedTaskIds;
  const affected = new Set(affectedTaskIds);
  const unaffectedTaskIds = input.mission.taskIds.filter((taskId) => !affected.has(taskId));
  const completedSafeTaskIds = unaffectedTaskIds.filter(
    (taskId) => taskById.get(taskId)?.status === "completed",
  );
  const runningTaskIds = input.mission.taskIds.filter(
    (taskId) => taskById.get(taskId)?.status === "active",
  );
  const reviewsInvalidatedTaskIds = affectedTaskIds.filter((taskId) => {
    const task = taskById.get(taskId);
    return (task?.reviews?.length ?? 0) > 0 || task?.reviewSnapshot != null;
  });
  const integrationAffectedTaskIds = (input.integrationBatch?.tasks ?? [])
    .map((task) => task.taskId)
    .filter((taskId) => affected.has(taskId));
  const taskImpacts = input.mission.taskIds.map((taskId) => {
    const task = taskById.get(taskId);
    if (!affected.has(taskId))
      return {
        taskId,
        disposition: "preserve" as const,
        reason: "Outside the smallest affected graph and safe to preserve.",
      };
    if (task?.status === "completed")
      return {
        taskId,
        disposition: "requires_review" as const,
        reason: "Completed output intersects the changed plan and must be re-evaluated.",
      };
    return {
      taskId,
      disposition: "affected" as const,
      reason:
        taskId === input.sourceTaskId
          ? `Source Task for ${input.trigger}.`
          : "Downstream dependency context may no longer be current.",
    };
  });
  return {
    completedSafeTaskIds,
    runningTaskIds,
    affectedTaskIds,
    downstreamTaskIds,
    unaffectedTaskIds,
    reviewsInvalidatedTaskIds,
    contractsInvalidated: [],
    integrationAffectedTaskIds,
    resourceAffectedTaskIds: input.trigger === "ownership_expansion" ? [...affectedTaskIds] : [],
    taskImpacts,
  };
}

export function validateReplanChangeSet(input: {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly project: Pick<OrchestrationProject, "sharedResources">;
  readonly proposal: ReplanProposal;
  readonly changeSet: ReplanChangeSet;
  readonly validatedAt: string;
  readonly knownProviderInstanceIds?: ReadonlyArray<string>;
}): NonNullable<ReplanProposal["validation"]> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const currentTaskIds = new Set(input.mission.taskIds);
  const existingTaskIds = new Set(input.tasks.map((task) => task.id));
  const knownProviderInstanceIds = new Set(input.knownProviderInstanceIds ?? []);
  const newTaskIds = input.changeSet.newTasks.map((task) => task.taskId);
  if (new Set(newTaskIds).size !== newTaskIds.length) blockers.push("New Task IDs must be unique.");
  for (const task of input.changeSet.newTasks) {
    if (existingTaskIds.has(task.taskId))
      blockers.push(`New Task '${task.taskId}' already exists.`);
    if (!task.ownership.some((rule) => rule.access === "write"))
      blockers.push(`New writable Task '${task.title}' requires an explicit write ownership rule.`);
    if (task.acceptanceCriteria.length === 0)
      blockers.push(`New Task '${task.title}' requires at least one acceptance criterion.`);
    if (
      task.modelSelection !== null &&
      knownProviderInstanceIds.size > 0 &&
      !knownProviderInstanceIds.has(task.modelSelection.instanceId)
    )
      blockers.push(
        `New Task '${task.title}' references unknown provider '${task.modelSelection.instanceId}'.`,
      );
    if (
      task.supersedesTaskId !== null &&
      (!currentTaskIds.has(task.supersedesTaskId) ||
        !input.changeSet.supersededTaskIds.includes(task.supersedesTaskId))
    )
      blockers.push(
        `New Task '${task.title}' must name an existing Task also listed as superseded.`,
      );
    for (const rule of task.ownership) {
      try {
        normalizeOwnershipPattern(rule.pattern);
      } catch (error) {
        blockers.push(
          `Task '${task.title}' has invalid ownership '${rule.pattern}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  const enabledResourceIds = new Set(
    (input.project.sharedResources ?? [])
      .filter((resource) => resource.enabled)
      .map((resource) => resource.id),
  );
  for (const task of input.changeSet.newTasks)
    for (const resourceId of task.requiredResourceIds)
      if (!enabledResourceIds.has(resourceId))
        blockers.push(`New Task '${task.title}' references unavailable resource '${resourceId}'.`);
  for (const modification of input.changeSet.modifiedTasks)
    for (const resourceId of modification.requiredResourceIds ?? [])
      if (!enabledResourceIds.has(resourceId))
        blockers.push(
          `Modified Task '${modification.taskId}' references unavailable resource '${resourceId}'.`,
        );
  for (const modification of input.changeSet.modifiedTasks) {
    const task = input.tasks.find((candidate) => candidate.id === modification.taskId);
    if (!task || !currentTaskIds.has(modification.taskId))
      blockers.push(`Modified Task '${modification.taskId}' is not in the current Mission.`);
    else if (task.status !== "draft")
      blockers.push(
        `Started or terminal Task '${task.title}' must be superseded instead of modified in place.`,
      );
    if (modification.acceptanceCriteria?.length === 0)
      blockers.push(
        `Modified Task '${task?.title ?? modification.taskId}' requires acceptance criteria.`,
      );
    if (
      modification.modelSelection &&
      knownProviderInstanceIds.size > 0 &&
      !knownProviderInstanceIds.has(modification.modelSelection.instanceId)
    )
      blockers.push(
        `Modified Task '${task?.title ?? modification.taskId}' references unknown provider '${modification.modelSelection.instanceId}'.`,
      );
    for (const rule of modification.ownership ?? []) {
      try {
        normalizeOwnershipPattern(rule.pattern);
      } catch (error) {
        blockers.push(
          `Task '${task?.title ?? modification.taskId}' has invalid ownership '${rule.pattern}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  const replacementTasksBySupersededId = new Map<TaskId, ReplanChangeSet["newTasks"]>();
  for (const task of input.changeSet.newTasks) {
    if (task.supersedesTaskId === null) continue;
    replacementTasksBySupersededId.set(task.supersedesTaskId, [
      ...(replacementTasksBySupersededId.get(task.supersedesTaskId) ?? []),
      task,
    ]);
  }
  const sourceTaskId = input.proposal.sourceTaskId;
  if (
    sourceTaskId !== null &&
    (input.proposal.trigger === "assumption_invalidated" ||
      input.proposal.trigger === "task_blocked_architecturally")
  ) {
    const modification = input.changeSet.modifiedTasks.find(
      (candidate) => candidate.taskId === sourceTaskId,
    );
    const replacementTasks = replacementTasksBySupersededId.get(sourceTaskId) ?? [];
    const hasFreshInPlaceIntent =
      modification?.objective !== undefined &&
      modification.acceptanceCriteria !== undefined &&
      modification.acceptanceCriteria.length > 0;
    if (!hasFreshInPlaceIntent && replacementTasks.length !== 1)
      blockers.push(
        `Affected source Task '${sourceTaskId}' requires one explicit refreshed execution specification: update its objective and acceptance criteria, or supersede it with exactly one replacement Task.`,
      );
  }
  for (const taskId of input.changeSet.supersededTaskIds)
    if (!currentTaskIds.has(taskId))
      blockers.push(`Superseded Task '${taskId}' is not in the Mission.`);
  const allTaskIds = unique([...input.mission.taskIds, ...newTaskIds]);
  let dependencies = [...input.mission.dependencies];
  for (const change of input.changeSet.dependencyChanges) {
    const dependent = input.tasks.find((task) => task.id === change.dependentTaskId);
    if (
      change.operation === "add" &&
      input.changeSet.supersededTaskIds.includes(change.dependentTaskId)
    )
      blockers.push(
        `Dependency '${change.prerequisiteTaskId}' cannot target superseded Task '${change.dependentTaskId}'; retarget it to the current replacement Task.`,
      );
    if (
      change.operation === "add" &&
      input.changeSet.newTasks.some(
        (task) => task.taskId === change.prerequisiteTaskId && task.supersedesTaskId === null,
      ) &&
      currentTaskIds.has(change.dependentTaskId) &&
      input.proposal.affectedTaskIds.includes(change.dependentTaskId)
    ) {
      const modification = input.changeSet.modifiedTasks.find(
        (candidate) => candidate.taskId === change.dependentTaskId,
      );
      if (
        modification?.objective === undefined ||
        modification.acceptanceCriteria === undefined ||
        modification.acceptanceCriteria.length === 0
      )
        blockers.push(
          `Affected Task '${change.dependentTaskId}' receives a new prerequisite but has no refreshed objective and acceptance criteria. Modify its execution specification or target a replacement Task.`,
        );
    }
    if (
      change.operation === "add" &&
      dependent &&
      (dependent.status === "completed" || dependent.status === "cancelled") &&
      !input.changeSet.supersededTaskIds.includes(dependent.id)
    )
      blockers.push(
        `Terminal dependent Task '${dependent.title}' must be superseded before adding a prerequisite.`,
      );
    const matches = (edge: Mission["dependencies"][number]) =>
      edge.prerequisiteTaskId === change.prerequisiteTaskId &&
      edge.dependentTaskId === change.dependentTaskId;
    if (change.operation === "remove") dependencies = dependencies.filter((edge) => !matches(edge));
    else if (!dependencies.some(matches))
      dependencies.push({
        missionId: input.mission.id,
        prerequisiteTaskId: change.prerequisiteTaskId,
        dependentTaskId: change.dependentTaskId,
        createdAt: input.validatedAt,
      });
  }
  const graph = validateMissionGraph(allTaskIds, dependencies);
  if (!graph.valid) blockers.push(graph.error ?? "Proposed Mission graph is invalid.");
  for (const contract of input.changeSet.contractChanges) {
    if (!allTaskIds.includes(contract.producerTaskId))
      blockers.push(`Contract '${contract.contractId}' references a missing producer Task.`);
    if (contract.consumerTaskIds.some((taskId) => !allTaskIds.includes(taskId)))
      blockers.push(`Contract '${contract.contractId}' references a missing consumer Task.`);
  }
  const resultingOwnership = [
    ...input.tasks
      .filter(
        (task) =>
          currentTaskIds.has(task.id) && !input.changeSet.supersededTaskIds.includes(task.id),
      )
      .map((task) => ({
        taskId: task.id,
        patterns:
          input.changeSet.modifiedTasks
            .find((modification) => modification.taskId === task.id)
            ?.ownership?.filter((rule) => rule.access === "write")
            .map((rule) => rule.pattern) ??
          task.ownership?.rules
            .filter((rule) => rule.access === "write")
            .map((rule) => rule.pattern) ??
          [],
      })),
    ...input.changeSet.newTasks.map((task) => ({
      taskId: task.taskId,
      patterns: task.ownership
        .filter((rule) => rule.access === "write")
        .map((rule) => rule.pattern),
    })),
  ];
  const patternPrefix = (pattern: string) => pattern.split(/[?*[{]/, 1)[0] ?? pattern;
  for (let leftIndex = 0; leftIndex < resultingOwnership.length; leftIndex += 1) {
    const left = resultingOwnership[leftIndex]!;
    for (const right of resultingOwnership.slice(leftIndex + 1))
      if (
        left.patterns.some((leftPattern) =>
          right.patterns.some(
            (rightPattern) =>
              patternPrefix(leftPattern).startsWith(patternPrefix(rightPattern)) ||
              patternPrefix(rightPattern).startsWith(patternPrefix(leftPattern)),
          ),
        )
      )
        warnings.push(
          `Potential overlapping write ownership: '${left.taskId}' and '${right.taskId}'.`,
        );
  }
  if (
    input.changeSet.newTasks.length === 0 &&
    input.changeSet.modifiedTasks.length === 0 &&
    input.changeSet.supersededTaskIds.length === 0 &&
    input.changeSet.dependencyChanges.length === 0 &&
    input.changeSet.contractChanges.length === 0
  )
    blockers.push("A proposed replan must contain at least one bounded change.");
  if (input.proposal.evidence?.length === 0)
    blockers.push("A proposed replan requires grounded evidence.");
  if (input.proposal.scope === "full_mission")
    warnings.push("Mission-level replans replace most of the approved decomposition.");
  return {
    status: blockers.length === 0 ? "valid" : "invalid",
    blockers: unique(blockers),
    warnings: unique(warnings),
    validatedAt: input.validatedAt,
  };
}

export interface AppliedReplanState {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly run: MissionRun;
  readonly integrationBatch: IntegrationBatch | null;
  readonly interruptedThreadIds: ReadonlyArray<ThreadId>;
}

export function applyReplanChangeSet(input: {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly run: MissionRun;
  readonly proposal: ReplanProposal;
  readonly integrationBatch?: IntegrationBatch | null;
  readonly appliedAt: string;
}): AppliedReplanState {
  const changeSet = input.proposal.changeSet;
  if (!changeSet || input.proposal.validation?.status !== "valid")
    throw new Error("Only a validated proposed replan can be applied.");
  if (input.proposal.status !== "approved") throw new Error("Replan approval is required.");
  const currentVersion =
    input.mission.currentPlanVersion ?? input.mission.planVersions?.at(-1)?.version ?? 1;
  const nextVersion = currentVersion + 1;
  const superseded = new Set(changeSet.supersededTaskIds);
  const supersedingByOld = new Map(
    changeSet.newTasks.flatMap((task) =>
      task.supersedesTaskId ? ([[task.supersedesTaskId, task.taskId]] as const) : [],
    ),
  );
  const modifications = new Map(changeSet.modifiedTasks.map((task) => [task.taskId, task]));
  const affected = new Set(
    input.proposal.impact?.affectedTaskIds ?? input.proposal.affectedTaskIds,
  );
  const contractConsumers = new Set(
    changeSet.contractChanges.flatMap((contract) => contract.consumerTaskIds),
  );
  const missionTaskSet = new Set(input.mission.taskIds);
  const interruptedThreadIds = input.tasks.flatMap((task) =>
    missionTaskSet.has(task.id) &&
    affected.has(task.id) &&
    task.status === "active" &&
    task.threadId
      ? [task.threadId]
      : [],
  );
  const currentTasks = input.tasks.map((task): OrchestrationTask => {
    if (!missionTaskSet.has(task.id)) return task;
    const modification = modifications.get(task.id);
    if (superseded.has(task.id))
      return {
        ...invalidateTaskEvidence(task),
        status: "cancelled",
        cancelledAt: input.appliedAt,
        updatedAt: input.appliedAt,
        replan: {
          planVersion: nextVersion,
          state: "superseded",
          replanProposalId: input.proposal.id,
          supersededByTaskId: supersedingByOld.get(task.id) ?? null,
          updatedAt: input.appliedAt,
        },
      };
    if (modification)
      return {
        ...invalidateTaskEvidence(task),
        ...(modification.objective ? { objective: modification.objective } : {}),
        ...(modification.modelSelection !== undefined
          ? {
              modelSelection: modification.modelSelection
                ? materializeModelSelection(modification.modelSelection)
                : null,
            }
          : {}),
        ...(modification.acceptanceCriteria
          ? { acceptanceCriteria: modification.acceptanceCriteria }
          : {}),
        ...(modification.requiredResourceIds
          ? { requiredResourceIds: modification.requiredResourceIds }
          : {}),
        ...(modification.ownership
          ? {
              ownership: {
                required: true,
                rules: modification.ownership.map((rule, index) => ({
                  id: `replan:${input.proposal.id}:${task.id}:${index}`,
                  pattern: normalizeOwnershipPattern(rule.pattern),
                  access: rule.access,
                  reason: rule.reason,
                  createdAt: input.appliedAt,
                })),
                status: "pending" as const,
                validatedAt: null,
                changedPathCount: 0,
                violations: [],
                errorReason: null,
                updatedAt: input.appliedAt,
              },
            }
          : {}),
        updatedAt: input.appliedAt,
        replan: {
          planVersion: nextVersion,
          state: "current",
          replanProposalId: input.proposal.id,
          supersededByTaskId: null,
          updatedAt: input.appliedAt,
        },
      };
    if (affected.has(task.id) && task.status === "active")
      return {
        ...invalidateTaskEvidence(task),
        status: "draft",
        threadId: null,
        activatedAt: null,
        updatedAt: input.appliedAt,
        replan: {
          planVersion: nextVersion,
          state: "current",
          replanProposalId: input.proposal.id,
          supersededByTaskId: null,
          updatedAt: input.appliedAt,
        },
      };
    if ((affected.has(task.id) || contractConsumers.has(task.id)) && task.status === "completed")
      return {
        ...invalidateTaskEvidence(task),
        updatedAt: input.appliedAt,
        replan: {
          planVersion: nextVersion,
          state: "requires_review",
          replanProposalId: input.proposal.id,
          supersededByTaskId: null,
          updatedAt: input.appliedAt,
        },
      };
    if (affected.has(task.id) || contractConsumers.has(task.id))
      return {
        ...task,
        updatedAt: input.appliedAt,
        replan: {
          planVersion: nextVersion,
          state: "current",
          replanProposalId: input.proposal.id,
          supersededByTaskId: null,
          updatedAt: input.appliedAt,
        },
      };
    return task;
  });
  const newTasks: OrchestrationTask[] = changeSet.newTasks.map((task) => ({
    id: task.taskId,
    projectId: input.mission.projectId,
    title: task.title,
    objective: task.objective,
    role: "builder",
    modelSelection: task.modelSelection ? materializeModelSelection(task.modelSelection) : null,
    acceptanceCriteria: task.acceptanceCriteria,
    reviewRequired: true,
    preferDifferentReviewerProvider: true,
    status: "draft",
    threadId: null,
    createdAt: input.appliedAt,
    updatedAt: input.appliedAt,
    activatedAt: null,
    completedAt: null,
    cancelledAt: null,
    workspace: null,
    ownership: {
      required: true,
      rules: task.ownership.map((rule, index) => ({
        id: `replan:${input.proposal.id}:${task.taskId}:${index}`,
        pattern: normalizeOwnershipPattern(rule.pattern),
        access: rule.access,
        reason: rule.reason,
        createdAt: input.appliedAt,
      })),
      status: "pending",
      validatedAt: null,
      changedPathCount: 0,
      violations: [],
      errorReason: null,
      updatedAt: input.appliedAt,
    },
    reviewSnapshot: null,
    handoff: null,
    restore: null,
    reviewError: null,
    result: null,
    qualityGateRuns: [],
    reviews: [],
    requiredResourceIds: task.requiredResourceIds,
    resourceCompliance: null,
    ownershipRequests: [],
    replan: {
      planVersion: nextVersion,
      state: "current",
      replanProposalId: input.proposal.id,
      supersededByTaskId: null,
      updatedAt: input.appliedAt,
    },
  }));
  let dependencies = [...input.mission.dependencies];
  for (const change of changeSet.dependencyChanges) {
    const matches = (edge: Mission["dependencies"][number]) =>
      edge.prerequisiteTaskId === change.prerequisiteTaskId &&
      edge.dependentTaskId === change.dependentTaskId;
    if (change.operation === "remove") dependencies = dependencies.filter((edge) => !matches(edge));
    else if (!dependencies.some(matches))
      dependencies.push({
        missionId: input.mission.id,
        prerequisiteTaskId: change.prerequisiteTaskId,
        dependentTaskId: change.dependentTaskId,
        createdAt: input.appliedAt,
      });
  }
  const taskIds = unique([...input.mission.taskIds, ...newTasks.map((task) => task.id)]);
  const taskSpecification = (task: OrchestrationTask) => ({
    taskId: task.id,
    title: task.title,
    objective: task.objective,
    acceptanceCriteria: [...(task.acceptanceCriteria ?? [])],
  });
  const initialVersion: MissionPlanVersion = {
    version: currentVersion,
    source: "initial",
    taskIds: [...input.mission.taskIds],
    dependencies: [...input.mission.dependencies],
    replanProposalId: null,
    trigger: null,
    preservedTaskIds: [...input.mission.taskIds],
    supersededTaskIds: [],
    addedTaskIds: [],
    taskSpecifications: input.tasks
      .filter((task) => input.mission.taskIds.includes(task.id))
      .map(taskSpecification),
    createdAt: input.mission.activatedAt ?? input.mission.createdAt,
  };
  const previousVersions = input.mission.planVersions?.length
    ? [...input.mission.planVersions]
    : [initialVersion];
  const nextPlanVersion: MissionPlanVersion = {
    version: nextVersion,
    source: "replan",
    taskIds,
    dependencies,
    replanProposalId: input.proposal.id,
    trigger: input.proposal.trigger ?? null,
    preservedTaskIds: input.proposal.impact?.unaffectedTaskIds ?? [],
    supersededTaskIds: [...changeSet.supersededTaskIds],
    addedTaskIds: newTasks.map((task) => task.id),
    taskSpecifications: [...currentTasks, ...newTasks]
      .filter((task) => taskIds.includes(task.id))
      .map(taskSpecification),
    createdAt: input.appliedAt,
  };
  let contractVersions = [...(input.mission.contractVersions ?? [])];
  for (const change of changeSet.contractChanges) {
    if (
      change.previousVersion !== null &&
      !contractVersions.some(
        (contract) =>
          contract.contractId === change.contractId && contract.version === change.previousVersion,
      )
    ) {
      contractVersions.push({
        contractId: change.contractId,
        version: change.previousVersion,
        producerTaskId: change.producerTaskId,
        consumerTaskIds: [...change.consumerTaskIds],
        status: "invalidated",
        replanProposalId: input.proposal.id,
        createdAt: input.mission.activatedAt ?? input.mission.createdAt,
        invalidatedAt: input.appliedAt,
      });
    }
    contractVersions = contractVersions.map(
      (contract): MissionContractVersion =>
        contract.contractId === change.contractId && contract.status === "current"
          ? { ...contract, status: "invalidated", invalidatedAt: input.appliedAt }
          : contract,
    );
    contractVersions.push({
      contractId: change.contractId,
      version: change.nextVersion,
      producerTaskId: change.producerTaskId,
      consumerTaskIds: [...change.consumerTaskIds],
      status: "current",
      replanProposalId: input.proposal.id,
      createdAt: input.appliedAt,
      invalidatedAt: null,
    });
  }
  const mission: Mission = {
    ...input.mission,
    taskIds,
    dependencies,
    currentPlanVersion: nextVersion,
    planVersions: [...previousVersions, nextPlanVersion],
    contractVersions,
    updatedAt: input.appliedAt,
    activities: [
      ...input.mission.activities,
      {
        id: `replan:${input.proposal.id}:applied` as Mission["activities"][number]["id"],
        type: "mission.replan-applied",
        summary: `Plan v${nextVersion} applied: ${input.proposal.summary}`,
        taskId: input.proposal.sourceTaskId,
        occurredAt: input.appliedAt,
      },
    ],
  };
  const replanProposals = (input.run.replanProposals ?? []).map((proposal) =>
    proposal.id === input.proposal.id
      ? { ...proposal, status: "applied" as const, appliedAt: input.appliedAt }
      : proposal,
  );
  const run: MissionRun = {
    ...input.run,
    status: "running",
    attention: input.run.attention.filter(
      (item) =>
        !["replan_request", "replan_requested", "replan_approval_required"].includes(item.code),
    ),
    attentionReason: null,
    coordinationRequests: (input.run.coordinationRequests ?? []).map((request) =>
      `replan:${request.id}` === input.proposal.id
        ? {
            ...request,
            status: "approved" as const,
            answer: `Approved and applied as Plan v${nextVersion}.`,
            resolvedAt: input.appliedAt,
          }
        : request,
    ),
    replanProposals,
    decisions: [
      ...input.run.decisions,
      {
        id: `replan:${input.proposal.id}:applied` as MissionRun["decisions"][number]["id"],
        kind: "replan",
        taskId: input.proposal.sourceTaskId,
        reason: `Applied approved Plan v${nextVersion}.`,
        sourceTaskIds: input.proposal.affectedTaskIds,
        occurredAt: input.appliedAt,
      },
    ],
    updatedAt: input.appliedAt,
  };
  const integrationBatch = input.integrationBatch
    ? (() => {
        const appliedSuperseded = input.integrationBatch.tasks
          .filter((task) => superseded.has(task.taskId) && task.status === "applied")
          .map((task) => task.taskId);
        const hasApplied = appliedSuperseded.length > 0;
        return {
          ...input.integrationBatch,
          status: hasApplied ? ("correction_required" as const) : input.integrationBatch.status,
          tasks: input.integrationBatch.tasks.map((task) =>
            superseded.has(task.taskId)
              ? {
                  ...task,
                  status:
                    task.status === "applied"
                      ? ("correction_required" as const)
                      : ("invalidated" as const),
                }
              : task,
          ),
          failureCode: hasApplied
            ? "replan_superseded_applied_artifact"
            : input.integrationBatch.failureCode,
          failureReason: hasApplied
            ? "Integration contains an applied artifact from a superseded Task; an explicit revert or remediation Task is required."
            : input.integrationBatch.failureReason,
          supersededAppliedTaskIds: unique([
            ...(input.integrationBatch.supersededAppliedTaskIds ?? []),
            ...appliedSuperseded,
          ]),
          updatedAt: input.appliedAt,
        };
      })()
    : null;
  return {
    mission,
    tasks: [...currentTasks, ...newTasks],
    run,
    integrationBatch,
    interruptedThreadIds,
  };
}
