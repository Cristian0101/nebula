import type {
  IntegrationBatch,
  Mission,
  MissionTaskDependency,
  OrchestrationTask,
  OrchestrationThread,
  OrchestrationThreadShell,
  OrchestrationProject,
  TaskId,
} from "@t3tools/contracts";
import { resourceBlockers } from "./resourceCoordination.ts";

export interface MissionGraphValidation {
  readonly valid: boolean;
  readonly error: string | null;
  readonly cycleTaskIds: ReadonlyArray<TaskId>;
}

export type MissionTaskPlanStatus =
  | "blocked"
  | "ready"
  | "resource-blocked"
  | "running"
  | "active"
  | "needs-attention"
  | "review"
  | "completed"
  | "cancelled";

export interface MissionTaskPlan {
  readonly task: OrchestrationTask;
  readonly wave: number;
  readonly status: MissionTaskPlanStatus;
  readonly blockerTaskIds: ReadonlyArray<TaskId>;
  readonly blockerReasons: ReadonlyArray<string>;
  readonly attention: ReadonlyArray<string>;
  readonly legacyCompletion: boolean;
  readonly resourceBlockers: ReturnType<typeof resourceBlockers>;
}

export interface MissionExecutionWave {
  readonly number: number;
  readonly taskIds: ReadonlyArray<TaskId>;
}

export interface MissionPlan {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<MissionTaskPlan>;
  readonly waves: ReadonlyArray<MissionExecutionWave>;
  readonly readyTaskIds: ReadonlyArray<TaskId>;
  readonly completionEligible: boolean;
  readonly integration: IntegrationBatch | null;
  readonly attention: ReadonlyArray<string>;
  readonly graph: MissionGraphValidation;
}

function orderedTaskIds(taskIds: ReadonlyArray<TaskId>) {
  const position = new Map(taskIds.map((taskId, index) => [taskId, index] as const));
  return (left: TaskId, right: TaskId) =>
    (position.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right);
}

export function validateMissionGraph(
  taskIds: ReadonlyArray<TaskId>,
  dependencies: ReadonlyArray<MissionTaskDependency>,
): MissionGraphValidation {
  const taskSet = new Set(taskIds);
  const edgeSet = new Set<string>();
  const outgoing = new Map<TaskId, TaskId[]>(taskIds.map((taskId) => [taskId, []]));
  for (const dependency of dependencies) {
    if (!taskSet.has(dependency.prerequisiteTaskId) || !taskSet.has(dependency.dependentTaskId)) {
      return {
        valid: false,
        error: "Every dependency must reference Tasks in this Mission.",
        cycleTaskIds: [],
      };
    }
    if (dependency.prerequisiteTaskId === dependency.dependentTaskId) {
      return {
        valid: false,
        error: `Task '${dependency.prerequisiteTaskId}' cannot depend on itself.`,
        cycleTaskIds: [dependency.prerequisiteTaskId],
      };
    }
    const edgeKey = `${dependency.prerequisiteTaskId}\u0000${dependency.dependentTaskId}`;
    if (edgeSet.has(edgeKey)) {
      return {
        valid: false,
        error: `Dependency '${dependency.prerequisiteTaskId}' → '${dependency.dependentTaskId}' already exists.`,
        cycleTaskIds: [],
      };
    }
    edgeSet.add(edgeKey);
    outgoing.get(dependency.prerequisiteTaskId)?.push(dependency.dependentTaskId);
  }

  const visiting = new Set<TaskId>();
  const visited = new Set<TaskId>();
  const stack: TaskId[] = [];
  const order = orderedTaskIds(taskIds);
  const visit = (taskId: TaskId): ReadonlyArray<TaskId> | null => {
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      return [...stack.slice(cycleStart), taskId];
    }
    if (visited.has(taskId)) return null;
    visiting.add(taskId);
    stack.push(taskId);
    for (const nextId of [...(outgoing.get(taskId) ?? [])].sort(order)) {
      const cycle = visit(nextId);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
    return null;
  };
  for (const taskId of [...taskIds].sort(order)) {
    const cycle = visit(taskId);
    if (cycle) {
      return {
        valid: false,
        error: `Cannot add dependency. This would create a cycle: ${cycle.join(" → ")}.`,
        cycleTaskIds: cycle,
      };
    }
  }
  return { valid: true, error: null, cycleTaskIds: [] };
}

export function computeExecutionWaves(
  taskIds: ReadonlyArray<TaskId>,
  dependencies: ReadonlyArray<MissionTaskDependency>,
): ReadonlyArray<MissionExecutionWave> {
  const validation = validateMissionGraph(taskIds, dependencies);
  if (!validation.valid) return [];
  const order = orderedTaskIds(taskIds);
  const indegree = new Map<TaskId, number>(taskIds.map((taskId) => [taskId, 0]));
  const outgoing = new Map<TaskId, TaskId[]>(taskIds.map((taskId) => [taskId, []]));
  for (const dependency of dependencies) {
    indegree.set(dependency.dependentTaskId, (indegree.get(dependency.dependentTaskId) ?? 0) + 1);
    outgoing.get(dependency.prerequisiteTaskId)?.push(dependency.dependentTaskId);
  }
  let remaining = new Set(taskIds);
  const waves: MissionExecutionWave[] = [];
  while (remaining.size > 0) {
    const taskIdsInWave = [...remaining]
      .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
      .sort(order);
    if (taskIdsInWave.length === 0) return [];
    waves.push({ number: waves.length + 1, taskIds: taskIdsInWave });
    for (const taskId of taskIdsInWave) {
      remaining.delete(taskId);
      for (const dependentId of outgoing.get(taskId) ?? []) {
        indegree.set(dependentId, (indegree.get(dependentId) ?? 0) - 1);
      }
    }
  }
  return waves;
}

export function missionTopologicalTaskIds(mission: Mission): ReadonlyArray<TaskId> {
  return computeExecutionWaves(mission.taskIds, mission.dependencies).flatMap(
    (wave) => wave.taskIds,
  );
}

function startConfigurationAttention(task: OrchestrationTask): ReadonlyArray<string> {
  const attention: string[] = [];
  if (task.replan?.state === "stale" || task.replan?.state === "requires_review")
    attention.push("Task context is stale after an applied Replan.");
  if (task.role !== "builder") attention.push(`Role '${task.role}' has no managed start flow.`);
  if (!task.modelSelection) attention.push("Provider not assigned.");
  if (
    task.ownership?.required === true &&
    !task.ownership.rules.some((rule) => rule.access === "write")
  ) {
    attention.push("Write ownership is not configured.");
  }
  if (task.workspace?.status === "failed") attention.push("Workspace preparation failed.");
  if (task.workspace?.status === "missing") attention.push("Workspace is missing.");
  if (task.ownership?.status === "violation") attention.push("Ownership violation.");
  if (task.ownership?.status === "error") attention.push("Ownership validation failed.");
  const latestReview = task.reviews?.at(-1);
  if (
    latestReview?.status === "completed" &&
    (latestReview.verdict === "request_changes" || latestReview.verdict === "reject")
  ) {
    attention.push("Review requested changes.");
  }
  return attention;
}

function threadForTask(
  task: OrchestrationTask,
  threads: ReadonlyArray<OrchestrationThread | OrchestrationThreadShell>,
) {
  return task.threadId ? threads.find((thread) => thread.id === task.threadId) : undefined;
}

export function computeMissionPlan(input: {
  readonly mission: Mission;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly threads?: ReadonlyArray<OrchestrationThread | OrchestrationThreadShell>;
  readonly integrationBatches?: ReadonlyArray<IntegrationBatch>;
  readonly unavailableProviderTaskIds?: ReadonlySet<TaskId>;
  readonly project?: Pick<OrchestrationProject, "sharedResources" | "resourceLeases">;
}): MissionPlan {
  const graph = validateMissionGraph(input.mission.taskIds, input.mission.dependencies);
  const waves = graph.valid
    ? computeExecutionWaves(input.mission.taskIds, input.mission.dependencies)
    : [];
  const waveByTaskId = new Map(
    waves.flatMap((wave) => wave.taskIds.map((taskId) => [taskId, wave.number] as const)),
  );
  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const prerequisites = new Map<TaskId, TaskId[]>();
  for (const edge of input.mission.dependencies) {
    prerequisites.set(edge.dependentTaskId, [
      ...(prerequisites.get(edge.dependentTaskId) ?? []),
      edge.prerequisiteTaskId,
    ]);
  }
  const plans: MissionTaskPlan[] = [];
  const missionAttention: string[] = [];
  for (const taskId of input.mission.taskIds) {
    const task = taskById.get(taskId);
    if (!task) {
      missionAttention.push(`Task '${taskId}' is missing.`);
      continue;
    }
    const prerequisiteIds = prerequisites.get(taskId) ?? [];
    const blockerIds = prerequisiteIds.filter((id) => taskById.get(id)?.status !== "completed");
    const blockerReasons = blockerIds.map((id) => {
      const prerequisite = taskById.get(id);
      return prerequisite?.status === "cancelled"
        ? `Prerequisite cancelled: ${prerequisite.title}`
        : `Waiting for ${prerequisite?.title ?? id}`;
    });
    const attention = [...startConfigurationAttention(task)];
    const sharedResourceBlockers = input.project
      ? resourceBlockers({
          task,
          resources: input.project.sharedResources ?? [],
          leases: input.project.resourceLeases ?? [],
        })
      : [];
    const thread = threadForTask(task, input.threads ?? []);
    if (input.unavailableProviderTaskIds?.has(task.id)) attention.push("Provider unavailable.");
    if (thread?.session?.status === "error" || thread?.latestTurn?.state === "error") {
      attention.push("Provider execution failed.");
    }
    const legacyCompletion = task.status === "completed" && !task.result;
    if (legacyCompletion) attention.push("Legacy completion has no retained TaskResult.");
    for (const reason of blockerReasons.filter((reason) =>
      reason.startsWith("Prerequisite cancelled"),
    )) {
      missionAttention.push(`${task.title}: ${reason}`);
    }
    for (const reason of attention) missionAttention.push(`${task.title}: ${reason}`);

    let status: MissionTaskPlanStatus;
    if (task.status === "completed") status = "completed";
    else if (task.status === "cancelled") status = "cancelled";
    else if (task.status === "draft" && blockerIds.length > 0) status = "blocked";
    else if (task.status === "draft" && sharedResourceBlockers.length > 0)
      status = "resource-blocked";
    else if (task.status === "draft" && attention.length > 0) status = "needs-attention";
    else if (task.status === "draft") status = "ready";
    else if (attention.length > 0) status = "needs-attention";
    else if (task.reviewSnapshot?.status === "current" && task.handoff?.status === "ready") {
      status = "review";
    } else if (
      thread?.latestTurn?.state === "running" ||
      thread?.session?.status === "running" ||
      thread?.session?.status === "starting"
    ) {
      status = "running";
    } else status = "active";
    plans.push({
      task,
      wave: waveByTaskId.get(taskId) ?? 0,
      status,
      blockerTaskIds: blockerIds,
      blockerReasons,
      attention,
      legacyCompletion,
      resourceBlockers: sharedResourceBlockers,
    });
  }
  const integration = input.mission.integrationBatchId
    ? ((input.integrationBatches ?? []).find(
        (batch) => batch.id === input.mission.integrationBatchId,
      ) ?? null)
    : null;
  if (input.mission.integrationBatchId && integration === null) {
    missionAttention.push("Linked Integration Batch is missing.");
  }
  if (integration?.status === "conflict") missionAttention.push("Integration conflict.");
  if (integration?.status === "failed") missionAttention.push("Integration quality failed.");
  const terminalTasksComplete = plans
    .filter((plan) => plan.task.status !== "cancelled")
    .every((plan) => plan.task.status === "completed");
  return {
    mission: input.mission,
    tasks: plans,
    waves,
    readyTaskIds: plans.filter((plan) => plan.status === "ready").map((plan) => plan.task.id),
    completionEligible:
      input.mission.taskIds.length > 0 &&
      terminalTasksComplete &&
      (input.mission.integrationBatchId === null || integration?.status === "ready"),
    integration,
    attention: missionAttention,
    graph,
  };
}
