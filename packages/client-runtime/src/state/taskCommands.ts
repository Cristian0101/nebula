import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  activateTask,
  bindTaskThread,
  cancelTask,
  completeTask,
  createTask,
  prepareTaskWorkspace,
  removeTaskWorkspace,
  setTaskOwnership,
  validateTaskOwnership,
  prepareTaskReview,
  updateTaskHandoff,
  requestTaskRestore,
  undoTaskRestore,
  type ActivateTaskInput,
  type BindTaskThreadInput,
  type CancelTaskInput,
  type CompleteTaskInput,
  type CreateTaskInput,
  type PrepareTaskWorkspaceInput,
  type RemoveTaskWorkspaceInput,
  type SetTaskOwnershipInput,
  type ValidateTaskOwnershipInput,
  type PrepareTaskReviewInput,
  type UpdateTaskHandoffInput,
  type RequestTaskRestoreInput,
  type UndoTaskRestoreInput,
} from "../operations/commands.ts";
import { ORCHESTRATION_WS_METHODS } from "@t3tools/contracts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

export type {
  ActivateTaskInput,
  BindTaskThreadInput,
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
  PrepareTaskWorkspaceInput,
  RemoveTaskWorkspaceInput,
  SetTaskOwnershipInput,
  ValidateTaskOwnershipInput,
  PrepareTaskReviewInput,
  UpdateTaskHandoffInput,
  RequestTaskRestoreInput,
  UndoTaskRestoreInput,
};

export function createTaskEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { taskId: string } }) =>
      JSON.stringify([environmentId, input.taskId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:create",
      execute: createTask,
      scheduler,
      concurrency,
    }),
    bindThread: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:bind-thread",
      execute: bindTaskThread,
      scheduler,
      concurrency,
    }),
    activate: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:activate",
      execute: activateTask,
      scheduler,
      concurrency,
    }),
    complete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:complete",
      execute: completeTask,
      scheduler,
      concurrency,
    }),
    cancel: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:cancel",
      execute: cancelTask,
      scheduler,
      concurrency,
    }),
    prepareWorkspace: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:workspace:prepare",
      execute: prepareTaskWorkspace,
      scheduler,
      concurrency,
    }),
    removeWorkspace: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:workspace:remove",
      execute: removeTaskWorkspace,
      scheduler,
      concurrency,
    }),
    setOwnership: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:ownership:set",
      execute: setTaskOwnership,
      scheduler,
      concurrency,
    }),
    validateOwnership: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:ownership:validate",
      execute: validateTaskOwnership,
      scheduler,
      concurrency,
    }),
    prepareReview: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:review:prepare",
      execute: prepareTaskReview,
      scheduler,
      concurrency,
    }),
    updateHandoff: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:handoff:update",
      execute: updateTaskHandoff,
      scheduler,
      concurrency,
    }),
    requestRestore: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:restore:request",
      execute: requestTaskRestore,
      scheduler,
      concurrency,
    }),
    undoRestore: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:task:restore:undo",
      execute: undoTaskRestore,
      scheduler,
      concurrency,
    }),
    changes: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:queries:task:changes",
      tag: ORCHESTRATION_WS_METHODS.getTaskChanges,
    }),
    fileDiff: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:queries:task:file-diff",
      tag: ORCHESTRATION_WS_METHODS.getTaskFileDiff,
    }),
  };
}
