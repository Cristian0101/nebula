import {
  CommandId,
  CheckpointRef,
  EventId,
  ProjectId,
  ProviderInstanceId,
  TaskId,
  TaskHandoffId,
  TaskRestoreId,
  TaskReviewSnapshotId,
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
        role: "reviewer",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "draft",
        modelSelection: { instanceId: "codex", model: "test" },
      });

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
        role: "reviewer",
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
        role: "reviewer",
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
        role: "reviewer",
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

  it.effect("requires a ready workspace and exact Thread binding for Builder Tasks", () =>
    Effect.gen(function* () {
      let model = yield* seedReadModel;
      model = yield* applyCommand(model, {
        type: "task.create",
        commandId: CommandId.make("create-isolated-builder"),
        taskId,
        projectId: projectA,
        title: "Isolated builder",
        objective: "Write only inside a dedicated worktree.",
        role: "builder",
        reviewRequired: false,
        createdAt: now,
      });

      const premature = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.bind-thread",
            commandId: CommandId.make("premature-bind"),
            taskId,
            threadId: threadA,
            createdAt: now,
          },
        }),
      );
      expect(premature.message).toContain("explicit write ownership");

      model = yield* applyCommand(model, {
        type: "task.ownership.set",
        commandId: CommandId.make("set-builder-ownership"),
        taskId,
        rules: [
          {
            id: "frontend",
            access: "write",
            pattern: "apps/web/src/**",
            reason: null,
            createdAt: now,
          },
        ],
        createdAt: now,
      });

      model = yield* applyCommand(model, {
        type: "task.workspace.prepare",
        commandId: CommandId.make("prepare-workspace"),
        taskId,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.workspace.preparation-started",
        commandId: CommandId.make("record-baseline"),
        taskId,
        sourceRepository: "/tmp/project-a",
        baseCommit: "0123456789abcdef",
        branch: "nebula/manual/task1-isolated-builder",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.workspace.ready",
        commandId: CommandId.make("workspace-ready"),
        taskId,
        sourceRepository: "/tmp/project-a",
        baseCommit: "0123456789abcdef",
        branch: "nebula/manual/task1-isolated-builder",
        path: "/tmp/worktrees/task-1",
        createdAt: now,
      });
      expect(model.tasks?.[0]?.workspace).toMatchObject({
        status: "ready",
        baseCommit: "0123456789abcdef",
      });

      const isolatedThread = ThreadId.make("isolated-thread");
      model = yield* applyCommand(model, {
        type: "thread.create",
        commandId: CommandId.make("create-isolated-thread"),
        threadId: isolatedThread,
        projectId: projectA,
        title: "Isolated builder",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "nebula/manual/task1-isolated-builder",
        worktreePath: "/tmp/worktrees/task-1",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.bind-thread",
        commandId: CommandId.make("bind-isolated"),
        taskId,
        threadId: isolatedThread,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.activate",
        commandId: CommandId.make("activate-isolated"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "active",
        threadId: isolatedThread,
        workspace: { path: "/tmp/worktrees/task-1" },
      });

      const replacementThread = ThreadId.make("replacement-thread");
      model = yield* applyCommand(model, {
        type: "thread.create",
        commandId: CommandId.make("create-replacement-thread"),
        threadId: replacementThread,
        projectId: projectA,
        title: "Replacement builder",
        modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "test" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "nebula/manual/task1-isolated-builder",
        worktreePath: "/tmp/worktrees/task-1",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.bind-thread",
        commandId: CommandId.make("replace-isolated-provider"),
        taskId,
        threadId: replacementThread,
        replaceProviderExecution: true,
        modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "test" },
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        id: taskId,
        status: "active",
        threadId: replacementThread,
        workspace: { path: "/tmp/worktrees/task-1" },
      });

      const snapshotId = TaskReviewSnapshotId.make("snapshot-isolated");
      model = yield* applyCommand(model, {
        type: "task.review.prepare",
        commandId: CommandId.make("prepare-isolated-review"),
        taskId,
        generation: "manual",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.ownership.validated",
        commandId: CommandId.make("validate-isolated-review"),
        taskId,
        changedPathCount: 1,
        violations: [],
        requestCompletion: false,
        requestReview: true,
        generation: "manual",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.review.prepared",
        commandId: CommandId.make("capture-isolated-review"),
        taskId,
        snapshot: {
          id: snapshotId,
          taskId,
          baseCommit: "0123456789abcdef",
          checkpointRef: CheckpointRef.make("refs/t3/checkpoints/tasks/task-1/review/snapshot"),
          fingerprint: "tree-1",
          branchHead: "head-1",
          changedFiles: 1,
          additions: 4,
          deletions: 1,
          ownershipStatus: "valid",
          status: "current",
          capturedAt: now,
        },
        handoff: {
          id: TaskHandoffId.make("handoff-isolated"),
          taskId,
          snapshotId,
          status: "draft",
          summary: "Implemented the isolated change.",
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
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.handoff.update",
        commandId: CommandId.make("ready-isolated-handoff"),
        taskId,
        snapshotId,
        status: "ready",
        summary: "Implemented the isolated change.",
        testsRun: [],
        assumptions: [],
        interfaceChanges: [],
        migrations: [],
        knownRisks: [],
        followUps: [],
        createdAt: now,
      });

      const activeCleanupFailure = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.workspace.remove",
            commandId: CommandId.make("remove-active-workspace"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(activeCleanupFailure.message).toContain("terminal Task");

      model = yield* applyCommand(model, {
        type: "task.complete",
        commandId: CommandId.make("complete-isolated"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "active",
        ownership: { status: "pending" },
      });
      model = yield* applyCommand(model, {
        type: "task.ownership.validated",
        commandId: CommandId.make("complete-isolated-after-validation"),
        taskId,
        changedPathCount: 1,
        violations: [],
        requestCompletion: true,
        createdAt: now,
      });
      expect(model.tasks?.[0]?.status).toBe("active");
      model = yield* applyCommand(model, {
        type: "task.completion.freshness-validated",
        commandId: CommandId.make("fresh-isolated-review"),
        taskId,
        current: true,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "completed",
        result: {
          taskId,
          status: "completed",
          summary: "Implemented the isolated change.",
          providerInstanceId: "antigravity",
          threadId: replacementThread,
          branch: "nebula/manual/task1-isolated-builder",
        },
      });
      model = yield* applyCommand(model, {
        type: "task.workspace.remove",
        commandId: CommandId.make("remove-isolated-workspace"),
        taskId,
        createdAt: now,
      });
      expect(model.tasks?.[0]?.workspace?.status).toBe("removing");
      model = yield* applyCommand(model, {
        type: "task.workspace.cleanup-failed",
        commandId: CommandId.make("dirty-workspace-retained"),
        taskId,
        failureCode: "dirty-workspace",
        failureReason: "Workspace has uncommitted changes.",
        createdAt: now,
      });
      expect(model.tasks?.[0]?.workspace).toMatchObject({
        status: "ready",
        failureCode: "dirty-workspace",
      });
    }),
  );

  it.effect("blocks completion on violations and permits explicit scope expansion", () =>
    Effect.gen(function* () {
      const seeded = yield* seedReadModel;
      let model: OrchestrationReadModel = {
        ...seeded,
        tasks: [
          {
            id: taskId,
            projectId: projectA,
            title: "Owned builder",
            objective: "Stay inside declared paths.",
            role: "builder",
            status: "active",
            threadId: threadA,
            createdAt: now,
            updatedAt: now,
            activatedAt: now,
            completedAt: null,
            cancelledAt: null,
            workspace: {
              status: "ready",
              sourceRepository: "/tmp/project-a",
              baseCommit: "0123456789abcdef",
              branch: "nebula/manual/task-1",
              path: "/tmp/worktrees/task-1",
              createdAt: now,
              removedAt: null,
              failureCode: null,
              failureReason: null,
              updatedAt: now,
            },
            ownership: {
              required: true,
              rules: [
                {
                  id: "frontend",
                  access: "write",
                  pattern: "src/frontend/**",
                  reason: null,
                  createdAt: now,
                },
              ],
              status: "valid",
              validatedAt: now,
              changedPathCount: 1,
              violations: [],
              errorReason: null,
              updatedAt: now,
            },
            reviewSnapshot: {
              id: TaskReviewSnapshotId.make("owned-snapshot"),
              taskId,
              baseCommit: "0123456789abcdef",
              checkpointRef: CheckpointRef.make("refs/t3/checkpoints/tasks/task-1/review/owned"),
              fingerprint: "owned-tree",
              branchHead: "owned-head",
              changedFiles: 1,
              additions: 1,
              deletions: 0,
              ownershipStatus: "valid",
              status: "current",
              capturedAt: now,
            },
            handoff: {
              id: TaskHandoffId.make("owned-handoff"),
              taskId,
              snapshotId: TaskReviewSnapshotId.make("owned-snapshot"),
              status: "ready",
              summary: "Owned implementation",
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
          },
        ],
      };

      model = yield* applyCommand(model, {
        type: "task.complete",
        commandId: CommandId.make("request-owned-completion"),
        taskId,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.ownership.validated",
        commandId: CommandId.make("reject-owned-completion"),
        taskId,
        changedPathCount: 2,
        violations: [
          {
            path: "src/backend/nope.ts",
            changeType: "untracked",
            reason: "unclassified",
            matchedRules: [],
          },
        ],
        requestCompletion: true,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "active",
        ownership: { status: "violation", changedPathCount: 2 },
      });

      model = yield* applyCommand(model, {
        type: "task.ownership.set",
        commandId: CommandId.make("expand-owned-scope"),
        taskId,
        rules: [
          {
            id: "all-src",
            access: "write",
            pattern: "src/**",
            reason: "Explicit dependency expansion",
            createdAt: now,
          },
        ],
        createdAt: now,
      });
      expect(model.tasks?.[0]?.ownership).toMatchObject({ status: "pending" });
      model = yield* applyCommand(model, {
        type: "task.ownership.validated",
        commandId: CommandId.make("scope-expansion-valid"),
        taskId,
        changedPathCount: 2,
        violations: [],
        requestCompletion: false,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "active",
        ownership: { status: "valid", violations: [] },
      });
    }),
  );

  it.effect("blocks stale completion and preserves recoverable restore state", () =>
    Effect.gen(function* () {
      const seeded = yield* seedReadModel;
      const snapshotId = TaskReviewSnapshotId.make("review-snapshot");
      const restoreId = TaskRestoreId.make("restore-1");
      let model: OrchestrationReadModel = {
        ...seeded,
        tasks: [
          {
            id: taskId,
            projectId: projectA,
            title: "Reviewable task",
            objective: "Exercise completion and restore gates.",
            role: "builder",
            status: "active",
            threadId: threadA,
            createdAt: now,
            updatedAt: now,
            activatedAt: now,
            completedAt: null,
            cancelledAt: null,
            workspace: {
              status: "ready",
              sourceRepository: "/tmp/project-a",
              baseCommit: "base-commit",
              branch: "nebula/manual/reviewable-task",
              path: "/tmp/task-reviewable",
              createdAt: now,
              removedAt: null,
              failureCode: null,
              failureReason: null,
              updatedAt: now,
            },
            ownership: {
              required: true,
              rules: [
                {
                  id: "all",
                  access: "write",
                  pattern: "src/**",
                  reason: null,
                  createdAt: now,
                },
              ],
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
              baseCommit: "base-commit",
              checkpointRef: CheckpointRef.make("refs/t3/checkpoints/tasks/task-1/review/current"),
              fingerprint: "tree-current",
              branchHead: "head-current",
              changedFiles: 1,
              additions: 2,
              deletions: 0,
              files: [
                {
                  path: "src/change.ts",
                  previousPath: null,
                  changeType: "modified",
                  additions: 2,
                  deletions: 0,
                  binary: false,
                  untracked: false,
                },
              ],
              ownershipStatus: "valid",
              status: "stale",
              capturedAt: now,
            },
            handoff: {
              id: TaskHandoffId.make("handoff-reviewable"),
              taskId,
              snapshotId,
              status: "stale",
              summary: "Reviewed work",
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
          },
        ],
      };

      const staleCompletion = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: model,
          command: {
            type: "task.complete",
            commandId: CommandId.make("complete-stale"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(staleCompletion.message).toContain("current review snapshot");

      const missingHandoff = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: {
            ...model,
            tasks: model.tasks?.map((task) => ({
              ...task,
              reviewSnapshot: task.reviewSnapshot
                ? { ...task.reviewSnapshot, status: "current" as const }
                : null,
              handoff: null,
            })),
          },
          command: {
            type: "task.complete",
            commandId: CommandId.make("complete-missing-handoff"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(missingHandoff.message).toContain("ready handoff");

      const missingWorkspace = yield* Effect.flip(
        decideOrchestrationCommand({
          readModel: {
            ...model,
            tasks: model.tasks?.map((task) => ({ ...task, workspace: null })),
          },
          command: {
            type: "task.complete",
            commandId: CommandId.make("complete-missing-workspace"),
            taskId,
            createdAt: now,
          },
        }),
      );
      expect(missingWorkspace.message).toContain("ready managed workspace");

      model = yield* applyCommand(model, {
        type: "task.restore.request",
        commandId: CommandId.make("request-restore"),
        taskId,
        restoreId,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.restore.snapshot-captured",
        commandId: CommandId.make("capture-restore"),
        taskId,
        restoreId,
        safetyCheckpointRef: CheckpointRef.make(
          "refs/t3/checkpoints/tasks/task-1/restore/restore-1",
        ),
        previousHead: "head-current",
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.restored",
        commandId: CommandId.make("finish-restore"),
        taskId,
        restoreId,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({
        status: "active",
        restore: { status: "completed", previousHead: "head-current" },
        reviewSnapshot: { status: "stale" },
        handoff: { status: "stale" },
      });

      model = yield* applyCommand(model, {
        type: "task.restore.undo",
        commandId: CommandId.make("request-undo"),
        taskId,
        createdAt: now,
      });
      model = yield* applyCommand(model, {
        type: "task.restore.undone",
        commandId: CommandId.make("finish-undo"),
        taskId,
        restoreId,
        createdAt: now,
      });
      expect(model.tasks?.[0]).toMatchObject({ status: "active", restore: { status: "undone" } });
    }),
  );
});
