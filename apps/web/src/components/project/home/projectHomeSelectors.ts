import type {
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationThreadShell,
  ScopedProjectRef,
  TaskId,
  ThreadId,
  MissionId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import {
  effectiveSettled,
  effectiveSnoozed,
  snoozeWakeLabel,
} from "@t3tools/client-runtime/state/thread-settled";
import { resolveMissionCheckpointState } from "@t3tools/shared/missionRunner";
import { deriveProviderReadiness } from "@t3tools/shared/providerReadiness";
import type { ProviderInstanceEntry } from "../../../providerInstances";
import { deriveTaskAttention } from "../../commandDeck/commandDeckLogic";

export type HomeDestination =
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "task"; taskId: TaskId }
  | { kind: "mission"; missionId: MissionId; stage: "war-room" | "review" }
  | { kind: "plan"; proposalId: string }
  | { kind: "integration" }
  | { kind: "provider"; instanceId: ProviderInstanceId };
export interface HomeScope {
  readonly ref: ScopedProjectRef;
  readonly environmentId: EnvironmentId;
  readonly snapshot: OrchestrationShellSnapshot | null;
}
export function selectProjectHomeScope(input: HomeScope) {
  const snapshot = input.environmentId === input.ref.environmentId ? input.snapshot : null;
  const project = snapshot?.projects.find((item) => item.id === input.ref.projectId) ?? null;
  return {
    project,
    threads: project ? snapshot!.threads.filter((item) => item.projectId === project.id) : [],
    tasks: project ? (snapshot!.tasks ?? []).filter((item) => item.projectId === project.id) : [],
    missions: project
      ? (snapshot!.missions ?? []).filter((item) => item.projectId === project.id)
      : [],
    runs: project
      ? (snapshot!.missionRuns ?? []).filter((item) => item.projectId === project.id)
      : [],
  };
}
export type AttentionKind =
  | "approval"
  | "input"
  | "plan"
  | "checkpoint"
  | "architect"
  | "coordination"
  | "mission"
  | "session"
  | "interrupted"
  | "task"
  | "review"
  | "integration"
  | "provider";
export interface ProjectAttention {
  readonly id: string;
  readonly kind: AttentionKind;
  readonly decisionClass: 1 | 2 | 3 | 4;
  readonly label: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly destination: HomeDestination;
}

/** Only canonical flags/statuses produce attention. Labels never drive classification. */
export function deriveProjectAttention(
  input: HomeScope & {
    readonly providers: readonly ProviderInstanceEntry[];
    readonly connected: boolean;
    readonly now: number;
  },
): readonly ProjectAttention[] {
  const { project, threads, tasks, missions, runs } = selectProjectHomeScope(input);
  if (!project) return [];
  const items: ProjectAttention[] = [];
  const add = (
    kind: AttentionKind,
    decisionClass: ProjectAttention["decisionClass"],
    cause: string,
    label: string,
    title: string,
    updatedAt: string,
    destination: HomeDestination,
  ) => {
    if (!items.some((item) => item.id === cause))
      items.push({ id: cause, kind, decisionClass, label, title, updatedAt, destination });
  };
  const visibleThreads = threads.filter((thread) => thread.archivedAt === null);
  for (const thread of visibleThreads) {
    const destination: HomeDestination = { kind: "thread", threadId: thread.id };
    if (thread.hasPendingApprovals)
      add(
        "approval",
        1,
        `approval:${thread.id}`,
        "Approval needed",
        thread.title,
        thread.updatedAt,
        destination,
      );
    if (thread.hasPendingUserInput)
      add(
        "input",
        1,
        `input:${thread.id}`,
        "Waiting for your answer",
        thread.title,
        thread.updatedAt,
        destination,
      );
    if (thread.hasActionableProposedPlan)
      add(
        "plan",
        1,
        `plan:${thread.id}`,
        "Plan ready to review",
        thread.title,
        thread.updatedAt,
        destination,
      );
    if (thread.session?.status === "error" || thread.latestTurn?.state === "error")
      add(
        "session",
        2,
        `execution:${thread.id}`,
        "Agent stopped with an error",
        thread.title,
        thread.session?.updatedAt ?? thread.updatedAt,
        destination,
      );
    else if (thread.session?.status === "interrupted" || thread.latestTurn?.state === "interrupted")
      add(
        "interrupted",
        2,
        `execution:${thread.id}`,
        "Interrupted",
        thread.title,
        thread.updatedAt,
        destination,
      );
  }
  const activeTasks = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  );
  for (const task of activeTasks) {
    const thread = visibleThreads.find((item) => item.id === task.threadId) ?? null;
    const destination: HomeDestination = { kind: "task", taskId: task.id };
    // Provider availability is separately derived with freshness. The legacy Task
    // helper treats stale registry state as blocked, so exclude that category here.
    const reasons = deriveTaskAttention({
      task,
      thread,
      providerEntry: null,
      modelSelection: thread?.modelSelection ?? task.modelSelection ?? null,
    });
    for (const reason of reasons) {
      if (reason.kind === "provider" || reason.kind === "execution") continue;
      const review = task.reviews?.findLast((item) => item.snapshotId === task.reviewSnapshot?.id);
      const verdict =
        reason.kind === "review" &&
        (review?.verdict === "request_changes" || review?.verdict === "reject") &&
        reason.label === "Changes requested";
      add(
        verdict ? "review" : "task",
        reason.kind === "review" ? 3 : 2,
        `task:${task.id}:${reason.kind}:${reason.label}`,
        verdict
          ? review.verdict === "reject"
            ? "Review rejected"
            : "Changes requested"
          : reason.label,
        task.title,
        task.updatedAt,
        destination,
      );
    }
  }
  for (const proposal of project.architectPlans ?? []) {
    if (proposal.status === "ready")
      add(
        "architect",
        1,
        `architect:${proposal.id}`,
        "Mission plan ready for approval",
        proposal.objective,
        proposal.updatedAt,
        { kind: "plan", proposalId: proposal.id },
      );
  }
  for (const mission of missions) {
    if (mission.status === "completed" || mission.status === "cancelled") continue;
    const run = runs
      .filter((item) => item.missionId === mission.id)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const destination: HomeDestination = {
      kind: "mission",
      missionId: mission.id,
      stage: "war-room",
    };
    const waitingCheckpoint =
      run &&
      ["running", "paused", "attention"].includes(run.status) &&
      run.decisions.at(-1)?.kind === "waiting_checkpoint";
    if (waitingCheckpoint) {
      for (const checkpoint of mission.checkpoints ?? [])
        if (
          checkpoint.humanApprovalRequired &&
          !checkpoint.humanApprovedAt &&
          resolveMissionCheckpointState(checkpoint, tasks).state === "awaiting_human"
        )
          add(
            "checkpoint",
            1,
            `checkpoint:${mission.id}:${checkpoint.key}`,
            "Checkpoint needs approval",
            `${mission.title} · ${checkpoint.name}`,
            checkpoint.updatedAt,
            destination,
          );
    }
    const coordination =
      run?.coordinationRequests?.filter((item) => item.status === "pending") ?? [];
    const replans =
      run?.replanProposals?.filter((item) => item.status === "awaiting_approval") ?? [];
    const escalations =
      run?.taskRecovery?.filter((item) => item.providerEscalation?.status === "recommended") ?? [];
    if (coordination.length || replans.length || escalations.length)
      add(
        "coordination",
        1,
        `coordination:${mission.id}`,
        "Mission decision needed",
        mission.title,
        run!.updatedAt,
        destination,
      );
    if (run?.status === "attention") {
      for (const attention of run.attention) {
        // A typed task association is one shared cause. Keep the Task's more
        // specific destination rather than duplicating it in the Mission row.
        const taskThreadId = activeTasks.find((task) => task.id === attention.taskId)?.threadId;
        const relatedTask = activeTasks.find((task) => task.id === attention.taskId);
        const existing =
          (attention.code === "workspace_unavailable" &&
            relatedTask &&
            (relatedTask.workspace?.status === "missing" ||
              relatedTask.workspace?.status === "failed")) ||
          (attention.code === "provider_interrupted" &&
            items.some(
              (item) =>
                item.kind === "interrupted" &&
                item.destination.kind === "thread" &&
                item.destination.threadId === taskThreadId,
            )) ||
          (attention.code === "provider_substitution_recommended" &&
            escalations.some((item) => item.taskId === attention.taskId));
        if (!existing)
          add(
            "mission",
            2,
            `mission:${run.id}:${attention.taskId ?? "mission"}:${attention.code}`,
            attention.detail,
            mission.title,
            run.updatedAt,
            destination,
          );
      }
      if (
        !run.attention.length &&
        !waitingCheckpoint &&
        !coordination.length &&
        !replans.length &&
        !escalations.length
      )
        add(
          "mission",
          2,
          `mission:${run.id}`,
          run.attentionReason ?? "Mission run needs attention",
          mission.title,
          run.updatedAt,
          destination,
        );
    }
  }
  for (const batch of project.integrationBatches ?? []) {
    if (batch.status !== "conflict" && batch.status !== "correction_required") continue;
    const mission = missions.find((item) => item.integrationBatchId === batch.id);
    add(
      "integration",
      3,
      `integration:${batch.id}`,
      batch.status === "conflict" ? "Integration conflict" : "Integration correction required",
      batch.title,
      batch.updatedAt,
      mission
        ? { kind: "mission", missionId: mission.id, stage: "review" }
        : { kind: "integration" },
    );
  }
  const usedProviders = new Set([
    ...visibleThreads
      .filter(
        (thread) =>
          !effectiveSettled(thread, {
            now: new Date(input.now).toISOString(),
            autoSettleAfterDays: null,
          }),
      )
      .map((thread) => thread.modelSelection.instanceId),
    ...activeTasks.flatMap((task) => (task.modelSelection ? [task.modelSelection.instanceId] : [])),
  ]);
  for (const provider of input.providers) {
    if (!provider.enabled || !usedProviders.has(provider.instanceId)) continue;
    const readiness = deriveProviderReadiness({
      environmentId: input.ref.environmentId,
      instanceId: provider.instanceId,
      connected: input.connected,
      now: input.now,
      snapshot: { environmentId: input.environmentId, provider: provider.snapshot },
    });
    if (readiness.runtime === "blocked" && readiness.fresh)
      add(
        "provider",
        4,
        `provider:${provider.instanceId}`,
        `${provider.displayName} · ${readiness.headline}`,
        project.title,
        readiness.verifiedAt ?? project.updatedAt,
        { kind: "provider", instanceId: provider.instanceId },
      );
  }
  return items.toSorted(
    (a, b) =>
      a.decisionClass - b.decisionClass ||
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.id.localeCompare(b.id),
  );
}

export const RESUME_FILTERS = ["All", "Threads", "Tasks", "Missions"] as const;
export type ResumeFilter = (typeof RESUME_FILTERS)[number];
export interface ProjectResumeItem {
  readonly id: string;
  readonly title: string;
  readonly kind: "Thread" | "Task" | "Mission";
  readonly status: string;
  readonly detail: string;
  readonly updatedAt: string;
  readonly destination: HomeDestination;
}
export function deriveProjectResume(
  input: HomeScope & {
    readonly filter: ResumeFilter;
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
  },
): readonly ProjectResumeItem[] {
  const { threads, tasks, missions, runs } = selectProjectHomeScope(input);
  const items: ProjectResumeItem[] = [];
  const taskThreads = new Set(tasks.flatMap((task) => (task.threadId ? [task.threadId] : [])));
  if (input.filter === "All" || input.filter === "Threads")
    for (const thread of threads) {
      if (thread.archivedAt || effectiveSettled(thread, input)) continue;
      const snoozed = effectiveSnoozed(thread, input);
      if (snoozed && input.filter !== "Threads") continue;
      items.push({
        id: thread.id,
        title: thread.title,
        kind: "Thread",
        status: snoozed
          ? `Snoozed · wakes in ${snoozeWakeLabel(thread.snoozedUntil!, input)}`
          : (deriveAgentPresence(thread) ??
            (thread.hasPendingApprovals
              ? "Approval needed"
              : thread.hasPendingUserInput
                ? "Waiting for you"
                : thread.session?.status === "error"
                  ? "Stopped with an error"
                  : thread.session?.status === "interrupted"
                    ? "Interrupted"
                    : (thread.latestTurn?.state ?? "No session"))),
        detail: [
          thread.branch,
          thread.worktreePath,
          `Provider ${thread.modelSelection.instanceId}`,
          taskThreads.has(thread.id) ? "Task thread" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        updatedAt: thread.latestUserMessageAt ?? thread.updatedAt,
        destination: { kind: "thread", threadId: thread.id },
      });
    }
  if (input.filter === "All" || input.filter === "Tasks")
    for (const task of tasks) {
      // All uses the associated Thread once. Tasks explicitly shows its Task.
      if (input.filter === "All" && items.some((item) => item.id === task.threadId)) continue;
      if (task.status === "cancelled" || task.status === "completed") continue;
      items.push({
        id: task.id,
        title: task.title,
        kind: "Task",
        status: task.status,
        detail: [
          task.workspace?.status,
          task.workspace?.branch,
          task.workspace?.path,
          task.modelSelection?.instanceId,
        ]
          .filter(Boolean)
          .join(" · "),
        updatedAt: task.updatedAt,
        destination: { kind: "task", taskId: task.id },
      });
    }
  if (input.filter === "All" || input.filter === "Missions")
    for (const mission of missions) {
      if (mission.status === "cancelled" || mission.status === "completed") continue;
      const run = runs
        .filter((item) => item.missionId === mission.id)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      items.push({
        id: mission.id,
        title: mission.title,
        kind: "Mission",
        status: run?.status ?? mission.status,
        detail: `${mission.taskIds.length} Tasks`,
        updatedAt: run?.updatedAt ?? mission.updatedAt,
        destination: { kind: "mission", missionId: mission.id, stage: "war-room" },
      });
    }
  return items.toSorted(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export function deriveAgentPresence(thread: OrchestrationThreadShell): string | null {
  const live =
    ["starting", "running", "ready"].includes(thread.session?.status ?? "") ||
    thread.backgroundLiveness === "working" ||
    thread.backgroundLiveness === "monitoring" ||
    thread.latestTurn?.state === "running";
  if (!live) return null;
  if (thread.hasPendingApprovals) return "Approval needed";
  if (thread.hasPendingUserInput) return "Waiting for you";
  if (thread.session?.status === "error" || thread.session?.status === "interrupted")
    return "Unknown · conflicting session state";
  if (
    thread.latestTurn?.state === "running" ||
    thread.session?.status === "running" ||
    thread.backgroundLiveness === "working"
  )
    return "Working";
  if (thread.session?.status === "starting") return "Starting";
  if (thread.backgroundLiveness === "monitoring") return "Monitoring";
  return "Idle · session open";
}
