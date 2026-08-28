import type {
  CoordinationRequest,
  Mission,
  MissionRun,
  OrchestrationTask,
  ReplanProposal,
  TaskId,
} from "@t3tools/contracts";
import type { MissionPlan } from "@t3tools/shared/missionGraph";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  RotateCcwIcon,
  SearchIcon,
  TerminalIcon,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  filterMissionTimeline,
  missionAttentionItems,
  missionProgressSummary,
  missionRecoverySummary,
  type MissionTimelineCategory,
} from "./missionCommandCenterViewModel";

const timelineCategories = [
  "all",
  "tasks",
  "providers",
  "ownership",
  "reviews",
  "resources",
  "integration",
  "errors",
] as const satisfies ReadonlyArray<MissionTimelineCategory>;

const label = (value: string) => value.replaceAll("_", " ");

export function MissionCommandCenter({
  mission,
  run,
  plan,
  tasks,
  repository,
  onOpenTask,
  onOpenTaskRecovery,
  onOpenIntegration,
  onOpenTerminalCenter,
  onResolveCoordinationRequest,
  onResolveReplan,
}: {
  readonly mission: Mission;
  readonly run: MissionRun | null;
  readonly plan: MissionPlan;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly repository: string;
  readonly onOpenTask: (taskId: TaskId) => void;
  readonly onOpenTaskRecovery: (taskId: TaskId) => void;
  readonly onOpenIntegration: () => void;
  readonly onOpenTerminalCenter: () => void;
  readonly onResolveCoordinationRequest: (
    request: CoordinationRequest,
    resolution: "approved" | "denied" | "answered" | "cancelled",
    answer?: string | null,
  ) => void;
  readonly onResolveReplan: (
    proposal: ReplanProposal,
    resolution: "approved" | "rejected" | "cancelled",
  ) => void;
}) {
  const [timelineCategory, setTimelineCategory] = useState<MissionTimelineCategory>("all");
  const [timelineSearch, setTimelineSearch] = useState("");
  const deferredSearch = useDeferredValue(timelineSearch);
  const summary = useMemo(
    () => missionProgressSummary({ mission, plan, run }),
    [mission, plan, run],
  );
  const attention = useMemo(() => missionAttentionItems({ plan, run, tasks }), [plan, run, tasks]);
  const recovery = useMemo(() => missionRecoverySummary({ plan, run }), [plan, run]);
  const timeline = useMemo(
    () =>
      filterMissionTimeline(mission.activities, timelineCategory, deferredSearch)
        .toReversed()
        .slice(0, 250),
    [deferredSearch, mission.activities, timelineCategory],
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const integrationBranch = plan.integration?.branch ?? run?.finalReport?.integrationBranch ?? null;
  const elapsedSeconds = run
    ? Math.max(
        0,
        Math.round(
          (new Date(run.completedAt ?? run.updatedAt).getTime() -
            new Date(run.startedAt).getTime()) /
            1000,
        ),
      )
    : 0;

  return (
    <div className="space-y-4" aria-label="Mission Command Center">
      <section className="rounded-lg border border-black/[0.08] bg-muted/20 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">Mission status</h3>
              <Badge variant={run?.status === "completed" ? "success" : "outline"}>
                Mission {mission.status}
              </Badge>
              <Badge
                variant={
                  run?.status === "attention" || run?.status === "paused" ? "warning" : "info"
                }
              >
                Run {run?.status ?? "not started"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {repository} · base {mission.baseCommit?.slice(0, 10) ?? "not pinned"} · Integration{" "}
              {integrationBranch ?? "not started"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {run ? <span>{elapsedSeconds}s elapsed</span> : null}
            <Button size="xs" variant="outline" onClick={onOpenTerminalCenter}>
              <TerminalIcon /> Terminal Center
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Complete", `${summary.completed} / ${summary.total}`],
            ["Active", summary.active],
            ["Dependencies", summary.waitingDependency],
            ["Resources", summary.waitingResource],
            ["Reviews pending", summary.reviewPending],
            ["Final gates", `${summary.passedGates} / ${summary.requiredGates}`],
            ["Attention", attention.length],
          ].map(([name, value]) => (
            <div key={name} className="rounded-md bg-background/70 p-2">
              <p className="text-[11px] text-muted-foreground">{name}</p>
              <p className="mt-0.5 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
        <ol className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {summary.steps.map((step) => (
            <li key={step} className="rounded-full border border-black/[0.08] px-2 py-1">
              {step}
            </li>
          ))}
        </ol>
      </section>

      {run && recovery ? (
        <details className="rounded-lg border border-info/25 bg-info/5 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            <RotateCcwIcon className="mr-2 inline size-4 text-info" /> Mission state reconciled
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Persisted Task, worktree, attempt, resource, and Integration state is authoritative.
            Provider processes are resumed or interrupted only when the runtime confirms it.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{recovery.preservedTasks} Tasks preserved</span>
            <span>{recovery.preservedWorktrees} worktrees preserved</span>
            <span>{recovery.interruptedAttempts} interrupted or replaced attempts</span>
            <span>{recovery.readyTasks} ready</span>
            <span>{recovery.waitingResources} waiting on resource</span>
            <span>Integration {label(recovery.integrationState)}</span>
          </div>
        </details>
      ) : null}

      <section
        className={`rounded-lg border p-3 ${attention.length > 0 ? "border-warning/30 bg-warning/10" : "border-black/[0.08]"}`}
        aria-label="Needs Attention"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            {attention.length > 0 ? (
              <AlertTriangleIcon className="size-4 text-warning" />
            ) : (
              <CheckCircle2Icon className="size-4 text-success" />
            )}
            Needs Attention
          </h3>
          <Badge variant={attention.length > 0 ? "warning" : "success"}>{attention.length}</Badge>
        </div>
        {attention.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No actionable Mission blockers.</p>
        ) : (
          <ul className="mt-2 grid gap-2 lg:grid-cols-2">
            {attention.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-black/[0.08] bg-background/75 p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <Badge size="sm" variant={item.blocksMission ? "warning" : "outline"}>
                    {item.category}
                  </Badge>
                </div>
                <Button
                  className="mt-2"
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    item.action === "open_integration"
                      ? onOpenIntegration()
                      : item.action === "open_provider_recovery" && item.taskId
                        ? onOpenTaskRecovery(item.taskId)
                        : item.taskId
                          ? onOpenTask(item.taskId)
                          : undefined
                  }
                >
                  {item.action === "open_integration"
                    ? "Open Integration"
                    : item.action === "open_provider_recovery"
                      ? "Open Provider Recovery"
                      : item.action === "open_review"
                        ? "Open Review"
                        : item.taskId
                          ? "Open Task"
                          : "Inspect Mission"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {run && (run.taskRecovery ?? []).length > 0 ? (
        <section className="rounded-lg border border-black/[0.08] p-3" aria-label="Task attempts">
          <h3 className="text-sm font-medium">Task attempt history</h3>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {(run.taskRecovery ?? []).map((state) => (
              <details key={state.taskId} className="rounded-md bg-muted/30 p-2" open>
                <summary className="cursor-pointer text-xs font-medium">
                  {taskById.get(state.taskId)?.title ?? state.taskId} · {state.transientRetries} /{" "}
                  {run.recoveryPolicy?.transportRetryLimit ?? 1} retries
                </summary>
                <ol className="mt-2 space-y-1">
                  {state.attempts.map((attempt) => (
                    <li key={`${attempt.threadId}:${attempt.number}`} className="text-xs">
                      <span className="text-foreground">Attempt {attempt.number}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {attempt.providerInstanceId} · {label(attempt.kind)} ·{" "}
                        {label(attempt.status)}
                        {attempt.failureClass ? ` · ${label(attempt.failureClass)}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                <Button size="xs" variant="ghost" onClick={() => onOpenTask(state.taskId)}>
                  Open Agent Thread
                </Button>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {(run?.coordinationRequests ?? []).some((request) => request.status === "pending") ? (
        <section className="rounded-lg border border-warning/30 p-3">
          <h3 className="text-sm font-medium">Pending Mission decisions</h3>
          <div className="mt-2 space-y-2">
            {(run?.coordinationRequests ?? [])
              .filter((request) => request.status === "pending")
              .map((request) => (
                <div key={request.id} className="rounded-md bg-muted/30 p-2 text-xs">
                  <p className="font-medium">{label(request.kind)}</p>
                  <p className="mt-1 text-muted-foreground">{request.reason}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="xs"
                      onClick={() => {
                        const needsAnswer =
                          request.kind === "contract_question" ||
                          request.kind === "dependency_question";
                        const answer = needsAnswer
                          ? window.prompt("Answer from an approved contract or human decision")
                          : null;
                        if (needsAnswer && !answer) return;
                        onResolveCoordinationRequest(
                          request,
                          answer ? "answered" : "approved",
                          answer,
                        );
                      }}
                    >
                      {request.kind.includes("question") ? "Answer" : "Approve"}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onResolveCoordinationRequest(request, "denied")}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {(run?.replanProposals ?? []).some((proposal) => proposal.status === "pending") ? (
        <section className="rounded-lg border border-warning/30 p-3">
          <h3 className="text-sm font-medium">Bounded replan proposals</h3>
          <div className="mt-2 space-y-2">
            {(run?.replanProposals ?? [])
              .filter((proposal) => proposal.status === "pending")
              .map((proposal) => (
                <div key={proposal.id} className="rounded-md bg-muted/30 p-2 text-xs">
                  <p className="font-medium">{label(proposal.scope)}</p>
                  <p className="mt-1 text-muted-foreground">{proposal.summary}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="xs" onClick={() => onResolveReplan(proposal, "approved")}>
                      Approve proposal
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onResolveReplan(proposal, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {run?.finalReport ? (
        <details className="rounded-lg border border-success/25 bg-success/5 p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Final Mission report</summary>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Providers</dt>
              <dd>{run.finalReport.providersUsed.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recovery</dt>
              <dd>
                {run.finalReport.retryCount} retries · {run.finalReport.providerReplacementCount}{" "}
                replacements
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reviews</dt>
              <dd>
                {run.finalReport.approvedReviewCount ?? 0} /{" "}
                {run.finalReport.requiredReviewCount ?? 0} current ·{" "}
                {run.finalReport.historicalReviewAttemptCount ?? run.finalReport.reviewCount}{" "}
                historical
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Final validation</dt>
              <dd>{label(run.finalReport.finalValidation)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Human interventions</dt>
              <dd>{run.finalReport.humanInterventionCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Resource waits</dt>
              <dd>{run.finalReport.resourceConflictCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ownership violations</dt>
              <dd>{run.finalReport.unresolvedOwnershipViolationCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Integration branch</dt>
              <dd>{run.finalReport.integrationBranch ?? "Not requested"}</dd>
            </div>
          </dl>
        </details>
      ) : null}

      <section className="rounded-lg border border-black/[0.08] p-3" aria-label="Mission timeline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ActivityIcon className="size-4 text-primary" /> Timeline
          </h3>
          <label className="flex h-7 items-center gap-1 rounded-md border border-black/[0.08] px-2 text-xs text-muted-foreground">
            <SearchIcon className="size-3.5" />
            <input
              aria-label="Search Mission events"
              className="w-36 bg-transparent text-foreground outline-none"
              placeholder="Search events"
              value={timelineSearch}
              onChange={(event) => setTimelineSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {timelineCategories.map((category) => (
            <Button
              key={category}
              size="xs"
              variant={timelineCategory === category ? "default" : "outline"}
              onClick={() => setTimelineCategory(category)}
            >
              {category === "all" ? "All" : category[0]?.toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
        {timeline.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No matching Mission events.</p>
        ) : (
          <ol className="mt-3 max-h-64 space-y-1 overflow-auto [content-visibility:auto]">
            {timeline.map((activity) => (
              <li key={activity.id} className="rounded-md bg-muted/25 px-2 py-1.5 text-xs">
                <span className="text-foreground">{activity.summary}</span>
                <span className="ml-2 text-muted-foreground">
                  {activity.taskId
                    ? `${taskById.get(activity.taskId)?.title ?? activity.taskId} · `
                    : ""}
                  {new Date(activity.occurredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
