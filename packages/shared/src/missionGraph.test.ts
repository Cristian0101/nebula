import {
  MissionId,
  IntegrationBatchId,
  ProjectId,
  ProviderInstanceId,
  ResourceLeaseId,
  SharedResourceId,
  TaskId,
  type Mission,
  type MissionTaskDependency,
  type OrchestrationTask,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { computeExecutionWaves, computeMissionPlan, validateMissionGraph } from "./missionGraph.js";

const projectId = ProjectId.make("project");
const missionId = MissionId.make("mission");
const now = "2026-08-22T12:00:00.000Z";
const id = (value: string) => TaskId.make(value);
const edge = (from: string, to: string): MissionTaskDependency => ({
  missionId,
  prerequisiteTaskId: id(from),
  dependentTaskId: id(to),
  createdAt: now,
});
function task(taskId: string, status: OrchestrationTask["status"] = "draft"): OrchestrationTask {
  return {
    id: id(taskId),
    projectId,
    title: taskId,
    objective: `Build ${taskId}`,
    role: "builder",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "auto" },
    status,
    threadId: null,
    createdAt: now,
    updatedAt: now,
    activatedAt: null,
    completedAt: status === "completed" ? now : null,
    cancelledAt: status === "cancelled" ? now : null,
    workspace: null,
    ownership: {
      required: true,
      rules: [{ id: `rule-${taskId}`, pattern: `${taskId}/**`, access: "write", createdAt: now }],
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
function mission(taskIds: string[], dependencies: MissionTaskDependency[] = []): Mission {
  return {
    id: missionId,
    projectId,
    title: "Ship auth",
    objective: "Deliver the redesign",
    description: null,
    status: "active",
    taskIds: taskIds.map(id),
    dependencies,
    activities: [],
    integrationBatchId: null,
    createdAt: now,
    updatedAt: now,
    activatedAt: now,
    completedAt: null,
    cancelledAt: null,
  };
}

describe("Mission graph", () => {
  it.each([
    [["A"], [], [["A"]]],
    [
      ["A", "B", "C"],
      [edge("A", "B"), edge("B", "C")],
      [["A"], ["B"], ["C"]],
    ],
    [
      ["A", "B", "C"],
      [edge("A", "B"), edge("A", "C")],
      [["A"], ["B", "C"]],
    ],
    [
      ["A", "B", "C", "D"],
      [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")],
      [["A"], ["B", "C"], ["D"]],
    ],
    [["A", "B", "C"], [edge("A", "B")], [["A", "C"], ["B"]]],
  ] as const)("computes deterministic waves", (taskIds, dependencies, expected) => {
    expect(
      computeExecutionWaves(taskIds.map(id), [...dependencies]).map((wave) => wave.taskIds),
    ).toEqual(expected);
  });

  it("rejects self, duplicate, simple, and deep cycles with evidence", () => {
    expect(validateMissionGraph([id("A")], [edge("A", "A")]).valid).toBe(false);
    expect(
      validateMissionGraph([id("A"), id("B")], [edge("A", "B"), edge("A", "B")]).error,
    ).toContain("already exists");
    expect(
      validateMissionGraph([id("A"), id("B")], [edge("A", "B"), edge("B", "A")]).error,
    ).toContain("A → B → A");
    expect(
      validateMissionGraph(
        [id("A"), id("B"), id("C")],
        [edge("A", "B"), edge("B", "C"), edge("C", "A")],
      ).cycleTaskIds,
    ).toEqual(["A", "B", "C", "A"]);
  });

  it("derives blockers, cancelled evidence, readiness, and legacy completion compatibility", () => {
    const auth = mission(["A", "B", "C"], [edge("A", "C"), edge("B", "C")]);
    let plan = computeMissionPlan({
      mission: auth,
      tasks: [task("A", "active"), task("B", "completed"), task("C")],
    });
    expect(plan.tasks.find((item) => item.task.id === "C")).toMatchObject({
      status: "blocked",
      blockerTaskIds: ["A"],
    });
    plan = computeMissionPlan({
      mission: auth,
      tasks: [task("A", "completed"), task("B", "completed"), task("C")],
    });
    expect(plan.tasks.find((item) => item.task.id === "C")?.status).toBe("ready");
    expect(plan.tasks.find((item) => item.task.id === "A")?.legacyCompletion).toBe(true);
    plan = computeMissionPlan({
      mission: auth,
      tasks: [task("A", "cancelled"), task("B", "completed"), task("C")],
    });
    expect(plan.tasks.find((item) => item.task.id === "C")?.blockerReasons).toContain(
      "Prerequisite cancelled: A",
    );
  });

  it("requires every prerequisite and separates configuration attention from dependency blocking", () => {
    const unassigned = { ...task("B"), modelSelection: null };
    const plan = computeMissionPlan({
      mission: mission(["A", "B"], [edge("A", "B")]),
      tasks: [task("A", "completed"), unassigned],
    });
    expect(plan.tasks.find((item) => item.task.id === "B")).toMatchObject({
      status: "needs-attention",
      attention: ["Provider not assigned."],
    });
  });

  it("keeps DAG readiness separate from durable resource blockers", () => {
    const resourceId = SharedResourceId.make("manifest");
    const frontend = {
      ...task("A", "active"),
      requiredResourceIds: [resourceId],
    };
    const backend = { ...task("B"), requiredResourceIds: [resourceId] };
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
      resourceLeases: [
        {
          id: ResourceLeaseId.make("manifest-a"),
          projectId,
          resourceId,
          taskId: frontend.id,
          status: "held" as const,
          acquiredAt: now,
          releasedAt: null,
        },
      ],
    };
    const plan = computeMissionPlan({
      mission: mission(["A", "B"]),
      tasks: [frontend, backend],
      project,
    });
    expect(plan.tasks.find((item) => item.task.id === "B")).toMatchObject({
      status: "resource-blocked",
      blockerTaskIds: [],
      resourceBlockers: [
        { resource: { name: "Dependency manifest" }, lease: { taskId: frontend.id } },
      ],
    });
    expect(plan.readyTaskIds).not.toContain(backend.id);

    const hydratedPlan = computeMissionPlan({
      mission: mission(["A", "B"]),
      tasks: [frontend, backend],
      project,
    });
    expect(hydratedPlan.tasks.find((item) => item.task.id === "B")?.status).toBe(
      "resource-blocked",
    );
  });

  it("fails Mission completion closed when a linked Integration Batch is missing", () => {
    const plan = computeMissionPlan({
      mission: {
        ...mission(["A"], []),
        integrationBatchId: IntegrationBatchId.make("missing-batch"),
      },
      tasks: [task("A", "completed")],
      integrationBatches: [],
    });
    expect(plan.completionEligible).toBe(false);
    expect(plan.attention).toContain("Linked Integration Batch is missing.");
  });

  it("handles 20 Tasks and 30 dependency edges deterministically", () => {
    const taskIds = Array.from({ length: 20 }, (_, index) => `T${index}`);
    const dependencies = [
      ...Array.from({ length: 19 }, (_, index) => edge(`T${index}`, `T${index + 1}`)),
      ...Array.from({ length: 11 }, (_, index) => edge(`T${index}`, `T${index + 2}`)),
    ];
    const graph = validateMissionGraph(taskIds.map(id), dependencies);
    const waves = computeExecutionWaves(taskIds.map(id), dependencies);
    expect(graph.valid).toBe(true);
    expect(dependencies).toHaveLength(30);
    expect(waves.flatMap((wave) => wave.taskIds)).toHaveLength(20);
  });
});
