import type { Mission, MissionRun, OrchestrationTask } from "@t3tools/contracts";
import { computeMissionPlan } from "@t3tools/shared/missionGraph";
import { describe, expect, it } from "vite-plus/test";

import {
  filterMissionTimeline,
  missionAttentionItems,
  missionProgressSummary,
  missionRecoverySummary,
  missionTaskStateLabel,
} from "./missionCommandCenterViewModel";

const timestamp = "2026-08-28T12:00:00.000Z";
const task = (overrides: Partial<OrchestrationTask> = {}): OrchestrationTask => ({
  id: "task-a" as never,
  projectId: "project" as never,
  title: "Preferences API",
  objective: "Add preferences API",
  role: "builder",
  modelSelection: null,
  acceptanceCriteria: ["API test passes"],
  reviewRequired: true,
  preferDifferentReviewerProvider: true,
  status: "draft",
  threadId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  activatedAt: null,
  completedAt: null,
  cancelledAt: null,
  workspace: null,
  ownership: null,
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
  ...overrides,
});

const mission: Mission = {
  id: "mission" as never,
  projectId: "project" as never,
  title: "Settings mission",
  objective: "Ship settings",
  description: null,
  status: "active",
  taskIds: ["task-a" as never],
  dependencies: [],
  checkpoints: [],
  activities: [],
  integrationBatchId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  activatedAt: timestamp,
  completedAt: null,
  cancelledAt: null,
  baseCommit: "abc123",
  architectPlanProposalId: "plan" as never,
  routingProfile: null,
};

const run = (overrides: Partial<MissionRun> = {}): MissionRun => ({
  id: "run" as never,
  missionId: mission.id,
  projectId: mission.projectId,
  mode: "supervised_swarm",
  status: "running",
  maxConcurrentTasks: 2,
  currentReadyTaskIds: [],
  scheduledTaskIds: [],
  attention: [],
  attentionReason: null,
  decisions: [],
  startedAt: timestamp,
  pausedAt: null,
  completedAt: null,
  stoppedAt: null,
  failedAt: null,
  failureReason: null,
  recoveryPolicy: { transportRetryLimit: 1, remediationLimit: 0, routingProfile: "manual_only" },
  taskRecovery: [],
  routingDecisions: [],
  coordinationRequests: [],
  replanProposals: [],
  swarmPolicy: undefined,
  integrationBatchId: null,
  finalReport: null,
  updatedAt: timestamp,
  ...overrides,
});

describe("Mission Command Center view model", () => {
  it("keeps progress discrete and current-review aware", () => {
    const tasks = [
      task({
        modelSelection: { instanceId: "codex" as never, model: "gpt" },
      }),
    ];
    const plan = computeMissionPlan({ mission, tasks });
    expect(missionProgressSummary({ mission, plan, run: run() })).toMatchObject({
      completed: 0,
      total: 1,
      reviewPending: 1,
      steps: expect.arrayContaining([
        "Planning complete",
        "0 / 1 Tasks complete",
        "1 current review pending",
        "Integration not started",
      ]),
    });
  });

  it("aggregates canonical blockers without replacing their source state", () => {
    const blockedTask = task();
    const plan = computeMissionPlan({ mission, tasks: [blockedTask] });
    const items = missionAttentionItems({
      plan,
      tasks: [blockedTask],
      run: run({
        status: "attention",
        attention: [
          {
            taskId: blockedTask.id,
            code: "provider_auth",
            detail: "Claude authentication expired.",
            blocksMission: true,
          },
        ],
      }),
    });
    expect(items).toContainEqual(
      expect.objectContaining({
        category: "provider",
        taskId: blockedTask.id,
        detail: "Claude authentication expired.",
        action: "open_provider_recovery",
      }),
    );
  });

  it("labels actual waiting and review states instead of inventing renderer state", () => {
    const tasks = [
      task({
        modelSelection: { instanceId: "codex" as never, model: "gpt" },
      }),
    ];
    const plan = computeMissionPlan({ mission, tasks });
    expect(missionTaskStateLabel(plan.tasks[0]!, run())).toBe("Ready");
    const reviewed = task({
      status: "active",
      reviews: [
        {
          id: "review" as never,
          taskId: "task-a" as never,
          snapshotId: "snapshot" as never,
          reviewerModelSelection: { instanceId: "codex" as never, model: "gpt" },
          diversity: "cross-provider",
          status: "completed",
          verdict: "request_changes",
          summary: "Fix the API contract.",
          findings: [],
          criteria: [],
          securityConcerns: [],
          requiredChanges: ["Fix the API contract."],
          coverage: "complete",
          failureReason: null,
          findingsSentAt: null,
          createdAt: timestamp,
          completedAt: timestamp,
        },
      ],
    });
    const reviewPlan = computeMissionPlan({ mission, tasks: [reviewed] });
    expect(missionTaskStateLabel(reviewPlan.tasks[0]!, run())).toBe("Changes requested");
  });

  it("reports an applied Integration artifact as Integrated", () => {
    const integratedTask = task({ status: "completed" });
    const currentPlan = computeMissionPlan({ mission, tasks: [integratedTask] });
    const item = currentPlan.tasks[0]!;
    const integration = {
      tasks: [{ taskId: item.task.id, status: "applied" }],
    } as never;

    expect(missionTaskStateLabel(item, run(), integration)).toBe("Integrated");
  });

  it("filters the canonical timeline locally by category and search", () => {
    const activities = [
      {
        id: "one" as never,
        type: "task.review.completed",
        summary: "Review requested changes",
        taskId: "task-a" as never,
        occurredAt: timestamp,
      },
      {
        id: "two" as never,
        type: "resource.leases-acquired",
        summary: "shared-registry acquired",
        taskId: "task-a" as never,
        occurredAt: timestamp,
      },
    ];
    expect(filterMissionTimeline(activities, "reviews", "changes")).toEqual([activities[0]]);
    expect(filterMissionTimeline(activities, "resources", "registry")).toEqual([activities[1]]);
  });

  it("does not show recovery UI for a normal persisted Mission open", () => {
    const plan = computeMissionPlan({ mission, tasks: [task()] });
    expect(
      missionRecoverySummary({
        plan,
        run: run({
          taskRecovery: [
            {
              taskId: "task-a" as never,
              transientRetries: 0,
              remediationRounds: 0,
              attempts: [],
              latestFailureClass: null,
              latestFailureSignature: null,
              attentionRequired: false,
              updatedAt: timestamp,
            },
          ],
        }),
      }),
    ).toBeNull();
  });

  it("does not keep a recovery banner on a completed persisted Mission", () => {
    const plan = computeMissionPlan({ mission, tasks: [task({ status: "completed" })] });
    expect(
      missionRecoverySummary({
        plan,
        run: run({
          status: "completed",
          completedAt: timestamp,
          decisions: [
            {
              id: "old-recovery-event" as never,
              kind: "recovery",
              taskId: "task-a" as never,
              reason: "Replacement attempt was interrupted by runtime restart.",
              sourceTaskIds: ["task-a" as never],
              occurredAt: timestamp,
            },
          ],
          taskRecovery: [
            {
              taskId: "task-a" as never,
              transientRetries: 0,
              remediationRounds: 0,
              attempts: [],
              latestFailureClass: "transport_transient",
              latestFailureSignature: "runtime-restart",
              attentionRequired: true,
              updatedAt: timestamp,
            },
          ],
        }),
      }),
    ).toBeNull();
  });

  it("shows recovery UI only for a canonical interrupted restart reconciliation", () => {
    const plan = computeMissionPlan({ mission, tasks: [task({ status: "active" })] });
    expect(
      missionRecoverySummary({
        plan,
        run: run({
          status: "attention",
          decisions: [
            {
              id: "recovery-event" as never,
              kind: "recovery",
              taskId: "task-a" as never,
              reason: "Replacement attempt was interrupted by runtime restart.",
              sourceTaskIds: ["task-a" as never],
              occurredAt: timestamp,
            },
          ],
          taskRecovery: [
            {
              taskId: "task-a" as never,
              transientRetries: 1,
              remediationRounds: 0,
              attempts: [
                {
                  number: 2,
                  kind: "replacement",
                  providerInstanceId: "codex" as never,
                  threadId: "thread-replacement" as never,
                  status: "interrupted",
                  failureClass: "transport_transient",
                  summary: "Provider process did not survive server restart.",
                  startedAt: timestamp,
                  completedAt: timestamp,
                },
              ],
              latestFailureClass: "transport_transient",
              latestFailureSignature: "runtime-restart",
              attentionRequired: true,
              updatedAt: timestamp,
            },
          ],
        }),
      }),
    ).toMatchObject({ interruptedAttempts: 1, recoveredAt: timestamp });
  });
});
