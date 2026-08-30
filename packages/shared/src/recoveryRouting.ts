import type {
  CoordinationRequestKind,
  FailureClass,
  ProviderInstanceId,
  ReplanScope,
  ReplanEvidence,
  ReplanTrigger,
  RoutingDecision,
  RoutingProfile,
  TaskId,
  TaskRecoveryState,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const DEFAULT_TRANSPORT_RETRY_LIMIT = 1;
export const DEFAULT_REMEDIATION_LIMIT = 0;

export interface RuntimeFailureEvidence {
  readonly source:
    | "transport"
    | "provider"
    | "quality"
    | "review"
    | "ownership"
    | "resource"
    | "workspace"
    | "planning";
  readonly code?: string | null;
  readonly message?: string | null;
  readonly reviewVerdict?: "request_changes" | "reject" | null;
}

const transientCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "PROCESS_EXIT_TRANSIENT",
  "RATE_LIMITED",
]);
const authCodes = new Set(["AUTH_EXPIRED", "AUTH_REQUIRED", "UNAUTHORIZED", "PROVIDER_DISABLED"]);

/** Runtime evidence wins; text is used only as a conservative fallback. */
export function classifyRuntimeFailure(evidence: RuntimeFailureEvidence): FailureClass {
  if (evidence.source === "quality") return "quality_failure";
  if (evidence.source === "review" && evidence.reviewVerdict === "request_changes")
    return "review_request_changes";
  if (evidence.source === "ownership") return "ownership_violation";
  if (evidence.source === "resource") return "resource_violation";
  if (evidence.source === "workspace") return "workspace_failure";
  if (evidence.source === "planning") return "planning_architecture_blocker";
  const code = evidence.code?.toUpperCase() ?? "";
  if (transientCodes.has(code)) return "transport_transient";
  if (authCodes.has(code)) return "provider_unavailable_auth";
  const message = evidence.message?.toLowerCase() ?? "";
  if (
    /auth|credential|token expired|unauthorized|provider instance .+ (?:is )?disabled|provider unavailable/.test(
      message,
    )
  )
    return "provider_unavailable_auth";
  if (
    /timeout|timed out|connection reset|network|transport|broken pipe|did not survive (?:a )?server restart/.test(
      message,
    )
  )
    return "transport_transient";
  return "provider_execution_error";
}

export function recoveryAction(input: {
  readonly failureClass: FailureClass;
  readonly transientRetries: number;
  readonly remediationRounds: number;
  readonly transportRetryLimit?: number;
  readonly remediationLimit?: number;
  readonly replacementAvailable: boolean;
}): "retry" | "remediate" | "replace" | "attention" {
  const retryLimit = input.transportRetryLimit ?? DEFAULT_TRANSPORT_RETRY_LIMIT;
  if (input.failureClass === "transport_transient") {
    if (input.transientRetries < retryLimit) return "retry";
    return "attention";
  }
  // Provider substitution and reasoning remediation are deliberate user actions.
  // Retaining them as explicit attention prevents subscription-burning loops and
  // keeps the canonical Task/worktree available for the Mission operator.
  return "attention";
}

const providerEscalationFailureClasses = new Set<FailureClass>([
  "provider_execution_error",
  "planning_architecture_blocker",
  "provider_capability_mismatch",
  "execution_loop",
]);

export function hasRepeatedExecutionFailureLoop(
  state: Pick<TaskRecoveryState, "attempts">,
  providerInstanceId: ProviderInstanceId,
): boolean {
  const failures = state.attempts.filter(
    (attempt) =>
      attempt.providerInstanceId === providerInstanceId &&
      attempt.status === "failed" &&
      attempt.failureClass !== null &&
      attempt.summary.trim().length > 0,
  );
  const latest = failures.at(-1);
  const previous = failures.at(-2);
  return (
    latest !== undefined &&
    previous !== undefined &&
    latest.failureClass === previous.failureClass &&
    latest.summary.trim() === previous.summary.trim()
  );
}

export function recommendProviderEscalation(input: {
  readonly state: TaskRecoveryState;
  readonly failedProviderInstanceId: ProviderInstanceId;
  readonly candidates: ReadonlyArray<RoutingCandidate>;
  readonly failureClass: FailureClass;
  readonly createdAt: string;
}): NonNullable<TaskRecoveryState["providerEscalation"]> | null {
  if (!providerEscalationFailureClasses.has(input.failureClass)) return null;
  const sameProviderFailures = input.state.attempts.filter(
    (attempt) =>
      attempt.providerInstanceId === input.failedProviderInstanceId &&
      attempt.status === "failed" &&
      attempt.failureClass !== null &&
      providerEscalationFailureClasses.has(attempt.failureClass),
  ).length;
  if (input.failureClass !== "provider_capability_mismatch" && sameProviderFailures < 2)
    return null;
  const alternative = input.candidates
    .filter(
      (candidate) => candidate.ready && candidate.instanceId !== input.failedProviderInstanceId,
    )
    .toSorted((left, right) => left.instanceId.localeCompare(right.instanceId))[0];
  const possibleLoop = hasRepeatedExecutionFailureLoop(input.state, input.failedProviderInstanceId);
  return {
    failedProviderInstanceId: input.failedProviderInstanceId,
    recommendedProviderInstanceId: alternative?.instanceId ?? null,
    reason:
      input.failureClass === "provider_capability_mismatch"
        ? `The current provider cannot satisfy a required Task capability. ${alternative ? `Provider '${alternative.instanceId}' is available as an alternative.` : "No alternative provider is currently ready."}`
        : `This Task has ${sameProviderFailures} non-transient failures with provider '${input.failedProviderInstanceId}'.${possibleLoop ? " Repeated identical failure evidence indicates a possible execution loop." : ""} ${alternative ? `Provider '${alternative.instanceId}' is available as an alternative.` : "No alternative provider is currently ready."}`,
    status: "recommended",
    createdAt: input.createdAt,
    resolvedAt: null,
  };
}

export interface RoutingCandidate {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: string;
  readonly model: string;
  readonly ready: boolean;
  readonly activeLoad: number;
  readonly reservedForReview?: boolean;
  readonly historicalSuccessRate?: number;
}

export interface CapacityAdviceRequest {
  readonly taskId: TaskId;
  readonly taskRole: string;
  readonly profile: RoutingProfile;
  readonly candidates: ReadonlyArray<RoutingCandidate>;
  readonly excludedInstanceIds?: ReadonlySet<ProviderInstanceId>;
  readonly preferredDifferentDriverFrom?: string | null;
  readonly decidedAt: string;
}

export interface CapacityAdvice {
  readonly decision: RoutingDecision | null;
}

export interface CapacityAdvisor {
  recommend(request: CapacityAdviceRequest): CapacityAdvice;
}

function localRecommendation(request: CapacityAdviceRequest): CapacityAdvice {
  if (request.profile === "manual_only") return { decision: null };
  const excluded = request.excludedInstanceIds ?? new Set<ProviderInstanceId>();
  const ready = request.candidates.filter(
    (candidate) => candidate.ready && !excluded.has(candidate.instanceId),
  );
  if (ready.length === 0) return { decision: null };
  const sorted = ready.toSorted((left, right) => {
    if (request.profile === "maximum_quality") {
      const leftOutcome = left.historicalSuccessRate ?? -1;
      const rightOutcome = right.historicalSuccessRate ?? -1;
      if (leftOutcome !== rightOutcome) return rightOutcome - leftOutcome;
    }
    if (request.profile === "provider_diversity" && request.preferredDifferentDriverFrom) {
      const leftDifferent = left.driverKind !== request.preferredDifferentDriverFrom ? 1 : 0;
      const rightDifferent = right.driverKind !== request.preferredDifferentDriverFrom ? 1 : 0;
      if (leftDifferent !== rightDifferent) return rightDifferent - leftDifferent;
    }
    if (request.profile === "balanced" || request.profile === "provider_diversity") {
      const leftReserved = left.reservedForReview ? 1 : 0;
      const rightReserved = right.reservedForReview ? 1 : 0;
      if (leftReserved !== rightReserved) return leftReserved - rightReserved;
    }
    return left.activeLoad - right.activeLoad || left.instanceId.localeCompare(right.instanceId);
  });
  const selected = sorted[0]!;
  const reasons = [
    "Provider is ready.",
    `Current active load is ${selected.activeLoad}.`,
    `${request.profile.replaceAll("_", " ")} policy.`,
  ];
  if (
    request.profile === "provider_diversity" &&
    request.preferredDifferentDriverFrom &&
    selected.driverKind !== request.preferredDifferentDriverFrom
  )
    reasons.splice(1, 0, "Provider driver preserves execution and review diversity.");
  if (
    (request.profile === "balanced" || request.profile === "provider_diversity") &&
    ready.some((candidate) => candidate.reservedForReview) &&
    !selected.reservedForReview
  )
    reasons.splice(1, 0, "Independent reviewer capacity was preserved.");
  if (request.profile === "maximum_quality" && selected.historicalSuccessRate !== undefined)
    reasons.splice(1, 0, "Historical local Task outcomes favored this provider.");
  return {
    decision: {
      taskId: request.taskId,
      profile: request.profile,
      selectedProviderInstanceId: selected.instanceId,
      selectedModel: selected.model,
      reasons,
      consideredProviderInstanceIds: ready.map((candidate) => candidate.instanceId),
      decidedAt: request.decidedAt,
    },
  };
}

export const LocalCapacityAdvisor: CapacityAdvisor = { recommend: localRecommendation };

export function recommendWithFallback(
  request: CapacityAdviceRequest,
  advisor?: CapacityAdvisor | null,
): CapacityAdvice {
  try {
    return advisor?.recommend(request) ?? LocalCapacityAdvisor.recommend(request);
  } catch {
    return LocalCapacityAdvisor.recommend(request);
  }
}

const CoordinationRequestDraft = Schema.Struct({
  type: Schema.Literal("nebula_coordination_request"),
  kind: Schema.Literals([
    "ownership_request",
    "resource_request",
    "contract_question",
    "dependency_question",
    "blocker",
    "replan_request",
  ]),
  reason: Schema.String,
  paths: Schema.optional(
    Schema.Array(
      Schema.Struct({
        pattern: Schema.String,
        access: Schema.Literals(["read", "write", "deny"]),
        reason: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
  resource: Schema.optional(Schema.String),
  question: Schema.optional(Schema.String),
  scope: Schema.optional(
    Schema.Literals(["task_repair", "task_split", "mission_subgraph", "full_mission"]),
  ),
  trigger: Schema.optional(
    Schema.Literals([
      "assumption_invalidated",
      "dependency_contract_changed",
      "ownership_expansion",
      "task_blocked_architecturally",
      "provider_repeated_failure",
      "integration_semantic_conflict",
      "user_requirement_changed",
      "new_required_work",
    ]),
  ),
  evidence: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals([
          "repository_fact",
          "contract_diff",
          "ownership_fact",
          "attempt_history",
          "integration_fact",
          "user_decision",
        ]),
        summary: Schema.String,
        expected: Schema.optional(Schema.NullOr(Schema.String)),
        observed: Schema.String,
        source: Schema.String,
      }),
    ),
  ),
});
const decodeCoordinationRequestDraft = Schema.decodeUnknownSync(CoordinationRequestDraft);

export interface ParsedCoordinationRequest {
  readonly kind: CoordinationRequestKind;
  readonly reason: string;
  readonly paths: ReadonlyArray<{
    readonly pattern: string;
    readonly access: "read" | "write" | "deny";
    readonly reason: string | null;
  }>;
  readonly resource: string | null;
  readonly question: string | null;
  readonly scope: ReplanScope | null;
  readonly trigger: ReplanTrigger | null;
  readonly evidence: ReadonlyArray<ReplanEvidence>;
}

export function parseCoordinationRequest(text: string): ParsedCoordinationRequest | null {
  const candidates: string[] = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]!;
      if (escaped) escaped = false;
      else if (character === "\\" && quoted) escaped = true;
      else if (character === '"') quoted = !quoted;
      else if (!quoted && character === "{") depth += 1;
      else if (!quoted && character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const value = decodeCoordinationRequestDraft(JSON.parse(candidate));
      if (value.reason.trim().length === 0) continue;
      return {
        kind: value.kind,
        reason: value.reason.trim(),
        paths: (value.paths ?? []).map((path) => ({
          pattern: path.pattern.trim(),
          access: path.access,
          reason: path.reason?.trim() || null,
        })),
        resource: value.resource?.trim() || null,
        question: value.question?.trim() || null,
        scope: value.scope ?? null,
        trigger: value.trigger ?? null,
        evidence: (value.evidence ?? [])
          .filter(
            (item) =>
              item.summary.trim().length > 0 &&
              item.observed.trim().length > 0 &&
              item.source.trim().length > 0,
          )
          .map((item) => ({
            kind: item.kind,
            summary: item.summary.trim(),
            expected: item.expected?.trim() || null,
            observed: item.observed.trim(),
            source: item.source.trim(),
          })),
      };
    } catch {
      // Provider prose is untrusted; malformed proposals cannot mutate policy.
    }
  }
  return null;
}

export function smallestReplanScope(input: {
  readonly requested?: ReplanScope | null;
  readonly affectedTaskCount: number;
  readonly missionTaskCount: number;
}): ReplanScope {
  if (!input.requested || input.requested === "task_repair") return "task_repair";
  if (input.requested === "task_split") return "task_split";
  if (input.affectedTaskCount < input.missionTaskCount) return "mission_subgraph";
  return "full_mission";
}
