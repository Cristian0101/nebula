import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()))("053_ReplanningProjections", (it) => {
  it.effect("adds durable Mission plan and Task freshness state", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 52 });
      yield* runMigrations({ toMigrationInclusive: 53 });
      const missionColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_missions)
      `;
      const taskColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_tasks)
      `;
      assert.includeMembers(
        missionColumns.map((column) => column.name),
        ["current_plan_version", "plan_versions_json", "contract_versions_json"],
      );
      assert.includeMembers(
        taskColumns.map((column) => column.name),
        ["replan_json"],
      );
    }),
  );
});
