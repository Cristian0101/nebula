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
  createProjectSharedResource,
  updateProjectSharedResource,
  deleteProjectSharedResource,
  createIntegration,
  continueIntegration,
  abortIntegration,
  validateIntegration,
  removeIntegrationWorkspace,
  createMission,
  updateMission,
  addMissionTask,
  removeMissionTask,
  reorderMissionTasks,
  addMissionDependency,
  removeMissionDependency,
  activateMission,
  completeMission,
  cancelMission,
  saveArchitectPlan,
  generateArchitectPlan,
  rejectArchitectPlan,
  approveArchitectPlan,
} from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export type {
  CreateProjectInput,
  DeleteProjectInput,
  UpdateProjectInput,
  UpdateProjectQualityPolicyInput,
  UpdateProjectReviewPolicyInput,
  CreateProjectSharedResourceInput,
  UpdateProjectSharedResourceInput,
  DeleteProjectSharedResourceInput,
  CreateIntegrationInput,
  ContinueIntegrationInput,
  AbortIntegrationInput,
  ValidateIntegrationInput,
  RemoveIntegrationWorkspaceInput,
  CreateMissionInput,
  UpdateMissionInput,
  AddMissionTaskInput,
  RemoveMissionTaskInput,
  ReorderMissionTasksInput,
  AddMissionDependencyInput,
  RemoveMissionDependencyInput,
  ActivateMissionInput,
  CompleteMissionInput,
  CancelMissionInput,
  SaveArchitectPlanInput,
  GenerateArchitectPlanInput,
  RejectArchitectPlanInput,
  ApproveArchitectPlanInput,
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
    createSharedResource: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:shared-resource:create",
      execute: createProjectSharedResource,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    updateSharedResource: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:shared-resource:update",
      execute: updateProjectSharedResource,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    deleteSharedResource: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:shared-resource:delete",
      execute: deleteProjectSharedResource,
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
    createMission: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:create",
      execute: createMission,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    updateMission: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:update",
      execute: updateMission,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    addMissionTask: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:task:add",
      execute: addMissionTask,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    removeMissionTask: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:task:remove",
      execute: removeMissionTask,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    reorderMissionTasks: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:tasks:reorder",
      execute: reorderMissionTasks,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    addMissionDependency: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:dependency:add",
      execute: addMissionDependency,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    removeMissionDependency: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:dependency:remove",
      execute: removeMissionDependency,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    activateMission: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:activate",
      execute: activateMission,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    completeMission: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:complete",
      execute: completeMission,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    cancelMission: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:mission:cancel",
      execute: cancelMission,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    saveArchitectPlan: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:architect-plan:save",
      execute: saveArchitectPlan,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    generateArchitectPlan: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:architect-plan:generate",
      execute: generateArchitectPlan,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    rejectArchitectPlan: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:architect-plan:reject",
      execute: rejectArchitectPlan,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    approveArchitectPlan: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:architect-plan:approve",
      execute: approveArchitectPlan,
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
