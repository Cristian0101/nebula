import {
  ResourceLeaseId,
  SharedResourceId,
  TaskId,
  type ResourceLease,
  type SharedResourceDefinition,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  evaluateResourceCompliance,
  normalizeResourcePattern,
  resourceBlockers,
  resourceMatchesPath,
  validateSharedResourceDefinition,
} from "./resourceCoordination.ts";

const now = "2026-08-23T12:00:00.000Z";
const resource = (id: string, patterns: string[]): SharedResourceDefinition => ({
  id: SharedResourceId.make(id),
  projectId: "project" as never,
  name: id,
  description: null,
  patterns,
  mode: "exclusive",
  enabled: true,
  createdAt: now,
  updatedAt: now,
});
const lease = (resourceId: SharedResourceId, taskId: string): ResourceLease => ({
  id: ResourceLeaseId.make(`${resourceId}-${taskId}`),
  projectId: "project" as never,
  resourceId,
  taskId: TaskId.make(taskId),
  status: "held",
  acquiredAt: now,
  releasedAt: null,
});

describe("shared resource coordination", () => {
  it.each(["/root", "../escape", "src/../escape", "file://repo/a", "C:/repo/a", "src//a", "src/"])(
    "rejects unsafe pattern %s",
    (pattern) => expect(() => normalizeResourcePattern(pattern)).toThrow(),
  );

  it("uses the ownership-compatible case-sensitive glob language", () => {
    const api = resource("api", ["packages/contracts/src/schema/**"]);
    expect(resourceMatchesPath(api, "packages/contracts/src/schema/auth.ts")).toBe(true);
    expect(resourceMatchesPath(api, "Packages/contracts/src/schema/auth.ts")).toBe(false);
    expect(() => validateSharedResourceDefinition(resource("empty", []))).toThrow();
  });

  it("reports a holder without changing DAG readiness", () => {
    const manifest = resource("manifest", ["package.json", "pnpm-lock.yaml"]);
    const held = lease(manifest.id, "frontend");
    expect(
      resourceBlockers({
        task: { id: TaskId.make("backend"), requiredResourceIds: [manifest.id] },
        resources: [manifest],
        leases: [held],
      }),
    ).toMatchObject([
      { resource: { id: manifest.id }, lease: { taskId: TaskId.make("frontend") } },
    ]);
  });

  it("makes ownership-valid shared paths invalid without the matching lease", () => {
    const manifest = resource("manifest", ["package.json", "pnpm-lock.yaml"]);
    const changedFiles = [
      {
        path: "package.json",
        previousPath: null,
        changeType: "modified" as const,
        additions: 1,
        deletions: 0,
        binary: false,
        untracked: false,
      },
    ];
    expect(
      evaluateResourceCompliance({
        taskId: "backend",
        changedFiles,
        resources: [manifest],
        leases: [],
      }),
    ).toEqual([{ path: "package.json", resourceId: manifest.id, resourceName: "manifest" }]);
    expect(
      evaluateResourceCompliance({
        taskId: "backend",
        changedFiles,
        resources: [manifest],
        leases: [lease(manifest.id, "backend")],
      }),
    ).toEqual([]);
  });

  it("stays deterministic at the flagship 20-resource, 10-Task, 30-pattern scale", () => {
    const resources = Array.from({ length: 20 }, (_, resourceIndex) =>
      resource(
        `resource-${resourceIndex}`,
        Array.from(
          { length: 30 },
          (_, patternIndex) => `shared/${resourceIndex}/${patternIndex}/**`,
        ),
      ),
    );
    const leases = Array.from({ length: 10 }, (_, taskIndex) =>
      lease(resources[taskIndex]!.id, `task-${taskIndex}`),
    );
    const blockers = Array.from({ length: 10 }, (_, taskIndex) =>
      resourceBlockers({
        task: {
          id: TaskId.make(`contender-${taskIndex}`),
          requiredResourceIds: [resources[taskIndex]!.id],
        },
        resources,
        leases,
      }),
    );
    expect(blockers.every((entry) => entry.length === 1)).toBe(true);
    expect(blockers.map((entry) => entry[0]!.lease.taskId)).toEqual(
      Array.from({ length: 10 }, (_, taskIndex) => TaskId.make(`task-${taskIndex}`)),
    );
  });
});
