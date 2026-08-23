import type {
  ModelSelection,
  OrchestrationTask,
  OrchestrationThreadShell,
  ProviderInstanceId,
  ProjectId,
} from "@t3tools/contracts";

import type { ProviderInstanceEntry } from "../../providerInstances";

export type CommandDeckAttentionKind =
  | "ownership"
  | "workspace"
  | "provider"
  | "review"
  | "execution";

export interface CommandDeckAttention {
  readonly kind: CommandDeckAttentionKind;
  readonly label: string;
}

export interface CommandDeckActivityItem {
  readonly id: string;
  readonly taskId: OrchestrationTask["id"];
  readonly occurredAt: string;
  readonly label: string;
  readonly tone: "neutral" | "info" | "success" | "warning" | "error";
}

export interface CommandDeckSummary {
  readonly total: number;
  readonly active: number;
  readonly attention: number;
  readonly reviewReady: number;
  readonly changedFiles: number;
}

export function selectProjectTasks(
  tasks: ReadonlyArray<OrchestrationTask>,
  projectId: ProjectId,
): ReadonlyArray<OrchestrationTask> {
  return tasks
    .filter((task) => task.projectId === projectId)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function resolveTaskModelSelection(
  task: OrchestrationTask,
  thread: OrchestrationThreadShell | null,
  projectDefault: ModelSelection | null,
): ModelSelection | null {
  return thread?.modelSelection ?? task.modelSelection ?? projectDefault;
}

export function resolveTaskProviderEntry(
  selection: ModelSelection | null,
  entries: ReadonlyArray<ProviderInstanceEntry>,
): ProviderInstanceEntry | null {
  if (!selection) return null;
  return entries.find((entry) => entry.instanceId === selection.instanceId) ?? null;
}

export function deriveTaskAttention(input: {
  readonly task: OrchestrationTask;
  readonly thread: OrchestrationThreadShell | null;
  readonly providerEntry: ProviderInstanceEntry | null;
  readonly modelSelection: ModelSelection | null;
}): ReadonlyArray<CommandDeckAttention> {
  const attention: CommandDeckAttention[] = [];
  const { task, thread, providerEntry, modelSelection } = input;
  if (task.ownership?.status === "violation") {
    attention.push({ kind: "ownership", label: "Ownership violation" });
  } else if (task.ownership?.status === "error") {
    attention.push({ kind: "ownership", label: "Ownership check failed" });
  }
  if (task.workspace?.status === "missing") {
    attention.push({ kind: "workspace", label: "Workspace missing" });
  } else if (task.workspace?.status === "failed") {
    attention.push({ kind: "workspace", label: "Workspace unavailable" });
  }
  if (modelSelection === null) {
    attention.push({ kind: "provider", label: "Provider not assigned" });
  } else if (
    providerEntry === null ||
    !providerEntry.enabled ||
    !providerEntry.isAvailable ||
    providerEntry.status !== "ready"
  ) {
    attention.push({ kind: "provider", label: "Provider unavailable" });
  }
  if (task.reviewSnapshot?.status === "stale" || task.handoff?.status === "stale") {
    attention.push({ kind: "review", label: "Review is stale" });
  }
  if (thread?.session?.status === "error" || thread?.latestTurn?.state === "error") {
    attention.push({ kind: "execution", label: "Provider error" });
  }
  return attention;
}

export function deriveTaskPresentationStatus(input: {
  readonly task: OrchestrationTask;
  readonly thread: OrchestrationThreadShell | null;
  readonly attention: ReadonlyArray<CommandDeckAttention>;
}): { readonly label: string; readonly tone: "neutral" | "info" | "success" | "warning" } {
  const { task, thread, attention } = input;
  if (attention.length > 0 && task.status !== "completed" && task.status !== "cancelled") {
    return { label: "Needs attention", tone: "warning" };
  }
  if (
    task.status === "active" &&
    (thread?.latestTurn?.state === "running" ||
      thread?.session?.status === "running" ||
      thread?.session?.status === "starting")
  ) {
    return { label: "Running", tone: "info" };
  }
  if (task.handoff?.status === "ready" && task.reviewSnapshot?.status === "current") {
    return { label: "Ready for review", tone: "warning" };
  }
  if (task.status === "active") return { label: "Active", tone: "info" };
  if (task.status === "completed") return { label: "Completed", tone: "success" };
  if (task.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  return { label: "Draft", tone: "neutral" };
}

export function deriveCurrentAction(thread: OrchestrationThreadShell | null): string {
  if (!thread) return "Not started";
  if (thread.planProgress?.step) return thread.planProgress.step;
  if (thread.latestTurn?.state === "running") return "Working";
  if (thread.session?.status === "starting") return "Starting provider";
  if (thread.latestTurn?.state === "completed") return "Turn completed";
  if (thread.latestTurn?.state === "interrupted") return "Turn stopped";
  if (thread.latestTurn?.state === "error" || thread.session?.status === "error") {
    return "Provider error";
  }
  return thread.session?.status === "ready" ? "Ready" : "Waiting";
}

function pushActivity(
  items: CommandDeckActivityItem[],
  task: OrchestrationTask,
  key: string,
  occurredAt: string | null | undefined,
  label: string,
  tone: CommandDeckActivityItem["tone"],
) {
  if (!occurredAt) return;
  items.push({ id: `${task.id}:${key}:${occurredAt}`, taskId: task.id, occurredAt, label, tone });
}

export function buildCommandDeckActivity(
  tasks: ReadonlyArray<OrchestrationTask>,
  limit = 40,
): ReadonlyArray<CommandDeckActivityItem> {
  const items: CommandDeckActivityItem[] = [];
  for (const task of tasks) {
    pushActivity(items, task, "created", task.createdAt, `${task.title} created`, "neutral");
    if (task.workspace) {
      const workspaceLabel =
        task.workspace.status === "ready"
          ? `${task.title} workspace ready`
          : task.workspace.status === "preparing"
            ? `${task.title} workspace preparing`
            : task.workspace.status === "removed"
              ? `${task.title} workspace removed`
              : `${task.title} workspace ${task.workspace.status}`;
      pushActivity(
        items,
        task,
        `workspace-${task.workspace.status}`,
        task.workspace.updatedAt,
        workspaceLabel,
        task.workspace.status === "failed" || task.workspace.status === "missing"
          ? "error"
          : "info",
      );
    }
    pushActivity(items, task, "activated", task.activatedAt, `${task.title} started`, "info");
    if (task.ownership?.validatedAt) {
      pushActivity(
        items,
        task,
        `ownership-${task.ownership.status}`,
        task.ownership.validatedAt,
        task.ownership.status === "valid"
          ? `${task.title} ownership valid`
          : `${task.title} ownership ${task.ownership.status}`,
        task.ownership.status === "valid" ? "success" : "error",
      );
    }
    pushActivity(
      items,
      task,
      "review",
      task.reviewSnapshot?.capturedAt,
      `${task.title} review ${task.reviewSnapshot?.status ?? "prepared"}`,
      task.reviewSnapshot?.status === "stale" ? "warning" : "success",
    );
    if (task.handoff?.status === "ready") {
      pushActivity(
        items,
        task,
        "handoff-ready",
        task.handoff.updatedAt,
        `${task.title} handoff ready`,
        "success",
      );
    }
    if (task.restore) {
      pushActivity(
        items,
        task,
        `restore-${task.restore.status}`,
        task.restore.updatedAt,
        `${task.title} restore ${task.restore.status}`,
        task.restore.status === "failed" ? "error" : "warning",
      );
    }
    pushActivity(items, task, "completed", task.completedAt, `${task.title} completed`, "success");
    pushActivity(items, task, "cancelled", task.cancelledAt, `${task.title} cancelled`, "neutral");
  }
  return items
    .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);
}

export function summarizeCommandDeck(
  tasks: ReadonlyArray<OrchestrationTask>,
  attentionByTaskId: ReadonlyMap<OrchestrationTask["id"], ReadonlyArray<CommandDeckAttention>>,
): CommandDeckSummary {
  let active = 0;
  let attention = 0;
  let reviewReady = 0;
  let changedFiles = 0;
  for (const task of tasks) {
    if (task.status === "active") active += 1;
    if ((attentionByTaskId.get(task.id)?.length ?? 0) > 0) attention += 1;
    if (task.handoff?.status === "ready" && task.reviewSnapshot?.status === "current") {
      reviewReady += 1;
    }
    changedFiles += taskChangedFileCount(task);
  }
  return { total: tasks.length, active, attention, reviewReady, changedFiles };
}

export function taskChangedFileCount(task: OrchestrationTask): number {
  return task.reviewSnapshot?.status === "current"
    ? task.reviewSnapshot.changedFiles
    : (task.ownership?.changedPathCount ?? 0);
}

export function providerTaskCounts(
  selections: ReadonlyArray<ModelSelection | null>,
): ReadonlyMap<ProviderInstanceId, number> {
  const counts = new Map<ProviderInstanceId, number>();
  for (const selection of selections) {
    if (!selection) continue;
    counts.set(selection.instanceId, (counts.get(selection.instanceId) ?? 0) + 1);
  }
  return counts;
}
