import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN architect_plans_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_missions ADD COLUMN base_commit TEXT`;
  yield* sql`ALTER TABLE projection_missions ADD COLUMN architect_plan_proposal_id TEXT`;
});
