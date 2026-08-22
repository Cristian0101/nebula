import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_required INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_rules_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_status TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_validated_at TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_changed_path_count INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_violations_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_error_reason TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_updated_at TEXT`;
});
