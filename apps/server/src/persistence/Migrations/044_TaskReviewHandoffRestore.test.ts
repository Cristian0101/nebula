import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_TaskReviewHandoffRestore", (it) => {
  it.effect("adds nullable durable review, handoff, and restore state", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json,
          scripts_json, created_at, updated_at, deleted_at
        ) VALUES ('project-1', 'Project', '/tmp/project', NULL, '[]', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z', NULL)
      `;
      yield* sql`
        INSERT INTO projection_tasks (
          task_id, project_id, title, objective, role, status, created_at, updated_at
        ) VALUES ('legacy-task', 'project-1', 'Legacy', 'Remain readable', 'builder', 'active', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z')
      `;
      yield* runMigrations({ toMigrationInclusive: 44 });
      const rows = yield* sql<{
        readonly reviewSnapshot: string | null;
        readonly handoff: string | null;
        readonly restore: string | null;
        readonly reviewError: string | null;
        readonly result: string | null;
      }>`
        SELECT review_snapshot_json AS "reviewSnapshot", handoff_json AS "handoff",
          restore_json AS "restore", review_error AS "reviewError", result_json AS "result"
          FROM projection_tasks WHERE task_id = 'legacy-task'
      `;
      assert.deepEqual(rows[0], {
        reviewSnapshot: null,
        handoff: null,
        restore: null,
        reviewError: null,
        result: null,
      });
    }),
  );
});
