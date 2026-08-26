import {
  CommandId,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  type EnvironmentRpcFailure,
  type EnvironmentRpcSuccess,
  type EnvironmentRpcUnavailableError,
  request,
} from "../rpc/client.ts";

type CommandType = ClientOrchestrationCommand["type"];
type CommandOf<T extends CommandType> = Extract<ClientOrchestrationCommand, { readonly type: T }>;
type CommandInput<T extends CommandType> = Omit<
  CommandOf<T>,
  "type" | "commandId" | "createdAt"
> & {
  readonly commandId?: CommandId;
} & ("createdAt" extends keyof CommandOf<T>
    ? {
        readonly createdAt?: CommandOf<T>["createdAt"];
      }
    : {});

export type CreateProjectInput = CommandInput<"project.create">;
export type UpdateProjectInput = CommandInput<"project.meta.update">;
export type UpdateProjectQualityPolicyInput = CommandInput<"project.quality-policy.update">;
export type UpdateProjectReviewPolicyInput = CommandInput<"project.review-policy.update">;
export type CreateProjectSharedResourceInput = CommandInput<"project.shared-resource.create">;
export type UpdateProjectSharedResourceInput = CommandInput<"project.shared-resource.update">;
export type DeleteProjectSharedResourceInput = CommandInput<"project.shared-resource.delete">;
export type DeleteProjectInput = CommandInput<"project.delete">;
export type SaveArchitectPlanInput = CommandInput<"architect.plan.save">;
export type GenerateArchitectPlanInput = CommandInput<"architect.plan.generate">;
export type RejectArchitectPlanInput = CommandInput<"architect.plan.reject">;
export type ApproveArchitectPlanInput = CommandInput<"architect.plan.approve">;
export type CreateMissionInput = CommandInput<"mission.create">;
export type ApproveMissionCheckpointInput = CommandInput<"mission.checkpoint.approve">;
export type UpdateMissionInput = CommandInput<"mission.update">;
export type AddMissionTaskInput = CommandInput<"mission.task.add">;
export type RemoveMissionTaskInput = CommandInput<"mission.task.remove">;
export type ReorderMissionTasksInput = CommandInput<"mission.tasks.reorder">;
export type AddMissionDependencyInput = CommandInput<"mission.dependency.add">;
export type RemoveMissionDependencyInput = CommandInput<"mission.dependency.remove">;
export type ActivateMissionInput = CommandInput<"mission.activate">;
export type CompleteMissionInput = CommandInput<"mission.complete">;
export type CancelMissionInput = CommandInput<"mission.cancel">;
export type StartMissionRunInput = CommandInput<"mission.run.start">;
export type PauseMissionRunInput = CommandInput<"mission.run.pause">;
export type ResumeMissionRunInput = CommandInput<"mission.run.resume">;
export type StopMissionRunInput = CommandInput<"mission.run.stop">;
export type ResolveMissionRunCoordinationRequestInput =
  CommandInput<"mission.run.coordination-request.resolve">;
export type ResolveMissionRunReplanInput = CommandInput<"mission.run.replan.resolve">;
export type CreateIntegrationInput = CommandInput<"integration.create">;
export type ContinueIntegrationInput = CommandInput<"integration.continue">;
export type AbortIntegrationInput = CommandInput<"integration.abort">;
export type ValidateIntegrationInput = CommandInput<"integration.validate">;
export type RemoveIntegrationWorkspaceInput = CommandInput<"integration.workspace.remove">;
export type CreateTaskInput = CommandInput<"task.create">;
export type SetTaskAcceptanceCriteriaInput = CommandInput<"task.acceptance-criteria.set">;
export type BindTaskThreadInput = CommandInput<"task.bind-thread">;
export type ActivateTaskInput = CommandInput<"task.activate">;
export type CompleteTaskInput = CommandInput<"task.complete">;
export type CancelTaskInput = CommandInput<"task.cancel">;
export type PrepareTaskWorkspaceInput = CommandInput<"task.workspace.prepare">;
export type RemoveTaskWorkspaceInput = CommandInput<"task.workspace.remove">;
export type SetTaskOwnershipInput = CommandInput<"task.ownership.set">;
export type ValidateTaskOwnershipInput = CommandInput<"task.ownership.validate">;
export type SetTaskResourceRequirementsInput = CommandInput<"task.resource-requirements.set">;
export type CreateTaskOwnershipRequestInput = CommandInput<"task.ownership-request.create">;
export type ApproveTaskOwnershipRequestInput = CommandInput<"task.ownership-request.approve">;
export type DenyTaskOwnershipRequestInput = CommandInput<"task.ownership-request.deny">;
export type CancelTaskOwnershipRequestInput = CommandInput<"task.ownership-request.cancel">;
export type PrepareTaskReviewInput = CommandInput<"task.review.prepare">;
export type UpdateTaskHandoffInput = CommandInput<"task.handoff.update">;
export type RunTaskQualityGatesInput = CommandInput<"task.quality.run">;
export type CancelTaskQualityGateInput = CommandInput<"task.quality.cancel">;
export type RequestTaskIndependentReviewInput = CommandInput<"task.independent-review.request">;
export type SendTaskReviewFindingsInput = CommandInput<"task.review.findings.send">;
export type RequestTaskRestoreInput = CommandInput<"task.restore.request">;
export type UndoTaskRestoreInput = CommandInput<"task.restore.undo">;
export type CreateThreadInput = CommandInput<"thread.create">;
export type DeleteThreadInput = CommandInput<"thread.delete">;
export type ArchiveThreadInput = CommandInput<"thread.archive">;
export type UnarchiveThreadInput = CommandInput<"thread.unarchive">;
export type SettleThreadInput = CommandInput<"thread.settle">;
export type UnsettleThreadInput = CommandInput<"thread.unsettle">;
export type SnoozeThreadInput = CommandInput<"thread.snooze">;
export type UnsnoozeThreadInput = CommandInput<"thread.unsnooze">;
export type PinThreadInput = CommandInput<"thread.pin">;
export type UnpinThreadInput = CommandInput<"thread.unpin">;
export type ReorderPinnedThreadInput = CommandInput<"thread.pin.reorder">;
export type UpdateThreadMetadataInput = CommandInput<"thread.meta.update">;
export type SetThreadRuntimeModeInput = CommandInput<"thread.runtime-mode.set">;
export type SetThreadInteractionModeInput = CommandInput<"thread.interaction-mode.set">;
export type StartThreadTurnInput = CommandInput<"thread.turn.start">;
export type InterruptThreadTurnInput = CommandInput<"thread.turn.interrupt">;
export type RespondToThreadApprovalInput = CommandInput<"thread.approval.respond">;
export type RespondToThreadUserInputInput = CommandInput<"thread.user-input.respond">;
export type RevertThreadCheckpointInput = CommandInput<"thread.checkpoint.revert">;
export type StopThreadSessionInput = CommandInput<"thread.session.stop">;

type DispatchTag = typeof ORCHESTRATION_WS_METHODS.dispatchCommand;
type CommandEffect = Effect.Effect<
  EnvironmentRpcSuccess<DispatchTag>,
  EnvironmentRpcFailure<DispatchTag> | EnvironmentRpcUnavailableError,
  Crypto.Crypto | EnvironmentSupervisor
>;

function commandId(input: { readonly commandId?: CommandId }) {
  return Effect.gen(function* () {
    if (input.commandId !== undefined) {
      return input.commandId;
    }
    const crypto = yield* Crypto.Crypto;
    return yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make));
  });
}

function timestampedCommandMetadata(input: {
  readonly commandId?: CommandId;
  readonly createdAt?: string;
}) {
  return Effect.all({
    commandId: commandId(input),
    createdAt:
      input.createdAt === undefined
        ? DateTime.now.pipe(Effect.map(DateTime.formatIso))
        : Effect.succeed(input.createdAt),
  });
}

function dispatch(command: ClientOrchestrationCommand) {
  return request(ORCHESTRATION_WS_METHODS.dispatchCommand, command);
}

export const createProject: (input: CreateProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createProject",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "project.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const updateProject: (input: UpdateProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateProject",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "project.meta.update",
    commandId: yield* commandId(input),
  });
});

export const updateProjectQualityPolicy: (input: UpdateProjectQualityPolicyInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.updateProjectQualityPolicy")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "project.quality-policy.update", ...metadata });
  });

export const updateProjectReviewPolicy: (input: UpdateProjectReviewPolicyInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.updateProjectReviewPolicy")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "project.review-policy.update", ...metadata });
  });

export const saveArchitectPlan: (input: SaveArchitectPlanInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.saveArchitectPlan",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "architect.plan.save", ...metadata });
});

export const generateArchitectPlan: (input: GenerateArchitectPlanInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.generateArchitectPlan")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "architect.plan.generate", ...metadata });
  });

export const rejectArchitectPlan: (input: RejectArchitectPlanInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.rejectArchitectPlan",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "architect.plan.reject", ...metadata });
});

export const approveArchitectPlan: (input: ApproveArchitectPlanInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.approveArchitectPlan",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "architect.plan.approve", ...metadata });
});

const sharedResourceCommand = <
  T extends
    | "project.shared-resource.create"
    | "project.shared-resource.update"
    | "project.shared-resource.delete",
>(
  type: T,
  input: CommandInput<T>,
) =>
  Effect.gen(function* () {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type,
      ...metadata,
    } as unknown as ClientOrchestrationCommand);
  });
export const createProjectSharedResource: (
  input: CreateProjectSharedResourceInput,
) => CommandEffect = (input) => sharedResourceCommand("project.shared-resource.create", input);
export const updateProjectSharedResource: (
  input: UpdateProjectSharedResourceInput,
) => CommandEffect = (input) => sharedResourceCommand("project.shared-resource.update", input);
export const deleteProjectSharedResource: (
  input: DeleteProjectSharedResourceInput,
) => CommandEffect = (input) => sharedResourceCommand("project.shared-resource.delete", input);

export const deleteProject: (input: DeleteProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.deleteProject",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "project.delete",
    commandId: yield* commandId(input),
  });
});

const missionCommand = <
  T extends
    | "mission.create"
    | "mission.update"
    | "mission.task.add"
    | "mission.task.remove"
    | "mission.tasks.reorder"
    | "mission.dependency.add"
    | "mission.dependency.remove"
    | "mission.activate"
    | "mission.complete"
    | "mission.cancel"
    | "mission.checkpoint.approve"
    | "mission.run.start"
    | "mission.run.pause"
    | "mission.run.resume"
    | "mission.run.stop"
    | "mission.run.coordination-request.resolve"
    | "mission.run.replan.resolve",
>(
  type: T,
  input: CommandInput<T>,
) =>
  Effect.gen(function* () {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type,
      ...metadata,
    } as unknown as ClientOrchestrationCommand);
  });

export const createMission: (input: CreateMissionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createMission",
)((input) => missionCommand("mission.create", input));
export const approveMissionCheckpoint: (input: ApproveMissionCheckpointInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.approveMissionCheckpoint")((input) =>
    missionCommand("mission.checkpoint.approve", input),
  );
export const updateMission: (input: UpdateMissionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateMission",
)((input) => missionCommand("mission.update", input));
export const addMissionTask: (input: AddMissionTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.addMissionTask",
)((input) => missionCommand("mission.task.add", input));
export const removeMissionTask: (input: RemoveMissionTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.removeMissionTask",
)((input) => missionCommand("mission.task.remove", input));
export const reorderMissionTasks: (input: ReorderMissionTasksInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.reorderMissionTasks",
)((input) => missionCommand("mission.tasks.reorder", input));
export const addMissionDependency: (input: AddMissionDependencyInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.addMissionDependency",
)((input) => missionCommand("mission.dependency.add", input));
export const removeMissionDependency: (input: RemoveMissionDependencyInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.removeMissionDependency")((input) =>
    missionCommand("mission.dependency.remove", input),
  );
export const activateMission: (input: ActivateMissionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.activateMission",
)((input) => missionCommand("mission.activate", input));
export const completeMission: (input: CompleteMissionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.completeMission",
)((input) => missionCommand("mission.complete", input));
export const cancelMission: (input: CancelMissionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.cancelMission",
)((input) => missionCommand("mission.cancel", input));
export const startMissionRun: (input: StartMissionRunInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.startMissionRun",
)((input) => missionCommand("mission.run.start", input));
export const pauseMissionRun: (input: PauseMissionRunInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.pauseMissionRun",
)((input) => missionCommand("mission.run.pause", input));
export const resumeMissionRun: (input: ResumeMissionRunInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.resumeMissionRun",
)((input) => missionCommand("mission.run.resume", input));
export const stopMissionRun: (input: StopMissionRunInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.stopMissionRun",
)((input) => missionCommand("mission.run.stop", input));
export const resolveMissionRunCoordinationRequest: (
  input: ResolveMissionRunCoordinationRequestInput,
) => CommandEffect = Effect.fn("EnvironmentCommands.resolveMissionRunCoordinationRequest")(
  (input) => missionCommand("mission.run.coordination-request.resolve", input),
);
export const resolveMissionRunReplan: (input: ResolveMissionRunReplanInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.resolveMissionRunReplan")((input) =>
    missionCommand("mission.run.replan.resolve", input),
  );

export const createIntegration: (input: CreateIntegrationInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createIntegration",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "integration.create", ...metadata });
});

export const continueIntegration: (input: ContinueIntegrationInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.continueIntegration",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "integration.continue", ...metadata });
});

export const abortIntegration: (input: AbortIntegrationInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.abortIntegration",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "integration.abort", ...metadata });
});

export const validateIntegration: (input: ValidateIntegrationInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.validateIntegration",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "integration.validate", ...metadata });
});

export const removeIntegrationWorkspace: (input: RemoveIntegrationWorkspaceInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.removeIntegrationWorkspace")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "integration.workspace.remove", ...metadata });
  });

export const createTask: (input: CreateTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createTask",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.create", ...metadata });
});

export const setTaskAcceptanceCriteria: (input: SetTaskAcceptanceCriteriaInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.setTaskAcceptanceCriteria")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.acceptance-criteria.set", ...metadata });
  });

export const bindTaskThread: (input: BindTaskThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.bindTaskThread",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.bind-thread", ...metadata });
});

export const activateTask: (input: ActivateTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.activateTask",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.activate", ...metadata });
});

export const completeTask: (input: CompleteTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.completeTask",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.complete", ...metadata });
});

export const cancelTask: (input: CancelTaskInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.cancelTask",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.cancel", ...metadata });
});

export const prepareTaskWorkspace: (input: PrepareTaskWorkspaceInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.prepareTaskWorkspace",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.workspace.prepare", ...metadata });
});

export const removeTaskWorkspace: (input: RemoveTaskWorkspaceInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.removeTaskWorkspace",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.workspace.remove", ...metadata });
});

export const setTaskOwnership: (input: SetTaskOwnershipInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.setTaskOwnership",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.ownership.set", ...metadata });
});

export const validateTaskOwnership: (input: ValidateTaskOwnershipInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.validateTaskOwnership")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.ownership.validate", ...metadata });
  });

export const setTaskResourceRequirements: (
  input: SetTaskResourceRequirementsInput,
) => CommandEffect = Effect.fn("EnvironmentCommands.setTaskResourceRequirements")(
  function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.resource-requirements.set", ...metadata });
  },
);

export const createTaskOwnershipRequest: (input: CreateTaskOwnershipRequestInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.createTaskOwnershipRequest")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.ownership-request.create", ...metadata });
  });

export const approveTaskOwnershipRequest: (
  input: ApproveTaskOwnershipRequestInput,
) => CommandEffect = Effect.fn("EnvironmentCommands.approveTaskOwnershipRequest")(
  function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.ownership-request.approve", ...metadata });
  },
);

export const denyTaskOwnershipRequest: (input: DenyTaskOwnershipRequestInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.denyTaskOwnershipRequest")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.ownership-request.deny", ...metadata });
  });

export const cancelTaskOwnershipRequest: (input: CancelTaskOwnershipRequestInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.cancelTaskOwnershipRequest")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.ownership-request.cancel", ...metadata });
  });

export const prepareTaskReview: (input: PrepareTaskReviewInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.prepareTaskReview",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.review.prepare", ...metadata });
});

export const updateTaskHandoff: (input: UpdateTaskHandoffInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateTaskHandoff",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.handoff.update", ...metadata });
});

export const runTaskQualityGates: (input: RunTaskQualityGatesInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.runTaskQualityGates",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.quality.run", ...metadata });
});

export const cancelTaskQualityGate: (input: CancelTaskQualityGateInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.cancelTaskQualityGate")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.quality.cancel", ...metadata });
  });

export const requestTaskIndependentReview: (
  input: RequestTaskIndependentReviewInput,
) => CommandEffect = Effect.fn("EnvironmentCommands.requestTaskIndependentReview")(
  function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.independent-review.request", ...metadata });
  },
);

export const sendTaskReviewFindings: (input: SendTaskReviewFindingsInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.sendTaskReviewFindings")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({ ...input, type: "task.review.findings.send", ...metadata });
  });

export const requestTaskRestore: (input: RequestTaskRestoreInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.requestTaskRestore",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.restore.request", ...metadata });
});

export const undoTaskRestore: (input: UndoTaskRestoreInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.undoTaskRestore",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({ ...input, type: "task.restore.undo", ...metadata });
});

export const createThread: (input: CreateThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createThread",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const deleteThread: (input: DeleteThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.deleteThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.delete",
    commandId: yield* commandId(input),
  });
});

export const archiveThread: (input: ArchiveThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.archiveThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.archive",
    commandId: yield* commandId(input),
  });
});

export const unarchiveThread: (input: UnarchiveThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unarchiveThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unarchive",
    commandId: yield* commandId(input),
  });
});

export const settleThread: (input: SettleThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.settleThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.settle",
    commandId: yield* commandId(input),
  });
});

export const unsettleThread: (input: UnsettleThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unsettleThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unsettle",
    commandId: yield* commandId(input),
  });
});

export const snoozeThread: (input: SnoozeThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.snoozeThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.snooze",
    commandId: yield* commandId(input),
  });
});

export const unsnoozeThread: (input: UnsnoozeThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unsnoozeThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unsnooze",
    commandId: yield* commandId(input),
  });
});

export const pinThread: (input: PinThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.pinThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.pin",
    commandId: yield* commandId(input),
  });
});

export const unpinThread: (input: UnpinThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unpinThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unpin",
    commandId: yield* commandId(input),
  });
});

export const reorderPinnedThread: (input: ReorderPinnedThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.reorderPinnedThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.pin.reorder",
    commandId: yield* commandId(input),
  });
});

export const updateThreadMetadata: (input: UpdateThreadMetadataInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateThreadMetadata",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.meta.update",
    commandId: yield* commandId(input),
  });
});

export const setThreadRuntimeMode: (input: SetThreadRuntimeModeInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.setThreadRuntimeMode",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.runtime-mode.set",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const setThreadInteractionMode: (input: SetThreadInteractionModeInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.setThreadInteractionMode")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.interaction-mode.set",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const startThreadTurn: (input: StartThreadTurnInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.startThreadTurn",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.turn.start",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const interruptThreadTurn: (input: InterruptThreadTurnInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.interruptThreadTurn",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.turn.interrupt",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const respondToThreadApproval: (input: RespondToThreadApprovalInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.respondToThreadApproval")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.approval.respond",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const respondToThreadUserInput: (input: RespondToThreadUserInputInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.respondToThreadUserInput")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.user-input.respond",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const revertThreadCheckpoint: (input: RevertThreadCheckpointInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.revertThreadCheckpoint")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.checkpoint.revert",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const stopThreadSession: (input: StopThreadSessionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.stopThreadSession",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.session.stop",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});
