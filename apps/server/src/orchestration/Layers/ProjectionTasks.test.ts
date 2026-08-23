import {
  CommandId,
  CheckpointRef,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  TaskHandoffId,
  TaskReviewSnapshotId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { makeSqlitePersistenceLive } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";

it.effect("restores Task status and Thread association after a projection restart", () =>
  Effect.gen(function* () {
    const { dbPath } = yield* ServerConfig;
    const persistenceLayer = makeSqlitePersistenceLive(dbPath);
    const projectionLayer = OrchestrationProjectionPipelineLive.pipe(
      Layer.provideMerge(OrchestrationEventStoreLive),
      Layer.provideMerge(persistenceLayer),
    );
    const projectId = ProjectId.make("project-task-restart");
    const threadId = ThreadId.make("thread-task-restart");
    const taskId = TaskId.make("task-restart");
    const createdAt = "2026-08-22T12:00:00.000Z";
    const activatedAt = "2026-08-22T12:01:00.000Z";

    yield* Effect.gen(function* () {
      const events = yield* OrchestrationEventStore;
      const pipeline = yield* OrchestrationProjectionPipeline;
      yield* events.append({
        type: "project.created",
        eventId: EventId.make("event-project-task-restart"),
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: createdAt,
        commandId: CommandId.make("command-project-task-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          projectId,
          title: "Task restart project",
          workspaceRoot: "/tmp/task-restart-project",
          defaultModelSelection: null,
          scripts: [],
          createdAt,
          updatedAt: createdAt,
        },
      });
      yield* events.append({
        type: "thread.created",
        eventId: EventId.make("event-thread-task-restart"),
        aggregateKind: "thread",
        aggregateId: threadId,
        occurredAt: createdAt,
        commandId: CommandId.make("command-thread-task-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          threadId,
          projectId,
          title: "Task execution",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt,
          updatedAt: createdAt,
        },
      });
      yield* events.append({
        type: "task.created",
        eventId: EventId.make("event-task-created-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: createdAt,
        commandId: CommandId.make("command-task-created-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          taskId,
          projectId,
          title: "Persistent Task",
          objective: "Survive a runtime restart.",
          role: "builder",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          ownershipRequired: true,
          createdAt,
          updatedAt: createdAt,
        },
      });
      yield* events.append({
        type: "task.workspace.ready",
        eventId: EventId.make("event-task-workspace-ready-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-workspace-ready-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          taskId,
          sourceRepository: "/tmp/task-restart-project",
          baseCommit: "0123456789abcdef",
          branch: "nebula/manual/task-restart",
          path: "/tmp/task-restart-worktree",
          createdAt: activatedAt,
          updatedAt: activatedAt,
        },
      });
      yield* events.append({
        type: "task.ownership-updated",
        eventId: EventId.make("event-task-ownership-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-ownership-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          taskId,
          rules: [
            {
              id: "frontend",
              access: "write",
              pattern: "src/frontend/**",
              reason: null,
              createdAt,
            },
          ],
          updatedAt: activatedAt,
        },
      });
      yield* events.append({
        type: "task.ownership-validation-requested",
        eventId: EventId.make("event-task-validation-requested-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-validation-requested-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: { taskId, requestCompletion: false, updatedAt: activatedAt },
      });
      yield* events.append({
        type: "task.ownership-validated",
        eventId: EventId.make("event-task-validated-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-validated-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          taskId,
          status: "violation",
          changedPathCount: 1,
          violations: [
            {
              path: "package.json",
              changeType: "modified",
              reason: "unclassified",
              matchedRules: [],
            },
          ],
          validatedAt: activatedAt,
          updatedAt: activatedAt,
        },
      });
      yield* events.append({
        type: "task.thread-bound",
        eventId: EventId.make("event-task-bound-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-bound-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: { taskId, threadId, updatedAt: activatedAt },
      });
      yield* events.append({
        type: "task.activated",
        eventId: EventId.make("event-task-activated-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-activated-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: { taskId, activatedAt, updatedAt: activatedAt },
      });
      const snapshotId = TaskReviewSnapshotId.make("snapshot-task-restart");
      yield* events.append({
        type: "task.review.prepared",
        eventId: EventId.make("event-task-review-restart"),
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: activatedAt,
        commandId: CommandId.make("command-task-review-restart"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          taskId,
          snapshot: {
            id: snapshotId,
            taskId,
            baseCommit: "0123456789abcdef",
            checkpointRef: CheckpointRef.make(
              "refs/t3/checkpoints/tasks/task-restart/review/snapshot-task-restart",
            ),
            fingerprint: "tree-restart",
            branchHead: "head-restart",
            changedFiles: 1,
            additions: 3,
            deletions: 1,
            files: [
              {
                path: "src/frontend/restart.ts",
                previousPath: null,
                changeType: "modified",
                additions: 3,
                deletions: 1,
                binary: false,
                untracked: false,
              },
            ],
            ownershipStatus: "valid",
            status: "current",
            capturedAt: activatedAt,
          },
          handoff: {
            id: TaskHandoffId.make("handoff-task-restart"),
            taskId,
            snapshotId,
            status: "ready",
            summary: "Durable handoff",
            testsRun: [{ command: "vp test run fixture", result: "passed", evidence: "observed" }],
            assumptions: [],
            interfaceChanges: [],
            migrations: [],
            knownRisks: [],
            followUps: [],
            generation: "manual",
            generationError: null,
            createdAt: activatedAt,
            updatedAt: activatedAt,
          },
          updatedAt: activatedAt,
        },
      });
      yield* pipeline.bootstrap;
    }).pipe(Effect.provide(projectionLayer));

    const rows = yield* Effect.gen(function* () {
      const pipeline = yield* OrchestrationProjectionPipeline;
      const sql = yield* SqlClient.SqlClient;
      yield* pipeline.bootstrap;
      return yield* sql<{
        readonly taskId: string;
        readonly title: string;
        readonly objective: string;
        readonly status: string;
        readonly modelSelection: string | null;
        readonly threadId: string | null;
        readonly workspace: string;
        readonly ownershipRules: string;
        readonly ownershipStatus: string | null;
        readonly ownershipViolations: string;
        readonly reviewSnapshotStatus: string | null;
        readonly handoffStatus: string | null;
      }>`
        SELECT
          task.task_id AS "taskId",
          task.title,
          task.objective,
          task.status,
          task.model_selection_json AS "modelSelection",
          task.thread_id AS "threadId",
          COALESCE(thread.worktree_path, project.workspace_root) AS workspace
          , task.ownership_rules_json AS "ownershipRules"
          , task.ownership_status AS "ownershipStatus"
          , task.ownership_violations_json AS "ownershipViolations"
          , json_extract(task.review_snapshot_json, '$.status') AS "reviewSnapshotStatus"
          , json_extract(task.handoff_json, '$.status') AS "handoffStatus"
        FROM projection_tasks AS task
        JOIN projection_projects AS project ON project.project_id = task.project_id
        LEFT JOIN projection_threads AS thread ON thread.thread_id = task.thread_id
        WHERE task.task_id = ${taskId}
      `;
    }).pipe(Effect.provide(projectionLayer));

    assert.deepEqual(rows, [
      {
        taskId: "task-restart",
        title: "Persistent Task",
        objective: "Survive a runtime restart.",
        status: "active",
        modelSelection: '{"instanceId":"codex","model":"test"}',
        threadId,
        workspace: "/tmp/task-restart-project",
        ownershipRules:
          '[{"id":"frontend","pattern":"src/frontend/**","access":"write","reason":null,"createdAt":"2026-08-22T12:00:00.000Z"}]',
        ownershipStatus: "violation",
        ownershipViolations:
          '[{"path":"package.json","changeType":"modified","reason":"unclassified","matchedRules":[]}]',
        reviewSnapshotStatus: "current",
        handoffStatus: "ready",
      },
    ]);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-task-persistence-restart-" }),
        NodeServices.layer,
      ),
    ),
  ),
);
