import {
  ArchitectPlanGenerationError,
  CommandId,
  type MissionRunId,
  type ReplanProposalId,
  type ArchitectPlanningFailureCategory,
  type ArchitectPlanningPhase,
  type ArchitectPlanProposal,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { forkParked, forkParkedStream } from "../../serverActivation.ts";
import {
  buildArchitectReplanContext,
  generateArchitectReplan,
  generateArchitectPlan,
  type ArchitectPlanningProgressPatch,
} from "../ArchitectPlanGeneration.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  ArchitectPlanReactor,
  type ArchitectPlanReactorShape,
} from "../Services/ArchitectPlanReactor.ts";

export function classifyArchitectPlanningFailure(
  failure: string | ArchitectPlanGenerationError,
): ArchitectPlanningFailureCategory {
  if (typeof failure !== "string") return failure.category;
  const message = failure;
  const normalized = message.toLowerCase();
  if (normalized.includes("auth") || normalized.includes("credential"))
    return "authentication_required";
  if (
    normalized.includes("provider") &&
    (normalized.includes("ready") || normalized.includes("available"))
  )
    return "provider_unavailable";
  if (
    normalized.includes("transport") ||
    normalized.includes("connection") ||
    normalized.includes("interrupt") ||
    normalized.includes("timeout")
  )
    return "transport_interrupted";
  if (normalized.includes("malformed") || normalized.includes("structured"))
    return "invalid_structured_plan";
  if (normalized.includes("validat")) return "validation_failed";
  if (normalized.includes("repository") || normalized.includes("baseline"))
    return "repository_changed";
  return "unknown";
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const metadata = (tag: string) =>
    Effect.all({
      commandId: crypto.randomUUIDv4.pipe(
        Effect.map((id) => CommandId.make(`server:${tag}:${id}`)),
      ),
      createdAt: DateTime.now.pipe(Effect.map(DateTime.formatIso)),
    });

  const processPlan = Effect.fn("ArchitectPlanReactor.processPlan")(function* (
    plan: ArchitectPlanProposal,
  ) {
    const readModel = yield* snapshots.getCommandReadModel();
    const project = readModel.projects.find(
      (candidate) => candidate.id === plan.projectId && candidate.deletedAt === null,
    );
    if (!project || plan.status !== "generating") return;
    const attempt = plan.lifecycle?.attempt ?? Math.max(1, plan.attempts?.length ?? 1);
    const persistProgress = Effect.fn("ArchitectPlanReactor.persistProgress")(function* (
      phase: ArchitectPlanningPhase,
      patch?: ArchitectPlanningProgressPatch,
    ) {
      const latestModel = yield* snapshots.getCommandReadModel();
      const latest = latestModel.projects
        .find((candidate) => candidate.id === plan.projectId)
        ?.architectPlans?.find((candidate) => candidate.id === plan.id);
      if (
        !latest ||
        latest.status !== "generating" ||
        (latest.lifecycle?.attempt ?? attempt) !== attempt ||
        latest.lifecycle?.phase === phase
      )
        return;
      const meta = yield* metadata(`architect-plan-progress:${phase}`);
      const next: ArchitectPlanProposal = {
        ...latest,
        ...(patch?.planningBaseCommit ? { planningBaseCommit: patch.planningBaseCommit } : {}),
        ...(patch?.observedHeadCommit !== undefined
          ? { observedHeadCommit: patch.observedHeadCommit }
          : {}),
        ...(patch?.contextFingerprint ? { contextFingerprint: patch.contextFingerprint } : {}),
        ...(patch?.contextPaths ? { contextPaths: patch.contextPaths } : {}),
        ...(patch?.resourcePolicyFingerprint
          ? { resourcePolicyFingerprint: patch.resourcePolicyFingerprint }
          : {}),
        lifecycle: {
          phase,
          attempt,
          startedAt: latest.lifecycle?.startedAt ?? latest.createdAt,
          lastProgressAt: meta.createdAt,
          completedAt: null,
          failureCategory: null,
        },
        attempts: (latest.attempts ?? []).map((item) =>
          item.number === attempt
            ? { ...item, lastPhase: phase, outcome: "running" as const }
            : item,
        ),
        updatedAt: meta.createdAt,
      };
      yield* engine
        .dispatch({
          type: "architect.plan.save",
          ...meta,
          projectId: latest.projectId,
          plan: next,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ArchitectPlanGenerationError({
                message: "Could not persist Architect planning progress.",
                category: "unknown",
                cause,
              }),
          ),
        );
    });
    const selection = plan.architectModelSelection;
    const result = yield* Effect.result(
      generateArchitectPlan({
        request: {
          proposalId: plan.id,
          projectId: plan.projectId,
          objective: plan.objective,
          ...(plan.constraints !== null ? { constraints: plan.constraints } : {}),
          modelSelection: {
            instanceId: selection.instanceId,
            model: selection.model,
            ...(selection.options !== undefined ? { options: selection.options } : {}),
          },
          contextPaths: plan.contextPaths,
          ...(plan.team ? { team: plan.team } : {}),
        },
        project,
        onProgress: persistProgress,
      }),
    );
    const meta = yield* metadata("architect-plan-save");
    const latestModel = yield* snapshots.getCommandReadModel();
    const latest = latestModel.projects
      .find((candidate) => candidate.id === plan.projectId)
      ?.architectPlans?.find((candidate) => candidate.id === plan.id);
    if (
      !latest ||
      latest.status !== "generating" ||
      (latest.lifecycle?.attempt ?? attempt) !== attempt
    )
      return;
    const finishAttempts = (
      phase: ArchitectPlanningPhase,
      outcome: "ready" | "failed",
      category: ArchitectPlanningFailureCategory | null,
      reason: string | null,
    ) =>
      (latest.attempts ?? []).map((item) =>
        item.number === attempt
          ? {
              ...item,
              completedAt: meta.createdAt,
              lastPhase: phase,
              outcome,
              failureCategory: category,
              failureReason: reason,
            }
          : item,
      );
    const failureCategory =
      result._tag === "Failure" ? classifyArchitectPlanningFailure(result.failure) : null;
    const nextPlan =
      result._tag === "Success"
        ? {
            ...result.success.plan,
            createdAt: plan.createdAt,
            ...(latest.team ? { team: latest.team } : {}),
            lifecycle: {
              phase:
                result.success.plan.status === "ready" ? ("ready" as const) : ("failed" as const),
              attempt,
              startedAt: latest.lifecycle?.startedAt ?? latest.createdAt,
              lastProgressAt: meta.createdAt,
              completedAt: meta.createdAt,
              failureCategory:
                result.success.plan.status === "ready" ? null : ("validation_failed" as const),
            },
            attempts: finishAttempts(
              result.success.plan.status === "ready" ? "ready" : "failed",
              result.success.plan.status === "ready" ? "ready" : "failed",
              result.success.plan.status === "ready" ? null : "validation_failed",
              result.success.plan.status === "ready" ? null : "Plan validation failed.",
            ),
          }
        : {
            ...latest,
            status: "failed" as const,
            failureReason: result.failure.message,
            lifecycle: {
              phase: "failed" as const,
              attempt,
              startedAt: latest.lifecycle?.startedAt ?? latest.createdAt,
              lastProgressAt: meta.createdAt,
              completedAt: meta.createdAt,
              failureCategory,
            },
            attempts: finishAttempts("failed", "failed", failureCategory, result.failure.message),
            updatedAt: meta.createdAt,
            resolvedAt: meta.createdAt,
          };
    yield* engine.dispatch({
      type: "architect.plan.save",
      ...meta,
      projectId: plan.projectId,
      plan: nextPlan,
    });
  });

  const processReplan = Effect.fn("ArchitectPlanReactor.processReplan")(function* (
    runId: MissionRunId,
    proposalId: ReplanProposalId,
  ) {
    let readModel = yield* snapshots.getCommandReadModel();
    let run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === runId);
    let proposal = run?.replanProposals?.find((candidate) => candidate.id === proposalId);
    if (!run || !proposal || !["requested", "analyzing"].includes(proposal.status)) return;
    const mission = (readModel.missions ?? []).find((candidate) => candidate.id === run!.missionId);
    const project = readModel.projects.find(
      (candidate) => candidate.id === run!.projectId && candidate.deletedAt === null,
    );
    if (!mission || !project) return;
    const architectPlan = mission.architectPlanProposalId
      ? project.architectPlans?.find(
          (candidate) => candidate.id === mission.architectPlanProposalId,
        )
      : undefined;
    const selection =
      proposal.architectModelSelection ??
      architectPlan?.architectModelSelection ??
      project.defaultModelSelection;
    if (!selection) {
      const meta = yield* metadata("architect-replan-fail:no-selection");
      yield* engine.dispatch({
        type: "mission.run.replan.analysis.fail",
        ...meta,
        runId,
        proposalId,
        architectModelSelection: null,
        failureReason: "No approved Architect provider/model is available for this Mission Replan.",
      });
      return;
    }
    const integrationBatch = mission.integrationBatchId
      ? ((project.integrationBatches ?? []).find(
          (candidate) => candidate.id === mission.integrationBatchId,
        ) ?? null)
      : null;
    const context = buildArchitectReplanContext({
      project,
      mission,
      run,
      tasks: readModel.tasks ?? [],
      proposal,
      integrationBatch,
    });
    if (proposal.status === "requested") {
      const meta = yield* metadata("architect-replan-start");
      yield* engine.dispatch({
        type: "mission.run.replan.analysis.start",
        ...meta,
        runId,
        proposalId,
        architectModelSelection: selection,
        architectContextFingerprint: context.fingerprint,
      });
      readModel = yield* snapshots.getCommandReadModel();
      run = (readModel.missionRuns ?? []).find((candidate) => candidate.id === runId);
      proposal = run?.replanProposals?.find((candidate) => candidate.id === proposalId);
      if (!run || !proposal || proposal.status !== "analyzing") return;
    }
    const result = yield* Effect.result(
      generateArchitectReplan({
        project,
        mission,
        run,
        tasks: readModel.tasks ?? [],
        proposal,
        integrationBatch,
        modelSelection: selection,
      }),
    );
    const meta = yield* metadata("architect-replan-finish");
    const latestModel = yield* snapshots.getCommandReadModel();
    const latestRun = (latestModel.missionRuns ?? []).find((candidate) => candidate.id === runId);
    const latestProposal = latestRun?.replanProposals?.find(
      (candidate) => candidate.id === proposalId,
    );
    if (!latestProposal || latestProposal.status !== "analyzing") return;
    if (result._tag === "Failure") {
      yield* engine.dispatch({
        type: "mission.run.replan.analysis.fail",
        ...meta,
        runId,
        proposalId,
        architectModelSelection: selection,
        failureReason: result.failure.message,
      });
      return;
    }
    const draft = result.success.draft;
    yield* engine.dispatch({
      type: "mission.run.replan.propose",
      ...meta,
      runId,
      proposalId,
      scope: draft.scope,
      summary: draft.summary,
      rationale: draft.rationale,
      changeSet: draft.changeSet,
      architectModelSelection: selection,
      architectContextFingerprint: result.success.contextFingerprint,
      architectReportedPreservedTaskIds: draft.preservedTaskIds,
      architectReportedAffectedTaskIds: draft.affectedTaskIds,
      architectRisks: draft.risks,
      architectPlanProposalId: mission.architectPlanProposalId ?? null,
    });
  });
  type ArchitectWork =
    | { readonly kind: "plan"; readonly plan: ArchitectPlanProposal }
    | {
        readonly kind: "replan";
        readonly runId: MissionRunId;
        readonly proposalId: ReplanProposalId;
      };
  const pendingWork = new Set<string>();
  const workKey = (work: ArchitectWork) =>
    work.kind === "plan"
      ? `plan:${work.plan.id}:${work.plan.lifecycle?.attempt ?? Math.max(1, work.plan.attempts?.length ?? 1)}`
      : `replan:${work.runId}:${work.proposalId}`;
  const worker = yield* makeDrainableWorker((work: ArchitectWork) => {
    const key = workKey(work);
    return (
      work.kind === "plan" ? processPlan(work.plan) : processReplan(work.runId, work.proposalId)
    ).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Architect generation failed", { cause })),
      Effect.ensuring(Effect.sync(() => pendingWork.delete(key))),
    );
  });
  const enqueue = (work: ArchitectWork) =>
    Effect.suspend(() => {
      const key = workKey(work);
      if (pendingWork.has(key)) return Effect.void;
      pendingWork.add(key);
      return worker
        .enqueue(work)
        .pipe(Effect.tapError(() => Effect.sync(() => pendingWork.delete(key))));
    });
  const start: ArchitectPlanReactorShape["start"] = Effect.fn("ArchitectPlanReactor.start")(
    function* () {
      yield* forkParkedStream(engine.streamDomainEvents, (event: OrchestrationEvent) =>
        event.type === "architect.plan-saved" &&
        event.payload.plan.status === "generating" &&
        (event.payload.plan.lifecycle?.phase ?? "validating_repository") === "validating_repository"
          ? enqueue({ kind: "plan", plan: event.payload.plan })
          : event.type === "mission.run.reconciled"
            ? Effect.forEach(
                (event.payload.run.replanProposals ?? []).filter((proposal) =>
                  ["requested", "analyzing"].includes(proposal.status),
                ),
                (proposal) =>
                  enqueue({
                    kind: "replan",
                    runId: event.payload.run.id,
                    proposalId: proposal.id,
                  }),
                { discard: true },
              )
            : Effect.void,
      );
      yield* forkParked(
        Effect.gen(function* () {
          const readModel = yield* snapshots
            .getCommandReadModel()
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Architect Plan reconciliation failed", { cause }).pipe(
                  Effect.as(null),
                ),
              ),
            );
          if (readModel) {
            for (const project of readModel.projects)
              for (const plan of project.architectPlans ?? [])
                if (plan.status === "generating") yield* enqueue({ kind: "plan", plan });
            for (const run of readModel.missionRuns ?? [])
              for (const proposal of run.replanProposals ?? [])
                if (["requested", "analyzing"].includes(proposal.status))
                  yield* enqueue({ kind: "replan", runId: run.id, proposalId: proposal.id });
          }
        }),
      );
    },
  );
  return { start, drain: worker.drain } satisfies ArchitectPlanReactorShape;
});

export const ArchitectPlanReactorLive = Layer.effect(ArchitectPlanReactor, make);
