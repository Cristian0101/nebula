import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_status TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_source_repository TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_base_commit TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_branch TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_path TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_created_at TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_removed_at TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_failure_code TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_failure_reason TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN workspace_updated_at TEXT`;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_tasks_workspace_path
    ON projection_tasks(workspace_path)
    WHERE workspace_path IS NOT NULL AND workspace_status != 'removed'
  `;
});
