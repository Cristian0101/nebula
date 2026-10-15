import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  ArchitectPlanProposalId,
  OrchestrationProject,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { generateArchitectPlan } from "./ArchitectPlanGeneration.ts";

const decodeProject = Schema.decodeUnknownSync(OrchestrationProject);
const baseCommit = "0123456789abcdef0123456789abcdef01234567";

it.layer(NodeServices.layer)("Architect persisted fingerprint compatibility", (it) => {
  it.effect("maps a typed progress failure into the existing Architect unknown category", () =>
    Effect.gen(function* () {
      const project = decodeProject({
        id: "project",
        title: "Fixture",
        workspaceRoot: "/fixture",
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
        deletedAt: null,
      });
      const result = yield* generateArchitectPlan({
        project,
        request: {
          proposalId: ArchitectPlanProposalId.make("progress-plan"),
          projectId: project.id,
          objective: "Fixture",
          modelSelection: { instanceId: ProviderInstanceId.make("synthetic"), model: "fixture" },
        },
        onProgress: () => Effect.fail("synthetic-progress-failure"),
      }).pipe(
        Effect.result,
        Effect.provide(
          Layer.mergeAll(Layer.mock(GitWorkflowService)({}), Layer.mock(TextGeneration)({})),
        ),
      );
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          category: "unknown",
          message: "Could not persist Architect planning progress.",
          cause: "synthetic-progress-failure",
        },
      });
    }),
  );

  it.effect("retains the pre-migration context/resource bytes and planner policy evidence", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b0-golden-" });
      yield* fs.makeDirectory(path.join(root, "src"));
      yield* fs.writeFileString(path.join(root, "README.md"), "Synthetic repository evidence.\n");
      yield* fs.writeFileString(path.join(root, "src", "main.ts"), "export const ready = true;\n");
      const project = decodeProject({
        id: "project",
        title: "Golden fixture",
        workspaceRoot: root,
        defaultModelSelection: null,
        scripts: [],
        sharedResources: [
          {
            id: "resource",
            projectId: "project",
            name: "Manifest",
            description: null,
            patterns: ["package.json"],
            mode: "exclusive",
            enabled: true,
            createdAt: "2026-08-23T12:00:00.000Z",
            updatedAt: "2026-08-23T12:00:00.000Z",
          },
        ],
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
        deletedAt: null,
      });
      let prompt = "";
      const result = yield* generateArchitectPlan({
        project,
        request: {
          proposalId: ArchitectPlanProposalId.make("golden-plan"),
          projectId: project.id,
          objective: "Plan without execution.",
          modelSelection: { instanceId: ProviderInstanceId.make("synthetic"), model: "fixture" },
          contextPaths: ["src/main.ts"],
        },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(GitWorkflowService)({
              localStatus: () =>
                Effect.succeed({
                  isRepo: true,
                  hasPrimaryRemote: false,
                  hasWorkingTreeChanges: false,
                  isDefaultRef: true,
                  refName: "main",
                  workingTree: { files: [], insertions: 0, deletions: 0 },
                }),
              resolveCommit: () => Effect.succeed({ commitSha: baseCommit }),
            }),
            Layer.mock(TextGeneration)({
              generateStructured: (input) => {
                prompt = input.prompt;
                return Effect.succeed({
                  title: "Golden plan",
                  objective: "Plan without execution.",
                  description: null,
                  tasks: [],
                  dependencies: [],
                  checkpoints: [],
                  assumptions: [],
                  risks: [],
                  unresolvedQuestions: [],
                  resourcePolicyGaps: [],
                });
              },
            }),
          ),
        ),
      );
      expect({
        contextFingerprint: result.plan.contextFingerprint,
        resourcePolicyFingerprint: result.plan.resourcePolicyFingerprint,
        contextPaths: result.plan.contextPaths,
        prompt,
      }).toMatchSnapshot();
    }),
  );
});
