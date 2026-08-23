import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("049_SharedResourceCoordination", (it) => {
  it.effect("adds durable resource, lease, compliance, and ownership request columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 48 });
      yield* runMigrations({ toMigrationInclusive: 49 });

      const projectColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_projects)
      `;
      const taskColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_tasks)
      `;

      assert.includeMembers(
        projectColumns.map((column) => column.name),
        ["shared_resources_json", "resource_leases_json"],
      );
      assert.includeMembers(
        taskColumns.map((column) => column.name),
        ["required_resource_ids_json", "resource_compliance_json", "ownership_requests_json"],
      );
    }),
  );
});
