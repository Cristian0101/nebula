import type {
  Mission,
  MissionRun,
  MissionRunAttention,
  OrchestrationProject,
  OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";

import { computeExecutionWaves } from "./missionGraph.ts";

export interface MissionRunSchedulingDecision {
  readonly kind: "scheduled" | "waiting_dependency" | "waiting_resource" | "waiting_concurrency";
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

function configurationAttention(input: {
  readonly task: OrchestrationTask;
  readonly project: Pick<OrchestrationProject, "sharedResources">;
  readonly providerReadyTaskIds: ReadonlySet<TaskId>;
  readonly autoRoutableTaskIds?: ReadonlySet<TaskId>;
}): MissionRunAttention[] {
  const { task, project, providerReadyTaskIds } = input;
  const attention: MissionRunAttention[] = [];
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
  readonly project: Pick<OrchestrationProject, "sharedResources" | "resourceLeases">;
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
