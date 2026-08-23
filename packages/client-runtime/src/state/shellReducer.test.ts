import { describe, expect, it } from "vite-plus/test";

import {
  IntegrationBatchId,
  MissionId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import type { OrchestrationShellSnapshot, OrchestrationShellStreamEvent } from "@t3tools/contracts";

import { applyShellStreamEvent } from "./shellReducer.ts";

const baseSnapshot: OrchestrationShellSnapshot = {
  snapshotSequence: 0,
  projects: [],
  threads: [],
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const stubProject = {
  id: ProjectId.make("project-1"),
  title: "Test Project",
  workspaceRoot: "/workspace/test",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
} as const;

const stubThread = {
  id: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  title: "Test Thread",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  session: null,
} as const;

const stubTask = {
  id: TaskId.make("task-1"),
  projectId: ProjectId.make("project-1"),
  title: "Test Task",
  objective: "Prove the Task client projection.",
  role: "builder" as const,
  status: "draft" as const,
  threadId: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  activatedAt: null,
  completedAt: null,
  cancelledAt: null,
};

const stubMission = {
  id: MissionId.make("mission-1"),
  projectId: ProjectId.make("project-1"),
  title: "Test Mission",
  objective: "Prove the Mission client projection.",
  description: null,
  status: "active" as const,
  taskIds: [TaskId.make("task-1")],
  dependencies: [],
  activities: [],
  integrationBatchId: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  activatedAt: "2026-04-01T00:00:00.000Z",
  completedAt: null,
  cancelledAt: null,
};

describe("applyShellStreamEvent", () => {
  it("ignores stale project upserts without mutating the snapshot", () => {
    const snapshotWithProject: OrchestrationShellSnapshot = {
      ...baseSnapshot,
      snapshotSequence: 4,
      projects: [stubProject],
    };

    for (const sequence of [3, 4]) {
      const next = applyShellStreamEvent(snapshotWithProject, {
        kind: "project-upserted",
        sequence,
        project: { ...stubProject, title: "Stale Title" },
      });

      expect(next).toBe(snapshotWithProject);
      expect(next.snapshotSequence).toBe(4);
      expect(next.projects[0]?.title).toBe("Test Project");
    }
  });

  describe("project-upserted", () => {
    it("adds a new project", () => {
      const event: OrchestrationShellStreamEvent = {
        kind: "project-upserted",
        sequence: 1,
        project: stubProject,
      };

      const next = applyShellStreamEvent(baseSnapshot, event);

      expect(next.projects).toHaveLength(1);
      expect(next.projects[0]?.id).toBe("project-1");
      expect(next.snapshotSequence).toBe(1);
    });

    it("updates an existing project", () => {
      const snapshotWithProject: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        projects: [stubProject],
      };

      const updatedProject = { ...stubProject, title: "Updated Title" };
      const event: OrchestrationShellStreamEvent = {
        kind: "project-upserted",
        sequence: 2,
        project: updatedProject,
      };

      const next = applyShellStreamEvent(snapshotWithProject, event);

      expect(next.projects).toHaveLength(1);
      expect(next.projects[0]?.title).toBe("Updated Title");
      expect(next.snapshotSequence).toBe(2);
    });
  });

  describe("project-removed", () => {
    it("removes a project by id", () => {
      const snapshotWithProject: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        projects: [stubProject],
      };

      const event: OrchestrationShellStreamEvent = {
        kind: "project-removed",
        sequence: 3,
        projectId: ProjectId.make("project-1"),
      };

      const next = applyShellStreamEvent(snapshotWithProject, event);

      expect(next.projects).toHaveLength(0);
      expect(next.snapshotSequence).toBe(3);
    });
  });

  describe("thread-upserted", () => {
    it("adds a new thread", () => {
      const event: OrchestrationShellStreamEvent = {
        kind: "thread-upserted",
        sequence: 4,
        thread: stubThread,
      };

      const next = applyShellStreamEvent(baseSnapshot, event);

      expect(next.threads).toHaveLength(1);
      expect(next.threads[0]?.id).toBe("thread-1");
      expect(next.snapshotSequence).toBe(4);
    });

    it("updates an existing thread", () => {
      const snapshotWithThread: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        threads: [stubThread],
      };

      const updatedThread = { ...stubThread, title: "Updated Thread" };
      const event: OrchestrationShellStreamEvent = {
        kind: "thread-upserted",
        sequence: 5,
        thread: updatedThread,
      };

      const next = applyShellStreamEvent(snapshotWithThread, event);

      expect(next.threads).toHaveLength(1);
      expect(next.threads[0]?.title).toBe("Updated Thread");
    });
  });

  describe("thread-removed", () => {
    it("removes a thread by id", () => {
      const snapshotWithThread: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        threads: [stubThread],
      };

      const event: OrchestrationShellStreamEvent = {
        kind: "thread-removed",
        sequence: 6,
        threadId: ThreadId.make("thread-1"),
      };

      const next = applyShellStreamEvent(snapshotWithThread, event);

      expect(next.threads).toHaveLength(0);
      expect(next.snapshotSequence).toBe(6);
    });
  });

  describe("task-upserted", () => {
    it("adds and updates a Task even when the cached snapshot predates Tasks", () => {
      const created = applyShellStreamEvent(baseSnapshot, {
        kind: "task-upserted",
        sequence: 7,
        task: stubTask,
      });
      expect(created.tasks).toEqual([stubTask]);

      const activated = applyShellStreamEvent(created, {
        kind: "task-upserted",
        sequence: 8,
        task: { ...stubTask, status: "active", threadId: ThreadId.make("thread-1") },
      });
      expect(activated.tasks).toHaveLength(1);
      expect(activated.tasks?.[0]).toMatchObject({ status: "active", threadId: "thread-1" });
    });
  });

  describe("mission-upserted", () => {
    it("adds and updates a Mission even when the cached snapshot predates Missions", () => {
      const created = applyShellStreamEvent(baseSnapshot, {
        kind: "mission-upserted",
        sequence: 9,
        mission: stubMission,
      });
      expect(created.missions).toEqual([stubMission]);

      const completed = applyShellStreamEvent(created, {
        kind: "mission-upserted",
        sequence: 10,
        mission: { ...stubMission, status: "completed", completedAt: stubMission.updatedAt },
      });
      expect(completed.missions).toHaveLength(1);
      expect(completed.missions?.[0]?.status).toBe("completed");
    });

    it("links a Mission when its Integration Batch arrives in a project upsert", () => {
      const snapshot: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        projects: [stubProject],
        missions: [stubMission],
      };
      const batchId = IntegrationBatchId.make("batch-1");
      const next = applyShellStreamEvent(snapshot, {
        kind: "project-upserted",
        sequence: 11,
        project: {
          ...stubProject,
          integrationBatches: [
            {
              id: batchId,
              projectId: stubProject.id,
              title: "Mission integration",
              baseCommit: "base-commit",
              sourceRepository: stubProject.workspaceRoot,
              branch: "nebula/integrate/mission",
              workspacePath: null,
              status: "preparing",
              tasks: [],
              overlapPaths: [],
              overlapsAcknowledged: true,
              conflict: null,
              validationSnapshot: null,
              qualityGateRuns: [],
              humanChanges: [],
              failureCode: null,
              failureReason: null,
              createdAt: stubMission.createdAt,
              updatedAt: stubMission.updatedAt,
              readyAt: null,
              removedAt: null,
              missionId: stubMission.id,
            },
          ],
        },
      });

      expect(next.missions?.[0]?.integrationBatchId).toBe(batchId);
    });
  });

  it("returns original snapshot for unrecognized event kinds", () => {
    const unknownEvent = { kind: "unknown-future-event", sequence: 99 } as any;
    const next = applyShellStreamEvent(baseSnapshot, unknownEvent);
    expect(next).toBe(baseSnapshot);
  });
});
