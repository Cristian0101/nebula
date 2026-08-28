import type {
  IntegrationBatch,
  Mission,
  MissionActivity,
  MissionRun,
  OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";
import type { MissionPlan, MissionTaskPlan } from "@t3tools/shared/missionGraph";

export type MissionAttentionCategory =
  | "provider"
  | "ownership"
  | "quality"
  | "review"
  | "resource"
  | "integration"
  | "policy"
  | "task";

export interface MissionAttentionItem {
  readonly id: string;
  readonly category: MissionAttentionCategory;
  readonly taskId: TaskId | null;
  readonly title: string;
  readonly detail: string;
  readonly action:
    | "open_task"
    | "open_provider_recovery"
    | "open_review"
    | "open_integration"
    | "inspect_mission";
  readonly blocksMission: boolean;
}

export type MissionTimelineCategory =
  | "all"
  | "tasks"
  | "providers"
  | "ownership"
  | "reviews"
  | "resources"
  | "integration"
  | "errors";

const categoryForAttention = (code: string, detail: string): MissionAttentionCategory => {
  const text = `${code} ${detail}`.toLowerCase();
  if (/provider|session|auth/.test(text)) return "provider";
  if (/ownership|path/.test(text)) return "ownership";
  if (/quality|test|lint|typecheck|build|gate/.test(text)) return "quality";
  if (/review|changes requested|stale/.test(text)) return "review";
  if (/resource|lease|deadlock/.test(text)) return "resource";
  if (/integration|conflict|validation/.test(text)) return "integration";
  if (/policy|approval|checkpoint/.test(text)) return "policy";
  return "task";
};

const actionForCategory = (
  category: MissionAttentionCategory,
  taskId: TaskId | null,
): MissionAttentionItem["action"] => {
  if (category === "integration") return "open_integration";
  if (category === "review" && taskId) return "open_review";
  if (category === "provider" && taskId) return "open_provider_recovery";
  if (taskId) return "open_task";
  return "inspect_mission";
};

const taskTitle = (taskById: ReadonlyMap<TaskId, OrchestrationTask>, taskId: TaskId | null) =>
  taskId ? (taskById.get(taskId)?.title ?? taskId) : "Mission";

export function missionAttentionItems(input: {
  readonly plan: MissionPlan;
  readonly run: MissionRun | null;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
}): ReadonlyArray<MissionAttentionItem> {
  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const items = new Map<string, MissionAttentionItem>();
  const add = (candidate: Omit<MissionAttentionItem, "id"> & { readonly code: string }) => {
    const id = `${candidate.taskId ?? "mission"}:${candidate.code}:${candidate.detail}`;
    if (items.has(id)) return;
    const { code: _code, ...item } = candidate;
    items.set(id, { id, ...item });
  };

  for (const attention of input.run?.attention ?? []) {
    const category = categoryForAttention(attention.code, attention.detail);
    add({
      code: attention.code,
      category,
      taskId: attention.taskId,
      title: taskTitle(taskById, attention.taskId),
      detail: attention.detail,
      action: actionForCategory(category, attention.taskId),
      blocksMission: attention.blocksMission,
    });
  }

  for (const item of input.plan.tasks) {
    for (const detail of item.blockerReasons) {
      add({
        code: "dependency",
        category: "task",
        taskId: item.task.id,
        title: item.task.title,
        detail,
        action: "open_task",
        blocksMission: true,
      });
    }
    for (const { resource, lease } of item.resourceBlockers) {
      add({
        code: `resource:${resource.id}`,
        category: "resource",
        taskId: item.task.id,
        title: item.task.title,
        detail: `Waiting for resource ${resource.name}. Held by ${taskTitle(taskById, lease.taskId)}.`,
        action: "open_task",
        blocksMission: true,
      });
    }
    for (const detail of item.attention) {
      const category = categoryForAttention("task", detail);
      add({
        code: `task:${category}`,
        category,
        taskId: item.task.id,
        title: item.task.title,
        detail,
        action: actionForCategory(category, item.task.id),
        blocksMission: true,
      });
    }
    for (const request of item.task.ownershipRequests ?? []) {
      if (request.status !== "pending") continue;
      add({
        code: `ownership:${request.id}`,
        category: "ownership",
        taskId: item.task.id,
        title: item.task.title,
        detail: `${request.reason} Requested: ${request.requestedRules.map((rule) => rule.pattern).join(", ")}.`,
        action: "open_task",
        blocksMission: true,
      });
    }
    const latestReview = item.task.reviews?.at(-1);
    if (
      latestReview?.status === "completed" &&
      (latestReview.verdict === "request_changes" || latestReview.verdict === "reject")
    ) {
      add({
        code: `review:${latestReview.id}`,
        category: "review",
        taskId: item.task.id,
        title: item.task.title,
        detail: latestReview.summary || "Review changes requested.",
        action: "open_review",
        blocksMission: true,
      });
    } else if (item.task.reviewSnapshot?.status === "stale") {
      add({
        code: `review-stale:${item.task.reviewSnapshot.id}`,
        category: "review",
        taskId: item.task.id,
        title: item.task.title,
        detail: "Review approval is stale because the Task diff changed.",
        action: "open_review",
        blocksMission: true,
      });
    }
  }

  const integration = input.plan.integration;
  if (integration?.status === "conflict" || integration?.status === "failed") {
    add({
      code: `integration:${integration.status}`,
      category: "integration",
      taskId: integration.conflict?.taskId ?? null,
      title: "Integration",
      detail: integration.conflict?.files.length
        ? `Conflict in ${integration.conflict.files.join(", ")}.`
        : (integration.failureReason ?? `Integration ${integration.status}.`),
      action: "open_integration",
      blocksMission: true,
    });
  }

  return [...items.values()].toSorted(
    (left, right) =>
      Number(right.blocksMission) - Number(left.blocksMission) ||
      left.category.localeCompare(right.category) ||
      left.title.localeCompare(right.title),
  );
}

const currentReviewApproved = (task: OrchestrationTask) =>
  task.reviewSnapshot?.status === "current" &&
  (task.reviews ?? []).some(
    (review) =>
      review.status === "completed" &&
      review.snapshotId === task.reviewSnapshot?.id &&
      (review.verdict === "approve" || review.verdict === "approve_with_notes"),
  );

export function missionProgressSummary(input: {
  readonly mission: Mission;
  readonly plan: MissionPlan;
  readonly run: MissionRun | null;
}) {
  const completed = input.plan.tasks.filter((item) => item.task.status === "completed").length;
  const active = input.plan.tasks.filter((item) =>
    ["running", "active"].includes(item.status),
  ).length;
  const waitingDependency = input.plan.tasks.filter((item) => item.status === "blocked").length;
  const waitingResource = input.plan.tasks.filter(
    (item) => item.status === "resource-blocked",
  ).length;
  const reviewPending = input.plan.tasks.filter(
    (item) => item.task.reviewRequired === true && !currentReviewApproved(item.task),
  ).length;
  const integration = input.plan.integration;
  const requiredGates = integration?.qualityGateRuns.filter((run) => run.required) ?? [];
  const passedGates = requiredGates.filter((run) => run.status === "passed").length;
  return {
    completed,
    total: input.mission.taskIds.length,
    active,
    waitingDependency,
    waitingResource,
    reviewPending,
    requiredGates: requiredGates.length,
    passedGates,
    steps: [
      input.mission.architectPlanProposalId ? "Planning complete" : "Manual plan",
      `${completed} / ${input.mission.taskIds.length} Tasks complete`,
      active > 0 ? `${active} active` : null,
      waitingDependency > 0 ? `${waitingDependency} waiting on dependency` : null,
      waitingResource > 0 ? `${waitingResource} waiting on resource` : null,
      reviewPending > 0 ? `${reviewPending} current review pending` : null,
      integration
        ? `Integration ${integration.status.replaceAll("_", " ")}`
        : "Integration not started",
      requiredGates.length > 0
        ? `${passedGates} / ${requiredGates.length} final gates passed`
        : null,
      input.run?.status === "paused" ? "Scheduling paused" : null,
    ].filter((step): step is string => step !== null),
  };
}

export function missionTaskStateLabel(
  item: MissionTaskPlan,
  run: MissionRun | null,
  integration: IntegrationBatch | null = null,
): string {
  const waiting = run?.decisions.findLast((decision) => decision.taskId === item.task.id);
  const recovery = run?.taskRecovery?.find((state) => state.taskId === item.task.id);
  const latestAttempt = recovery?.attempts.at(-1);
  if (item.task.status === "cancelled") return "Cancelled";
  if (item.task.workspace?.status === "failed" || item.task.workspace?.status === "missing")
    return "Failed";
  if (latestAttempt?.status === "failed" && recovery?.attentionRequired) return "Interrupted";
  if (integration?.tasks.some((task) => task.taskId === item.task.id && task.status === "applied"))
    return "Integrated";
  if (item.task.status === "completed")
    return currentReviewApproved(item.task) ? "Approved" : "Completed";
  if (item.task.reviewSnapshot?.status === "stale") return "Changes requested";
  const review = item.task.reviews?.at(-1);
  if (review?.verdict === "request_changes" || review?.verdict === "reject")
    return "Changes requested";
  if (item.status === "review") return "Awaiting review";
  if (item.status === "resource-blocked" || waiting?.kind === "waiting_resource")
    return "Waiting resource";
  if (item.status === "blocked" || waiting?.kind === "waiting_dependency")
    return "Waiting dependency";
  if (item.status === "needs-attention") return "Blocked";
  if (item.status === "running") return "Running";
  if (item.status === "active") return "Starting";
  if (item.status === "ready") return "Ready";
  return "Planned";
}

export function missionRecoverySummary(input: {
  readonly plan: MissionPlan;
  readonly run: MissionRun | null;
}) {
  if (!input.run) return null;
  const failedAttempts = (input.run.taskRecovery ?? []).flatMap((state) =>
    state.attempts.filter(
      (attempt) => attempt.status === "failed" || attempt.status === "replaced",
    ),
  ).length;
  const preservedWorktrees = input.plan.tasks.filter(
    (item) => item.task.workspace?.path && item.task.workspace.status !== "removed",
  ).length;
  return {
    preservedTasks: input.plan.tasks.length,
    preservedWorktrees,
    interruptedAttempts: failedAttempts,
    readyTasks: input.plan.readyTaskIds.length,
    waitingResources: input.plan.tasks.filter((item) => item.status === "resource-blocked").length,
    integrationState: input.plan.integration?.status ?? "not_started",
  };
}

export function missionTimelineCategory(activity: MissionActivity): MissionTimelineCategory {
  const text = `${activity.type} ${activity.summary}`.toLowerCase();
  if (/failed|error|conflict|denied|cancelled/.test(text)) return "errors";
  if (/integration/.test(text)) return "integration";
  if (/resource|lease/.test(text)) return "resources";
  if (/review/.test(text)) return "reviews";
  if (/ownership/.test(text)) return "ownership";
  if (/provider|session|thread/.test(text)) return "providers";
  return "tasks";
}

export function filterMissionTimeline(
  activities: ReadonlyArray<MissionActivity>,
  category: MissionTimelineCategory,
  query: string,
): ReadonlyArray<MissionActivity> {
  const normalized = query.trim().toLowerCase();
  return activities.filter(
    (activity) =>
      (category === "all" || missionTimelineCategory(activity) === category) &&
      (normalized.length === 0 ||
        `${activity.type} ${activity.summary} ${activity.taskId ?? ""}`
          .toLowerCase()
          .includes(normalized)),
  );
}
