import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("048_Missions", (it) => {
  it.effect("creates normalized Mission, membership, dependency, and activity projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 47 });
      yield* runMigrations({ toMigrationInclusive: 48 });

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'projection_mission%'
        ORDER BY name
      `;
      assert.deepEqual(
        tables.map((row) => row.name),
        [
          "projection_mission_activities",
          "projection_mission_dependencies",
          "projection_mission_tasks",
          "projection_missions",
        ],
      );

      const membershipIndexes = yield* sql<{
        readonly name: string;
        readonly unique: number;
      }>`PRAGMA index_list(projection_mission_tasks)`;
      assert.isTrue(membershipIndexes.some((index) => index.unique === 1));

      const dependencyColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_mission_dependencies)
      `;
      assert.deepEqual(
        dependencyColumns.map((column) => column.name),
        ["mission_id", "prerequisite_task_id", "dependent_task_id", "created_at"],
      );
    }),
  );
});
