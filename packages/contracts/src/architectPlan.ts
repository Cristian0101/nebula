import * as Schema from "effect/Schema";
import {
  ArchitectPlanProposalId,
  IsoDateTime,
  MissionId,
  ProjectId,
  SharedResourceId,
  TaskId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ProviderOptionSelections } from "./model.ts";

export const ArchitectModelSelection = Schema.Struct({
  instanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
  options: Schema.optional(ProviderOptionSelections),
});
export type ArchitectModelSelection = typeof ArchitectModelSelection.Type;

export const ARCHITECT_PLAN_MAX_TASKS = 20;
export const ARCHITECT_PLAN_MAX_EDGES = 50;
export const ARCHITECT_PLAN_MAX_CRITERIA_PER_TASK = 20;
export const ARCHITECT_PLAN_MAX_OWNERSHIP_PATTERNS_PER_TASK = 30;
export const ARCHITECT_PLAN_MAX_TEAM_AGENTS = 20;

export const ArchitectPlanningPhase = Schema.Literals([
  "idle",
  "validating_repository",
  "preparing_context",
  "starting_planner",
  "planner_working",
  "decoding_plan",
  "validating_plan",
  "ready",
  "failed",
  "cancelled",
  "stale",
]);
export type ArchitectPlanningPhase = typeof ArchitectPlanningPhase.Type;

export const ArchitectPlanningFailureCategory = Schema.Literals([
  "provider_unavailable",
  "authentication_required",
  "transport_interrupted",
  "invalid_structured_plan",
  "validation_failed",
  "repository_changed",
  "unknown",
]);
export type ArchitectPlanningFailureCategory = typeof ArchitectPlanningFailureCategory.Type;

export const ArchitectPlanningLifecycle = Schema.Struct({
  phase: ArchitectPlanningPhase,
  attempt: Schema.Number,
  startedAt: IsoDateTime,
  lastProgressAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  failureCategory: Schema.NullOr(ArchitectPlanningFailureCategory),
});
export type ArchitectPlanningLifecycle = typeof ArchitectPlanningLifecycle.Type;

export const ArchitectPlanningAttempt = Schema.Struct({
  number: Schema.Number,
  providerInstanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
  startedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  lastPhase: ArchitectPlanningPhase,
  outcome: Schema.Literals(["running", "ready", "failed", "cancelled"]),
  failureCategory: Schema.NullOr(ArchitectPlanningFailureCategory),
  failureReason: Schema.NullOr(TrimmedString),
});
export type ArchitectPlanningAttempt = typeof ArchitectPlanningAttempt.Type;

export const ArchitectTeamPreset = Schema.Literals([
  "pair",
  "standard",
  "large",
  "heavy",
  "custom",
]);
export type ArchitectTeamPreset = typeof ArchitectTeamPreset.Type;

export const ArchitectTeamRoleKind = Schema.Literals([
  "builder",
  "reviewer",
  "debugger",
  "test_specialist",
  "security_reviewer",
  "integrator",
]);
export type ArchitectTeamRoleKind = typeof ArchitectTeamRoleKind.Type;

export const ArchitectTeamSeat = Schema.Struct({
  key: TrimmedNonEmptyString,
  role: ArchitectTeamRoleKind,
  label: TrimmedNonEmptyString,
  access: Schema.Literals(["write", "review", "coordinate"]),
  modelSelection: Schema.NullOr(ArchitectModelSelection),
});
export type ArchitectTeamSeat = typeof ArchitectTeamSeat.Type;

export const ArchitectTeamConfiguration = Schema.Struct({
  preset: ArchitectTeamPreset,
  executionAgentCount: Schema.Number,
  maxWritableConcurrency: Schema.Number,
  startingSeats: Schema.Array(ArchitectTeamSeat),
});
export type ArchitectTeamConfiguration = typeof ArchitectTeamConfiguration.Type;

export const ArchitectOwnershipDraft = Schema.Struct({
  write: Schema.Array(TrimmedNonEmptyString),
  read: Schema.Array(TrimmedNonEmptyString),
  deny: Schema.Array(TrimmedNonEmptyString),
});
export type ArchitectOwnershipDraft = typeof ArchitectOwnershipDraft.Type;

export const ArchitectProviderRecommendation = Schema.Struct({
  driverKind: Schema.optional(TrimmedNonEmptyString),
  model: Schema.optional(TrimmedNonEmptyString),
  reason: Schema.optional(TrimmedString),
});
export type ArchitectProviderRecommendation = typeof ArchitectProviderRecommendation.Type;

export const ArchitectTaskDraft = Schema.Struct({
  key: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  objective: TrimmedNonEmptyString,
  acceptanceCriteria: Schema.Array(TrimmedNonEmptyString),
  ownership: ArchitectOwnershipDraft,
  requiredResourceIds: Schema.Array(SharedResourceId),
  providerRecommendation: Schema.optional(ArchitectProviderRecommendation),
  assignedModelSelection: Schema.optional(Schema.NullOr(ArchitectModelSelection)),
  role: Schema.optional(ArchitectTeamRoleKind),
  reviewerKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  checkpointKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  notes: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type ArchitectTaskDraft = typeof ArchitectTaskDraft.Type;

export const ArchitectDependencyDraft = Schema.Struct({
  prerequisiteKey: TrimmedNonEmptyString,
  dependentKey: TrimmedNonEmptyString,
});
export type ArchitectDependencyDraft = typeof ArchitectDependencyDraft.Type;

export const ArchitectResourcePolicyGap = Schema.Struct({
  suggestedName: TrimmedNonEmptyString,
  suggestedPatterns: Schema.Array(TrimmedNonEmptyString),
  reason: TrimmedNonEmptyString,
});
export type ArchitectResourcePolicyGap = typeof ArchitectResourcePolicyGap.Type;

export const ArchitectRisk = Schema.Struct({
  risk: TrimmedNonEmptyString,
  mitigation: Schema.optional(TrimmedString),
});
export type ArchitectRisk = typeof ArchitectRisk.Type;

export const ArchitectCheckpointDraft = Schema.Struct({
  key: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  requiredTaskKeys: Schema.Array(TrimmedNonEmptyString),
  unlockTaskKeys: Schema.Array(TrimmedNonEmptyString),
  requiredGateIds: Schema.Array(TrimmedNonEmptyString),
  reviewsRequired: Schema.Boolean,
  humanApprovalRequired: Schema.Boolean,
});
export type ArchitectCheckpointDraft = typeof ArchitectCheckpointDraft.Type;

export const ArchitectMissionDraft = Schema.Struct({
  title: TrimmedNonEmptyString,
  objective: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedString),
  tasks: Schema.Array(ArchitectTaskDraft),
  dependencies: Schema.Array(ArchitectDependencyDraft),
  checkpoints: Schema.optional(Schema.Array(ArchitectCheckpointDraft)),
  assumptions: Schema.Array(TrimmedNonEmptyString),
  risks: Schema.Array(ArchitectRisk),
  unresolvedQuestions: Schema.Array(TrimmedNonEmptyString),
  resourcePolicyGaps: Schema.optional(Schema.Array(ArchitectResourcePolicyGap)),
});
export type ArchitectMissionDraft = typeof ArchitectMissionDraft.Type;

// Provider JSON-schema mode requires every declared object property to be
// required. Nullable values are normalized into the ergonomic proposal
// contract after strict decoding at the adapter boundary.
export const ArchitectMissionGenerationDraft = Schema.Struct({
  title: TrimmedNonEmptyString,
  objective: TrimmedNonEmptyString,
  description: Schema.NullOr(TrimmedString),
  tasks: Schema.Array(
    Schema.Struct({
      key: TrimmedNonEmptyString,
      title: TrimmedNonEmptyString,
      objective: TrimmedNonEmptyString,
      acceptanceCriteria: Schema.Array(TrimmedNonEmptyString),
      ownership: ArchitectOwnershipDraft,
      requiredResourceIds: Schema.Array(SharedResourceId),
      providerRecommendation: Schema.NullOr(
        Schema.Struct({
          driverKind: Schema.NullOr(TrimmedNonEmptyString),
          model: Schema.NullOr(TrimmedNonEmptyString),
          reason: Schema.NullOr(TrimmedString),
        }),
      ),
      assignedModelSelection: Schema.Null,
      role: Schema.NullOr(ArchitectTeamRoleKind),
      reviewerKey: Schema.NullOr(TrimmedNonEmptyString),
      checkpointKey: Schema.NullOr(TrimmedNonEmptyString),
      notes: Schema.Array(TrimmedNonEmptyString),
    }),
  ),
  dependencies: Schema.Array(ArchitectDependencyDraft),
  checkpoints: Schema.Array(ArchitectCheckpointDraft),
  assumptions: Schema.Array(TrimmedNonEmptyString),
  risks: Schema.Array(
    Schema.Struct({
      risk: TrimmedNonEmptyString,
      mitigation: Schema.NullOr(TrimmedString),
    }),
  ),
  unresolvedQuestions: Schema.Array(TrimmedNonEmptyString),
  resourcePolicyGaps: Schema.Array(ArchitectResourcePolicyGap),
});
export type ArchitectMissionGenerationDraft = typeof ArchitectMissionGenerationDraft.Type;

export const ArchitectPlanIssue = Schema.Struct({
  code: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
  taskKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type ArchitectPlanIssue = typeof ArchitectPlanIssue.Type;

export const ArchitectPlanValidation = Schema.Struct({
  status: Schema.Literals(["valid", "invalid"]),
  errors: Schema.Array(ArchitectPlanIssue),
  warnings: Schema.Array(ArchitectPlanIssue),
  taskCount: Schema.Number,
  edgeCount: Schema.Number,
  waveCount: Schema.optional(Schema.Number),
  validatedAt: IsoDateTime,
});
export type ArchitectPlanValidation = typeof ArchitectPlanValidation.Type;

export const ArchitectPlanStatus = Schema.Literals([
  "generating",
  "ready",
  "invalid",
  "stale",
  "approved",
  "rejected",
  "failed",
  "cancelled",
  "superseded",
]);
export type ArchitectPlanStatus = typeof ArchitectPlanStatus.Type;

export const ArchitectPlanRevision = Schema.Struct({
  number: Schema.Number,
  source: Schema.Literals(["architect", "human"]),
  feedback: Schema.optional(Schema.NullOr(TrimmedString)),
  proposal: ArchitectMissionDraft,
  validation: ArchitectPlanValidation,
  createdAt: IsoDateTime,
});
export type ArchitectPlanRevision = typeof ArchitectPlanRevision.Type;

export const ArchitectPlanProposal = Schema.Struct({
  id: ArchitectPlanProposalId,
  projectId: ProjectId,
  status: ArchitectPlanStatus,
  objective: TrimmedNonEmptyString,
  constraints: Schema.NullOr(TrimmedString),
  planningBaseCommit: TrimmedNonEmptyString,
  observedHeadCommit: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  architectProviderInstanceId: ProviderInstanceId,
  architectModelSelection: ArchitectModelSelection,
  team: Schema.optional(ArchitectTeamConfiguration),
  lifecycle: Schema.optional(ArchitectPlanningLifecycle),
  attempts: Schema.optional(Schema.Array(ArchitectPlanningAttempt)),
  contextFingerprint: TrimmedNonEmptyString,
  contextPaths: Schema.Array(TrimmedNonEmptyString),
  resourcePolicyFingerprint: TrimmedNonEmptyString,
  proposal: Schema.NullOr(ArchitectMissionDraft),
  validation: Schema.NullOr(ArchitectPlanValidation),
  revisions: Schema.Array(ArchitectPlanRevision),
  materializedMissionId: Schema.NullOr(MissionId),
  failureReason: Schema.NullOr(TrimmedString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
});
export type ArchitectPlanProposal = typeof ArchitectPlanProposal.Type;

export const ArchitectPlanGenerateInput = Schema.Struct({
  proposalId: ArchitectPlanProposalId,
  projectId: ProjectId,
  objective: TrimmedNonEmptyString,
  constraints: Schema.optional(TrimmedString),
  modelSelection: ArchitectModelSelection,
  contextPaths: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  team: Schema.optional(ArchitectTeamConfiguration),
  previousProposal: Schema.optional(ArchitectMissionDraft),
  revisionFeedback: Schema.optional(TrimmedString),
});
export type ArchitectPlanGenerateInput = typeof ArchitectPlanGenerateInput.Type;

export const ArchitectPlanGenerateResult = Schema.Struct({
  plan: ArchitectPlanProposal,
});
export type ArchitectPlanGenerateResult = typeof ArchitectPlanGenerateResult.Type;

export class ArchitectPlanGenerationError extends Schema.TaggedErrorClass<ArchitectPlanGenerationError>()(
  "ArchitectPlanGenerationError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect()) },
) {}

export const ArchitectPlanMaterializationTask = Schema.Struct({
  key: TrimmedNonEmptyString,
  taskId: TaskId,
});
export type ArchitectPlanMaterializationTask = typeof ArchitectPlanMaterializationTask.Type;
