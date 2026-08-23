import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("047_IntegrationBatches", (it) => {
  it.effect("hydrates legacy projects with an empty durable Batch list", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 46 });
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json,
          scripts_json, created_at, updated_at, deleted_at
        ) VALUES ('legacy-project', 'Legacy', '/tmp/legacy', NULL, '[]', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z', NULL)
      `;
      yield* runMigrations({ toMigrationInclusive: 47 });
      const rows = yield* sql<{ readonly batches: string }>`
        SELECT integration_batches_json AS "batches"
        FROM projection_projects WHERE project_id = 'legacy-project'
      `;
      assert.deepEqual(rows, [{ batches: "[]" }]);
    }),
  );
});
