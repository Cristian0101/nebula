import { describe, expect, it } from "@effect/vitest";
import {
  IntegrationBatchId,
  ProjectId,
  QualityGateRunId,
  TaskHandoffId,
  TaskId,
  TaskReviewId,
  TaskReviewSnapshotId,
  type OrchestrationProject,
  type OrchestrationTask,
} from "@t3tools/contracts";

import {
  buildIntegrationBatch,
  integrationBranchName,
  integrationEligibility,
  integrationOverlapPaths,
  taskResultId,
} from "./integrationPolicy.ts";

const at = "2026-08-22T12:00:00.000Z";
const projectId = ProjectId.make("project-integration");

function project(): OrchestrationProject {
  return {
    id: projectId,
    title: "Fixture",
    workspaceRoot: "/tmp/fixture",
    repositoryIdentity: null,
    defaultModelSelection: null,
    defaultThreadEnvMode: null,
    faviconPath: null,
    scripts: [],
    qualityPolicy: {
      updatedAt: at,
      gates: [
        {
          id: "tests",
          label: "Tests",
          command: "npm test",
          approvedCommand: "npm test",
          enabled: true,
          required: true,
          timeoutSeconds: 60,
        },
        {
          id: "integration-tests",
          label: "Integration tests",
          command: "npm run test:integration",
          approvedCommand: "npm run test:integration",
          scope: "integration",
          enabled: true,
          required: true,
          timeoutSeconds: 60,
        },
      ],
    },
    reviewPolicy: null,
    integrationBatches: [],
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

function completedTask(id: string, path: string, baseCommit = "a".repeat(40)): OrchestrationTask {
  const taskId = TaskId.make(id);
  const snapshotId = TaskReviewSnapshotId.make(`snapshot-${id}`);
  const file = {
    path,
    previousPath: null,
    changeType: "modified" as const,
    additions: 1,
    deletions: 0,
    binary: false,
    untracked: false,
  };
  return {
    id: taskId,
    projectId,
    title: id,
    objective: "Fixture",
    role: "builder",
    modelSelection: null,
    acceptanceCriteria: [],
    reviewRequired: true,
    preferDifferentReviewerProvider: true,
    status: "completed",
    threadId: null,
    createdAt: at,
    updatedAt: at,
    activatedAt: at,
    completedAt: at,
    cancelledAt: null,
    workspace: null,
    ownership: {
      required: true,
      rules: [],
      status: "valid",
      validatedAt: at,
      changedPathCount: 1,
      violations: [],
      errorReason: null,
      updatedAt: at,
    },
    reviewSnapshot: {
      id: snapshotId,
      taskId,
      baseCommit,
      checkpointRef: `refs/t3/checkpoints/tasks/${id}` as never,
      fingerprint: `fingerprint-${id}`,
      branchHead: baseCommit,
      changedFiles: 1,
      additions: 1,
      deletions: 0,
      files: [file],
      ownershipStatus: "valid",
      status: "current",
      capturedAt: at,
    },
    handoff: {
      id: TaskHandoffId.make(`handoff-${id}`),
      taskId,
      snapshotId,
      status: "ready",
      summary: "Ready",
      testsRun: [],
      assumptions: [],
      interfaceChanges: [],
      migrations: [],
      knownRisks: [],
      followUps: [],
      generation: "manual",
      generationError: null,
      createdAt: at,
      updatedAt: at,
    },
    restore: null,
    reviewError: null,
    result: {
      taskId,
      status: "completed",
      summary: "Done",
      files: [file],
      baseCommit,
      snapshotId,
      testsRun: [],
      assumptions: [],
      interfaceChanges: [],
      migrations: [],
      knownRisks: [],
      followUps: [],
      providerInstanceId: null,
      threadId: null,
      branch: `nebula/manual/${id}`,
      completedAt: at,
    },
    qualityGateRuns: [
      {
        id: QualityGateRunId.make(`gate-${id}`),
        taskId,
        snapshotId,
        gateId: "tests",
        label: "Tests",
        command: "npm test",
        required: true,
        timeoutSeconds: 60,
        status: "passed",
        cwd: "/tmp/fixture",
        exitCode: 0,
        startedAt: at,
        completedAt: at,
        outputSummary: "passed",
        outputTruncated: false,
      },
    ],
    reviews: [
      {
        id: TaskReviewId.make(`review-${id}`),
        taskId,
        snapshotId,
        reviewerModelSelection: { instanceId: "codex" as never, model: "gpt-5" },
        diversity: "cross-provider",
        status: "completed",
        verdict: "approve",
        findings: [],
        criteria: [],
        securityConcerns: [],
        requiredChanges: [],
        summary: "Approved",
        coverage: "complete",
        failureReason: null,
        findingsSentAt: null,
        createdAt: at,
        completedAt: at,
      },
    ],
  };
}

describe("deterministic Integration policy", () => {
  it("accepts only the immutable completed result contract", () => {
    const task = completedTask("task-a", "src/a.ts");
    expect(integrationEligibility(project(), task)).toEqual({ eligible: true, reasons: [] });
    expect(taskResultId(task)).toBe(`task-result:${task.id}:${task.result!.snapshotId}`);

    const stale = {
      ...task,
      reviewSnapshot: { ...task.reviewSnapshot!, id: TaskReviewSnapshotId.make("other") },
    };
    expect(integrationEligibility(project(), stale)).toMatchObject({ eligible: false });
  });

  it("requires one exact common base and preserves user order", () => {
    const first = completedTask("task-a", "src/a.ts");
    const second = completedTask("task-b", "src/b.ts");
    const batchId = IntegrationBatchId.make("batch-order");
    const batch = buildIntegrationBatch({
      project: project(),
      batchId,
      taskIds: [second.id, first.id],
      tasks: [first, second],
      acknowledgeOverlaps: false,
      createdAt: at,
    });
    expect(batch.tasks.map((task) => task.taskId)).toEqual([second.id, first.id]);
    expect(batch.branch).toBe(integrationBranchName(batchId, [second.title, first.title]));
    expect(batch.branch).toBe("nebula/integration/batch-order-task-b-task-a");
    expect(() =>
      buildIntegrationBatch({
        project: project(),
        batchId,
        taskIds: [first.id, second.id],
        tasks: [first, completedTask("task-b", "src/b.ts", "b".repeat(40))],
        acknowledgeOverlaps: false,
        createdAt: at,
      }),
    ).toThrow("exact base commit");
  });

  it("surfaces overlap without predicting a Git conflict", () => {
    const tasks = [
      completedTask("task-a", "src/shared.ts"),
      completedTask("task-b", "src/shared.ts"),
    ];
    expect(integrationOverlapPaths(tasks)).toEqual(["src/shared.ts"]);
    expect(() =>
      buildIntegrationBatch({
        project: project(),
        batchId: IntegrationBatchId.make("batch-overlap"),
        taskIds: tasks.map((task) => task.id),
        tasks,
        acknowledgeOverlaps: false,
        createdAt: at,
      }),
    ).toThrow("acknowledged");
  });
});
