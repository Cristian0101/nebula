import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()))("052_MissionCheckpoints", (it) => {
  it.effect("adds durable named checkpoint state to Mission projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 51 });
      yield* runMigrations({ toMigrationInclusive: 52 });
      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_missions)
      `;
      assert.includeMembers(
        columns.map((column) => column.name),
        ["checkpoints_json"],
      );
    }),
  );
});
