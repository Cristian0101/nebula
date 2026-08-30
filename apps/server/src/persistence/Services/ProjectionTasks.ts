import {
  IsoDateTime,
  NebulaTaskRole,
  NebulaTaskStatus,
  NebulaTaskWorkspaceStatus,
  TaskOwnershipValidationStatus,
  ProjectId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionTask = Schema.Struct({
  taskId: TaskId,
  projectId: ProjectId,
  title: Schema.String,
  objective: Schema.String,
  role: NebulaTaskRole,
  modelSelectionJson: Schema.NullOr(Schema.String),
  acceptanceCriteriaJson: Schema.String,
  reviewRequired: Schema.Number,
  preferDifferentReviewerProvider: Schema.Number,
  status: NebulaTaskStatus,
  threadId: Schema.NullOr(ThreadId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  activatedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  cancelledAt: Schema.NullOr(IsoDateTime),
  workspaceStatus: Schema.NullOr(NebulaTaskWorkspaceStatus),
  workspaceSourceRepository: Schema.NullOr(Schema.String),
  workspaceBaseCommit: Schema.NullOr(Schema.String),
  workspaceBranch: Schema.NullOr(Schema.String),
  workspacePath: Schema.NullOr(Schema.String),
  workspaceCreatedAt: Schema.NullOr(IsoDateTime),
  workspaceRemovedAt: Schema.NullOr(IsoDateTime),
  workspaceFailureCode: Schema.NullOr(Schema.String),
  workspaceFailureReason: Schema.NullOr(Schema.String),
  workspaceUpdatedAt: Schema.NullOr(IsoDateTime),
  ownershipRequired: Schema.Number,
  ownershipRulesJson: Schema.String,
  ownershipStatus: Schema.NullOr(TaskOwnershipValidationStatus),
  ownershipValidatedAt: Schema.NullOr(IsoDateTime),
  ownershipChangedPathCount: Schema.Number,
  ownershipViolationsJson: Schema.String,
  ownershipErrorReason: Schema.NullOr(Schema.String),
  ownershipUpdatedAt: Schema.NullOr(IsoDateTime),
  reviewSnapshotJson: Schema.NullOr(Schema.String),
  handoffJson: Schema.NullOr(Schema.String),
  restoreJson: Schema.NullOr(Schema.String),
  reviewError: Schema.NullOr(Schema.String),
  resultJson: Schema.NullOr(Schema.String),
  qualityGateRunsJson: Schema.String,
  reviewsJson: Schema.String,
  requiredResourceIdsJson: Schema.String,
  resourceComplianceJson: Schema.NullOr(Schema.String),
  ownershipRequestsJson: Schema.String,
  replanJson: Schema.NullOr(Schema.String),
});
export type ProjectionTask = typeof ProjectionTask.Type;

export interface ProjectionTaskRepositoryShape {
  readonly upsert: (row: ProjectionTask) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    taskId: TaskId,
  ) => Effect.Effect<Option.Option<ProjectionTask>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<ReadonlyArray<ProjectionTask>, ProjectionRepositoryError>;
}

export class ProjectionTaskRepository extends Context.Service<
  ProjectionTaskRepository,
  ProjectionTaskRepositoryShape
>()("t3/persistence/Services/ProjectionTasks/ProjectionTaskRepository") {}
