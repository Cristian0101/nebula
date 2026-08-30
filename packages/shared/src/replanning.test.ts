import {
  IntegrationBatchId,
  MissionId,
  MissionRunId,
  ProjectId,
  ProviderInstanceId,
  ReplanProposalId,
  TaskId,
  ThreadId,
  type IntegrationBatch,
  type Mission,
  type MissionRun,
  type OrchestrationTask,
  type ReplanChangeSet,
  type ReplanProposal,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  analyzeReplanImpact,
  applyReplanChangeSet,
  missionDescendantTaskIds,
  replanTriggerForFailure,
  validateReplanChangeSet,
} from "./replanning.js";

const now = "2026-08-30T12:00:00.000Z";
const later = "2026-08-30T12:05:00.000Z";
const projectId = ProjectId.make("project");
const missionId = MissionId.make("mission");
const runId = MissionRunId.make("run");
const id = (value: string) => TaskId.make(value);
const edge = (from: string, to: string) => ({
  missionId,
  prerequisiteTaskId: id(from),
  dependentTaskId: id(to),
  createdAt: now,
});

function task(value: string, status: OrchestrationTask["status"] = "draft"): OrchestrationTask {
  return {
    id: id(value),
    projectId,
    title: value,
    objective: `Deliver ${value}`,
    role: "builder",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "auto" },
    acceptanceCriteria: [`${value} works`],
    reviewRequired: true,
    preferDifferentReviewerProvider: true,
    status,
    threadId: null,
    createdAt: now,
    updatedAt: now,
    activatedAt: status === "active" ? now : null,
    completedAt: status === "completed" ? now : null,
    cancelledAt: null,
    workspace:
      status === "draft"
        ? null
        : {
            status: "ready",
            sourceRepository: "/repo",
            baseCommit: "abc123",
            branch: `task/${value}`,
            path: `/repo/.worktrees/${value}`,
            createdAt: now,
            removedAt: null,
            failureCode: null,
            failureReason: null,
            updatedAt: now,
          },
    ownership: {
      required: true,
      rules: [{ id: `write-${value}`, pattern: `${value}/**`, access: "write", createdAt: now }],
      status: "valid",
      validatedAt: now,
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
    requiredResourceIds: [],
    resourceCompliance: null,
    ownershipRequests: [],
  };
}

const mission: Mission = {
  id: missionId,
  projectId,
  title: "Notification preferences",
  objective: "Implement preferences using the approved registry assumption.",
  description: null,
  status: "active",
  taskIds: ["A", "B", "C", "D"].map(id),
  dependencies: [edge("A", "B"), edge("A", "C"), edge("B", "D")],
  activities: [],
  integrationBatchId: null,
  createdAt: now,
  updatedAt: now,
  activatedAt: now,
  completedAt: null,
  cancelledAt: null,
  currentPlanVersion: 1,
};

const run: MissionRun = {
  id: runId,
  missionId,
  projectId,
  mode: "supervised_swarm",
  status: "attention",
  maxConcurrentTasks: 2,
  currentReadyTaskIds: [],
  scheduledTaskIds: [],
  attention: [
    {
      taskId: id("B"),
      code: "replan_approval_required",
      detail: "Plan v2 needs approval.",
      blocksMission: false,
    },
  ],
  attentionReason: "Plan v2 needs approval.",
  decisions: [],
  startedAt: now,
  pausedAt: null,
  completedAt: null,
  stoppedAt: null,
  failedAt: null,
  failureReason: null,
  coordinationRequests: [],
  replanProposals: [],
  updatedAt: now,
};

const evidence = [
  {
    kind: "repository_fact" as const,
    summary: "The expected registry is missing.",
    expected: "src/preferences/registry.ts",
    observed: "No registry implementation exists in the repository tree.",
    source: "repository search at abc123",
  },
];

function requestedProposal(): ReplanProposal {
  const impact = analyzeReplanImpact({
    mission,
    tasks: [task("A", "completed"), task("B", "active"), task("C", "completed"), task("D")],
    sourceTaskId: id("B"),
    scope: "mission_subgraph",
    trigger: "assumption_invalidated",
  });
  return {
    id: ReplanProposalId.make("replan-1"),
    missionId,
    sourceTaskId: id("B"),
    scope: "mission_subgraph",
    trigger: "assumption_invalidated",
    evidence,
    affectedTaskIds: impact.affectedTaskIds,
    summary: "Add the missing Registry foundation before Backend.",
    rationale: "Repository evidence invalidated the approved assumption.",
    preservedCompletedTaskIds: impact.completedSafeTaskIds,
    architectPlanProposalId: null,
    impact,
    changeSet: null,
    validation: null,
    currentPlanVersion: 1,
    proposedPlanVersion: 2,
    status: "requested",
    createdAt: now,
    resolvedAt: null,
    appliedAt: null,
  };
}

const splitChangeSet: ReplanChangeSet = {
  newTasks: [
    {
      taskId: id("REGISTRY"),
      title: "Registry foundation",
      objective: "Create the notification preference registry required by Backend.",
      modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "auto" },
      acceptanceCriteria: ["Registry API exists"],
      ownership: [
        { pattern: "src/preferences/registry/**", access: "write", reason: "New foundation" },
      ],
      requiredResourceIds: [],
      supersedesTaskId: null,
    },
  ],
  modifiedTasks: [],
  supersededTaskIds: [],
  dependencyChanges: [
    { operation: "add", prerequisiteTaskId: id("REGISTRY"), dependentTaskId: id("B") },
  ],
  contractChanges: [],
};

describe("bounded Mission replanning", () => {
  it("selects only the invalidated Task and its descendants for a subgraph replan", () => {
    expect(missionDescendantTaskIds(mission, [id("B")])).toEqual([id("D")]);
    const impact = analyzeReplanImpact({
      mission,
      tasks: [task("A", "completed"), task("B", "active"), task("C", "completed"), task("D")],
      sourceTaskId: id("B"),
      scope: "mission_subgraph",
      trigger: "assumption_invalidated",
    });
    expect(impact.affectedTaskIds).toEqual([id("B"), id("D")]);
    expect(impact.unaffectedTaskIds).toEqual([id("A"), id("C")]);
    expect(impact.completedSafeTaskIds).toEqual([id("A"), id("C")]);
  });

  it("does not classify ordinary execution friction as replanning", () => {
    expect(replanTriggerForFailure("transport_transient")).toBeNull();
    expect(replanTriggerForFailure("review_request_changes")).toBeNull();
    expect(replanTriggerForFailure("quality_failure")).toBeNull();
    expect(replanTriggerForFailure("planning_architecture_blocker")).toBe(
      "task_blocked_architecturally",
    );
    expect(replanTriggerForFailure("provider_capability_mismatch")).toBe(
      "provider_repeated_failure",
    );
  });

  it("validates a necessary new canonical Task and rejects unsafe graphs and ownership", () => {
    const proposal = requestedProposal();
    const valid = validateReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), task("B"), task("C", "completed"), task("D")],
      project: { sharedResources: [] },
      proposal,
      changeSet: splitChangeSet,
      validatedAt: later,
    });
    expect(valid).toMatchObject({ status: "valid", blockers: [] });
    const invalid = validateReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), task("B"), task("C", "completed"), task("D")],
      project: { sharedResources: [] },
      proposal,
      changeSet: {
        ...splitChangeSet,
        newTasks: splitChangeSet.newTasks.map((item) => ({ ...item, ownership: [] })),
        dependencyChanges: [
          { operation: "add", prerequisiteTaskId: id("D"), dependentTaskId: id("A") },
        ],
      },
      validatedAt: later,
    });
    expect(invalid.status).toBe("invalid");
    expect(invalid.blockers.join(" ")).toMatch(/write ownership|cycle/i);

    const activeDependent = validateReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), task("B", "active"), task("C"), task("D")],
      project: { sharedResources: [] },
      proposal,
      changeSet: splitChangeSet,
      validatedAt: later,
    });
    expect(activeDependent).toMatchObject({ status: "valid", blockers: [] });
  });

  it("persists Plan v1 and applies Plan v2 without recreating unaffected work", () => {
    const preserved = task("C", "completed");
    const tasks = [task("A", "completed"), task("B"), preserved, task("D")];
    const requested = requestedProposal();
    const validation = validateReplanChangeSet({
      mission,
      tasks,
      project: { sharedResources: [] },
      proposal: requested,
      changeSet: splitChangeSet,
      validatedAt: later,
    });
    const approved: ReplanProposal = {
      ...requested,
      changeSet: splitChangeSet,
      validation,
      status: "approved",
      resolvedAt: later,
    };
    const applied = applyReplanChangeSet({
      mission,
      tasks,
      run: { ...run, replanProposals: [approved] },
      proposal: approved,
      appliedAt: later,
    });
    expect(applied.mission.currentPlanVersion).toBe(2);
    expect(applied.mission.planVersions?.map((version) => version.version)).toEqual([1, 2]);
    expect(applied.mission.planVersions?.[0]?.taskIds).toEqual(mission.taskIds);
    expect(applied.mission.planVersions?.[1]?.addedTaskIds).toEqual([id("REGISTRY")]);
    expect(applied.tasks.find((candidate) => candidate.id === id("C"))).toBe(preserved);
    expect(applied.tasks.find((candidate) => candidate.id === id("REGISTRY"))).toMatchObject({
      status: "draft",
      role: "builder",
      replan: { planVersion: 2, state: "current" },
    });
    expect(applied.mission.dependencies).toContainEqual(
      expect.objectContaining({
        prerequisiteTaskId: id("REGISTRY"),
        dependentTaskId: id("B"),
      }),
    );
    expect(applied.run.replanProposals?.[0]).toMatchObject({ status: "applied" });
    expect(() =>
      applyReplanChangeSet({
        mission: applied.mission,
        tasks: applied.tasks,
        run: applied.run,
        proposal: applied.run.replanProposals![0]!,
        appliedAt: later,
      }),
    ).toThrow(/approval is required/i);
  });

  it("pauses an affected active Task and records its provider thread for interruption", () => {
    const activeThreadId = ThreadId.make("thread-B-plan-1");
    const activeTask = { ...task("B", "active"), threadId: activeThreadId };
    const requested = requestedProposal();
    const validation = validateReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), activeTask, task("C", "completed"), task("D")],
      project: { sharedResources: [] },
      proposal: requested,
      changeSet: splitChangeSet,
      validatedAt: later,
    });
    const approved: ReplanProposal = {
      ...requested,
      changeSet: splitChangeSet,
      validation,
      status: "approved",
      resolvedAt: later,
    };
    const applied = applyReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), activeTask, task("C", "completed"), task("D")],
      run: { ...run, replanProposals: [approved] },
      proposal: approved,
      appliedAt: later,
    });

    expect(validation.status).toBe("valid");
    expect(applied.interruptedThreadIds).toEqual([activeThreadId]);
    expect(applied.tasks.find((candidate) => candidate.id === id("B"))).toMatchObject({
      status: "draft",
      threadId: null,
      activatedAt: null,
      replan: { planVersion: 2, state: "current" },
    });
  });

  it("keeps applied superseded artifacts visible and requires an explicit corrective path", () => {
    const oldTask = task("B", "completed");
    const requested = requestedProposal();
    const changeSet: ReplanChangeSet = {
      ...splitChangeSet,
      newTasks: splitChangeSet.newTasks.map((item) => ({
        ...item,
        taskId: id("B2"),
        title: "Backend v2",
        supersedesTaskId: id("B"),
      })),
      supersededTaskIds: [id("B")],
      dependencyChanges: [
        { operation: "remove", prerequisiteTaskId: id("A"), dependentTaskId: id("B") },
        { operation: "add", prerequisiteTaskId: id("A"), dependentTaskId: id("B2") },
      ],
    };
    const proposal: ReplanProposal = {
      ...requested,
      changeSet,
      validation: { status: "valid", blockers: [], warnings: [], validatedAt: later },
      status: "approved",
      resolvedAt: later,
    };
    const batch: IntegrationBatch = {
      id: IntegrationBatchId.make("batch"),
      projectId,
      title: "Integration",
      baseCommit: "abc123",
      sourceRepository: "/repo",
      branch: "nebula/integration/batch",
      workspacePath: "/repo/.integration",
      status: "applying",
      tasks: [
        {
          taskId: id("B"),
          taskResultId: "result-B" as never,
          snapshotId: "snapshot-B" as never,
          order: 0,
          status: "applied",
          artifact: null,
          appliedCommit: "deadbeef",
        },
      ],
      overlapPaths: [],
      overlapsAcknowledged: true,
      conflict: null,
      validationSnapshot: null,
      qualityGateRuns: [],
      humanChanges: [],
      failureCode: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      readyAt: null,
      removedAt: null,
      missionId,
    };
    const applied = applyReplanChangeSet({
      mission: { ...mission, integrationBatchId: batch.id },
      tasks: [task("A", "completed"), oldTask, task("C", "completed"), task("D")],
      run: { ...run, replanProposals: [proposal] },
      proposal,
      integrationBatch: batch,
      appliedAt: later,
    });
    expect(applied.tasks.find((candidate) => candidate.id === id("B"))).toMatchObject({
      status: "cancelled",
      replan: { state: "superseded", supersededByTaskId: id("B2") },
    });
    expect(applied.integrationBatch).toMatchObject({
      status: "correction_required",
      failureCode: "replan_superseded_applied_artifact",
      supersededAppliedTaskIds: [id("B")],
      tasks: [{ status: "correction_required" }],
    });
  });

  it("versions changed contracts and makes prior handoff, review, and quality evidence stale", () => {
    const reviewedConsumer = {
      ...task("B", "completed"),
      reviewSnapshot: {
        id: "snapshot-B",
        taskId: id("B"),
        baseCommit: "abc123",
        checkpointRef: "refs/t3/checkpoints/B",
        fingerprint: "fingerprint-B",
        branchHead: "def456",
        changedFiles: 1,
        additions: 1,
        deletions: 0,
        ownershipStatus: "valid",
        status: "current",
        capturedAt: now,
      },
      handoff: { status: "ready", snapshotId: "snapshot-B" },
      qualityGateRuns: [{ status: "passed", snapshotId: "snapshot-B" }],
      reviews: [{ status: "completed", snapshotId: "snapshot-B", verdict: "approve" }],
    } as unknown as OrchestrationTask;
    const requested = requestedProposal();
    const changeSet: ReplanChangeSet = {
      newTasks: [],
      modifiedTasks: [],
      supersededTaskIds: [],
      dependencyChanges: [],
      contractChanges: [
        {
          contractId: "notification-api",
          previousVersion: "v1",
          nextVersion: "v2",
          producerTaskId: id("A"),
          consumerTaskIds: [id("B")],
          summary: "The registry field is now required.",
        },
      ],
    };
    const proposal: ReplanProposal = {
      ...requested,
      changeSet,
      validation: { status: "valid", blockers: [], warnings: [], validatedAt: later },
      status: "approved",
      resolvedAt: later,
    };
    const applied = applyReplanChangeSet({
      mission,
      tasks: [task("A", "completed"), reviewedConsumer, task("C"), task("D")],
      run: { ...run, replanProposals: [proposal] },
      proposal,
      appliedAt: later,
    });
    expect(applied.mission.contractVersions).toMatchObject([
      { contractId: "notification-api", version: "v1", status: "invalidated" },
      { contractId: "notification-api", version: "v2", status: "current" },
    ]);
    expect(applied.tasks.find((candidate) => candidate.id === id("B"))).toMatchObject({
      replan: { state: "requires_review" },
      reviewSnapshot: { status: "stale" },
      handoff: { status: "stale" },
      qualityGateRuns: [{ status: "stale" }],
      reviews: [{ status: "stale" }],
    });
  });
});
