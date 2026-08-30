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
import { ArchitectModelSelection } from "./architectPlan.ts";

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
  "provider_capability_mismatch",
  "execution_loop",
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
  status: Schema.Literals([
    "active",
    "completed",
    "failed",
    "interrupted",
    "cancelled",
    "replaced",
  ]),
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
  providerEscalation: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        failedProviderInstanceId: ProviderInstanceId,
        recommendedProviderInstanceId: Schema.NullOr(ProviderInstanceId),
        reason: TrimmedNonEmptyString,
        status: Schema.Literals(["recommended", "approved", "rejected", "applied"]),
        createdAt: IsoDateTime,
        resolvedAt: Schema.NullOr(IsoDateTime),
      }),
    ),
  ),
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

export const ReplanTrigger = Schema.Literals([
  "assumption_invalidated",
  "dependency_contract_changed",
  "ownership_expansion",
  "task_blocked_architecturally",
  "provider_repeated_failure",
  "integration_semantic_conflict",
  "user_requirement_changed",
  "new_required_work",
]);
export type ReplanTrigger = typeof ReplanTrigger.Type;

export const ReplanEvidence = Schema.Struct({
  kind: Schema.Literals([
    "repository_fact",
    "contract_diff",
    "ownership_fact",
    "attempt_history",
    "integration_fact",
    "user_decision",
  ]),
  summary: TrimmedNonEmptyString,
  expected: Schema.NullOr(TrimmedString),
  observed: TrimmedNonEmptyString,
  source: TrimmedNonEmptyString,
});
export type ReplanEvidence = typeof ReplanEvidence.Type;

export const ReplanTaskDisposition = Schema.Literals([
  "preserve",
  "affected",
  "stale",
  "supersede",
  "requires_review",
]);
export type ReplanTaskDisposition = typeof ReplanTaskDisposition.Type;

export const ReplanTaskImpact = Schema.Struct({
  taskId: TaskId,
  disposition: ReplanTaskDisposition,
  reason: TrimmedNonEmptyString,
});
export type ReplanTaskImpact = typeof ReplanTaskImpact.Type;

export const ReplanImpactAnalysis = Schema.Struct({
  completedSafeTaskIds: Schema.Array(TaskId),
  runningTaskIds: Schema.Array(TaskId),
  affectedTaskIds: Schema.Array(TaskId),
  downstreamTaskIds: Schema.Array(TaskId),
  unaffectedTaskIds: Schema.Array(TaskId),
  reviewsInvalidatedTaskIds: Schema.Array(TaskId),
  contractsInvalidated: Schema.Array(TrimmedNonEmptyString),
  integrationAffectedTaskIds: Schema.Array(TaskId),
  resourceAffectedTaskIds: Schema.Array(TaskId),
  taskImpacts: Schema.Array(ReplanTaskImpact),
});
export type ReplanImpactAnalysis = typeof ReplanImpactAnalysis.Type;

export const ReplanOwnershipRuleDraft = Schema.Struct({
  pattern: TrimmedNonEmptyString,
  access: Schema.Literals(["read", "write", "deny"]),
  reason: Schema.NullOr(TrimmedString),
});
export type ReplanOwnershipRuleDraft = typeof ReplanOwnershipRuleDraft.Type;

export const ReplanNewTask = Schema.Struct({
  taskId: TaskId,
  title: TrimmedNonEmptyString,
  objective: TrimmedNonEmptyString,
  modelSelection: Schema.NullOr(ArchitectModelSelection),
  acceptanceCriteria: Schema.Array(TrimmedNonEmptyString),
  ownership: Schema.Array(ReplanOwnershipRuleDraft),
  requiredResourceIds: Schema.Array(SharedResourceId),
  supersedesTaskId: Schema.NullOr(TaskId),
});
export type ReplanNewTask = typeof ReplanNewTask.Type;

export const ReplanTaskModification = Schema.Struct({
  taskId: TaskId,
  objective: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(Schema.NullOr(ArchitectModelSelection)),
  acceptanceCriteria: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  ownership: Schema.optional(Schema.Array(ReplanOwnershipRuleDraft)),
  requiredResourceIds: Schema.optional(Schema.Array(SharedResourceId)),
});
export type ReplanTaskModification = typeof ReplanTaskModification.Type;

export const ReplanDependencyChange = Schema.Struct({
  operation: Schema.Literals(["add", "remove"]),
  prerequisiteTaskId: TaskId,
  dependentTaskId: TaskId,
});
export type ReplanDependencyChange = typeof ReplanDependencyChange.Type;

export const ReplanContractChange = Schema.Struct({
  contractId: TrimmedNonEmptyString,
  previousVersion: Schema.NullOr(TrimmedNonEmptyString),
  nextVersion: TrimmedNonEmptyString,
  producerTaskId: TaskId,
  consumerTaskIds: Schema.Array(TaskId),
  summary: TrimmedNonEmptyString,
});
export type ReplanContractChange = typeof ReplanContractChange.Type;

export const ReplanChangeSet = Schema.Struct({
  newTasks: Schema.Array(ReplanNewTask),
  modifiedTasks: Schema.Array(ReplanTaskModification),
  supersededTaskIds: Schema.Array(TaskId),
  dependencyChanges: Schema.Array(ReplanDependencyChange),
  contractChanges: Schema.Array(ReplanContractChange),
});
export type ReplanChangeSet = typeof ReplanChangeSet.Type;

export const ArchitectReplanRisk = Schema.Struct({
  risk: TrimmedNonEmptyString,
  mitigation: Schema.NullOr(TrimmedString),
});
export type ArchitectReplanRisk = typeof ArchitectReplanRisk.Type;

export const ArchitectReplanGenerationDraft = Schema.Struct({
  scope: ReplanScope,
  summary: TrimmedNonEmptyString,
  rationale: TrimmedNonEmptyString,
  preservedTaskIds: Schema.Array(TaskId),
  affectedTaskIds: Schema.Array(TaskId),
  changeSet: ReplanChangeSet,
  risks: Schema.Array(ArchitectReplanRisk),
});
export type ArchitectReplanGenerationDraft = typeof ArchitectReplanGenerationDraft.Type;

export const ReplanValidation = Schema.Struct({
  status: Schema.Literals(["valid", "invalid"]),
  blockers: Schema.Array(TrimmedNonEmptyString),
  warnings: Schema.Array(TrimmedNonEmptyString),
  validatedAt: IsoDateTime,
});
export type ReplanValidation = typeof ReplanValidation.Type;

export const ReplanProposal = Schema.Struct({
  id: ReplanProposalId,
  missionId: MissionId,
  sourceTaskId: Schema.NullOr(TaskId),
  scope: ReplanScope,
  trigger: Schema.optional(ReplanTrigger),
  evidence: Schema.optional(Schema.Array(ReplanEvidence)),
  affectedTaskIds: Schema.Array(TaskId),
  summary: TrimmedNonEmptyString,
  rationale: TrimmedNonEmptyString,
  preservedCompletedTaskIds: Schema.Array(TaskId),
  architectPlanProposalId: Schema.NullOr(ArchitectPlanProposalId),
  architectModelSelection: Schema.optional(Schema.NullOr(ArchitectModelSelection)),
  architectContextFingerprint: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  architectReportedPreservedTaskIds: Schema.optional(Schema.Array(TaskId)),
  architectReportedAffectedTaskIds: Schema.optional(Schema.Array(TaskId)),
  architectRisks: Schema.optional(Schema.Array(ArchitectReplanRisk)),
  architectAnalysisStartedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  architectAnalysisCompletedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  architectAnalysisFailure: Schema.optional(Schema.NullOr(TrimmedString)),
  impact: Schema.optional(Schema.NullOr(ReplanImpactAnalysis)),
  changeSet: Schema.optional(Schema.NullOr(ReplanChangeSet)),
  validation: Schema.optional(Schema.NullOr(ReplanValidation)),
  currentPlanVersion: Schema.optional(PositiveInt),
  proposedPlanVersion: Schema.optional(PositiveInt),
  status: Schema.Literals([
    "pending",
    "requested",
    "analyzing",
    "awaiting_approval",
    "analysis_failed",
    "approved",
    "rejected",
    "applied",
    "cancelled",
  ]),
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  appliedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type ReplanProposal = typeof ReplanProposal.Type;
