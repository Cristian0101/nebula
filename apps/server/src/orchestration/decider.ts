import {
  EventId,
  QualityGateRunId,
  ResourceLeaseId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";
import { computeMissionPlan, validateMissionGraph } from "@t3tools/shared/missionGraph";
import { validateArchitectPlan } from "@t3tools/shared/architectPlan";
import {
  resourceBlockers,
  validateSharedResourceDefinition,
} from "@t3tools/shared/resourceCoordination";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import {
  listThreadsByProjectId,
  listTasksByProjectId,
  requireTask,
  requireTaskAbsent,
  requireMission,
  requireMissionAbsent,
  requireActiveProjectWorkspaceRootAbsent,
  requireProject,
  requireProjectAbsent,
  requireThread,
  requireThreadArchived,
  requireThreadAbsent,
  requireThreadNotArchived,
} from "./commandInvariants.ts";
import { projectEvent } from "./projector.ts";
import { validateOwnershipRules } from "./taskOwnership.ts";
import { buildIntegrationBatch, integrationEligibility } from "./integrationPolicy.ts";

function missionContainingTask(readModel: OrchestrationReadModel, taskId: string) {
  return (readModel.missions ?? []).find((mission) =>
    mission.taskIds.some((candidate) => candidate === taskId),
  );
}

function requireMissionTaskReady(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly taskId: string;
}) {
  const mission = missionContainingTask(input.readModel, input.taskId);
  if (!mission) return Effect.void;
  if (mission.status !== "active") {
    return Effect.fail(
      new OrchestrationCommandInvariantError({
        commandType: input.command.type,
        detail: `Task '${input.taskId}' belongs to Mission '${mission.id}', which must be active before the Task can start.`,
      }),
    );
  }
  const project = input.readModel.projects.find((candidate) => candidate.id === mission.projectId);
  const plan = computeMissionPlan({
    mission,
    tasks: input.readModel.tasks ?? [],
    threads: input.readModel.threads,
    integrationBatches:
      input.readModel.projects.find((project) => project.id === mission.projectId)
        ?.integrationBatches ?? [],
    ...(project ? { project } : {}),
  });
  const taskPlan = plan.tasks.find((candidate) => candidate.task.id === input.taskId);
  return taskPlan?.status === "ready"
    ? Effect.void
    : Effect.fail(
        new OrchestrationCommandInvariantError({
          commandType: input.command.type,
          detail:
            taskPlan?.resourceBlockers
              .map(
                (blocker) =>
                  `Waiting for resource '${blocker.resource.name}', held by Task '${blocker.lease.taskId}'.`,
              )
              .join(" ") ||
            taskPlan?.blockerReasons.join(" ") ||
            taskPlan?.attention.join(" ") ||
            `Task '${input.taskId}' is not ready in Mission '${mission.id}'.`,
        }),
      );
}

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

// Session adoption takes seconds; a user message still unadopted after this
// window is a failed/stale start, not pending work. Mirrors the client's
// QUEUED_TURN_START_GRACE_MS in client-runtime threadSettled.ts.
const QUEUED_TURN_START_GRACE_MS = 2 * 60 * 1_000;

/**
 * Blocked-on-you work derived from the thread's retained activities: an
 * approval or user-input request with no later resolution for the same
 * requestId. The server-side twin of the shell's hasPendingApprovals /
 * hasPendingUserInput flags, which the decider read model does not carry.
 * The clearing rules MUST match ProjectionPipeline's pending accounting —
 * resolved activities always clear, respond.failed clears only when the
 * failure detail marks the request stale/unknown — or settle would be
 * rejected on threads whose shell flags read as clear.
 */
function isStaleRequestFailureDetail(payload: Record<string, unknown> | null): boolean {
  const detail = typeof payload?.detail === "string" ? payload.detail.toLowerCase() : null;
  if (detail === null) return false;
  return (
    detail.includes("stale pending approval request") ||
    detail.includes("unknown pending approval request") ||
    detail.includes("unknown pending permission request") ||
    detail.includes("stale pending user-input request") ||
    detail.includes("unknown pending user-input request") ||
    detail.includes("unknown pending user input request") ||
    detail.includes("unknown pending codex user input request")
  );
}

// Scans the read model's activities, which the projector caps at the most
// recent 500. That bound is safe here: an OPEN approval/user-input request
// blocks its turn, so the thread cannot accumulate hundreds of later
// activities while one is outstanding — a request that has scrolled out of
// the window is one whose turn kept running, i.e. it was resolved or went
// stale. (The projection pipeline's pendingApprovalCount reads the same
// capped stream and stays consistent with this view.)
function hasOpenBlockingRequest(thread: {
  readonly activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>;
}): boolean {
  const openRequestIds = new Set<string>();
  for (const activity of thread.activities) {
    const payload =
      typeof activity.payload === "object" && activity.payload !== null
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    if (requestId === null) continue;
    if (activity.kind === "approval.requested" || activity.kind === "user-input.requested") {
      openRequestIds.add(requestId);
    } else if (activity.kind === "approval.resolved" || activity.kind === "user-input.resolved") {
      openRequestIds.delete(requestId);
    } else if (
      (activity.kind === "provider.approval.respond.failed" ||
        activity.kind === "provider.user-input.respond.failed") &&
      isStaleRequestFailureDetail(payload)
    ) {
      openRequestIds.delete(requestId);
    }
  }
  return openRequestIds.size > 0;
}

/**
 * A queued turn start — a user message no turn has picked up yet — is work
 * in flight even though session is still null (turn.start emits
 * message-sent + turn-start-requested; the session arrives later). Detection
 * mirrors the client's hasQueuedTurnStart: the newest user message is
 * strictly newer than every latestTurn timestamp (adoption stamps the new
 * turn's requestedAt with the message time, clearing this), and only within
 * the adoption grace window — historical threads whose last user message
 * postdates their turn timestamps (older-server data, mid-turn messages)
 * must not be blocked forever. A failed session start (status "error")
 * clears the block immediately.
 *
 * The age check is bounded on BOTH sides: message timestamps are
 * client-supplied, so a client clock ahead of the server yields a negative
 * age. Without the lower bound that negative age satisfies `<= grace` for
 * as long as the skew lasts, extending the block far past the intended two
 * minutes.
 */
function threadHasQueuedTurnStart(
  thread: {
    readonly messages: ReadonlyArray<{ readonly role: string; readonly createdAt: string }>;
    readonly latestTurn: {
      readonly requestedAt: string;
      readonly startedAt: string | null;
      readonly completedAt: string | null;
    } | null;
    readonly session: { readonly status: string } | null;
  },
  occurredAt: string,
): boolean {
  const latestUserMessageAtMs = thread.messages.reduce(
    (latest, message) =>
      message.role === "user" ? Math.max(latest, Date.parse(message.createdAt)) : latest,
    Number.NEGATIVE_INFINITY,
  );
  const latestTurnAtMs =
    thread.latestTurn === null
      ? Number.NEGATIVE_INFINITY
      : Math.max(
          ...[
            thread.latestTurn.requestedAt,
            thread.latestTurn.startedAt,
            thread.latestTurn.completedAt,
          ].map((candidate) =>
            candidate == null ? Number.NEGATIVE_INFINITY : Date.parse(candidate),
          ),
        );
  const queuedAgeMs = Date.parse(occurredAt) - latestUserMessageAtMs;
  return (
    thread.session?.status !== "error" &&
    Number.isFinite(latestUserMessageAtMs) &&
    latestUserMessageAtMs > latestTurnAtMs &&
    Math.abs(queuedAgeMs) <= QUEUED_TURN_START_GRACE_MS
  );
}

function requiredQualityGateFailure(
  readModel: OrchestrationReadModel,
  task: NonNullable<OrchestrationReadModel["tasks"]>[number],
): string | null {
  const project = readModel.projects.find((candidate) => candidate.id === task.projectId);
  const required = (project?.qualityPolicy?.gates ?? []).filter(
    (gate) => gate.enabled && gate.required,
  );
  for (const gate of required) {
    const passed = (task.qualityGateRuns ?? []).some(
      (run) =>
        run.snapshotId === task.reviewSnapshot?.id &&
        run.gateId === gate.id &&
        run.command === gate.command &&
        run.status === "passed",
    );
    if (!passed) return gate.label;
  }
  return null;
}

function currentApprovedReview(task: NonNullable<OrchestrationReadModel["tasks"]>[number]) {
  return (task.reviews ?? []).findLast(
    (review) =>
      review.snapshotId === task.reviewSnapshot?.id &&
      review.status === "completed" &&
      (review.verdict === "approve" || review.verdict === "approve_with_notes"),
  );
}

function withEventBase(
  input: Pick<OrchestrationCommand, "commandId"> & {
    readonly aggregateKind: OrchestrationEvent["aggregateKind"];
    readonly aggregateId: OrchestrationEvent["aggregateId"];
    readonly occurredAt: string;
    readonly metadata?: OrchestrationEvent["metadata"];
  },
): Effect.Effect<
  Omit<OrchestrationEvent, "sequence" | "type" | "payload">,
  PlatformError.PlatformError,
  Crypto.Crypto
> {
  return Crypto.Crypto.pipe(
    Effect.flatMap((crypto) =>
      crypto.randomUUIDv4.pipe(
        Effect.map((eventId) => ({
          eventId: EventId.make(eventId),
          aggregateKind: input.aggregateKind,
          aggregateId: input.aggregateId,
          occurredAt: input.occurredAt,
          commandId: input.commandId,
          causationEventId: null,
          correlationId: input.commandId,
          metadata: input.metadata ?? {},
        })),
      ),
    ),
  );
}

type PlannedOrchestrationEvent = Omit<OrchestrationEvent, "sequence">;

type DecideOrchestrationCommandResult =
  | PlannedOrchestrationEvent
  | ReadonlyArray<PlannedOrchestrationEvent>;

const decideCommandSequence = Effect.fn("decideCommandSequence")(function* ({
  commands,
  readModel,
}: {
  readonly commands: ReadonlyArray<OrchestrationCommand>;
  readonly readModel: OrchestrationReadModel;
}): Effect.fn.Return<
  ReadonlyArray<PlannedOrchestrationEvent>,
  OrchestrationCommandInvariantError | PlatformError.PlatformError,
  Crypto.Crypto
> {
  let nextReadModel = readModel;
  let nextSequence = readModel.snapshotSequence;
  const plannedEvents: PlannedOrchestrationEvent[] = [];

  for (const nextCommand of commands) {
    const decided = yield* decideOrchestrationCommand({
      command: nextCommand,
      readModel: nextReadModel,
    });
    const nextEvents = Array.isArray(decided) ? decided : [decided];
    for (const nextEvent of nextEvents) {
      plannedEvents.push(nextEvent);
      nextSequence += 1;
      nextReadModel = yield* projectEvent(nextReadModel, {
        ...nextEvent,
        sequence: nextSequence,
      }).pipe(Effect.orDie);
    }
  }

  return plannedEvents;
});

export const decideOrchestrationCommand = Effect.fn("decideOrchestrationCommand")(function* ({
  command,
  readModel,
}: {
  readonly command: OrchestrationCommand;
  readonly readModel: OrchestrationReadModel;
}): Effect.fn.Return<
  DecideOrchestrationCommandResult,
  OrchestrationCommandInvariantError | PlatformError.PlatformError,
  Crypto.Crypto
> {
  switch (command.type) {
    case "project.create": {
      yield* requireProjectAbsent({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireActiveProjectWorkspaceRootAbsent({
        readModel,
        command,
        workspaceRoot: command.workspaceRoot,
        exceptProjectId: command.projectId,
      });

      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.created",
        payload: {
          projectId: command.projectId,
          title: command.title,
          workspaceRoot: command.workspaceRoot,
          defaultModelSelection: command.defaultModelSelection ?? null,
          faviconPath: null,
          scripts: [],
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.meta.update": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      if (command.workspaceRoot !== undefined) {
        yield* requireActiveProjectWorkspaceRootAbsent({
          readModel,
          command,
          workspaceRoot: command.workspaceRoot,
          exceptProjectId: command.projectId,
        });
      }
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.meta-updated",
        payload: {
          projectId: command.projectId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.workspaceRoot !== undefined ? { workspaceRoot: command.workspaceRoot } : {}),
          ...(command.defaultModelSelection !== undefined
            ? { defaultModelSelection: command.defaultModelSelection }
            : {}),
          ...(command.defaultThreadEnvMode !== undefined
            ? { defaultThreadEnvMode: command.defaultThreadEnvMode }
            : {}),
          ...(command.faviconPath !== undefined ? { faviconPath: command.faviconPath } : {}),
          ...(command.scripts !== undefined ? { scripts: command.scripts } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "project.quality-policy.update": {
      yield* requireProject({ readModel, command, projectId: command.projectId });
      const ids = new Set<string>();
      for (const gate of command.gates) {
        if (ids.has(gate.id)) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Quality gate id '${gate.id}' is duplicated.`,
          });
        }
        ids.add(gate.id);
        if (gate.approvedCommand !== null && gate.approvedCommand !== gate.command) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Quality gate '${gate.label}' approval does not match its command.`,
          });
        }
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.quality-policy-updated",
        payload: {
          projectId: command.projectId,
          policy: { gates: command.gates, updatedAt: command.createdAt },
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.review-policy.update": {
      yield* requireProject({ readModel, command, projectId: command.projectId });
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.review-policy-updated",
        payload: {
          projectId: command.projectId,
          policy: {
            requireIndependentReview: command.requireIndependentReview,
            preferDifferentProvider: command.preferDifferentProvider,
            updatedAt: command.createdAt,
          },
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.shared-resource.create": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if ((project.sharedResources ?? []).some((resource) => resource.id === command.resourceId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' already exists.`,
        });
      }
      const resource = {
        id: command.resourceId,
        projectId: command.projectId,
        name: command.name,
        description: command.description ?? null,
        patterns: command.patterns,
        mode: "exclusive" as const,
        enabled: true,
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
      };
      yield* Effect.try({
        try: () => validateSharedResourceDefinition(resource),
        catch: (error) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: error instanceof Error ? error.message : "Shared resource is invalid.",
          }),
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.shared-resource-created",
        payload: { projectId: command.projectId, resource },
      };
    }

    case "project.shared-resource.update": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const previous = (project.sharedResources ?? []).find(
        (resource) => resource.id === command.resourceId,
      );
      if (!previous)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' does not exist.`,
        });
      const held = (project.resourceLeases ?? []).some(
        (lease) => lease.resourceId === command.resourceId && lease.status === "held",
      );
      if (held && command.enabled === false)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' cannot be disabled while leased.`,
        });
      const resource = {
        ...previous,
        name: command.name,
        description: command.description ?? null,
        patterns: command.patterns,
        enabled: command.enabled,
        updatedAt: command.createdAt,
      };
      yield* Effect.try({
        try: () => validateSharedResourceDefinition(resource),
        catch: (error) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: error instanceof Error ? error.message : "Shared resource is invalid.",
          }),
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.shared-resource-updated",
        payload: { projectId: command.projectId, resource },
      };
    }

    case "project.shared-resource.delete": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (!(project.sharedResources ?? []).some((resource) => resource.id === command.resourceId))
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' does not exist.`,
        });
      if (
        (project.resourceLeases ?? []).some(
          (lease) => lease.resourceId === command.resourceId && lease.status === "held",
        )
      )
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' cannot be deleted while leased.`,
        });
      if (
        (readModel.tasks ?? []).some(
          (task) =>
            task.projectId === command.projectId &&
            (task.requiredResourceIds ?? []).includes(command.resourceId),
        )
      )
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Shared resource '${command.resourceId}' is still required by a Task.`,
        });
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "project.shared-resource-deleted",
        payload: {
          projectId: command.projectId,
          resourceId: command.resourceId,
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.resource-leases.reconcile": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const terminalTaskIds = new Set(
        (readModel.tasks ?? [])
          .filter(
            (task) =>
              task.projectId === project.id &&
              (task.status === "completed" || task.status === "cancelled"),
          )
          .map((task) => task.id),
      );
      const staleLeases = (project.resourceLeases ?? [])
        .filter((lease) => lease.status === "held" && terminalTaskIds.has(lease.taskId))
        .map((lease) => ({ ...lease, status: "released" as const, releasedAt: command.createdAt }));
      if (staleLeases.length === 0)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Project '${project.id}' has no terminal Task leases to reconcile.`,
        });
      const events = [];
      for (const taskId of new Set(staleLeases.map((lease) => lease.taskId))) {
        const leases = staleLeases.filter((lease) => lease.taskId === taskId);
        events.push({
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: project.id,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "resource.leases-released" as const,
          payload: {
            projectId: project.id,
            taskId,
            leases,
            updatedAt: command.createdAt,
          },
        });
      }
      return events;
    }

    case "project.delete": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const activeThreads = listThreadsByProjectId(readModel, command.projectId).filter(
        (thread) => thread.deletedAt === null,
      );
      const nonTerminalTasks = listTasksByProjectId(readModel, command.projectId).filter(
        (task) => task.status === "draft" || task.status === "active",
      );
      if ((activeThreads.length > 0 || nonTerminalTasks.length > 0) && command.force !== true) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Project '${command.projectId}' is not empty and cannot be deleted without force=true.`,
        });
      }
      if (activeThreads.length > 0 || nonTerminalTasks.length > 0) {
        const cancelledAt = yield* nowIso;
        return yield* decideCommandSequence({
          readModel,
          commands: [
            ...nonTerminalTasks.map(
              (task): Extract<OrchestrationCommand, { type: "task.cancel" }> => ({
                type: "task.cancel",
                commandId: command.commandId,
                taskId: task.id,
                createdAt: cancelledAt,
              }),
            ),
            ...activeThreads.map(
              (thread): Extract<OrchestrationCommand, { type: "thread.delete" }> => ({
                type: "thread.delete",
                commandId: command.commandId,
                threadId: thread.id,
              }),
            ),
            {
              type: "project.delete",
              commandId: command.commandId,
              projectId: command.projectId,
            },
          ],
        });
      }

      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.deleted" as const,
        payload: {
          projectId: command.projectId,
          deletedAt: occurredAt,
        },
      };
    }

    case "architect.plan.generate": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (project.deletedAt !== null)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Architect planning requires an active Project.",
        });
      if ((project.architectPlans ?? []).some((plan) => plan.id === command.proposalId))
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Architect Plan ID already exists.",
        });
      const selection = {
        instanceId: command.modelSelection.instanceId,
        model: command.modelSelection.model,
        ...(command.modelSelection.options !== undefined
          ? { options: command.modelSelection.options }
          : {}),
      };
      const plan = {
        id: command.proposalId,
        projectId: project.id,
        status: "generating" as const,
        objective: command.objective,
        constraints: command.constraints ?? null,
        planningBaseCommit: "pending",
        observedHeadCommit: null,
        architectProviderInstanceId: selection.instanceId,
        architectModelSelection: selection,
        contextFingerprint: "pending",
        contextPaths: command.contextPaths ?? [],
        resourcePolicyFingerprint: "pending",
        proposal: null,
        validation: null,
        revisions: [],
        materializedMissionId: null,
        failureReason: null,
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
        resolvedAt: null,
      };
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: project.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "architect.plan-saved" as const,
        payload: { projectId: project.id, plan },
      };
    }

    case "architect.plan.save": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (project.deletedAt !== null || command.plan.projectId !== project.id) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Architect Plans must belong to an active Project.",
        });
      }
      const existing = (project.architectPlans ?? []).find((plan) => plan.id === command.plan.id);
      if (existing?.status === "approved" || existing?.status === "rejected") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Resolved Architect Plans are immutable.",
        });
      }
      if (command.plan.proposal !== null) {
        const validation = validateArchitectPlan({
          proposal: command.plan.proposal,
          planningBaseCommit: command.plan.planningBaseCommit,
          resources: project.sharedResources ?? [],
          validatedAt: command.createdAt,
        });
        const supplied = command.plan.validation;
        if (
          !supplied ||
          JSON.stringify({ ...validation, validatedAt: null }) !==
            JSON.stringify({ ...supplied, validatedAt: null })
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: "Architect Plan validation is stale. Revalidate before saving.",
          });
        }
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: project.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "architect.plan-saved" as const,
        payload: { projectId: project.id, plan: command.plan },
      };
    }

    case "architect.plan.reject": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const plan = (project.architectPlans ?? []).find(
        (candidate) => candidate.id === command.proposalId,
      );
      if (!plan)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Architect Plan not found.",
        });
      if (plan.status === "approved")
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "An approved Architect Plan cannot be rejected.",
        });
      const rejected = {
        ...plan,
        status: "rejected" as const,
        updatedAt: command.createdAt,
        resolvedAt: command.createdAt,
      };
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: project.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "architect.plan-rejected" as const,
        payload: { projectId: project.id, plan: rejected },
      };
    }

    case "architect.plan.approve": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const plan = (project.architectPlans ?? []).find(
        (candidate) => candidate.id === command.proposalId,
      );
      if (!plan || !plan.proposal)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Ready Architect Plan not found.",
        });
      if (plan.status === "approved") {
        return {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: project.id,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "architect.plan-approved" as const,
          payload: { projectId: project.id, plan },
        };
      }
      const validation = validateArchitectPlan({
        proposal: plan.proposal,
        planningBaseCommit: plan.planningBaseCommit,
        resources: project.sharedResources ?? [],
        validatedAt: command.createdAt,
      });
      if (validation.errors.length > 0)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: validation.errors.map((entry) => entry.message).join(" "),
        });
      if (validation.warnings.length > 0 && !command.acknowledgeWarnings)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Acknowledge Architect Plan warnings before approval.",
        });
      if (plan.proposal.tasks.some((task) => !task.assignedModelSelection))
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Every proposed Task requires a human-confirmed provider and model assignment.",
        });
      const taskIds = new Map(command.tasks.map((task) => [task.key, task.taskId] as const));
      if (
        taskIds.size !== plan.proposal.tasks.length ||
        plan.proposal.tasks.some((task) => !taskIds.has(task.key))
      )
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Materialization must provide exactly one canonical Task ID per proposed Task.",
        });
      const commands: OrchestrationCommand[] = [
        {
          type: "mission.create",
          commandId: command.commandId,
          missionId: command.missionId,
          projectId: project.id,
          title: plan.proposal.title,
          objective: plan.proposal.objective,
          description: plan.proposal.description ?? null,
          baseCommit: plan.planningBaseCommit,
          architectPlanProposalId: plan.id,
          createdAt: command.createdAt,
        },
      ];
      for (const task of plan.proposal.tasks) {
        const taskId = taskIds.get(task.key)!;
        const assigned = task.assignedModelSelection!;
        commands.push({
          type: "task.create",
          commandId: command.commandId,
          taskId,
          projectId: project.id,
          title: task.title,
          objective: task.objective,
          role: "builder",
          modelSelection: {
            instanceId: assigned.instanceId,
            model: assigned.model,
            ...(assigned.options !== undefined ? { options: assigned.options } : {}),
          },
          acceptanceCriteria: task.acceptanceCriteria,
          requiredResourceIds: task.requiredResourceIds,
          createdAt: command.createdAt,
        });
        commands.push({
          type: "task.ownership.set",
          commandId: command.commandId,
          taskId,
          rules: [
            ...task.ownership.write.map((pattern, index) => ({
              id: `architect:${task.key}:write:${index}`,
              pattern,
              access: "write" as const,
              reason: "Approved Architect Plan",
              createdAt: command.createdAt,
            })),
            ...task.ownership.read.map((pattern, index) => ({
              id: `architect:${task.key}:read:${index}`,
              pattern,
              access: "read" as const,
              reason: "Approved Architect Plan",
              createdAt: command.createdAt,
            })),
            ...task.ownership.deny.map((pattern, index) => ({
              id: `architect:${task.key}:deny:${index}`,
              pattern,
              access: "deny" as const,
              reason: "Approved Architect Plan",
              createdAt: command.createdAt,
            })),
          ],
          createdAt: command.createdAt,
        });
        commands.push({
          type: "mission.task.add",
          commandId: command.commandId,
          missionId: command.missionId,
          projectId: project.id,
          taskId,
          createdAt: command.createdAt,
        });
      }
      for (const edge of plan.proposal.dependencies)
        commands.push({
          type: "mission.dependency.add",
          commandId: command.commandId,
          missionId: command.missionId,
          projectId: project.id,
          prerequisiteTaskId: taskIds.get(edge.prerequisiteKey)!,
          dependentTaskId: taskIds.get(edge.dependentKey)!,
          createdAt: command.createdAt,
        });
      const events = yield* decideCommandSequence({ readModel, commands });
      const approved = {
        ...plan,
        status: "approved" as const,
        validation,
        materializedMissionId: command.missionId,
        updatedAt: command.createdAt,
        resolvedAt: command.createdAt,
      };
      return [
        ...events,
        {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: project.id,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "architect.plan-approved" as const,
          payload: { projectId: project.id, plan: approved },
        },
      ];
    }

    case "mission.create": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (project.deletedAt !== null) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission '${command.missionId}' cannot be created in a deleted Project.`,
        });
      }
      yield* requireMissionAbsent({ readModel, command, missionId: command.missionId });
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: command.missionId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.created" as const,
        payload: {
          missionId: command.missionId,
          projectId: command.projectId,
          title: command.title,
          objective: command.objective,
          description: command.description ?? null,
          baseCommit: command.baseCommit ?? null,
          architectPlanProposalId: command.architectPlanProposalId ?? null,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.update": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      if (
        mission.projectId !== command.projectId ||
        mission.status === "completed" ||
        mission.status === "cancelled"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only a draft or active Mission in Project '${command.projectId}' can be edited.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.updated" as const,
        payload: {
          missionId: mission.id,
          title: command.title,
          objective: command.objective,
          description: command.description ?? null,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.task.add": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (mission.projectId !== command.projectId || task.projectId !== mission.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Mission Tasks must belong to the same Project.",
        });
      }
      const existingMission = missionContainingTask(readModel, task.id);
      if (existingMission) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${task.id}' already belongs to Mission '${existingMission.id}'.`,
        });
      }
      if (
        !["draft", "active"].includes(mission.status) ||
        task.status === "active" ||
        task.status === "cancelled" ||
        (mission.status === "active" && task.status !== "draft")
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail:
            "Only an eligible draft Task can be added to an active Mission; draft Missions may also retain completed Tasks.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.task-added" as const,
        payload: {
          missionId: mission.id,
          taskId: task.id,
          position: mission.taskIds.length,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.task.remove": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (mission.projectId !== command.projectId || !mission.taskIds.includes(task.id)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${task.id}' is not in this Mission.`,
        });
      }
      if (!["draft", "active"].includes(mission.status) || task.status !== "draft") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "A started or terminal Task cannot be removed from its Mission.",
        });
      }
      if (mission.status === "active" && command.confirmActiveEdit !== true) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Editing an active Mission requires explicit confirmation.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.task-removed" as const,
        payload: {
          missionId: mission.id,
          taskId: task.id,
          position: mission.taskIds.indexOf(task.id),
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.tasks.reorder": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const current = new Set(mission.taskIds);
      if (
        mission.projectId !== command.projectId ||
        command.taskIds.length !== current.size ||
        new Set(command.taskIds).size !== current.size ||
        command.taskIds.some((taskId) => !current.has(taskId))
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Mission reorder must contain every member Task exactly once.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.tasks-reordered" as const,
        payload: { missionId: mission.id, taskIds: command.taskIds, updatedAt: command.createdAt },
      };
    }

    case "mission.dependency.add": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      if (
        mission.projectId !== command.projectId ||
        !mission.taskIds.includes(command.prerequisiteTaskId) ||
        !mission.taskIds.includes(command.dependentTaskId)
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Both dependency Tasks must belong to this Mission.",
        });
      }
      const dependent = yield* requireTask({ readModel, command, taskId: command.dependentTaskId });
      if (!["draft", "active"].includes(mission.status) || dependent.status !== "draft") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "A new prerequisite cannot be added to a started or terminal Task.",
        });
      }
      if (mission.status === "active" && command.confirmActiveEdit !== true) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Editing an active Mission requires explicit confirmation.",
        });
      }
      const edge = {
        missionId: mission.id,
        prerequisiteTaskId: command.prerequisiteTaskId,
        dependentTaskId: command.dependentTaskId,
        createdAt: command.createdAt,
      };
      const validation = validateMissionGraph(mission.taskIds, [...mission.dependencies, edge]);
      if (!validation.valid) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: validation.error ?? "Invalid Mission dependency.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.dependency-added" as const,
        payload: { ...edge, updatedAt: command.createdAt },
      };
    }

    case "mission.dependency.remove": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const edge = mission.dependencies.find(
        (candidate) =>
          candidate.prerequisiteTaskId === command.prerequisiteTaskId &&
          candidate.dependentTaskId === command.dependentTaskId,
      );
      const prerequisite = (readModel.tasks ?? []).find(
        (task) => task.id === command.prerequisiteTaskId,
      );
      const dependent = (readModel.tasks ?? []).find((task) => task.id === command.dependentTaskId);
      if (mission.projectId !== command.projectId || !edge) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Mission dependency does not exist.",
        });
      }
      if (
        !["draft", "active"].includes(mission.status) ||
        (mission.status === "active" &&
          (prerequisite?.status !== "draft" || dependent?.status !== "draft"))
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Dependencies involving started work cannot be removed from an active Mission.",
        });
      }
      if (mission.status === "active" && command.confirmActiveEdit !== true) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Editing an active Mission requires explicit confirmation.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.dependency-removed" as const,
        payload: { ...edge, updatedAt: command.createdAt },
      };
    }

    case "mission.activate": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const validation = validateMissionGraph(mission.taskIds, mission.dependencies);
      if (
        mission.projectId !== command.projectId ||
        mission.status !== "draft" ||
        mission.taskIds.length === 0 ||
        !validation.valid
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail:
            validation.error ??
            "Activation requires a draft Mission with at least one Task and a valid DAG.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.activated" as const,
        payload: {
          missionId: mission.id,
          occurredAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.complete": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const plan = computeMissionPlan({
        mission,
        tasks: readModel.tasks ?? [],
        threads: readModel.threads,
        integrationBatches: project.integrationBatches ?? [],
      });
      if (
        mission.status !== "active" ||
        mission.projectId !== project.id ||
        !plan.completionEligible
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail:
            "Mission completion requires every non-cancelled Task to be completed and any linked Integration Batch to be ready.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.completed" as const,
        payload: {
          missionId: mission.id,
          occurredAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.cancel": {
      const mission = yield* requireMission({ readModel, command, missionId: command.missionId });
      if (
        mission.projectId !== command.projectId ||
        mission.status === "completed" ||
        mission.status === "cancelled"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Only a draft or active Mission can be cancelled.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.cancelled" as const,
        payload: {
          missionId: mission.id,
          occurredAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "mission.run.start": {
      const mission = yield* requireMission({
        readModel,
        command,
        missionId: command.missionId,
      });
      const project = yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      if (mission.projectId !== command.projectId || mission.status !== "active") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission '${mission.id}' must be active in Project '${command.projectId}' before a supervised Run starts.`,
        });
      }
      const proposal = mission.architectPlanProposalId
        ? (project.architectPlans ?? []).find(
            (candidate) => candidate.id === mission.architectPlanProposalId,
          )
        : null;
      if (!proposal || proposal.status !== "approved") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission '${mission.id}' must be materialized from an approved Architect plan before supervised execution.`,
        });
      }
      const graph = validateMissionGraph(mission.taskIds, mission.dependencies);
      if (!graph.valid || mission.taskIds.length === 0) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: graph.error ?? "A supervised Mission Run requires a non-empty valid DAG.",
        });
      }
      const taskById = new Map((readModel.tasks ?? []).map((task) => [task.id, task] as const));
      const invalidTaskId = mission.taskIds.find((taskId) => {
        const task = taskById.get(taskId);
        return !task || task.projectId !== mission.projectId || task.status === "cancelled";
      });
      if (invalidTaskId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission Task '${invalidTaskId}' is missing, cancelled, or belongs to another Project.`,
        });
      }
      const existing = (readModel.missionRuns ?? []).find(
        (run) =>
          run.missionId === mission.id &&
          run.status !== "completed" &&
          run.status !== "stopped" &&
          run.status !== "failed",
      );
      if (existing) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission '${mission.id}' already has an active supervised Run '${existing.id}'.`,
        });
      }
      if ((readModel.missionRuns ?? []).some((run) => run.id === command.runId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission Run '${command.runId}' already exists.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: mission.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.run.started" as const,
        payload: {
          run: {
            id: command.runId,
            missionId: mission.id,
            projectId: mission.projectId,
            mode: "supervised_swarm" as const,
            status: "running" as const,
            maxConcurrentTasks: command.maxConcurrentTasks,
            currentReadyTaskIds: [],
            scheduledTaskIds: [],
            attention: [],
            attentionReason: null,
            decisions: [],
            startedAt: command.createdAt,
            pausedAt: null,
            completedAt: null,
            stoppedAt: null,
            failedAt: null,
            failureReason: null,
            recoveryPolicy: {
              transportRetryLimit: command.transportRetryLimit ?? 2,
              remediationLimit: command.remediationLimit ?? 2,
              routingProfile:
                command.routingProfile ??
                mission.routingProfile ??
                project.routingProfile ??
                "manual_only",
            },
            taskRecovery: [],
            routingDecisions: [],
            coordinationRequests: [],
            replanProposals: [],
            swarmPolicy: {
              revision: 1,
              maxConcurrentTasks: command.maxConcurrentTasks,
              routingProfile:
                command.routingProfile ??
                mission.routingProfile ??
                project.routingProfile ??
                "manual_only",
              transportRetryLimit: command.transportRetryLimit ?? 2,
              remediationLimit: command.remediationLimit ?? 2,
              autoIntegration: command.autoIntegration ?? false,
              stopOnConflict: command.stopOnConflict ?? true,
              independentReviewRequired:
                command.independentReviewRequired ??
                project.reviewPolicy?.requireIndependentReview ??
                true,
              preapprovedOverlapPaths: command.preapprovedOverlapPaths ?? [],
              autoCompleteMission: command.autoCompleteMission ?? false,
              qualityPolicy: project.qualityPolicy ?? null,
              reviewPolicy: project.reviewPolicy ?? null,
              frozenAt: command.createdAt,
            },
            integrationBatchId: null,
            finalReport: null,
            updatedAt: command.createdAt,
          },
        },
      };
    }

    case "mission.run.pause":
    case "mission.run.resume":
    case "mission.run.stop": {
      const run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === command.runId);
      if (!run) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission Run '${command.runId}' does not exist.`,
        });
      }
      const allowed =
        command.type === "mission.run.pause"
          ? run.status === "running" || run.status === "attention"
          : command.type === "mission.run.resume"
            ? run.status === "paused" || run.status === "attention"
            : run.status === "running" || run.status === "paused" || run.status === "attention";
      if (!allowed) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission Run '${run.id}' cannot ${command.type.split(".").at(-1)} from '${run.status}'.`,
        });
      }
      const status =
        command.type === "mission.run.pause"
          ? ("paused" as const)
          : command.type === "mission.run.resume"
            ? ("running" as const)
            : ("stopped" as const);
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: run.missionId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type:
          command.type === "mission.run.pause"
            ? ("mission.run.paused" as const)
            : command.type === "mission.run.resume"
              ? ("mission.run.resumed" as const)
              : ("mission.run.stopped" as const),
        payload: {
          run: {
            ...run,
            status,
            pausedAt: status === "paused" ? command.createdAt : run.pausedAt,
            stoppedAt: status === "stopped" ? command.createdAt : run.stoppedAt,
            attention: status === "running" ? [] : run.attention,
            attentionReason: status === "running" ? null : run.attentionReason,
            updatedAt: command.createdAt,
          },
        },
      };
    }

    case "mission.run.reconcile": {
      const run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === command.runId);
      if (
        !run ||
        run.status === "completed" ||
        run.status === "stopped" ||
        run.status === "failed"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Mission Run '${command.runId}' is not reconcilable.`,
        });
      }
      if (
        run.status === "paused" &&
        command.status !== "completed" &&
        command.status !== "failed"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Paused Mission Run '${run.id}' may only reconcile terminal state.`,
        });
      }
      const decision = command.decision ?? null;
      const decisions =
        decision && !run.decisions.some((candidate) => candidate.id === decision.id)
          ? [...run.decisions, decision]
          : run.decisions;
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: run.missionId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.run.reconciled" as const,
        payload: {
          run: {
            ...run,
            status: command.status,
            currentReadyTaskIds: command.currentReadyTaskIds,
            scheduledTaskIds: command.scheduledTaskIds,
            attention: command.attention,
            attentionReason: command.attentionReason,
            decisions,
            completedAt: command.completedAt,
            failedAt: command.status === "failed" ? command.createdAt : run.failedAt,
            failureReason: command.failureReason,
            taskRecovery: command.taskRecovery ?? run.taskRecovery ?? [],
            routingDecisions: command.routingDecisions ?? run.routingDecisions ?? [],
            coordinationRequests: command.coordinationRequests ?? run.coordinationRequests ?? [],
            replanProposals: command.replanProposals ?? run.replanProposals ?? [],
            integrationBatchId: command.integrationBatchId ?? run.integrationBatchId ?? null,
            finalReport: command.finalReport ?? run.finalReport ?? null,
            updatedAt: command.createdAt,
          },
        },
      };
    }

    case "mission.run.coordination-request.resolve": {
      const run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === command.runId);
      const request = run?.coordinationRequests?.find(
        (candidate) => candidate.id === command.requestId,
      );
      if (!run || !request || request.status !== "pending") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Coordination Request '${command.requestId}' is not pending.`,
        });
      }
      if (command.resolution === "answered" && !command.answer?.trim()) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "A contract or dependency answer must include deterministic human input.",
        });
      }
      const updatedRequest = {
        ...request,
        status: command.resolution,
        answer:
          command.answer ??
          (command.resolution === "approved" ? "Approved by human review." : null),
        resolvedAt: command.createdAt,
      };
      const runEvent = {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: run.missionId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.run.reconciled" as const,
        payload: {
          run: {
            ...run,
            coordinationRequests: (run.coordinationRequests ?? []).map((candidate) =>
              candidate.id === request.id ? updatedRequest : candidate,
            ),
            updatedAt: command.createdAt,
          },
        },
      };
      if (
        command.resolution !== "approved" ||
        request.kind !== "resource_request" ||
        request.resourceId === null
      )
        return runEvent;
      const task = yield* requireTask({ readModel, command, taskId: request.taskId });
      const resourceIds = [...new Set([...(task.requiredResourceIds ?? []), request.resourceId])];
      const resourceEvents = yield* decideCommandSequence({
        readModel,
        commands: [
          {
            type: "task.resource-requirements.set",
            commandId: command.commandId,
            taskId: task.id,
            resourceIds,
            confirmActiveChange: true,
            createdAt: command.createdAt,
          },
        ],
      });
      return [...resourceEvents, runEvent];
    }

    case "mission.run.replan.resolve": {
      const run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === command.runId);
      const proposal = run?.replanProposals?.find(
        (candidate) => candidate.id === command.proposalId,
      );
      if (!run || !proposal || proposal.status !== "pending") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Replan Proposal '${command.proposalId}' is not pending.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "mission",
          aggregateId: run.missionId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "mission.run.reconciled" as const,
        payload: {
          run: {
            ...run,
            replanProposals: (run.replanProposals ?? []).map((candidate) =>
              candidate.id === proposal.id
                ? { ...candidate, status: command.resolution, resolvedAt: command.createdAt }
                : candidate,
            ),
            updatedAt: command.createdAt,
          },
        },
      };
    }

    case "integration.create": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const mission = command.missionId
        ? yield* requireMission({ readModel, command, missionId: command.missionId })
        : null;
      const linkedBatch = mission?.integrationBatchId
        ? (project.integrationBatches ?? []).find(
            (batch) => batch.id === mission.integrationBatchId,
          )
        : null;
      const mayReplaceLinkedBatch =
        linkedBatch?.status === "failed" || linkedBatch?.status === "cancelled";
      if (
        mission &&
        (mission.projectId !== project.id ||
          (mission.integrationBatchId !== null && !mayReplaceLinkedBatch) ||
          command.taskIds.some((taskId) => !mission.taskIds.includes(taskId)))
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail:
            "A Mission Integration Batch must use completed member Tasks and may replace only a failed or cancelled linked Batch.",
        });
      }
      if ((project.integrationBatches ?? []).some((batch) => batch.id === command.batchId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Integration Batch '${command.batchId}' already exists.`,
        });
      }
      if (
        command.taskIds.length === 0 ||
        new Set(command.taskIds).size !== command.taskIds.length
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Select at least one unique completed Task.",
        });
      }
      const tasks = command.taskIds.map((taskId) =>
        (readModel.tasks ?? []).find((candidate) => candidate.id === taskId),
      );
      if (tasks.some((task) => task === undefined)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Every selected Task must exist.",
        });
      }
      for (const task of tasks) {
        const eligibility = integrationEligibility(project, task!);
        if (!eligibility.eligible) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${task!.id}' is ineligible: ${eligibility.reasons.join(" ")}`,
          });
        }
      }
      const builtBatch = yield* Effect.try({
        try: () =>
          buildIntegrationBatch({
            project,
            batchId: command.batchId,
            taskIds: command.taskIds,
            tasks: tasks.filter((task) => task !== undefined),
            acknowledgeOverlaps: command.acknowledgeOverlaps,
            createdAt: command.createdAt,
          }),
        catch: (cause) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: cause instanceof Error ? cause.message : "Invalid Integration Batch.",
          }),
      });
      const batch = { ...builtBatch, missionId: mission?.id ?? null };
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "integration.created" as const,
        payload: { projectId: command.projectId, batch },
      };
    }

    case "integration.continue":
    case "integration.abort":
    case "integration.validate":
    case "integration.workspace.remove": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const batch = (project.integrationBatches ?? []).find(
        (candidate) => candidate.id === command.batchId,
      );
      if (batch === undefined) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Integration Batch '${command.batchId}' does not exist.`,
        });
      }
      if (command.type === "integration.continue" && batch.status !== "conflict") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Only a conflicted Integration Batch can continue.",
        });
      }
      if (
        command.type === "integration.abort" &&
        !["preparing", "applying", "conflict", "validating"].includes(batch.status)
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Only an active Integration Batch can be aborted.",
        });
      }
      if (
        command.type === "integration.workspace.remove" &&
        !["ready", "failed", "cancelled"].includes(batch.status)
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Integration workspace cleanup requires a terminal Batch.",
        });
      }
      const eventType =
        command.type === "integration.continue"
          ? "integration.continue-requested"
          : command.type === "integration.abort"
            ? "integration.abort-requested"
            : command.type === "integration.validate"
              ? "integration.validation-requested"
              : "integration.workspace-remove-requested";
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: eventType,
        payload: {
          projectId: command.projectId,
          batchId: command.batchId,
          ...(command.type === "integration.validate"
            ? { acknowledgeExternalChanges: command.acknowledgeExternalChanges ?? false }
            : {}),
          requestedAt: command.createdAt,
        },
      } as PlannedOrchestrationEvent;
    }

    case "integration.update": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (!(project.integrationBatches ?? []).some((batch) => batch.id === command.batch.id)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Integration Batch '${command.batch.id}' does not exist.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "integration.updated" as const,
        payload: { projectId: command.projectId, batch: command.batch, reason: command.reason },
      };
    }

    case "task.create": {
      const project = yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      if (project.deletedAt !== null) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' cannot be created in deleted project '${command.projectId}'.`,
        });
      }
      yield* requireTaskAbsent({ readModel, command, taskId: command.taskId });
      const projectReviewPolicy = project.reviewPolicy;
      const requiredResourceIds = command.requiredResourceIds ?? [];
      const enabledResourceIds = new Set(
        (project.sharedResources ?? [])
          .filter((resource) => resource.enabled)
          .map((resource) => resource.id),
      );
      const missingResourceId = requiredResourceIds.find(
        (resourceId) => !enabledResourceIds.has(resourceId),
      );
      if (missingResourceId)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Required shared resource '${missingResourceId}' is missing or disabled.`,
        });
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.created",
        payload: {
          taskId: command.taskId,
          projectId: command.projectId,
          title: command.title,
          objective: command.objective,
          role: command.role,
          modelSelection: command.modelSelection ?? null,
          acceptanceCriteria: command.acceptanceCriteria ?? [],
          reviewRequired:
            command.reviewRequired ??
            (command.role === "builder"
              ? (projectReviewPolicy?.requireIndependentReview ?? true)
              : false),
          preferDifferentReviewerProvider:
            command.preferDifferentReviewerProvider ??
            projectReviewPolicy?.preferDifferentProvider ??
            true,
          ownershipRequired: command.role === "builder",
          requiredResourceIds,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.acceptance-criteria.set": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status === "completed" || task.status === "cancelled") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Terminal Task '${command.taskId}' acceptance criteria cannot be changed.`,
        });
      }
      if (task.status !== "draft" && command.confirmStartedTaskChange !== true) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Changing acceptance criteria after Task execution starts requires explicit confirmation.`,
        });
      }
      const updated = {
        ...(yield* withEventBase({
          aggregateKind: "task" as const,
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.acceptance-criteria-updated" as const,
        payload: {
          taskId: command.taskId,
          criteria: command.criteria,
          updatedAt: command.createdAt,
        },
      };
      if (!task.reviewSnapshot) return updated;
      return [
        updated,
        {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: command.taskId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.review.stale" as const,
          payload: { taskId: command.taskId, updatedAt: command.createdAt },
        },
      ];
    }

    case "task.bind-thread": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const replacing = command.replaceProviderExecution === true;
      if (task.status !== "draft" && !(replacing && task.status === "active")) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' must be draft, or active during a supervised provider replacement, before binding a thread.`,
        });
      }
      if (task.threadId !== null && !replacing) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' already has a primary thread.`,
        });
      }
      const thread = yield* requireThread({ readModel, command, threadId: command.threadId });
      if (thread.deletedAt !== null || thread.projectId !== task.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Thread '${command.threadId}' is not an active thread in Task project '${task.projectId}'.`,
        });
      }
      const existingBinding = (readModel.tasks ?? []).find(
        (candidate) => candidate.id !== task.id && candidate.threadId === command.threadId,
      );
      if (existingBinding !== undefined) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Thread '${command.threadId}' is already bound to Task '${existingBinding.id}'.`,
        });
      }
      if (replacing && (task.threadId === null || task.threadId === command.threadId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Provider replacement for Task '${command.taskId}' requires a distinct new execution Thread.`,
        });
      }
      if (
        command.modelSelection &&
        (thread.modelSelection.instanceId !== command.modelSelection.instanceId ||
          thread.modelSelection.model !== command.modelSelection.model)
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Replacement assignment must match Thread '${command.threadId}' provider selection.`,
        });
      }
      if (task.role === "builder") {
        if (
          task.ownership?.required === true &&
          !task.ownership.rules.some((rule) => rule.access === "write")
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Builder Task '${command.taskId}' requires explicit write ownership before binding a thread.`,
          });
        }
        if (task.workspace?.status !== "ready" || task.workspace.path === null) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Builder Task '${command.taskId}' requires a ready isolated workspace before binding a thread.`,
          });
        }
        if (
          thread.worktreePath !== task.workspace.path ||
          thread.branch !== task.workspace.branch
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Thread '${command.threadId}' does not match Task '${command.taskId}' workspace identity.`,
          });
        }
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.thread-bound",
        payload: {
          taskId: command.taskId,
          threadId: command.threadId,
          previousThreadId: task.threadId,
          ...(command.modelSelection ? { modelSelection: command.modelSelection } : {}),
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.activate": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      yield* requireMissionTaskReady({ readModel, command, taskId: command.taskId });
      if (task.status !== "draft" || task.threadId === null) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' must be draft with a bound thread before activation.`,
        });
      }
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      const thread = yield* requireThread({ readModel, command, threadId: task.threadId });
      if (
        project.deletedAt !== null ||
        thread.deletedAt !== null ||
        thread.projectId !== task.projectId
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' no longer has valid project and thread execution context.`,
        });
      }
      if (task.role === "builder") {
        if (
          task.ownership?.required === true &&
          !task.ownership.rules.some((rule) => rule.access === "write")
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Builder Task '${command.taskId}' requires explicit write ownership before activation.`,
          });
        }
        if (
          task.workspace?.status !== "ready" ||
          task.workspace.path === null ||
          thread.worktreePath !== task.workspace.path ||
          thread.branch !== task.workspace.branch
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Builder Task '${command.taskId}' cannot activate outside its ready isolated workspace.`,
          });
        }
        const conflictingTask = (readModel.tasks ?? []).find(
          (candidate) =>
            candidate.id !== task.id &&
            (candidate.status === "draft" || candidate.status === "active") &&
            candidate.workspace?.path === task.workspace?.path,
        );
        if (conflictingTask !== undefined) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task workspace '${task.workspace.path}' is already owned by Task '${conflictingTask.id}'.`,
          });
        }
      }
      const requiredIds = task.requiredResourceIds ?? [];
      const resourceById = new Map(
        (project.sharedResources ?? []).map((resource) => [resource.id, resource]),
      );
      const missing = requiredIds.find(
        (resourceId) => resourceById.get(resourceId)?.enabled !== true,
      );
      if (missing)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Required shared resource '${missing}' is missing or disabled.`,
        });
      const blockers = resourceBlockers({
        task,
        resources: project.sharedResources ?? [],
        leases: project.resourceLeases ?? [],
      });
      if (blockers.length > 0) {
        const blocker = blockers[0]!;
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Waiting for resource '${blocker.resource.name}', held by Task '${blocker.lease.taskId}'.`,
        });
      }
      const leases = [];
      for (const resourceId of requiredIds) {
        const id = yield* Crypto.Crypto.pipe(Effect.flatMap((crypto) => crypto.randomUUIDv4));
        leases.push({
          id: ResourceLeaseId.make(id),
          projectId: task.projectId,
          resourceId,
          taskId: task.id,
          status: "held" as const,
          acquiredAt: command.createdAt,
          releasedAt: null,
        });
      }
      const activated = {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.activated" as const,
        payload: {
          taskId: command.taskId,
          activatedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      if (leases.length === 0) return activated;
      return [
        {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: task.projectId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "resource.leases-acquired" as const,
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            leases,
            updatedAt: command.createdAt,
          },
        },
        activated,
      ];
    }

    case "task.complete": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status !== "active") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only an active Task can be completed; '${command.taskId}' is '${task.status}'.`,
        });
      }
      if (task.ownership?.required === true) {
        if (
          task.workspace?.status !== "ready" ||
          task.workspace.path === null ||
          task.workspace.baseCommit === null ||
          task.workspace.branch === null
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${command.taskId}' requires a ready managed workspace before completion.`,
          });
        }
        if (
          task.reviewSnapshot?.status !== "current" ||
          task.handoff?.status !== "ready" ||
          task.handoff.snapshotId !== task.reviewSnapshot.id
        ) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${command.taskId}' requires a current review snapshot and ready handoff before completion.`,
          });
        }
        const failedGate = requiredQualityGateFailure(readModel, task);
        if (failedGate !== null) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${command.taskId}' requires quality gate '${failedGate}' to pass for the current snapshot.`,
          });
        }
        if (task.reviewRequired === true && !currentApprovedReview(task)) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${command.taskId}' requires an approved independent review for the current snapshot.`,
          });
        }
        if (!task.ownership.rules.some((rule) => rule.access === "write")) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Task '${command.taskId}' has no configured write ownership.`,
          });
        }
        return {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: command.taskId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.ownership-validation-requested",
          payload: {
            taskId: command.taskId,
            requestCompletion: true,
            updatedAt: command.createdAt,
          },
        };
      }
      const completed = {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.completed" as const,
        payload: {
          taskId: command.taskId,
          completedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      const leases = (project.resourceLeases ?? [])
        .filter((lease) => lease.taskId === task.id && lease.status === "held")
        .map((lease) => ({ ...lease, status: "released" as const, releasedAt: command.createdAt }));
      if (leases.length === 0) return completed;
      return [
        completed,
        {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: task.projectId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "resource.leases-released" as const,
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            leases,
            updatedAt: command.createdAt,
          },
        },
      ];
    }

    case "task.cancel": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status === "completed" || task.status === "cancelled") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Terminal Task '${command.taskId}' cannot be cancelled.`,
        });
      }
      const cancelled = {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.cancelled" as const,
        payload: {
          taskId: command.taskId,
          cancelledAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      const leases = (project.resourceLeases ?? [])
        .filter((lease) => lease.taskId === task.id && lease.status === "held")
        .map((lease) => ({ ...lease, status: "released" as const, releasedAt: command.createdAt }));
      if (leases.length === 0) return cancelled;
      return [
        cancelled,
        {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: task.projectId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "resource.leases-released" as const,
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            leases,
            updatedAt: command.createdAt,
          },
        },
      ];
    }

    case "task.ownership.set": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status === "completed" || task.status === "cancelled") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Terminal Task '${command.taskId}' ownership cannot be changed.`,
        });
      }
      yield* Effect.try({
        try: () => validateOwnershipRules(command.rules),
        catch: (error) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: error instanceof Error ? error.message : "Ownership rules are invalid.",
          }),
      });
      if (
        task.ownership?.required === true &&
        !command.rules.some((rule) => rule.access === "write")
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Builder Task '${command.taskId}' requires at least one write rule.`,
        });
      }
      const updated: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-updated" as const,
        payload: { taskId: command.taskId, rules: command.rules, updatedAt: command.createdAt },
      };
      if (!task.reviewSnapshot) return updated;
      return [
        updated,
        {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: command.taskId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.review.stale" as const,
          payload: { taskId: command.taskId, updatedAt: command.createdAt },
        },
      ];
    }

    case "task.resource-requirements.set": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status === "completed" || task.status === "cancelled")
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Terminal Task '${task.id}' resource requirements cannot be changed.`,
        });
      if (task.status === "active" && command.confirmActiveChange !== true)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Changing active Task resource requirements requires explicit confirmation.",
        });
      if (new Set(command.resourceIds).size !== command.resourceIds.length)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Task resource requirements must be unique.",
        });
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      const enabledIds = new Set(
        (project.sharedResources ?? [])
          .filter((resource) => resource.enabled)
          .map((resource) => resource.id),
      );
      const missing = command.resourceIds.find((resourceId) => !enabledIds.has(resourceId));
      if (missing)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Required shared resource '${missing}' is missing or disabled.`,
        });
      const heldByTask = (project.resourceLeases ?? []).filter(
        (lease) => lease.taskId === task.id && lease.status === "held",
      );
      const removedHeld = heldByTask.find(
        (lease) => !command.resourceIds.includes(lease.resourceId),
      );
      if (removedHeld)
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Required lease '${removedHeld.resourceId}' cannot be removed while Task '${task.id}' is active.`,
        });
      const events: Array<Omit<OrchestrationEvent, "sequence">> = [
        {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: task.id,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.resource-requirements-updated",
          payload: {
            taskId: task.id,
            resourceIds: command.resourceIds,
            updatedAt: command.createdAt,
          },
        },
      ];
      if (task.status === "active") {
        const heldIds = new Set(heldByTask.map((lease) => lease.resourceId));
        const added = command.resourceIds.filter((resourceId) => !heldIds.has(resourceId));
        const probe = { ...task, requiredResourceIds: added };
        const blockers = resourceBlockers({
          task: probe,
          resources: project.sharedResources ?? [],
          leases: project.resourceLeases ?? [],
        });
        if (blockers.length > 0)
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `Waiting for resource '${blockers[0]!.resource.name}', held by Task '${blockers[0]!.lease.taskId}'.`,
          });
        const leases = [];
        for (const resourceId of added) {
          const id = yield* Crypto.Crypto.pipe(Effect.flatMap((crypto) => crypto.randomUUIDv4));
          leases.push({
            id: ResourceLeaseId.make(id),
            projectId: task.projectId,
            resourceId,
            taskId: task.id,
            status: "held" as const,
            acquiredAt: command.createdAt,
            releasedAt: null,
          });
        }
        if (leases.length > 0)
          events.push({
            ...(yield* withEventBase({
              aggregateKind: "project",
              aggregateId: task.projectId,
              occurredAt: command.createdAt,
              commandId: command.commandId,
            })),
            type: "resource.leases-acquired",
            payload: {
              projectId: task.projectId,
              taskId: task.id,
              leases,
              updatedAt: command.createdAt,
            },
          });
      }
      return events.length === 1 ? events[0]! : events;
    }

    case "task.ownership-request.create": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status === "completed" || task.status === "cancelled")
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Terminal Task '${task.id}' cannot request ownership expansion.`,
        });
      if ((task.ownershipRequests ?? []).some((request) => request.id === command.requestId))
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Ownership request '${command.requestId}' already exists.`,
        });
      yield* Effect.try({
        try: () => validateOwnershipRules(command.requestedRules),
        catch: (error) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: error instanceof Error ? error.message : "Ownership request rules are invalid.",
          }),
      });
      const request = {
        id: command.requestId,
        taskId: task.id,
        status: "pending" as const,
        requestedRules: command.requestedRules,
        reason: command.reason,
        source: command.source,
        createdAt: command.createdAt,
        resolvedAt: null,
        resolutionNote: null,
      };
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-request-created",
        payload: { taskId: task.id, request, updatedAt: command.createdAt },
      };
    }

    case "task.ownership-request.approve":
    case "task.ownership-request.deny":
    case "task.ownership-request.cancel": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const pending = (task.ownershipRequests ?? []).find(
        (request) => request.id === command.requestId,
      );
      if (!pending || pending.status !== "pending")
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Pending ownership request '${command.requestId}' was not found.`,
        });
      const status =
        command.type === "task.ownership-request.approve"
          ? ("approved" as const)
          : command.type === "task.ownership-request.deny"
            ? ("denied" as const)
            : ("cancelled" as const);
      const request = {
        ...pending,
        status,
        resolvedAt: command.createdAt,
        resolutionNote: command.resolutionNote ?? null,
      };
      if (status !== "approved")
        return {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: task.id,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type:
            status === "denied"
              ? "task.ownership-request-denied"
              : "task.ownership-request-cancelled",
          payload: { taskId: task.id, request, updatedAt: command.createdAt },
        };
      const rules = [...(task.ownership?.rules ?? []), ...pending.requestedRules];
      yield* Effect.try({
        try: () => validateOwnershipRules(rules),
        catch: (error) =>
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail:
              error instanceof Error ? error.message : "Approved ownership rules are invalid.",
          }),
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-request-approved" as const,
        payload: { taskId: task.id, request, rules, updatedAt: command.createdAt },
      };
    }

    case "task.ownership.validate": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.ownership?.required !== true || task.ownership.rules.length === 0) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' does not have configured ownership.`,
        });
      }
      if (
        task.workspace?.status !== "ready" ||
        task.workspace.path === null ||
        task.workspace.baseCommit === null
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' requires a ready workspace before ownership validation.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-validation-requested",
        payload: { taskId: command.taskId, requestCompletion: false, updatedAt: command.createdAt },
      };
    }

    case "task.ownership.validated": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.ownership?.status !== "pending") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no pending ownership validation.`,
        });
      }
      const validatedEvent = {
        ...(yield* withEventBase({
          aggregateKind: "task" as const,
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-validated" as const,
        payload: {
          taskId: command.taskId,
          status: command.violations.length === 0 ? ("valid" as const) : ("violation" as const),
          changedPathCount: command.changedPathCount,
          violations: command.violations,
          validatedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const resourceViolations = command.resourceViolations ?? [];
      const resourceEvent = {
        ...(yield* withEventBase({
          aggregateKind: "task" as const,
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.resource-validated" as const,
        payload: {
          taskId: command.taskId,
          status: resourceViolations.length === 0 ? ("valid" as const) : ("violation" as const),
          violations: resourceViolations,
          validatedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      if (
        command.violations.length > 0 ||
        resourceViolations.length > 0 ||
        task.status !== "active"
      ) {
        return [validatedEvent, resourceEvent];
      }
      if (command.requestReview === true) {
        return [
          validatedEvent,
          resourceEvent,
          {
            ...(yield* withEventBase({
              aggregateKind: "task",
              aggregateId: command.taskId,
              occurredAt: command.createdAt,
              commandId: command.commandId,
            })),
            type: "task.review.prepare-requested" as const,
            payload: {
              taskId: command.taskId,
              generation: command.generation ?? "provider",
              updatedAt: command.createdAt,
            },
          },
        ];
      }
      if (!command.requestCompletion) return [validatedEvent, resourceEvent];
      return [
        validatedEvent,
        resourceEvent,
        {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: command.taskId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.completion.freshness-requested" as const,
          payload: {
            taskId: command.taskId,
            updatedAt: command.createdAt,
          },
        },
      ];
    }

    case "task.ownership.validation-failed": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.ownership?.status !== "pending") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no pending ownership validation.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-validation-failed",
        payload: {
          taskId: command.taskId,
          failureReason: command.failureReason,
          validatedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.review.prepare": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (
        task.status !== "active" ||
        task.workspace?.status !== "ready" ||
        task.ownership?.required !== true ||
        !task.ownership.rules.some((rule) => rule.access === "write")
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' requires an active managed workspace and write ownership before review.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.ownership-validation-requested",
        payload: {
          taskId: command.taskId,
          requestCompletion: false,
          requestReview: true,
          generation: command.generation,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.review.prepared": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (
        task.status !== "active" ||
        task.ownership?.status !== "valid" ||
        task.resourceCompliance?.status !== "valid"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' is not eligible for a review snapshot.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.review.prepared",
        payload: {
          taskId: command.taskId,
          snapshot: command.snapshot,
          handoff: command.handoff,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.review.prepare-failed": {
      yield* requireTask({ readModel, command, taskId: command.taskId });
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.review.prepare-failed",
        payload: {
          taskId: command.taskId,
          failureReason: command.failureReason,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.review.stale": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (!task.reviewSnapshot) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no review snapshot to mark stale.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.review.stale",
        payload: { taskId: command.taskId, updatedAt: command.createdAt },
      };
    }

    case "task.handoff.update": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (
        task.status !== "active" ||
        task.reviewSnapshot?.id !== command.snapshotId ||
        task.reviewSnapshot.status !== "current" ||
        !task.handoff ||
        task.handoff.snapshotId !== command.snapshotId
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' handoff does not target its current review snapshot.`,
        });
      }
      if (command.status === "ready" && command.summary.trim().length === 0) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "A ready handoff requires a summary.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.handoff.updated",
        payload: {
          taskId: command.taskId,
          handoff: {
            ...task.handoff,
            status: command.status,
            summary: command.summary,
            testsRun: command.testsRun,
            assumptions: command.assumptions,
            interfaceChanges: command.interfaceChanges,
            migrations: command.migrations,
            knownRisks: command.knownRisks,
            followUps: command.followUps,
            updatedAt: command.createdAt,
          },
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.quality.run": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      if (
        task.status !== "active" ||
        task.reviewSnapshot?.id !== command.snapshotId ||
        task.reviewSnapshot.status !== "current" ||
        task.workspace?.status !== "ready" ||
        !task.workspace.path
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' quality gates must target its current managed review snapshot.`,
        });
      }
      const gates = (project.qualityPolicy?.gates ?? []).filter((gate) => gate.enabled);
      const unapproved = gates.find((gate) => gate.approvedCommand !== gate.command);
      if (unapproved) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Quality gate '${unapproved.label}' must be explicitly approved before execution.`,
        });
      }
      const crypto = yield* Crypto.Crypto;
      const runs = [];
      for (const gate of gates) {
        runs.push({
          id: QualityGateRunId.make(yield* crypto.randomUUIDv4),
          taskId: task.id,
          snapshotId: command.snapshotId,
          gateId: gate.id,
          label: gate.label,
          command: gate.command,
          required: gate.required,
          timeoutSeconds: gate.timeoutSeconds,
          status: "queued" as const,
          cwd: task.workspace.path,
          exitCode: null,
          startedAt: null,
          completedAt: null,
          outputSummary: "",
          outputTruncated: false,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.quality.run-requested",
        payload: {
          taskId: task.id,
          snapshotId: command.snapshotId,
          runs,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.quality.cancel": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const run = (task.qualityGateRuns ?? []).find((candidate) => candidate.id === command.runId);
      if (!run || (run.status !== "queued" && run.status !== "running")) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Quality gate run '${command.runId}' is not cancellable.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.quality.run-cancel-requested",
        payload: { taskId: task.id, runId: command.runId, updatedAt: command.createdAt },
      };
    }

    case "task.quality.run-started":
    case "task.quality.run-finished": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const existing = (task.qualityGateRuns ?? []).find(
        (candidate) => candidate.id === command.run.id,
      );
      if (!existing || existing.snapshotId !== command.run.snapshotId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Quality gate run '${command.run.id}' does not belong to this Task snapshot.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type:
          command.type === "task.quality.run-started"
            ? ("task.quality.run-started" as const)
            : ("task.quality.run-finished" as const),
        payload: { taskId: task.id, run: command.run, updatedAt: command.createdAt },
      };
    }

    case "task.independent-review.request": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const failedGate = requiredQualityGateFailure(readModel, task);
      if (
        task.status !== "active" ||
        task.reviewSnapshot?.id !== command.snapshotId ||
        task.reviewSnapshot.status !== "current" ||
        task.handoff?.status !== "ready" ||
        task.handoff.snapshotId !== command.snapshotId ||
        failedGate !== null
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' requires a current ready handoff and all required quality gates before review.`,
        });
      }
      const thread = readModel.threads.find((candidate) => candidate.id === task.threadId);
      const diversity =
        thread?.modelSelection.instanceId === command.reviewerModelSelection.instanceId
          ? ("same-provider" as const)
          : ("cross-provider" as const);
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.independent-review.requested",
        payload: {
          taskId: task.id,
          review: {
            id: command.reviewId,
            taskId: task.id,
            snapshotId: command.snapshotId,
            reviewerModelSelection: command.reviewerModelSelection,
            diversity,
            status: "queued",
            verdict: null,
            findings: [],
            criteria: [],
            securityConcerns: [],
            requiredChanges: [],
            summary: "",
            coverage: "complete",
            failureReason: null,
            findingsSentAt: null,
            createdAt: command.createdAt,
            completedAt: null,
          },
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.independent-review.started": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const review = (task.reviews ?? []).find((candidate) => candidate.id === command.reviewId);
      if (!review || review.status !== "queued") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Review '${command.reviewId}' is not queued.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.independent-review.started",
        payload: { taskId: task.id, reviewId: command.reviewId, updatedAt: command.createdAt },
      };
    }

    case "task.independent-review.completed": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const existing = (task.reviews ?? []).find((candidate) => candidate.id === command.review.id);
      if (!existing || existing.snapshotId !== command.review.snapshotId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Review '${command.review.id}' does not belong to this Task snapshot.`,
        });
      }
      const hasBlocking = command.review.findings.some(
        (finding) => finding.severity === "blocking" || finding.severity === "security",
      );
      if (
        hasBlocking &&
        (command.review.verdict === "approve" || command.review.verdict === "approve_with_notes")
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: "Blocking or security findings cannot be persisted with an approving verdict.",
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.independent-review.completed",
        payload: { taskId: task.id, review: command.review, updatedAt: command.createdAt },
      };
    }

    case "task.independent-review.failed": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (!(task.reviews ?? []).some((review) => review.id === command.reviewId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Review '${command.reviewId}' was not found.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.independent-review.failed",
        payload: {
          taskId: task.id,
          reviewId: command.reviewId,
          failureReason: command.failureReason,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.review.findings.send": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      const review = (task.reviews ?? []).find((candidate) => candidate.id === command.reviewId);
      if (!review || review.status !== "completed" || task.threadId === null) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Completed review findings require an existing Builder thread.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: task.id,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.review.findings-sent",
        payload: {
          taskId: task.id,
          reviewId: command.reviewId,
          sentAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.completion.freshness-validated": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (!command.current) {
        return {
          ...(yield* withEventBase({
            aggregateKind: "task",
            aggregateId: command.taskId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "task.review.stale",
          payload: { taskId: command.taskId, updatedAt: command.createdAt },
        };
      }
      if (
        task.status !== "active" ||
        task.reviewSnapshot?.status !== "current" ||
        task.handoff?.status !== "ready" ||
        task.resourceCompliance?.status !== "valid"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' cannot complete without a current snapshot and ready handoff.`,
        });
      }
      const failedGate = requiredQualityGateFailure(readModel, task);
      if (failedGate !== null || (task.reviewRequired === true && !currentApprovedReview(task))) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' no longer satisfies its current quality and review policy.`,
        });
      }
      const thread = readModel.threads.find((candidate) => candidate.id === task.threadId);
      const snapshot = task.reviewSnapshot;
      const handoff = task.handoff;
      const branch = task.workspace?.branch;
      if (!snapshot || !handoff || !branch) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' cannot produce a durable result from incomplete review evidence.`,
        });
      }
      const completed = {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.completed" as const,
        payload: {
          taskId: command.taskId,
          completedAt: command.createdAt,
          updatedAt: command.createdAt,
          result: {
            taskId: task.id,
            status: "completed",
            summary: handoff.summary,
            files: snapshot.files ?? [],
            baseCommit: snapshot.baseCommit,
            snapshotId: snapshot.id,
            testsRun: handoff.testsRun,
            assumptions: handoff.assumptions,
            interfaceChanges: handoff.interfaceChanges,
            migrations: handoff.migrations,
            knownRisks: handoff.knownRisks,
            followUps: handoff.followUps,
            providerInstanceId: thread?.modelSelection.instanceId ?? null,
            threadId: task.threadId,
            branch,
            completedAt: command.createdAt,
          },
        },
      };
      const project = yield* requireProject({ readModel, command, projectId: task.projectId });
      const leases = (project.resourceLeases ?? [])
        .filter((lease) => lease.taskId === task.id && lease.status === "held")
        .map((lease) => ({ ...lease, status: "released" as const, releasedAt: command.createdAt }));
      if (leases.length === 0) return completed;
      return [
        completed,
        {
          ...(yield* withEventBase({
            aggregateKind: "project",
            aggregateId: task.projectId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "resource.leases-released" as const,
          payload: {
            projectId: task.projectId,
            taskId: task.id,
            leases,
            updatedAt: command.createdAt,
          },
        },
      ];
    }

    case "task.restore.request": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.status !== "active" || task.workspace?.status !== "ready") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only an active Task with a ready managed workspace can be restored.`,
        });
      }
      if (task.restore?.status === "requested" || task.restore?.status === "snapshot-captured") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' already has a restore in progress.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.restore.requested",
        payload: {
          taskId: command.taskId,
          restoreId: command.restoreId,
          requestedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.restore.snapshot-captured": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.restore?.id !== command.restoreId || task.restore.status !== "requested") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no matching restore request.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.restore.snapshot-captured",
        payload: {
          taskId: command.taskId,
          restoreId: command.restoreId,
          safetyCheckpointRef: command.safetyCheckpointRef,
          previousHead: command.previousHead,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.restored":
    case "task.restore.failed":
    case "task.restore.undone": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.restore?.id !== command.restoreId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no matching restore operation.`,
        });
      }
      const type =
        command.type === "task.restored"
          ? ("task.restored" as const)
          : command.type === "task.restore.failed"
            ? ("task.restore.failed" as const)
            : ("task.restore.undone" as const);
      const base = {
        ...(yield* withEventBase({
          aggregateKind: "task" as const,
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type,
      };
      if (command.type === "task.restore.failed") {
        return {
          ...base,
          type: "task.restore.failed" as const,
          payload: {
            taskId: command.taskId,
            restoreId: command.restoreId,
            failureReason: command.failureReason,
            updatedAt: command.createdAt,
          },
        };
      }
      return {
        ...base,
        type,
        payload: {
          taskId: command.taskId,
          restoreId: command.restoreId,
          updatedAt: command.createdAt,
        },
      } as Omit<OrchestrationEvent, "sequence">;
    }

    case "task.restore.undo": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (
        task.status !== "active" ||
        (task.restore?.status !== "completed" && task.restore?.status !== "failed") ||
        task.restore.safetyCheckpointRef === null ||
        task.restore.previousHead === null
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' has no completed restore to undo.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.restore.undo-requested",
        payload: {
          taskId: command.taskId,
          restoreId: task.restore.id,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.prepare": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      yield* requireMissionTaskReady({ readModel, command, taskId: command.taskId });
      if (task.role !== "builder" || task.status !== "draft" || task.threadId !== null) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only an unbound draft Builder Task can prepare an isolated workspace.`,
        });
      }
      if (
        task.ownership?.required === true &&
        !task.ownership.rules.some((rule) => rule.access === "write")
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Builder Task '${command.taskId}' requires explicit write ownership before workspace preparation.`,
        });
      }
      if (task.workspace?.status === "preparing" || task.workspace?.status === "ready") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' workspace is already '${task.workspace.status}'.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.prepare-requested",
        payload: { taskId: command.taskId, updatedAt: command.createdAt },
      };
    }

    case "task.workspace.preparation-started": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.workspace?.status !== "preparing") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' is not preparing a workspace.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.preparation-started",
        payload: {
          taskId: command.taskId,
          sourceRepository: command.sourceRepository,
          baseCommit: command.baseCommit,
          branch: command.branch,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.ready": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.workspace?.status !== "preparing") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' is not preparing a workspace.`,
        });
      }
      const conflict = (readModel.tasks ?? []).find(
        (candidate) =>
          candidate.id !== task.id &&
          candidate.workspace?.path === command.path &&
          candidate.workspace.status !== "removed",
      );
      if (conflict !== undefined) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Workspace '${command.path}' already belongs to Task '${conflict.id}'.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.ready",
        payload: {
          taskId: command.taskId,
          sourceRepository: command.sourceRepository,
          baseCommit: command.baseCommit,
          branch: command.branch,
          path: command.path,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.failed": {
      yield* requireTask({ readModel, command, taskId: command.taskId });
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.failed",
        payload: {
          taskId: command.taskId,
          failureCode: command.failureCode,
          failureReason: command.failureReason,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.missing": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.workspace?.status !== "ready") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only a ready workspace can become missing.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.missing",
        payload: {
          taskId: command.taskId,
          failureReason: command.failureReason,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.remove": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (
        (task.status !== "completed" && task.status !== "cancelled") ||
        task.workspace == null ||
        task.workspace.status === "removed"
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Only a terminal Task with a retained workspace can remove it.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.remove-requested",
        payload: { taskId: command.taskId, updatedAt: command.createdAt },
      };
    }

    case "task.workspace.removed": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.workspace?.status !== "removing") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' workspace is not being removed.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.removed",
        payload: {
          taskId: command.taskId,
          removedAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "task.workspace.cleanup-failed": {
      const task = yield* requireTask({ readModel, command, taskId: command.taskId });
      if (task.workspace?.status !== "removing") {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Task '${command.taskId}' workspace is not being removed.`,
        });
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "task",
          aggregateId: command.taskId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "task.workspace.cleanup-failed",
        payload: {
          taskId: command.taskId,
          failureCode: command.failureCode,
          failureReason: command.failureReason,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.create": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          modelSelection: command.modelSelection,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.delete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.deleted",
        payload: {
          threadId: command.threadId,
          deletedAt: occurredAt,
        },
      };
    }

    case "thread.archive": {
      yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.archived",
        payload: {
          threadId: command.threadId,
          archivedAt: occurredAt,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.unarchive": {
      yield* requireThreadArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.unarchived",
        payload: {
          threadId: command.threadId,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.settle": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Server-side twin of the client's canSettle session check: a stale
      // or raced client must not settle a thread whose session is coming
      // alive or working.
      if (thread.session?.status === "starting" || thread.session?.status === "running") {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} has an active session and cannot be settled`,
          }),
        );
      }
      // Pending approval / user-input requests are blocked-on-you work: a
      // raced or stale client must not park them behind a settled override
      // that would surface only after the request resolves.
      if (hasOpenBlockingRequest(thread)) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} has a pending approval or user-input request and cannot be settled`,
          }),
        );
      }
      const occurredAt = yield* nowIso;
      // Settling inside the adoption window would hide just-requested work.
      if (threadHasQueuedTurnStart(thread, occurredAt)) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} has a queued turn start and cannot be settled`,
          }),
        );
      }
      // Settling an already-settled thread re-emits with the original
      // settledAt: the engine rejects zero-event commands, and bulk-settle /
      // double-click must stay silent no-ops rather than surface errors.
      const alreadySettled = thread.settledOverride === "settled" && thread.settledAt !== null;
      const settledEvent = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.settled" as const,
        payload: {
          threadId: command.threadId,
          settledAt: alreadySettled ? thread.settledAt : occurredAt,
          // A re-emission is a projected no-op: keep the existing updatedAt
          // so duplicate settles neither rewind nor churn ordering. A fresh
          // settle stamps the command time.
          updatedAt: alreadySettled ? thread.updatedAt : occurredAt,
        },
      };
      // Settling is "I'm done with this": clear states that would keep the
      // row pinned or snoozed instead of showing the new settled state.
      const companionEvents: Array<Omit<OrchestrationEvent, "sequence">> = [];
      if (thread.pinnedAt != null) {
        companionEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt,
            commandId: command.commandId,
          })),
          type: "thread.unpinned" as const,
          payload: {
            threadId: command.threadId,
            updatedAt: occurredAt,
          },
        });
      }
      if (thread.snoozedUntil != null) {
        companionEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt,
            commandId: command.commandId,
          })),
          type: "thread.unsnoozed",
          payload: {
            threadId: command.threadId,
            reason: "user",
            updatedAt: occurredAt,
          },
        });
      }
      return companionEvents.length > 0 ? [settledEvent, ...companionEvents] : settledEvent;
    }

    case "thread.unsettle": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Idempotent by re-emission (see thread.settle): reducing the event a
      // second time lands on the same override state. A re-emission keeps
      // the existing updatedAt so duplicates do not churn ordering.
      const alreadyPinnedActive = thread.settledOverride === "active";
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.unsettled",
        payload: {
          threadId: command.threadId,
          reason: command.reason,
          updatedAt: alreadyPinnedActive ? thread.updatedAt : occurredAt,
        },
      };
    }

    case "thread.snooze": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      // A wake time in the past would create a thread that is snoozed and
      // woken at once — the row would never leave the inbox but still carry
      // snooze state. Reject instead of silently normalizing. The negated
      // comparison also catches unparseable wake times (IsoDateTime is
      // structurally just a string): NaN fails every comparison, and an
      // unparseable snoozedUntil must never persist.
      if (!(Date.parse(command.snoozedUntil) > Date.parse(occurredAt))) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} snooze wake time ${command.snoozedUntil} is not in the future`,
          }),
        );
      }
      // Blocked-on-you work must not be snoozed away: a pending approval or
      // user-input request is the agent waiting on the user, and hiding it
      // defeats the request. (A running session IS snoozable — snooze only
      // affects visibility, never the agent.)
      if (hasOpenBlockingRequest(thread)) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} has a pending approval or user-input request and cannot be snoozed`,
          }),
        );
      }
      // A queued turn start — a user message no turn has adopted yet — is
      // invisible pending work: no session, no pending flags. Snoozing in
      // that window would hide a just-requested turn exactly the way settle
      // would.
      if (threadHasQueuedTurnStart(thread, occurredAt)) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} has a queued turn start and cannot be snoozed`,
          }),
        );
      }
      // Re-snoozing an already-snoozed thread to the SAME wake time is a
      // duplicate (double-click, raced clients): re-emit with the original
      // timestamps so the projection is a no-op. A different wake time is a
      // real change and stamps fresh.
      const existingSnoozedAt =
        thread.snoozedUntil === command.snoozedUntil && thread.snoozedAt != null
          ? thread.snoozedAt
          : null;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.snoozed",
        payload: {
          threadId: command.threadId,
          snoozedUntil: command.snoozedUntil,
          snoozedAt: existingSnoozedAt ?? occurredAt,
          updatedAt: existingSnoozedAt !== null ? thread.updatedAt : occurredAt,
        },
      };
    }

    case "thread.unsnooze": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Idempotent by re-emission (see thread.settle): waking a thread that
      // is not snoozed lands on the same null state without churning
      // updatedAt.
      const alreadyAwake = thread.snoozedUntil == null;
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.unsnoozed",
        payload: {
          threadId: command.threadId,
          reason: command.reason,
          updatedAt: alreadyAwake ? thread.updatedAt : occurredAt,
        },
      };
    }

    case "thread.pin": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      // Re-pinning an already-pinned thread is a duplicate (double-click,
      // raced clients): re-emit with the original timestamps so the
      // projection is a no-op. Pinning has no lifecycle invariants — a pin
      // only ever promotes visibility, so it can never hide pending work.
      const existingPinnedAt = thread.pinnedAt ?? null;
      const pinnedEvent = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.pinned" as const,
        payload: {
          threadId: command.threadId,
          pinnedAt: existingPinnedAt ?? occurredAt,
          // A fresh pin takes the client's slot in the arranged order; on a
          // re-pin the existing key wins so raced duplicates cannot move a
          // thread the user already placed.
          ...(existingPinnedAt === null && command.orderKey !== undefined
            ? { pinOrderKey: command.orderKey }
            : {}),
          updatedAt: existingPinnedAt !== null ? thread.updatedAt : occurredAt,
        },
      };
      // Pinning is a promotion: it clears the parked states rather than
      // silently outranking them. An explicit settle un-settles (reason
      // "user", same override the un-settle button stamps), and a snooze's
      // return ticket is spent — the thread is on top NOW, not on Tuesday.
      const promotionEvents: Array<Omit<OrchestrationEvent, "sequence">> = [];
      if (thread.settledOverride === "settled") {
        promotionEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt,
            commandId: command.commandId,
          })),
          type: "thread.unsettled",
          payload: {
            threadId: command.threadId,
            reason: "user",
            updatedAt: occurredAt,
          },
        });
      }
      if (thread.snoozedUntil != null) {
        promotionEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt,
            commandId: command.commandId,
          })),
          type: "thread.unsnoozed",
          payload: {
            threadId: command.threadId,
            reason: "user",
            updatedAt: occurredAt,
          },
        });
      }
      return promotionEvents.length > 0 ? [pinnedEvent, ...promotionEvents] : pinnedEvent;
    }

    case "thread.unpin": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Idempotent by re-emission (see thread.settle): unpinning a thread
      // that is not pinned lands on the same null state without churning
      // updatedAt.
      const alreadyUnpinned = thread.pinnedAt == null;
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.unpinned",
        payload: {
          threadId: command.threadId,
          updatedAt: alreadyUnpinned ? thread.updatedAt : occurredAt,
        },
      };
    }

    case "thread.pin.reorder": {
      const thread = yield* requireThreadNotArchived({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Only pinned threads have a slot in the arranged order. Rejecting
      // (rather than silently pinning) keeps a raced reorder-after-unpin
      // from resurrecting a pin the user just cleared.
      if (thread.pinnedAt == null) {
        return yield* Effect.fail(
          new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: `thread ${command.threadId} is not pinned and cannot be reordered`,
          }),
        );
      }
      // Idempotent by re-emission (see thread.settle): a duplicate drop on
      // the same slot keeps the existing updatedAt so it projects as a no-op.
      const keyUnchanged = thread.pinOrderKey === command.orderKey;
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.pin-reordered",
        payload: {
          threadId: command.threadId,
          orderKey: command.orderKey,
          updatedAt: keyUnchanged ? thread.updatedAt : occurredAt,
        },
      };
    }

    case "thread.meta.update": {
      const thread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const branch =
        command.branch !== undefined &&
        command.expectedBranch !== undefined &&
        thread.branch !== command.expectedBranch
          ? thread.branch
          : command.branch;
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.meta-updated",
        payload: {
          threadId: command.threadId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.regenerateTitle === true
            ? {
                regenerateTitle: true as const,
                previousTitle: thread.title,
                titleRegeneration: {
                  requestId: command.commandId,
                  startedAt: occurredAt,
                },
              }
            : {}),
          ...(command.title !== undefined && thread.titleRegeneration != null
            ? { titleRegeneration: null }
            : {}),
          ...(command.modelSelection !== undefined
            ? { modelSelection: command.modelSelection }
            : {}),
          ...(branch !== undefined ? { branch } : {}),
          ...(command.worktreePath !== undefined ? { worktreePath: command.worktreePath } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.title.regeneration.complete": {
      const thread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const requestIsCurrent = thread.titleRegeneration?.requestId === command.requestId;
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.meta-updated",
        payload: {
          threadId: command.threadId,
          ...(requestIsCurrent && command.title !== undefined ? { title: command.title } : {}),
          ...(requestIsCurrent ? { titleRegeneration: null } : {}),
          updatedAt: requestIsCurrent ? occurredAt : thread.updatedAt,
        },
      };
    }

    case "thread.runtime-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.runtime-mode-set",
        payload: {
          threadId: command.threadId,
          runtimeMode: command.runtimeMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.interaction-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "thread.interaction-mode-set",
        payload: {
          threadId: command.threadId,
          interactionMode: command.interactionMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.turn.start": {
      const targetThread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const sourceProposedPlan = command.sourceProposedPlan;
      const sourceThread = sourceProposedPlan
        ? yield* requireThread({
            readModel,
            command,
            threadId: sourceProposedPlan.threadId,
          })
        : null;
      const sourcePlan =
        sourceProposedPlan && sourceThread
          ? sourceThread.proposedPlans.find((entry) => entry.id === sourceProposedPlan.planId)
          : null;
      if (sourceProposedPlan && !sourcePlan) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Proposed plan '${sourceProposedPlan.planId}' does not exist on thread '${sourceProposedPlan.threadId}'.`,
        });
      }
      if (sourceThread && sourceThread.projectId !== targetThread.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Proposed plan '${sourceProposedPlan?.planId}' belongs to thread '${sourceThread.id}' in a different project.`,
        });
      }
      const userMessageEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.message.messageId,
          role: "user",
          text: command.message.text,
          attachments: command.message.attachments,
          turnId: null,
          streaming: false,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const turnStartRequestedEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        causationEventId: userMessageEvent.eventId,
        type: "thread.turn-start-requested",
        payload: {
          threadId: command.threadId,
          messageId: command.message.messageId,
          ...(command.modelSelection !== undefined
            ? { modelSelection: command.modelSelection }
            : {}),
          ...(command.titleSeed !== undefined ? { titleSeed: command.titleSeed } : {}),
          runtimeMode: targetThread.runtimeMode,
          interactionMode: targetThread.interactionMode,
          ...(sourceProposedPlan !== undefined ? { sourceProposedPlan } : {}),
          createdAt: command.createdAt,
        },
      };
      // Real activity resets ANY override: it wakes an explicitly settled
      // thread, and it clears a keep-active pin back to neutral so the
      // thread can auto-settle again after this burst of work goes stale.
      // A snooze clears the same way — sending a message to a snoozed
      // thread is the user re-engaging, so the return ticket is spent.
      const lifecycleResetEvents: Array<Omit<OrchestrationEvent, "sequence">> = [];
      if (targetThread.settledOverride !== null) {
        lifecycleResetEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "thread.unsettled",
          payload: {
            threadId: command.threadId,
            reason: "activity",
            updatedAt: command.createdAt,
          },
        });
      }
      if (targetThread.snoozedUntil != null) {
        lifecycleResetEvents.push({
          ...(yield* withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "thread.unsnoozed",
          payload: {
            threadId: command.threadId,
            reason: "activity",
            updatedAt: command.createdAt,
          },
        });
      }
      return [...lifecycleResetEvents, userMessageEvent, turnStartRequestedEvent];
    }

    case "thread.turn.interrupt": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.turn-interrupt-requested",
        payload: {
          threadId: command.threadId,
          ...(command.turnId !== undefined ? { turnId: command.turnId } : {}),
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.approval.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        })),
        type: "thread.approval-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          decision: command.decision,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.user-input.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        })),
        type: "thread.user-input-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          answers: command.answers,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.checkpoint.revert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.checkpoint-revert-requested",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.stop": {
      const thread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      // Settle-cleanup stops are conditional: between the settle landing and
      // this command, another client may have re-engaged the thread (a turn
      // start unsettles it and brings the session alive). Commands are
      // decided serially against this read model, so checking here — not in
      // the dispatcher's pre-settle snapshot — closes that race.
      if (command.onlyIfSettled === true) {
        const sessionComingAlive =
          thread.session?.status === "starting" || thread.session?.status === "running";
        if (
          thread.settledOverride !== "settled" ||
          sessionComingAlive ||
          threadHasQueuedTurnStart(thread, command.createdAt)
        ) {
          return yield* Effect.fail(
            new OrchestrationCommandInvariantError({
              commandType: command.type,
              detail: `thread ${command.threadId} was re-engaged after settle; skipping session stop`,
            }),
          );
        }
      }
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.session-stop-requested",
        payload: {
          threadId: command.threadId,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.set": {
      const thread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const sessionSetEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {},
        })),
        type: "thread.session-set",
        payload: {
          threadId: command.threadId,
          session: command.session,
        },
      };
      // Only a session coming alive is activity worth waking a settled thread
      // for — status writes like ready/stopped/error arrive after the fact and
      // must not fight a user's explicit settle. Snooze is deliberately NOT
      // cleared here: snooze never pauses the agent, so its session starting
      // or erroring is not the user re-engaging. Blocked/failed work still
      // surfaces immediately — effectiveSnoozed refuses to classify a thread
      // with a raised hand (approval / input / failure / fresh completion)
      // as snoozed, without spending the return ticket.
      const isSessionActivity =
        command.session.status === "starting" || command.session.status === "running";
      // Real activity resets ANY override (settled wakes, active unpins).
      if (thread.settledOverride === null || !isSessionActivity) {
        return sessionSetEvent;
      }
      const unsettledEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.unsettled",
        payload: {
          threadId: command.threadId,
          reason: "activity",
          updatedAt: command.createdAt,
        },
      };
      return [unsettledEvent, sessionSetEvent];
    }

    case "thread.message.assistant.delta": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: command.delta,
          turnId: command.turnId ?? null,
          streaming: true,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.message.assistant.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: "",
          turnId: command.turnId ?? null,
          streaming: false,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.proposed-plan.upsert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.proposed-plan-upserted",
        payload: {
          threadId: command.threadId,
          proposedPlan: command.proposedPlan,
        },
      };
    }

    case "thread.turn.diff.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.turn-diff-completed",
        payload: {
          threadId: command.threadId,
          turnId: command.turnId,
          checkpointTurnCount: command.checkpointTurnCount,
          checkpointRef: command.checkpointRef,
          status: command.status,
          files: command.files,
          assistantMessageId: command.assistantMessageId ?? null,
          completedAt: command.completedAt,
        },
      };
    }

    case "thread.revert.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.reverted",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
        },
      };
    }

    case "thread.activity.append": {
      const thread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const requestId =
        typeof command.activity.payload === "object" &&
        command.activity.payload !== null &&
        "requestId" in command.activity.payload &&
        typeof (command.activity.payload as { requestId?: unknown }).requestId === "string"
          ? ((command.activity.payload as { requestId: string })
              .requestId as OrchestrationEvent["metadata"]["requestId"])
          : undefined;
      const activityAppendedEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          ...(requestId !== undefined ? { metadata: { requestId } } : {}),
        })),
        type: "thread.activity-appended",
        payload: {
          threadId: command.threadId,
          activity: command.activity,
        },
      };
      // An approval or user-input request is blocked-on-you work — it must
      // never stay hidden inside a settled slim row.
      const wakesSettledThread =
        command.activity.kind === "approval.requested" ||
        command.activity.kind === "user-input.requested";
      // Real activity resets ANY override (settled wakes, active unpins).
      if (thread.settledOverride === null || !wakesSettledThread) {
        return activityAppendedEvent;
      }
      const unsettledEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...(yield* withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        })),
        type: "thread.unsettled",
        payload: {
          threadId: command.threadId,
          reason: "activity",
          updatedAt: command.createdAt,
        },
      };
      return [unsettledEvent, activityAppendedEvent];
    }

    default: {
      command satisfies never;
      const fallback = command as never as { type: string };
      return yield* new OrchestrationCommandInvariantError({
        commandType: fallback.type,
        detail: `Unknown command type: ${fallback.type}`,
      });
    }
  }
});
