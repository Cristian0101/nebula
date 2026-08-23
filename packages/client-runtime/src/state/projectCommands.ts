import {
  type EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  type ProjectReadFileResult,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";
import {
  type CreateProjectInput,
  type DeleteProjectInput,
  type UpdateProjectInput,
  type UpdateProjectQualityPolicyInput,
  type UpdateProjectReviewPolicyInput,
  createProject,
  deleteProject,
  updateProject,
  updateProjectQualityPolicy,
  updateProjectReviewPolicy,
  createIntegration,
  continueIntegration,
  abortIntegration,
  validateIntegration,
  removeIntegrationWorkspace,
} from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export type {
  CreateProjectInput,
  DeleteProjectInput,
  UpdateProjectInput,
  UpdateProjectQualityPolicyInput,
  UpdateProjectReviewPolicyInput,
  CreateIntegrationInput,
  ContinueIntegrationInput,
  AbortIntegrationInput,
  ValidateIntegrationInput,
  RemoveIntegrationWorkspaceInput,
} from "../operations/commands.ts";

export interface OptimisticProjectFile {
  readonly data: ProjectReadFileResult;
  readonly confirmedAgainst: object | null | undefined;
}

export interface OptimisticProjectFileTarget {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

function optimisticProjectFileKey(target: OptimisticProjectFileTarget): string {
  return JSON.stringify([target.environmentId, target.cwd, target.relativePath]);
}

export function createProjectEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const projectScheduler = createAtomCommandScheduler();
  const fileScheduler = createAtomCommandScheduler();
  const optimisticFileFamily = Atom.family((key: string) =>
    Atom.make<OptimisticProjectFile | null>(null).pipe(
      Atom.withLabel(`environment-data:projects:optimistic-file:${key}`),
    ),
  );
  const projectConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { projectId: string } }) =>
      JSON.stringify([environmentId, input.projectId]),
  };
  return {
    searchEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:search-entries",
      tag: WS_METHODS.projectsSearchEntries,
      staleTimeMs: 15_000,
    }),
    listEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:list-entries",
      tag: WS_METHODS.projectsListEntries,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    readFile: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:read-file",
      tag: WS_METHODS.projectsReadFile,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    integrationChanges: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:queries:integration:changes",
      tag: ORCHESTRATION_WS_METHODS.getIntegrationChanges,
    }),
    integrationFileDiff: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:queries:integration:file-diff",
      tag: ORCHESTRATION_WS_METHODS.getIntegrationFileDiff,
    }),
    optimisticFile: (target: OptimisticProjectFileTarget) =>
      optimisticFileFamily(optimisticProjectFileKey(target)),
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:create",
      execute: (input: CreateProjectInput) => createProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:update",
      execute: (input: UpdateProjectInput) => updateProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    updateQualityPolicy: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:quality-policy:update",
      execute: (input: UpdateProjectQualityPolicyInput) => updateProjectQualityPolicy(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    updateReviewPolicy: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:review-policy:update",
      execute: (input: UpdateProjectReviewPolicyInput) => updateProjectReviewPolicy(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    createIntegration: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:integration:create",
      execute: createIntegration,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    continueIntegration: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:integration:continue",
      execute: continueIntegration,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    abortIntegration: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:integration:abort",
      execute: abortIntegration,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    validateIntegration: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:integration:validate",
      execute: validateIntegration,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    removeIntegrationWorkspace: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:integration:workspace:remove",
      execute: removeIntegrationWorkspace,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:delete",
      execute: (input: DeleteProjectInput) => deleteProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    writeFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:write-file",
      tag: WS_METHODS.projectsWriteFile,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.cwd, input.relativePath]),
      },
    }),
  };
}
