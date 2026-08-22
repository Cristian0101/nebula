import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-08-22T12:00:00.000Z";
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");
const taskId = TaskId.make("task-1");

const event = (input: {
  readonly sequence: number;
  readonly type: OrchestrationEvent["type"];
  readonly aggregateKind: OrchestrationEvent["aggregateKind"];
  readonly aggregateId: OrchestrationEvent["aggregateId"];
  readonly payload: unknown;
}): OrchestrationEvent =>
  ({
    sequence: input.sequence,
    eventId: EventId.make(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    occurredAt: now,
    commandId: CommandId.make(`seed-${input.sequence}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload,
  }) as OrchestrationEvent;

const seedReadModel = Effect.gen(function* () {
  let model = createEmptyReadModel(now);
  for (const [sequence, projectId] of [projectA, projectB].entries()) {
    model = yield* projectEvent(
      model,
      event({
        sequence: sequence + 1,
        type: "project.created",
        aggregateKind: "project",
        aggregateId: projectId,
        payload: {
          projectId,
          title: projectId,
          workspaceRoot: `/tmp/${projectId}`,
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
  }
  const threads: ReadonlyArray<readonly [ThreadId, ProjectId]> = [
    [threadA, projectA],
    [threadB, projectB],
  ];
  for (const [offset, [threadId, projectId]] of threads.entries()) {
    model = yield* projectEvent(
      model,
      event({
        sequence: offset + 3,
        type: "thread.created",
        aggregateKind: "thread",
        aggregateId: threadId,
        payload: {
          threadId,
          projectId,
          title: threadId,
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
  }
  return model;
});

const applyCommand = Effect.fn("applyTaskTestCommand")(function* (
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const result = yield* decideOrchestrationCommand({ command, readModel: model });
  let next = model;
  for (const planned of Array.isArray(result) ? result : [result]) {
    next = yield* projectEvent(next, {
      ...planned,
      sequence: next.snapshotSequence + 1,
    });
  }
  return next;
});

it.layer(NodeServices.layer)("Nebula Task decider", (it) => {
  it.effect("creates, binds, activates, and explicitly completes a durable Task", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      model = yield* applyCommand(model, {
        type: "task.create",
        commandId: CommandId.make("create-task"),
        taskId,
        projectId: projectA,
        title: "Persistent task",
        objective: "Prove the Task lifecycle.",
        role: "builder",
        createdAt: now,
      });
      expect(model.tasks?.[0]?.status).toBe("draft");

      model = yield* applyCommand(model, {
        type: "task.bind-thread",
        commandId: CommandId.make("bind-task"),
        taskId,
        threadId: threadA,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.activate",
        commandId: CommandId.make("activate-task"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({ status: "active", threadId: threadA });

      model = yield* applyCommand(model, {
        type: "task.complete",
        commandId: CommandId.make("complete-task"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]?.status).toBe("completed");

      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.activate",
            commandId: CommandId.make("reactivate-task"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(failure.message).toContain("must be draft");
    }),
  );

  it.effect("rejects a Thread from another Project and permits draft cancellation", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      model = yield* applyCommand(model, {
        type: "task.create",
        commandId: CommandId.make("create-task-foreign"),
        taskId,
        projectId: projectA,
        title: "Scoped task",
        objective: "Stay inside one project.",
        role: "builder",
        createdAt: now,
      });

      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.bind-thread",
            commandId: CommandId.make("bind-foreign"),
            taskId,
            threadId: threadB,
            createdAt: now,
          },
        }),
      );
      expect(failure.message).toContain("not an active thread in Task project");

      model = yield* applyCommand(model, {
        type: "task.cancel",
        commandId: CommandId.make("cancel-task"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]?.status).toBe("cancelled");
      expect(model.tasks?.[0]?.threadId).toBeNull();
    }),
  );

  it.effect("rejects duplicate Task IDs and binding one Thread to multiple Tasks", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      const create = (id: TaskId, commandId: string): OrchestrationCommand => ({
        type: "task.create",
        commandId: CommandId.make(commandId),
        taskId: id,
        projectId: projectA,
        title: `Task ${id}`,
        objective: "Keep Task and Thread identity unambiguous.",
        role: "builder",
        createdAt: now,
      });
      model = yield* applyCommand(model, create(taskId, "create-task-once"));

      const duplicateFailure = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: create(taskId, "create-task-twice"),
        }),
      );
      expect(duplicateFailure.message).toContain("already exists");

      model = yield* applyCommand(model, {
        type: "task.bind-thread",
        commandId: CommandId.make("bind-first-task"),
        taskId,
        threadId: threadA,
        createdAt: now,
      });
      const secondTaskId = TaskId.make("task-2");
      model = yield* applyCommand(model, create(secondTaskId, "create-second-task"));
      const bindingFailure = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.bind-thread",
            commandId: CommandId.make("bind-second-task"),
            taskId: secondTaskId,
            threadId: threadA,
            createdAt: now,
          },
        }),
      );
      expect(bindingFailure.message).toContain("already bound");
    }),
  );

  it.effect("permits active cancellation without deleting its Thread", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      model = yield* applyCommand(model, {
        type: "task.create",
        commandId: CommandId.make("create-active-cancel"),
        taskId,
        projectId: projectA,
        title: "Cancellable active task",
        objective: "Keep inherited execution history intact.",
        role: "builder",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.bind-thread",
        commandId: CommandId.make("bind-active-cancel"),
        taskId,
        threadId: threadA,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.activate",
        commandId: CommandId.make("activate-before-cancel"),
        taskId,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.cancel",
        commandId: CommandId.make("cancel-active-task"),
        taskId,
        createdAt: now,
      });

      expect(model.tasks?.[0]).toMatchObject({ status: "cancelled", threadId: threadA });
      expect(
        model.threads.some((thread) => thread.id === threadA && thread.deletedAt === null),
      ).toBe(true);
    }),
  );
});
