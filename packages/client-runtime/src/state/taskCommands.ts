import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  activateTask,
  bindTaskThread,
  cancelTask,
  completeTask,
  createTask,
  type ActivateTaskInput,
  type BindTaskThreadInput,
  type CancelTaskInput,
  type CompleteTaskInput,
  type CreateTaskInput,
} from "../operations/commands.ts";
import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";

export type {
  ActivateTaskInput,
  BindTaskThreadInput,
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
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
  };
}
