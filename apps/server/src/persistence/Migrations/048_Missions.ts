import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_missions (
      mission_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      integration_batch_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activated_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projection_projects(project_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_mission_tasks (
      mission_id TEXT NOT NULL,
      task_id TEXT NOT NULL UNIQUE,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (mission_id, task_id),
      FOREIGN KEY (mission_id) REFERENCES projection_missions(mission_id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES projection_tasks(task_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_mission_dependencies (
      mission_id TEXT NOT NULL,
      prerequisite_task_id TEXT NOT NULL,
      dependent_task_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (mission_id, prerequisite_task_id, dependent_task_id),
      FOREIGN KEY (mission_id) REFERENCES projection_missions(mission_id) ON DELETE CASCADE,
      FOREIGN KEY (prerequisite_task_id) REFERENCES projection_tasks(task_id),
      FOREIGN KEY (dependent_task_id) REFERENCES projection_tasks(task_id),
      CHECK (prerequisite_task_id <> dependent_task_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_mission_activities (
      event_id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      task_id TEXT,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES projection_missions(mission_id) ON DELETE CASCADE
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_missions_project_updated ON projection_missions(project_id, updated_at DESC)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_mission_tasks_order ON projection_mission_tasks(mission_id, position, task_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_mission_dependencies_mission ON projection_mission_dependencies(mission_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_projection_mission_activities_mission ON projection_mission_activities(mission_id, occurred_at DESC)`;
});
