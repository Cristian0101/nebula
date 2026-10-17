import type {
  GetProjectInventoryInput,
  GetProjectWorkspaceContextInput,
  ProjectId,
  ProjectInventory,
  ProjectInventoryIssue,
  ProjectInventoryWorktree,
  ProjectObservation,
  ProjectWorkspaceContext,
  OrchestrationShellSnapshot,
  ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";
import { OrchestrationGetSnapshotError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Cache from "effect/Cache";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { GitWorkflowService } from "../git/GitWorkflowService.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import { canonicalWorkspacePath } from "./executionContextQuery.ts";
import { resolveThreadWorkspaceCwd } from "../checkpointing/Utils.ts";
import {
  inventoryHash,
  inventoryNow,
  inventoryObservation,
  type GitInventory,
} from "../vcs/projectInventory.ts";

const ASSOCIATION_LIMIT = 500;
const RESULT_ASSOCIATION_LIMIT = 200;
const age = (
  observation: ProjectObservation,
  now: string,
  cache = observation.cache,
): ProjectObservation => ({
  ...observation,
  cache,
  ageMs: observation.observedAt
    ? Math.max(0, Date.parse(now) - Date.parse(observation.observedAt))
    : 0,
});
const identityFor = (environmentId: string, projectId: ProjectId, inventory: GitInventory) => ({
  projectId,
  environmentId: environmentId as ExecutionEnvironmentDescriptor["environmentId"],
  repositoryId: inventoryHash(environmentId, projectId, inventory.commonDir),
  projectRoot: inventory.root,
});
const worktreesFor = (environmentId: string, projectId: ProjectId, inventory: GitInventory) =>
  inventory.snapshot.worktrees.map((record) => ({
    ...record,
    workspaceKey: inventoryHash(environmentId, projectId, inventory.commonDir, record.path),
  }));

/** Display-only composition of canonical environment, projection and Git services.
 * Neither this result nor its opaque selectors authorize execution or mutation.
 */
export const makeProjectInventoryQuery = Effect.gen(function* () {
  const projections = yield* ProjectionSnapshotQuery;
  const environment = yield* ServerEnvironment;
  const git = yield* GitWorkflowService;
  const providers = yield* ProviderService;
  const fs = yield* FileSystem.FileSystem;
  const realPath = (path: string | null | undefined) => canonicalWorkspacePath(fs, path);
  const load = (projectId: ProjectId, refresh = false) =>
    Effect.gen(function* () {
      const descriptor = yield* environment.getDescriptor;
      const snapshot = yield* projections.getShellSnapshot();
      const project = snapshot.projects.find((entry) => entry.id === projectId);
      const inventory = project
        ? yield* git
            .observeProjectInventory({ cwd: project.workspaceRoot, refresh })
            .pipe(Effect.orElseSucceed(() => null))
        : null;
      const now = yield* inventoryNow;
      return { descriptor, snapshot, project, inventory, now };
    });
  const baseObservations = (
    snapshot: OrchestrationShellSnapshot,
    inventory: GitInventory | null,
    now: string,
  ): ProjectObservation[] => [
    age(inventoryObservation("associations", "projection", snapshot.updatedAt), now),
    ...(inventory?.snapshot.observations.map((entry) => age(entry, now, inventory.cache)) ?? []),
    ...(inventory
      ? [inventoryObservation("identity", "local-git", inventory.identityObservedAt)]
      : []),
  ];
  const getProjectInventory = (input: GetProjectInventoryInput) =>
    Effect.gen(function* () {
      const { descriptor, snapshot, project, inventory, now } = yield* load(
        input.projectId,
        input.refresh,
      );
      const base = {
        environmentId: descriptor.environmentId,
        projectId: input.projectId,
        identity: inventory
          ? identityFor(descriptor.environmentId, input.projectId, inventory)
          : null,
        observations: baseObservations(snapshot, inventory, now),
        remoteFreshness: "not-verified" as const,
        refresh: inventory?.refresh ?? ("unavailable" as const),
      };
      const empty = {
        ...base,
        refs: [],
        worktrees: [],
        totals: { refs: 0, worktrees: 0 },
        nextCursor: null,
      };
      if (!project || !inventory)
        return {
          ...empty,
          state: "unavailable",
          issues: [project ? "workspace-unavailable" : "project-unavailable"],
        } satisfies ProjectInventory;
      const worktrees = worktreesFor(descriptor.environmentId, input.projectId, inventory);
      const issues = [...inventory.snapshot.issues];
      const cursorId = inventoryHash(
        descriptor.environmentId,
        input.projectId,
        inventory.snapshot.id,
        input.refKind ?? "all",
      );
      const refs = inventory.snapshot.refs.filter(
        (entry) =>
          !input.refKind ||
          (input.refKind === "remote" ? entry.kind === "remote-tracking" : entry.kind === "local"),
      );
      const refOffset = input.cursor?.refs ?? 0,
        wtOffset = input.cursor?.worktrees ?? 0;
      if (input.cursor && input.cursor.snapshotId !== cursorId)
        return { ...empty, state: "invalid", issues: ["stale-cursor"] } satisfies ProjectInventory;
      if (refOffset > refs.length || wtOffset > worktrees.length)
        return {
          ...empty,
          state: "invalid",
          issues: ["invalid-cursor"],
        } satisfies ProjectInventory;
      const limit = input.limit ?? 100;
      const refEnd = Math.min(refOffset + limit, refs.length),
        wtEnd = Math.min(wtOffset + limit, worktrees.length);
      const associations = new Map<string, string[]>();
      for (const worktree of worktrees)
        if (worktree.branchRef) {
          const keys = associations.get(worktree.branchRef) ?? [];
          keys.push(worktree.workspaceKey);
          associations.set(worktree.branchRef, keys);
        }
      return {
        ...base,
        state: issues.length ? "partial" : "available",
        issues,
        refs: refs
          .slice(refOffset, refEnd)
          .map((entry) => ({ ...entry, workspaceKeys: associations.get(entry.fullRefName) ?? [] })),
        worktrees: worktrees.slice(wtOffset, wtEnd),
        totals: { refs: refs.length, worktrees: worktrees.length },
        nextCursor:
          refEnd < refs.length || wtEnd < worktrees.length
            ? { snapshotId: cursorId, refs: refEnd, worktrees: wtEnd }
            : null,
      } satisfies ProjectInventory;
    });

  const getProjectWorkspaceContext = (input: GetProjectWorkspaceContextInput) =>
    Effect.gen(function* () {
      const { descriptor, snapshot, project, inventory, now } = yield* load(input.projectId);
      const issues: ProjectInventoryIssue[] = [];
      const observations = baseObservations(snapshot, inventory, now);
      const base = {
        environmentId: descriptor.environmentId,
        projectId: input.projectId,
        identity: inventory
          ? identityFor(descriptor.environmentId, input.projectId, inventory)
          : null,
        workspace: null as ProjectInventoryWorktree | null,
        git: null,
        taskIds: [],
        missionIds: [],
        integrationBatchIds: [],
        threadIds: [],
        providerSessions: [],
        observations,
        terminalActivity: "requires-terminal-api" as const,
        processActivity: "not-observed" as const,
        externalServices: "not-observed" as const,
      };
      if (!project || !inventory)
        return {
          ...base,
          state: "unavailable",
          issues: [project ? "workspace-unavailable" : "project-unavailable"],
        } satisfies ProjectWorkspaceContext;
      const workspaces = worktreesFor(descriptor.environmentId, input.projectId, inventory);
      const workspace = workspaces.find((entry) => entry.workspaceKey === input.workspaceKey);
      if (!workspace)
        return {
          ...base,
          state: "invalid",
          issues: ["workspace-invalid"],
        } satisfies ProjectWorkspaceContext;
      const selected = yield* git
        .inspectProjectWorkspace({ cwd: workspace.path, commonDir: inventory.commonDir })
        .pipe(Effect.orElseSucceed(() => null));
      if (!selected || selected.root !== workspace.realPath)
        return {
          ...base,
          workspace,
          state: "unavailable",
          issues: ["workspace-unavailable"],
        } satisfies ProjectWorkspaceContext;
      // Inspection verifies current realpath, top-level and common directory.
      // Registration/path flags retain the inventory observation timestamp.
      const bound = {
        ...workspace,
        headSha: selected.git.headSha,
        branchRef: selected.git.branchRef,
        detached: selected.git.detached,
        headState: selected.git.headSha ? ("resolved" as const) : ("unborn" as const),
        availability: "present" as const,
      };
      observations.push(inventoryObservation("status", "local-git", selected.observedAt));
      const branch = selected.git.branchRef?.slice("refs/heads/".length) ?? null;
      const projectTasks = (snapshot.tasks ?? []).filter((entry) => entry.projectId === project.id);
      const projectThreads = snapshot.threads.filter((entry) => entry.projectId === project.id);
      const projectBatches = project.integrationBatches ?? [];
      if (
        projectTasks.length > ASSOCIATION_LIMIT ||
        projectThreads.length > ASSOCIATION_LIMIT ||
        projectBatches.length > ASSOCIATION_LIMIT
      )
        issues.push("association-limit");
      // Per-query bounded realpath memoization, also shared by canonical Thread/Task/session checks.
      const paths = yield* Cache.makeWith((value: string) => realPath(value), {
        capacity: 2_000,
        timeToLive: () => "1 minute",
      });
      const canonical = (value: string | null | undefined) =>
        value ? Cache.get(paths, value) : Effect.succeed(null);
      const tasks = (yield* Effect.filter(
        projectTasks.slice(0, ASSOCIATION_LIMIT),
        (task) =>
          Effect.gen(function* () {
            if (
              !task.workspace?.path ||
              task.workspace.status !== "ready" ||
              task.workspace.removedAt
            )
              return false;
            if ((yield* canonical(task.workspace.path)) !== selected.root) return false;
            const valid =
              task.workspace.branch === branch &&
              (yield* canonical(task.workspace.sourceRepository)) === inventory.root;
            if (!valid) issues.push("association-mismatch");
            return valid;
          }),
        { concurrency: 4 },
      )).slice(0, RESULT_ASSOCIATION_LIMIT);
      const batches = (yield* Effect.filter(
        projectBatches.slice(0, ASSOCIATION_LIMIT),
        (batch) =>
          Effect.gen(function* () {
            if (
              !batch.workspacePath ||
              batch.removedAt ||
              (yield* canonical(batch.workspacePath)) !== selected.root
            )
              return false;
            const valid =
              batch.branch === branch &&
              (yield* canonical(batch.sourceRepository)) === inventory.root;
            if (!valid) issues.push("association-mismatch");
            return valid;
          }),
        { concurrency: 4 },
      )).slice(0, RESULT_ASSOCIATION_LIMIT);
      const threads = (yield* Effect.filter(
        projectThreads.slice(0, ASSOCIATION_LIMIT),
        (thread) =>
          Effect.gen(function* () {
            const threadPath = resolveThreadWorkspaceCwd({ thread, projects: [project] });
            if ((yield* canonical(threadPath)) !== selected.root) return false;
            const owners = projectTasks.filter((task) => task.threadId === thread.id);
            if (
              thread.branch !== branch ||
              owners.length > 1 ||
              owners.some((task) => !tasks.includes(task))
            ) {
              issues.push("association-mismatch");
              return false;
            }
            return true;
          }),
        { concurrency: 4 },
      )).slice(0, RESULT_ASSOCIATION_LIMIT);
      if (tasks.length > 1 || batches.length > 1 || (tasks.length > 0 && batches.length > 0))
        issues.push("ambiguous-ownership");
      const taskIds = tasks.map((entry) => entry.id);
      const missions = (snapshot.missions ?? []).filter(
        (entry) =>
          entry.projectId === project.id &&
          (entry.taskIds.some((id) => taskIds.includes(id)) ||
            batches.some((batch) => batch.missionId === entry.id)),
      );
      if (
        tasks.length === RESULT_ASSOCIATION_LIMIT ||
        batches.length === RESULT_ASSOCIATION_LIMIT ||
        threads.length === RESULT_ASSOCIATION_LIMIT ||
        missions.length > RESULT_ASSOCIATION_LIMIT
      )
        issues.push("association-limit");
      const sessions = yield* providers.listSessions(threads.map((entry) => entry.id)).pipe(
        Effect.timeoutOption("3 seconds"),
        Effect.catchCause(() => Effect.succeed(Option.none())),
      );
      const byThread = new Map(threads.map((thread) => [thread.id, thread]));
      const providerSessions: ProjectWorkspaceContext["providerSessions"][number][] = [];
      if (Option.isNone(sessions))
        observations.push(
          inventoryObservation("sessions", "provider-runtime", null, "unavailable"),
        );
      else {
        for (const session of sessions.value) {
          const thread = byThread.get(session.threadId);
          if (!thread) continue;
          if (
            !session.providerInstanceId ||
            thread.modelSelection.instanceId !== session.providerInstanceId ||
            thread.runtimeMode !== session.runtimeMode ||
            (yield* canonical(session.cwd)) !== selected.root
          ) {
            issues.push("session-context-mismatch");
            continue;
          }
          providerSessions.push({
            threadId: session.threadId,
            instanceId: session.providerInstanceId,
            driver: session.provider,
            status: session.status,
            updatedAt: session.updatedAt,
          });
          if (providerSessions.length === RESULT_ASSOCIATION_LIMIT) {
            issues.push("association-limit");
            break;
          }
        }
        // Sampling the runtime does not make each session's persisted status newly observed.
        observations.push(
          inventoryObservation("sessions", "provider-runtime", yield* inventoryNow),
        );
      }
      issues.push(...inventory.snapshot.issues);
      return {
        ...base,
        workspace: bound,
        git: selected.git,
        taskIds,
        missionIds: missions.slice(0, RESULT_ASSOCIATION_LIMIT).map((entry) => entry.id),
        integrationBatchIds: batches.map((entry) => entry.id),
        threadIds: threads.map((entry) => entry.id),
        providerSessions,
        state: issues.length || Option.isNone(sessions) ? "partial" : "available",
        issues: [...new Set(issues)],
      } satisfies ProjectWorkspaceContext;
    });
  const protect = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.timeout("20 seconds"),
      Effect.mapError(
        () => new OrchestrationGetSnapshotError({ message: "Project observation unavailable" }),
      ),
    );
  return {
    getProjectInventory: (input: GetProjectInventoryInput) => protect(getProjectInventory(input)),
    getProjectWorkspaceContext: (input: GetProjectWorkspaceContextInput) =>
      protect(getProjectWorkspaceContext(input)),
  };
});
