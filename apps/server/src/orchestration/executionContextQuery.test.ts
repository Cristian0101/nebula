import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ExecutionContext,
  GetExecutionContextInput,
  OrchestrationReadModel,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderSession,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { makeExecutionContextQuery } from "./executionContextQuery.ts";

const encodeContext = Schema.encodeSync(Schema.fromJsonString(ExecutionContext));
const decodeInput = Schema.decodeUnknownSync(GetExecutionContextInput);

const at = "2026-10-15T12:00:00.000Z";
const threadId = ThreadId.make("thread-1");
const snapshot = Schema.decodeUnknownSync(OrchestrationReadModel)({
  snapshotSequence: 1,
  updatedAt: at,
  projects: [
    {
      id: "project-1",
      title: "Project",
      workspaceRoot: "/repo",
      defaultModelSelection: null,
      scripts: [],
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    },
  ],
  threads: [
    {
      id: threadId,
      projectId: "project-1",
      title: "Thread",
      modelSelection: { instanceId: "personal", model: "model" },
      runtimeMode: "approval-required",
      branch: "feature",
      worktreePath: "/worktree",
      latestTurn: null,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      messages: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
  tasks: [
    {
      id: "task-1",
      projectId: "project-1",
      threadId,
      title: "Task",
      objective: "Test context",
      role: "builder",
      status: "draft",
      createdAt: at,
      updatedAt: at,
      activatedAt: null,
      completedAt: null,
      cancelledAt: null,
      workspace: {
        status: "ready",
        sourceRepository: "/repo",
        baseCommit: "abc",
        branch: "feature",
        path: "/worktree",
        createdAt: at,
        updatedAt: at,
        removedAt: null,
        failureCode: null,
        failureReason: null,
      },
    },
  ],
});
const session: ProviderSession = {
  threadId,
  provider: ProviderDriverKind.make("codex"),
  providerInstanceId: ProviderInstanceId.make("personal"),
  status: "ready",
  runtimeMode: "approval-required",
  cwd: "/worktree",
  createdAt: at,
  updatedAt: at,
  resumeCursor: { token: "private-resume-marker" },
};

function run(
  options: {
    snapshot?: OrchestrationReadModel;
    session?: ProviderSession;
    branch?: string;
    input?: { threadId: ThreadId };
    paths?: string[];
    missing?: boolean;
  } = {},
) {
  return makeExecutionContextQuery.pipe(
    Effect.flatMap((query) => query(options.input ?? { threadId })),
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(ProjectionSnapshotQuery)({
          getCommandReadModel: () => Effect.succeed(options.snapshot ?? snapshot),
        }),
        Layer.mock(ServerEnvironment)({
          getDescriptor: Effect.succeed({
            environmentId: EnvironmentId.make("host-1"),
            label: "Test host",
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "test",
            capabilities: { repositoryIdentity: true },
          }),
        }),
        Layer.mock(ProviderService)({
          listSessions: () => Effect.succeed([options.session ?? session]),
        }),
        FileSystem.layerNoop({
          realPath: (path) => {
            options.paths?.push(path);
            return options.missing
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "NotFound",
                    module: "FileSystem",
                    method: "realPath",
                    description: "sensitive filesystem diagnostic",
                  }),
                )
              : Effect.succeed(path);
          },
        }),
        Layer.mock(GitWorkflowService)({
          localStatus: () =>
            Effect.succeed({
              isRepo: true,
              hasPrimaryRemote: true,
              isDefaultRef: false,
              refName: options.branch ?? "feature",
              hasWorkingTreeChanges: false,
              workingTree: { files: [], insertions: 0, deletions: 0 },
            }),
        }),
      ),
    ),
  );
}

describe("execution context query", () => {
  it.effect("keeps a missing provider continuation unknown", () =>
    Effect.gen(function* () {
      const result = yield* run({ session: { ...session, resumeCursor: null } });
      expect(result.providerSession?.continuation).toBe("unknown");
    }),
  );
  it.effect(
    "resolves canonical environment, Task, workspace, session and permissions without secrets",
    () =>
      Effect.gen(function* () {
        const result = yield* run();
        expect(result).toMatchObject({
          environmentId: "host-1",
          workspacePath: "/worktree",
          currentBranch: "feature",
          task: { id: "task-1" },
          providerSession: { instanceId: "personal", continuation: "recorded" },
          permissions: "approval-required",
          issues: [],
        });
        expect(encodeContext(result)).not.toContain("private-resume-marker");
        expect(encodeContext(result)).not.toContain("resumeCursor");
      }),
  );
  it.effect("reports Git, Task, and provider context mismatches", () =>
    Effect.gen(function* () {
      const task = snapshot.tasks![0]!;
      const result = yield* run({
        branch: "wrong-branch",
        snapshot: {
          ...snapshot,
          tasks: [{ ...task, workspace: { ...task.workspace!, path: "/wrong-worktree" } }],
        },
        session: {
          ...session,
          cwd: "/wrong-session",
          providerInstanceId: ProviderInstanceId.make("work"),
          runtimeMode: "full-access",
        },
      });
      expect(result.issues).toEqual([
        "branch-mismatch",
        "task-context-mismatch",
        "session-context-mismatch",
      ]);
      expect(result.permissions).toBe("full-access");
    }),
  );
  it.effect("never uses a frontend path as its workspace", () =>
    Effect.gen(function* () {
      const input = decodeInput({
        threadId,
        cwd: "/untrusted",
      });
      const paths: string[] = [];
      const result = yield* run({ input, paths });
      expect(result.workspacePath).toBe("/worktree");
      expect(paths).not.toContain("/untrusted");
    }),
  );
  it.effect("fails closed for unknown threads without leaking internal errors", () =>
    Effect.gen(function* () {
      const result = yield* run({ input: { threadId: ThreadId.make("missing") } }).pipe(
        Effect.flip,
      );
      expect(result.message).toBe("Could not resolve execution context");
      expect(result.cause).toBeUndefined();
    }),
  );
  it.effect("does not call an unresolved workspace verified", () =>
    Effect.gen(function* () {
      const result = yield* run({ missing: true });
      expect(result.workspacePath).toBeNull();
      expect(result.issues).toContain("workspace-unavailable");
    }),
  );
});
