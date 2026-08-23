import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN shared_resources_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN resource_leases_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN required_resource_ids_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN resource_compliance_json TEXT`;
  yield* sql`ALTER TABLE projection_tasks ADD COLUMN ownership_requests_json TEXT NOT NULL DEFAULT '[]'`;
});
