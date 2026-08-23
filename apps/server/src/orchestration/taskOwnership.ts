import type {
  TaskOwnershipChangeType,
  TaskOwnershipRule,
  TaskOwnershipViolation,
} from "@t3tools/contracts";
import { minimatch } from "minimatch";
import { normalizeOwnershipPath, normalizeOwnershipPattern } from "@t3tools/shared/ownershipPaths";

export { normalizeOwnershipPath, normalizeOwnershipPattern } from "@t3tools/shared/ownershipPaths";

export interface TaskOwnershipChange {
  readonly path: string;
  readonly changeType: TaskOwnershipChangeType;
  readonly previousPath?: string;
}

export function validateOwnershipRules(rules: ReadonlyArray<TaskOwnershipRule>): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    normalizeOwnershipPattern(rule.pattern);
    if (ids.has(rule.id)) throw new Error(`Duplicate ownership rule id '${rule.id}'.`);
    ids.add(rule.id);
  }
}

function matchingRules(path: string, rules: ReadonlyArray<TaskOwnershipRule>) {
  return rules.filter((rule) =>
    minimatch(path, normalizeOwnershipPattern(rule.pattern), {
      dot: true,
      nocase: false,
      nocomment: true,
      nonegate: true,
      platform: "linux",
    }),
  );
}

export function evaluateTaskOwnership(
  rules: ReadonlyArray<TaskOwnershipRule>,
  changes: ReadonlyArray<TaskOwnershipChange>,
): {
  readonly changedPathCount: number;
  readonly violations: ReadonlyArray<TaskOwnershipViolation>;
} {
  validateOwnershipRules(rules);
  const evaluated = new Map<string, TaskOwnershipChangeType>();
  for (const change of changes) {
    const path = normalizeOwnershipPath(change.path);
    evaluated.set(path, change.changeType);
    if (change.previousPath !== undefined) {
      evaluated.set(normalizeOwnershipPath(change.previousPath), change.changeType);
    }
  }

  const violations: TaskOwnershipViolation[] = [];
  for (const [path, changeType] of [...evaluated].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const matchedRules = matchingRules(path, rules);
    const denied = matchedRules.some((rule) => rule.access === "deny");
    const writable = matchedRules.some((rule) => rule.access === "write");
    const readOnly = matchedRules.some((rule) => rule.access === "read");
    if (denied || !writable) {
      violations.push({
        path,
        changeType,
        reason: denied ? "denied" : readOnly ? "read-only" : "unclassified",
        matchedRules,
      });
    }
  }
  return { changedPathCount: evaluated.size, violations };
}
