import * as Schema from "effect/Schema";

import {
  ArchitectPlanProposalId,
  CoordinationRequestId,
  IsoDateTime,
  MissionId,
  NonNegativeInt,
  PositiveInt,
  ReplanProposalId,
  SharedResourceId,
  TaskId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const FailureClass = Schema.Literals([
  "transport_transient",
  "provider_unavailable_auth",
  "provider_execution_error",
  "quality_failure",
  "review_request_changes",
  "ownership_violation",
  "resource_violation",
  "workspace_failure",
  "planning_architecture_blocker",
]);
export type FailureClass = typeof FailureClass.Type;

export const RoutingProfile = Schema.Literals([
  "manual_only",
  "balanced",
  "maximum_quality",
  "maximum_speed",
  "preserve_capacity",
  "provider_diversity",
]);
export type RoutingProfile = typeof RoutingProfile.Type;

export const RecoveryPolicy = Schema.Struct({
  transportRetryLimit: NonNegativeInt,
  remediationLimit: NonNegativeInt,
  routingProfile: RoutingProfile,
});
export type RecoveryPolicy = typeof RecoveryPolicy.Type;

export const ProviderExecutionAttempt = Schema.Struct({
  number: PositiveInt,
  kind: Schema.Literals(["initial", "retry", "remediation", "replacement"]),
  providerInstanceId: ProviderInstanceId,
  threadId: ThreadId,
  status: Schema.Literals(["active", "completed", "failed", "replaced"]),
  failureClass: Schema.NullOr(FailureClass),
  summary: TrimmedString,
  startedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type ProviderExecutionAttempt = typeof ProviderExecutionAttempt.Type;

export const TaskRecoveryState = Schema.Struct({
  taskId: TaskId,
  transientRetries: NonNegativeInt,
  remediationRounds: NonNegativeInt,
  attempts: Schema.Array(ProviderExecutionAttempt),
  latestFailureClass: Schema.NullOr(FailureClass),
  latestFailureSignature: Schema.NullOr(TrimmedNonEmptyString),
  attentionRequired: Schema.Boolean,
  updatedAt: IsoDateTime,
});
export type TaskRecoveryState = typeof TaskRecoveryState.Type;

export const RoutingDecision = Schema.Struct({
  taskId: TaskId,
  profile: RoutingProfile,
  selectedProviderInstanceId: ProviderInstanceId,
  selectedModel: TrimmedNonEmptyString,
  reasons: Schema.Array(TrimmedNonEmptyString),
  consideredProviderInstanceIds: Schema.Array(ProviderInstanceId),
  decidedAt: IsoDateTime,
});
export type RoutingDecision = typeof RoutingDecision.Type;

export const CoordinationRequestKind = Schema.Literals([
  "ownership_request",
  "resource_request",
  "contract_question",
  "dependency_question",
  "blocker",
  "replan_request",
]);
export type CoordinationRequestKind = typeof CoordinationRequestKind.Type;

export const CoordinationRequestedPath = Schema.Struct({
  pattern: TrimmedNonEmptyString,
  access: Schema.Literals(["read", "write", "deny"]),
  reason: Schema.NullOr(TrimmedNonEmptyString),
});

export const CoordinationRequest = Schema.Struct({
  id: CoordinationRequestId,
  taskId: TaskId,
  kind: CoordinationRequestKind,
  reason: TrimmedNonEmptyString,
  requestedPaths: Schema.Array(CoordinationRequestedPath),
  resourceName: Schema.NullOr(TrimmedNonEmptyString),
  resourceId: Schema.NullOr(SharedResourceId),
  question: Schema.NullOr(TrimmedNonEmptyString),
  status: Schema.Literals(["pending", "approved", "denied", "answered", "cancelled"]),
  answer: Schema.NullOr(TrimmedString),
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
});
export type CoordinationRequest = typeof CoordinationRequest.Type;

export const ReplanScope = Schema.Literals([
  "task_repair",
  "task_split",
  "mission_subgraph",
  "full_mission",
]);
export type ReplanScope = typeof ReplanScope.Type;

export const ReplanProposal = Schema.Struct({
  id: ReplanProposalId,
  missionId: MissionId,
  sourceTaskId: TaskId,
  scope: ReplanScope,
  affectedTaskIds: Schema.Array(TaskId),
  summary: TrimmedNonEmptyString,
  rationale: TrimmedNonEmptyString,
  preservedCompletedTaskIds: Schema.Array(TaskId),
  architectPlanProposalId: Schema.NullOr(ArchitectPlanProposalId),
  status: Schema.Literals(["pending", "approved", "rejected", "cancelled"]),
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
});
export type ReplanProposal = typeof ReplanProposal.Type;
