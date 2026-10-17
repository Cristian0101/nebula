import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
  MissionId,
  MissionRunId,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  type OrchestrationTask,
  type Mission,
  type MissionRun,
  type OrchestrationShellSnapshot,
  type ServerProvider,
  type ArchitectPlanProposal,
  type IntegrationBatch,
} from "@t3tools/contracts";
import { deriveProviderInstanceEntries } from "../../../providerInstances";
import {
  deriveAgentPresence,
  deriveProjectAttention,
  deriveProjectResume,
  selectProjectHomeScope,
  type HomeScope,
} from "./projectHomeSelectors";
const now = "2026-10-17T12:00:00.000Z";
const env = EnvironmentId.make("local");
const id = ProjectId.make("project");
const providerId = ProviderInstanceId.make("codex");
const project: OrchestrationProjectShell = {
  id,
  title: "Same name",
  workspaceRoot: "/fixture",
  defaultModelSelection: null,
  scripts: [],
  createdAt: now,
  updatedAt: now,
};
const thread = (overrides: Partial<OrchestrationThreadShell> = {}): OrchestrationThreadShell => ({
  id: ThreadId.make("thread"),
  projectId: id,
  title: "Thread",
  modelSelection: { instanceId: providerId, model: "test" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "main",
  worktreePath: null,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  ...overrides,
});
const task = (overrides: Partial<OrchestrationTask> = {}): OrchestrationTask => ({
  id: TaskId.make("task"),
  projectId: id,
  title: "Task",
  objective: "Build",
  role: "builder",
  modelSelection: null,
  status: "active",
  threadId: null,
  createdAt: now,
  updatedAt: now,
  activatedAt: now,
  completedAt: null,
  cancelledAt: null,
  ...overrides,
});
const mission: Mission = {
  id: MissionId.make("mission"),
  projectId: id,
  title: "Mission",
  objective: "Build",
  description: null,
  status: "active",
  taskIds: [],
  dependencies: [],
  activities: [],
  integrationBatchId: null,
  createdAt: now,
  updatedAt: now,
  activatedAt: now,
  completedAt: null,
  cancelledAt: null,
};
const run = (overrides: Partial<MissionRun> = {}): MissionRun => ({
  id: MissionRunId.make("run"),
  missionId: mission.id,
  projectId: id,
  mode: "supervised_swarm",
  status: "attention",
  maxConcurrentTasks: 1,
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
  ...overrides,
});
const snapshot = (
  overrides: Partial<OrchestrationShellSnapshot> = {},
): OrchestrationShellSnapshot => ({
  snapshotSequence: 1,
  projects: [project],
  threads: [],
  tasks: [],
  missions: [],
  missionRuns: [],
  updatedAt: now,
  ...overrides,
});
const scope = (value = snapshot()): HomeScope => ({
  ref: { environmentId: env, projectId: id },
  environmentId: env,
  snapshot: value,
});
const attention = (value: OrchestrationShellSnapshot) =>
  deriveProjectAttention({ ...scope(value), providers: [], connected: true, now: Date.parse(now) });
const session = (status: NonNullable<OrchestrationThreadShell["session"]>["status"]) =>
  ({
    status,
    providerName: "codex",
    providerInstanceId: providerId,
    runtimeMode: "full-access",
    updatedAt: now,
  }) as NonNullable<OrchestrationThreadShell["session"]>;

describe("Project Home attention", () => {
  it.each([
    ["approval", thread({ hasPendingApprovals: true }), "Approval needed"],
    ["input", thread({ hasPendingUserInput: true }), "Waiting for your answer"],
    ["plan", thread({ hasActionableProposedPlan: true }), "Plan ready to review"],
    ["session", thread({ session: session("error") }), "Agent stopped with an error"],
    ["interrupted", thread({ session: session("interrupted") }), "Interrupted"],
  ] as const)("derives %s with a canonical Thread destination", (kind, item, label) => {
    expect(attention(snapshot({ threads: [item] }))).toMatchObject([
      { kind, label, destination: { kind: "thread", threadId: item.id } },
    ]);
  });
  it("derives a checkpoint only from a waiting run and unapproved checkpoint", () => {
    const checkpoint = {
      key: "review",
      name: "Review",
      requiredTaskIds: [],
      unlockTaskIds: [],
      requiredGateIds: [],
      reviewsRequired: false,
      humanApprovalRequired: true,
      humanApprovedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const decision = {
      id: EventId.make("decision"),
      kind: "waiting_checkpoint",
      taskId: null,
      reason: "wait",
      sourceTaskIds: [],
      occurredAt: now,
    } as MissionRun["decisions"][number];
    const value = snapshot({
      missions: [{ ...mission, checkpoints: [checkpoint] }],
      missionRuns: [run({ decisions: [decision] })],
    });
    expect(attention(value)[0]).toMatchObject({
      kind: "checkpoint",
      destination: { kind: "mission", missionId: mission.id, stage: "war-room" },
    });
    expect(attention(snapshot({ missions: [{ ...mission, checkpoints: [checkpoint] }] }))).toEqual(
      [],
    );
  });
  it("routes a ready Architect proposal to its plan", () => {
    const proposal = {
      id: "proposal",
      projectId: id,
      status: "ready",
      objective: "Plan",
      updatedAt: now,
    } as ArchitectPlanProposal;
    expect(
      attention(snapshot({ projects: [{ ...project, architectPlans: [proposal] }] })),
    ).toMatchObject([
      { kind: "architect", destination: { kind: "plan", proposalId: proposal.id } },
    ]);
  });
  it.each(["request", "replan", "escalation"])("derives coordination from %s", (kind) => {
    const current = run({
      coordinationRequests:
        kind === "request"
          ? [{ status: "pending" } as NonNullable<MissionRun["coordinationRequests"]>[number]]
          : [],
      replanProposals:
        kind === "replan"
          ? [{ status: "awaiting_approval" } as NonNullable<MissionRun["replanProposals"]>[number]]
          : [],
      taskRecovery:
        kind === "escalation"
          ? [
              {
                taskId: TaskId.make("task"),
                providerEscalation: { status: "recommended" },
              } as NonNullable<MissionRun["taskRecovery"]>[number],
            ]
          : [],
    });
    expect(attention(snapshot({ missions: [mission], missionRuns: [current] }))).toMatchObject([
      { kind: "coordination", destination: { kind: "mission", missionId: mission.id } },
    ]);
  });
  it("uses canonical run attention verbatim without parsing its text", () => {
    const current = run({
      attention: [
        {
          taskId: null,
          code: "unknown_code",
          detail: "A decision that says provider review failed",
          blocksMission: true,
        },
      ],
    });
    expect(attention(snapshot({ missions: [mission], missionRuns: [current] }))).toMatchObject([
      {
        kind: "mission",
        label: current.attention[0]!.detail,
        destination: { kind: "mission", stage: "war-room" },
      },
    ]);
  });
  it("derives Task attention and deduplicates the same Mission workspace failure", () => {
    const item = task({
      threadId: ThreadId.make("thread"),
      workspace: {
        status: "missing",
        sourceRepository: "/fixture",
        baseCommit: "abc",
        branch: "task",
        path: "/fixture-task",
        createdAt: now,
        removedAt: null,
        failureCode: null,
        failureReason: null,
        updatedAt: now,
      },
    });
    const value = snapshot({
      threads: [thread({ session: session("error") })],
      tasks: [item],
      missions: [mission],
      missionRuns: [
        run({
          attention: [
            {
              taskId: item.id,
              code: "workspace_unavailable",
              detail: "Workspace missing",
              blocksMission: true,
            },
            {
              taskId: item.id,
              code: "independent_cause",
              detail: "Another issue",
              blocksMission: true,
            },
          ],
        }),
      ],
    });
    const items = attention(value);
    expect(items.filter((item) => item.kind === "session")).toHaveLength(1);
    expect(items.filter((item) => item.kind === "task")).toMatchObject([
      { label: "Workspace missing", destination: { kind: "task" } },
    ]);
    expect(items.filter((item) => item.kind === "mission")).toMatchObject([
      { label: "Another issue" },
    ]);
  });
  it.each(["request_changes", "reject"] as const)(
    "routes current review %s to the Task",
    (verdict) => {
      const item = task({
        reviewSnapshot: { id: "review", status: "current" } as OrchestrationTask["reviewSnapshot"],
        reviews: [
          { snapshotId: "review", verdict } as NonNullable<OrchestrationTask["reviews"]>[number],
        ],
      });
      expect(attention(snapshot({ tasks: [item] }))).toMatchObject([
        {
          kind: "review",
          label: verdict === "reject" ? "Review rejected" : "Changes requested",
          decisionClass: 3,
          destination: { kind: "task", taskId: item.id },
        },
      ]);
    },
  );
  it.each(["conflict", "correction_required"] as const)(
    "routes integration %s to Integration",
    (status) => {
      const batch = { id: "batch", title: "Batch", status, updatedAt: now } as IntegrationBatch;
      expect(
        attention(snapshot({ projects: [{ ...project, integrationBatches: [batch] }] })),
      ).toMatchObject([{ kind: "integration", destination: { kind: "integration" } }]);
      expect(
        attention(
          snapshot({
            projects: [{ ...project, integrationBatches: [batch] }],
            missions: [{ ...mission, integrationBatchId: batch.id }],
          }),
        )[0]?.destination,
      ).toEqual({ kind: "mission", missionId: mission.id, stage: "review" });
    },
  );
  it("shows only fresh, enabled, relevant provider blockers and orders access last", () => {
    const provider = {
      instanceId: providerId,
      driver: "codex",
      enabled: true,
      installed: true,
      version: "1",
      status: "ready",
      auth: { status: "unauthenticated" },
      models: [],
      inspection: { status: "completed", verifiedAt: now },
    } as unknown as ServerProvider;
    const input = {
      ...scope(
        snapshot({
          threads: [thread({ hasPendingApprovals: true, session: session("interrupted") })],
        }),
      ),
      providers: deriveProviderInstanceEntries([provider]),
      connected: true,
      now: Date.parse(now),
    };
    expect(deriveProjectAttention(input).map((item) => item.kind)).toEqual([
      "approval",
      "interrupted",
      "provider",
    ]);
    expect(deriveProjectAttention(input).at(-1)?.destination).toEqual({
      kind: "provider",
      instanceId: providerId,
    });
    expect(
      deriveProjectAttention({ ...input, now: Date.parse(now) + 600_000 }).map((item) => item.kind),
    ).toEqual(["approval", "interrupted"]);
    expect(deriveProjectAttention({ ...input, ...scope() })).toEqual([]);
  });
  it("does not turn working sessions, arbitrary titles or settled work into attention", () => {
    expect(
      attention(
        snapshot({
          threads: [
            thread({ title: "FAILED! review rejected approval", session: session("running") }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("Project Home scope and Resume", () => {
  it("never cross-matches identical Project IDs, names or branches on two hosts", () => {
    const value = snapshot({ threads: [thread()], tasks: [task()], missions: [mission] });
    const input = { ...scope(value), environmentId: EnvironmentId.make("remote") };
    expect(selectProjectHomeScope(input).project).toBeNull();
    expect(
      deriveProjectResume({ ...input, filter: "All", now, autoSettleAfterDays: null }),
    ).toEqual([]);
    expect(
      attention(snapshot({ threads: [thread({ projectId: ProjectId.make("other") })] })),
    ).toEqual([]);
  });
  it("lists Task-associated Threads once in All, under Task in Tasks and Thread in Threads", () => {
    const input = {
      ...scope(
        snapshot({
          threads: [thread()],
          tasks: [task({ threadId: ThreadId.make("thread") })],
          missions: [mission],
        }),
      ),
      now,
      autoSettleAfterDays: null,
    };
    expect(deriveProjectResume({ ...input, filter: "All" }).map((item) => item.kind)).toEqual([
      "Mission",
      "Thread",
    ]);
    expect(deriveProjectResume({ ...input, filter: "Tasks" }).map((item) => item.kind)).toEqual([
      "Task",
    ]);
    expect(deriveProjectResume({ ...input, filter: "Threads" }).map((item) => item.kind)).toEqual([
      "Thread",
    ]);
  });
  it("excludes archived and settled, and shows snoozed only with a wake label in Threads", () => {
    const input = {
      ...scope(
        snapshot({
          threads: [
            thread({ id: ThreadId.make("archived"), archivedAt: now }),
            thread({ id: ThreadId.make("settled"), settledOverride: "settled", settledAt: now }),
            thread({ snoozedUntil: "2026-10-18T12:00:00.000Z", snoozedAt: now }),
          ],
        }),
      ),
      now,
      autoSettleAfterDays: null,
    };
    expect(deriveProjectResume({ ...input, filter: "All" })).toEqual([]);
    expect(deriveProjectResume({ ...input, filter: "Threads" })).toMatchObject([
      { id: "thread", status: "Snoozed · wakes in 1d" },
    ]);
  });
  it.each([
    ["starting", "Starting"],
    ["running", "Working"],
    ["ready", "Idle · session open"],
    ["stopped", null],
    ["idle", null],
  ] as const)("shows truthful %s presence", (status, label) => {
    expect(deriveAgentPresence(thread({ session: session(status) }))).toBe(label);
  });
  it("shows waiting, monitoring and unknown without inventing work", () => {
    expect(deriveAgentPresence(thread())).toBeNull();
    expect(
      deriveAgentPresence(thread({ hasPendingUserInput: true, session: session("ready") })),
    ).toBe("Waiting for you");
    expect(deriveAgentPresence(thread({ backgroundLiveness: "monitoring" }))).toBe("Monitoring");
  });
});
