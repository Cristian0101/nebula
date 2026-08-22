import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
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
          createdAt,
          updatedAt: createdAt,
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
      yield* pipeline.bootstrap;
    }).pipe(Effect.provide(projectionLayer));

    const rows = yield* Effect.gen(function* () {
      const pipeline = yield* OrchestrationProjectionPipeline;
      const sql = yield* SqlClient.SqlClient;
      yield* pipeline.bootstrap;
      return yield* sql<{
        readonly taskId: string;
        readonly status: string;
        readonly threadId: string | null;
      }>`
        SELECT task_id AS "taskId", status, thread_id AS "threadId"
        FROM projection_tasks
        WHERE task_id = ${taskId}
      `;
    }).pipe(Effect.provide(projectionLayer));

    assert.deepEqual(rows, [{ taskId: "task-restart", status: "active", threadId }]);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-task-persistence-restart-" }),
        NodeServices.layer,
      ),
    ),
  ),
);
