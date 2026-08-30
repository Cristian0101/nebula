import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_missions ADD COLUMN current_plan_version INTEGER NOT NULL DEFAULT 1`;
  yield* sql`ALTER TABLE projection_missions ADD COLUMN plan_versions_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_missions ADD COLUMN contract_versions_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN replan_json TEXT`;
});
