import {
  MissionId,
  MissionRunId,
  ProjectId,
  ProviderInstanceId,
  ResourceLeaseId,
  SharedResourceId,
  TaskId,
  TaskReviewSnapshotId,
  ThreadId,
  type Mission,
  type MissionRun,
  type OrchestrationTask,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildMissionFinalReport,
  buildTaskContextPackage,
  deterministicMissionTaskIds,
  missionIntegrationOverlapPaths,
  missionRunCompletionBlockers,
  planMissionRunScheduling,
  resolveMissionCheckpointState,
  summarizeMissionReviewCoverage,
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
  it("holds an unlocked wave at a named human checkpoint and releases it after approval", () => {
    const tasks = [task("A", "completed"), task("B"), task("C"), task("D")];
    const checkpoint = {
      key: "foundation",
      name: "Foundation review",
      requiredTaskIds: [taskId("A")],
      unlockTaskIds: [taskId("B"), taskId("C")],
      requiredGateIds: [],
      reviewsRequired: false,
      humanApprovalRequired: true,
      humanApprovedAt: null,
      createdAt: now,
      updatedAt: now,
    } as const;
    const gatedMission = { ...mission, checkpoints: [checkpoint] };
    const blocked = planMissionRunScheduling({
      mission: gatedMission,
      run,
      tasks,
      project,
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(resolveMissionCheckpointState(checkpoint, tasks).state).toBe("awaiting_human");
    expect(blocked.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: taskId("B"), kind: "waiting_checkpoint" }),
        expect.objectContaining({ taskId: taskId("C"), kind: "waiting_checkpoint" }),
      ]),
    );

    const approvedCheckpoint = { ...checkpoint, humanApprovedAt: now };
    const released = planMissionRunScheduling({
      mission: { ...gatedMission, checkpoints: [approvedCheckpoint] },
      run,
      tasks,
      project,
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(resolveMissionCheckpointState(approvedCheckpoint, tasks).state).toBe("passed");
    expect(released.scheduledTaskIds).toEqual([taskId("B"), taskId("C")]);
  });

  it("requires every checkpoint that unlocks the same Task to pass", () => {
    const tasks = [task("A", "completed"), task("B", "completed"), task("C"), task("D")];
    const approved = {
      key: "contract",
      name: "Contract freeze",
      requiredTaskIds: [taskId("A")],
      unlockTaskIds: [taskId("C")],
      requiredGateIds: [],
      reviewsRequired: false,
      humanApprovalRequired: false,
      humanApprovedAt: null,
      createdAt: now,
      updatedAt: now,
    } as const;
    const waiting = {
      ...approved,
      key: "feature-review",
      name: "Feature review",
      requiredTaskIds: [taskId("B")],
      humanApprovalRequired: true,
    } as const;
    const blocked = planMissionRunScheduling({
      mission: { ...mission, checkpoints: [approved, waiting] },
      run,
      tasks,
      project,
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });

    expect(blocked.scheduledTaskIds).not.toContain(taskId("C"));
    expect(blocked.decisions).toContainEqual(
      expect.objectContaining({
        taskId: taskId("C"),
        kind: "waiting_checkpoint",
        reason: "Waiting for human approval at checkpoint 'Feature review'.",
      }),
    );
  });

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

  it("admits the deterministic waiter after release without double-reserving during reconciliation", () => {
    const tasks = [
      task("A", "completed"),
      { ...task("B", "completed"), requiredResourceIds: [resourceId] },
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
            id: ResourceLeaseId.make("released-lease"),
            projectId,
            resourceId,
            taskId: taskId("B"),
            status: "released",
            acquiredAt: now,
            releasedAt: now,
          },
        ],
      },
      providerReadyTaskIds: new Set(tasks.map((candidate) => candidate.id)),
    });
    expect(plan.scheduledTaskIds).toEqual([taskId("C")]);
    expect(plan.decisions).toContainEqual(
      expect.objectContaining({ taskId: taskId("C"), kind: "scheduled" }),
    );
    expect(plan.decisions.filter((decision) => decision.kind === "scheduled")).toHaveLength(1);
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

describe("Swarm Alpha evidence", () => {
  const completed = (id: string, path: string, provider = "codex") => ({
    ...task(id, "completed"),
    result: {
      taskId: taskId(id),
      status: "completed" as const,
      summary: `${id} completed`,
      files: [
        {
          path,
          previousPath: null,
          changeType: "modified" as const,
          additions: 4,
          deletions: 1,
          binary: false,
          untracked: false,
        },
      ],
      baseCommit: "abc123",
      snapshotId: TaskReviewSnapshotId.make(`snapshot-${id}`),
      testsRun: [],
      assumptions: [],
      interfaceChanges: [],
      migrations: [],
      knownRisks: id === "D" ? ["Final follow-up risk"] : [],
      followUps: id === "D" ? ["Watch Alpha benchmark"] : [],
      providerInstanceId: ProviderInstanceId.make(provider),
      threadId: null,
      branch: `nebula/${id}`,
      completedAt: now,
    },
  });

  it("detects shared changed paths before automatic Integration", () => {
    expect(
      missionIntegrationOverlapPaths([
        completed("A", "packages/contracts/src/swarm.ts"),
        completed("B", "packages/contracts/src/swarm.ts", "antigravity"),
        completed("C", "apps/server/src/swarm.ts"),
        completed("D", "apps/web/src/swarm.ts"),
      ]),
    ).toEqual(["packages/contracts/src/swarm.ts"]);
  });

  it("builds a durable evidence-only final report for the four-Task benchmark", () => {
    const tasks = [
      completed("A", "packages/contracts/src/swarm.ts"),
      completed("B", "apps/server/src/swarm.ts", "antigravity"),
      completed("C", "apps/web/src/swarm.ts"),
      completed("D", "packages/shared/src/swarm.test.ts"),
    ];
    const report = buildMissionFinalReport({
      mission,
      run: {
        ...run,
        taskRecovery: [
          {
            taskId: taskId("B"),
            transientRetries: 1,
            remediationRounds: 1,
            latestFailureClass: null,
            latestFailureSignature: null,
            attentionRequired: false,
            updatedAt: now,
            attempts: [
              {
                number: 1,
                kind: "initial",
                providerInstanceId: ProviderInstanceId.make("antigravity"),
                threadId: ThreadId.make("thread-b-1"),
                status: "replaced",
                failureClass: "transport_transient",
                summary: "Provider transport failed.",
                startedAt: now,
                completedAt: now,
              },
              {
                number: 2,
                kind: "replacement",
                providerInstanceId: ProviderInstanceId.make("codex"),
                threadId: ThreadId.make("thread-b-2"),
                status: "completed",
                failureClass: null,
                summary: "Replacement completed.",
                startedAt: now,
                completedAt: now,
              },
            ],
          },
        ],
      },
      tasks,
      integrationBranch: "nebula/integration/swarm-alpha",
      finalValidation: "ready",
      integrationHumanChangeCount: 1,
      planHumanEditCount: 2,
      generatedAt: "2026-08-23T12:10:00.000Z",
    });
    expect(report).toMatchObject({
      completedTaskIds: ["A", "B", "C", "D"],
      providersUsed: ["antigravity", "codex"],
      providerReplacementCount: 1,
      retryCount: 1,
      remediationRoundCount: 1,
      humanInterventionCount: 5,
      finalValidation: "ready",
      elapsedMilliseconds: 600_000,
    });
    expect(report.filesChanged).toHaveLength(4);
    expect(report.knownRisks).toEqual(["Final follow-up risk"]);
  });

  it("separates required current review coverage from immutable historical attempts", () => {
    const snapshotId = TaskReviewSnapshotId.make("current-review");
    const reviewed = {
      ...task("A", "completed"),
      reviewRequired: true,
      reviewSnapshot: {
        id: snapshotId,
        taskId: taskId("A"),
        baseCommit: "base",
        checkpointRef: "refs/t3/checkpoints/review" as never,
        fingerprint: "tree",
        branchHead: "head",
        changedFiles: 1,
        additions: 1,
        deletions: 0,
        ownershipStatus: "valid" as const,
        status: "current" as const,
        capturedAt: now,
      },
      reviews: [
        {
          id: "review-stale" as never,
          taskId: taskId("A"),
          snapshotId: TaskReviewSnapshotId.make("old-review"),
          reviewerModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          diversity: "cross-provider" as const,
          status: "stale" as const,
          verdict: "request_changes" as const,
          findings: [],
          criteria: [],
          securityConcerns: [],
          requiredChanges: ["Fix it"],
          summary: "Changes requested",
          coverage: "complete" as const,
          failureReason: null,
          findingsSentAt: null,
          createdAt: now,
          completedAt: now,
        },
        {
          id: "review-approved" as never,
          taskId: taskId("A"),
          snapshotId,
          reviewerModelSelection: {
            instanceId: ProviderInstanceId.make("antigravity"),
            model: "test",
          },
          diversity: "cross-provider" as const,
          status: "completed" as const,
          verdict: "approve" as const,
          findings: [],
          criteria: [],
          securityConcerns: [],
          requiredChanges: [],
          summary: "Approved",
          coverage: "complete" as const,
          failureReason: null,
          findingsSentAt: null,
          createdAt: now,
          completedAt: now,
        },
      ],
    } satisfies OrchestrationTask;
    expect(summarizeMissionReviewCoverage([reviewed])).toEqual({
      required: 1,
      approved: 1,
      historicalAttempts: 2,
      changesRequested: 1,
      stale: 1,
    });
  });

  it("blocks canonical Mission completion until reviews, Integration, and final gates are current", () => {
    const snapshotId = TaskReviewSnapshotId.make("completion-review");
    const completedTask = {
      ...task("A", "completed"),
      reviewRequired: true,
      reviewSnapshot: {
        id: snapshotId,
        taskId: taskId("A"),
        baseCommit: "base",
        checkpointRef: "refs/t3/checkpoints/completion" as never,
        fingerprint: "tree",
        branchHead: "head",
        changedFiles: 1,
        additions: 1,
        deletions: 0,
        ownershipStatus: "valid" as const,
        status: "current" as const,
        capturedAt: now,
      },
      qualityGateRuns: [
        {
          id: "task-gate" as never,
          taskId: taskId("A"),
          snapshotId,
          gateId: "test",
          label: "Test",
          command: "npm test",
          required: true,
          timeoutSeconds: 60,
          status: "passed" as const,
          cwd: "/tmp/task",
          exitCode: 0,
          startedAt: now,
          completedAt: now,
          outputSummary: "passed",
          outputTruncated: false,
        },
      ],
      reviews: [
        {
          id: "completion-approval" as never,
          taskId: taskId("A"),
          snapshotId,
          reviewerModelSelection: {
            instanceId: ProviderInstanceId.make("antigravity"),
            model: "test",
          },
          diversity: "cross-provider" as const,
          status: "completed" as const,
          verdict: "approve" as const,
          findings: [],
          criteria: [],
          securityConcerns: [],
          requiredChanges: [],
          summary: "Approved",
          coverage: "complete" as const,
          failureReason: null,
          findingsSentAt: null,
          createdAt: now,
          completedAt: now,
        },
      ],
    } satisfies OrchestrationTask;
    const completionMission = { ...mission, taskIds: [completedTask.id] };
    const completionRun = {
      ...run,
      swarmPolicy: {
        revision: 1,
        maxConcurrentTasks: 1,
        routingProfile: "manual_only",
        transportRetryLimit: 0,
        remediationLimit: 0,
        autoIntegration: true,
        stopOnConflict: true,
        independentReviewRequired: true,
        preapprovedOverlapPaths: [],
        autoCompleteMission: true,
        qualityPolicy: null,
        reviewPolicy: null,
        frozenAt: now,
      },
    } satisfies MissionRun;
    const finalGate = {
      id: "final-gate" as never,
      batchId: "integration" as never,
      snapshotTreeId: "tree",
      gateId: "integration-test",
      label: "Integration test",
      command: "npm run test:integration",
      required: true,
      timeoutSeconds: 60,
      status: "passed" as const,
      cwd: "/tmp/integration",
      exitCode: 0,
      startedAt: now,
      completedAt: now,
      outputSummary: "passed",
      outputTruncated: false,
    };
    const batch = {
      status: "ready" as const,
      validationSnapshot: { status: "current" as const },
      qualityGateRuns: [finalGate],
    };
    expect(
      missionRunCompletionBlockers({
        mission: completionMission,
        run: completionRun,
        tasks: [completedTask],
        integrationBatch: batch as never,
      }),
    ).toEqual([]);
    expect(
      missionRunCompletionBlockers({
        mission: completionMission,
        run: completionRun,
        tasks: [completedTask],
        integrationBatch: null,
      }),
    ).toContain("Integration and final validation must be ready on the current snapshot.");
    expect(
      missionRunCompletionBlockers({
        mission: completionMission,
        run: completionRun,
        tasks: [completedTask],
        integrationBatch: {
          ...batch,
          qualityGateRuns: [{ ...finalGate, status: "failed" as const }],
        } as never,
      }),
    ).toContain("A required final validation gate is not passed.");
    expect(
      missionRunCompletionBlockers({
        mission: completionMission,
        run: completionRun,
        tasks: [
          {
            ...completedTask,
            reviewSnapshot: { ...completedTask.reviewSnapshot!, status: "stale" as const },
          },
        ],
        integrationBatch: batch as never,
      }),
    ).toContain(`Task '${completedTask.id}' requires a current approving review.`);
  });
});
