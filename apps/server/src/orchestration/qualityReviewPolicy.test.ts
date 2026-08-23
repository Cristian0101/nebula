import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  CheckpointRef,
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  QualityGateRunId,
  TaskHandoffId,
  TaskId,
  TaskReviewId,
  TaskReviewSnapshotId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const now = "2026-08-22T20:00:00.000Z";
const projectId = ProjectId.make("quality-project");
const taskId = TaskId.make("quality-task");
const threadId = ThreadId.make("quality-thread");
const snapshotId = TaskReviewSnapshotId.make("quality-snapshot");
const reviewer = { instanceId: ProviderInstanceId.make("codex"), model: "review-model" };

const readModel = (input?: {
  readonly passed?: boolean;
  readonly approved?: boolean;
}): OrchestrationReadModel => ({
  snapshotSequence: 1,
  updatedAt: now,
  projects: [
    {
      id: projectId,
      title: "Quality project",
      workspaceRoot: "/tmp/quality-project",
      repositoryIdentity: null,
      defaultModelSelection: null,
      defaultThreadEnvMode: null,
      faviconPath: null,
      scripts: [],
      qualityPolicy: {
        gates: [
          {
            id: "tests",
            label: "Tests",
            command: "npm test",
            enabled: true,
            required: true,
            timeoutSeconds: 60,
            approvedCommand: "npm test",
          },
        ],
        updatedAt: now,
      },
      reviewPolicy: {
        requireIndependentReview: true,
        preferDifferentProvider: true,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  tasks: [
    {
      id: taskId,
      projectId,
      title: "Quality Task",
      objective: "Prove quality and review policy.",
      role: "builder",
      modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "auto" },
      acceptanceCriteria: ["Tests pass"],
      reviewRequired: true,
      preferDifferentReviewerProvider: true,
      status: "active",
      threadId,
      createdAt: now,
      updatedAt: now,
      activatedAt: now,
      completedAt: null,
      cancelledAt: null,
      workspace: {
        status: "ready",
        sourceRepository: "/tmp/quality-project",
        baseCommit: "base",
        branch: "nebula/quality-task",
        path: "/tmp/quality-task",
        createdAt: now,
        removedAt: null,
        failureCode: null,
        failureReason: null,
        updatedAt: now,
      },
      ownership: {
        required: true,
        rules: [{ id: "all", pattern: "**", access: "write", createdAt: now }],
        status: "valid",
        validatedAt: now,
        changedPathCount: 1,
        violations: [],
        errorReason: null,
        updatedAt: now,
      },
      reviewSnapshot: {
        id: snapshotId,
        taskId,
        baseCommit: "base",
        checkpointRef: CheckpointRef.make("refs/t3/checkpoints/tasks/quality/review/1"),
        fingerprint: "tree",
        branchHead: "head",
        changedFiles: 1,
        additions: 1,
        deletions: 0,
        ownershipStatus: "valid",
        status: "current",
        capturedAt: now,
      },
      handoff: {
        id: TaskHandoffId.make("quality-handoff"),
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
        createdAt: now,
        updatedAt: now,
      },
      restore: null,
      reviewError: null,
      result: null,
      qualityGateRuns: input?.passed
        ? [
            {
              id: QualityGateRunId.make("passed-tests"),
              taskId,
              snapshotId,
              gateId: "tests",
              label: "Tests",
              command: "npm test",
              required: true,
              timeoutSeconds: 60,
              status: "passed",
              cwd: "/tmp/quality-task",
              exitCode: 0,
              startedAt: now,
              completedAt: now,
              outputSummary: "ok",
              outputTruncated: false,
            },
          ]
        : [],
      reviews: input?.approved
        ? [
            {
              id: TaskReviewId.make("approved-review"),
              taskId,
              snapshotId,
              reviewerModelSelection: reviewer,
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
              createdAt: now,
              completedAt: now,
            },
          ]
        : [],
    },
  ],
  threads: [
    {
      id: threadId,
      projectId,
      title: "Builder",
      modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "auto" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "nebula/quality-task",
      worktreePath: "/tmp/quality-task",
      latestTurn: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      pinnedAt: null,
      pinOrderKey: null,
      titleRegeneration: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
});

it.layer(NodeServices.layer)("Task quality and review policy", (it) => {
  it.effect("requires exact command approval and all required gates", () =>
    Effect.gen(function* () {
      const mismatch = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: readModel(),
          command: {
            type: "project.quality-policy.update",
            commandId: CommandId.make("bad-policy"),
            projectId,
            gates: [
              {
                id: "tests",
                label: "Tests",
                command: "npm test changed",
                enabled: true,
                required: true,
                timeoutSeconds: 60,
                approvedCommand: "npm test",
              },
            ],
            createdAt: now,
          },
        }),
      );
      expect(mismatch.message).toContain("approval does not match");

      const blocked = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: readModel(),
          command: {
            type: "task.independent-review.request",
            commandId: CommandId.make("blocked-review"),
            taskId,
            snapshotId,
            reviewId: TaskReviewId.make("review-1"),
            reviewerModelSelection: reviewer,
            createdAt: now,
          },
        }),
      );
      expect(blocked.message).toContain("required quality gates");

      const requested = yield* decideOrchestrationCommand({
        readModel: readModel({ passed: true }),
        command: {
          type: "task.independent-review.request",
          commandId: CommandId.make("request-review"),
          taskId,
          snapshotId,
          reviewId: TaskReviewId.make("review-2"),
          reviewerModelSelection: reviewer,
          createdAt: now,
        },
      });
      expect("type" in requested ? requested.type : requested[0]?.type).toBe(
        "task.independent-review.requested",
      );
    }),
  );

  it.effect("blocks completion until a current approving review exists", () =>
    Effect.gen(function* () {
      const blocked = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: readModel({ passed: true }),
          command: {
            type: "task.complete",
            commandId: CommandId.make("blocked-complete"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(blocked.message).toContain("approved independent review");

      const allowed = yield* decideOrchestrationCommand({
        readModel: readModel({ passed: true, approved: true }),
        command: {
          type: "task.complete",
          commandId: CommandId.make("allowed-complete"),
          taskId,
          createdAt: now,
        },
      });
      expect("type" in allowed ? allowed.type : allowed[0]?.type).toBe(
        "task.ownership-validation-requested",
      );
    }),
  );

  it.effect("rejects an approving result with blocking findings", () =>
    Effect.gen(function* () {
      const base = readModel({ passed: true });
      const reviews = [
        {
          id: TaskReviewId.make("review-invalid"),
          taskId,
          snapshotId,
          reviewerModelSelection: reviewer,
          diversity: "cross-provider",
          status: "running",
          verdict: null,
          findings: [],
          criteria: [],
          securityConcerns: [],
          requiredChanges: [],
          summary: "",
          coverage: "complete",
          failureReason: null,
          findingsSentAt: null,
          createdAt: now,
          completedAt: null,
        },
      ] as const;
      const model: OrchestrationReadModel = {
        ...base,
        tasks: [{ ...base.tasks![0]!, reviews }],
      };
      const rejected = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.independent-review.completed",
            commandId: CommandId.make("invalid-approve"),
            taskId,
            review: {
              ...reviews[0],
              status: "completed",
              verdict: "approve",
              findings: [
                { severity: "blocking", title: "Missing test", detail: "Coverage is absent." },
              ],
              completedAt: now,
            },
            createdAt: now,
          },
        }),
      );
      expect(rejected.message).toContain("cannot be persisted");
    }),
  );

  it.effect("requires explicit confirmation for post-start criteria edits and stales review", () =>
    Effect.gen(function* () {
      const blocked = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: readModel({ passed: true, approved: true }),
          command: {
            type: "task.acceptance-criteria.set",
            commandId: CommandId.make("criteria-without-confirmation"),
            taskId,
            criteria: ["New criterion"],
            confirmStartedTaskChange: false,
            createdAt: now,
          },
        }),
      );
      expect(blocked.message).toContain("explicit confirmation");

      const events = yield* decideOrchestrationCommand({
        readModel: readModel({ passed: true, approved: true }),
        command: {
          type: "task.acceptance-criteria.set",
          commandId: CommandId.make("criteria-confirmed"),
          taskId,
          criteria: ["New criterion"],
          confirmStartedTaskChange: true,
          createdAt: now,
        },
      });
      expect(Array.isArray(events)).toBe(true);
      if (!Array.isArray(events)) return expect.fail("Expected criteria and stale events");
      expect(events.map((event) => event.type)).toEqual([
        "task.acceptance-criteria-updated",
        "task.review.stale",
      ]);
    }),
  );

  it.effect("stales current snapshot, gate evidence, and review without deleting history", () =>
    Effect.gen(function* () {
      const model = readModel({ passed: true, approved: true });
      const stale = yield* projectEvent(model, {
        sequence: 2,
        eventId: EventId.make("quality-review-stale"),
        type: "task.review.stale",
        aggregateKind: "task",
        aggregateId: taskId,
        occurredAt: now,
        commandId: CommandId.make("quality-review-stale"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: { taskId, updatedAt: now },
      });
      const task = stale.tasks?.[0];
      expect(task?.reviewSnapshot?.status).toBe("stale");
      expect(task?.qualityGateRuns?.map((run) => run.status)).toEqual(["stale"]);
      expect(task?.reviews?.map((review) => review.status)).toEqual(["stale"]);
      expect(task?.reviews).toHaveLength(1);
    }),
  );
});
