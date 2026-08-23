import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("046_TaskQualityReview", (it) => {
  it.effect("hydrates legacy Tasks without fabricating quality or review approval", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 45 });
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
      yield* runMigrations({ toMigrationInclusive: 46 });
      const tasks = yield* sql<{
        readonly acceptanceCriteria: string;
        readonly reviewRequired: number;
        readonly preferDifferent: number;
        readonly qualityRuns: string;
        readonly reviews: string;
      }>`
        SELECT acceptance_criteria_json AS "acceptanceCriteria",
          review_required AS "reviewRequired",
          prefer_different_reviewer_provider AS "preferDifferent",
          quality_gate_runs_json AS "qualityRuns",
          reviews_json AS "reviews"
        FROM projection_tasks WHERE task_id = 'legacy-task'
      `;
      const projects = yield* sql<{
        readonly qualityPolicy: string | null;
        readonly reviewPolicy: string | null;
      }>`
        SELECT quality_policy_json AS "qualityPolicy", review_policy_json AS "reviewPolicy"
        FROM projection_projects WHERE project_id = 'project-1'
      `;
      assert.deepEqual(tasks, [
        {
          acceptanceCriteria: "[]",
          reviewRequired: 0,
          preferDifferent: 1,
          qualityRuns: "[]",
          reviews: "[]",
        },
      ]);
      assert.deepEqual(projects, [{ qualityPolicy: null, reviewPolicy: null }]);
    }),
  );
});
