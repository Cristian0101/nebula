import type {
  OrchestrationTask,
  ResourceLease,
  SharedResourceDefinition,
  SharedResourceId,
  TaskChangedFile,
} from "@t3tools/contracts";
import { minimatch } from "minimatch";

const DRIVE_PATH = /^[A-Za-z]:\//;
const URI_PATH = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

export function normalizeResourcePattern(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    DRIVE_PATH.test(normalized) ||
    URI_PATH.test(normalized) ||
    normalized.startsWith("!") ||
    normalized.startsWith("#") ||
    normalized.endsWith("/") ||
    normalized.includes("//")
  ) {
    throw new Error("Shared resource patterns must be repository-relative Git patterns.");
  }
  if (
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Shared resource patterns cannot contain '.', '..', or empty segments.");
  }
  return normalized;
}

export function validateSharedResourceDefinition(
  resource: Pick<SharedResourceDefinition, "patterns" | "mode">,
): void {
  if (resource.mode !== "exclusive")
    throw new Error("Only exclusive shared resources are supported.");
  if (resource.patterns.length === 0)
    throw new Error("A shared resource requires at least one path pattern.");
  const normalized = resource.patterns.map(normalizeResourcePattern);
  if (new Set(normalized).size !== normalized.length)
    throw new Error("Shared resource patterns must be unique.");
}

export function resourceMatchesPath(resource: SharedResourceDefinition, path: string): boolean {
  const normalizedPath = normalizeResourcePattern(path);
  return resource.patterns.some((pattern) =>
    minimatch(normalizedPath, normalizeResourcePattern(pattern), {
      dot: true,
      nocase: false,
      nocomment: true,
      nonegate: true,
      platform: "linux",
    }),
  );
}

export function resourceBlockers(input: {
  readonly task: Pick<OrchestrationTask, "id" | "requiredResourceIds">;
  readonly resources: ReadonlyArray<SharedResourceDefinition>;
  readonly leases: ReadonlyArray<ResourceLease>;
}) {
  const enabled = new Map(
    input.resources
      .filter((resource) => resource.enabled)
      .map((resource) => [resource.id, resource]),
  );
  const held = new Map(
    input.leases
      .filter((lease) => lease.status === "held")
      .map((lease) => [lease.resourceId, lease]),
  );
  return (input.task.requiredResourceIds ?? []).flatMap((resourceId) => {
    const resource = enabled.get(resourceId);
    if (!resource) return [];
    const lease = held.get(resourceId);
    return lease && lease.taskId !== input.task.id ? [{ resource, lease }] : [];
  });
}

export function evaluateResourceCompliance(input: {
  readonly taskId: string;
  readonly changedFiles: ReadonlyArray<TaskChangedFile>;
  readonly resources: ReadonlyArray<SharedResourceDefinition>;
  readonly leases: ReadonlyArray<ResourceLease>;
}) {
  const heldIds = new Set(
    input.leases
      .filter((lease) => lease.status === "held" && lease.taskId === input.taskId)
      .map((lease) => lease.resourceId),
  );
  const violations = new Map<
    string,
    { path: string; resourceId: SharedResourceId; resourceName: string }
  >();
  for (const file of input.changedFiles) {
    for (const path of [file.path, file.previousPath].filter(
      (value): value is string => value !== null,
    )) {
      for (const resource of input.resources) {
        if (resource.enabled && resourceMatchesPath(resource, path) && !heldIds.has(resource.id)) {
          violations.set(`${resource.id}\0${path}`, {
            path,
            resourceId: resource.id,
            resourceName: resource.name,
          });
        }
      }
    }
  }
  return [...violations.values()].toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) || left.resourceName.localeCompare(right.resourceName),
  );
}
