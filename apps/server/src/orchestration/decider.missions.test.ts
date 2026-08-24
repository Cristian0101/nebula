import {
  ArchitectPlanProposalId,
  CommandId,
  EventId,
  MissionId,
  MissionRunId,
  ProjectId,
  ProviderInstanceId,
  ReplanProposalId,
  TaskId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type ArchitectPlanProposal,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-08-22T12:00:00.000Z";
const projectId = ProjectId.make("mission-project");
const otherProjectId = ProjectId.make("other-project");
const missionId = MissionId.make("mission-1");
const otherMissionId = MissionId.make("mission-2");
const taskA = TaskId.make("task-a");
const taskB = TaskId.make("task-b");
const taskC = TaskId.make("task-c");
const proposalId = ArchitectPlanProposalId.make("architect-plan-1");
const runId = MissionRunId.make("mission-run-1");
const replanProposalId = ReplanProposalId.make("replan-proposal-1");

const persistedEvent = (
  sequence: number,
  input: Omit<OrchestrationEvent, "sequence" | "eventId" | "commandId">,
): OrchestrationEvent =>
  ({
    ...input,
    sequence,
    eventId: EventId.make(`event-${sequence}`),
    commandId: CommandId.make(`seed-${sequence}`),
  }) as OrchestrationEvent;

const apply = Effect.fn("applyMissionTestCommand")(function* (
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ readModel: model, command });
  let next = model;
  for (const planned of Array.isArray(decided) ? decided : [decided]) {
    next = yield* projectEvent(next, { ...planned, sequence: next.snapshotSequence + 1 });
  }
  return next;
});

const createTask = (taskId: TaskId, project: ProjectId = projectId): OrchestrationCommand => ({
  type: "task.create",
  commandId: CommandId.make(`create-${taskId}`),
  taskId,
  projectId: project,
  title: `Task ${taskId}`,
  objective: `Complete ${taskId}`,
  role: "builder",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
  createdAt: now,
});

const seed = Effect.gen(function* () {
  let model = createEmptyReadModel(now);
  for (const [index, id] of [projectId, otherProjectId].entries()) {
    model = yield* projectEvent(
      model,
      persistedEvent(index + 1, {
        type: "project.created",
        aggregateKind: "project",
        aggregateId: id,
        occurredAt: now,
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          projectId: id,
          title: id,
          workspaceRoot: `/tmp/${id}`,
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
  }
  for (const taskId of [taskA, taskB, taskC]) {
    model = yield* apply(model, createTask(taskId));
    model = yield* apply(model, {
      type: "task.ownership.set",
      commandId: CommandId.make(`ownership-${taskId}`),
      taskId,
      rules: [
        {
          id: `write-${taskId}`,
          access: "write",
          pattern: `fixture/${taskId}/**`,
          reason: "Mission test fixture",
          createdAt: now,
        },
      ],
      createdAt: now,
    });
  }
  return model;
});

const createMission = (
  id = missionId,
  architectPlanProposalId?: ArchitectPlanProposalId,
): OrchestrationCommand => ({
  type: "mission.create",
  commandId: CommandId.make(`create-${id}`),
  missionId: id,
  projectId,
  title: `Mission ${id}`,
  objective: "Ship an explicit dependency plan.",
  description: null,
  ...(architectPlanProposalId ? { architectPlanProposalId } : {}),
  createdAt: now,
});

const approvedPlan: ArchitectPlanProposal = {
  id: proposalId,
  projectId,
  status: "approved",
  objective: "Ship an explicit dependency plan.",
  constraints: null,
  planningBaseCommit: "abc123",
  observedHeadCommit: "abc123",
  architectProviderInstanceId: ProviderInstanceId.make("codex"),
  architectModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
  contextFingerprint: "context",
  contextPaths: [],
  resourcePolicyFingerprint: "resources",
  proposal: {
    title: "Mission plan",
    objective: "Ship an explicit dependency plan.",
    tasks: [],
    dependencies: [],
    assumptions: [],
    risks: [],
    unresolvedQuestions: [],
  },
  validation: {
    status: "valid",
    errors: [],
    warnings: [],
    taskCount: 1,
    edgeCount: 0,
    waveCount: 1,
    validatedAt: now,
  },
  revisions: [],
  materializedMissionId: missionId,
  failureReason: null,
  createdAt: now,
  updatedAt: now,
  resolvedAt: now,
};

const addTask = (id: MissionId, taskId: TaskId): OrchestrationCommand => ({
  type: "mission.task.add",
  commandId: CommandId.make(`add-${id}-${taskId}`),
  missionId: id,
  projectId,
  taskId,
  createdAt: now,
});

const addDependency = (
  prerequisiteTaskId: TaskId,
  dependentTaskId: TaskId,
): Extract<OrchestrationCommand, { type: "mission.dependency.add" }> => ({
  type: "mission.dependency.add",
  commandId: CommandId.make(`edge-${prerequisiteTaskId}-${dependentTaskId}`),
  missionId,
  projectId,
  prerequisiteTaskId,
  dependentTaskId,
  createdAt: now,
});

it.layer(NodeServices.layer)("Mission decider", (it) => {
  it.effect("persists explicit membership and rejects cycles with the cycle path", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, createMission());
      for (const taskId of [taskA, taskB, taskC])
        model = yield* apply(model, addTask(missionId, taskId));
      model = yield* apply(model, addDependency(taskA, taskB));
      model = yield* apply(model, addDependency(taskB, taskC));

      const failure = yield* Effect.flip(
        decideOrchestrationCommand({ readModel: model, command: addDependency(taskC, taskA) }),
      );

      expect(failure.message).toContain("cycle");
      expect(failure.message).toContain("task-a");
      expect(model.missions?.[0]).toMatchObject({
        id: missionId,
        taskIds: [taskA, taskB, taskC],
        dependencies: [
          { prerequisiteTaskId: taskA, dependentTaskId: taskB },
          { prerequisiteTaskId: taskB, dependentTaskId: taskC },
        ],
      });
    }),
  );

  it.effect("enforces zero-or-one Mission membership and same-Project Tasks", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, createMission());
      model = yield* apply(model, createMission(otherMissionId));
      model = yield* apply(model, addTask(missionId, taskA));

      const duplicate = yield* Effect.flip(
        decideOrchestrationCommand({ readModel: model, command: addTask(otherMissionId, taskA) }),
      );
      expect(duplicate.message).toContain("already belongs");

      model = yield* apply(model, createTask(TaskId.make("foreign-task"), otherProjectId));
      const foreign = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: addTask(missionId, TaskId.make("foreign-task")),
        }),
      );
      expect(foreign.message).toContain("same Project");
    }),
  );

  it.effect(
    "blocks Task execution until the Mission is active and prerequisites are satisfied",
    () =>
      Effect.gen(function* () {
        let model = yield* seed;
        model = yield* apply(model, createMission());
        model = yield* apply(model, addTask(missionId, taskA));
        model = yield* apply(model, addTask(missionId, taskB));
        model = yield* apply(model, addDependency(taskA, taskB));

        const draftFailure = yield* Effect.flip(
          decideOrchestrationCommand({
            readModel: model,
            command: {
              type: "task.workspace.prepare",
              commandId: CommandId.make("prepare-draft-mission-task"),
              taskId: taskA,
              createdAt: now,
            },
          }),
        );
        expect(draftFailure.message).toContain("must be active");

        model = yield* apply(model, {
          type: "mission.activate",
          commandId: CommandId.make("activate-mission"),
          missionId,
          projectId,
          createdAt: now,
        });
        const dependencyFailure = yield* Effect.flip(
          decideOrchestrationCommand({
            readModel: model,
            command: {
              type: "task.workspace.prepare",
              commandId: CommandId.make("prepare-blocked-task"),
              taskId: taskB,
              createdAt: now,
            },
          }),
        );
        expect(dependencyFailure.message).toContain("Waiting for Task task-a");

        model = yield* apply(model, {
          type: "task.workspace.prepare",
          commandId: CommandId.make("prepare-root-task"),
          taskId: taskA,
          createdAt: now,
        });
        expect(model.tasks?.find((task) => task.id === taskA)?.workspace?.status).toBe("preparing");
      }),
  );

  it.effect("requires confirmation before mutating the active graph", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, createMission());
      model = yield* apply(model, addTask(missionId, taskA));
      model = yield* apply(model, addTask(missionId, taskB));
      model = yield* apply(model, {
        type: "mission.activate",
        commandId: CommandId.make("activate-before-edit"),
        missionId,
        projectId,
        createdAt: now,
      });

      const unconfirmed = yield* Effect.flip(
        decideOrchestrationCommand({ readModel: model, command: addDependency(taskA, taskB) }),
      );
      expect(unconfirmed.message).toContain("explicit confirmation");

      model = yield* apply(model, {
        ...addDependency(taskA, taskB),
        commandId: CommandId.make("confirmed-edge"),
        confirmActiveEdit: true,
      });
      expect(model.missions?.[0]?.dependencies).toHaveLength(1);
    }),
  );

  it.effect("starts, pauses, resumes, reconciles, and stops one durable supervised Run", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, createMission(missionId, proposalId));
      model = yield* apply(model, addTask(missionId, taskA));
      model = yield* apply(model, {
        type: "mission.activate",
        commandId: CommandId.make("activate-supervised"),
        missionId,
        projectId,
        createdAt: now,
      });
      model = {
        ...model,
        projects: model.projects.map((project) =>
          project.id === projectId ? { ...project, architectPlans: [approvedPlan] } : project,
        ),
      };
      model = yield* apply(model, {
        type: "mission.run.start",
        commandId: CommandId.make("start-run"),
        runId,
        missionId,
        projectId,
        maxConcurrentTasks: 2,
        createdAt: now,
      });
      expect(model.missionRuns).toEqual([
        expect.objectContaining({
          id: runId,
          mode: "supervised",
          status: "running",
          recoveryPolicy: {
            transportRetryLimit: 2,
            remediationLimit: 2,
            routingProfile: "manual_only",
          },
          taskRecovery: [],
          routingDecisions: [],
          coordinationRequests: [],
          replanProposals: [],
        }),
      ]);

      const duplicate = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "mission.run.start",
            commandId: CommandId.make("duplicate-run"),
            runId: MissionRunId.make("mission-run-2"),
            missionId,
            projectId,
            maxConcurrentTasks: 2,
            createdAt: now,
          },
        }),
      );
      expect(duplicate.message).toContain("already has an active supervised Run");

      model = yield* apply(model, {
        type: "mission.run.pause",
        commandId: CommandId.make("pause-run"),
        runId,
        createdAt: now,
      });
      expect(model.missionRuns?.[0]?.status).toBe("paused");
      model = yield* apply(model, {
        type: "mission.run.resume",
        commandId: CommandId.make("resume-run"),
        runId,
        createdAt: now,
      });
      expect(model.missionRuns?.[0]?.status).toBe("running");
      model = yield* apply(model, {
        type: "mission.run.reconcile",
        commandId: CommandId.make("reconcile-run"),
        runId,
        status: "attention",
        currentReadyTaskIds: [taskA],
        scheduledTaskIds: [],
        attention: [
          {
            taskId: taskA,
            code: "reviewer_unavailable",
            detail: "No independent Reviewer is ready.",
            blocksMission: false,
          },
        ],
        attentionReason: "No independent Reviewer is ready.",
        decision: null,
        completedAt: null,
        failureReason: null,
        createdAt: now,
      });
      expect(model.missionRuns?.[0]).toMatchObject({
        status: "attention",
        currentReadyTaskIds: [taskA],
        attentionReason: "No independent Reviewer is ready.",
      });

      const approvedMission = model.missions?.[0];
      model = yield* apply(model, {
        type: "mission.run.reconcile",
        commandId: CommandId.make("record-replan-proposal"),
        runId,
        status: "attention",
        currentReadyTaskIds: [taskA],
        scheduledTaskIds: [],
        attention: model.missionRuns?.[0]?.attention ?? [],
        attentionReason: "A Task-level repair needs human approval.",
        decision: null,
        completedAt: null,
        failureReason: null,
        replanProposals: [
          {
            id: replanProposalId,
            missionId,
            sourceTaskId: taskA,
            scope: "task_repair",
            affectedTaskIds: [taskA],
            summary: "Repair Task A without changing the approved graph.",
            rationale: "The current implementation is blocked.",
            preservedCompletedTaskIds: [],
            architectPlanProposalId: null,
            status: "pending",
            createdAt: now,
            resolvedAt: null,
          },
        ],
        createdAt: now,
      });
      model = yield* apply(model, {
        type: "mission.run.replan.resolve",
        commandId: CommandId.make("approve-replan-proposal"),
        runId,
        proposalId: replanProposalId,
        resolution: "approved",
        createdAt: now,
      });
      expect(model.missionRuns?.[0]?.replanProposals?.[0]?.status).toBe("approved");
      expect(model.missions?.[0]).toEqual(approvedMission);

      model = yield* apply(model, {
        type: "mission.run.stop",
        commandId: CommandId.make("stop-run"),
        runId,
        createdAt: now,
      });
      expect(model.missionRuns?.[0]?.status).toBe("stopped");
    }),
  );
});
