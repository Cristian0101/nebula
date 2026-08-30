import type {
  CoordinationRequest,
  Mission,
  MissionActivity,
  MissionRun,
  OrchestrationTask,
  ReplanChangeSet,
  ReplanEvidence,
  ReplanProposal,
  ReplanScope,
  ReplanTrigger,
} from "@t3tools/contracts";
import { TaskId } from "@t3tools/contracts";
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

import { randomUUID } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  filterMissionTimeline,
  missionAttentionItems,
  missionProgressSummary,
  missionRecoverySummary,
  type MissionTimelineCategory,
} from "./missionCommandCenterViewModel";

const timelineCategories = [
  "all",
  "replans",
  "tasks",
  "providers",
  "ownership",
  "reviews",
  "resources",
  "integration",
  "errors",
] as const satisfies ReadonlyArray<MissionTimelineCategory>;

const label = (value: string) => value.replaceAll("_", " ");

function ReplanRequestForm({
  tasks,
  onRequest,
}: {
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly onRequest: (input: {
    sourceTaskId: TaskId | null;
    trigger: ReplanTrigger;
    scope: ReplanScope;
    reason: string;
    evidence: ReadonlyArray<ReplanEvidence>;
  }) => void;
}) {
  const [sourceTaskId, setSourceTaskId] = useState<TaskId | "">(tasks[0]?.id ?? "");
  const [scope, setScope] = useState<ReplanScope>("task_repair");
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState("");
  const [observed, setObserved] = useState("");
  const ready = reason.trim().length > 0 && observed.trim().length > 0;
  return (
    <details className="rounded-lg border border-black/[0.08] p-3">
      <summary className="cursor-pointer text-sm font-medium">Request a bounded replan</summary>
      <p className="mt-1 text-xs text-muted-foreground">
        Record a changed requirement or invalid assumption. The current Plan remains authoritative
        until a validated proposal is explicitly approved and applied.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">
          Source Task
          <select
            className="h-8 rounded-md border border-black/[0.08] bg-background px-2"
            value={sourceTaskId}
            onChange={(event) => setSourceTaskId(event.target.value as TaskId | "")}
          >
            <option value="">Mission objective</option>
            {tasks
              .filter((task) => task.replan?.state !== "superseded")
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          Smallest safe scope
          <select
            className="h-8 rounded-md border border-black/[0.08] bg-background px-2"
            value={scope}
            onChange={(event) => setScope(event.target.value as ReplanScope)}
          >
            <option value="task_repair">Task</option>
            <option value="mission_subgraph">Downstream subgraph</option>
            <option value="full_mission">Mission</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs sm:col-span-2">
          Changed requirement or reason
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Use the existing SQLite repository instead of local JSON."
          />
        </label>
        <label className="grid gap-1 text-xs">
          Previously expected
          <Input
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="An existing preference registry"
          />
        </label>
        <label className="grid gap-1 text-xs">
          Observed now
          <Input
            value={observed}
            onChange={(event) => setObserved(event.target.value)}
            placeholder="The registry does not exist"
          />
        </label>
      </div>
      <Button
        className="mt-3"
        size="xs"
        disabled={!ready}
        onClick={() => {
          if (!ready) return;
          onRequest({
            sourceTaskId: sourceTaskId || null,
            trigger: "user_requirement_changed",
            scope,
            reason: reason.trim(),
            evidence: [
              {
                kind: "user_decision",
                summary: reason.trim(),
                expected: expected.trim() || null,
                observed: observed.trim(),
                source: "Mission Command Center decision",
              },
            ],
          });
          setReason("");
          setExpected("");
          setObserved("");
        }}
      >
        Record Replan Request
      </Button>
    </details>
  );
}

function ReplanProposalCard({
  proposal,
  tasks,
  planVersions,
  onPropose,
  onResolve,
  onApply,
}: {
  readonly proposal: ReplanProposal;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly planVersions: Mission["planVersions"];
  readonly onPropose: (proposal: ReplanProposal, changeSet: ReplanChangeSet) => void;
  readonly onResolve: (
    proposal: ReplanProposal,
    resolution: "approved" | "rejected" | "cancelled",
  ) => void;
  readonly onApply: (proposal: ReplanProposal) => void;
}) {
  const sourceTask = tasks.find((task) => task.id === proposal.sourceTaskId) ?? null;
  const previousTaskSpecification = (taskId: TaskId) =>
    planVersions
      ?.find((version) => version.version === (proposal.currentPlanVersion ?? 1))
      ?.taskSpecifications?.find((task) => task.taskId === taskId);
  const [title, setTitle] = useState("Registry foundation");
  const [objective, setObjective] = useState("");
  const [ownership, setOwnership] = useState("");
  const [taskId] = useState(() => TaskId.make(`replan-task:${randomUUID()}`));
  const canPrepare =
    proposal.sourceTaskId !== null &&
    title.trim().length > 0 &&
    objective.trim().length > 0 &&
    ownership.trim().length > 0;
  const canEdit = proposal.status === "analysis_failed";
  return (
    <article className="rounded-md border border-black/[0.08] bg-background/75 p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            Proposed Plan v{proposal.proposedPlanVersion ?? 2} · {label(proposal.scope)}
          </p>
          <p className="mt-1 text-muted-foreground">{proposal.summary}</p>
        </div>
        <Badge
          size="sm"
          variant={
            proposal.status === "applied"
              ? "success"
              : proposal.status === "rejected"
                ? "outline"
                : "warning"
          }
        >
          {label(proposal.status)}
        </Badge>
      </div>
      {proposal.architectModelSelection ? (
        <p className="mt-2 text-muted-foreground">
          Architect · {proposal.architectModelSelection.instanceId} ·{" "}
          {proposal.architectModelSelection.model}
        </p>
      ) : null}
      {proposal.status === "requested" || proposal.status === "analyzing" ? (
        <p className="mt-2 rounded-md bg-info/10 p-2 text-info">
          Architect is analyzing bounded canonical Mission evidence. No Task graph mutation has
          occurred.
        </p>
      ) : null}
      {(proposal.evidence ?? []).map((item) => (
        <div
          key={`${item.kind}:${item.source}:${item.summary}:${item.observed}`}
          className="mt-2 rounded-md bg-muted/35 p-2"
        >
          <p className="font-medium">{item.summary}</p>
          {item.expected ? <p className="mt-1">Expected: {item.expected}</p> : null}
          <p className="mt-1">Observed: {item.observed}</p>
          <p className="mt-1 text-muted-foreground">Evidence: {item.source}</p>
        </div>
      ))}
      {proposal.impact ? (
        <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Affected</dt>
            <dd>{proposal.impact.affectedTaskIds.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Downstream</dt>
            <dd>{proposal.impact.downstreamTaskIds.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Preserved</dt>
            <dd>{proposal.impact.unaffectedTaskIds.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reviews invalidated</dt>
            <dd>{proposal.impact.reviewsInvalidatedTaskIds.length}</dd>
          </div>
        </dl>
      ) : null}
      {proposal.changeSet ? (
        <div className="mt-2 grid gap-1 rounded-md border border-black/[0.08] p-2">
          {proposal.changeSet.newTasks.map((task) => {
            const superseded = tasks.find((item) => item.id === task.supersedesTaskId);
            const previous = task.supersedesTaskId
              ? previousTaskSpecification(task.supersedesTaskId)
              : undefined;
            return (
              <div key={task.taskId} className="rounded-md bg-muted/30 p-2">
                <p className="font-medium">
                  {superseded ? "Replacement" : "Added"} · {task.title}
                </p>
                {superseded ? (
                  <p className="mt-1 text-muted-foreground">
                    Plan v{proposal.currentPlanVersion ?? 1} objective ·{" "}
                    {previous?.objective ?? superseded.objective}
                  </p>
                ) : null}
                <p className="mt-1">
                  Plan v{proposal.proposedPlanVersion ?? 2} objective · {task.objective}
                </p>
              </div>
            );
          })}
          {proposal.changeSet.modifiedTasks.map((task) => {
            const current = tasks.find((item) => item.id === task.taskId);
            const previous = previousTaskSpecification(task.taskId);
            return (
              <div key={task.taskId} className="rounded-md bg-muted/30 p-2">
                <p className="font-medium">Modified · {current?.title ?? task.taskId}</p>
                {task.objective ? (
                  <>
                    <p className="mt-1 text-muted-foreground">
                      Previous objective ·{" "}
                      {previous?.objective ?? current?.objective ?? "Not retained"}
                    </p>
                    <p className="mt-1">Current objective · {task.objective}</p>
                  </>
                ) : null}
              </div>
            );
          })}
          {proposal.changeSet.supersededTaskIds.map((taskId) => (
            <p key={taskId}>
              Superseded · {tasks.find((item) => item.id === taskId)?.title ?? taskId}
            </p>
          ))}
          {proposal.changeSet.dependencyChanges.map((change) => (
            <p key={`${change.operation}:${change.prerequisiteTaskId}:${change.dependentTaskId}`}>
              Dependency {change.operation} · {change.prerequisiteTaskId} → {change.dependentTaskId}
            </p>
          ))}
        </div>
      ) : null}
      {proposal.validation ? (
        <div className="mt-2 rounded-md bg-muted/35 p-2">
          <p className="font-medium">Validation {proposal.validation.status}</p>
          {proposal.validation.blockers.map((blocker) => (
            <p key={blocker} className="mt-1 text-warning">
              {blocker}
            </p>
          ))}
        </div>
      ) : null}
      {(proposal.architectRisks ?? []).length > 0 ? (
        <div className="mt-2 rounded-md bg-muted/35 p-2">
          <p className="font-medium">Architect risks</p>
          {(proposal.architectRisks ?? []).map((risk) => (
            <p key={`${risk.risk}:${risk.mitigation ?? ""}`} className="mt-1">
              {risk.risk}
              {risk.mitigation ? ` · ${risk.mitigation}` : ""}
            </p>
          ))}
        </div>
      ) : null}
      {canEdit ? (
        <details className="mt-2" open>
          <summary className="cursor-pointer font-medium">Prepare smallest fix</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              New Task title
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="grid gap-1">
              Write ownership
              <Input
                value={ownership}
                onChange={(event) => setOwnership(event.target.value)}
                placeholder="src/preferences/registry/**"
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              Objective
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Create the missing foundation required by the affected Task."
              />
            </label>
          </div>
          <Button
            className="mt-2"
            size="xs"
            disabled={!canPrepare}
            onClick={() => {
              if (!canPrepare || proposal.sourceTaskId === null) return;
              onPropose(proposal, {
                newTasks: [
                  {
                    taskId,
                    title: title.trim(),
                    objective: objective.trim(),
                    modelSelection: sourceTask?.modelSelection ?? null,
                    acceptanceCriteria: [objective.trim()],
                    ownership: [
                      { pattern: ownership.trim(), access: "write", reason: proposal.summary },
                    ],
                    requiredResourceIds: [],
                    supersedesTaskId: null,
                  },
                ],
                modifiedTasks: [],
                supersededTaskIds: [],
                dependencyChanges: [
                  {
                    operation: "add",
                    prerequisiteTaskId: taskId,
                    dependentTaskId: proposal.sourceTaskId,
                  },
                ],
                contractChanges: [],
              });
            }}
          >
            Validate Proposed Plan
          </Button>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {proposal.status === "awaiting_approval" && proposal.validation?.status === "valid" ? (
          <Button size="xs" onClick={() => onResolve(proposal, "approved")}>
            Approve Plan v{proposal.proposedPlanVersion ?? 2}
          </Button>
        ) : null}
        {proposal.status === "approved" ? (
          <Button size="xs" onClick={() => onApply(proposal)}>
            Apply approved Plan
          </Button>
        ) : null}
        {!["applied", "rejected", "cancelled"].includes(proposal.status) ? (
          <Button size="xs" variant="outline" onClick={() => onResolve(proposal, "rejected")}>
            Reject
          </Button>
        ) : null}
      </div>
    </article>
  );
}

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
  onRequestReplan,
  onProposeReplan,
  onResolveReplan,
  onApplyReplan,
  onResolveProviderSubstitution,
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
  readonly onRequestReplan: (input: {
    sourceTaskId: TaskId | null;
    trigger: ReplanTrigger;
    scope: ReplanScope;
    reason: string;
    evidence: ReadonlyArray<ReplanEvidence>;
  }) => void;
  readonly onProposeReplan: (proposal: ReplanProposal, changeSet: ReplanChangeSet) => void;
  readonly onResolveReplan: (
    proposal: ReplanProposal,
    resolution: "approved" | "rejected" | "cancelled",
  ) => void;
  readonly onApplyReplan: (proposal: ReplanProposal) => void;
  readonly onResolveProviderSubstitution: (
    taskId: TaskId,
    resolution: "approved" | "rejected",
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
  const timeline = useMemo(() => {
    const decisions: MissionActivity[] = (run?.decisions ?? []).map((decision) => ({
      id: decision.id,
      type: `mission.decision.${decision.kind}`,
      summary: decision.reason,
      taskId: decision.taskId,
      occurredAt: decision.occurredAt,
    }));
    return filterMissionTimeline(
      [...mission.activities, ...decisions].toSorted((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt),
      ),
      timelineCategory,
      deferredSearch,
    )
      .toReversed()
      .slice(0, 250);
  }, [deferredSearch, mission.activities, run?.decisions, timelineCategory]);
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
              <Badge variant="outline">
                Plan v{mission.currentPlanVersion ?? 1} ·{" "}
                {run?.replanProposals?.filter((proposal) => proposal.status === "applied").length ??
                  0}{" "}
                replans
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
                        {attempt.status === "completed"
                          ? "Execution completed"
                          : label(attempt.status)}
                        {attempt.failureClass ? ` · ${label(attempt.failureClass)}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                {state.providerEscalation ? (
                  <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-2">
                    <p className="font-medium">Provider substitution recommended</p>
                    <p className="mt-1 text-muted-foreground">{state.providerEscalation.reason}</p>
                    <Button
                      className="mt-2"
                      size="xs"
                      variant="outline"
                      onClick={() => onResolveProviderSubstitution(state.taskId, "approved")}
                    >
                      Replace Agent
                    </Button>
                    <Button
                      className="mt-2"
                      size="xs"
                      variant="ghost"
                      onClick={() => onResolveProviderSubstitution(state.taskId, "rejected")}
                    >
                      {state.attempts.at(-1)?.status === "interrupted"
                        ? "Retry with current provider"
                        : "Keep current provider"}
                    </Button>
                  </div>
                ) : null}
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

      {run && !["completed", "stopped", "failed"].includes(run.status) ? (
        <ReplanRequestForm tasks={tasks} onRequest={onRequestReplan} />
      ) : null}

      {(run?.replanProposals ?? []).length > 0 ? (
        <section
          className="rounded-lg border border-warning/30 p-3"
          aria-label="Plan history and replans"
        >
          <h3 className="text-sm font-medium">Plan history and bounded replans</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare the current Plan with proposed or applied changes. Runtime mutation occurs only
            after validation, explicit approval, and a separate apply action.
          </p>
          {(mission.planVersions ?? []).length > 0 ? (
            <div className="mt-2 grid gap-2 lg:grid-cols-2" aria-label="Mission Plan versions">
              {(mission.planVersions ?? []).map((version) => (
                <article
                  key={version.version}
                  className="rounded-md border border-black/[0.08] bg-background/70 p-2 text-xs"
                >
                  <p className="font-medium">
                    Plan v{version.version} · {version.source === "initial" ? "Initial" : "Replan"}
                  </p>
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    {version.taskIds
                      .filter((taskId) => !version.supersededTaskIds.includes(taskId))
                      .map((taskId) => {
                        const task =
                          version.taskSpecifications?.find(
                            (specification) => specification.taskId === taskId,
                          ) ?? taskById.get(taskId);
                        return task ? (
                          <p key={taskId}>
                            {task.title} · {task.objective}
                          </p>
                        ) : null;
                      })}
                  </div>
                  {version.addedTaskIds.length > 0 ? (
                    <p className="mt-1">Added · {version.addedTaskIds.length}</p>
                  ) : null}
                  {version.supersededTaskIds.length > 0 ? (
                    <p className="mt-1">Superseded · {version.supersededTaskIds.length}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            {(run?.replanProposals ?? []).map((proposal) => (
              <ReplanProposalCard
                key={proposal.id}
                proposal={proposal}
                tasks={tasks}
                planVersions={mission.planVersions}
                onPropose={onProposeReplan}
                onResolve={onResolveReplan}
                onApply={onApplyReplan}
              />
            ))}
          </div>
        </section>
      ) : null}

      {run?.finalReport ? (
        <details className="rounded-lg border border-success/25 bg-success/5 p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Final Mission report</summary>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Objective</dt>
              <dd>{run.finalReport.missionObjective}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan and Tasks</dt>
              <dd>
                v{run.finalReport.planVersion ?? 1} of {run.finalReport.planVersionCount ?? 1} ·{" "}
                {run.finalReport.completedTaskIds.length} / {run.finalReport.taskIds.length}{" "}
                complete
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{Math.round(run.finalReport.elapsedMilliseconds / 1000)}s</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Providers</dt>
              <dd>{run.finalReport.providersUsed.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recovery</dt>
              <dd>
                {run.finalReport.attemptCount ?? 0} attempts · {run.finalReport.retryCount} retries
                · {run.finalReport.providerReplacementCount} replacements
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Adaptation</dt>
              <dd>
                {run.finalReport.appliedReplanCount ?? 0} replans ·{" "}
                {run.finalReport.dynamicTaskCount ?? 0} new Tasks ·{" "}
                {run.finalReport.preservedTaskCount ?? 0} preserved ·{" "}
                {run.finalReport.modifiedTaskCount ?? 0} modified ·{" "}
                {run.finalReport.supersededTaskCount ?? 0} superseded
              </dd>
              {(run.finalReport.replanTriggers ?? []).length > 0 ? (
                <dd className="text-muted-foreground">
                  {(run.finalReport.replanTriggers ?? []).map(label).join(", ")} ·{" "}
                  {(run.finalReport.replanScopes ?? []).map(label).join(", ")}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-muted-foreground">Reviews</dt>
              <dd>
                {run.finalReport.approvedReviewCount ?? 0} /{" "}
                {run.finalReport.requiredReviewCount ?? 0} current ·{" "}
                {run.finalReport.historicalReviewAttemptCount ?? run.finalReport.reviewCount}{" "}
                historical
                {` · ${run.finalReport.reviewChangesRequestedCount ?? 0} changes requested`}
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
            <div>
              <dt className="text-muted-foreground">Base SHA</dt>
              <dd>{run.finalReport.baseCommit?.slice(0, 12) ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Final Integration SHA</dt>
              <dd>{run.finalReport.finalIntegrationCommit?.slice(0, 12) ?? "Not requested"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Final gates</dt>
              <dd>
                {
                  (run.finalReport.finalGateResults ?? []).filter(
                    (gate) => gate.required && gate.status === "passed",
                  ).length
                }{" "}
                / {(run.finalReport.finalGateResults ?? []).filter((gate) => gate.required).length}{" "}
                passed
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Integration conflicts</dt>
              <dd>{run.finalReport.integrationConflictCount ?? 0}</dd>
            </div>
          </dl>
          {run.finalReport.remainingRisks !== undefined ? (
            <div className="mt-3 grid gap-3 border-t border-black/[0.08] pt-3 text-xs sm:grid-cols-2">
              <div>
                <h4 className="text-muted-foreground">Remaining risks</h4>
                {run.finalReport.remainingRisks.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {run.finalReport.remainingRisks.map((risk) => (
                      <li key={risk}>• {risk}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">None</p>
                )}
              </div>
              <div>
                <h4 className="text-muted-foreground">Resolved during Mission</h4>
                {(run.finalReport.resolvedRisks ?? []).length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {(run.finalReport.resolvedRisks ?? []).map((risk) => (
                      <li key={risk}>• {risk}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">None</p>
                )}
              </div>
            </div>
          ) : run.finalReport.knownRisks.length > 0 ? (
            <div className="mt-3 border-t border-black/[0.08] pt-3 text-xs">
              <h4 className="text-muted-foreground">Known risks at completion · Legacy report</h4>
              <ul className="mt-1 space-y-1">
                {run.finalReport.knownRisks.map((risk) => (
                  <li key={risk}>• {risk}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
