import { assert, it } from "@effect/vitest";
import { IntegrationBatchId, MissionId, ProjectId, TaskId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";

const layer = it.layer(
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provideMerge(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("Mission projection snapshots", (it) => {
  it.effect("rehydrates Mission membership, dependencies, activity, and Integration linkage", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const snapshots = yield* ProjectionSnapshotQuery;
      const now = "2026-08-22T12:00:00.000Z";

      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json,
          scripts_json, integration_batches_json, created_at, updated_at, deleted_at
        ) VALUES (
          'mission-project', 'Mission project', '/tmp/mission-project', NULL,
          '[]', '[]',
          ${now}, ${now}, NULL
        )
      `;
      for (const [position, taskId] of ["task-a", "task-b"].entries()) {
        yield* sql`
          INSERT INTO projection_tasks (
            task_id, project_id, title, objective, role, status,
            thread_id, created_at, updated_at, activated_at, completed_at, cancelled_at
          ) VALUES (
            ${taskId}, 'mission-project', ${`Task ${position + 1}`}, 'Persist', 'builder',
            'completed', NULL, ${now}, ${now}, ${now}, ${now}, NULL
          )
        `;
      }
      yield* sql`
        INSERT INTO projection_missions (
          mission_id, project_id, title, objective, description, status,
          integration_batch_id, created_at, updated_at, activated_at, completed_at, cancelled_at
        ) VALUES (
          'mission-1', 'mission-project', 'Persistent Mission', 'Survive reconnects', NULL,
          'active', 'batch-1', ${now}, ${now}, ${now}, NULL, NULL
        )
      `;
      yield* sql`
        INSERT INTO projection_mission_tasks (mission_id, task_id, position, added_at)
        VALUES ('mission-1', 'task-a', 0, ${now}), ('mission-1', 'task-b', 1, ${now})
      `;
      yield* sql`
        INSERT INTO projection_mission_dependencies (
          mission_id, prerequisite_task_id, dependent_task_id, created_at
        ) VALUES ('mission-1', 'task-a', 'task-b', ${now})
      `;
      yield* sql`
        INSERT INTO projection_mission_activities (
          event_id, mission_id, type, summary, task_id, occurred_at
        ) VALUES ('event-mission-created', 'mission-1', 'created', 'Mission created', NULL, ${now})
      `;
      for (const projector of Object.values(ORCHESTRATION_PROJECTOR_NAMES)) {
        yield* sql`
          INSERT OR REPLACE INTO projection_state (projector, last_applied_sequence, updated_at)
          VALUES (${projector}, 12, ${now})
        `;
      }

      const first = yield* snapshots.getCommandReadModel();
      const reconnect = yield* snapshots.getShellSnapshot();

      assert.equal(first.missions?.[0]?.id, MissionId.make("mission-1"));
      assert.equal(first.missions?.[0]?.projectId, ProjectId.make("mission-project"));
      assert.deepEqual(first.missions?.[0]?.taskIds, [
        TaskId.make("task-a"),
        TaskId.make("task-b"),
      ]);
      assert.equal(first.missions?.[0]?.integrationBatchId, IntegrationBatchId.make("batch-1"));
      assert.deepEqual(first.missions?.[0]?.dependencies, [
        {
          missionId: MissionId.make("mission-1"),
          prerequisiteTaskId: TaskId.make("task-a"),
          dependentTaskId: TaskId.make("task-b"),
          createdAt: now,
        },
      ]);
      assert.equal(first.missions?.[0]?.activities[0]?.summary, "Mission created");
      assert.equal(reconnect.missions?.[0]?.id, MissionId.make("mission-1"));
      assert.equal(reconnect.snapshotSequence, 12);
    }),
  );
});
