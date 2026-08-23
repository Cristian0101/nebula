import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()))("050_ArchitectPlanProposals", (it) => {
  it.effect("adds durable proposal and pinned Mission baseline columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 49 });
      yield* runMigrations({ toMigrationInclusive: 50 });
      const projects = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(projection_projects)`;
      const missions = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(projection_missions)`;
      assert.includeMembers(
        projects.map((column) => column.name),
        ["architect_plans_json"],
      );
      assert.includeMembers(
        missions.map((column) => column.name),
        ["base_commit", "architect_plan_proposal_id"],
      );
    }),
  );
});
