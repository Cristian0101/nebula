import { MissionId, TaskId } from "@t3tools/contracts";
import type {
  ArchitectMissionDraft,
  ArchitectPlanningPhase,
  ArchitectPlanProposal,
  Mission,
  MissionRun,
  OrchestrationTask,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { computeExecutionWaves } from "@t3tools/shared/missionGraph";

export const SWARM_PLANNING_STEPS = [
  { phase: "validating_repository", label: "Repository context" },
  { phase: "preparing_context", label: "Planning context" },
  { phase: "starting_planner", label: "Planner start" },
  { phase: "planner_working", label: "Workstreams and team" },
  { phase: "decoding_plan", label: "Ownership and dependencies" },
  { phase: "validating_plan", label: "Checkpoints and validation" },
] as const satisfies ReadonlyArray<{ phase: ArchitectPlanningPhase; label: string }>;

export const PLANNER_PENDING_TASK_LABEL = "Tasks pending";
export const SWARM_STAGE_AFTER_RUN = "war-room" as const;

export const planningPhaseCopy: Record<ArchitectPlanningPhase, string> = {
  idle: "Ready to plan",
  validating_repository: "Checking repository baseline",
  preparing_context: "Preparing bounded planning context",
  starting_planner: "Starting Planner",
  planner_working: "Planner is mapping workstreams",
  decoding_plan: "Decoding the structured Team Plan",
  validating_plan: "Validating Tasks, ownership, and dependencies",
  ready: "Team Plan ready",
  failed: "Planner could not finish this plan",
  cancelled: "Planning cancelled",
  stale: "Repository changed after planning",
};

export function planningStepIndex(phase: ArchitectPlanningPhase | undefined): number {
  if (phase === "ready") return SWARM_PLANNING_STEPS.length;
  const index = SWARM_PLANNING_STEPS.findIndex((step) => step.phase === phase);
  return Math.max(0, index);
}

export function isPlanningActive(plan: ArchitectPlanProposal | null): boolean {
  return plan?.status === "generating";
}

export function architectProposalWaves(
  proposal: ArchitectMissionDraft,
): ReadonlyArray<ReadonlyArray<ArchitectMissionDraft["tasks"][number]>> {
  const idByKey = new Map(
    proposal.tasks.map((task, index) => [task.key, TaskId.make(`plan-${index}-${task.key}`)]),
  );
  const taskById = new Map(proposal.tasks.map((task) => [idByKey.get(task.key)!, task] as const));
  const edges = proposal.dependencies.flatMap((edge) => {
    const prerequisiteTaskId = idByKey.get(edge.prerequisiteKey);
    const dependentTaskId = idByKey.get(edge.dependentKey);
    return prerequisiteTaskId && dependentTaskId
      ? [
          {
            missionId: MissionId.make("architect-plan-preview"),
            prerequisiteTaskId,
            dependentTaskId,
            createdAt: "1970-01-01T00:00:00.000Z" as never,
          },
        ]
      : [];
  });
  return computeExecutionWaves([...taskById.keys()], edges).map((wave) =>
    wave.taskIds.flatMap((taskId) => {
      const task = taskById.get(taskId);
      return task ? [task] : [];
    }),
  );
}

export function deterministicArchitectMissionId(plan: ArchitectPlanProposal) {
  return MissionId.make(`architect:${plan.id}`);
}

export function deterministicArchitectTaskId(plan: ArchitectPlanProposal, key: string) {
  return TaskId.make(`architect:${plan.id}:${key}`);
}

export function projectTaskForPlanTask(input: {
  readonly mission: Mission | null;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly proposal: ArchitectMissionDraft;
  readonly taskKey: string;
}): OrchestrationTask | null {
  if (!input.mission) return null;
  const index = input.proposal.tasks.findIndex((task) => task.key === input.taskKey);
  const taskId = index >= 0 ? input.mission.taskIds[index] : undefined;
  return taskId ? (input.tasks.find((task) => task.id === taskId) ?? null) : null;
}

export function threadForTask(
  task: OrchestrationTask | null,
  threads: ReadonlyArray<OrchestrationThreadShell>,
): OrchestrationThreadShell | null {
  return task?.threadId ? (threads.find((thread) => thread.id === task.threadId) ?? null) : null;
}

export function swarmRunProgress(input: {
  readonly mission: Mission | null;
  readonly run: MissionRun | null;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
}) {
  const missionTasks = input.mission
    ? input.mission.taskIds.flatMap((taskId) => {
        const task = input.tasks.find((candidate) => candidate.id === taskId);
        return task ? [task] : [];
      })
    : [];
  return {
    total: missionTasks.length,
    completed: missionTasks.filter((task) => task.status === "completed").length,
    active: missionTasks.filter((task) => task.status === "active").length,
    blocked: input.run?.attention.filter((item) => item.blocksMission).length ?? 0,
    reviewReady: missionTasks.filter(
      (task) => task.reviewSnapshot?.status === "current" && task.handoff?.status === "ready",
    ).length,
  };
}

export function highValueSwarmEvents(input: {
  readonly mission: Mission | null;
  readonly run: MissionRun | null;
}): ReadonlyArray<{ id: string; label: string; detail: string; occurredAt: string }> {
  const activities = (input.mission?.activities ?? []).map((activity) => ({
    id: activity.id,
    label: activity.summary,
    detail: activity.type,
    occurredAt: activity.occurredAt,
  }));
  const decisions = (input.run?.decisions ?? [])
    .filter((decision) =>
      [
        "scheduled",
        "waiting_dependency",
        "waiting_checkpoint",
        "waiting_resource",
        "attention",
        "completed",
        "retry",
        "remediation",
      ].includes(decision.kind),
    )
    .map((decision) => ({
      id: decision.id,
      label: decision.kind.replaceAll("_", " "),
      detail: decision.reason,
      occurredAt: decision.occurredAt,
    }));
  return [...activities, ...decisions]
    .toSorted((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .slice(-30);
}
