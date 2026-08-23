import {
  ARCHITECT_PLAN_MAX_CRITERIA_PER_TASK,
  ARCHITECT_PLAN_MAX_EDGES,
  ARCHITECT_PLAN_MAX_OWNERSHIP_PATTERNS_PER_TASK,
  ARCHITECT_PLAN_MAX_TASKS,
  type ArchitectMissionDraft,
  type ArchitectPlanIssue,
  type ArchitectPlanValidation,
  type SharedResourceDefinition,
  TaskId,
} from "@t3tools/contracts";
import { computeExecutionWaves, validateMissionGraph } from "./missionGraph.ts";
import { normalizeOwnershipPattern } from "./ownershipPaths.ts";

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
  const keys = new Set<string>();
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
