import {
  CheckpointRef,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  TaskReviewSnapshotId,
  ThreadId,
} from "@t3tools/contracts";
import type { OrchestrationTask, OrchestrationThreadShell } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProviderInstanceEntry } from "../../providerInstances";
import {
  buildCommandDeckActivity,
  deriveCurrentAction,
  deriveTaskAttention,
  deriveTaskPresentationStatus,
  resolveTaskModelSelection,
  providerSupportsStructuredReview,
  selectProjectTasks,
  summarizeCommandDeck,
  taskRequiredQualityGatesPassed,
  taskChangedFileCount,
} from "./commandDeckLogic";

const projectId = ProjectId.make("project-1");
const codex = ProviderInstanceId.make("codex");

function makeTask(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: TaskId.make("task-1"),
    projectId,
    title: "Build Command Deck",
    objective: "Coordinate several providers.",
    role: "builder",
    modelSelection: { instanceId: codex, model: "gpt-5" },
    status: "draft",
    threadId: null,
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:00:00.000Z",
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
    ...overrides,
  };
}

const readyProvider = {
  instanceId: codex,
  driverKind: "codex",
  displayName: "Codex",
  enabled: true,
  installed: true,
  status: "ready",
  isDefault: true,
  isAvailable: true,
  models: [],
  snapshot: {},
} as unknown as ProviderInstanceEntry;

describe("Command Deck presentation", () => {
  it("offers only structured-generation providers for independent review", () => {
    expect(providerSupportsStructuredReview(readyProvider)).toBe(true);
    expect(
      providerSupportsStructuredReview({
        ...readyProvider,
        instanceId: ProviderInstanceId.make("antigravity"),
        driverKind: "antigravity",
      } as ProviderInstanceEntry),
    ).toBe(true);
    expect(
      providerSupportsStructuredReview({
        ...readyProvider,
        instanceId: ProviderInstanceId.make("claudeAgent"),
        driverKind: "claudeAgent",
      } as ProviderInstanceEntry),
    ).toBe(false);
  });

  it("persists draft assignment before a Thread and prefers the Thread after start", () => {
    const task = makeTask();
    expect(resolveTaskModelSelection(task, null, null)).toEqual(task.modelSelection);
    const thread = {
      modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "auto" },
    } as OrchestrationThreadShell;
    expect(resolveTaskModelSelection(task, thread, null)).toEqual(thread.modelSelection);
  });

  it("scopes hydration to the active Project and sorts newest first", () => {
    const otherProject = ProjectId.make("project-2");
    const tasks = [
      makeTask({ id: TaskId.make("older"), updatedAt: "2026-08-22T12:00:00.000Z" }),
      makeTask({
        id: TaskId.make("foreign"),
        projectId: otherProject,
        updatedAt: "2026-08-22T12:02:00.000Z",
      }),
      makeTask({ id: TaskId.make("newer"), updatedAt: "2026-08-22T12:01:00.000Z" }),
    ];
    expect(selectProjectTasks(tasks, projectId).map((task) => task.id)).toEqual(["newer", "older"]);
  });

  it("derives attention without adding a Task lifecycle state", () => {
    const task = makeTask({
      status: "active",
      ownership: {
        required: true,
        rules: [],
        status: "violation",
        validatedAt: "2026-08-22T12:04:00.000Z",
        changedPathCount: 1,
        violations: [],
        errorReason: null,
        updatedAt: "2026-08-22T12:04:00.000Z",
      },
    });
    const attention = deriveTaskAttention({
      task,
      thread: null,
      providerEntry: readyProvider,
      modelSelection: task.modelSelection ?? null,
    });
    expect(attention.map((item) => item.label)).toContain("Ownership violation");
    expect(deriveTaskPresentationStatus({ task, thread: null, attention }).label).toBe(
      "Needs attention",
    );
    expect(task.status).toBe("active");
  });

  it("preserves an unavailable provider assignment and marks it for attention", () => {
    const task = makeTask();
    const unavailable = { ...readyProvider, status: "unavailable", isAvailable: false };
    const attention = deriveTaskAttention({
      task,
      thread: null,
      providerEntry: unavailable as ProviderInstanceEntry,
      modelSelection: task.modelSelection ?? null,
    });
    expect(attention).toContainEqual({ kind: "provider", label: "Provider unavailable" });
    expect(task.modelSelection).toEqual({ instanceId: codex, model: "gpt-5" });
  });

  it("does not require integration-only gates before a Task review", () => {
    const snapshotId = TaskReviewSnapshotId.make("snapshot-current");
    const task = makeTask({
      reviewSnapshot: {
        id: snapshotId,
        taskId: TaskId.make("task-1"),
        baseCommit: "base",
        checkpointRef: CheckpointRef.make("refs/t3/checkpoints/task-1"),
        fingerprint: "fingerprint",
        branchHead: "head",
        changedFiles: 1,
        additions: 1,
        deletions: 0,
        files: [],
        ownershipStatus: "valid",
        status: "current",
        capturedAt: "2026-08-22T12:00:00.000Z",
      },
      qualityGateRuns: [
        {
          snapshotId,
          gateId: "task-tests",
          command: "npm test",
          status: "passed",
        } as never,
      ],
    });
    const gates = [
      {
        id: "task-tests",
        label: "Task tests",
        command: "npm test",
        scope: "both" as const,
        required: true,
        timeoutSeconds: 600,
        enabled: true,
        approvedCommand: "npm test",
      },
      {
        id: "integration-tests",
        label: "Integration tests",
        command: "npm run test:integration",
        scope: "integration" as const,
        required: true,
        timeoutSeconds: 600,
        enabled: true,
        approvedCommand: "npm run test:integration",
      },
    ];

    expect(taskRequiredQualityGatesPassed(gates, task)).toBe(true);
  });

  it("summarizes eight Tasks with four active Threads and bounds meaningful activity", () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      makeTask({
        id: TaskId.make(`task-${index}`),
        title: `Task ${index}`,
        status: index < 4 ? "active" : "draft",
        threadId: index < 4 ? ThreadId.make(`thread-${index}`) : null,
        activatedAt: index < 4 ? `2026-08-22T12:0${index}:00.000Z` : null,
        ownership:
          index < 4
            ? {
                required: true,
                rules: [],
                status: "valid",
                validatedAt: `2026-08-22T12:1${index}:00.000Z`,
                changedPathCount: index + 1,
                violations: [],
                errorReason: null,
                updatedAt: `2026-08-22T12:1${index}:00.000Z`,
              }
            : null,
      }),
    );
    const summary = summarizeCommandDeck(tasks, new Map());
    expect(summary).toMatchObject({ total: 8, active: 4, changedFiles: 10 });
    expect(tasks.filter((task) => task.threadId !== null)).toHaveLength(4);
    const activity = buildCommandDeckActivity(tasks, 10);
    expect(activity).toHaveLength(10);
    expect(activity.some((item) => item.label === "Task 0 started")).toBe(true);
    expect(activity.every((item) => !item.label.includes("token"))).toBe(true);
  });

  it("uses revalidated ownership counts after a review snapshot becomes stale", () => {
    const task = makeTask({
      reviewSnapshot: {
        id: TaskReviewSnapshotId.make("snapshot-stale"),
        taskId: TaskId.make("task-1"),
        baseCommit: "base",
        checkpointRef: CheckpointRef.make("refs/t3/checkpoints/task-1"),
        fingerprint: "old",
        branchHead: "head",
        changedFiles: 3,
        additions: 3,
        deletions: 0,
        files: [],
        ownershipStatus: "valid",
        status: "stale",
        capturedAt: "2026-08-22T12:00:00.000Z",
      },
      ownership: {
        required: true,
        rules: [],
        status: "valid",
        validatedAt: "2026-08-22T12:01:00.000Z",
        changedPathCount: 0,
        violations: [],
        errorReason: null,
        updatedAt: "2026-08-22T12:01:00.000Z",
      },
    });

    expect(taskChangedFileCount(task)).toBe(0);
  });

  it("uses normalized plan progress and otherwise stays generic", () => {
    expect(
      deriveCurrentAction({
        id: ThreadId.make("thread-1"),
        planProgress: { step: "Run focused tests", completedSteps: 1, totalSteps: 3 },
      } as OrchestrationThreadShell),
    ).toBe("Run focused tests");
    expect(
      deriveCurrentAction({ latestTurn: { state: "running" } } as OrchestrationThreadShell),
    ).toBe("Working");
  });
});
