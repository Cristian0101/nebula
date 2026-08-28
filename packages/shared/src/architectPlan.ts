import {
  ARCHITECT_PLAN_MAX_CRITERIA_PER_TASK,
  ARCHITECT_PLAN_MAX_EDGES,
  ARCHITECT_PLAN_MAX_OWNERSHIP_PATTERNS_PER_TASK,
  ARCHITECT_PLAN_MAX_TEAM_AGENTS,
  ARCHITECT_PLAN_MAX_TASKS,
  type ArchitectMissionDraft,
  type ArchitectModelSelection,
  type ArchitectPlanIssue,
  type ArchitectPlanValidation,
  type ArchitectTeamConfiguration,
  type ArchitectTeamPreset,
  type ArchitectTeamRoleKind,
  type SharedResourceDefinition,
  TaskId,
} from "@t3tools/contracts";
import { computeExecutionWaves, validateMissionGraph } from "./missionGraph.ts";
import { normalizeOwnershipPattern } from "./ownershipPaths.ts";

export const ARCHITECT_TEAM_PRESET_OPTIONS = [
  { preset: "pair", label: "Pair", count: 2, maxWritableConcurrency: 1 },
  { preset: "standard", label: "Standard", count: 4, maxWritableConcurrency: 2 },
  { preset: "large", label: "Large", count: 8, maxWritableConcurrency: 3 },
  { preset: "heavy", label: "Heavy", count: 12, maxWritableConcurrency: 4 },
] as const;

function roleSequence(count: number): ReadonlyArray<ArchitectTeamRoleKind> {
  if (count <= 2) return ["builder", "reviewer"].slice(0, count) as ArchitectTeamRoleKind[];
  if (count <= 4)
    return ["builder", "builder", "reviewer", "debugger"].slice(
      0,
      count,
    ) as ArchitectTeamRoleKind[];
  const fixed: ArchitectTeamRoleKind[] = [
    "reviewer",
    "reviewer",
    "debugger",
    "test_specialist",
    "security_reviewer",
    "integrator",
  ];
  const specialistCount = Math.min(fixed.length, Math.max(3, Math.floor(count / 2)));
  return [
    ...Array.from({ length: Math.max(1, count - specialistCount) }, () => "builder" as const),
    ...fixed.slice(0, specialistCount),
  ].slice(0, count);
}

const roleLabel = (role: ArchitectTeamRoleKind, number: number) => {
  const labels: Record<ArchitectTeamRoleKind, string> = {
    builder: "Builder",
    reviewer: "Functional reviewer",
    debugger: "Debugger",
    test_specialist: "Test specialist",
    security_reviewer: "Security reviewer",
    integrator: "Integrator",
  };
  return `${labels[role]} ${number}`;
};

export function createArchitectTeamConfiguration(input: {
  readonly preset: ArchitectTeamPreset;
  readonly customCount?: number | undefined;
  readonly defaultModelSelection?: ArchitectModelSelection | null | undefined;
}): ArchitectTeamConfiguration {
  const option = ARCHITECT_TEAM_PRESET_OPTIONS.find((item) => item.preset === input.preset);
  const requestedCount = option?.count ?? input.customCount ?? 4;
  const count = Number.isFinite(requestedCount)
    ? Math.max(1, Math.min(ARCHITECT_PLAN_MAX_TEAM_AGENTS, Math.round(requestedCount)))
    : 4;
  const maxWritableConcurrency =
    option?.maxWritableConcurrency ?? Math.min(6, Math.ceil(count / 3));
  const roleCounts = new Map<ArchitectTeamRoleKind, number>();
  return {
    preset: input.preset,
    executionAgentCount: count,
    maxWritableConcurrency,
    startingSeats: roleSequence(count).map((role, index) => {
      const roleNumber = (roleCounts.get(role) ?? 0) + 1;
      roleCounts.set(role, roleNumber);
      return {
        key: `seat-${index + 1}`,
        role,
        label: roleLabel(role, roleNumber),
        access:
          role === "reviewer" || role === "security_reviewer"
            ? "review"
            : role === "integrator"
              ? "coordinate"
              : "write",
        modelSelection: input.defaultModelSelection ?? null,
      };
    }),
  };
}

function issue(code: string, message: string, taskKey?: string): ArchitectPlanIssue {
  return { code, message, ...(taskKey ? { taskKey } : {}) };
}

function patternPrefix(pattern: string): string {
  return pattern.split(/[?*[{]/, 1)[0] ?? pattern;
}

export function validateArchitectPlan(input: {
  readonly proposal: ArchitectMissionDraft;
  readonly planningBaseCommit: string;
  readonly resources: ReadonlyArray<SharedResourceDefinition>;
  readonly team?: ArchitectTeamConfiguration | undefined;
  readonly qualityGateIds?: ReadonlyArray<string> | undefined;
  readonly validatedAt: string;
}): ArchitectPlanValidation {
  const errors: ArchitectPlanIssue[] = [];
  const warnings: ArchitectPlanIssue[] = [];
  const { proposal } = input;
  if (!proposal.title.trim() || !proposal.objective.trim()) {
    errors.push(issue("mission-empty", "Mission title and objective are required."));
  }
  if (!input.planningBaseCommit.trim()) {
    errors.push(issue("baseline-missing", "An exact planning base commit is required."));
  }
  if (proposal.tasks.length === 0)
    errors.push(issue("tasks-empty", "At least one Task is required."));
  if (proposal.tasks.length > ARCHITECT_PLAN_MAX_TASKS) {
    errors.push(
      issue("task-limit", `Plans may contain at most ${ARCHITECT_PLAN_MAX_TASKS} Tasks.`),
    );
  }
  if (proposal.dependencies.length > ARCHITECT_PLAN_MAX_EDGES) {
    errors.push(
      issue("edge-limit", `Plans may contain at most ${ARCHITECT_PLAN_MAX_EDGES} dependencies.`),
    );
  }
  if (input.team) {
    if (
      !Number.isInteger(input.team.executionAgentCount) ||
      input.team.executionAgentCount < 1 ||
      input.team.executionAgentCount > ARCHITECT_PLAN_MAX_TEAM_AGENTS
    ) {
      errors.push(
        issue(
          "team-size-invalid",
          `The execution team must contain between 1 and ${ARCHITECT_PLAN_MAX_TEAM_AGENTS} non-Planner agents.`,
        ),
      );
    }
    if (
      !Number.isInteger(input.team.maxWritableConcurrency) ||
      input.team.maxWritableConcurrency < 1 ||
      input.team.maxWritableConcurrency > input.team.executionAgentCount
    ) {
      errors.push(
        issue(
          "team-concurrency-invalid",
          "Max writable concurrency must be at least 1 and cannot exceed the non-Planner team size.",
        ),
      );
    }
    if (input.team.startingSeats.length !== input.team.executionAgentCount) {
      errors.push(
        issue(
          "team-roster-size",
          "The starting roster must contain exactly one seat per selected non-Planner agent.",
        ),
      );
    }
    if (proposal.tasks.length > input.team.executionAgentCount) {
      errors.push(
        issue(
          "team-plan-over-capacity",
          `The Planner proposed ${proposal.tasks.length} Task agents, exceeding the selected maximum of ${input.team.executionAgentCount}.`,
        ),
      );
    }
    if (
      new Set(input.team.startingSeats.map((seat) => seat.key)).size !==
      input.team.startingSeats.length
    )
      errors.push(issue("team-roster-duplicate", "Starting roster seat keys must be unique."));
  }
  const keys = new Set<string>();
  const resourceIds = new Set<string>();
  for (const resource of input.resources) {
    if (resourceIds.has(resource.id))
      errors.push(
        issue(
          "resource-id-duplicate",
          `Shared Resource ID '${resource.id}' must be unique within the Project policy.`,
        ),
      );
    resourceIds.add(resource.id);
  }
  const enabledResources = new Set(
    input.resources.filter((resource) => resource.enabled).map((resource) => resource.id),
  );
  for (const task of proposal.tasks) {
    if (keys.has(task.key))
      errors.push(issue("duplicate-task-key", `Task key '${task.key}' is duplicated.`, task.key));
    keys.add(task.key);
    if (!task.title.trim() || !task.objective.trim())
      errors.push(issue("task-empty", "Task title and objective are required.", task.key));
    if (task.acceptanceCriteria.length === 0)
      warnings.push(issue("criteria-empty", "Add observable acceptance criteria.", task.key));
    if (task.acceptanceCriteria.length > ARCHITECT_PLAN_MAX_CRITERIA_PER_TASK)
      errors.push(
        issue(
          "criteria-limit",
          `A Task may contain at most ${ARCHITECT_PLAN_MAX_CRITERIA_PER_TASK} criteria.`,
          task.key,
        ),
      );
    const patterns = [...task.ownership.write, ...task.ownership.read, ...task.ownership.deny];
    const reviewOnly = task.role === "reviewer" || task.role === "security_reviewer";
    const coordinationOnly = task.role === "integrator";
    if (reviewOnly || coordinationOnly) {
      errors.push(
        issue(
          "managed-role-unsupported",
          reviewOnly
            ? "Independent review is a policy seat in supervised Swarm runs, not a materialized execution Task. Remove this Task and use the Mission review policy."
            : "Integrator work is created only after a concrete Integration conflict, not in the initial supervised plan.",
          task.key,
        ),
      );
    }
    if (!reviewOnly && !coordinationOnly && task.ownership.write.length === 0) {
      errors.push(
        issue(
          "ownership-write-empty",
          "Writable execution Tasks require at least one explicit WRITE path.",
          task.key,
        ),
      );
    }
    if (patterns.length > ARCHITECT_PLAN_MAX_OWNERSHIP_PATTERNS_PER_TASK)
      errors.push(
        issue(
          "ownership-limit",
          `A Task may contain at most ${ARCHITECT_PLAN_MAX_OWNERSHIP_PATTERNS_PER_TASK} ownership patterns.`,
          task.key,
        ),
      );
    for (const pattern of patterns) {
      try {
        normalizeOwnershipPattern(pattern);
      } catch (error) {
        errors.push(
          issue(
            "ownership-invalid",
            error instanceof Error ? error.message : "Invalid ownership pattern.",
            task.key,
          ),
        );
      }
    }
    if (task.ownership.write.includes("**"))
      warnings.push(issue("broad-write", "Entire repository writable (WRITE **).", task.key));
    for (const resourceId of task.requiredResourceIds)
      if (!enabledResources.has(resourceId))
        errors.push(
          issue(
            "unknown-resource",
            `Shared Resource '${resourceId}' is missing or disabled.`,
            task.key,
          ),
        );
    if (task.reviewerKey === task.key)
      errors.push(issue("reviewer-self", "A Task cannot review itself.", task.key));
    const claimedResources = new Set(task.requiredResourceIds);
    for (const resource of input.resources.filter((candidate) => candidate.enabled)) {
      if (claimedResources.has(resource.id)) continue;
      const intersectsConservatively = task.ownership.write.some((writePattern) =>
        resource.patterns.some((resourcePattern) => {
          const writePrefix = patternPrefix(writePattern);
          const resourcePrefix = patternPrefix(resourcePattern);
          return (
            writePrefix.length === 0 ||
            resourcePrefix.length === 0 ||
            writePrefix.startsWith(resourcePrefix) ||
            resourcePrefix.startsWith(writePrefix)
          );
        }),
      );
      if (intersectsConservatively)
        warnings.push(
          issue(
            "missing-resource-claim",
            `Potential missing Shared Resource requirement '${resource.name}'. Pattern intersection is conservative; runtime resource compliance remains authoritative.`,
            task.key,
          ),
        );
    }
  }
  for (const task of proposal.tasks) {
    if (task.reviewerKey && !keys.has(task.reviewerKey))
      errors.push(
        issue("reviewer-missing", `Reviewer Task '${task.reviewerKey}' does not exist.`, task.key),
      );
  }
  const checkpointKeys = new Set<string>();
  const checkpointByKey = new Map<
    string,
    NonNullable<ArchitectMissionDraft["checkpoints"]>[number]
  >();
  const qualityGateIds = new Set(input.qualityGateIds ?? []);
  for (const checkpoint of proposal.checkpoints ?? []) {
    if (checkpointKeys.has(checkpoint.key))
      errors.push(
        issue("checkpoint-duplicate", `Checkpoint key '${checkpoint.key}' is duplicated.`),
      );
    checkpointKeys.add(checkpoint.key);
    checkpointByKey.set(checkpoint.key, checkpoint);
    if (checkpoint.requiredTaskKeys.length === 0)
      errors.push(
        issue("checkpoint-empty", `Checkpoint '${checkpoint.name}' requires at least one Task.`),
      );
    for (const taskKey of [...checkpoint.requiredTaskKeys, ...checkpoint.unlockTaskKeys])
      if (!keys.has(taskKey))
        errors.push(
          issue(
            "checkpoint-task-missing",
            `Checkpoint '${checkpoint.name}' references unknown Task '${taskKey}'.`,
          ),
        );
    for (const gateId of checkpoint.requiredGateIds)
      if (!qualityGateIds.has(gateId))
        errors.push(
          issue(
            "checkpoint-gate-missing",
            `Checkpoint '${checkpoint.name}' references unavailable quality gate '${gateId}'.`,
          ),
        );
  }
  for (const task of proposal.tasks)
    if (task.checkpointKey) {
      const checkpoint = checkpointByKey.get(task.checkpointKey);
      if (!checkpoint)
        errors.push(
          issue(
            "checkpoint-missing",
            `Task references unknown checkpoint '${task.checkpointKey}'.`,
            task.key,
          ),
        );
      else if (!checkpoint.unlockTaskKeys.includes(task.key))
        errors.push(
          issue(
            "checkpoint-task-mismatch",
            `Task '${task.key}' names checkpoint '${task.checkpointKey}', but that checkpoint does not unlock it.`,
            task.key,
          ),
        );
    }
  for (const checkpoint of proposal.checkpoints ?? [])
    for (const taskKey of checkpoint.unlockTaskKeys) {
      const task = proposal.tasks.find((candidate) => candidate.key === taskKey);
      if (task && task.checkpointKey !== checkpoint.key)
        errors.push(
          issue(
            "checkpoint-task-mismatch",
            `Checkpoint '${checkpoint.name}' unlocks Task '${taskKey}', but the Task does not name that checkpoint.`,
            taskKey,
          ),
        );
    }
  const keyMap = new Map(
    proposal.tasks.map(
      (task, index) => [task.key, TaskId.make(`architect-${index}-${task.key}`)] as const,
    ),
  );
  const graphEdges = proposal.dependencies.flatMap((edge) => {
    const prerequisiteTaskId = keyMap.get(edge.prerequisiteKey);
    const dependentTaskId = keyMap.get(edge.dependentKey);
    if (!prerequisiteTaskId || !dependentTaskId) {
      errors.push(
        issue(
          "dependency-endpoint",
          `Dependency '${edge.prerequisiteKey}' → '${edge.dependentKey}' references an unknown Task.`,
        ),
      );
      return [];
    }
    return [
      {
        missionId: "architect-validation" as never,
        prerequisiteTaskId,
        dependentTaskId,
        createdAt: input.validatedAt,
      },
    ];
  });
  const graph = validateMissionGraph([...keyMap.values()], graphEdges);
  if (!graph.valid && !errors.some((candidate) => candidate.code === "dependency-endpoint"))
    errors.push(issue("dag-invalid", graph.error ?? "The Task graph is invalid."));
  const edgeKeys = new Set<string>();
  for (const edge of proposal.dependencies) {
    const edgeKey = `${edge.prerequisiteKey}\0${edge.dependentKey}`;
    if (edgeKeys.has(edgeKey))
      errors.push(
        issue(
          "duplicate-edge",
          `Dependency '${edge.prerequisiteKey}' → '${edge.dependentKey}' is duplicated.`,
        ),
      );
    edgeKeys.add(edgeKey);
  }
  for (let leftIndex = 0; leftIndex < proposal.tasks.length; leftIndex += 1) {
    const left = proposal.tasks[leftIndex]!;
    for (const right of proposal.tasks.slice(leftIndex + 1)) {
      if (
        left.ownership.write.some((a) =>
          right.ownership.write.some(
            (b) =>
              patternPrefix(a).startsWith(patternPrefix(b)) ||
              patternPrefix(b).startsWith(patternPrefix(a)),
          ),
        )
      ) {
        warnings.push(
          issue(
            "write-overlap",
            `Potential overlapping write scope with '${right.title}'.`,
            left.key,
          ),
        );
      }
    }
  }
  const waves = graph.valid ? computeExecutionWaves([...keyMap.values()], graphEdges) : [];
  return {
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
    warnings,
    taskCount: proposal.tasks.length,
    edgeCount: proposal.dependencies.length,
    ...(graph.valid ? { waveCount: waves.length } : {}),
    validatedAt: input.validatedAt as never,
  };
}
