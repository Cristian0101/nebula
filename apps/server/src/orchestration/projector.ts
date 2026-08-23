import type { OrchestrationEvent, OrchestrationReadModel, ThreadId } from "@t3tools/contracts";
import {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThread,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { toProjectorDecodeError, type OrchestrationProjectorDecodeError } from "./Errors.ts";
import {
  MessageSentPayloadSchema,
  ProjectCreatedPayload,
  ProjectDeletedPayload,
  IntegrationCreatedPayload,
  IntegrationUpdatedPayload,
  ProjectMetaUpdatedPayload,
  ProjectQualityPolicyUpdatedPayload,
  ProjectReviewPolicyUpdatedPayload,
  MissionCreatedPayload,
  MissionUpdatedPayload,
  MissionTaskMembershipPayload,
  MissionTasksReorderedPayload,
  MissionDependencyPayload,
  MissionLifecyclePayload,
  MissionIntegrationLinkedPayload,
  TaskActivatedPayload,
  TaskCancelledPayload,
  TaskCompletedPayload,
  TaskCreatedPayload,
  TaskAcceptanceCriteriaUpdatedPayload,
  TaskThreadBoundPayload,
  TaskWorkspaceCleanupFailedPayload,
  TaskWorkspaceFailedPayload,
  TaskWorkspaceMissingPayload,
  TaskWorkspacePreparationStartedPayload,
  TaskWorkspacePrepareRequestedPayload,
  TaskWorkspaceReadyPayload,
  TaskWorkspaceRemovedPayload,
  TaskWorkspaceRemoveRequestedPayload,
  TaskOwnershipUpdatedPayload,
  TaskOwnershipValidationRequestedPayload,
  TaskOwnershipValidatedPayload,
  TaskOwnershipValidationFailedPayload,
  TaskReviewPrepareRequestedPayload,
  TaskReviewPreparedPayload,
  TaskReviewPrepareFailedPayload,
  TaskReviewStalePayload,
  TaskHandoffUpdatedPayload,
  TaskQualityRunRequestedPayload,
  TaskQualityRunUpdatedPayload,
  TaskIndependentReviewRequestedPayload,
  TaskIndependentReviewStartedPayload,
  TaskIndependentReviewCompletedPayload,
  TaskIndependentReviewFailedPayload,
  TaskReviewFindingsSentPayload,
  TaskCompletionFreshnessRequestedPayload,
  TaskRestoreRequestedPayload,
  TaskRestoreSnapshotCapturedPayload,
  TaskRestoredPayload,
  TaskRestoreUndoRequestedPayload,
  TaskRestoreFailedPayload,
  TaskRestoreUndonePayload,
  ThreadActivityAppendedPayload,
  ThreadArchivedPayload,
  ThreadCreatedPayload,
  ThreadDeletedPayload,
  ThreadInteractionModeSetPayload,
  ThreadMetaUpdatedPayload,
  ThreadProposedPlanUpsertedPayload,
  ThreadRuntimeModeSetPayload,
  ThreadSettledPayload,
  ThreadPinnedPayload,
  ThreadPinReorderedPayload,
  ThreadSnoozedPayload,
  ThreadUnpinnedPayload,
  ThreadUnarchivedPayload,
  ThreadUnsettledPayload,
  ThreadUnsnoozedPayload,
  ThreadRevertedPayload,
  ThreadSessionSetPayload,
  ThreadTurnDiffCompletedPayload,
} from "./Schemas.ts";

type ThreadPatch = Partial<Omit<OrchestrationThread, "id" | "projectId">>;
const MAX_THREAD_MESSAGES = 2_000;
const MAX_THREAD_CHECKPOINTS = 500;

function checkpointStatusToLatestTurnState(status: "ready" | "missing" | "error") {
  if (status === "error") return "error" as const;
  if (status === "missing") return "interrupted" as const;
  return "completed" as const;
}

/**
 * Turn state to settle a still-running latest turn with when its session
 * leaves the "running" status, or null while the session is (re)starting or
 * running and the turn must stay unsettled.
 */
function settledTurnStateForSessionStatus(
  status: OrchestrationSession["status"],
): "completed" | "interrupted" | "error" | null {
  switch (status) {
    case "idle":
    case "ready":
      return "completed";
    case "error":
      return "error";
    case "interrupted":
    case "stopped":
      return "interrupted";
    case "starting":
    case "running":
      return null;
  }
}

function updateThread(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: ThreadId,
  patch: ThreadPatch,
): OrchestrationThread[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread));
}

function decodeForEvent<A>(
  schema: Schema.Decoder<A, never>,
  value: unknown,
  eventType: OrchestrationEvent["type"],
  field: string,
): Effect.Effect<A, OrchestrationProjectorDecodeError> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(toProjectorDecodeError(`${eventType}:${field}`)),
  );
}

function retainThreadMessagesAfterRevert(
  messages: ReadonlyArray<OrchestrationMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): ReadonlyArray<OrchestrationMessage> {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system") {
      retainedMessageIds.add(message.id);
      continue;
    }
    if (message.turnId !== null && retainedTurnIds.has(message.turnId)) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedUserCount = messages.filter(
    (message) => message.role === "user" && retainedMessageIds.has(message.id),
  ).length;
  const missingUserCount = Math.max(0, turnCount - retainedUserCount);
  if (missingUserCount > 0) {
    const fallbackUserMessages = messages
      .filter(
        (message) =>
          message.role === "user" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingUserCount);
    for (const message of fallbackUserMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && retainedMessageIds.has(message.id),
  ).length;
  const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
  if (missingAssistantCount > 0) {
    const fallbackAssistantMessages = messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingAssistantCount);
    for (const message of fallbackAssistantMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return messages.filter((message) => retainedMessageIds.has(message.id));
}

function retainThreadActivitiesAfterRevert(
  activities: ReadonlyArray<OrchestrationThread["activities"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationThread["activities"][number]> {
  return activities.filter(
    (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
  );
}

function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<OrchestrationThread["proposedPlans"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationThread["proposedPlans"][number]> {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}

function compareThreadActivities(
  left: OrchestrationThread["activities"][number],
  right: OrchestrationThread["activities"][number],
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function createEmptyReadModel(nowIso: string): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    tasks: [],
    missions: [],
    threads: [],
    updatedAt: nowIso,
  };
}

export function projectEvent(
  model: OrchestrationReadModel,
  event: OrchestrationEvent,
): Effect.Effect<OrchestrationReadModel, OrchestrationProjectorDecodeError> {
  const nextBase: OrchestrationReadModel = {
    ...model,
    snapshotSequence: event.sequence,
    updatedAt: event.occurredAt,
  };

  switch (event.type) {
    case "project.created":
      return decodeForEvent(ProjectCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const existing = nextBase.projects.find((entry) => entry.id === payload.projectId);
          const nextProject = {
            id: payload.projectId,
            title: payload.title,
            workspaceRoot: payload.workspaceRoot,
            defaultModelSelection: payload.defaultModelSelection,
            defaultThreadEnvMode: null,
            faviconPath: payload.faviconPath ?? null,
            scripts: payload.scripts,
            qualityPolicy: null,
            reviewPolicy: null,
            integrationBatches: [],
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            deletedAt: null,
          };

          return {
            ...nextBase,
            projects: existing
              ? nextBase.projects.map((entry) =>
                  entry.id === payload.projectId ? nextProject : entry,
                )
              : [...nextBase.projects, nextProject],
          };
        }),
      );

    case "project.quality-policy-updated":
      return decodeForEvent(
        ProjectQualityPolicyUpdatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? { ...project, qualityPolicy: payload.policy, updatedAt: payload.updatedAt }
              : project,
          ),
        })),
      );

    case "project.review-policy-updated":
      return decodeForEvent(
        ProjectReviewPolicyUpdatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? { ...project, reviewPolicy: payload.policy, updatedAt: payload.updatedAt }
              : project,
          ),
        })),
      );

    case "project.meta-updated":
      return decodeForEvent(ProjectMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  ...(payload.title !== undefined ? { title: payload.title } : {}),
                  ...(payload.workspaceRoot !== undefined
                    ? { workspaceRoot: payload.workspaceRoot }
                    : {}),
                  ...(payload.defaultModelSelection !== undefined
                    ? { defaultModelSelection: payload.defaultModelSelection }
                    : {}),
                  ...(payload.defaultThreadEnvMode !== undefined
                    ? { defaultThreadEnvMode: payload.defaultThreadEnvMode }
                    : {}),
                  ...(payload.faviconPath !== undefined
                    ? { faviconPath: payload.faviconPath }
                    : {}),
                  ...(payload.scripts !== undefined ? { scripts: payload.scripts } : {}),
                  updatedAt: payload.updatedAt,
                }
              : project,
          ),
        })),
      );

    case "project.deleted":
      return decodeForEvent(ProjectDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  deletedAt: payload.deletedAt,
                  updatedAt: payload.deletedAt,
                }
              : project,
          ),
        })),
      );

    case "mission.created":
      return decodeForEvent(MissionCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: [
            ...(nextBase.missions ?? []),
            {
              id: payload.missionId,
              projectId: payload.projectId,
              title: payload.title,
              objective: payload.objective,
              description: payload.description,
              status: "draft" as const,
              taskIds: [],
              dependencies: [],
              activities: [
                {
                  id: event.eventId,
                  type: event.type,
                  summary: "Mission created",
                  taskId: null,
                  occurredAt: event.occurredAt,
                },
              ],
              integrationBatchId: null,
              createdAt: payload.createdAt,
              updatedAt: payload.updatedAt,
              activatedAt: null,
              completedAt: null,
              cancelledAt: null,
            },
          ],
        })),
      );

    case "mission.updated":
      return decodeForEvent(MissionUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id === payload.missionId
              ? {
                  ...mission,
                  title: payload.title,
                  objective: payload.objective,
                  description: payload.description,
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary: "Mission details updated",
                      taskId: null,
                      occurredAt: event.occurredAt,
                    },
                  ],
                }
              : mission,
          ),
        })),
      );

    case "mission.task-added":
    case "mission.task-removed":
      return decodeForEvent(
        MissionTaskMembershipPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id !== payload.missionId
              ? mission
              : {
                  ...mission,
                  taskIds:
                    event.type === "mission.task-added"
                      ? [...mission.taskIds, payload.taskId]
                      : mission.taskIds.filter((taskId) => taskId !== payload.taskId),
                  dependencies:
                    event.type === "mission.task-removed"
                      ? mission.dependencies.filter(
                          (edge) =>
                            edge.prerequisiteTaskId !== payload.taskId &&
                            edge.dependentTaskId !== payload.taskId,
                        )
                      : mission.dependencies,
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary: event.type === "mission.task-added" ? "Task added" : "Task removed",
                      taskId: payload.taskId,
                      occurredAt: event.occurredAt,
                    },
                  ],
                },
          ),
        })),
      );

    case "mission.tasks-reordered":
      return decodeForEvent(
        MissionTasksReorderedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id === payload.missionId
              ? {
                  ...mission,
                  taskIds: payload.taskIds,
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary: "Task presentation order changed",
                      taskId: null,
                      occurredAt: event.occurredAt,
                    },
                  ],
                }
              : mission,
          ),
        })),
      );

    case "mission.dependency-added":
    case "mission.dependency-removed":
      return decodeForEvent(MissionDependencyPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id !== payload.missionId
              ? mission
              : {
                  ...mission,
                  dependencies:
                    event.type === "mission.dependency-added"
                      ? [
                          ...mission.dependencies,
                          {
                            missionId: payload.missionId,
                            prerequisiteTaskId: payload.prerequisiteTaskId,
                            dependentTaskId: payload.dependentTaskId,
                            createdAt: payload.createdAt,
                          },
                        ]
                      : mission.dependencies.filter(
                          (edge) =>
                            edge.prerequisiteTaskId !== payload.prerequisiteTaskId ||
                            edge.dependentTaskId !== payload.dependentTaskId,
                        ),
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary:
                        event.type === "mission.dependency-added"
                          ? "Dependency added"
                          : "Dependency removed",
                      taskId: payload.dependentTaskId,
                      occurredAt: event.occurredAt,
                    },
                  ],
                },
          ),
        })),
      );

    case "mission.activated":
    case "mission.completed":
    case "mission.cancelled":
      return decodeForEvent(MissionLifecyclePayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id !== payload.missionId
              ? mission
              : {
                  ...mission,
                  status:
                    event.type === "mission.activated"
                      ? ("active" as const)
                      : event.type === "mission.completed"
                        ? ("completed" as const)
                        : ("cancelled" as const),
                  ...(event.type === "mission.activated"
                    ? { activatedAt: payload.occurredAt }
                    : event.type === "mission.completed"
                      ? { completedAt: payload.occurredAt }
                      : { cancelledAt: payload.occurredAt }),
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary:
                        event.type === "mission.activated"
                          ? "Mission activated"
                          : event.type === "mission.completed"
                            ? "Mission completed"
                            : "Mission cancelled",
                      taskId: null,
                      occurredAt: event.occurredAt,
                    },
                  ],
                },
          ),
        })),
      );

    case "mission.integration-linked":
      return decodeForEvent(
        MissionIntegrationLinkedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: (nextBase.missions ?? []).map((mission) =>
            mission.id === payload.missionId
              ? {
                  ...mission,
                  integrationBatchId: payload.batchId,
                  updatedAt: payload.updatedAt,
                  activities: [
                    ...mission.activities,
                    {
                      id: event.eventId,
                      type: event.type,
                      summary: "Integration Batch linked",
                      taskId: null,
                      occurredAt: event.occurredAt,
                    },
                  ],
                }
              : mission,
          ),
        })),
      );

    case "integration.created":
      return decodeForEvent(IntegrationCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          missions: payload.batch.missionId
            ? (nextBase.missions ?? []).map((mission) =>
                mission.id === payload.batch.missionId
                  ? {
                      ...mission,
                      integrationBatchId: payload.batch.id,
                      updatedAt: payload.batch.updatedAt,
                      activities: [
                        ...mission.activities,
                        {
                          id: event.eventId,
                          type: "mission.integration-linked",
                          summary: "Integration Batch linked",
                          taskId: null,
                          occurredAt: event.occurredAt,
                        },
                      ],
                    }
                  : mission,
              )
            : nextBase.missions,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  integrationBatches: [...(project.integrationBatches ?? []), payload.batch],
                  updatedAt: payload.batch.updatedAt,
                }
              : project,
          ),
        })),
      );

    case "integration.updated":
      return decodeForEvent(IntegrationUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  integrationBatches: (project.integrationBatches ?? []).map((batch) =>
                    batch.id === payload.batch.id ? payload.batch : batch,
                  ),
                  updatedAt: payload.batch.updatedAt,
                }
              : project,
          ),
        })),
      );

    case "integration.continue-requested":
    case "integration.abort-requested":
    case "integration.validation-requested":
    case "integration.workspace-remove-requested":
      return Effect.succeed(nextBase);

    case "task.created":
      return decodeForEvent(TaskCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: [
            ...(nextBase.tasks ?? []),
            {
              id: payload.taskId,
              projectId: payload.projectId,
              title: payload.title,
              objective: payload.objective,
              role: payload.role,
              modelSelection: payload.modelSelection ?? null,
              acceptanceCriteria: payload.acceptanceCriteria ?? [],
              reviewRequired: payload.reviewRequired ?? false,
              preferDifferentReviewerProvider: payload.preferDifferentReviewerProvider ?? true,
              status: "draft" as const,
              threadId: null,
              createdAt: payload.createdAt,
              updatedAt: payload.updatedAt,
              activatedAt: null,
              completedAt: null,
              cancelledAt: null,
              workspace: null,
              ownership:
                payload.ownershipRequired === true
                  ? {
                      required: true,
                      rules: [],
                      status: "unconfigured" as const,
                      validatedAt: null,
                      changedPathCount: 0,
                      violations: [],
                      errorReason: null,
                      updatedAt: payload.updatedAt,
                    }
                  : null,
              reviewSnapshot: null,
              handoff: null,
              restore: null,
              qualityGateRuns: [],
              reviews: [],
            },
          ],
        })),
      );

    case "task.acceptance-criteria-updated":
      return decodeForEvent(
        TaskAcceptanceCriteriaUpdatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? { ...task, acceptanceCriteria: payload.criteria, updatedAt: payload.updatedAt }
              : task,
          ),
        })),
      );

    case "task.thread-bound":
      return decodeForEvent(TaskThreadBoundPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? { ...task, threadId: payload.threadId, updatedAt: payload.updatedAt }
              : task,
          ),
        })),
      );

    case "task.activated":
      return decodeForEvent(TaskActivatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: "active" as const,
                  activatedAt: payload.activatedAt,
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.completed":
      return decodeForEvent(TaskCompletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: "completed" as const,
                  completedAt: payload.completedAt,
                  result: payload.result ?? null,
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.cancelled":
      return decodeForEvent(TaskCancelledPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: "cancelled" as const,
                  cancelledAt: payload.cancelledAt,
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.prepare-requested":
      return decodeForEvent(
        TaskWorkspacePrepareRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  workspace: {
                    status: "preparing" as const,
                    sourceRepository: null,
                    baseCommit: null,
                    branch: null,
                    path: null,
                    createdAt: null,
                    removedAt: null,
                    failureCode: null,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.preparation-started":
      return decodeForEvent(
        TaskWorkspacePreparationStartedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  workspace: {
                    status: "preparing" as const,
                    sourceRepository: payload.sourceRepository,
                    baseCommit: payload.baseCommit,
                    branch: payload.branch,
                    path: null,
                    createdAt: null,
                    removedAt: null,
                    failureCode: null,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.ready":
      return decodeForEvent(TaskWorkspaceReadyPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  workspace: {
                    status: "ready" as const,
                    sourceRepository: payload.sourceRepository,
                    baseCommit: payload.baseCommit,
                    branch: payload.branch,
                    path: payload.path,
                    createdAt: payload.createdAt,
                    removedAt: null,
                    failureCode: null,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.failed":
      return decodeForEvent(TaskWorkspaceFailedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  workspace: {
                    ...(task.workspace ?? {
                      sourceRepository: null,
                      baseCommit: null,
                      branch: null,
                      path: null,
                      createdAt: null,
                      removedAt: null,
                    }),
                    status: "failed" as const,
                    failureCode: payload.failureCode,
                    failureReason: payload.failureReason,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.missing":
      return decodeForEvent(TaskWorkspaceMissingPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.workspace != null
              ? {
                  ...task,
                  workspace: {
                    ...task.workspace,
                    status: "missing" as const,
                    failureCode: "workspace-missing",
                    failureReason: payload.failureReason,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.remove-requested":
      return decodeForEvent(
        TaskWorkspaceRemoveRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.workspace != null
              ? {
                  ...task,
                  workspace: {
                    ...task.workspace,
                    status: "removing" as const,
                    failureCode: null,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.removed":
      return decodeForEvent(TaskWorkspaceRemovedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.workspace != null
              ? {
                  ...task,
                  workspace: {
                    ...task.workspace,
                    status: "removed" as const,
                    removedAt: payload.removedAt,
                    failureCode: null,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.workspace.cleanup-failed":
      return decodeForEvent(
        TaskWorkspaceCleanupFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.workspace != null
              ? {
                  ...task,
                  workspace: {
                    ...task.workspace,
                    status: "ready" as const,
                    failureCode: payload.failureCode,
                    failureReason: payload.failureReason,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.ownership-updated":
      return decodeForEvent(TaskOwnershipUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  ownership: {
                    required: task.ownership?.required ?? false,
                    rules: payload.rules,
                    status: "pending" as const,
                    validatedAt: task.ownership?.validatedAt ?? null,
                    changedPathCount: task.ownership?.changedPathCount ?? 0,
                    violations: task.ownership?.violations ?? [],
                    errorReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.ownership-validation-requested":
      return decodeForEvent(
        TaskOwnershipValidationRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.ownership != null
              ? {
                  ...task,
                  ownership: {
                    ...task.ownership,
                    status: "pending" as const,
                    errorReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.ownership-validated":
      return decodeForEvent(
        TaskOwnershipValidatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.ownership != null
              ? {
                  ...task,
                  ownership: {
                    ...task.ownership,
                    status: payload.status,
                    validatedAt: payload.validatedAt,
                    changedPathCount: payload.changedPathCount,
                    violations: payload.violations,
                    errorReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.ownership-validation-failed":
      return decodeForEvent(
        TaskOwnershipValidationFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.ownership != null
              ? {
                  ...task,
                  ownership: {
                    ...task.ownership,
                    status: "error" as const,
                    validatedAt: payload.validatedAt,
                    errorReason: payload.failureReason,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.review.prepare-requested":
    case "task.completion.freshness-requested":
    case "task.restore.undo-requested": {
      const schema =
        event.type === "task.review.prepare-requested"
          ? TaskReviewPrepareRequestedPayload
          : event.type === "task.completion.freshness-requested"
            ? TaskCompletionFreshnessRequestedPayload
            : TaskRestoreUndoRequestedPayload;
      return decodeForEvent(schema, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviewError:
                    event.type === "task.review.prepare-requested"
                      ? null
                      : (task.reviewError ?? null),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );
    }

    case "task.review.prepare-failed":
      return decodeForEvent(
        TaskReviewPrepareFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviewError: payload.failureReason,
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.review.prepared":
      return decodeForEvent(TaskReviewPreparedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviewSnapshot: payload.snapshot,
                  handoff: payload.handoff,
                  reviewError: null,
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.review.stale":
      return decodeForEvent(TaskReviewStalePayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviewSnapshot: task.reviewSnapshot
                    ? { ...task.reviewSnapshot, status: "stale" as const }
                    : null,
                  handoff: task.handoff ? { ...task.handoff, status: "stale" as const } : null,
                  qualityGateRuns: (task.qualityGateRuns ?? []).map((run) =>
                    run.snapshotId === task.reviewSnapshot?.id
                      ? { ...run, status: "stale" as const }
                      : run,
                  ),
                  reviews: (task.reviews ?? []).map((review) =>
                    review.snapshotId === task.reviewSnapshot?.id
                      ? { ...review, status: "stale" as const }
                      : review,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.quality.run-requested":
      return decodeForEvent(
        TaskQualityRunRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  qualityGateRuns: [...(task.qualityGateRuns ?? []), ...payload.runs],
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.quality.run-started":
    case "task.quality.run-finished":
      return decodeForEvent(
        TaskQualityRunUpdatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  qualityGateRuns: (task.qualityGateRuns ?? []).map((run) =>
                    run.id === payload.run.id ? payload.run : run,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.quality.run-cancel-requested":
      return Effect.succeed(nextBase);

    case "task.independent-review.requested":
      return decodeForEvent(
        TaskIndependentReviewRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviews: [...(task.reviews ?? []), payload.review],
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.independent-review.started":
      return decodeForEvent(
        TaskIndependentReviewStartedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviews: (task.reviews ?? []).map((review) =>
                    review.id === payload.reviewId
                      ? { ...review, status: "running" as const }
                      : review,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.independent-review.completed":
      return decodeForEvent(
        TaskIndependentReviewCompletedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviews: (task.reviews ?? []).map((review) =>
                    review.id === payload.review.id ? payload.review : review,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.independent-review.failed":
      return decodeForEvent(
        TaskIndependentReviewFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviews: (task.reviews ?? []).map((review) =>
                    review.id === payload.reviewId
                      ? {
                          ...review,
                          status: "failed" as const,
                          failureReason: payload.failureReason,
                        }
                      : review,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.review.findings-sent":
      return decodeForEvent(
        TaskReviewFindingsSentPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  reviews: (task.reviews ?? []).map((review) =>
                    review.id === payload.reviewId
                      ? { ...review, findingsSentAt: payload.sentAt }
                      : review,
                  ),
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.handoff.updated":
      return decodeForEvent(TaskHandoffUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? { ...task, handoff: payload.handoff, updatedAt: payload.updatedAt }
              : task,
          ),
        })),
      );

    case "task.restore.requested":
      return decodeForEvent(TaskRestoreRequestedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  restore: {
                    id: payload.restoreId,
                    status: "requested" as const,
                    safetyCheckpointRef: null,
                    previousHead: null,
                    failureReason: null,
                    requestedAt: payload.requestedAt,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.restore.snapshot-captured":
      return decodeForEvent(
        TaskRestoreSnapshotCapturedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.restore?.id === payload.restoreId
              ? {
                  ...task,
                  restore: {
                    ...task.restore,
                    status: "snapshot-captured" as const,
                    safetyCheckpointRef: payload.safetyCheckpointRef,
                    previousHead: payload.previousHead,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.restored":
      return decodeForEvent(TaskRestoredPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.restore?.id === payload.restoreId
              ? {
                  ...task,
                  reviewSnapshot: task.reviewSnapshot
                    ? { ...task.reviewSnapshot, status: "stale" as const }
                    : null,
                  handoff: task.handoff ? { ...task.handoff, status: "stale" as const } : null,
                  restore: {
                    ...task.restore,
                    status: "completed" as const,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.restore.failed":
      return decodeForEvent(TaskRestoreFailedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.restore?.id === payload.restoreId
              ? {
                  ...task,
                  restore: {
                    ...task.restore,
                    status: "failed" as const,
                    failureReason: payload.failureReason,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "task.restore.undone":
      return decodeForEvent(TaskRestoreUndonePayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          tasks: (nextBase.tasks ?? []).map((task) =>
            task.id === payload.taskId && task.restore?.id === payload.restoreId
              ? {
                  ...task,
                  reviewSnapshot: task.reviewSnapshot
                    ? { ...task.reviewSnapshot, status: "stale" as const }
                    : null,
                  handoff: task.handoff ? { ...task.handoff, status: "stale" as const } : null,
                  restore: {
                    ...task.restore,
                    status: "undone" as const,
                    failureReason: null,
                    updatedAt: payload.updatedAt,
                  },
                  updatedAt: payload.updatedAt,
                }
              : task,
          ),
        })),
      );

    case "thread.created":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadCreatedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread: OrchestrationThread = yield* decodeForEvent(
          OrchestrationThread,
          {
            id: payload.threadId,
            projectId: payload.projectId,
            title: payload.title,
            modelSelection: payload.modelSelection,
            runtimeMode: payload.runtimeMode,
            interactionMode: payload.interactionMode,
            branch: payload.branch,
            worktreePath: payload.worktreePath,
            latestTurn: null,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            archivedAt: null,
            settledOverride: null,
            settledAt: null,
            snoozedUntil: null,
            snoozedAt: null,
            deletedAt: null,
            messages: [],
            activities: [],
            checkpoints: [],
            session: null,
          },
          event.type,
          "thread",
        );
        const existing = nextBase.threads.find((entry) => entry.id === thread.id);
        return {
          ...nextBase,
          threads: existing
            ? nextBase.threads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...nextBase.threads, thread],
        };
      });

    case "thread.deleted":
      return decodeForEvent(ThreadDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            deletedAt: payload.deletedAt,
            updatedAt: payload.deletedAt,
          }),
        })),
      );

    case "thread.archived":
      return decodeForEvent(ThreadArchivedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            archivedAt: payload.archivedAt,
            titleRegeneration: null,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.unarchived":
      return decodeForEvent(ThreadUnarchivedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            archivedAt: null,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.settled":
      return decodeForEvent(ThreadSettledPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            settledOverride: "settled",
            settledAt: payload.settledAt,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.unsettled":
      return decodeForEvent(ThreadUnsettledPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            settledOverride: payload.reason === "user" ? "active" : null,
            settledAt: null,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.snoozed":
      return decodeForEvent(ThreadSnoozedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            snoozedUntil: payload.snoozedUntil,
            snoozedAt: payload.snoozedAt,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.unsnoozed":
      return decodeForEvent(ThreadUnsnoozedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            snoozedUntil: null,
            snoozedAt: null,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.pinned":
      return decodeForEvent(ThreadPinnedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            pinnedAt: payload.pinnedAt,
            ...(payload.pinOrderKey !== undefined ? { pinOrderKey: payload.pinOrderKey } : {}),
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.unpinned":
      return decodeForEvent(ThreadUnpinnedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            pinnedAt: null,
            // Unpin clears the slot: re-pinning is "pin again", not "restore
            // an ancient position".
            pinOrderKey: null,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.pin-reordered":
      return decodeForEvent(ThreadPinReorderedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            pinOrderKey: payload.orderKey,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.meta-updated":
      return decodeForEvent(ThreadMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.titleRegeneration !== undefined
              ? { titleRegeneration: payload.titleRegeneration }
              : {}),
            ...(payload.modelSelection !== undefined
              ? { modelSelection: payload.modelSelection }
              : {}),
            ...(payload.branch !== undefined ? { branch: payload.branch } : {}),
            ...(payload.worktreePath !== undefined ? { worktreePath: payload.worktreePath } : {}),
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.runtime-mode-set":
      return decodeForEvent(ThreadRuntimeModeSetPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            runtimeMode: payload.runtimeMode,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.interaction-mode-set":
      return decodeForEvent(
        ThreadInteractionModeSetPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            interactionMode: payload.interactionMode,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.message-sent":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          MessageSentPayloadSchema,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const message: OrchestrationMessage = yield* decodeForEvent(
          OrchestrationMessage,
          {
            id: payload.messageId,
            role: payload.role,
            text: payload.text,
            ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
            turnId: payload.turnId,
            streaming: payload.streaming,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          },
          event.type,
          "message",
        );

        const existingMessage = thread.messages.find((entry) => entry.id === message.id);
        const messages = existingMessage
          ? thread.messages.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    text: message.streaming
                      ? `${entry.text}${message.text}`
                      : message.text.length > 0
                        ? message.text
                        : entry.text,
                    streaming: message.streaming,
                    updatedAt: message.updatedAt,
                    turnId: message.turnId,
                    ...(message.attachments !== undefined
                      ? { attachments: message.attachments }
                      : {}),
                  }
                : entry,
            )
          : [...thread.messages, message];
        const cappedMessages = messages.slice(-MAX_THREAD_MESSAGES);

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            messages: cappedMessages,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.session-set":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadSessionSetPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const session: OrchestrationSession = yield* decodeForEvent(
          OrchestrationSession,
          payload.session,
          event.type,
          "session",
        );

        // Leaving the "running" session status is the turn-end signal: settle
        // a still-running latest turn so its duration reflects the whole turn.
        const settledTurnState = settledTurnStateForSessionStatus(session.status);
        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            session,
            latestTurn:
              session.status === "running" && session.activeTurnId !== null
                ? {
                    turnId: session.activeTurnId,
                    state: "running",
                    requestedAt:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? thread.latestTurn.requestedAt
                        : session.updatedAt,
                    startedAt:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? (thread.latestTurn.startedAt ?? session.updatedAt)
                        : session.updatedAt,
                    completedAt: null,
                    assistantMessageId:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? thread.latestTurn.assistantMessageId
                        : null,
                  }
                : thread.latestTurn !== null &&
                    thread.latestTurn.state === "running" &&
                    settledTurnState !== null
                  ? {
                      ...thread.latestTurn,
                      state: settledTurnState,
                      // A running turn's completedAt can only hold a mid-turn
                      // placeholder checkpoint timestamp — the session leaving
                      // "running" is the authoritative turn end.
                      completedAt: session.updatedAt,
                    }
                  : thread.latestTurn,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.proposed-plan-upserted":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadProposedPlanUpsertedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const proposedPlans = [
          ...thread.proposedPlans.filter((entry) => entry.id !== payload.proposedPlan.id),
          payload.proposedPlan,
        ]
          .toSorted(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
          .slice(-200);

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            proposedPlans,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.turn-diff-completed":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadTurnDiffCompletedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const checkpoint = yield* decodeForEvent(
          OrchestrationCheckpointSummary,
          {
            turnId: payload.turnId,
            checkpointTurnCount: payload.checkpointTurnCount,
            checkpointRef: payload.checkpointRef,
            status: payload.status,
            files: payload.files,
            assistantMessageId: payload.assistantMessageId,
            completedAt: payload.completedAt,
          },
          event.type,
          "checkpoint",
        );

        // Do not let a placeholder (status "missing") overwrite a checkpoint
        // that has already been captured with a real git ref (status "ready").
        // ProviderRuntimeIngestion may fire multiple turn.diff.updated events
        // per turn; without this guard later placeholders would clobber the
        // real capture dispatched by CheckpointReactor.
        const existing = thread.checkpoints.find((entry) => entry.turnId === checkpoint.turnId);
        if (existing && existing.status !== "missing" && checkpoint.status === "missing") {
          return nextBase;
        }

        const checkpoints = [
          ...thread.checkpoints.filter((entry) => entry.turnId !== checkpoint.turnId),
          checkpoint,
        ]
          .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
          .slice(-MAX_THREAD_CHECKPOINTS);

        // Mid-turn diff updates produce placeholder checkpoints; record the
        // checkpoint, but don't settle a turn its session is still running.
        const turnStillRunning =
          thread.session?.status === "running" && thread.session.activeTurnId === payload.turnId;

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            checkpoints,
            latestTurn: turnStillRunning
              ? thread.latestTurn
              : {
                  turnId: payload.turnId,
                  state: checkpointStatusToLatestTurnState(payload.status),
                  requestedAt:
                    thread.latestTurn?.turnId === payload.turnId
                      ? thread.latestTurn.requestedAt
                      : payload.completedAt,
                  startedAt:
                    thread.latestTurn?.turnId === payload.turnId
                      ? (thread.latestTurn.startedAt ?? payload.completedAt)
                      : payload.completedAt,
                  completedAt: payload.completedAt,
                  assistantMessageId: payload.assistantMessageId,
                },
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.reverted":
      return decodeForEvent(ThreadRevertedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const checkpoints = thread.checkpoints
            .filter((entry) => entry.checkpointTurnCount <= payload.turnCount)
            .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
            .slice(-MAX_THREAD_CHECKPOINTS);
          const retainedTurnIds = new Set(checkpoints.map((checkpoint) => checkpoint.turnId));
          const messages = retainThreadMessagesAfterRevert(
            thread.messages,
            retainedTurnIds,
            payload.turnCount,
          ).slice(-MAX_THREAD_MESSAGES);
          const proposedPlans = retainThreadProposedPlansAfterRevert(
            thread.proposedPlans,
            retainedTurnIds,
          ).slice(-200);
          const activities = retainThreadActivitiesAfterRevert(thread.activities, retainedTurnIds);

          const latestCheckpoint = checkpoints.at(-1) ?? null;
          const latestTurn =
            latestCheckpoint === null
              ? null
              : {
                  turnId: latestCheckpoint.turnId,
                  state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
                  requestedAt: latestCheckpoint.completedAt,
                  startedAt: latestCheckpoint.completedAt,
                  completedAt: latestCheckpoint.completedAt,
                  assistantMessageId: latestCheckpoint.assistantMessageId,
                };

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              checkpoints,
              messages,
              proposedPlans,
              activities,
              latestTurn,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );

    case "thread.activity-appended":
      return decodeForEvent(
        ThreadActivityAppendedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const activities = [
            ...thread.activities.filter((entry) => entry.id !== payload.activity.id),
            payload.activity,
          ]
            .toSorted(compareThreadActivities)
            .slice(-500);

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              activities,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );

    default:
      return Effect.succeed(nextBase);
  }
}
