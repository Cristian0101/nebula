import {
  CommandId,
  CoordinationRequestId,
  EventId,
  IntegrationBatchId,
  MessageId,
  ModelSelection,
  OwnershipRequestId,
  ReplanProposalId,
  TaskReviewId,
  ThreadId,
  type MissionRun,
  type MissionRunAttention,
  type MissionRunDecision,
  type RoutingDecision,
  type TaskRecoveryState,
  type OrchestrationEvent,
  type OrchestrationProject,
  type OrchestrationReadModel,
  type OrchestrationTask,
  type OrchestrationThread,
  type TaskId,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import {
  buildTaskContextPackage,
  buildMissionFinalReport,
  deterministicMissionTaskIds,
  missionIntegrationOverlapPaths,
  planMissionRunScheduling,
  type MissionRunSchedulingDecision,
} from "@t3tools/shared/missionRunner";
import {
  classifyRuntimeFailure,
  parseCoordinationRequest,
  recommendWithFallback,
  recoveryAction,
  smallestReplanScope,
  type RoutingCandidate,
} from "@t3tools/shared/recoveryRouting";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ProviderInstanceRegistry } from "../../provider/Services/ProviderInstanceRegistry.ts";
import { forkParked } from "../../serverActivation.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { MissionRunReactor, type MissionRunReactorShape } from "../Services/MissionRunReactor.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const RELEVANT_EVENTS = new Set<OrchestrationEvent["type"]>([
  "mission.run.started",
  "mission.run.resumed",
  "mission.run.paused",
  "mission.run.reconciled",
  "mission.updated",
  "mission.task-added",
  "mission.task-removed",
  "mission.tasks-reordered",
  "mission.dependency-added",
  "mission.dependency-removed",
  "task.workspace.ready",
  "task.workspace.failed",
  "task.workspace.missing",
  "task.thread-bound",
  "task.activated",
  "task.completed",
  "task.cancelled",
  "task.ownership-validated",
  "task.ownership-validation-failed",
  "task.resource-validated",
  "task.review.prepared",
  "task.review.prepare-failed",
  "task.review.stale",
  "task.handoff.updated",
  "task.quality.run-requested",
  "task.quality.run-finished",
  "task.independent-review.requested",
  "task.independent-review.started",
  "task.independent-review.completed",
  "task.independent-review.failed",
  "thread.turn-diff-completed",
  "thread.session-set",
  "resource.leases-acquired",
  "resource.leases-released",
  "integration.created",
  "integration.updated",
]);

const decisionHash = (value: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
};

const decisionId = (run: MissionRun, decision: MissionRunSchedulingDecision | MissionRunDecision) =>
  EventId.make(
    `mission-run:${run.id}:decision:${decision.kind}:${decision.taskId ?? "mission"}:${decisionHash(decision.reason)}:${decision.sourceTaskIds.join("-")}`,
  );

const taskThreadId = (run: MissionRun, task: OrchestrationTask) =>
  ThreadId.make(`mission-run:${run.id}:task:${task.id}`);

const commandId = (run: MissionRun, taskId: string | null, phase: string) =>
  CommandId.make(`server:mission-run:${run.id}:${taskId ?? "mission"}:${phase}`);

const ownershipContext = (task: OrchestrationTask) => {
  const groups = {
    write: task.ownership?.rules.filter((rule) => rule.access === "write") ?? [],
    read: task.ownership?.rules.filter((rule) => rule.access === "read") ?? [],
    deny: task.ownership?.rules.filter((rule) => rule.access === "deny") ?? [],
  };
  const section = (title: string, rules: ReadonlyArray<{ readonly pattern: string }>) =>
    `${title}\n${rules.length === 0 ? "- None" : rules.map((rule) => `- ${rule.pattern}`).join("\n")}`;
  return [
    section("Write scope", groups.write),
    section("Read-only", groups.read),
    section("Denied", groups.deny),
    "If implementation requires a modification outside Write scope, stop and explain which path requires explicit human approval.",
  ].join("\n\n");
};

const resourceContext = (project: OrchestrationProject, task: OrchestrationTask) => {
  const resourceById = new Map(
    (project.sharedResources ?? []).map((resource) => [resource.id, resource] as const),
  );
  const lines = (task.requiredResourceIds ?? []).map((resourceId) => {
    const resource = resourceById.get(resourceId);
    const held = (project.resourceLeases ?? []).find(
      (lease) =>
        lease.resourceId === resourceId && lease.taskId === task.id && lease.status === "held",
    );
    return `- ${resource?.name ?? resourceId}: ${held ? "lease held by this Task" : "lease not currently held"}`;
  });
  return `Shared resource requirements\n${lines.length === 0 ? "- None" : lines.join("\n")}`;
};

const sameAttention = (
  left: ReadonlyArray<MissionRunAttention>,
  right: ReadonlyArray<MissionRunAttention>,
) =>
  JSON.stringify(
    left.toSorted(
      (a, b) =>
        (a.taskId ?? "").localeCompare(b.taskId ?? "") ||
        a.code.localeCompare(b.code) ||
        a.detail.localeCompare(b.detail),
    ),
  ) ===
  JSON.stringify(
    right.toSorted(
      (a, b) =>
        (a.taskId ?? "").localeCompare(b.taskId ?? "") ||
        a.code.localeCompare(b.code) ||
        a.detail.localeCompare(b.detail),
    ),
  );

const requiredGateFailure = (task: OrchestrationTask) =>
  (task.qualityGateRuns ?? []).find(
    (run) =>
      run.snapshotId === task.reviewSnapshot?.id &&
      run.required &&
      run.status !== "queued" &&
      run.status !== "running" &&
      run.status !== "passed",
  ) ?? null;

const currentReview = (task: OrchestrationTask) =>
  (task.reviews ?? [])
    .filter((review) => review.snapshotId === task.reviewSnapshot?.id)
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
    .at(-1) ?? null;

export function missionProviderTurnInFlight(thread: {
  readonly session: { readonly status: string } | null;
  readonly latestTurn: { readonly state: string } | null;
}): boolean {
  return (
    thread.session?.status === "starting" ||
    thread.session?.status === "running" ||
    thread.latestTurn?.state === "running"
  );
}

export function activeReplacementOwnsProviderTurn(
  state: {
    readonly attempts: ReadonlyArray<{
      readonly kind: string;
      readonly status: string;
    }>;
  },
  thread:
    | {
        readonly session: { readonly status: string } | null;
        readonly latestTurn: { readonly state: string } | null;
      }
    | undefined,
): boolean {
  return (
    thread !== undefined &&
    state.attempts.some(
      (attempt) => attempt.kind === "replacement" && attempt.status === "active",
    ) &&
    missionProviderTurnInFlight(thread)
  );
}

export function providerSupportsStructuredReview(instance: {
  readonly textGeneration: { readonly generateStructured?: unknown };
}): boolean {
  return typeof instance.textGeneration.generateStructured === "function";
}

const activeTaskAttention = (
  task: OrchestrationTask,
  thread: OrchestrationThread | undefined,
): MissionRunAttention[] => {
  const attention: MissionRunAttention[] = [];
  const add = (code: string, detail: string, blocksMission = false) =>
    attention.push({ taskId: task.id, code, detail, blocksMission });
  if (task.workspace?.status === "failed" || task.workspace?.status === "missing")
    add("workspace_unavailable", task.workspace.failureReason ?? "Task workspace unavailable.");
  if (task.ownership?.status === "violation")
    add("ownership_violation", "Ownership validation found out-of-scope changes.");
  if (task.ownership?.status === "error")
    add("ownership_error", task.ownership.errorReason ?? "Ownership validation failed.");
  if (task.resourceCompliance?.status === "violation")
    add("resource_violation", "Shared Resource compliance failed.");
  if (task.resourceCompliance?.status === "error")
    add(
      "resource_error",
      task.resourceCompliance.errorReason ?? "Shared Resource validation failed.",
    );
  if (task.reviewError) add("review_prepare_failed", task.reviewError);
  if (
    task.handoff?.status === "draft" &&
    (task.handoff.generationError !== null || task.handoff.summary.trim().length === 0)
  )
    add(
      "handoff_needs_human",
      task.handoff.generationError ?? "The structured handoff needs human input before review.",
    );
  const gate = requiredGateFailure(task);
  if (gate) add("quality_failed", `Required gate '${gate.label}' finished '${gate.status}'.`);
  const review = currentReview(task);
  if (review?.status === "failed")
    add("review_failed", review.failureReason ?? "Independent review failed.");
  if (
    review?.status === "completed" &&
    (review.verdict === "request_changes" || review.verdict === "reject")
  )
    add("changes_requested", review.summary || "Independent review requested changes.");
  if (thread?.latestTurn?.state === "error" || thread?.session?.status === "error")
    add("provider_failed", thread.session?.lastError ?? "Builder provider execution failed.");
  if (thread?.latestTurn?.state === "interrupted")
    add("provider_interrupted", "Builder provider turn was interrupted.");
  return attention;
};

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const providers = yield* ProviderInstanceRegistry;
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

  const read = () => snapshots.getCommandReadModel();

  const providerReady = Effect.fn("MissionRunReactor.providerReady")(function* (
    task: OrchestrationTask,
  ) {
    if (!task.modelSelection) return false;
    const instance = yield* providers.getInstance(task.modelSelection.instanceId);
    if (!instance?.enabled) return false;
    const snapshot = yield* instance.snapshot.getSnapshot.pipe(Effect.orElseSucceed(() => null));
    return (
      snapshot !== null &&
      snapshot.enabled &&
      snapshot.installed &&
      snapshot.status === "ready" &&
      snapshot.availability !== "unavailable"
    );
  });

  const routingCandidates = Effect.fn("MissionRunReactor.routingCandidates")(function* (
    model: OrchestrationReadModel,
  ) {
    const instances = yield* providers.listInstances;
    const candidates: RoutingCandidate[] = [];
    for (const instance of instances) {
      const snapshot = yield* instance.snapshot.getSnapshot.pipe(Effect.orElseSucceed(() => null));
      const activeLoad = model.threads.filter(
        (thread) =>
          thread.modelSelection.instanceId === instance.instanceId &&
          (thread.latestTurn?.state === "running" || thread.session?.status === "running"),
      ).length;
      candidates.push({
        instanceId: instance.instanceId,
        driverKind: instance.driverKind,
        model: snapshot?.models[0]?.slug ?? "auto",
        ready:
          instance.enabled &&
          snapshot?.enabled === true &&
          snapshot.installed &&
          snapshot.status === "ready" &&
          snapshot.availability !== "unavailable",
        activeLoad,
      });
    }
    return candidates;
  });

  const routeTask = Effect.fn("MissionRunReactor.routeTask")(function* (input: {
    readonly run: MissionRun;
    readonly task: OrchestrationTask;
    readonly model: OrchestrationReadModel;
    readonly excluded?: ReadonlySet<RoutingCandidate["instanceId"]>;
  }) {
    const profile = input.run.recoveryPolicy?.routingProfile ?? "manual_only";
    const decidedAt = yield* now;
    let candidates = yield* routingCandidates(input.model);
    const ready = candidates.filter((candidate) => candidate.ready);
    if (
      input.task.reviewRequired === true &&
      (profile === "balanced" || profile === "provider_diversity") &&
      new Set(ready.map((candidate) => candidate.driverKind)).size > 1
    ) {
      const reserve = ready.toSorted(
        (left, right) =>
          left.activeLoad - right.activeLoad || left.instanceId.localeCompare(right.instanceId),
      )[0];
      candidates = candidates.map((candidate) => ({
        ...candidate,
        reservedForReview: candidate.instanceId === reserve?.instanceId,
      }));
    }
    const currentDriver = input.task.modelSelection
      ? candidates.find(
          (candidate) => candidate.instanceId === input.task.modelSelection!.instanceId,
        )?.driverKind
      : null;
    return recommendWithFallback({
      taskId: input.task.id,
      taskRole: input.task.role,
      profile,
      candidates,
      ...(input.excluded ? { excludedInstanceIds: input.excluded } : {}),
      ...(profile === "provider_diversity" && currentDriver
        ? { preferredDifferentDriverFrom: currentDriver }
        : {}),
      decidedAt,
    }).decision;
  });

  const reviewerSelection = Effect.fn("MissionRunReactor.reviewerSelection")(function* (
    task: OrchestrationTask,
    excludedInstanceIds: ReadonlySet<string> = new Set(),
  ) {
    const builder = task.modelSelection
      ? yield* providers.getInstance(task.modelSelection.instanceId)
      : undefined;
    const instances = yield* providers.listInstances;
    const ready: Array<{ instance: (typeof instances)[number]; model: string }> = [];
    for (const instance of instances) {
      if (
        !instance.enabled ||
        excludedInstanceIds.has(instance.instanceId) ||
        !providerSupportsStructuredReview(instance)
      )
        continue;
      const snapshot = yield* instance.snapshot.getSnapshot.pipe(Effect.orElseSucceed(() => null));
      if (
        snapshot?.enabled &&
        snapshot.installed &&
        snapshot.status === "ready" &&
        snapshot.availability !== "unavailable"
      ) {
        ready.push({ instance, model: snapshot.models[0]?.slug ?? "auto" });
      }
    }
    const selected =
      task.preferDifferentReviewerProvider === true
        ? (ready.find((candidate) => candidate.instance.driverKind !== builder?.driverKind) ??
          ready[0])
        : ready[0];
    return selected
      ? ModelSelection.make({ instanceId: selected.instance.instanceId, model: selected.model })
      : null;
  });

  const updateRun = Effect.fn("MissionRunReactor.updateRun")(function* (input: {
    readonly runId: MissionRun["id"];
    readonly status: "running" | "attention" | "completed" | "failed";
    readonly currentReadyTaskIds: ReadonlyArray<TaskId>;
    readonly scheduledTaskIds: ReadonlyArray<TaskId>;
    readonly attention: ReadonlyArray<MissionRunAttention>;
    readonly decision?: MissionRunDecision | null;
    readonly failureReason?: string | null;
    readonly taskRecovery?: ReadonlyArray<TaskRecoveryState>;
    readonly routingDecisions?: ReadonlyArray<RoutingDecision>;
    readonly coordinationRequests?: MissionRun["coordinationRequests"];
    readonly replanProposals?: MissionRun["replanProposals"];
    readonly integrationBatchId?: MissionRun["integrationBatchId"];
    readonly finalReport?: MissionRun["finalReport"];
  }) {
    const createdAt = yield* now;
    yield* engine.dispatch({
      type: "mission.run.reconcile",
      commandId: CommandId.make(`server:mission-run:reconcile:${yield* crypto.randomUUIDv4}`),
      runId: input.runId,
      status: input.status,
      currentReadyTaskIds: [...input.currentReadyTaskIds],
      scheduledTaskIds: [...input.scheduledTaskIds],
      attention: [...input.attention],
      attentionReason: input.attention[0]?.detail ?? null,
      decision: input.decision ?? null,
      completedAt: input.status === "completed" ? createdAt : null,
      failureReason: input.failureReason ?? null,
      ...(input.taskRecovery ? { taskRecovery: [...input.taskRecovery] } : {}),
      ...(input.routingDecisions ? { routingDecisions: [...input.routingDecisions] } : {}),
      ...(input.coordinationRequests
        ? { coordinationRequests: [...input.coordinationRequests] }
        : {}),
      ...(input.replanProposals ? { replanProposals: [...input.replanProposals] } : {}),
      ...(input.integrationBatchId !== undefined
        ? { integrationBatchId: input.integrationBatchId }
        : {}),
      ...(input.finalReport !== undefined ? { finalReport: input.finalReport } : {}),
      createdAt,
    });
  });

  const persistDecision = Effect.fn("MissionRunReactor.persistDecision")(function* (input: {
    readonly run: MissionRun;
    readonly kind: MissionRunDecision["kind"];
    readonly taskId: TaskId | null;
    readonly reason: string;
    readonly sourceTaskIds?: ReadonlyArray<TaskId>;
    readonly currentReadyTaskIds: ReadonlyArray<TaskId>;
    readonly scheduledTaskIds: ReadonlyArray<TaskId>;
    readonly attention: ReadonlyArray<MissionRunAttention>;
  }) {
    const occurredAt = yield* now;
    const candidate = {
      id: EventId.make("pending"),
      kind: input.kind,
      taskId: input.taskId,
      reason: input.reason,
      sourceTaskIds: [...(input.sourceTaskIds ?? [])],
      occurredAt,
    } satisfies MissionRunDecision;
    const decision = { ...candidate, id: decisionId(input.run, candidate) };
    if (input.run.decisions.some((existing) => existing.id === decision.id)) return;
    yield* updateRun({
      runId: input.run.id,
      status: input.attention.length > 0 ? "attention" : "running",
      currentReadyTaskIds: input.currentReadyTaskIds,
      scheduledTaskIds: input.scheduledTaskIds,
      attention: input.attention,
      decision,
    });
  });

  const advanceScheduledTask = Effect.fn("MissionRunReactor.advanceScheduledTask")(function* (
    run: MissionRun,
    model: OrchestrationReadModel,
    project: OrchestrationProject,
    task: OrchestrationTask,
  ) {
    if (task.status === "completed" || task.status === "cancelled") return;
    let selection = task.modelSelection ?? null;
    if (!selection || !(yield* providerReady(task))) {
      let existingDecision = (run.routingDecisions ?? []).findLast(
        (candidate) => candidate.taskId === task.id,
      );
      if (existingDecision) {
        const candidates = yield* routingCandidates(model);
        if (
          !candidates.some(
            (candidate) =>
              candidate.instanceId === existingDecision!.selectedProviderInstanceId &&
              candidate.ready,
          )
        )
          existingDecision = undefined;
      }
      const decision =
        existingDecision ??
        (yield* routeTask({
          run,
          task,
          model,
          ...(selection ? { excluded: new Set([selection.instanceId]) } : {}),
        }));
      if (!decision) return;
      selection = ModelSelection.make({
        instanceId: decision.selectedProviderInstanceId,
        model: decision.selectedModel,
      });
      if (!existingDecision) {
        yield* updateRun({
          runId: run.id,
          status: "running",
          currentReadyTaskIds: run.currentReadyTaskIds,
          scheduledTaskIds: run.scheduledTaskIds,
          attention: run.attention,
          routingDecisions: [...(run.routingDecisions ?? []), decision],
          decision: {
            id: EventId.make(
              `mission-run:${run.id}:routing:${task.id}:${decision.selectedProviderInstanceId}`,
            ),
            kind: "routing",
            taskId: task.id,
            reason: `Selected ${decision.selectedProviderInstanceId}. ${decision.reasons.join(" ")}`,
            sourceTaskIds: [],
            occurredAt: decision.decidedAt,
          },
        });
        return;
      }
    }
    if (task.status === "draft" && task.workspace?.status !== "ready") {
      if (!task.workspace) {
        yield* engine.dispatch({
          type: "task.workspace.prepare",
          commandId: commandId(run, task.id, "workspace-prepare"),
          taskId: task.id,
          createdAt: run.startedAt,
        });
      }
      return;
    }
    if (
      task.workspace?.status !== "ready" ||
      !task.workspace.path ||
      !task.workspace.branch ||
      !selection
    )
      return;

    const deterministicThreadId = taskThreadId(run, task);
    let thread = model.threads.find((candidate) => candidate.id === task.threadId);
    if (!thread) thread = model.threads.find((candidate) => candidate.id === deterministicThreadId);
    if (!thread) {
      yield* engine.dispatch({
        type: "thread.create",
        commandId: commandId(run, task.id, "thread-create"),
        threadId: deterministicThreadId,
        projectId: task.projectId,
        title: task.title,
        modelSelection: selection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: task.workspace.branch,
        worktreePath: task.workspace.path,
        createdAt: run.startedAt,
      });
      return;
    }
    if (task.threadId === null) {
      yield* engine.dispatch({
        type: "task.bind-thread",
        commandId: commandId(run, task.id, "thread-bind"),
        taskId: task.id,
        threadId: thread.id,
        modelSelection: selection,
        createdAt: run.startedAt,
      });
      return;
    }
    if (task.status === "draft") {
      yield* engine.dispatch({
        type: "task.activate",
        commandId: commandId(run, task.id, "activate"),
        taskId: task.id,
        createdAt: run.startedAt,
      });
      return;
    }
    if (task.status !== "active" || thread.latestTurn !== null || thread.messages.length > 0)
      return;
    const recovery = (run.taskRecovery ?? []).find((candidate) => candidate.taskId === task.id);
    if (!recovery) {
      const initial: TaskRecoveryState = {
        taskId: task.id,
        transientRetries: 0,
        remediationRounds: 0,
        attempts: [
          {
            number: 1,
            kind: "initial",
            providerInstanceId: selection.instanceId,
            threadId: thread.id,
            status: "active",
            failureClass: null,
            summary: "Initial supervised Builder execution.",
            startedAt: run.startedAt,
            completedAt: null,
          },
        ],
        latestFailureClass: null,
        latestFailureSignature: null,
        attentionRequired: false,
        updatedAt: run.startedAt,
      };
      yield* updateRun({
        runId: run.id,
        status: "running",
        currentReadyTaskIds: run.currentReadyTaskIds,
        scheduledTaskIds: run.scheduledTaskIds,
        attention: run.attention,
        taskRecovery: [...(run.taskRecovery ?? []), initial],
      });
      return;
    }
    const mission = (model.missions ?? []).find((candidate) => candidate.id === run.missionId);
    if (!mission) return;
    const context = buildTaskContextPackage({
      mission,
      task,
      tasks: model.tasks ?? [],
      project,
    });
    yield* engine.dispatch({
      type: "thread.activity.append",
      commandId: commandId(run, task.id, `context-provenance:${thread.id}`),
      threadId: thread.id,
      activity: {
        id: EventId.make(`mission-run:${run.id}:task:${task.id}:context:${thread.id}`),
        tone: "info",
        kind: "mission.context.injected",
        summary: "Mission context injected by Nebula",
        payload: {
          missionId: mission.id,
          missionRunId: run.id,
          taskId: task.id,
          sourceTaskIds: context.sourceTaskIds,
          authoredBy: "nebula",
        },
        turnId: null,
        createdAt: run.startedAt,
      },
      createdAt: run.startedAt,
    });
    yield* engine.dispatch({
      type: "thread.turn.start",
      commandId: commandId(run, task.id, `builder-turn:${thread.id}`),
      threadId: thread.id,
      message: {
        messageId: MessageId.make(`mission-run:${run.id}:task:${task.id}:message:${thread.id}`),
        role: "user",
        text: [context.text, ownershipContext(task), resourceContext(project, task)].join("\n\n"),
        attachments: [],
      },
      modelSelection: selection,
      titleSeed: task.title,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: run.startedAt,
    });
  });

  const recoveryMessage = (input: {
    readonly task: OrchestrationTask;
    readonly failureClass: string;
    readonly detail: string;
    readonly replacement: boolean;
    readonly previousProvider: string;
  }) => {
    const review = currentReview(input.task);
    const gate = requiredGateFailure(input.task);
    return [
      input.replacement
        ? "Provider replacement context injected by Nebula (not hidden provider reasoning)"
        : "Bounded remediation request from Nebula",
      `Task objective: ${input.task.objective}`,
      `Failure class: ${input.failureClass}`,
      `Deterministic failure evidence: ${input.detail}`,
      `Previous provider: ${input.previousProvider}`,
      `Current changed files: ${(input.task.reviewSnapshot?.files ?? []).map((file) => file.path).join(", ") || "not yet snapshotted"}`,
      `Latest handoff: ${input.task.handoff?.summary || "No structured handoff retained."}`,
      `Gate failure: ${gate ? `${gate.label}: ${gate.outputSummary}` : "None"}`,
      `Review: ${review?.summary || "None"}`,
      `Required changes: ${review?.requiredChanges.join("; ") || "None"}`,
      "Keep the same Task, workspace, ownership, Mission, and durable history. Address only the stated failure and do not broaden policy or ownership.",
    ].join("\n\n");
  };

  const continueReplacement = Effect.fn("MissionRunReactor.continueReplacement")(function* (input: {
    readonly run: MissionRun;
    readonly model: OrchestrationReadModel;
    readonly task: OrchestrationTask;
    readonly state: TaskRecoveryState;
    readonly detail: string;
  }) {
    const nudgeAfterProjectionStep = () =>
      updateRun({
        runId: input.run.id,
        status: "running",
        currentReadyTaskIds: input.run.currentReadyTaskIds,
        scheduledTaskIds: input.run.scheduledTaskIds,
        attention: [],
        ...(input.run.taskRecovery ? { taskRecovery: input.run.taskRecovery } : {}),
        ...(input.run.routingDecisions ? { routingDecisions: input.run.routingDecisions } : {}),
      });
    const attempt = input.state.attempts.findLast(
      (candidate) => candidate.kind === "replacement" && candidate.status === "active",
    );
    if (!attempt || !input.task.workspace?.path || !input.task.workspace.branch) return false;
    const selection = (input.run.routingDecisions ?? []).findLast(
      (decision) =>
        decision.taskId === input.task.id &&
        decision.selectedProviderInstanceId === attempt.providerInstanceId,
    );
    if (!selection) return false;
    const modelSelection = ModelSelection.make({
      instanceId: selection.selectedProviderInstanceId,
      model: selection.selectedModel,
    });
    const thread = input.model.threads.find((candidate) => candidate.id === attempt.threadId);
    if (!thread) {
      yield* engine.dispatch({
        type: "thread.create",
        commandId: commandId(input.run, input.task.id, `replacement-thread:${attempt.number}`),
        threadId: attempt.threadId,
        projectId: input.task.projectId,
        title: `${input.task.title} — attempt ${attempt.number}`,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: input.task.workspace.branch,
        worktreePath: input.task.workspace.path,
        createdAt: attempt.startedAt,
      });
      yield* nudgeAfterProjectionStep();
      return true;
    }
    if (input.task.threadId !== thread.id) {
      yield* engine.dispatch({
        type: "task.bind-thread",
        commandId: commandId(input.run, input.task.id, `replacement-bind:${attempt.number}`),
        taskId: input.task.id,
        threadId: thread.id,
        replaceProviderExecution: true,
        modelSelection,
        createdAt: attempt.startedAt,
      });
      yield* nudgeAfterProjectionStep();
      return true;
    }
    if (
      thread.latestTurn?.state === "error" &&
      /did not survive (?:a )?server restart/i.test(thread.session?.lastError ?? "")
    ) {
      yield* engine.dispatch({
        type: "thread.turn.start",
        commandId: commandId(
          input.run,
          input.task.id,
          `replacement-resume:${attempt.number}:${thread.latestTurn.turnId}`,
        ),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(
            `mission-run:${input.run.id}:task:${input.task.id}:replacement-resume:${attempt.number}:${thread.latestTurn.turnId}`,
          ),
          role: "user",
          text: recoveryMessage({
            task: input.task,
            failureClass: "transport_transient",
            detail: thread.session?.lastError ?? input.detail,
            replacement: true,
            previousProvider: attempt.providerInstanceId,
          }),
          attachments: [],
        },
        modelSelection,
        titleSeed: input.task.title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: yield* now,
      });
      return true;
    }
    if (thread.latestTurn === null && thread.messages.length === 0) {
      yield* engine.dispatch({
        type: "thread.turn.start",
        commandId: commandId(input.run, input.task.id, `replacement-turn:${attempt.number}`),
        threadId: thread.id,
        message: {
          messageId: MessageId.make(
            `mission-run:${input.run.id}:task:${input.task.id}:replacement:${attempt.number}`,
          ),
          role: "user",
          text: recoveryMessage({
            task: input.task,
            failureClass: input.state.latestFailureClass ?? "provider_execution_error",
            detail: input.detail,
            replacement: true,
            previousProvider: input.state.attempts.at(-2)?.providerInstanceId ?? "unknown provider",
          }),
          attachments: [],
        },
        modelSelection,
        titleSeed: input.task.title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: attempt.startedAt,
      });
    }
    return true;
  });

  const recoverActiveTask = Effect.fn("MissionRunReactor.recoverActiveTask")(function* (input: {
    readonly run: MissionRun;
    readonly model: OrchestrationReadModel;
    readonly task: OrchestrationTask;
    readonly thread: OrchestrationThread | undefined;
  }) {
    const { run, model, task, thread } = input;
    const state = (run.taskRecovery ?? []).find((candidate) => candidate.taskId === task.id);
    if (!state) return false;
    const activeReplacement = state.attempts.findLast(
      (attempt) => attempt.kind === "replacement" && attempt.status === "active",
    );
    if (activeReplacementOwnsProviderTurn(state, thread)) return true;
    if (thread && missionProviderTurnInFlight(thread)) return false;
    const replacementNeedsContinuation =
      activeReplacement !== undefined &&
      (!thread ||
        (thread.latestTurn === null && thread.messages.length === 0) ||
        (thread.latestTurn?.state === "error" &&
          /did not survive (?:a )?server restart/i.test(thread.session?.lastError ?? "")));
    if (activeReplacement && replacementNeedsContinuation) {
      yield* Effect.logInfo("continuing active provider replacement", {
        taskId: task.id,
        attempt: activeReplacement.number,
        providerInstanceId: activeReplacement.providerInstanceId,
        replacementThreadId: activeReplacement.threadId,
        boundThreadId: task.threadId,
        workspacePath: task.workspace?.path ?? null,
      });
      return yield* continueReplacement({
        run,
        model,
        task,
        state,
        detail:
          activeReplacement.summary ||
          state.latestFailureClass ||
          "Continue the active provider replacement.",
      });
    }
    if (!thread) return false;
    const gate = requiredGateFailure(task);
    const review = currentReview(task);
    const providerError =
      thread.latestTurn?.state === "error" || thread.session?.status === "error"
        ? (thread.session?.lastError ?? "Provider execution failed.")
        : null;
    const failureClass = providerError
      ? classifyRuntimeFailure({ source: "provider", message: providerError })
      : gate
        ? classifyRuntimeFailure({ source: "quality" })
        : review?.status === "completed" && review.verdict === "request_changes"
          ? classifyRuntimeFailure({ source: "review", reviewVerdict: "request_changes" })
          : null;
    if (!failureClass) return false;
    const detail =
      providerError ??
      (gate ? `${gate.label}: ${gate.outputSummary}` : review?.summary) ??
      failureClass;
    const signature = `${failureClass}:${thread.id}:${thread.latestTurn?.turnId ?? "no-turn"}:${task.reviewSnapshot?.id ?? "no-snapshot"}:${review?.id ?? "no-review"}`;
    if (state.latestFailureSignature === signature) {
      if (state.attentionRequired) return false;
      const pendingAttempt = state.attempts.at(-1);
      if (
        pendingAttempt?.status === "active" &&
        (pendingAttempt.kind === "retry" || pendingAttempt.kind === "remediation")
      ) {
        const action = pendingAttempt.kind === "remediation" ? "remediate" : "retry";
        yield* engine.dispatch({
          type: "thread.turn.start",
          commandId: commandId(run, task.id, `${action}-turn:${pendingAttempt.number}`),
          threadId: thread.id,
          message: {
            messageId: MessageId.make(
              `mission-run:${run.id}:task:${task.id}:${action}:${pendingAttempt.number}`,
            ),
            role: "user",
            text: recoveryMessage({
              task,
              failureClass,
              detail,
              replacement: false,
              previousProvider: thread.modelSelection.instanceId,
            }),
            attachments: [],
          },
          modelSelection: thread.modelSelection,
          titleSeed: task.title,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: pendingAttempt.startedAt,
        });
        return true;
      }
      return yield* continueReplacement({ run, model, task, state, detail });
    }
    const candidates = yield* routingCandidates(model);
    const replacementAvailable = candidates.some(
      (candidate) => candidate.ready && candidate.instanceId !== thread.modelSelection.instanceId,
    );
    const action = recoveryAction({
      failureClass,
      transientRetries: state.transientRetries,
      remediationRounds: state.remediationRounds,
      ...(run.recoveryPolicy
        ? {
            transportRetryLimit: run.recoveryPolicy.transportRetryLimit,
            remediationLimit: run.recoveryPolicy.remediationLimit,
          }
        : {}),
      replacementAvailable,
    });
    if (action === "attention") {
      const next = {
        ...state,
        latestFailureClass: failureClass,
        latestFailureSignature: signature,
        attentionRequired: true,
        updatedAt: yield* now,
      } satisfies TaskRecoveryState;
      yield* updateRun({
        runId: run.id,
        status: "attention",
        currentReadyTaskIds: run.currentReadyTaskIds,
        scheduledTaskIds: run.scheduledTaskIds,
        attention: run.attention,
        taskRecovery: (run.taskRecovery ?? []).map((candidate) =>
          candidate.taskId === task.id ? next : candidate,
        ),
      });
      return false;
    }
    const startedAt = yield* now;
    const attemptNumber = (state.attempts.at(-1)?.number ?? 0) + 1;
    const attemptKind =
      action === "remediate" ? "remediation" : action === "replace" ? "replacement" : "retry";
    let providerInstanceId = thread.modelSelection.instanceId;
    let replacementDecision: RoutingDecision | null = null;
    let replacementThreadId = thread.id;
    if (action === "replace") {
      replacementDecision = yield* routeTask({
        run,
        task,
        model,
        excluded: new Set([thread.modelSelection.instanceId]),
      });
      if (!replacementDecision) return false;
      providerInstanceId = replacementDecision.selectedProviderInstanceId;
      replacementThreadId = ThreadId.make(
        `mission-run:${run.id}:task:${task.id}:attempt:${attemptNumber}`,
      );
    }
    const nextState: TaskRecoveryState = {
      ...state,
      transientRetries: state.transientRetries + (action === "retry" ? 1 : 0),
      remediationRounds: state.remediationRounds + (action === "remediate" ? 1 : 0),
      attempts: [
        ...state.attempts.map((attempt) =>
          attempt.status === "active"
            ? {
                ...attempt,
                status: action === "replace" ? ("replaced" as const) : ("failed" as const),
                failureClass,
                summary: detail,
                completedAt: startedAt,
              }
            : attempt,
        ),
        {
          number: attemptNumber,
          kind: attemptKind,
          providerInstanceId,
          threadId: replacementThreadId,
          status: "active",
          failureClass: null,
          summary: `${action} after ${failureClass}.`,
          startedAt,
          completedAt: null,
        },
      ],
      latestFailureClass: failureClass,
      latestFailureSignature: signature,
      attentionRequired: false,
      updatedAt: startedAt,
    };
    const reason =
      action === "replace"
        ? `${thread.modelSelection.instanceId} → ${providerInstanceId}. Reason: ${failureClass} after ${state.transientRetries} retries.`
        : `${action} ${attemptNumber} for ${failureClass}: ${detail}`;
    const nextTaskRecovery = (run.taskRecovery ?? []).map((candidate) =>
      candidate.taskId === task.id ? nextState : candidate,
    );
    const nextRoutingDecisions = replacementDecision
      ? [...(run.routingDecisions ?? []), replacementDecision]
      : run.routingDecisions;
    yield* updateRun({
      runId: run.id,
      status: "running",
      currentReadyTaskIds: run.currentReadyTaskIds,
      scheduledTaskIds: run.scheduledTaskIds,
      attention: [],
      taskRecovery: nextTaskRecovery,
      ...(nextRoutingDecisions ? { routingDecisions: nextRoutingDecisions } : {}),
      decision: {
        id: EventId.make(`mission-run:${run.id}:${action}:${task.id}:${attemptNumber}`),
        kind: attemptKind,
        taskId: task.id,
        reason,
        sourceTaskIds: [],
        occurredAt: startedAt,
      },
    });
    if (action === "replace") {
      yield* continueReplacement({
        run: {
          ...run,
          taskRecovery: nextTaskRecovery,
          routingDecisions: nextRoutingDecisions!,
        },
        model,
        task,
        state: nextState,
        detail,
      });
      return true;
    }
    yield* engine.dispatch({
      type: "thread.turn.start",
      commandId: commandId(run, task.id, `${action}-turn:${attemptNumber}`),
      threadId: thread.id,
      message: {
        messageId: MessageId.make(
          `mission-run:${run.id}:task:${task.id}:${action}:${attemptNumber}`,
        ),
        role: "user",
        text: recoveryMessage({
          task,
          failureClass,
          detail,
          replacement: false,
          previousProvider: thread.modelSelection.instanceId,
        }),
        attachments: [],
      },
      modelSelection: thread.modelSelection,
      titleSeed: task.title,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: startedAt,
    });
    return true;
  });

  const handleCoordinationRequest = Effect.fn("MissionRunReactor.handleCoordinationRequest")(
    function* (input: {
      readonly run: MissionRun;
      readonly mission: NonNullable<OrchestrationReadModel["missions"]>[number];
      readonly model: OrchestrationReadModel;
      readonly project: OrchestrationProject;
      readonly task: OrchestrationTask;
      readonly thread: OrchestrationThread | undefined;
    }) {
      const { run, mission, model, project, task, thread } = input;
      if (task.status !== "active" || thread?.latestTurn?.state !== "completed") return null;
      const latestAssistant = thread.messages.findLast((message) => message.role === "assistant");
      if (!latestAssistant) return null;
      const parsed = parseCoordinationRequest(latestAssistant.text);
      if (!parsed) return null;
      const id = CoordinationRequestId.make(
        `mission-run:${run.id}:task:${task.id}:request:${thread.latestTurn.turnId}`,
      );
      const existing = (run.coordinationRequests ?? []).find((request) => request.id === id);
      if (existing) {
        if (existing.kind === "ownership_request" && existing.status === "pending") {
          const ownership = (task.ownershipRequests ?? []).find(
            (request) => request.id === OwnershipRequestId.make(id),
          );
          if (!ownership) {
            yield* engine.dispatch({
              type: "task.ownership-request.create",
              commandId: commandId(run, task.id, `ownership-request:${id}`),
              taskId: task.id,
              requestId: OwnershipRequestId.make(id),
              requestedRules: existing.requestedPaths.map((path, index) => ({
                id: `provider-request:${id}:${index}`,
                pattern: path.pattern,
                access: path.access,
                reason: path.reason,
                createdAt: existing.createdAt,
              })),
              reason: existing.reason,
              source: "provider",
              createdAt: existing.createdAt,
            });
          }
          if (ownership && ownership.status !== "pending") {
            const resolvedAt = ownership.resolvedAt ?? (yield* now);
            yield* updateRun({
              runId: run.id,
              status: ownership.status === "approved" ? "running" : "attention",
              currentReadyTaskIds: run.currentReadyTaskIds,
              scheduledTaskIds: run.scheduledTaskIds,
              attention: run.attention,
              coordinationRequests: (run.coordinationRequests ?? []).map((request) =>
                request.id === id
                  ? {
                      ...request,
                      status: ownership.status === "approved" ? "approved" : ownership.status,
                      answer:
                        ownership.status === "approved"
                          ? "Ownership expansion approved through the canonical Task workflow."
                          : request.answer,
                      resolvedAt,
                    }
                  : request,
              ),
            });
            return { handled: true, attention: null };
          }
        }
        if (existing.status === "pending")
          return {
            handled: true,
            attention: {
              taskId: task.id,
              code: existing.kind,
              detail: existing.reason,
              blocksMission: true,
            } satisfies MissionRunAttention,
          };
        if (existing.status === "approved" || existing.status === "answered") {
          yield* engine.dispatch({
            type: "thread.turn.start",
            commandId: commandId(run, task.id, `coordination-continue:${id}`),
            threadId: thread.id,
            message: {
              messageId: MessageId.make(`mission-run:${run.id}:coordination-continue:${id}`),
              role: "user",
              text: `Coordination request resolved by Nebula policy boundary:\n\n${existing.answer ?? "Approved by human review."}`,
              attachments: [],
            },
            modelSelection: thread.modelSelection,
            titleSeed: task.title,
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: existing.resolvedAt ?? (yield* now),
          });
          return { handled: true, attention: null };
        }
        return { handled: false, attention: null };
      }
      const createdAt = yield* now;
      const resource = parsed.resource
        ? (project.sharedResources ?? []).find(
            (candidate) => candidate.name.toLowerCase() === parsed.resource!.toLowerCase(),
          )
        : null;
      const prerequisiteIds = mission.dependencies
        .filter((edge) => edge.dependentTaskId === task.id)
        .map((edge) => edge.prerequisiteTaskId);
      const contractEvidence = prerequisiteIds.flatMap((taskId) => {
        const prerequisite = (model.tasks ?? []).find((candidate) => candidate.id === taskId);
        return prerequisite?.status === "completed"
          ? (prerequisite.handoff?.interfaceChanges ?? prerequisite.result?.interfaceChanges ?? [])
          : [];
      });
      const deterministicAnswer =
        (parsed.kind === "contract_question" || parsed.kind === "dependency_question") &&
        contractEvidence.length > 0
          ? contractEvidence.join("\n")
          : null;
      const request = {
        id,
        taskId: task.id,
        kind: parsed.kind,
        reason: parsed.reason,
        requestedPaths: parsed.paths,
        resourceName: parsed.resource,
        resourceId: resource?.id ?? null,
        question: parsed.question,
        status: deterministicAnswer ? ("answered" as const) : ("pending" as const),
        answer: deterministicAnswer,
        createdAt,
        resolvedAt: deterministicAnswer ? createdAt : null,
      };
      const replanProposal =
        parsed.kind === "replan_request"
          ? {
              id: ReplanProposalId.make(`replan:${id}`),
              missionId: mission.id,
              sourceTaskId: task.id,
              scope: smallestReplanScope({
                requested: parsed.scope,
                affectedTaskCount: 1,
                missionTaskCount: mission.taskIds.length,
              }),
              affectedTaskIds: [task.id],
              summary: parsed.reason,
              rationale: `Architect amendment requested from current approved Mission evidence after a blocker in Task '${task.title}'.`,
              preservedCompletedTaskIds: mission.taskIds.filter(
                (taskId) =>
                  (model.tasks ?? []).find((candidate) => candidate.id === taskId)?.status ===
                  "completed",
              ),
              architectPlanProposalId: null,
              status: "pending" as const,
              createdAt,
              resolvedAt: null,
            }
          : null;
      yield* updateRun({
        runId: run.id,
        status: deterministicAnswer ? "running" : "attention",
        currentReadyTaskIds: run.currentReadyTaskIds,
        scheduledTaskIds: run.scheduledTaskIds,
        attention: run.attention,
        coordinationRequests: [...(run.coordinationRequests ?? []), request],
        ...(replanProposal
          ? { replanProposals: [...(run.replanProposals ?? []), replanProposal] }
          : {}),
        decision: {
          id: EventId.make(`mission-run:${run.id}:request:${id}`),
          kind: replanProposal ? "replan" : "request",
          taskId: task.id,
          reason: deterministicAnswer
            ? "Answered coordination question from completed prerequisite handoff evidence."
            : `Human approval required for ${parsed.kind}.`,
          sourceTaskIds: prerequisiteIds,
          occurredAt: createdAt,
        },
      });
      if (parsed.kind === "ownership_request") {
        yield* engine.dispatch({
          type: "task.ownership-request.create",
          commandId: commandId(run, task.id, `ownership-request:${id}`),
          taskId: task.id,
          requestId: OwnershipRequestId.make(id),
          requestedRules: parsed.paths.map((path, index) => ({
            id: `provider-request:${id}:${index}`,
            pattern: path.pattern,
            access: path.access,
            reason: path.reason,
            createdAt,
          })),
          reason: parsed.reason,
          source: "provider",
          createdAt,
        });
      }
      if (deterministicAnswer) {
        yield* engine.dispatch({
          type: "thread.turn.start",
          commandId: commandId(run, task.id, `coordination-answer:${id}`),
          threadId: thread.id,
          message: {
            messageId: MessageId.make(`mission-run:${run.id}:coordination-answer:${id}`),
            role: "user",
            text: `Nebula answered from completed prerequisite handoff evidence:\n\n${deterministicAnswer}`,
            attachments: [],
          },
          modelSelection: thread.modelSelection,
          titleSeed: task.title,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt,
        });
      }
      return {
        handled: true,
        attention: deterministicAnswer
          ? null
          : ({
              taskId: task.id,
              code: parsed.kind,
              detail: parsed.reason,
              blocksMission: true,
            } satisfies MissionRunAttention),
      };
    },
  );

  const advanceCompletionPipeline = Effect.fn("MissionRunReactor.advanceCompletionPipeline")(
    function* (
      run: MissionRun,
      project: OrchestrationProject,
      task: OrchestrationTask,
      thread: OrchestrationThread | undefined,
    ) {
      if (task.status !== "active" || thread?.latestTurn?.state !== "completed") return;
      if (!task.reviewSnapshot || task.reviewSnapshot.status !== "current") {
        if (task.ownership?.status === "pending") return;
        yield* engine.dispatch({
          type: "task.review.prepare",
          commandId: commandId(run, task.id, `review-prepare:${thread.latestTurn.turnId}`),
          taskId: task.id,
          generation: "provider",
          createdAt: thread.latestTurn.completedAt ?? run.startedAt,
        });
        return;
      }
      if (!task.handoff || task.handoff.snapshotId !== task.reviewSnapshot.id) return;
      if (task.handoff.status === "draft") {
        if (
          task.handoff.generation !== "provider" ||
          task.handoff.generationError !== null ||
          task.handoff.summary.trim().length === 0
        )
          return;
        yield* engine.dispatch({
          type: "task.handoff.update",
          commandId: commandId(run, task.id, `handoff-ready:${task.reviewSnapshot.id}`),
          taskId: task.id,
          snapshotId: task.reviewSnapshot.id,
          status: "ready",
          summary: task.handoff.summary,
          testsRun: task.handoff.testsRun,
          assumptions: task.handoff.assumptions,
          interfaceChanges: task.handoff.interfaceChanges,
          migrations: task.handoff.migrations,
          knownRisks: task.handoff.knownRisks,
          followUps: task.handoff.followUps,
          createdAt: task.reviewSnapshot.capturedAt,
        });
        return;
      }
      if (task.handoff.status !== "ready") return;
      const snapshotRuns = (task.qualityGateRuns ?? []).filter(
        (qualityRun) => qualityRun.snapshotId === task.reviewSnapshot!.id,
      );
      const enabledGates = (
        run.swarmPolicy?.qualityPolicy?.gates ??
        project.qualityPolicy?.gates ??
        []
      ).filter((gate) => gate.enabled && gate.scope !== "integration");
      if (enabledGates.length > 0 && snapshotRuns.length === 0) {
        yield* engine.dispatch({
          type: "task.quality.run",
          commandId: commandId(run, task.id, `quality:${task.reviewSnapshot.id}`),
          taskId: task.id,
          snapshotId: task.reviewSnapshot.id,
          createdAt: task.reviewSnapshot.capturedAt,
        });
        return;
      }
      if (
        snapshotRuns.some(
          (qualityRun) => qualityRun.status === "queued" || qualityRun.status === "running",
        )
      )
        return;
      if (requiredGateFailure(task)) return;
      if (task.reviewRequired === true || run.swarmPolicy?.independentReviewRequired === true) {
        const review = currentReview(task);
        if (!review || review.status === "failed") {
          const failedReviews = (task.reviews ?? []).filter(
            (candidate) =>
              candidate.snapshotId === task.reviewSnapshot!.id && candidate.status === "failed",
          );
          if (failedReviews.length >= 2)
            return {
              taskId: task.id,
              code: "review_failed",
              detail: "Independent review failed after two eligible provider attempts.",
              blocksMission: false,
            } satisfies MissionRunAttention;
          const selection = yield* reviewerSelection(
            task,
            new Set(failedReviews.map((candidate) => candidate.reviewerModelSelection.instanceId)),
          );
          if (!selection)
            return {
              taskId: task.id,
              code: "reviewer_unavailable",
              detail: "No configured independent Reviewer is currently ready.",
              blocksMission: false,
            } satisfies MissionRunAttention;
          const attempt = failedReviews.length + 1;
          yield* engine.dispatch({
            type: "task.independent-review.request",
            commandId: commandId(
              run,
              task.id,
              `independent-review:${task.reviewSnapshot.id}:${attempt}`,
            ),
            taskId: task.id,
            snapshotId: task.reviewSnapshot.id,
            reviewId: TaskReviewId.make(
              `mission-run:${run.id}:task:${task.id}:review:${task.reviewSnapshot.id}:attempt:${attempt}`,
            ),
            reviewerModelSelection: selection,
            createdAt: task.reviewSnapshot.capturedAt,
          });
          return;
        }
        if (review.status !== "completed") return;
        if (review.verdict !== "approve" && review.verdict !== "approve_with_notes") return;
      }
      if (task.ownership?.status === "pending") return;
      const completionAt =
        currentReview(task)?.completedAt ??
        snapshotRuns.findLast((qualityRun) => qualityRun.completedAt !== null)?.completedAt ??
        task.handoff.updatedAt;
      yield* engine.dispatch({
        type: "task.complete",
        commandId: commandId(run, task.id, `complete:${task.reviewSnapshot.id}`),
        taskId: task.id,
        createdAt: completionAt,
      });
    },
  );

  const reconcileRun = Effect.fn("MissionRunReactor.reconcileRun")(function* (
    runId: MissionRun["id"],
  ) {
    let model = yield* read();
    let run = (model.missionRuns ?? []).find((candidate) => candidate.id === runId);
    if (!run || run.status === "completed" || run.status === "stopped" || run.status === "failed")
      return;
    const mission = (model.missions ?? []).find((candidate) => candidate.id === run!.missionId);
    const project = model.projects.find((candidate) => candidate.id === run!.projectId);
    if (!mission || !project || mission.status !== "active") {
      yield* updateRun({
        runId: run.id,
        status: "failed",
        currentReadyTaskIds: [],
        scheduledTaskIds: run.scheduledTaskIds,
        attention: [
          {
            taskId: null,
            code: "mission_integrity",
            detail: "Mission or Project execution state is unavailable or no longer active.",
            blocksMission: true,
          },
        ],
        failureReason: "Mission integrity could not be reconciled.",
      });
      return;
    }
    const missionTasks = mission.taskIds.flatMap((taskId) => {
      const task = (model.tasks ?? []).find((candidate) => candidate.id === taskId);
      return task ? [task] : [];
    });
    if (missionTasks.length !== mission.taskIds.length) {
      yield* updateRun({
        runId: run.id,
        status: "failed",
        currentReadyTaskIds: [],
        scheduledTaskIds: run.scheduledTaskIds,
        attention: [
          {
            taskId: null,
            code: "mission_integrity",
            detail: "One or more approved Mission Tasks are missing.",
            blocksMission: true,
          },
        ],
        failureReason: "Approved Mission Task membership is incomplete.",
      });
      return;
    }
    if (
      run.swarmPolicy &&
      (JSON.stringify(run.swarmPolicy.qualityPolicy) !==
        JSON.stringify(project.qualityPolicy ?? null) ||
        JSON.stringify(run.swarmPolicy.reviewPolicy) !==
          JSON.stringify(project.reviewPolicy ?? null))
    ) {
      yield* updateRun({
        runId: run.id,
        status: "attention",
        currentReadyTaskIds: [],
        scheduledTaskIds: run.scheduledTaskIds,
        attention: [
          {
            taskId: null,
            code: "swarm_policy_changed",
            detail:
              "Project quality or review policy changed after this Swarm policy was frozen. Stop and start a new Run revision to apply it.",
            blocksMission: true,
          },
        ],
      });
      return;
    }
    if (missionTasks.every((task) => task.status === "completed")) {
      const autoIntegration = run.swarmPolicy?.autoIntegration === true;
      if (autoIntegration) {
        const integrationBatchId =
          run.integrationBatchId ??
          mission.integrationBatchId ??
          IntegrationBatchId.make(`swarm:${run.id}`);
        const batch = (project.integrationBatches ?? []).find(
          (candidate) => candidate.id === integrationBatchId,
        );
        if (!batch) {
          const overlapPaths = missionIntegrationOverlapPaths(missionTasks);
          const approved = new Set(run.swarmPolicy?.preapprovedOverlapPaths ?? []);
          const unapproved = overlapPaths.filter((path) => !approved.has(path));
          if (unapproved.length > 0) {
            yield* updateRun({
              runId: run.id,
              status: "attention",
              currentReadyTaskIds: [],
              scheduledTaskIds: [],
              attention: [
                {
                  taskId: null,
                  code: "integration_overlap_acknowledgement",
                  detail: `Automatic Integration requires explicit overlap approval for: ${unapproved.join(", ")}.`,
                  blocksMission: true,
                },
              ],
            });
            return;
          }
          const createdAt = yield* now;
          yield* engine.dispatch({
            type: "integration.create",
            commandId: commandId(run, null, "integration-create"),
            batchId: integrationBatchId,
            projectId: project.id,
            taskIds: deterministicMissionTaskIds(mission),
            acknowledgeOverlaps: overlapPaths.length > 0,
            missionId: mission.id,
            createdAt,
          });
          yield* updateRun({
            runId: run.id,
            status: "running",
            currentReadyTaskIds: [],
            scheduledTaskIds: [],
            attention: [],
            integrationBatchId,
            decision: {
              id: EventId.make(`mission-run:${run.id}:integration-created`),
              kind: "pipeline",
              taskId: null,
              reason: "All Tasks completed. Automatic Integration started in Mission DAG order.",
              sourceTaskIds: deterministicMissionTaskIds(mission),
              occurredAt: createdAt,
            },
          });
          return;
        }
        if (
          batch.status === "conflict" ||
          batch.status === "failed" ||
          batch.status === "cancelled"
        ) {
          yield* updateRun({
            runId: run.id,
            status: "attention",
            currentReadyTaskIds: [],
            scheduledTaskIds: [],
            attention: [
              {
                taskId: batch.conflict?.taskId ?? null,
                code:
                  batch.status === "conflict"
                    ? "integration_conflict"
                    : "integration_validation_failed",
                detail:
                  batch.status === "conflict"
                    ? "Integration has a Git conflict. Resolve it in the Integration workspace, then continue."
                    : (batch.failureReason ?? "Final Integration validation failed."),
                blocksMission: true,
              },
            ],
            integrationBatchId,
          });
          return;
        }
        if (batch.status !== "ready") return;
        const completedAt = yield* now;
        yield* updateRun({
          runId: run.id,
          status: "completed",
          currentReadyTaskIds: [],
          scheduledTaskIds: [],
          attention: [],
          integrationBatchId,
          finalReport: buildMissionFinalReport({
            mission,
            run,
            tasks: missionTasks,
            integrationBranch: batch.branch,
            finalValidation: "ready",
            generatedAt: completedAt,
          }),
          decision: {
            id: EventId.make(`mission-run:${run.id}:completed`),
            kind: "completed",
            taskId: null,
            reason: "All Mission Tasks completed and Integration passed final validation.",
            sourceTaskIds: mission.taskIds,
            occurredAt: completedAt,
          },
        });
        return;
      }
      const completedAt = yield* now;
      yield* updateRun({
        runId: run.id,
        status: "completed",
        currentReadyTaskIds: [],
        scheduledTaskIds: [],
        attention: [],
        finalReport: buildMissionFinalReport({
          mission,
          run,
          tasks: missionTasks,
          integrationBranch: null,
          finalValidation: "not_requested",
          generatedAt: completedAt,
        }),
        decision: {
          id: EventId.make(`mission-run:${run.id}:completed`),
          kind: "completed",
          taskId: null,
          reason: "All Mission Tasks completed. Mission is ready for Integration.",
          sourceTaskIds: mission.taskIds,
          occurredAt: completedAt,
        },
      });
      return;
    }

    const threadById = new Map(model.threads.map((thread) => [thread.id, thread] as const));
    const recoveryHandled = new Set<TaskId>();
    let attention: MissionRunAttention[] = [];
    for (const task of missionTasks) {
      if (task.status !== "active") continue;
      const thread = task.threadId ? threadById.get(task.threadId) : undefined;
      const recovered = yield* recoverActiveTask({ run, model, task, thread }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Supervised Task recovery step deferred", {
            taskId: task.id,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(false)),
        ),
      );
      if (recovered) {
        recoveryHandled.add(task.id);
        continue;
      }
      const coordination = yield* handleCoordinationRequest({
        run,
        mission,
        model,
        project,
        task,
        thread,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Structured coordination request step deferred", {
            taskId: task.id,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(null)),
        ),
      );
      if (coordination?.handled) recoveryHandled.add(task.id);
      if (coordination?.attention) attention.push(coordination.attention);
      if (!coordination?.handled) attention.push(...activeTaskAttention(task, thread));
    }
    for (const task of missionTasks) {
      if (recoveryHandled.has(task.id)) continue;
      const pipelineAttention = yield* advanceCompletionPipeline(
        run,
        project,
        task,
        task.threadId ? threadById.get(task.threadId) : undefined,
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Supervised Task completion pipeline step deferred", {
            taskId: task.id,
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(null)),
        ),
      );
      if (pipelineAttention) attention.push(pipelineAttention);
    }
    if (run.status === "paused") return;

    const readyTaskIds = new Set<TaskId>();
    for (const task of missionTasks) if (yield* providerReady(task)) readyTaskIds.add(task.id);
    const automaticRouting =
      (run.recoveryPolicy?.routingProfile ?? "manual_only") !== "manual_only";
    const candidates = automaticRouting ? yield* routingCandidates(model) : [];
    const autoRoutableTaskIds = new Set<TaskId>(
      candidates.some((candidate) => candidate.ready)
        ? missionTasks.filter((task) => task.status === "draft").map((task) => task.id)
        : [],
    );
    const scheduling = planMissionRunScheduling({
      mission,
      run,
      tasks: missionTasks,
      project,
      providerReadyTaskIds: readyTaskIds,
      blockedTaskIds: new Set(attention.flatMap((item) => (item.taskId ? [item.taskId] : []))),
      autoRoutableTaskIds,
    });
    attention = [...attention, ...scheduling.attention];
    const nextStatus = attention.length > 0 ? "attention" : "running";
    const stateChanged =
      run.status !== nextStatus ||
      JSON.stringify(run.currentReadyTaskIds) !== JSON.stringify(scheduling.currentReadyTaskIds) ||
      JSON.stringify(run.scheduledTaskIds) !== JSON.stringify(scheduling.scheduledTaskIds) ||
      !sameAttention(run.attention, attention);
    if (stateChanged) {
      yield* updateRun({
        runId: run.id,
        status: nextStatus,
        currentReadyTaskIds: scheduling.currentReadyTaskIds,
        scheduledTaskIds: scheduling.scheduledTaskIds,
        attention,
      });
      model = yield* read();
      run = (model.missionRuns ?? []).find((candidate) => candidate.id === runId) ?? run;
    }
    for (const decision of scheduling.decisions) {
      yield* persistDecision({
        run,
        kind: decision.kind,
        taskId: decision.taskId,
        reason: decision.reason,
        sourceTaskIds: decision.sourceTaskIds,
        currentReadyTaskIds: scheduling.currentReadyTaskIds,
        scheduledTaskIds: scheduling.scheduledTaskIds,
        attention,
      });
    }
    model = yield* read();
    run = (model.missionRuns ?? []).find((candidate) => candidate.id === runId) ?? run;
    const latestProject =
      model.projects.find((candidate) => candidate.id === project.id) ?? project;
    const order = new Map(
      deterministicMissionTaskIds(mission).map((taskId, index) => [taskId, index]),
    );
    for (const taskId of [...run.scheduledTaskIds].toSorted(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right) ?? Number.MAX_SAFE_INTEGER),
    )) {
      if (recoveryHandled.has(taskId)) continue;
      const task = (model.tasks ?? []).find((candidate) => candidate.id === taskId);
      if (!task) continue;
      yield* advanceScheduledTask(run, model, latestProject, task).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Supervised Task start step deferred", {
            taskId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
    }
  });

  const reconcileAll = Effect.fn("MissionRunReactor.reconcileAll")(function* () {
    const model = yield* read();
    for (const run of model.missionRuns ?? []) {
      if (run.status === "running" || run.status === "attention" || run.status === "paused") {
        yield* reconcileRun(run.id);
      }
    }
  });

  const nudgeAfterTurnDiff = Effect.fn("MissionRunReactor.nudgeAfterTurnDiff")(function* () {
    const model = yield* read();
    for (const run of model.missionRuns ?? []) {
      if (run.status !== "running" && run.status !== "attention") continue;
      yield* updateRun({
        runId: run.id,
        status: run.status,
        currentReadyTaskIds: run.currentReadyTaskIds,
        scheduledTaskIds: run.scheduledTaskIds,
        attention: run.attention,
        ...(run.taskRecovery ? { taskRecovery: run.taskRecovery } : {}),
        ...(run.routingDecisions ? { routingDecisions: run.routingDecisions } : {}),
      });
    }
  });

  const worker = yield* makeDrainableWorker((event: OrchestrationEvent | null) =>
    reconcileAll().pipe(
      Effect.andThen(
        event?.type === "thread.turn-diff-completed" ? nudgeAfterTurnDiff() : Effect.void,
      ),
      Effect.catchCause((cause) =>
        Effect.logError("Supervised Mission reconciliation failed", { cause: Cause.pretty(cause) }),
      ),
    ),
  );

  const start: MissionRunReactorShape["start"] = Effect.fn("MissionRunReactor.start")(function* () {
    yield* forkParked(
      Stream.runForEach(engine.streamDomainEvents, (event) =>
        RELEVANT_EVENTS.has(event.type) ? worker.enqueue(event) : Effect.void,
      ),
    );
    yield* worker.enqueue(null);
  });

  return { start, drain: worker.drain } satisfies MissionRunReactorShape;
});

export const MissionRunReactorLive = Layer.effect(MissionRunReactor, make);
