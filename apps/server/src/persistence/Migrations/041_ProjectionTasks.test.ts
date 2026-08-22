import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("041_ProjectionTasks", (it) => {
  it.effect("adds the durable Task projection and project lookup index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* runMigrations({ toMigrationInclusive: 41 });

      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_tasks)`;
      assert.deepEqual(
        columns.map((column) => column.name),
        [
          "task_id",
          "project_id",
          "title",
          "objective",
          "role",
          "status",
          "thread_id",
          "created_at",
          "updated_at",
          "activated_at",
          "completed_at",
          "cancelled_at",
        ],
      );

      const indexes = yield* sql<{ readonly name: string }>`PRAGMA index_list(projection_tasks)`;
      assert.isTrue(indexes.some((index) => index.name === "idx_projection_tasks_project_updated"));
    }),
  );
});
