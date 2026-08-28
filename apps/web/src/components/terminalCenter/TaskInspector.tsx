import { TaskReviewId, type EnvironmentId, type OrchestrationTask } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { randomUUID } from "../../lib/utils";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { taskEnvironment } from "../../state/tasks";
import { useAtomCommand } from "../../state/use-atom-command";
import { TaskChangesPanel } from "../ProjectTasksSection";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

interface TaskInspectorProps {
  readonly environmentId: EnvironmentId;
  readonly task: OrchestrationTask;
  readonly builderProviderInstanceId: string | null;
  readonly builderProviderLabel: string;
  readonly providers: ReadonlyArray<ProviderInstanceEntry>;
  readonly onInterrupt: () => Promise<void>;
  readonly onStop: () => Promise<void>;
  readonly onReplaceProvider: (provider: ProviderInstanceEntry) => Promise<void>;
}

function lines(value: string): ReadonlyArray<string> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function reportFailure(title: string) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: "The canonical Task runtime rejected this transition.",
    }),
  );
}

export function TaskInspector({
  environmentId,
  task,
  builderProviderInstanceId,
  builderProviderLabel,
  providers,
  onInterrupt,
  onStop,
  onReplaceProvider,
}: TaskInspectorProps) {
  const validateOwnership = useAtomCommand(taskEnvironment.validateOwnership, {
    reportFailure: false,
  });
  const prepareReview = useAtomCommand(taskEnvironment.prepareReview, { reportFailure: false });
  const updateHandoff = useAtomCommand(taskEnvironment.updateHandoff, { reportFailure: false });
  const runQualityGates = useAtomCommand(taskEnvironment.runQualityGates, {
    reportFailure: false,
  });
  const requestIndependentReview = useAtomCommand(taskEnvironment.requestIndependentReview, {
    reportFailure: false,
  });
  const sendReviewFindings = useAtomCommand(taskEnvironment.sendReviewFindings, {
    reportFailure: false,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [tests, setTests] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [interfaces, setInterfaces] = useState("");
  const [migrations, setMigrations] = useState("");
  const [risks, setRisks] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [reviewerInstanceId, setReviewerInstanceId] = useState("");

  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.enabled && provider.isAvailable),
    [providers],
  );
  const preferredReviewer =
    availableProviders.find((provider) => provider.instanceId !== builderProviderInstanceId) ??
    availableProviders[0] ??
    null;
  const reviewer =
    availableProviders.find((provider) => provider.instanceId === reviewerInstanceId) ??
    preferredReviewer;
  const currentSnapshot = task.reviewSnapshot?.status === "current" ? task.reviewSnapshot : null;
  const currentReview = currentSnapshot
    ? ((task.reviews ?? []).findLast((review) => review.snapshotId === currentSnapshot.id) ?? null)
    : null;
  const hasStaleReview = (task.reviews?.length ?? 0) > 0 && currentReview === null;
  const snapshotQualityRuns = currentSnapshot
    ? (task.qualityGateRuns ?? []).filter((run) => run.snapshotId === currentSnapshot.id)
    : [];

  useEffect(() => {
    const handoff = task.handoff;
    setSummary(handoff?.summary ?? "");
    setTests(handoff?.testsRun.map((test) => `${test.command} :: ${test.result}`).join("\n") ?? "");
    setAssumptions(handoff?.assumptions.join("\n") ?? "");
    setInterfaces(handoff?.interfaceChanges.join("\n") ?? "");
    setMigrations(handoff?.migrations.join("\n") ?? "");
    setRisks(handoff?.knownRisks.join("\n") ?? "");
    setFollowUps(handoff?.followUps.join("\n") ?? "");
  }, [task.handoff]);

  useEffect(() => {
    if (preferredReviewer) setReviewerInstanceId(preferredReviewer.instanceId);
  }, [preferredReviewer]);

  const runAction = async (label: string, action: () => Promise<{ readonly _tag: string }>) => {
    setBusyAction(label);
    const result = await action();
    setBusyAction(null);
    if (result._tag === "Failure") reportFailure(label);
  };

  const saveHandoff = (status: "draft" | "ready") => {
    if (!currentSnapshot || !task.handoff) return;
    void runAction(
      status === "ready" ? "Could not mark handoff ready" : "Could not save handoff",
      () =>
        updateHandoff({
          environmentId,
          input: {
            taskId: task.id,
            snapshotId: currentSnapshot.id,
            status,
            summary,
            testsRun: lines(tests).map((line) => {
              const divider = line.indexOf("::");
              return divider < 0
                ? {
                    command: line,
                    result: "Reported without a result",
                    evidence: "reported" as const,
                  }
                : {
                    command: line.slice(0, divider).trim(),
                    result: line.slice(divider + 2).trim() || "Reported without a result",
                    evidence: "reported" as const,
                  };
            }),
            assumptions: lines(assumptions),
            interfaceChanges: lines(interfaces),
            migrations: lines(migrations),
            knownRisks: lines(risks),
            followUps: lines(followUps),
          },
        }),
    );
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-xl border border-border p-3 text-xs">
        <p className="text-sm font-medium">Task</p>
        <p className="text-muted-foreground">{task.objective}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Task ID</dt>
            <dd className="truncate font-mono">{task.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Agent session</dt>
            <dd className="truncate font-mono">{task.threadId ?? "Interrupted / not started"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{builderProviderLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Review</dt>
            <dd>
              {currentReview?.verdict ??
                currentReview?.status ??
                (hasStaleReview ? "Stale · review again" : "Not requested")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Worktree</dt>
            <dd className="truncate font-mono">
              {task.workspace?.path ?? task.workspace?.status ?? "Not prepared"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Branch</dt>
            <dd className="truncate font-mono">{task.workspace?.branch ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Base commit</dt>
            <dd className="truncate font-mono">{task.workspace?.baseCommit ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshot</dt>
            <dd>{task.reviewSnapshot?.status ?? "Not prepared"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            size="xs"
            variant="outline"
            disabled={!task.threadId || busyAction !== null}
            onClick={() => void onInterrupt()}
          >
            Interrupt agent
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!task.threadId || busyAction !== null}
            onClick={() => void onStop()}
          >
            Stop session
          </Button>
          {availableProviders.map((provider) => (
            <Button
              key={provider.instanceId}
              size="xs"
              variant="outline"
              disabled={
                !task.threadId ||
                provider.instanceId === builderProviderInstanceId ||
                busyAction !== null
              }
              onClick={() => void onReplaceProvider(provider)}
            >
              Replace with {provider.displayName}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Ownership</p>
          <span className="text-xs text-muted-foreground">
            {task.ownership?.status ?? "Not configured"}
          </span>
        </div>
        {(["write", "read", "deny"] as const).map((access) => {
          const rules = task.ownership?.rules.filter((rule) => rule.access === access) ?? [];
          return (
            <div key={access} className="text-xs">
              <p className="mb-1 text-[10px] text-muted-foreground">
                {access === "write" ? "Can write" : access === "read" ? "Read only" : "Denied"}
              </p>
              <p className="font-mono">
                {rules.length ? rules.map((rule) => rule.pattern).join(" · ") : "None"}
              </p>
            </div>
          );
        })}
        {task.ownership?.violations.map((violation) => (
          <p key={violation.path} className="text-xs text-destructive">
            {violation.path} · {violation.reason}
          </p>
        ))}
        <Button
          size="xs"
          variant="outline"
          disabled={busyAction !== null || task.workspace?.status !== "ready"}
          onClick={() =>
            void runAction("Could not validate ownership", () =>
              validateOwnership({ environmentId, input: { taskId: task.id } }),
            )
          }
        >
          Validate ownership
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Quality gates</p>
          <Button
            size="xs"
            disabled={!currentSnapshot || busyAction !== null}
            onClick={() =>
              currentSnapshot &&
              void runAction("Could not run checks", () =>
                runQualityGates({
                  environmentId,
                  input: { taskId: task.id, snapshotId: currentSnapshot.id },
                }),
              )
            }
          >
            Run checks
          </Button>
        </div>
        {snapshotQualityRuns.length ? (
          snapshotQualityRuns.map((run) => (
            <div key={run.id} className="rounded-lg border border-border/70 p-2 text-xs">
              <div className="flex justify-between gap-3">
                <span>{run.label}</span>
                <span className="text-muted-foreground">{run.status}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px]">{run.command}</p>
              {run.outputSummary ? (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                  {run.outputSummary}
                </pre>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No runs for the current snapshot.</p>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={busyAction !== null || task.workspace?.status !== "ready"}
          onClick={() =>
            void runAction("Could not prepare review package", () =>
              prepareReview({ environmentId, input: { taskId: task.id, generation: "manual" } }),
            )
          }
        >
          {currentSnapshot ? "Refresh review package" : "Prepare review package"}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Structured handoff</p>
          <span className="text-xs text-muted-foreground">
            {task.handoff?.status ?? "Not prepared"}
          </span>
        </div>
        {task.handoff ? (
          <>
            <label className="block space-y-1 text-xs">
              <span>Summary</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-background p-2"
                value={summary}
                onChange={(event) => setSummary(event.currentTarget.value)}
              />
            </label>
            {[
              ["Tests run", tests, setTests],
              ["Assumptions", assumptions, setAssumptions],
              ["Interface changes", interfaces, setInterfaces],
              ["Migrations", migrations, setMigrations],
              ["Known risks", risks, setRisks],
              ["Follow-ups", followUps, setFollowUps],
            ].map(([label, value, setter]) => (
              <label key={label as string} className="block space-y-1 text-xs">
                <span>{label as string}</span>
                <textarea
                  className="min-h-14 w-full rounded-md border border-border bg-background p-2 font-mono"
                  value={value as string}
                  onChange={(event) =>
                    (setter as (value: string) => void)(event.currentTarget.value)
                  }
                />
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Commit · {currentSnapshot?.branchHead ?? "Not captured"}
            </p>
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => saveHandoff("draft")}
              >
                Save draft
              </Button>
              <Button
                size="xs"
                disabled={busyAction !== null || !summary.trim()}
                onClick={() => saveHandoff("ready")}
              >
                Mark ready
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Prepare a review package to create the canonical handoff.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Independent review</p>
          <span className="text-xs text-muted-foreground">
            {currentReview?.verdict ??
              currentReview?.status ??
              (hasStaleReview ? "Stale · review again" : "Not requested")}
          </span>
        </div>
        {hasStaleReview ? (
          <p className="text-xs text-muted-foreground">
            The Task diff changed after the previous verdict. Refresh the handoff and request a new
            review for this snapshot.
          </p>
        ) : null}
        {currentReview ? (
          <div className="space-y-2 text-xs">
            <p>{currentReview.summary || "Review is still running."}</p>
            <p className="text-muted-foreground">
              {currentReview.diversity} · {currentReview.reviewerModelSelection.instanceId}
            </p>
            {currentReview.findings.map((finding) => (
              <div
                key={`${finding.title}:${finding.file ?? ""}`}
                className="rounded-lg border border-border/70 p-2"
              >
                <p>
                  {finding.severity} · {finding.title}
                </p>
                <p className="mt-1 text-muted-foreground">{finding.detail}</p>
              </div>
            ))}
            {currentReview.verdict === "request_changes" &&
            currentReview.findingsSentAt === null ? (
              <Button
                size="xs"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction("Could not send review findings", () =>
                    sendReviewFindings({
                      environmentId,
                      input: { taskId: task.id, reviewId: currentReview.id },
                    }),
                  )
                }
              >
                Send findings to Builder
              </Button>
            ) : null}
          </div>
        ) : null}
        <label className="block space-y-1 text-xs">
          <span>Reviewer provider</span>
          <select
            aria-label="Reviewer provider"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5"
            value={reviewer?.instanceId ?? ""}
            onChange={(event) => setReviewerInstanceId(event.currentTarget.value)}
          >
            {availableProviders.map((provider) => (
              <option key={provider.instanceId} value={provider.instanceId}>
                {provider.displayName}
                {provider.instanceId === builderProviderInstanceId ? " · same provider" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="xs"
          disabled={
            busyAction !== null ||
            !currentSnapshot ||
            task.handoff?.status !== "ready" ||
            reviewer === null
          }
          onClick={() =>
            currentSnapshot &&
            reviewer &&
            void runAction("Could not request independent review", () =>
              requestIndependentReview({
                environmentId,
                input: {
                  taskId: task.id,
                  snapshotId: currentSnapshot.id,
                  reviewId: TaskReviewId.make(randomUUID()),
                  reviewerModelSelection: {
                    instanceId: reviewer.instanceId,
                    model: reviewer.models[0]?.slug ?? "auto",
                  },
                },
              }),
            )
          }
        >
          Request review{reviewer ? ` · ${reviewer.displayName}` : ""}
        </Button>
      </section>

      {task.workspace?.status === "ready" ? (
        <TaskChangesPanel
          environmentId={environmentId}
          task={task}
          provider={builderProviderInstanceId ?? undefined}
        />
      ) : (
        <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
          Task Diff is unavailable because the canonical worktree is{" "}
          {task.workspace?.status ?? "not prepared"}.
        </p>
      )}
    </div>
  );
}
