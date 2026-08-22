import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { TaskId } from "@t3tools/contracts";
import { toPersistenceSqlError } from "../Errors.ts";
import {
  ProjectionTask,
  ProjectionTaskRepository,
  type ProjectionTaskRepositoryShape,
} from "../Services/ProjectionTasks.ts";

const makeProjectionTaskRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionTask,
    execute: (row) => sql`
      INSERT INTO projection_tasks (
        task_id, project_id, title, objective, role, status, thread_id,
        created_at, updated_at, activated_at, completed_at, cancelled_at
      ) VALUES (
        ${row.taskId}, ${row.projectId}, ${row.title}, ${row.objective}, ${row.role}, ${row.status},
        ${row.threadId}, ${row.createdAt}, ${row.updatedAt}, ${row.activatedAt},
        ${row.completedAt}, ${row.cancelledAt}
      )
      ON CONFLICT (task_id) DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        objective = excluded.objective,
        role = excluded.role,
        status = excluded.status,
        thread_id = excluded.thread_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        activated_at = excluded.activated_at,
        completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at
    `,
  });

  const rowColumns = sql`
    task_id AS "taskId",
    project_id AS "projectId",
    title,
    objective,
    role,
    status,
    thread_id AS "threadId",
    created_at AS "createdAt",
    updated_at AS "updatedAt",
    activated_at AS "activatedAt",
    completed_at AS "completedAt",
    cancelled_at AS "cancelledAt"
  `;

  const getRow = SqlSchema.findOneOption({
    Request: TaskId,
    Result: ProjectionTask,
    execute: (taskId) => sql`SELECT ${rowColumns} FROM projection_tasks WHERE task_id = ${taskId}`,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionTask,
    execute: () => sql`SELECT ${rowColumns} FROM projection_tasks ORDER BY created_at, task_id`,
  });

  return {
    upsert: (row) =>
      upsertRow(row).pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.upsert:query")),
      ),
    getById: (taskId) =>
      getRow(taskId).pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.getById:query")),
      ),
    listAll: () =>
      listRows().pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.listAll:query")),
      ),
  } satisfies ProjectionTaskRepositoryShape;
});

export const ProjectionTaskRepositoryLive = Layer.effect(
  ProjectionTaskRepository,
  makeProjectionTaskRepository,
);
