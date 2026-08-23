import {
  MissionId,
  MissionRunId,
  ProjectId,
  ProviderInstanceId,
  ResourceLeaseId,
  SharedResourceId,
  TaskId,
  TaskReviewSnapshotId,
  type Mission,
  type MissionRun,
  type OrchestrationTask,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildTaskContextPackage,
  deterministicMissionTaskIds,
  planMissionRunScheduling,
} from "./missionRunner.js";

const now = "2026-08-23T12:00:00.000Z";
const projectId = ProjectId.make("project");
const missionId = MissionId.make("mission");
const taskId = (value: string) => TaskId.make(value);
const resourceId = SharedResourceId.make("dependency-manifest");

function task(id: string, status: OrchestrationTask["status"] = "draft"): OrchestrationTask {
  return {
    id: taskId(id),
    projectId,
    title: id,
    objective: `Deliver ${id}`,
    role: "builder",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "auto" },
    status,
    threadId: null,
    createdAt: now,
    updatedAt: now,
    activatedAt: status === "active" ? now : null,
    completedAt: status === "completed" ? now : null,
    cancelledAt: null,
    workspace: null,
    ownership: {
      required: true,
      rules: [{ id: `write-${id}`, access: "write", pattern: `${id}/**`, createdAt: now }],
      status: "unconfigured",
      validatedAt: null,
      changedPathCount: 0,
      violations: [],
      errorReason: null,
      updatedAt: now,
    },
    reviewSnapshot: null,
    handoff: null,
    restore: null,
    reviewError: null,
    result: null,
    qualityGateRuns: [],
    reviews: [],
  };
}

const mission: Mission = {
  id: missionId,
  projectId,
  title: "Deterministic fixture",
  objective: "Complete A, then B and C, then D.",
  description: null,
  status: "active",
  taskIds: ["A", "B", "C", "D"].map(taskId),
  dependencies: [
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
  ].map(([from, to]) => ({
    missionId,
    prerequisiteTaskId: taskId(from!),
    dependentTaskId: taskId(to!),
    createdAt: now,
  })),
  activities: [],
  integrationBatchId: null,
  createdAt: now,
  updatedAt: now,
  activatedAt: now,
  completedAt: null,
  cancelledAt: null,
};

const run: MissionRun = {
  id: MissionRunId.make("run"),
  missionId,
  projectId,
  mode: "supervised",
  status: "running",
  maxConcurrentTasks: 2,
  currentReadyTaskIds: [],
  scheduledTaskIds: [],
  attention: [],
  attentionReason: null,
  decisions: [],
  startedAt: now,
  pausedAt: null,
  completedAt: null,
  stoppedAt: null,
  failedAt: null,
  failureReason: null,
  updatedAt: now,
};

const project = {
  sharedResources: [
    {
      id: resourceId,
      projectId,
      name: "Dependency manifest",
      description: null,
      patterns: ["package.json"],
      mode: "exclusive" as const,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
  resourceLeases: [],
};

describe("supervised Mission scheduler", () => {
  it("uses wave, Mission order, and stable ID order", () => {
    expect(deterministicMissionTaskIds(mission)).toEqual(["A", "B", "C", "D"]);
  });

  it("advances a dependency wave and respects the active writable concurrency cap", () => {
    const tasks = [task("A", "completed"), task("B"), task("C"), task("D")];
    const plan = planMissionRunScheduling({
      mission,
      run: { ...run, maxConcurrentTasks: 1 },
      tasks,
      project,
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(plan.scheduledTaskIds).toEqual(["B"]);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: taskId("B"), kind: "scheduled" }),
        expect.objectContaining({ taskId: taskId("C"), kind: "waiting_concurrency" }),
        expect.objectContaining({ taskId: taskId("D"), kind: "waiting_dependency" }),
      ]),
    );
  });

  it("reserves a contested resource for the deterministic winner", () => {
    const tasks = [
      task("A", "completed"),
      { ...task("B"), requiredResourceIds: [resourceId] },
      { ...task("C"), requiredResourceIds: [resourceId] },
      task("D"),
    ];
    const plan = planMissionRunScheduling({
      mission,
      run,
      tasks,
      project,
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(plan.scheduledTaskIds).toEqual(["B"]);
    expect(plan.decisions).toContainEqual(
      expect.objectContaining({
        taskId: taskId("C"),
        kind: "waiting_resource",
        sourceTaskIds: [taskId("B")],
      }),
    );
  });

  it("honors a durable resource lease after restart", () => {
    const tasks = [
      task("A", "completed"),
      { ...task("B", "active"), requiredResourceIds: [resourceId] },
      { ...task("C"), requiredResourceIds: [resourceId] },
      task("D"),
    ];
    const plan = planMissionRunScheduling({
      mission,
      run: { ...run, scheduledTaskIds: [taskId("B")] },
      tasks,
      project: {
        ...project,
        resourceLeases: [
          {
            id: ResourceLeaseId.make("lease"),
            projectId,
            resourceId,
            taskId: taskId("B"),
            status: "held",
            acquiredAt: now,
            releasedAt: null,
          },
        ],
      },
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(plan.scheduledTaskIds).toEqual(["B"]);
    expect(plan.decisions).toContainEqual(
      expect.objectContaining({ taskId: taskId("C"), kind: "waiting_resource" }),
    );
  });

  it("raises attention when a reserved Task loses provider readiness", () => {
    const tasks = [task("A"), task("B"), task("C"), task("D")];
    const plan = planMissionRunScheduling({
      mission,
      run: { ...run, scheduledTaskIds: [taskId("A")] },
      tasks,
      project,
      providerReadyTaskIds: new Set(),
    });
    expect(plan.attention).toContainEqual(
      expect.objectContaining({ taskId: taskId("A"), code: "provider_unavailable" }),
    );
  });

  it("injects a bounded provenance-marked package from completed prerequisites", () => {
    const snapshotId = TaskReviewSnapshotId.make("snapshot-a");
    const prerequisite = {
      ...task("A", "completed"),
      result: {
        taskId: taskId("A"),
        status: "completed" as const,
        summary: "Contract shipped with typed errors.",
        files: [
          {
            path: "packages/contracts/src/api.ts",
            previousPath: null,
            changeType: "modified" as const,
            additions: 12,
            deletions: 2,
            binary: false,
            untracked: false,
          },
        ],
        baseCommit: "abc123",
        snapshotId,
        testsRun: [],
        assumptions: ["Consumers use v2."],
        interfaceChanges: ["POST /v2/tasks returns { data, error }."],
        migrations: [],
        knownRisks: ["Legacy clients still use v1."],
        followUps: [],
        providerInstanceId: ProviderInstanceId.make("codex"),
        threadId: null,
        branch: "nebula/task-a",
        completedAt: now,
      },
    };
    const context = buildTaskContextPackage({
      mission,
      task: task("B"),
      tasks: [prerequisite, task("B")],
      project,
    });
    expect(context.sourceTaskIds).toEqual([taskId("A")]);
    expect(context.text).toContain("Mission context injected by Nebula (not user-authored)");
    expect(context.text).toContain("POST /v2/tasks returns { data, error }");
    expect(context.text).toContain("packages/contracts/src/api.ts");
    expect(context.text.length).toBeLessThanOrEqual(16_000);
    expect(context.text).toContain("excludes provider transcripts, hidden reasoning, credentials");
  });
});
