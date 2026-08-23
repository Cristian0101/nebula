import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_mission_runs (
      run_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      run_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES projection_missions(mission_id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projection_projects(project_id)
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_mission_runs_mission_updated ON projection_mission_runs(mission_id, updated_at DESC)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_mission_runs_project_status ON projection_mission_runs(project_id, status)`;
});
