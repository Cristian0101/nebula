import {
  CommandId,
  EventId,
  IntegrationBatchId,
  ProjectId,
  ProviderDriverKind,
  TaskId,
  TaskResultId,
  TaskReviewSnapshotId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { it as effectIt } from "@effect/vitest";
import { describe, expect, it } from "vite-plus/test";

import { createEmptyReadModel, projectEvent } from "./projector.ts";

function makeEvent(input: {
  sequence: number;
  type: OrchestrationEvent["type"];
  occurredAt: string;
  aggregateKind: OrchestrationEvent["aggregateKind"];
  aggregateId: string;
  commandId: string | null;
  payload: unknown;
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.make(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: input.aggregateKind,
    aggregateId:
      input.aggregateKind === "project"
        ? ProjectId.make(input.aggregateId)
        : ThreadId.make(input.aggregateId),
    occurredAt: input.occurredAt,
    commandId: input.commandId === null ? null : CommandId.make(input.commandId),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload as never,
  } as OrchestrationEvent;
}

describe("orchestration projector", () => {
  it("reconstructs conflicted and Ready Integration Batches from durable events", async () => {
    const now = "2026-08-22T12:00:00.000Z";
    const projectId = ProjectId.make("project-integration-restart");
    const batchId = IntegrationBatchId.make("batch-integration-restart");
    const taskId = TaskId.make("task-integration-restart");
    const baseBatch = {
      id: batchId,
      projectId,
      title: "Integration restart",
      baseCommit: "a".repeat(40),
      sourceRepository: "/tmp/source",
      branch: "nebula/integration/restart",
      workspacePath: "/tmp/integration",
      status: "preparing" as const,
      tasks: [
        {
          taskId,
          taskResultId: TaskResultId.make("task-result-integration-restart"),
          snapshotId: TaskReviewSnapshotId.make("snapshot-integration-restart"),
          order: 0,
          status: "pending" as const,
          artifact: null,
          appliedCommit: null,
        },
      ],
      overlapPaths: [],
      overlapsAcknowledged: false,
      conflict: null,
      validationSnapshot: null,
      qualityGateRuns: [],
      humanChanges: [],
      failureCode: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      readyAt: null,
      removedAt: null,
    };
    const events = [
      makeEvent({
        sequence: 1,
        type: "project.created",
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: now,
        commandId: "create-project-integration-restart",
        payload: {
          projectId,
          title: "Integration restart",
          workspaceRoot: "/tmp/source",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
      makeEvent({
        sequence: 2,
        type: "integration.created",
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: now,
        commandId: "create-integration-restart",
        payload: { projectId, batch: baseBatch },
      }),
      makeEvent({
        sequence: 3,
        type: "integration.updated",
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: now,
        commandId: "conflict-integration-restart",
        payload: {
          projectId,
          reason: "conflict-detected",
          batch: {
            ...baseBatch,
            status: "conflict",
            tasks: [{ ...baseBatch.tasks[0], status: "conflict" }],
            conflict: {
              taskId,
              artifactCommit: "b".repeat(40),
              files: ["src/shared.ts"],
              appliedTaskIds: [],
              remainingTaskIds: [],
              detectedAt: now,
            },
          },
        },
      }),
    ];
    let reconstructed = createEmptyReadModel(now);
    for (const current of events)
      reconstructed = await Effect.runPromise(projectEvent(reconstructed, current));
    expect(reconstructed.projects[0]?.integrationBatches?.[0]).toMatchObject({
      status: "conflict",
      conflict: { files: ["src/shared.ts"] },
    });

    const readyAt = "2026-08-22T12:01:00.000Z";
    reconstructed = await Effect.runPromise(
      projectEvent(
        reconstructed,
        makeEvent({
          sequence: 4,
          type: "integration.updated",
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: readyAt,
          commandId: "ready-integration-restart",
          payload: {
            projectId,
            reason: "validation-finished",
            batch: {
              ...baseBatch,
              status: "ready",
              tasks: [
                {
                  ...baseBatch.tasks[0],
                  status: "applied",
                  appliedCommit: "c".repeat(40),
                },
              ],
              validationSnapshot: {
                headCommit: "c".repeat(40),
                treeId: "d".repeat(40),
                status: "current",
                capturedAt: readyAt,
              },
              updatedAt: readyAt,
              readyAt,
            },
          },
        }),
      ),
    );
    expect(reconstructed.projects[0]?.integrationBatches?.[0]).toMatchObject({
      status: "ready",
      readyAt,
      conflict: null,
    });
  });

  it("reconstructs a completed Mission report and exact Integration SHA in a new projection", async () => {
    const now = "2026-08-29T12:00:00.000Z";
    const completedAt = "2026-08-29T12:05:00.000Z";
    const finalIntegrationCommit = "f".repeat(40);
    const run = {
      id: "mission-run-history",
      missionId: "mission-history",
      projectId: "project-history",
      mode: "supervised_swarm",
      status: "completed",
      maxConcurrentTasks: 2,
      currentReadyTaskIds: [],
      scheduledTaskIds: [],
      attention: [],
      attentionReason: null,
      decisions: [],
      startedAt: now,
      pausedAt: null,
      completedAt,
      stoppedAt: null,
      failedAt: null,
      failureReason: null,
      taskRecovery: [
        {
          taskId: "task-history",
          transientRetries: 1,
          remediationRounds: 1,
          attempts: [
            {
              number: 1,
              kind: "initial",
              providerInstanceId: "antigravity",
              threadId: "thread-history-1",
              status: "failed",
              failureClass: "transport_transient",
              summary: "network timeout",
              startedAt: now,
              completedAt: "2026-08-29T12:01:00.000Z",
            },
            {
              number: 2,
              kind: "retry",
              providerInstanceId: "antigravity",
              threadId: "thread-history-1",
              status: "completed",
              failureClass: null,
              summary: "retry completed",
              startedAt: "2026-08-29T12:01:00.000Z",
              completedAt: "2026-08-29T12:02:00.000Z",
            },
          ],
          latestFailureClass: null,
          latestFailureSignature: null,
          attentionRequired: false,
          updatedAt: completedAt,
        },
      ],
      integrationBatchId: "batch-history",
      finalReport: {
        missionObjective: "Prove completed Mission history.",
        planVersion: 2,
        planVersionCount: 2,
        taskIds: ["task-history"],
        completedTaskIds: ["task-history"],
        attemptCount: 2,
        providersUsed: ["antigravity"],
        providerReplacementCount: 0,
        appliedReplanCount: 1,
        replanTriggers: ["assumption_invalidated"],
        replanScopes: ["mission_subgraph"],
        retryCount: 1,
        remediationRoundCount: 1,
        qualityGateCount: 1,
        reviewCount: 2,
        finalGateResults: [],
        filesChanged: ["src/history.ts"],
        integrationBranch: "nebula/integration/history",
        baseCommit: "a".repeat(40),
        finalIntegrationCommit,
        finalValidation: "ready",
        humanInterventionCount: 1,
        knownRisks: ["Missing required test evidence."],
        historicalRisks: ["Missing required test evidence."],
        resolvedRisks: ["Missing required test evidence."],
        remainingRisks: [],
        followUps: [],
        elapsedMilliseconds: 300_000,
        generatedAt: completedAt,
      },
      updatedAt: completedAt,
    };
    const events = [
      makeEvent({
        sequence: 1,
        type: "project.created",
        aggregateKind: "project",
        aggregateId: "project-history",
        occurredAt: now,
        commandId: "create-project-history",
        payload: {
          projectId: "project-history",
          title: "History fixture",
          workspaceRoot: "/tmp/history",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
      makeEvent({
        sequence: 2,
        type: "mission.run.reconciled",
        aggregateKind: "mission",
        aggregateId: "mission-history",
        occurredAt: completedAt,
        commandId: "complete-mission-history",
        payload: { run },
      }),
    ];
    const project = async () => {
      let model = createEmptyReadModel(now);
      for (const event of events) model = await Effect.runPromise(projectEvent(model, event));
      return model;
    };

    const firstSession = await project();
    const newFrontendSession = await project();
    expect(newFrontendSession.missionRuns?.[0]).toEqual(firstSession.missionRuns?.[0]);
    expect(newFrontendSession.missionRuns?.[0]).toMatchObject({
      status: "completed",
      completedAt,
      integrationBatchId: "batch-history",
      finalReport: {
        attemptCount: 2,
        retryCount: 1,
        planVersionCount: 2,
        appliedReplanCount: 1,
        historicalRisks: ["Missing required test evidence."],
        resolvedRisks: ["Missing required test evidence."],
        remainingRisks: [],
        finalIntegrationCommit,
        finalValidation: "ready",
      },
    });
  });

  it("applies thread.created events", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const model = createEmptyReadModel(now);

    const next = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-thread-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    expect(next.snapshotSequence).toBe(1);
    expect(next.threads).toEqual([
      {
        id: "thread-1",
        projectId: "project-1",
        title: "demo",
        modelSelection: {
          instanceId: "codex",
          model: "gpt-5-codex",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ]);
  });

  it("fails when event payload cannot be decoded by runtime schema", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const model = createEmptyReadModel(now);

    await expect(
      Effect.runPromise(
        projectEvent(
          model,
          makeEvent({
            sequence: 1,
            type: "thread.created",
            aggregateKind: "thread",
            aggregateId: "thread-1",
            occurredAt: now,
            commandId: "cmd-invalid",
            payload: {
              // missing required threadId
              projectId: "project-1",
              title: "demo",
              modelSelection: {
                provider: ProviderDriverKind.make("codex"),
                model: "gpt-5-codex",
              },
              branch: null,
              worktreePath: null,
              createdAt: now,
              updatedAt: now,
            },
          }),
        ),
      ),
    ).rejects.toBeDefined();
  });

  it("applies thread.archived and thread.unarchived events", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const later = "2026-01-01T00:00:01.000Z";
    const created = await Effect.runPromise(
      projectEvent(
        createEmptyReadModel(now),
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: now,
          commandId: "cmd-thread-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5-codex",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
    );

    const archived = await Effect.runPromise(
      projectEvent(
        created,
        makeEvent({
          sequence: 2,
          type: "thread.archived",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: later,
          commandId: "cmd-thread-archive",
          payload: {
            threadId: "thread-1",
            archivedAt: later,
            updatedAt: later,
          },
        }),
      ),
    );
    expect(archived.threads[0]?.archivedAt).toBe(later);

    const unarchived = await Effect.runPromise(
      projectEvent(
        archived,
        makeEvent({
          sequence: 3,
          type: "thread.unarchived",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: later,
          commandId: "cmd-thread-unarchive",
          payload: {
            threadId: "thread-1",
            updatedAt: later,
          },
        }),
      ),
    );
    expect(unarchived.threads[0]?.archivedAt).toBeNull();
  });

  it("keeps projector forward-compatible for unhandled event types", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const model = createEmptyReadModel(now);

    const next = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 7,
          type: "thread.turn-start-requested",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: "2026-01-01T00:00:00.000Z",
          commandId: "cmd-unhandled",
          payload: {
            threadId: "thread-1",
            messageId: "message-1",
            runtimeMode: "approval-required",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    );

    expect(next.snapshotSequence).toBe(7);
    expect(next.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(next.threads).toEqual([]);
  });

  it("tracks latest turn id from session lifecycle events", async () => {
    const createdAt = "2026-02-23T08:00:00.000Z";
    const startedAt = "2026-02-23T08:00:05.000Z";
    const model = createEmptyReadModel(createdAt);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: createdAt,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5.3-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      ),
    );

    const settledAt = "2026-02-23T08:01:00.000Z";
    const [afterRunning, afterReady] = await Effect.runPromise(
      Effect.flatMap(
        projectEvent(
          afterCreate,
          makeEvent({
            sequence: 2,
            type: "thread.session-set",
            aggregateKind: "thread",
            aggregateId: "thread-1",
            occurredAt: startedAt,
            commandId: "cmd-running",
            payload: {
              threadId: "thread-1",
              session: {
                threadId: "thread-1",
                status: "running",
                providerName: "codex",
                providerSessionId: "session-1",
                providerThreadId: "provider-thread-1",
                runtimeMode: "approval-required",
                activeTurnId: "turn-1",
                lastError: null,
                updatedAt: startedAt,
              },
            },
          }),
        ),
        (running) =>
          Effect.map(
            projectEvent(
              running,
              makeEvent({
                sequence: 3,
                type: "thread.session-set",
                aggregateKind: "thread",
                aggregateId: "thread-1",
                occurredAt: settledAt,
                commandId: "cmd-ready",
                payload: {
                  threadId: "thread-1",
                  session: {
                    threadId: "thread-1",
                    status: "ready",
                    providerName: "codex",
                    providerSessionId: "session-1",
                    providerThreadId: "provider-thread-1",
                    runtimeMode: "approval-required",
                    activeTurnId: null,
                    lastError: null,
                    updatedAt: settledAt,
                  },
                },
              }),
            ),
            (ready) => [running, ready] as const,
          ),
      ),
    );

    const thread = afterRunning.threads[0];
    expect(thread?.latestTurn?.turnId).toBe("turn-1");
    expect(thread?.session?.status).toBe("running");

    // Leaving the "running" session status settles the running turn with the
    // session timestamp as the turn end.
    const settledThread = afterReady.threads[0];
    expect(settledThread?.latestTurn?.turnId).toBe("turn-1");
    expect(settledThread?.latestTurn?.state).toBe("completed");
    expect(settledThread?.latestTurn?.completedAt).toBe(settledAt);
  });

  it("updates canonical thread runtime mode from thread.runtime-mode-set", async () => {
    const createdAt = "2026-02-23T08:00:00.000Z";
    const updatedAt = "2026-02-23T08:00:05.000Z";
    const model = createEmptyReadModel(createdAt);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: createdAt,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5.3-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      ),
    );

    const afterUpdate = await Effect.runPromise(
      projectEvent(
        afterCreate,
        makeEvent({
          sequence: 2,
          type: "thread.runtime-mode-set",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: updatedAt,
          commandId: "cmd-runtime-mode-set",
          payload: {
            threadId: "thread-1",
            runtimeMode: "approval-required",
            updatedAt,
          },
        }),
      ),
    );

    expect(afterUpdate.threads[0]?.runtimeMode).toBe("approval-required");
    expect(afterUpdate.threads[0]?.updatedAt).toBe(updatedAt);
  });

  it("marks assistant messages completed with non-streaming updates", async () => {
    const createdAt = "2026-02-23T09:00:00.000Z";
    const deltaAt = "2026-02-23T09:00:01.000Z";
    const completeAt = "2026-02-23T09:00:03.500Z";
    const model = createEmptyReadModel(createdAt);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: createdAt,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5.3-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      ),
    );

    const afterDelta = await Effect.runPromise(
      projectEvent(
        afterCreate,
        makeEvent({
          sequence: 2,
          type: "thread.message-sent",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: deltaAt,
          commandId: "cmd-delta",
          payload: {
            threadId: "thread-1",
            messageId: "assistant:msg-1",
            role: "assistant",
            text: "hello",
            turnId: "turn-1",
            streaming: true,
            createdAt: deltaAt,
            updatedAt: deltaAt,
          },
        }),
      ),
    );

    const afterComplete = await Effect.runPromise(
      projectEvent(
        afterDelta,
        makeEvent({
          sequence: 3,
          type: "thread.message-sent",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: completeAt,
          commandId: "cmd-complete",
          payload: {
            threadId: "thread-1",
            messageId: "assistant:msg-1",
            role: "assistant",
            text: "",
            turnId: "turn-1",
            streaming: false,
            createdAt: completeAt,
            updatedAt: completeAt,
          },
        }),
      ),
    );

    const message = afterComplete.threads[0]?.messages[0];
    expect(message?.id).toBe("assistant:msg-1");
    expect(message?.text).toBe("hello");
    expect(message?.streaming).toBe(false);
    expect(message?.updatedAt).toBe(completeAt);
  });

  it("prunes reverted turn messages from in-memory thread snapshot", async () => {
    const createdAt = "2026-02-23T10:00:00.000Z";
    const model = createEmptyReadModel(createdAt);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-1",
          occurredAt: createdAt,
          commandId: "cmd-create",
          payload: {
            threadId: "thread-1",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5.3-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      ),
    );

    const events: ReadonlyArray<OrchestrationEvent> = [
      makeEvent({
        sequence: 2,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:01.000Z",
        commandId: "cmd-user-1",
        payload: {
          threadId: "thread-1",
          messageId: "user-msg-1",
          role: "user",
          text: "First edit",
          turnId: null,
          streaming: false,
          createdAt: "2026-02-23T10:00:01.000Z",
          updatedAt: "2026-02-23T10:00:01.000Z",
        },
      }),
      makeEvent({
        sequence: 3,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:02.000Z",
        commandId: "cmd-assistant-1",
        payload: {
          threadId: "thread-1",
          messageId: "assistant-msg-1",
          role: "assistant",
          text: "Updated README to v2.\n",
          turnId: "turn-1",
          streaming: false,
          createdAt: "2026-02-23T10:00:02.000Z",
          updatedAt: "2026-02-23T10:00:02.000Z",
        },
      }),
      makeEvent({
        sequence: 4,
        type: "thread.turn-diff-completed",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:02.500Z",
        commandId: "cmd-turn-1-complete",
        payload: {
          threadId: "thread-1",
          turnId: "turn-1",
          checkpointTurnCount: 1,
          checkpointRef: "refs/t3/checkpoints/thread-1/turn/1",
          status: "ready",
          files: [],
          assistantMessageId: "assistant-msg-1",
          completedAt: "2026-02-23T10:00:02.500Z",
        },
      }),
      makeEvent({
        sequence: 5,
        type: "thread.activity-appended",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:02.750Z",
        commandId: "cmd-activity-1",
        payload: {
          threadId: "thread-1",
          activity: {
            id: "activity-1",
            tone: "tool",
            kind: "tool.started",
            summary: "Edit file started",
            payload: { toolKind: "command" },
            turnId: "turn-1",
            createdAt: "2026-02-23T10:00:02.750Z",
          },
        },
      }),
      makeEvent({
        sequence: 6,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:03.000Z",
        commandId: "cmd-user-2",
        payload: {
          threadId: "thread-1",
          messageId: "user-msg-2",
          role: "user",
          text: "Second edit",
          turnId: null,
          streaming: false,
          createdAt: "2026-02-23T10:00:03.000Z",
          updatedAt: "2026-02-23T10:00:03.000Z",
        },
      }),
      makeEvent({
        sequence: 7,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:04.000Z",
        commandId: "cmd-assistant-2",
        payload: {
          threadId: "thread-1",
          messageId: "assistant-msg-2",
          role: "assistant",
          text: "Updated README to v3.\n",
          turnId: "turn-2",
          streaming: false,
          createdAt: "2026-02-23T10:00:04.000Z",
          updatedAt: "2026-02-23T10:00:04.000Z",
        },
      }),
      makeEvent({
        sequence: 8,
        type: "thread.turn-diff-completed",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:04.500Z",
        commandId: "cmd-turn-2-complete",
        payload: {
          threadId: "thread-1",
          turnId: "turn-2",
          checkpointTurnCount: 2,
          checkpointRef: "refs/t3/checkpoints/thread-1/turn/2",
          status: "ready",
          files: [],
          assistantMessageId: "assistant-msg-2",
          completedAt: "2026-02-23T10:00:04.500Z",
        },
      }),
      makeEvent({
        sequence: 9,
        type: "thread.activity-appended",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:04.750Z",
        commandId: "cmd-activity-2",
        payload: {
          threadId: "thread-1",
          activity: {
            id: "activity-2",
            tone: "tool",
            kind: "tool.completed",
            summary: "Edit file complete",
            payload: { toolKind: "command" },
            turnId: "turn-2",
            createdAt: "2026-02-23T10:00:04.750Z",
          },
        },
      }),
      makeEvent({
        sequence: 10,
        type: "thread.reverted",
        aggregateKind: "thread",
        aggregateId: "thread-1",
        occurredAt: "2026-02-23T10:00:05.000Z",
        commandId: "cmd-revert",
        payload: {
          threadId: "thread-1",
          turnCount: 1,
        },
      }),
    ];

    const afterRevert = await events.reduce<Promise<ReturnType<typeof createEmptyReadModel>>>(
      (statePromise, event) =>
        statePromise.then((state) => Effect.runPromise(projectEvent(state, event))),
      Promise.resolve(afterCreate),
    );

    const thread = afterRevert.threads[0];
    expect(thread?.messages.map((message) => ({ role: message.role, text: message.text }))).toEqual(
      [
        { role: "user", text: "First edit" },
        { role: "assistant", text: "Updated README to v2.\n" },
      ],
    );
    expect(
      thread?.activities.map((activity) => ({ id: activity.id, turnId: activity.turnId })),
    ).toEqual([{ id: "activity-1", turnId: "turn-1" }]);
    expect(thread?.checkpoints.map((checkpoint) => checkpoint.checkpointTurnCount)).toEqual([1]);
    expect(thread?.latestTurn?.turnId).toBe("turn-1");
  });

  it("does not fallback-retain messages tied to removed turn IDs", async () => {
    const createdAt = "2026-02-26T12:00:00.000Z";
    const model = createEmptyReadModel(createdAt);

    const afterCreate = await Effect.runPromise(
      projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-revert",
          occurredAt: createdAt,
          commandId: "cmd-create-revert",
          payload: {
            threadId: "thread-revert",
            projectId: "project-1",
            title: "demo",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5.3-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      ),
    );

    const events: ReadonlyArray<OrchestrationEvent> = [
      makeEvent({
        sequence: 2,
        type: "thread.turn-diff-completed",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:01.000Z",
        commandId: "cmd-turn-1",
        payload: {
          threadId: "thread-revert",
          turnId: "turn-1",
          checkpointTurnCount: 1,
          checkpointRef: "refs/t3/checkpoints/thread-revert/turn/1",
          status: "ready",
          files: [],
          assistantMessageId: "assistant-keep",
          completedAt: "2026-02-26T12:00:01.000Z",
        },
      }),
      makeEvent({
        sequence: 3,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:01.100Z",
        commandId: "cmd-assistant-keep",
        payload: {
          threadId: "thread-revert",
          messageId: "assistant-keep",
          role: "assistant",
          text: "kept",
          turnId: "turn-1",
          streaming: false,
          createdAt: "2026-02-26T12:00:01.100Z",
          updatedAt: "2026-02-26T12:00:01.100Z",
        },
      }),
      makeEvent({
        sequence: 4,
        type: "thread.turn-diff-completed",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:02.000Z",
        commandId: "cmd-turn-2",
        payload: {
          threadId: "thread-revert",
          turnId: "turn-2",
          checkpointTurnCount: 2,
          checkpointRef: "refs/t3/checkpoints/thread-revert/turn/2",
          status: "ready",
          files: [],
          assistantMessageId: "assistant-remove",
          completedAt: "2026-02-26T12:00:02.000Z",
        },
      }),
      makeEvent({
        sequence: 5,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:02.050Z",
        commandId: "cmd-user-remove",
        payload: {
          threadId: "thread-revert",
          messageId: "user-remove",
          role: "user",
          text: "removed",
          turnId: "turn-2",
          streaming: false,
          createdAt: "2026-02-26T12:00:02.050Z",
          updatedAt: "2026-02-26T12:00:02.050Z",
        },
      }),
      makeEvent({
        sequence: 6,
        type: "thread.message-sent",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:02.100Z",
        commandId: "cmd-assistant-remove",
        payload: {
          threadId: "thread-revert",
          messageId: "assistant-remove",
          role: "assistant",
          text: "removed",
          turnId: "turn-2",
          streaming: false,
          createdAt: "2026-02-26T12:00:02.100Z",
          updatedAt: "2026-02-26T12:00:02.100Z",
        },
      }),
      makeEvent({
        sequence: 7,
        type: "thread.reverted",
        aggregateKind: "thread",
        aggregateId: "thread-revert",
        occurredAt: "2026-02-26T12:00:03.000Z",
        commandId: "cmd-revert",
        payload: {
          threadId: "thread-revert",
          turnCount: 1,
        },
      }),
    ];

    const afterRevert = await events.reduce<Promise<ReturnType<typeof createEmptyReadModel>>>(
      (statePromise, event) =>
        statePromise.then((state) => Effect.runPromise(projectEvent(state, event))),
      Promise.resolve(afterCreate),
    );

    const thread = afterRevert.threads[0];
    expect(
      thread?.messages.map((message) => ({
        id: message.id,
        role: message.role,
        turnId: message.turnId,
      })),
    ).toEqual([{ id: "assistant-keep", role: "assistant", turnId: "turn-1" }]);
  });

  effectIt.effect("caps message and checkpoint retention for long-lived threads", () =>
    Effect.gen(function* () {
      const createdAt = "2026-03-01T10:00:00.000Z";
      const model = createEmptyReadModel(createdAt);

      const afterCreate = yield* projectEvent(
        model,
        makeEvent({
          sequence: 1,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: "thread-capped",
          occurredAt: createdAt,
          commandId: "cmd-create-capped",
          payload: {
            threadId: "thread-capped",
            projectId: "project-1",
            title: "capped",
            modelSelection: {
              provider: ProviderDriverKind.make("codex"),
              model: "gpt-5-codex",
            },
            runtimeMode: "full-access",
            branch: null,
            worktreePath: null,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      );

      const messageEvents: ReadonlyArray<OrchestrationEvent> = Array.from(
        { length: 2_100 },
        (_, index) =>
          makeEvent({
            sequence: index + 2,
            type: "thread.message-sent",
            aggregateKind: "thread",
            aggregateId: "thread-capped",
            occurredAt: `2026-03-01T10:00:${String(index % 60).padStart(2, "0")}.000Z`,
            commandId: `cmd-message-${index}`,
            payload: {
              threadId: "thread-capped",
              messageId: `msg-${index}`,
              role: "assistant",
              text: `message-${index}`,
              turnId: `turn-${index}`,
              streaming: false,
              createdAt: `2026-03-01T10:00:${String(index % 60).padStart(2, "0")}.000Z`,
              updatedAt: `2026-03-01T10:00:${String(index % 60).padStart(2, "0")}.000Z`,
            },
          }),
      );
      const afterMessages = yield* Effect.reduce(
        messageEvents,
        () => afterCreate,
        (state, event) => projectEvent(state, event),
      );

      const checkpointEvents: ReadonlyArray<OrchestrationEvent> = Array.from(
        { length: 600 },
        (_, index) =>
          makeEvent({
            sequence: index + 2_102,
            type: "thread.turn-diff-completed",
            aggregateKind: "thread",
            aggregateId: "thread-capped",
            occurredAt: `2026-03-01T10:30:${String(index % 60).padStart(2, "0")}.000Z`,
            commandId: `cmd-checkpoint-${index}`,
            payload: {
              threadId: "thread-capped",
              turnId: `turn-${index}`,
              checkpointTurnCount: index + 1,
              checkpointRef: `refs/t3/checkpoints/thread-capped/turn/${index + 1}`,
              status: "ready",
              files: [],
              assistantMessageId: `msg-${index}`,
              completedAt: `2026-03-01T10:30:${String(index % 60).padStart(2, "0")}.000Z`,
            },
          }),
      );
      const finalState = yield* Effect.reduce(
        checkpointEvents,
        () => afterMessages,
        (state, event) => projectEvent(state, event),
      );

      const thread = finalState.threads[0];
      expect(thread?.messages).toHaveLength(2_000);
      expect(thread?.messages[0]?.id).toBe("msg-100");
      expect(thread?.messages.at(-1)?.id).toBe("msg-2099");
      expect(thread?.checkpoints).toHaveLength(500);
      expect(thread?.checkpoints[0]?.turnId).toBe("turn-100");
      expect(thread?.checkpoints.at(-1)?.turnId).toBe("turn-599");
    }),
  );
});
