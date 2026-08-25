import { CommandId, type ArchitectPlanProposal, type OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { forkParked, forkParkedStream } from "../../serverActivation.ts";
import { generateArchitectPlan } from "../ArchitectPlanGeneration.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  ArchitectPlanReactor,
  type ArchitectPlanReactorShape,
} from "../Services/ArchitectPlanReactor.ts";

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

  const process = Effect.fn("ArchitectPlanReactor.process")(function* (
    plan: ArchitectPlanProposal,
  ) {
    const readModel = yield* snapshots.getCommandReadModel();
    const project = readModel.projects.find(
      (candidate) => candidate.id === plan.projectId && candidate.deletedAt === null,
    );
    if (!project || plan.status !== "generating") return;
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
        },
        project,
      }),
    );
    const meta = yield* metadata("architect-plan-save");
    const nextPlan =
      result._tag === "Success"
        ? { ...result.success.plan, createdAt: plan.createdAt }
        : {
            ...plan,
            status: "failed" as const,
            failureReason: result.failure.message,
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
  const worker = yield* makeDrainableWorker((plan: ArchitectPlanProposal) =>
    process(plan).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Architect Plan generation failed", { cause }),
      ),
    ),
  );
  const start: ArchitectPlanReactorShape["start"] = Effect.fn("ArchitectPlanReactor.start")(
    function* () {
      yield* forkParkedStream(engine.streamDomainEvents, (event: OrchestrationEvent) =>
        event.type === "architect.plan-saved" && event.payload.plan.status === "generating"
          ? worker.enqueue(event.payload.plan)
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
          if (readModel)
            for (const project of readModel.projects)
              for (const plan of project.architectPlans ?? [])
                if (plan.status === "generating") yield* worker.enqueue(plan);
        }),
      );
    },
  );
  return { start, drain: worker.drain } satisfies ArchitectPlanReactorShape;
});

export const ArchitectPlanReactorLive = Layer.effect(ArchitectPlanReactor, make);
