import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  ArchitectPlanProposalId,
  CommandId,
  OrchestrationProject,
  ProviderInstanceId,
  TextGenerationError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { OrchestrationEventStoreLive } from "../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../persistence/Services/OrchestrationEventStore.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import {
  buildArchitectReplanContext,
  collectArchitectContextFiles,
  collectArchitectContextTree,
  generateArchitectPlan,
  generateArchitectReplan,
  validateArchitectContextPath,
} from "./ArchitectPlanGeneration.ts";
import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel } from "./projector.ts";

const now = "2026-10-15T07:00:00.000Z";
const fakeSecret = "B01_SYNTHETIC_SECRET_NEVER_MODEL_BOUND";
const fakeToken = ["sk", "synthetic-only-provider-token-000000"].join("-");
const fakeKey = "-----BEGIN PRIVATE KEY-----\nB01_FAKE_KEY_MATERIAL\n-----END PRIVATE KEY-----";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeProject = Schema.decodeUnknownSync(OrchestrationProject);
const projectFor = (root: string) =>
  decodeProject({
    id: "b01-project",
    title: "Synthetic repository",
    workspaceRoot: root,
    defaultModelSelection: null,
    scripts: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
const selection = { instanceId: ProviderInstanceId.make("synthetic"), model: "fixture" };
const requestFor = (project: OrchestrationProject, contextPaths: string[] = []) => ({
  proposalId: ArchitectPlanProposalId.make("b01-plan"),
  projectId: project.id,
  objective: "Plan safely",
  modelSelection: selection,
  contextPaths,
});
const gitLayer = Layer.mock(GitWorkflowService)({
  localStatus: () =>
    Effect.succeed({
      isRepo: true,
      hasPrimaryRemote: false,
      hasWorkingTreeChanges: false,
      isDefaultRef: true,
      refName: "main",
      workingTree: { files: [], insertions: 0, deletions: 0 },
    }),
  resolveCommit: () => Effect.succeed({ commitSha: "a".repeat(40) }),
});
const draft = {
  title: "Synthetic plan",
  objective: "Plan safely",
  description: null,
  tasks: [],
  dependencies: [],
  checkpoints: [],
  assumptions: [],
  risks: [],
  unresolvedQuestions: [],
  resourcePolicyGaps: [],
};
const protectedPaths = [
  ".env",
  ".env.local",
  ".env.example",
  ".envrc",
  ".envrc.local",
  ".env.production.local",
  ".ENV.TEST",
  "src/.env.local",
  "src/deep/.env.development",
  "credentials.json",
  "private/secrets/config.json",
  "nested/tokens.txt",
  ".ssh/config",
  ".aws/config",
  ".azure/msal.json",
  ".gnupg/data",
  ".kube/config",
  ".docker/config.json",
  ".codex/auth.json",
  ".claude/settings.json",
  ".cursor/config.json",
  ".grok/config.json",
  ".t3/config.json",
  ".gemini/settings.json",
  ".opencode/auth.json",
  ".config/gcloud/config",
  ".config/gh/hosts.yml",
  ".config/opencode/config.json",
  ".local/share/opencode/auth.json",
  ".npmrc",
  ".netrc",
  ".pypirc",
  ".git-credentials",
  "nested/id_ed25519",
  "nested/server.pem",
  "nested/private.key",
  "nested/key.p8",
  "nested/key.p12",
  "nested/key.pfx",
  "nested/key.der",
  "nested/key.ppk",
  "nested/store.jks",
  "nested/store.keystore",
];

it.layer(NodeServices.layer)("Architect protected context boundary", (it) => {
  it.effect("rejects every protected component before reads, including alternate separators", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-paths-" });
      for (const name of protectedPaths) {
        yield* fs.makeDirectory(path.dirname(path.join(root, name)), { recursive: true });
        yield* fs.writeFileString(path.join(root, name), fakeSecret);
      }
      yield* fs.writeFileString(path.join(root, "environment.ts"), "safe repository discovery");
      const tree = yield* collectArchitectContextTree(root);
      expect(tree).toContain("environment.ts");
      for (const name of protectedPaths) {
        expect(tree).not.toContain(name);
        for (const candidate of [name, `./${name}`, name.replaceAll("/", "\\")]) {
          expect(() => validateArchitectContextPath(path, root, candidate)).toThrow(/protected/);
          const result = yield* collectArchitectContextFiles(root, [candidate]).pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          expect(encodeJson(result)).not.toContain(fakeSecret);
        }
      }
      for (const candidate of [
        "../outside",
        "src/../../outside",
        "src\\..\\outside",
        "/etc/passwd",
        "C:\\outside",
        "C:outside",
        "\\\\host\\share",
        ".",
        "src/../README.md",
        "bad\0path",
      ]) {
        expect(() => validateArchitectContextPath(path, root, candidate)).toThrow();
      }
      expect(validateArchitectContextPath(path, root, "./src//./safe.ts")).toBe("src/safe.ts");
    }),
  );

  it.effect("omits file links, parent links, directory aliases and linked default context", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-links-" });
      const outside = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-outside-" });
      yield* fs.makeDirectory(path.join(root, "private"));
      yield* fs.writeFileString(path.join(root, "private", ".env.local"), fakeSecret);
      yield* fs.writeFileString(path.join(root, "private", "innocent.txt"), fakeSecret);
      yield* fs.writeFileString(path.join(outside, "innocent.txt"), fakeSecret);
      yield* fs.makeDirectory(path.join(outside, "nebula"));
      yield* fs.writeFileString(path.join(outside, "nebula", "ARCHITECTURE.md"), fakeSecret);
      yield* fs.writeFileString(path.join(outside, "nebula", "PROJECT_CONTRACT.md"), fakeSecret);
      yield* fs.writeFileString(path.join(root, "safe.ts"), "safe");
      yield* fs.link(path.join(root, "private", ".env.local"), path.join(root, "hard-alias"));
      yield* fs.symlink(path.join(root, "private", ".env.local"), path.join(root, "file-alias"));
      yield* fs.symlink(outside, path.join(root, "dir-alias"));
      yield* fs.symlink(path.join(root, "private"), path.join(root, "internal-alias"));
      yield* fs.symlink(path.join(outside, "innocent.txt"), path.join(root, "README.md"));
      yield* fs.symlink(outside, path.join(root, "docs"));
      yield* fs.symlink(path.join(root, "missing"), path.join(root, "broken"));
      // Test both selected-file and default-file paths; no fallback reads are permitted.
      const files = yield* collectArchitectContextFiles(root, [
        "hard-alias",
        "file-alias",
        "dir-alias/innocent.txt",
        "internal-alias/innocent.txt",
        "broken",
        "safe.ts",
      ]);
      expect(files).toEqual({ included: ["safe.ts"], text: "FILE: safe.ts\nsafe" });
      const tree = yield* collectArchitectContextTree(root);
      for (const alias of [
        "hard-alias",
        "file-alias",
        "dir-alias/",
        "internal-alias/",
        "README.md",
        "docs/",
        "broken",
      ])
        expect(tree).not.toContain(alias);
      // A linked repository root is a supported platform/root alias, not an escape below it.
      yield* fs.symlink(root, path.join(outside, "repository"));
      expect(
        yield* collectArchitectContextFiles(path.join(outside, "repository"), ["safe.ts"]),
      ).toEqual(files);
    }),
  );

  it.effect("enforces byte limits with UTF-8 and headers, and redacts safe-file credentials", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-bytes-" });
      for (const name of ["a", "b", "c", "d", "e"])
        yield* fs.writeFileString(path.join(root, name), "😀".repeat(16 * 1024));
      yield* fs.writeFileString(path.join(root, "large"), "x".repeat(64 * 1024 + 1));
      yield* fs.writeFile(path.join(root, "binary"), new Uint8Array([0, 1]));
      const files = yield* collectArchitectContextFiles(root, [
        "e",
        "d",
        "c",
        "b",
        "a",
        "large",
        "binary",
      ]);
      expect(files.included).toEqual(["a", "b", "c", "d"]);
      expect(Buffer.byteLength(files.text)).toBeLessThanOrEqual(256 * 1024);
      yield* fs.writeFileString(
        path.join(root, "README.md"),
        `Safe instructions\napi_key=${fakeToken}\n${fakeKey}`,
      );
      const safe = yield* collectArchitectContextFiles(root, []);
      expect(safe.text).toContain("Safe instructions");
      expect(safe.text).toContain("[REDACTED]");
      expect(safe.text).not.toContain(fakeToken);
      expect(safe.text).not.toContain("B01_FAKE_KEY_MATERIAL");
    }),
  );

  it.effect(
    "keeps protected contents out of provider prompts, progress, logs and persisted events",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-model-" });
        yield* fs.makeDirectory(path.join(root, "src"));
        yield* fs.writeFileString(path.join(root, ".env.local"), fakeSecret);
        yield* fs.writeFileString(path.join(root, "src", ".env.local"), fakeSecret);
        yield* fs.writeFileString(
          path.join(root, "README.md"),
          `Safe instructions\ntoken=${fakeToken}\n${fakeKey}`,
        );
        yield* fs.symlink(path.join(root, ".env.local"), path.join(root, "AGENTS.md"));
        const project = projectFor(root);
        const prompts: string[] = [];
        const progress: unknown[] = [];
        const logs: unknown[] = [];
        const generationLayer = Layer.mock(TextGeneration)({
          generateStructured: (input) => {
            prompts.push(input.prompt);
            expect(input.cwd).not.toBe(root);
            return Effect.succeed(draft);
          },
        });
        const result = yield* generateArchitectPlan({
          project,
          request: requestFor(project),
          onProgress: (phase, patch) =>
            Effect.sync(() => {
              progress.push({ phase, patch });
            }),
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              gitLayer,
              generationLayer,
              Logger.layer([
                Logger.make((options) => {
                  logs.push(options.message);
                }),
              ]),
            ),
          ),
        );
        const event = yield* decideOrchestrationCommand({
          readModel: { ...createEmptyReadModel(now), projects: [project] },
          command: {
            type: "architect.plan.save",
            commandId: CommandId.make("b01-save"),
            createdAt: now,
            projectId: project.id,
            plan: result.plan,
          },
        });
        const replayed = yield* Effect.gen(function* () {
          const store = yield* OrchestrationEventStore;
          for (const item of Array.isArray(event) ? event : [event]) yield* store.append(item);
          return yield* Stream.runCollect(store.readAll());
        }).pipe(
          Effect.provide(OrchestrationEventStoreLive.pipe(Layer.provide(SqlitePersistenceMemory))),
        );
        expect(replayed).toHaveLength(1);
        expect(result.plan.contextPaths).toEqual(["README.md"]);
        expect(prompts[0]).toContain("Safe instructions");
        expect(prompts[0]).not.toContain(".env.local");
        for (const serialized of [
          encodeJson(prompts),
          encodeJson(progress),
          encodeJson(result),
          encodeJson(replayed),
          encodeJson(logs),
        ]) {
          for (const secret of [fakeSecret, fakeToken, "B01_FAKE_KEY_MATERIAL"])
            expect(serialized).not.toContain(secret);
        }
        yield* fs.writeFileString(path.join(root, ".env.local"), `${fakeSecret}_CHANGED`);
        const again = yield* generateArchitectPlan({ project, request: requestFor(project) }).pipe(
          Effect.provide(Layer.mergeAll(gitLayer, generationLayer)),
        );
        expect(again.plan.contextFingerprint).toBe(result.plan.contextFingerprint);
        // Unsafe requests fail before a provider call and never retain raw paths in causes.
        const denied = yield* generateArchitectPlan({
          project,
          request: requestFor(project, [`src/.env.local/token=${fakeToken}`]),
        }).pipe(Effect.result, Effect.provide(Layer.mergeAll(gitLayer, generationLayer)));
        expect(denied._tag).toBe("Failure");
        expect(prompts).toHaveLength(2);
        expect(encodeJson(denied)).not.toContain(fakeToken);
      }),
  );

  it.effect("redacts provider failure diagnostics without retaining raw credential causes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "nebula-b01-error-" });
      const project = projectFor(root);
      const logs: unknown[] = [];
      const result = yield* generateArchitectPlan({ project, request: requestFor(project) }).pipe(
        Effect.tapError((error) => Effect.logWarning(error)),
        Effect.result,
        Effect.provide(
          Layer.mergeAll(
            gitLayer,
            Logger.layer([
              Logger.make((options) => {
                logs.push(options.message);
              }),
            ]),
            Layer.mock(TextGeneration)({
              generateStructured: () =>
                Effect.fail(
                  new TextGenerationError({
                    operation: "generateStructured",
                    detail: `Authentication token=${fakeToken}`,
                  }),
                ),
            }),
          ),
        ),
      );
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { category: "authentication_required" },
      });
      expect(encodeJson(result)).not.toContain(fakeToken);
      expect(logs).toHaveLength(1);
      expect(encodeJson(logs)).not.toContain(fakeToken);
    }),
  );

  it.effect("replanning uses redacted canonical evidence and performs no repository reads", () =>
    Effect.gen(function* () {
      const project = projectFor("/synthetic-not-readable");
      const input = {
        project,
        mission: {
          id: "mission",
          objective: "Safe",
          taskIds: ["task"],
          dependencies: [],
          contractVersions: [{ notes: `token=${fakeToken}` }],
        },
        run: {},
        tasks: [
          {
            id: "task",
            title: "Safe",
            objective: "Safe",
            status: "draft",
            acceptanceCriteria: [],
            reviews: [{ status: "completed", snapshotId: "snapshot", summary: fakeKey }],
            reviewSnapshot: { id: "snapshot" },
          },
        ],
        proposal: {
          id: "replan",
          sourceTaskId: "task",
          scope: "mission_subgraph",
          summary: "Safe",
          evidence: [],
          impact: {},
        },
        integrationBatch: null,
        modelSelection: selection,
      } as unknown as Parameters<typeof generateArchitectReplan>[0];
      const context = buildArchitectReplanContext(input);
      expect(context.text).not.toContain(fakeToken);
      expect(context.text).not.toContain("B01_FAKE_KEY_MATERIAL");
      expect(context.text).toContain("[REDACTED]");
      const oversized = buildArchitectReplanContext({
        ...input,
        mission: {
          ...input.mission,
          contractVersions: [{ notes: "😀".repeat(70_000) }],
        },
      } as unknown as Parameters<typeof buildArchitectReplanContext>[0]);
      expect(Buffer.byteLength(oversized.text)).toBeLessThanOrEqual(64 * 1024);
      let prompt = "";
      const fs = yield* FileSystem.FileSystem;
      const noRepositoryReads = Layer.succeed(FileSystem.FileSystem, {
        ...fs,
        readFile: () => Effect.die("Replanning must not read repository files"),
        readDirectory: () => Effect.die("Replanning must not discover the repository"),
      });
      const result = yield* generateArchitectReplan(input).pipe(
        Effect.provide(
          Layer.mergeAll(
            noRepositoryReads,
            Layer.mock(TextGeneration)({
              generateStructured: (request) => {
                prompt = request.prompt;
                return Effect.succeed({
                  scope: "mission_subgraph",
                  summary: "Safe",
                  rationale: "Safe",
                  changeSet: {
                    newTasks: [],
                    modifiedTasks: [],
                    dependencyChanges: [],
                    supersededTaskIds: [],
                    contractChanges: [],
                  },
                  preservedTaskIds: [],
                  affectedTaskIds: [],
                  risks: [],
                });
              },
            }),
          ),
        ),
      );
      expect(result.contextFingerprint).toBe(context.fingerprint);
      expect(prompt).not.toContain(fakeToken);
      expect(prompt).not.toContain("B01_FAKE_KEY_MATERIAL");
    }),
  );
});
