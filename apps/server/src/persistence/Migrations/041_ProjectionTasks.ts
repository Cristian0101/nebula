import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_tasks (
      task_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activated_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projection_projects(project_id),
      FOREIGN KEY (thread_id) REFERENCES projection_threads(thread_id),
      UNIQUE (thread_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_tasks_project_updated
    ON projection_tasks(project_id, updated_at DESC)
  `;
});
