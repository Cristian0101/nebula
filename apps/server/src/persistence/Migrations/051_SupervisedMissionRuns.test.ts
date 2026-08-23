import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()))("051_SupervisedMissionRuns", (it) => {
  it.effect("adds the durable Mission Run projection and scheduler indexes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 50 });
      yield* runMigrations({ toMigrationInclusive: 51 });
      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_mission_runs)
      `;
      const indexes = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'projection_mission_runs'
      `;
      assert.includeMembers(
        columns.map((column) => column.name),
        ["run_id", "mission_id", "project_id", "status", "run_json", "started_at", "updated_at"],
      );
      assert.includeMembers(
        indexes.map((index) => index.name),
        [
          "idx_projection_mission_runs_mission_updated",
          "idx_projection_mission_runs_project_status",
        ],
      );
    }),
  );
});
