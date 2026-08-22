import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN review_snapshot_json TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN handoff_json TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN restore_json TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN review_error TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN result_json TEXT`;
});
