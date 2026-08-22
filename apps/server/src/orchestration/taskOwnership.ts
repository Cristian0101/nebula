import type {
  TaskOwnershipChangeType,
  TaskOwnershipRule,
  TaskOwnershipViolation,
} from "@t3tools/contracts";
import { minimatch } from "minimatch";

export interface TaskOwnershipChange {
  readonly path: string;
  readonly changeType: TaskOwnershipChangeType;
  readonly previousPath?: string;
}

const DRIVE_PATH = /^[A-Za-z]:\//;
const URI_PATH = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

export function normalizeOwnershipPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    DRIVE_PATH.test(normalized) ||
    URI_PATH.test(normalized) ||
    normalized.endsWith("/") ||
    normalized.includes("//")
  ) {
    throw new Error("Ownership paths must be non-empty repository-relative Git paths.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Ownership paths cannot contain '.', '..', or empty segments.");
  }
  return normalized;
}

export function normalizeOwnershipPattern(value: string): string {
  const normalized = normalizeOwnershipPath(value.trim());
  if (normalized.startsWith("!") || normalized.startsWith("#")) {
    throw new Error("Ownership patterns cannot use negation or comment syntax.");
  }
  return normalized;
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
