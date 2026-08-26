import {
  ArchitectPlanProposalId,
  MissionId,
  ProjectId,
  ProviderInstanceId,
  type ArchitectMissionDraft,
  type ArchitectPlanProposal,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  architectProposalWaves,
  deterministicArchitectMissionId,
  deterministicArchitectTaskId,
  isPlanningActive,
  PLANNER_PENDING_TASK_LABEL,
  planningStepIndex,
  SWARM_PLANNING_STEPS,
  SWARM_STAGE_AFTER_RUN,
} from "./swarmViewModel";

const now = "2026-08-25T12:00:00.000Z";
const proposal: ArchitectMissionDraft = {
  title: "Telemetry fixture",
  objective: "Build independent telemetry modules",
  tasks: ["core", "logger", "reporter", "test"].map((key) => ({
    key,
    title: key,
    objective: `Deliver ${key}`,
    acceptanceCriteria: [`${key} is verified`],
    ownership: { write: [`src/${key}.ts`], read: [], deny: [] },
    requiredResourceIds: [],
    assignedModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "test",
    },
  })),
  dependencies: [
    { prerequisiteKey: "core", dependentKey: "logger" },
    { prerequisiteKey: "core", dependentKey: "reporter" },
    { prerequisiteKey: "logger", dependentKey: "test" },
    { prerequisiteKey: "reporter", dependentKey: "test" },
  ],
  assumptions: [],
  risks: [],
  unresolvedQuestions: [],
};

const plan: ArchitectPlanProposal = {
  id: ArchitectPlanProposalId.make("proposal"),
  projectId: ProjectId.make("project"),
  status: "generating",
  objective: proposal.objective,
  constraints: null,
  planningBaseCommit: "pending",
  architectProviderInstanceId: ProviderInstanceId.make("codex"),
  architectModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
  contextFingerprint: "pending",
  contextPaths: [],
  resourcePolicyFingerprint: "pending",
  proposal: null,
  validation: null,
  revisions: [],
  materializedMissionId: null,
  failureReason: null,
  createdAt: now,
  updatedAt: now,
  resolvedAt: null,
};

describe("Swarm view model", () => {
  it("uses a pending label instead of a misleading zero-Task count while planning", () => {
    expect(isPlanningActive(plan)).toBe(true);
    expect(PLANNER_PENDING_TASK_LABEL).toBe("Tasks pending");
    expect(PLANNER_PENDING_TASK_LABEL).not.toContain("0");
  });

  it("maps real lifecycle phases monotonically onto the progress rail", () => {
    expect(SWARM_PLANNING_STEPS.map((step) => planningStepIndex(step.phase))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(planningStepIndex("ready")).toBe(SWARM_PLANNING_STEPS.length);
  });

  it("builds canonical DAG waves for the visual Team Plan", () => {
    expect(architectProposalWaves(proposal).map((wave) => wave.map((task) => task.key))).toEqual([
      ["core"],
      ["logger", "reporter"],
      ["test"],
    ]);
  });

  it("keeps approval IDs deterministic and routes Run Swarm to War Room", () => {
    expect(deterministicArchitectMissionId(plan)).toBe(MissionId.make("architect:proposal"));
    expect(deterministicArchitectTaskId(plan, "core")).toBe("architect:proposal:core");
    expect(SWARM_STAGE_AFTER_RUN).toBe("war-room");
  });
});
