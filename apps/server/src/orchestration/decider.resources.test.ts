import {
  CommandId,
  EventId,
  OwnershipRequestId,
  ProjectId,
  ProviderInstanceId,
  SharedResourceId,
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

const now = "2026-08-23T12:00:00.000Z";
const projectId = ProjectId.make("resource-project");
const resourceId = SharedResourceId.make("package-json");
const secondResourceId = SharedResourceId.make("lockfile");
const taskA = TaskId.make("task-a");
const taskB = TaskId.make("task-b");

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

const apply = Effect.fn("applyResourceTestCommand")(function* (
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ readModel: model, command });
  let next = model;
  for (const planned of Array.isArray(decided) ? decided : [decided])
    next = yield* projectEvent(next, { ...planned, sequence: next.snapshotSequence + 1 });
  return next;
});

const seed = Effect.gen(function* () {
  let model = createEmptyReadModel(now);
  model = yield* projectEvent(
    model,
    persistedEvent(1, {
      type: "project.created",
      aggregateKind: "project",
      aggregateId: projectId,
      occurredAt: now,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      payload: {
        projectId,
        title: "Resource test",
        workspaceRoot: "/tmp/resource-test",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
  for (const [index, taskId] of [taskA, taskB].entries()) {
    const threadId = ThreadId.make(`thread-${taskId}`);
    model = yield* apply(model, {
      type: "task.create",
      commandId: CommandId.make(`create-${taskId}`),
      taskId,
      projectId,
      title: `Task ${taskId}`,
      objective: "Coordinate a shared file",
      role: "reviewer",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
      createdAt: now,
    });
    model = yield* apply(model, {
      type: "thread.create",
      commandId: CommandId.make(`create-thread-${index}`),
      threadId,
      projectId,
      title: `Thread ${index}`,
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: now,
    });
    model = yield* apply(model, {
      type: "task.bind-thread",
      commandId: CommandId.make(`bind-${index}`),
      taskId,
      threadId,
      createdAt: now,
    });
  }
  for (const [id, name, patterns] of [
    [resourceId, "package.json", ["package.json"]],
    [secondResourceId, "lockfile", ["pnpm-lock.yaml"]],
  ] as const)
    model = yield* apply(model, {
      type: "project.shared-resource.create",
      commandId: CommandId.make(`resource-${id}`),
      projectId,
      resourceId: id,
      name,
      patterns,
      createdAt: now,
    });
  for (const taskId of [taskA, taskB])
    model = yield* apply(model, {
      type: "task.resource-requirements.set",
      commandId: CommandId.make(`requirements-${taskId}`),
      taskId,
      resourceIds: [resourceId],
      createdAt: now,
    });
  return model;
});

const activate = (taskId: TaskId): OrchestrationCommand => ({
  type: "task.activate",
  commandId: CommandId.make(`activate-${taskId}`),
  taskId,
  createdAt: now,
});

it.layer(NodeServices.layer)("shared resource coordination decider", (it) => {
  it.effect("serializes contention and releases the immutable lease on cancellation", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, activate(taskA));
      const held = model.projects[0]?.resourceLeases?.find((lease) => lease.status === "held");
      expect(held).toMatchObject({ taskId: taskA, resourceId });

      const blocked = yield* Effect.flip(
        decideOrchestrationCommand({ readModel: model, command: activate(taskB) }),
      );
      expect(blocked.message).toContain("Waiting for resource 'package.json'");
      expect(blocked.message).toContain("task-a");

      model = yield* apply(model, {
        type: "task.cancel",
        commandId: CommandId.make("cancel-a"),
        taskId: taskA,
        createdAt: now,
      });
      expect(model.projects[0]?.resourceLeases?.[0]).toMatchObject({
        status: "released",
        taskId: taskA,
      });
      model = yield* apply(model, activate(taskB));
      expect((model.tasks ?? []).find((task) => task.id === taskB)?.status).toBe("active");
    }),
  );

  it.effect("acquires a multi-resource requirement atomically and never partially", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, {
        type: "task.resource-requirements.set",
        commandId: CommandId.make("task-b-require-both"),
        taskId: taskB,
        resourceIds: [resourceId, secondResourceId],
        createdAt: now,
      });
      model = yield* apply(model, activate(taskA));

      const failed = yield* Effect.flip(
        decideOrchestrationCommand({ readModel: model, command: activate(taskB) }),
      );
      expect(failed.message).toContain("Waiting for resource");
      expect(
        model.projects[0]?.resourceLeases?.filter((lease) => lease.taskId === taskB),
      ).toHaveLength(0);
    }),
  );

  it.effect("keeps ownership expansion pending until a human resolution and records history", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      const requestId = OwnershipRequestId.make("request-package-json");
      model = yield* apply(model, {
        type: "task.ownership-request.create",
        commandId: CommandId.make("request-create"),
        taskId: taskA,
        requestId,
        requestedRules: [
          {
            id: "package-write",
            access: "write",
            pattern: "package.json",
            reason: "The dependency metadata must change",
            createdAt: now,
          },
        ],
        reason: "Required to add a dependency",
        source: "violation",
        createdAt: now,
      });
      expect(
        (model.tasks ?? []).find((task) => task.id === taskA)?.ownershipRequests?.[0]?.status,
      ).toBe("pending");
      model = yield* apply(model, {
        type: "task.ownership-request.approve",
        commandId: CommandId.make("request-approve"),
        taskId: taskA,
        requestId,
        createdAt: now,
      });
      const task = (model.tasks ?? []).find((candidate) => candidate.id === taskA);
      expect(task?.ownershipRequests?.[0]?.status).toBe("approved");
      expect(task?.ownership?.rules.some((rule) => rule.pattern === "package.json")).toBe(true);
      expect(task?.requiredResourceIds).toContain(resourceId);
    }),
  );

  it.effect("repairs held leases left behind for a terminal Task", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, activate(taskA));
      model = yield* apply(model, {
        type: "task.cancel",
        commandId: CommandId.make("cancel-before-reconcile"),
        taskId: taskA,
        createdAt: now,
      });
      model = {
        ...model,
        projects: model.projects.map((project) => ({
          ...project,
          resourceLeases: (project.resourceLeases ?? []).map((lease) =>
            lease.taskId === taskA
              ? { ...lease, status: "held" as const, releasedAt: null }
              : lease,
          ),
        })),
      };
      model = yield* apply(model, {
        type: "project.resource-leases.reconcile",
        commandId: CommandId.make("reconcile-terminal-leases"),
        projectId,
        createdAt: now,
      });
      expect(model.projects[0]?.resourceLeases?.[0]).toMatchObject({
        status: "released",
        taskId: taskA,
      });
    }),
  );

  it.effect(
    "releases a missing-owner lease after restart but preserves a legitimate active holder",
    () =>
      Effect.gen(function* () {
        let model = yield* seed;
        model = yield* apply(model, activate(taskA));
        const activeReconcile = yield* Effect.flip(
          decideOrchestrationCommand({
            readModel: model,
            command: {
              type: "project.resource-leases.reconcile",
              commandId: CommandId.make("reconcile-active-holder"),
              projectId,
              createdAt: now,
            },
          }),
        );
        expect(activeReconcile.message).toContain("no stale Task leases");
        expect(model.projects[0]?.resourceLeases?.[0]).toMatchObject({
          status: "held",
          taskId: taskA,
        });

        model = { ...model, tasks: (model.tasks ?? []).filter((task) => task.id !== taskA) };
        model = yield* apply(model, {
          type: "project.resource-leases.reconcile",
          commandId: CommandId.make("reconcile-missing-holder"),
          projectId,
          createdAt: now,
        });
        expect(model.projects[0]?.resourceLeases?.[0]).toMatchObject({
          status: "released",
          taskId: taskA,
        });
        model = yield* apply(model, activate(taskB));
        expect(
          model.projects[0]?.resourceLeases?.filter((lease) => lease.status === "held"),
        ).toEqual([expect.objectContaining({ taskId: taskB, resourceId })]);
      }),
  );

  it.effect("allows Tasks requiring independent resources to remain active together", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = yield* apply(model, {
        type: "task.resource-requirements.set",
        commandId: CommandId.make("task-b-use-lockfile"),
        taskId: taskB,
        resourceIds: [secondResourceId],
        createdAt: now,
      });
      model = yield* apply(model, activate(taskA));
      model = yield* apply(model, activate(taskB));
      expect((model.tasks ?? []).filter((task) => task.status === "active")).toHaveLength(2);
      expect(
        model.projects[0]?.resourceLeases?.filter((lease) => lease.status === "held"),
      ).toHaveLength(2);
    }),
  );

  it.effect("records denied and cancelled ownership requests without changing ownership", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      for (const status of ["deny", "cancel"] as const) {
        const requestId = OwnershipRequestId.make(`request-${status}`);
        model = yield* apply(model, {
          type: "task.ownership-request.create",
          commandId: CommandId.make(`request-${status}-create`),
          taskId: taskA,
          requestId,
          requestedRules: [
            {
              id: `rule-${status}`,
              access: "write",
              pattern: `${status}.txt`,
              reason: `Test ${status}`,
              createdAt: now,
            },
          ],
          reason: `Test ${status} history`,
          source: "human",
          createdAt: now,
        });
        model = yield* apply(model, {
          type: status === "deny" ? "task.ownership-request.deny" : "task.ownership-request.cancel",
          commandId: CommandId.make(`request-${status}-resolve`),
          taskId: taskA,
          requestId,
          resolutionNote: `${status} recorded`,
          createdAt: now,
        });
      }
      const task = (model.tasks ?? []).find((candidate) => candidate.id === taskA);
      expect(task?.ownershipRequests?.map((request) => request.status)).toEqual([
        "denied",
        "cancelled",
      ]);
      expect(task?.ownership?.rules ?? []).toHaveLength(0);
    }),
  );

  it.effect("blocks progression on a resource violation and allows a fresh valid result", () =>
    Effect.gen(function* () {
      let model = yield* seed;
      model = {
        ...model,
        tasks: (model.tasks ?? []).map((task) =>
          task.id === taskA
            ? {
                ...task,
                status: "active" as const,
                ownership: {
                  required: true,
                  rules: [],
                  status: "pending" as const,
                  validatedAt: null,
                  changedPathCount: 0,
                  violations: [],
                  errorReason: null,
                  updatedAt: now,
                },
              }
            : task,
        ),
      };
      const command = {
        type: "task.ownership.validated" as const,
        commandId: CommandId.make("resource-compliance-result"),
        taskId: taskA,
        changedPathCount: 1,
        violations: [],
        requestCompletion: true,
        createdAt: now,
      };
      const blocked = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          ...command,
          resourceViolations: [{ path: "package.json", resourceId, resourceName: "package.json" }],
        },
      });
      expect("type" in blocked ? [blocked.type] : blocked.map((event) => event.type)).not.toContain(
        "task.completion.freshness-requested",
      );
      const allowed = yield* decideOrchestrationCommand({
        readModel: model,
        command: {
          ...command,
          commandId: CommandId.make("resource-compliance-valid"),
          resourceViolations: [],
        },
      });
      expect("type" in allowed ? [allowed.type] : allowed.map((event) => event.type)).toContain(
        "task.completion.freshness-requested",
      );
    }),
  );
});
