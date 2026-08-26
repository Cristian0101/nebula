import {
  ProviderInstanceId,
  TaskId,
  ThreadId,
  type Mission,
  type MissionRun,
  type ModelSelection,
  type OrchestrationTask,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  arrangeTerminalNodes,
  DEFAULT_TERMINAL_CENTER_STATE,
  deriveTerminalAgentPresentation,
  deriveTerminalNodeStatus,
  hasSharedCheckoutWarning,
  hydrateTerminalCanvasThreads,
  nextFreeformPosition,
  providerLaunchBlockReason,
  removeTerminalFromCanvas,
  terminalThreadCreateFields,
  FOCUSED_TERMINAL_SHELL_CLASS,
  terminalCenterKeyboardAction,
  terminalWorkspaceLabel,
  type TerminalCanvasNode,
} from "./terminalCenterLogic";

const threadId = (value: string) => ThreadId.make(value);

function node(index: number, providerId = `provider-${index % 6}`): TerminalCanvasNode {
  return {
    threadId: threadId(`thread-${index}`),
    projectId: `project-${index % 5}`,
    providerId,
    status: index % 3 === 0 ? "working" : index % 3 === 1 ? "ready" : "attention",
    taskId: null,
    missionId: null,
  };
}

describe("Terminal Center layouts", () => {
  const nodes = Array.from({ length: 20 }, (_, index) => node(index));

  it.each([
    "grid",
    "project-columns",
    "provider-columns",
    "status-lanes",
    "radial",
    "compact",
  ] as const)("places all 20 nodes in %s without collisions", (layout) => {
    const positions = arrangeTerminalNodes({
      nodes,
      layout,
      selectedThreadId: nodes[4]!.threadId,
    });
    expect(Object.keys(positions)).toHaveLength(20);
    expect(new Set(Object.values(positions).map((point) => `${point.x}:${point.y}`)).size).toBe(20);
  });

  it("preserves manual positions in freeform mode", () => {
    const positions = { [nodes[0]!.threadId]: { x: 117, y: 203 } };
    expect(
      arrangeTerminalNodes({ nodes, layout: "freeform", currentPositions: positions }),
    ).toEqual(positions);
  });

  it("places new Freeform nodes clear of manually positioned nodes", () => {
    const positions = {
      first: { x: 580, y: 150 },
      second: { x: 420, y: 270 },
    };
    const next = nextFreeformPosition(positions, 2);

    expect(next).toEqual({ x: 936, y: 52 });
    expect(
      Object.values(positions).every(
        (point) => Math.abs(point.x - next.x) >= 288 || Math.abs(point.y - next.y) >= 180,
      ),
    ).toBe(true);
  });

  it("uses canonical Mission waves for Mission flow", () => {
    const taskA = TaskId.make("task-a");
    const taskB = TaskId.make("task-b");
    const mission = {
      id: "mission-1",
      projectId: "project-1",
      title: "Mission",
      objective: "Test",
      description: null,
      status: "draft",
      taskIds: [taskA, taskB],
      dependencies: [
        {
          missionId: "mission-1",
          prerequisiteTaskId: taskA,
          dependentTaskId: taskB,
          createdAt: "2026-08-23T00:00:00.000Z",
        },
      ],
      activities: [],
      integrationBatchId: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      activatedAt: null,
      completedAt: null,
      cancelledAt: null,
    } as unknown as Mission;
    const tasks = [
      { id: taskA, threadId: threadId("thread-a") },
      { id: taskB, threadId: threadId("thread-b") },
    ] as unknown as OrchestrationTask[];
    const missionNodes: TerminalCanvasNode[] = [
      { ...node(1), threadId: threadId("thread-a"), taskId: taskA, missionId: mission.id },
      { ...node(2), threadId: threadId("thread-b"), taskId: taskB, missionId: mission.id },
    ];
    const positions = arrangeTerminalNodes({
      nodes: missionNodes,
      layout: "mission-flow",
      tasks,
      missions: [mission],
    });
    expect(positions[threadId("thread-b")]!.x).toBeGreaterThan(positions[threadId("thread-a")]!.x);
  });
});

describe("Terminal Center composition", () => {
  it("keeps the focused terminal viewport full-height without a stacked shell header", () => {
    expect(FOCUSED_TERMINAL_SHELL_CLASS).toContain("h-dvh");
    expect(FOCUSED_TERMINAL_SHELL_CLASS).toContain("min-h-0");
    expect(FOCUSED_TERMINAL_SHELL_CLASS).toContain("overflow-hidden");
  });

  it("focuses with Enter and exits with Escape without hijacking form controls", () => {
    expect(
      terminalCenterKeyboardAction({
        key: "Enter",
        selectedThreadId: "thread-1",
        focused: false,
        targetIsFormControl: false,
      }),
    ).toBe("focus");
    expect(
      terminalCenterKeyboardAction({
        key: "Enter",
        selectedThreadId: "thread-1",
        focused: false,
        targetIsFormControl: true,
      }),
    ).toBeNull();
    expect(
      terminalCenterKeyboardAction({
        key: "Escape",
        selectedThreadId: "thread-1",
        focused: true,
        targetIsFormControl: false,
      }),
    ).toBe("exit");
  });

  it("keeps provider availability registry-driven and explains disabled entries", () => {
    expect(
      providerLaunchBlockReason({
        enabled: false,
        isAvailable: true,
        installed: true,
        status: "ready",
      }),
    ).toBe("Disabled in provider settings");
    expect(
      providerLaunchBlockReason({
        enabled: true,
        isAvailable: false,
        installed: false,
        status: "ready",
      }),
    ).toContain("not installed");
    expect(
      providerLaunchBlockReason({
        enabled: true,
        isAvailable: true,
        installed: true,
        status: "ready",
      }),
    ).toBeNull();
  });

  it("hydrates visible canonical Threads in saved canvas order", () => {
    const threads = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    expect(
      hydrateTerminalCanvasThreads(["b", "missing", "a"], threads).map((thread) => thread.id),
    ).toEqual(["b", "a"]);
  });

  it("removing a canvas node preserves the canonical Thread object", () => {
    const canonicalThread = { id: "thread-1", title: "Still here" };
    const state = {
      ...DEFAULT_TERMINAL_CENTER_STATE,
      visibleThreadIds: [canonicalThread.id],
      positions: { [canonicalThread.id]: { x: 4, y: 8 } },
      selectedThreadId: canonicalThread.id,
    };
    const next = removeTerminalFromCanvas(state, canonicalThread.id);
    expect(next.visibleThreadIds).toEqual([]);
    expect(next.positions).toEqual({});
    expect(canonicalThread).toEqual({ id: "thread-1", title: "Still here" });
  });

  it("labels shared and isolated canonical workspaces", () => {
    expect(terminalWorkspaceLabel({ worktreePath: null, taskBacked: false })).toBe(
      "Current checkout",
    );
    expect(terminalWorkspaceLabel({ worktreePath: "/tmp/task", taskBacked: true })).toBe(
      "Isolated Task worktree",
    );
    expect(
      hasSharedCheckoutWarning([
        { worktreePath: null, runtimeMode: "full-access" },
        { worktreePath: null, runtimeMode: "auto-accept-edits" },
      ]),
    ).toBe(true);
  });

  it("composes current and isolated launches into canonical Thread fields", () => {
    const modelSelection: ModelSelection = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
    };
    expect(
      terminalThreadCreateFields({
        title: "Codex terminal",
        modelSelection,
        workspace: { mode: "current" },
      }),
    ).toMatchObject({ branch: null, worktreePath: null, runtimeMode: "full-access" });
    expect(
      terminalThreadCreateFields({
        title: "Codex isolated",
        modelSelection,
        workspace: { mode: "isolated", branch: "task/one", path: "/tmp/task-one" },
      }),
    ).toMatchObject({ branch: "task/one", worktreePath: "/tmp/task-one" });
  });

  it("maps canonical session state to lightweight node status", () => {
    const base = {
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      latestTurn: null,
      session: null,
      backgroundLiveness: null,
    } as unknown as OrchestrationThreadShell;
    expect(deriveTerminalNodeStatus(base)).toBe("ready");
    expect(
      deriveTerminalNodeStatus({
        ...base,
        latestTurn: { state: "running" },
      } as OrchestrationThreadShell),
    ).toBe("working");
    expect(
      deriveTerminalNodeStatus({ ...base, hasPendingApprovals: true } as OrchestrationThreadShell),
    ).toBe("attention");
    expect(
      deriveTerminalNodeStatus({
        ...base,
        latestTurn: { state: "completed" },
        session: { status: "stopped" },
      } as OrchestrationThreadShell),
    ).toBe("ready");
  });

  it("derives textual live-agent states from canonical runtime evidence", () => {
    const task = { id: TaskId.make("task-live"), status: "active" } as OrchestrationTask;
    const thread = {
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      latestTurn: { state: "running" },
      session: { status: "running" },
      backgroundLiveness: null,
      planProgress: { step: "Running focused tests", completedSteps: 1, totalSteps: 2 },
    } as unknown as OrchestrationThreadShell;
    const run = {
      status: "running",
      startedAt: "2026-08-25T20:00:00.000Z",
      decisions: [],
      attention: [],
    } as unknown as MissionRun;

    expect(
      deriveTerminalAgentPresentation({
        thread,
        task,
        run,
        providerAvailable: true,
        nowMs: Date.parse("2026-08-25T20:00:18.000Z"),
      }),
    ).toMatchObject({
      state: "working",
      label: "Working",
      detail: "Running focused tests",
      elapsed: "18s",
    });
    expect(
      deriveTerminalAgentPresentation({
        thread: {
          ...thread,
          latestTurn: { state: "completed" },
          session: { status: "stopped" },
        } as unknown as OrchestrationThreadShell,
        task: { ...task, status: "completed" },
        run,
        providerAvailable: true,
      }),
    ).toMatchObject({ state: "complete", label: "Complete", canvasStatus: "ready" });
  });

  it("derives a 20-node canvas with exactly four active agents from canonical evidence", () => {
    const presentations = Array.from({ length: 20 }, (_, index) => {
      const active = index < 4;
      const task = {
        id: TaskId.make(`task-load-${index}`),
        status: active ? "active" : "completed",
      } as OrchestrationTask;
      const thread = {
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        latestTurn: { state: active ? "running" : "completed" },
        session: { status: active ? "running" : "stopped" },
        backgroundLiveness: null,
        planProgress: active ? { step: `Working on Task ${index + 1}` } : null,
      } as unknown as OrchestrationThreadShell;
      const run = {
        status: active ? "running" : "completed",
        startedAt: "2026-08-25T20:00:00.000Z",
        decisions: [],
        attention: [],
      } as unknown as MissionRun;
      return deriveTerminalAgentPresentation({
        thread,
        task,
        run,
        providerAvailable: true,
        nowMs: Date.parse("2026-08-25T20:00:18.000Z"),
      });
    });

    expect(presentations.filter((presentation) => presentation.state === "working")).toHaveLength(
      4,
    );
    expect(presentations.filter((presentation) => presentation.state === "complete")).toHaveLength(
      16,
    );
    expect(presentations.slice(0, 4).every((presentation) => presentation.elapsed === "18s")).toBe(
      true,
    );

    const loadNodes = Array.from({ length: 20 }, (_, index) => ({
      ...node(index),
      status: index < 4 ? ("working" as const) : ("ready" as const),
    }));
    const positions = arrangeTerminalNodes({ nodes: loadNodes, layout: "status-lanes" });
    expect(Object.keys(positions)).toHaveLength(20);
  });

  it("labels checkpoint, resource, review, provider, and error attention states", () => {
    const task = { id: TaskId.make("task-wait"), status: "active" } as OrchestrationTask;
    const thread = {
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      latestTurn: null,
      session: null,
      backgroundLiveness: null,
    } as unknown as OrchestrationThreadShell;
    const run = {
      status: "attention",
      startedAt: "2026-08-25T20:00:00.000Z",
      decisions: [
        {
          id: "decision-1",
          kind: "waiting_checkpoint",
          taskId: task.id,
          reason: "Contract Freeze needs functional review approval.",
          sourceTaskIds: [],
          occurredAt: "2026-08-25T20:00:10.000Z",
        },
      ],
      attention: [],
    } as unknown as MissionRun;
    expect(
      deriveTerminalAgentPresentation({ thread, task, run, providerAvailable: true }),
    ).toMatchObject({ state: "waiting-checkpoint", label: "Waiting for checkpoint" });
    expect(
      deriveTerminalAgentPresentation({
        thread,
        task,
        run: {
          ...run,
          decisions: [{ ...run.decisions[0]!, kind: "waiting_resource" }],
        },
        providerAvailable: true,
      }),
    ).toMatchObject({ state: "waiting-resource", label: "Waiting for resource" });
    expect(
      deriveTerminalAgentPresentation({
        thread: { ...thread, hasPendingApprovals: true },
        task,
        run,
        providerAvailable: true,
      }),
    ).toMatchObject({ state: "review-needed", label: "Review needed" });
    expect(
      deriveTerminalAgentPresentation({ thread, task, run, providerAvailable: false }),
    ).toMatchObject({ state: "provider-unavailable", label: "Provider unavailable" });
    expect(
      deriveTerminalAgentPresentation({
        thread,
        task,
        run: {
          ...run,
          decisions: [],
          attention: [
            {
              taskId: task.id,
              code: "provider_failed",
              detail: "Failed to authenticate because the OAuth token expired.",
              blocksMission: false,
            },
          ],
        },
        providerAvailable: true,
      }),
    ).toMatchObject({ state: "provider-unavailable", label: "Provider unavailable" });
    expect(
      deriveTerminalAgentPresentation({
        thread,
        task,
        run: {
          ...run,
          decisions: [],
          attention: [
            {
              taskId: task.id,
              code: "worker_failed",
              detail: "Provider turn failed.",
              blocksMission: true,
            },
          ],
        },
        providerAvailable: true,
      }),
    ).toMatchObject({ state: "error", label: "Error" });
  });
});
