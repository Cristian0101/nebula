import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN quality_policy_json TEXT`;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN review_policy_json TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN acceptance_criteria_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN prefer_different_reviewer_provider INTEGER NOT NULL DEFAULT 1`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN quality_gate_runs_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN reviews_json TEXT NOT NULL DEFAULT '[]'`;
});
