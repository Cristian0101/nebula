import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("043_TaskOwnership", (it) => {
  it.effect("keeps legacy Tasks explicitly unconfigured and adds durable ownership columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 42 });
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json,
          scripts_json, created_at, updated_at, deleted_at
        ) VALUES ('project-1', 'Project', '/tmp/project', NULL, '[]', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z', NULL)
      `;
      yield* sql`
        INSERT INTO projection_tasks (
          task_id, project_id, title, objective, role, status,
          created_at, updated_at
        ) VALUES ('legacy-task', 'project-1', 'Legacy', 'Remain readable', 'builder', 'active', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z')
      `;

      yield* runMigrations({ toMigrationInclusive: 43 });
      const rows = yield* sql<{
        readonly ownershipRequired: number;
        readonly ownershipRules: string;
        readonly ownershipStatus: string | null;
      }>`
        SELECT
          ownership_required AS "ownershipRequired",
          ownership_rules_json AS "ownershipRules",
          ownership_status AS "ownershipStatus"
        FROM projection_tasks WHERE task_id = 'legacy-task'
      `;
      assert.deepEqual(rows[0], {
        ownershipRequired: 0,
        ownershipRules: "[]",
        ownershipStatus: null,
      });
    }),
  );
});
