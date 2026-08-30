import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { TaskId } from "@t3tools/contracts";
import { toPersistenceSqlError } from "../Errors.ts";
import {
  ProjectionTask,
  ProjectionTaskRepository,
  type ProjectionTaskRepositoryShape,
} from "../Services/ProjectionTasks.ts";

const makeProjectionTaskRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionTask,
    execute: (row) => sql`
      INSERT INTO projection_tasks (
        task_id, project_id, title, objective, role, model_selection_json,
        acceptance_criteria_json, review_required, prefer_different_reviewer_provider,
        status, thread_id,
        created_at, updated_at, activated_at, completed_at, cancelled_at
        , workspace_status, workspace_source_repository, workspace_base_commit,
        workspace_branch, workspace_path, workspace_created_at, workspace_removed_at,
        workspace_failure_code, workspace_failure_reason, workspace_updated_at
        , ownership_required, ownership_rules_json, ownership_status, ownership_validated_at,
        ownership_changed_path_count, ownership_violations_json, ownership_error_reason,
        ownership_updated_at
        , review_snapshot_json, handoff_json, restore_json, review_error, result_json,
          quality_gate_runs_json, reviews_json
          , required_resource_ids_json, resource_compliance_json, ownership_requests_json,
          replan_json
      ) VALUES (
        ${row.taskId}, ${row.projectId}, ${row.title}, ${row.objective}, ${row.role},
        ${row.modelSelectionJson}, ${row.acceptanceCriteriaJson}, ${row.reviewRequired},
        ${row.preferDifferentReviewerProvider}, ${row.status},
        ${row.threadId}, ${row.createdAt}, ${row.updatedAt}, ${row.activatedAt},
        ${row.completedAt}, ${row.cancelledAt}
        , ${row.workspaceStatus}, ${row.workspaceSourceRepository}, ${row.workspaceBaseCommit},
        ${row.workspaceBranch}, ${row.workspacePath}, ${row.workspaceCreatedAt},
        ${row.workspaceRemovedAt}, ${row.workspaceFailureCode}, ${row.workspaceFailureReason},
        ${row.workspaceUpdatedAt}
        , ${row.ownershipRequired}, ${row.ownershipRulesJson}, ${row.ownershipStatus},
        ${row.ownershipValidatedAt}, ${row.ownershipChangedPathCount},
        ${row.ownershipViolationsJson}, ${row.ownershipErrorReason}, ${row.ownershipUpdatedAt}
        , ${row.reviewSnapshotJson}, ${row.handoffJson}, ${row.restoreJson}, ${row.reviewError},
          ${row.resultJson}, ${row.qualityGateRunsJson}, ${row.reviewsJson}
          , ${row.requiredResourceIdsJson}, ${row.resourceComplianceJson}, ${row.ownershipRequestsJson},
          ${row.replanJson}
      )
      ON CONFLICT (task_id) DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        objective = excluded.objective,
        role = excluded.role,
        model_selection_json = excluded.model_selection_json,
        acceptance_criteria_json = excluded.acceptance_criteria_json,
        review_required = excluded.review_required,
        prefer_different_reviewer_provider = excluded.prefer_different_reviewer_provider,
        status = excluded.status,
        thread_id = excluded.thread_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        activated_at = excluded.activated_at,
        completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at
        , workspace_status = excluded.workspace_status
        , workspace_source_repository = excluded.workspace_source_repository
        , workspace_base_commit = excluded.workspace_base_commit
        , workspace_branch = excluded.workspace_branch
        , workspace_path = excluded.workspace_path
        , workspace_created_at = excluded.workspace_created_at
        , workspace_removed_at = excluded.workspace_removed_at
        , workspace_failure_code = excluded.workspace_failure_code
        , workspace_failure_reason = excluded.workspace_failure_reason
        , workspace_updated_at = excluded.workspace_updated_at
        , ownership_required = excluded.ownership_required
        , ownership_rules_json = excluded.ownership_rules_json
        , ownership_status = excluded.ownership_status
        , ownership_validated_at = excluded.ownership_validated_at
        , ownership_changed_path_count = excluded.ownership_changed_path_count
        , ownership_violations_json = excluded.ownership_violations_json
        , ownership_error_reason = excluded.ownership_error_reason
        , ownership_updated_at = excluded.ownership_updated_at
        , review_snapshot_json = excluded.review_snapshot_json
        , handoff_json = excluded.handoff_json
        , restore_json = excluded.restore_json
        , review_error = excluded.review_error
        , result_json = excluded.result_json
        , quality_gate_runs_json = excluded.quality_gate_runs_json
        , reviews_json = excluded.reviews_json
        , required_resource_ids_json = excluded.required_resource_ids_json
        , resource_compliance_json = excluded.resource_compliance_json
        , ownership_requests_json = excluded.ownership_requests_json
        , replan_json = excluded.replan_json
    `,
  });

  const rowColumns = sql`
    task_id AS "taskId",
    project_id AS "projectId",
    title,
    objective,
    role,
    model_selection_json AS "modelSelectionJson",
    acceptance_criteria_json AS "acceptanceCriteriaJson",
    review_required AS "reviewRequired",
    prefer_different_reviewer_provider AS "preferDifferentReviewerProvider",
    status,
    thread_id AS "threadId",
    created_at AS "createdAt",
    updated_at AS "updatedAt",
    activated_at AS "activatedAt",
    completed_at AS "completedAt",
    cancelled_at AS "cancelledAt"
    , workspace_status AS "workspaceStatus"
    , workspace_source_repository AS "workspaceSourceRepository"
    , workspace_base_commit AS "workspaceBaseCommit"
    , workspace_branch AS "workspaceBranch"
    , workspace_path AS "workspacePath"
    , workspace_created_at AS "workspaceCreatedAt"
    , workspace_removed_at AS "workspaceRemovedAt"
    , workspace_failure_code AS "workspaceFailureCode"
    , workspace_failure_reason AS "workspaceFailureReason"
    , workspace_updated_at AS "workspaceUpdatedAt"
    , ownership_required AS "ownershipRequired"
    , ownership_rules_json AS "ownershipRulesJson"
    , ownership_status AS "ownershipStatus"
    , ownership_validated_at AS "ownershipValidatedAt"
    , ownership_changed_path_count AS "ownershipChangedPathCount"
    , ownership_violations_json AS "ownershipViolationsJson"
    , ownership_error_reason AS "ownershipErrorReason"
    , ownership_updated_at AS "ownershipUpdatedAt"
    , review_snapshot_json AS "reviewSnapshotJson"
    , handoff_json AS "handoffJson"
    , restore_json AS "restoreJson"
    , review_error AS "reviewError"
    , result_json AS "resultJson"
    , quality_gate_runs_json AS "qualityGateRunsJson"
    , reviews_json AS "reviewsJson"
    , required_resource_ids_json AS "requiredResourceIdsJson"
    , resource_compliance_json AS "resourceComplianceJson"
    , ownership_requests_json AS "ownershipRequestsJson"
    , replan_json AS "replanJson"
  `;

  const getRow = SqlSchema.findOneOption({
    Request: TaskId,
    Result: ProjectionTask,
    execute: (taskId) => sql`SELECT ${rowColumns} FROM projection_tasks WHERE task_id = ${taskId}`,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionTask,
    execute: () => sql`SELECT ${rowColumns} FROM projection_tasks ORDER BY created_at, task_id`,
  });

  return {
    upsert: (row) =>
      upsertRow(row).pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.upsert:query")),
      ),
    getById: (taskId) =>
      getRow(taskId).pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.getById:query")),
      ),
    listAll: () =>
      listRows().pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionTaskRepository.listAll:query")),
      ),
  } satisfies ProjectionTaskRepositoryShape;
});

export const ProjectionTaskRepositoryLive = Layer.effect(
  ProjectionTaskRepository,
  makeProjectionTaskRepository,
);
