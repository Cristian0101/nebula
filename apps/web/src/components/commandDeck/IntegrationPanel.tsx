import { IntegrationBatchId } from "@t3tools/contracts";
import { canRetryIntegrationOperation } from "@t3tools/shared/missionRunner";
import type {
  EnvironmentId,
  IntegrationBatch,
  OrchestrationProjectShell,
  OrchestrationTask,
  TaskId,
} from "@t3tools/contracts";
import { ArrowDownIcon, ArrowUpIcon, GitMergeIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { randomUUID } from "../../lib/utils";
import { getRenderablePatch, resolveFileDiffPath } from "../../lib/diffRendering";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { shellEnvironment } from "../../state/shell";
import { useAtomCommand } from "../../state/use-atom-command";
import { StyledDiffCodeView } from "../diffs/StyledDiffCodeView";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

function eligibilityReasons(project: OrchestrationProjectShell, task: OrchestrationTask): string[] {
  const reasons: string[] = [];
  const result = task.result ?? null;
  if (task.status !== "completed" || result === null) reasons.push("Task is not completed");
  if (!task.reviewSnapshot || task.reviewSnapshot.id !== result?.snapshotId) {
    reasons.push("Approved snapshot is missing");
  }
  if (task.ownership?.required === true && task.ownership.status !== "valid") {
    reasons.push("Ownership validation is not valid");
  }
  if (task.handoff?.status !== "ready" || task.handoff.snapshotId !== result?.snapshotId) {
    reasons.push("Handoff is not ready");
  }
  for (const gate of (project.qualityPolicy?.gates ?? []).filter(
    (candidate) => candidate.enabled && candidate.required,
  )) {
    if (
      !(task.qualityGateRuns ?? []).some(
        (run) =>
          run.snapshotId === result?.snapshotId &&
          run.gateId === gate.id &&
          run.command === gate.command &&
          run.status === "passed",
      )
    ) {
      reasons.push(`${gate.label} has not passed`);
    }
  }
  if (
    task.reviewRequired === true &&
    !(task.reviews ?? []).some(
      (review) =>
        review.snapshotId === result?.snapshotId &&
        review.status === "completed" &&
        (review.verdict === "approve" || review.verdict === "approve_with_notes"),
    )
  ) {
    reasons.push("Independent review is not approved");
  }
  return reasons;
}

function overlapPaths(tasks: ReadonlyArray<OrchestrationTask>): string[] {
  const owners = new Map<string, Set<string>>();
  for (const task of tasks) {
    for (const file of task.result?.files ?? []) {
      for (const path of [file.path, file.previousPath]) {
        if (!path) continue;
        const taskIds = owners.get(path) ?? new Set<string>();
        taskIds.add(task.id);
        owners.set(path, taskIds);
      }
    }
  }
  return [...owners.entries()]
    .filter(([, taskIds]) => taskIds.size > 1)
    .map(([path]) => path)
    .sort();
}

function IntegrationChanges({
  environmentId,
  project,
  batch,
  taskById,
}: {
  readonly environmentId: EnvironmentId;
  readonly project: OrchestrationProjectShell;
  readonly batch: IntegrationBatch;
  readonly taskById: ReadonlyMap<TaskId, OrchestrationTask>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const changes = useEnvironmentQuery(
    open && batch.workspacePath
      ? projectEnvironment.integrationChanges({
          environmentId,
          input: { projectId: project.id, batchId: batch.id },
        })
      : null,
  );
  const fileDiff = useEnvironmentQuery(
    open && batch.workspacePath && selectedPath
      ? projectEnvironment.integrationFileDiff({
          environmentId,
          input: { projectId: project.id, batchId: batch.id, path: selectedPath },
        })
      : null,
  );
  const renderable = useMemo(
    () =>
      getRenderablePatch(
        fileDiff.data?.patch,
        `integration-diff:${batch.id}:${selectedPath ?? ""}`,
      ),
    [batch.id, fileDiff.data?.patch, selectedPath],
  );
  const items = useMemo(
    () =>
      renderable?.kind === "files"
        ? renderable.files.map((entry, index) => ({
            id: `${resolveFileDiffPath(entry)}:${index}`,
            type: "diff" as const,
            fileDiff: entry,
            collapsed: false,
          }))
        : [],
    [renderable],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="font-medium">Combined diff</span>
        <span className="text-muted-foreground">
          {changes.data ? `${changes.data.files.length} files` : "Base to Integration HEAD"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-black/[0.08]">
          {changes.isPending ? (
            <p className="p-2 text-muted-foreground">Inspecting Integration state…</p>
          ) : null}
          {changes.error ? <p className="p-2 text-destructive">{changes.error}</p> : null}
          {changes.data ? (
            <div className="grid min-h-48 md:grid-cols-[16rem_minmax(0,1fr)]">
              <div className="max-h-80 overflow-auto border-b border-black/[0.08] md:border-r md:border-b-0">
                {changes.data.files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className={`block w-full px-2 py-1.5 text-left hover:bg-muted/30 ${selectedPath === file.path ? "bg-muted/50" : ""}`}
                    onClick={() => setSelectedPath(file.path)}
                  >
                    <span className="block truncate font-mono text-[11px]">{file.path}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {[
                        ...file.taskIds.map((taskId) => taskById.get(taskId)?.title ?? taskId),
                        ...(file.humanChange ? ["Human Integration change"] : []),
                      ].join(" · ") || "Unattributed change"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="min-h-48 overflow-hidden bg-background">
                {fileDiff.isPending ? (
                  <p className="p-3 text-muted-foreground">Loading file diff…</p>
                ) : null}
                {fileDiff.error ? <p className="p-3 text-destructive">{fileDiff.error}</p> : null}
                {fileDiff.data?.binary ? (
                  <p className="p-3 text-muted-foreground">Binary file. Text diff unavailable.</p>
                ) : null}
                {fileDiff.data?.truncated ? (
                  <p className="p-3 text-muted-foreground">
                    This patch is too large for inline rendering. Open the Integration workspace.
                  </p>
                ) : null}
                {items.length > 0 ? (
                  <StyledDiffCodeView className="h-80 overflow-auto" items={items} />
                ) : selectedPath && !fileDiff.isPending && !fileDiff.data?.binary ? (
                  <p className="p-3 text-muted-foreground">No renderable patch for this file.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function IntegrationPanel({
  environmentId,
  project,
  tasks,
}: {
  readonly environmentId: EnvironmentId;
  readonly project: OrchestrationProjectShell;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
}) {
  const createIntegration = useAtomCommand(projectEnvironment.createIntegration, {
    reportFailure: false,
  });
  const continueIntegration = useAtomCommand(projectEnvironment.continueIntegration, {
    reportFailure: false,
  });
  const abortIntegration = useAtomCommand(projectEnvironment.abortIntegration, {
    reportFailure: false,
  });
  const validateIntegration = useAtomCommand(projectEnvironment.validateIntegration, {
    reportFailure: false,
  });
  const removeWorkspace = useAtomCommand(projectEnvironment.removeIntegrationWorkspace, {
    reportFailure: false,
  });
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const [selected, setSelected] = useState<ReadonlyArray<TaskId>>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [busy, setBusy] = useState(false);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const selectedTasks = selected.flatMap((id) => {
    const task = taskById.get(id);
    return task ? [task] : [];
  });
  const overlaps = overlapPaths(selectedTasks);
  const batches = project.integrationBatches ?? [];
  const activeBatch = batches.at(-1) ?? null;
  const showActiveBatch = activeBatch !== null && !showCreator;

  const run = async (title: string, command: () => Promise<{ readonly _tag: string }>) => {
    setBusy(true);
    const result = await command();
    setBusy(false);
    if (result._tag === "Failure") {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description: "The Integration command was rejected. Refresh the Batch state and retry.",
        }),
      );
    }
  };

  const move = (taskId: TaskId, delta: -1 | 1) => {
    const index = selected.indexOf(taskId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSelected(next);
  };

  return (
    <section
      className="rounded-xl border border-black/[0.08] bg-card/95 p-3"
      aria-label="Integration Batches"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitMergeIcon className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-medium">Integration Batch</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Combine approved Task Results in an isolated branch. Nebula never merges main or opens a
            PR here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeBatch ? <Badge variant="outline">{activeBatch.status}</Badge> : null}
          {activeBatch && ["ready", "failed", "cancelled"].includes(activeBatch.status) ? (
            <Button size="xs" variant="outline" onClick={() => setShowCreator((value) => !value)}>
              {showCreator ? "View latest Batch" : "New Batch"}
            </Button>
          ) : null}
        </div>
      </div>

      {showActiveBatch && activeBatch ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-2 text-xs">
            <p>
              <span className="text-muted-foreground">Branch:</span>{" "}
              <code>{activeBatch.branch}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Base:</span>{" "}
              <code>{activeBatch.baseCommit.slice(0, 12)}</code>
            </p>
            <p>
              {activeBatch.tasks.filter((task) => task.status === "applied").length} of{" "}
              {activeBatch.tasks.length} artifacts applied
            </p>
            {activeBatch.conflict ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2">
                <p className="flex items-center gap-1 font-medium">
                  <TriangleAlertIcon className="size-3.5" /> Conflict paused
                </p>
                <p className="mt-1 text-muted-foreground">
                  Resolve and stage these files in the Integration workspace:
                </p>
                <ul className="mt-1 list-disc pl-4 font-mono text-[11px]">
                  {activeBatch.conflict.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {activeBatch.failureReason ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-destructive">
                {activeBatch.failureReason}
              </p>
            ) : null}
            {activeBatch.qualityGateRuns.length > 0 ? (
              <div className="space-y-1 rounded-lg bg-muted/30 p-2">
                {activeBatch.qualityGateRuns.map((run) => (
                  <p key={run.id}>
                    {run.status === "passed" ? "✓" : "○"} {run.label} · {run.status}
                  </p>
                ))}
              </div>
            ) : activeBatch.status === "ready" ? (
              <p className="text-muted-foreground">
                Ready · No approved project gates were configured.
              </p>
            ) : null}
            {activeBatch.humanChanges.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-black/[0.08] p-2">
                <p className="font-medium">Human Integration changes</p>
                {activeBatch.humanChanges.map((change) => (
                  <p key={change.commit} className="text-muted-foreground">
                    {change.summary} · {change.files.length} files · {change.commit.slice(0, 12)}
                  </p>
                ))}
              </div>
            ) : null}
            <IntegrationChanges
              environmentId={environmentId}
              project={project}
              batch={activeBatch}
              taskById={taskById}
            />
          </div>
          <div className="flex flex-wrap items-start gap-1.5 lg:max-w-56 lg:justify-end">
            {activeBatch.workspacePath ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  void openInEditor({
                    environmentId,
                    input: { cwd: activeBatch.workspacePath!, editor: "file-manager" },
                  })
                }
              >
                Open Integration Workspace
              </Button>
            ) : null}
            {activeBatch.status === "conflict" ? (
              <Button
                size="xs"
                disabled={busy}
                onClick={() =>
                  void run("Could not continue Integration", () =>
                    continueIntegration({
                      environmentId,
                      input: { projectId: project.id, batchId: activeBatch.id },
                    }),
                  )
                }
              >
                Continue after resolution
              </Button>
            ) : null}
            {canRetryIntegrationOperation(activeBatch) ? (
              <Button
                size="xs"
                disabled={busy}
                onClick={() =>
                  void run("Could not retry Integration", () =>
                    continueIntegration({
                      environmentId,
                      input: { projectId: project.id, batchId: activeBatch.id },
                    }),
                  )
                }
              >
                Retry operation
              </Button>
            ) : null}
            {["preparing", "applying", "conflict", "validating"].includes(activeBatch.status) ? (
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run("Could not abort Integration", () =>
                    abortIntegration({
                      environmentId,
                      input: { projectId: project.id, batchId: activeBatch.id },
                    }),
                  )
                }
              >
                Abort Batch
              </Button>
            ) : null}
            {activeBatch.status === "failed" &&
            activeBatch.tasks.every((task) => task.status === "applied") ? (
              <Button
                size="xs"
                disabled={busy}
                onClick={() =>
                  void run("Could not validate Integration", () =>
                    validateIntegration({
                      environmentId,
                      input: { projectId: project.id, batchId: activeBatch.id },
                    }),
                  )
                }
              >
                Run final validation
              </Button>
            ) : null}
            {["ready", "failed", "cancelled"].includes(activeBatch.status) &&
            activeBatch.workspacePath ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run("Could not remove Integration workspace", () =>
                    removeWorkspace({
                      environmentId,
                      input: { projectId: project.id, batchId: activeBatch.id },
                    }),
                  )
                }
              >
                Remove workspace
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            {tasks
              .filter((task) => task.status === "completed")
              .map((task) => {
                const reasons = eligibilityReasons(project, task);
                const checked = selected.includes(task.id);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg border border-black/[0.08] p-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${task.title}`}
                      disabled={reasons.length > 0}
                      checked={checked}
                      onChange={(event) =>
                        setSelected(
                          event.currentTarget.checked
                            ? [...selected, task.id]
                            : selected.filter((id) => id !== task.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {reasons.join(" · ") || task.result?.baseCommit}
                      </p>
                    </div>
                    {checked ? (
                      <>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Move ${task.title} up`}
                          onClick={() => move(task.id, -1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Move ${task.title} down`}
                          onClick={() => move(task.id, 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            {tasks.every((task) => task.status !== "completed") ? (
              <p className="text-xs text-muted-foreground">
                Complete and approve Tasks before creating an Integration Batch.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 rounded-lg bg-muted/25 p-3 text-xs">
            <p className="font-medium">Selected order</p>
            {selected.map((id, index) => (
              <p key={id}>
                {index + 1}. {taskById.get(id)?.title ?? id}
              </p>
            ))}
            {overlaps.length > 0 ? (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/25 p-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                />
                <span>Acknowledge overlapping paths: {overlaps.join(", ")}</span>
              </label>
            ) : null}
            <Button
              size="sm"
              disabled={busy || selected.length === 0 || (overlaps.length > 0 && !acknowledged)}
              onClick={() =>
                void (async () => {
                  await run("Could not create Integration", () =>
                    createIntegration({
                      environmentId,
                      input: {
                        projectId: project.id,
                        batchId: IntegrationBatchId.make(randomUUID()),
                        taskIds: selected,
                        acknowledgeOverlaps: acknowledged,
                      },
                    }),
                  );
                  setShowCreator(false);
                })()
              }
            >
              Create Integration
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
