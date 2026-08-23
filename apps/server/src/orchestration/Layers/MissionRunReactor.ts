import {
  CommandId,
  EventId,
  MessageId,
  ModelSelection,
  TaskReviewId,
  ThreadId,
  type MissionRun,
  type MissionRunAttention,
  type MissionRunDecision,
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
  deterministicMissionTaskIds,
  planMissionRunScheduling,
  type MissionRunSchedulingDecision,
} from "@t3tools/shared/missionRunner";
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

  const reviewerSelection = Effect.fn("MissionRunReactor.reviewerSelection")(function* (
    task: OrchestrationTask,
  ) {
    const builder = task.modelSelection
      ? yield* providers.getInstance(task.modelSelection.instanceId)
      : undefined;
    const instances = yield* providers.listInstances;
    const ready: Array<{ instance: (typeof instances)[number]; model: string }> = [];
    for (const instance of instances) {
      if (!instance.enabled) continue;
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
    if (!(yield* providerReady(task))) return;
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
      !task.modelSelection
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
        modelSelection: task.modelSelection,
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
      commandId: commandId(run, task.id, "context-provenance"),
      threadId: thread.id,
      activity: {
        id: EventId.make(`mission-run:${run.id}:task:${task.id}:context`),
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
      commandId: commandId(run, task.id, "builder-turn"),
      threadId: thread.id,
      message: {
        messageId: MessageId.make(`mission-run:${run.id}:task:${task.id}:message`),
        role: "user",
        text: [context.text, ownershipContext(task), resourceContext(project, task)].join("\n\n"),
        attachments: [],
      },
      modelSelection: task.modelSelection,
      titleSeed: task.title,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: run.startedAt,
    });
  });

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
      const enabledGates = (project.qualityPolicy?.gates ?? []).filter((gate) => gate.enabled);
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
      if (task.reviewRequired === true) {
        const review = currentReview(task);
        if (!review) {
          const selection = yield* reviewerSelection(task);
          if (!selection)
            return {
              taskId: task.id,
              code: "reviewer_unavailable",
              detail: "No configured independent Reviewer is currently ready.",
              blocksMission: false,
            } satisfies MissionRunAttention;
          yield* engine.dispatch({
            type: "task.independent-review.request",
            commandId: commandId(run, task.id, `independent-review:${task.reviewSnapshot.id}`),
            taskId: task.id,
            snapshotId: task.reviewSnapshot.id,
            reviewId: TaskReviewId.make(
              `mission-run:${run.id}:task:${task.id}:review:${task.reviewSnapshot.id}`,
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
    if (missionTasks.every((task) => task.status === "completed")) {
      yield* updateRun({
        runId: run.id,
        status: "completed",
        currentReadyTaskIds: [],
        scheduledTaskIds: [],
        attention: [],
        decision: {
          id: EventId.make(`mission-run:${run.id}:completed`),
          kind: "completed",
          taskId: null,
          reason: "All Mission Tasks completed. Mission is ready for Integration.",
          sourceTaskIds: mission.taskIds,
          occurredAt: yield* now,
        },
      });
      return;
    }

    const threadById = new Map(model.threads.map((thread) => [thread.id, thread] as const));
    let attention = missionTasks.flatMap((task) =>
      task.status === "active"
        ? activeTaskAttention(task, task.threadId ? threadById.get(task.threadId) : undefined)
        : [],
    );
    for (const task of missionTasks) {
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
    const scheduling = planMissionRunScheduling({
      mission,
      run,
      tasks: missionTasks,
      project,
      providerReadyTaskIds: readyTaskIds,
      blockedTaskIds: new Set(attention.flatMap((item) => (item.taskId ? [item.taskId] : []))),
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

  const worker = yield* makeDrainableWorker((_event: OrchestrationEvent | null) =>
    reconcileAll().pipe(
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
