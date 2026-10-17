import type { ExecutionContext, ThreadId } from "@t3tools/contracts";
import { OrchestrationGetSnapshotError } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { resolveThreadWorkspaceCwd } from "../checkpointing/Utils.ts";

export const canonicalWorkspacePath = (
  fs: FileSystem.FileSystem,
  path: string | null | undefined,
) => (path ? fs.realPath(path).pipe(Effect.orElseSucceed(() => null)) : Effect.succeed(null));

/** Composes existing read services. The result never authorizes or retargets execution. */
export const makeExecutionContextQuery = Effect.gen(function* () {
  const projections = yield* ProjectionSnapshotQuery;
  const environment = yield* ServerEnvironment;
  const git = yield* GitWorkflowService;
  const providers = yield* ProviderService;
  const fs = yield* FileSystem.FileSystem;
  const realPath = (path: string | null | undefined) => canonicalWorkspacePath(fs, path);

  return (input: { readonly threadId: ThreadId }) =>
    Effect.gen(function* () {
      const snapshot = yield* projections.getCommandReadModel();
      const thread = snapshot.threads.find(
        (entry) => entry.id === input.threadId && entry.deletedAt === null,
      );
      const project = snapshot.projects.find(
        (entry) => entry.id === thread?.projectId && entry.deletedAt === null,
      );
      if (!thread || !project)
        return yield* new OrchestrationGetSnapshotError({ message: "Execution context not found" });
      const descriptor = yield* environment.getDescriptor;
      const tasks = (snapshot.tasks ?? []).filter((entry) => entry.threadId === thread.id);
      const task = tasks.length === 1 ? tasks[0] : undefined;
      const cwd = yield* realPath(resolveThreadWorkspaceCwd({ thread, projects: [project] }));
      const taskPath = yield* realPath(task?.workspace?.path);
      const sessions = yield* providers.listSessions();
      const session = sessions.find((entry) => entry.threadId === thread.id);
      const sessionPath = yield* realPath(session?.cwd);
      const status = cwd
        ? yield* git.localStatus({ cwd }).pipe(Effect.orElseSucceed(() => null))
        : null;
      const issues: Array<ExecutionContext["issues"][number]> = [];
      if (!cwd) issues.push("workspace-unavailable");
      if (!status?.isRepo) issues.push("git-unavailable");
      if (status?.isRepo && thread.branch !== status.refName) issues.push("branch-mismatch");
      if (tasks.length > 1) issues.push("multiple-task-bindings");
      if (
        task &&
        (task.projectId !== project.id ||
          task.workspace?.status !== "ready" ||
          !taskPath ||
          taskPath !== cwd ||
          task.workspace.branch !== thread.branch)
      )
        issues.push("task-context-mismatch");
      if (
        session &&
        (!sessionPath ||
          sessionPath !== cwd ||
          session.providerInstanceId !== thread.modelSelection.instanceId ||
          session.runtimeMode !== thread.runtimeMode)
      )
        issues.push("session-context-mismatch");
      return {
        environmentId: descriptor.environmentId,
        environmentLabel: descriptor.label,
        threadId: thread.id,
        project: { id: project.id, title: project.title },
        repositoryKey: project.repositoryIdentity?.canonicalKey ?? null,
        workspacePath: cwd,
        worktreePath: thread.worktreePath ? cwd : null,
        recordedBranch: thread.branch,
        currentBranch: status?.isRepo ? status.refName : null,
        task: task ? { id: task.id, title: task.title } : null,
        providerSession: session
          ? {
              threadId: session.threadId,
              instanceId: session.providerInstanceId ?? null,
              driver: session.provider,
              status: session.status,
              continuation: session.resumeCursor == null ? "unknown" : "recorded",
            }
          : null,
        permissions: session?.runtimeMode ?? thread.runtimeMode,
        issues,
        observedAt: yield* Effect.map(DateTime.now, DateTime.formatIso),
      } satisfies ExecutionContext;
    }).pipe(
      Effect.mapError(
        () => new OrchestrationGetSnapshotError({ message: "Could not resolve execution context" }),
      ),
    );
});
