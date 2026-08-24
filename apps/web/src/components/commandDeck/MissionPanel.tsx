import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  IntegrationBatchId,
  MissionId,
  MissionRunId,
  TaskId,
  type EnvironmentId,
  type Mission,
  type MissionRun,
  type OrchestrationProjectShell,
  type OrchestrationTask,
  type OrchestrationThreadShell,
  type RoutingProfile,
} from "@t3tools/contracts";
import { computeMissionPlan, missionTopologicalTaskIds } from "@t3tools/shared/missionGraph";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  GitBranchIcon,
  Link2Icon,
  ListTreeIcon,
  PencilIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  RocketIcon,
  Trash2Icon,
  TriangleAlertIcon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { randomUUID } from "../../lib/utils";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";

interface MissionPanelProps {
  readonly environmentId: EnvironmentId;
  readonly project: OrchestrationProjectShell;
  readonly missions: ReadonlyArray<Mission>;
  readonly missionRuns: ReadonlyArray<MissionRun>;
  readonly tasks: ReadonlyArray<OrchestrationTask>;
  readonly threads: ReadonlyArray<OrchestrationThreadShell>;
  readonly unavailableProviderTaskIds: ReadonlySet<TaskId>;
  readonly onStartTask: (task: OrchestrationTask) => Promise<void>;
  readonly onOpenTask: (taskId: TaskId) => void;
  readonly onCreateTask: (missionId: MissionId) => void;
}

function commandError(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The command could not be completed.";
}

function statusVariant(status: string) {
  if (status === "completed" || status === "ready") return "success" as const;
  if (
    status === "blocked" ||
    status === "resource-blocked" ||
    status === "needs-attention" ||
    status === "attention" ||
    status === "paused"
  )
    return "warning" as const;
  if (status === "running" || status === "active" || status === "review") return "info" as const;
  return "outline" as const;
}

function MissionGraph({
  mission,
  plan,
  onOpenTask,
}: {
  readonly mission: Mission;
  readonly plan: ReturnType<typeof computeMissionPlan>;
  readonly onOpenTask: (taskId: TaskId) => void;
}) {
  const positions = new Map<TaskId, { x: number; y: number }>();
  for (const wave of plan.waves) {
    wave.taskIds.forEach((taskId, index) =>
      positions.set(taskId, { x: (wave.number - 1) * 250 + 20, y: index * 112 + 38 }),
    );
  }
  const width = Math.max(300, plan.waves.length * 250 + 20);
  const height = Math.max(190, ...plan.waves.map((wave) => wave.taskIds.length * 112 + 40));
  return (
    <div
      className="overflow-auto rounded-lg border border-border/70 bg-background/45"
      aria-label="Mission dependency graph"
    >
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden
        >
          <defs>
            <marker
              id={`mission-arrow-${mission.id}`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L7,3 z" className="fill-muted-foreground/50" />
            </marker>
          </defs>
          {mission.dependencies.map((edge) => {
            const from = positions.get(edge.prerequisiteTaskId);
            const to = positions.get(edge.dependentTaskId);
            if (!from || !to) return null;
            return (
              <path
                key={`${edge.prerequisiteTaskId}:${edge.dependentTaskId}`}
                d={`M ${from.x + 196} ${from.y + 34} C ${from.x + 222} ${from.y + 34}, ${to.x - 24} ${to.y + 34}, ${to.x} ${to.y + 34}`}
                fill="none"
                stroke="currentColor"
                className="text-muted-foreground/45"
                strokeWidth="1.5"
                markerEnd={`url(#mission-arrow-${mission.id})`}
              />
            );
          })}
        </svg>
        {plan.waves.map((wave) => (
          <p
            key={wave.number}
            className="absolute text-[11px] text-muted-foreground"
            style={{ left: (wave.number - 1) * 250 + 20, top: 12 }}
          >
            Wave {wave.number}
          </p>
        ))}
        {plan.tasks.map((item) => {
          const position = positions.get(item.task.id);
          if (!position) return null;
          return (
            <button
              key={item.task.id}
              type="button"
              onClick={() => onOpenTask(item.task.id)}
              className="absolute w-[196px] rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: position.x, top: position.y }}
              aria-label={`${item.task.title}, ${item.status}, wave ${item.wave}`}
            >
              <span className="block truncate text-sm font-medium">{item.task.title}</span>
              <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {item.task.modelSelection?.instanceId ?? "Unassigned"} · {item.task.role}
                </span>
                <Badge size="sm" variant={statusVariant(item.status)}>
                  {item.status}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MissionPanel(props: MissionPanelProps) {
  const {
    environmentId,
    project,
    missions,
    missionRuns,
    tasks,
    threads,
    unavailableProviderTaskIds,
  } = props;
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId | null>(
    missions[0]?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [attachTaskId, setAttachTaskId] = useState<TaskId | "">("");
  const [prerequisiteId, setPrerequisiteId] = useState<TaskId | "">("");
  const [dependentId, setDependentId] = useState<TaskId | "">("");
  const [view, setView] = useState<"graph" | "waves">("graph");
  const [missionFilter, setMissionFilter] = useState<"all" | Mission["status"]>("all");
  const [busy, setBusy] = useState(false);
  const [integrationOrder, setIntegrationOrder] = useState<ReadonlyArray<TaskId>>([]);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(2);
  const [routingProfile, setRoutingProfile] = useState<RoutingProfile>("manual_only");

  const createMission = useAtomCommand(projectEnvironment.createMission, { reportFailure: false });
  const updateMission = useAtomCommand(projectEnvironment.updateMission, { reportFailure: false });
  const addMissionTask = useAtomCommand(projectEnvironment.addMissionTask, {
    reportFailure: false,
  });
  const removeMissionTask = useAtomCommand(projectEnvironment.removeMissionTask, {
    reportFailure: false,
  });
  const reorderMissionTasks = useAtomCommand(projectEnvironment.reorderMissionTasks, {
    reportFailure: false,
  });
  const addMissionDependency = useAtomCommand(projectEnvironment.addMissionDependency, {
    reportFailure: false,
  });
  const removeMissionDependency = useAtomCommand(projectEnvironment.removeMissionDependency, {
    reportFailure: false,
  });
  const activateMission = useAtomCommand(projectEnvironment.activateMission, {
    reportFailure: false,
  });
  const completeMission = useAtomCommand(projectEnvironment.completeMission, {
    reportFailure: false,
  });
  const cancelMission = useAtomCommand(projectEnvironment.cancelMission, { reportFailure: false });
  const startMissionRun = useAtomCommand(projectEnvironment.startMissionRun, {
    reportFailure: false,
  });
  const pauseMissionRun = useAtomCommand(projectEnvironment.pauseMissionRun, {
    reportFailure: false,
  });
  const resumeMissionRun = useAtomCommand(projectEnvironment.resumeMissionRun, {
    reportFailure: false,
  });
  const stopMissionRun = useAtomCommand(projectEnvironment.stopMissionRun, {
    reportFailure: false,
  });
  const resolveCoordinationRequest = useAtomCommand(
    projectEnvironment.resolveMissionRunCoordinationRequest,
    { reportFailure: false },
  );
  const resolveReplan = useAtomCommand(projectEnvironment.resolveMissionRunReplan, {
    reportFailure: false,
  });
  const createIntegration = useAtomCommand(projectEnvironment.createIntegration, {
    reportFailure: false,
  });

  useEffect(() => {
    if (!selectedMissionId || !missions.some((mission) => mission.id === selectedMissionId))
      setSelectedMissionId(missions[0]?.id ?? null);
  }, [missions, selectedMissionId]);
  const filteredMissions = missions.filter(
    (mission) => missionFilter === "all" || mission.status === missionFilter,
  );
  const selectedMission = missions.find((mission) => mission.id === selectedMissionId) ?? null;
  const selectedMissionRun = selectedMission
    ? (missionRuns
        .filter((candidate) => candidate.missionId === selectedMission.id)
        .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt))
        .at(-1) ?? null)
    : null;
  const supervisedRunActive =
    selectedMissionRun?.status === "running" ||
    selectedMissionRun?.status === "paused" ||
    selectedMissionRun?.status === "attention";
  const architectProposalApproved =
    selectedMission?.architectPlanProposalId != null &&
    (project.architectPlans ?? []).some(
      (proposal) =>
        proposal.id === selectedMission.architectPlanProposalId && proposal.status === "approved",
    );
  const plan = useMemo(
    () =>
      selectedMission
        ? computeMissionPlan({
            mission: selectedMission,
            tasks,
            threads,
            integrationBatches: project.integrationBatches ?? [],
            project,
            unavailableProviderTaskIds,
          })
        : null,
    [project.integrationBatches, selectedMission, tasks, threads, unavailableProviderTaskIds],
  );
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const selectedProviderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of plan?.tasks ?? []) {
      const provider = item.task.modelSelection?.instanceId ?? "Unassigned";
      counts.set(provider, (counts.get(provider) ?? 0) + 1);
    }
    return counts;
  }, [plan]);
  const ownedTaskIds = useMemo(
    () => new Set(missions.flatMap((mission) => mission.taskIds)),
    [missions],
  );
  const attachableTasks = tasks.filter(
    (task) =>
      !ownedTaskIds.has(task.id) &&
      (task.status === "draft" ||
        (selectedMission?.status === "draft" && task.status === "completed")),
  );
  const eligibleIntegrationIds = useMemo(
    () =>
      selectedMission
        ? missionTopologicalTaskIds(selectedMission).filter((taskId) => {
            const task = taskById.get(taskId);
            return task?.status === "completed" && task.result != null;
          })
        : [],
    [selectedMission, taskById],
  );
  useEffect(
    () => setIntegrationOrder(eligibleIntegrationIds),
    [eligibleIntegrationIds.join("\u0000")],
  );

  const report = (title: string, description: string) =>
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  const run = async (label: string, action: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setBusy(true);
    const error = commandError(await action());
    setBusy(false);
    if (error) report(label, error);
    return error === null;
  };
  const create = async () => {
    if (!title.trim() || !objective.trim()) return;
    const missionId = MissionId.make(randomUUID());
    if (
      await run("Could not create Mission", () =>
        createMission({
          environmentId,
          input: {
            missionId,
            projectId: project.id,
            title: title.trim(),
            objective: objective.trim(),
            description: description.trim() || null,
          },
        }),
      )
    ) {
      setSelectedMissionId(missionId);
      setCreateOpen(false);
      setTitle("");
      setObjective("");
      setDescription("");
    }
  };
  const beginEdit = () => {
    if (!selectedMission) return;
    setTitle(selectedMission.title);
    setObjective(selectedMission.objective);
    setDescription(selectedMission.description ?? "");
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!selectedMission || !title.trim() || !objective.trim()) return;
    if (
      await run("Could not update Mission", () =>
        updateMission({
          environmentId,
          input: {
            missionId: selectedMission.id,
            projectId: project.id,
            title: title.trim(),
            objective: objective.trim(),
            description: description.trim() || null,
          },
        }),
      )
    )
      setEditOpen(false);
  };
  const confirmActiveEdit = (mission: Mission) =>
    mission.status !== "active" ||
    window.confirm("This changes the graph of an active Mission. Continue and record the change?");
  const startReady = async () => {
    if (!plan) return;
    setBusy(true);
    await Promise.allSettled(
      plan.readyTaskIds
        .map((taskId) => taskById.get(taskId))
        .filter((task): task is OrchestrationTask => task !== undefined)
        .map(props.onStartTask),
    );
    setBusy(false);
  };
  const startSupervisedRun = async () => {
    if (!selectedMission) return;
    const confirmed = window.confirm(
      "Start a supervised Mission Run?\n\nNebula will automatically start Tasks when their dependencies, resources, provider, ownership, and concurrency conditions allow.\n\nNebula will stop for attention when deterministic safety gates cannot proceed.",
    );
    if (!confirmed) return;
    await run("Could not start supervised Mission Run", () =>
      startMissionRun({
        environmentId,
        input: {
          runId: MissionRunId.make(randomUUID()),
          missionId: selectedMission.id,
          projectId: project.id,
          maxConcurrentTasks,
          routingProfile,
          transportRetryLimit: 2,
          remediationLimit: 2,
        },
      }),
    );
  };
  const moveIntegration = (taskId: TaskId, offset: number) =>
    setIntegrationOrder((current) => {
      const index = current.indexOf(taskId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <section
      className="grid min-h-[38rem] gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]"
      aria-label="Mission Command Deck"
    >
      <aside className="overflow-hidden rounded-xl border border-border/70 bg-card/95">
        <div className="flex items-center justify-between border-b border-border/70 p-3">
          <div>
            <h2 className="text-sm font-medium">Missions</h2>
            <p className="text-xs text-muted-foreground">Human-defined Task plans.</p>
          </div>
          <Button
            size="xs"
            onClick={() => {
              setTitle("");
              setObjective("");
              setDescription("");
              setCreateOpen(true);
            }}
          >
            <PlusIcon /> New
          </Button>
        </div>
        <div className="border-b border-border/70 p-2">
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Filter Missions by status"
            value={missionFilter}
            onChange={(event) => setMissionFilter(event.target.value as "all" | Mission["status"])}
          >
            <option value="all">All Missions</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {missions.length === 0 ? (
          <div className="p-6 text-center">
            <ListTreeIcon className="mx-auto size-7 text-primary" />
            <p className="mt-3 text-sm font-medium">No Missions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a Mission, add canonical Tasks, then define dependencies.
            </p>
          </div>
        ) : (
          <div className="max-h-[65dvh] overflow-auto p-1.5 [content-visibility:auto]">
            {filteredMissions.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No Missions match this status.
              </p>
            ) : null}
            {filteredMissions.map((mission) => {
              const itemPlan = computeMissionPlan({
                mission,
                tasks,
                threads,
                integrationBatches: project.integrationBatches ?? [],
                unavailableProviderTaskIds,
              });
              return (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => setSelectedMissionId(mission.id)}
                  aria-current={selectedMission?.id === mission.id ? "true" : undefined}
                  className={`mb-1 w-full rounded-lg p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedMission?.id === mission.id ? "bg-primary/10 ring-1 ring-primary/25" : "hover:bg-muted/45"}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium">{mission.title}</span>
                    <Badge size="sm" variant={statusVariant(mission.status)}>
                      {mission.status}
                    </Badge>
                  </span>
                  <span className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    <span>{mission.taskIds.length} Tasks</span>
                    <span>{itemPlan.readyTaskIds.length} ready</span>
                    <span>
                      {
                        itemPlan.tasks.filter(
                          (item) => item.status === "running" || item.status === "active",
                        ).length
                      }{" "}
                      active
                    </span>
                    <span>
                      {
                        itemPlan.tasks.filter(
                          (item) => item.status === "blocked" || item.status === "resource-blocked",
                        ).length
                      }{" "}
                      blocked
                    </span>
                    <span>
                      {itemPlan.tasks.filter((item) => item.status === "needs-attention").length}{" "}
                      attention
                    </span>
                    <span className="truncate">
                      Integration {itemPlan.integration?.status ?? "not linked"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <div className="min-w-0 rounded-xl border border-border/70 bg-card/95">
        {!selectedMission || !plan ? (
          <div className="flex min-h-[38rem] items-center justify-center p-8 text-center">
            <div>
              <RocketIcon className="mx-auto size-8 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">
                Turn an explicit plan into executable waves.
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Nebula computes readiness and blockers. Nothing starts until you choose it.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <header className="border-b border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selectedMission.title}</h2>
                    <Badge variant={statusVariant(selectedMission.status)}>
                      {selectedMission.status}
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    {selectedMission.objective}
                  </p>
                  {selectedMission.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedMission.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={beginEdit}>
                    <PencilIcon /> Edit
                  </Button>
                  {selectedMission.status === "draft" ? (
                    <Button
                      size="xs"
                      disabled={busy || selectedMission.taskIds.length === 0 || !plan.graph.valid}
                      onClick={() =>
                        void run("Could not activate Mission", () =>
                          activateMission({
                            environmentId,
                            input: { missionId: selectedMission.id, projectId: project.id },
                          }),
                        )
                      }
                    >
                      <RocketIcon /> Activate
                    </Button>
                  ) : null}
                  {selectedMission.status === "active" && plan.readyTaskIds.length > 0 ? (
                    <Button size="xs" disabled={busy} onClick={() => void startReady()}>
                      <PlayIcon /> Start ready Tasks ({plan.readyTaskIds.length})
                    </Button>
                  ) : null}
                  {selectedMission.status === "active" && !supervisedRunActive ? (
                    <label className="flex items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground">
                      Max active
                      <input
                        aria-label="Maximum active writable Tasks"
                        className="h-6 w-10 bg-transparent text-center text-foreground outline-none"
                        type="number"
                        min={1}
                        max={32}
                        value={maxConcurrentTasks}
                        onChange={(event) =>
                          setMaxConcurrentTasks(
                            Math.min(32, Math.max(1, Number(event.target.value) || 1)),
                          )
                        }
                      />
                    </label>
                  ) : null}
                  {selectedMission.status === "active" && !supervisedRunActive ? (
                    <select
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                      value={routingProfile}
                      onChange={(event) => setRoutingProfile(event.target.value as RoutingProfile)}
                      aria-label="Supervised Run routing profile"
                    >
                      <option value="manual_only">Manual Only</option>
                      <option value="balanced">Balanced</option>
                      <option value="maximum_quality">Maximum Quality</option>
                      <option value="maximum_speed">Maximum Speed</option>
                      <option value="preserve_capacity">Preserve Capacity</option>
                      <option value="provider_diversity">Provider Diversity</option>
                    </select>
                  ) : null}
                  {selectedMission.status === "active" && !supervisedRunActive ? (
                    <Button
                      size="xs"
                      disabled={busy || !plan.graph.valid || !architectProposalApproved}
                      title={
                        architectProposalApproved
                          ? undefined
                          : "Approve and materialize the Architect plan before starting a supervised Run."
                      }
                      onClick={() => void startSupervisedRun()}
                    >
                      <PlayIcon /> Start supervised Run
                    </Button>
                  ) : null}
                  {(selectedMissionRun?.status === "running" ||
                    selectedMissionRun?.status === "attention") && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run("Could not pause Mission Run", () =>
                          pauseMissionRun({
                            environmentId,
                            input: { runId: selectedMissionRun.id },
                          }),
                        )
                      }
                    >
                      <PauseIcon /> Pause Run
                    </Button>
                  )}
                  {selectedMissionRun?.status === "paused" ? (
                    <Button
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        void run("Could not resume Mission Run", () =>
                          resumeMissionRun({
                            environmentId,
                            input: { runId: selectedMissionRun.id },
                          }),
                        )
                      }
                    >
                      <PlayIcon /> Resume Run
                    </Button>
                  ) : null}
                  {supervisedRunActive ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          "Stop automatic scheduling? Existing Tasks, worktrees, and provider turns remain intact and inspectable.",
                        ) &&
                        void run("Could not stop Mission Run", () =>
                          stopMissionRun({
                            environmentId,
                            input: { runId: selectedMissionRun.id },
                          }),
                        )
                      }
                    >
                      <SquareIcon /> Stop Run
                    </Button>
                  ) : null}
                  {selectedMission.status === "active" && plan.completionEligible ? (
                    <Button
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        void run("Could not complete Mission", () =>
                          completeMission({
                            environmentId,
                            input: { missionId: selectedMission.id, projectId: project.id },
                          }),
                        )
                      }
                    >
                      <CheckCircle2Icon /> Complete Mission
                    </Button>
                  ) : null}
                  {selectedMission.status === "draft" || selectedMission.status === "active" ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          "Cancel Mission coordination? Existing Tasks and workspaces remain intact.",
                        ) &&
                        void run("Could not cancel Mission", () =>
                          cancelMission({
                            environmentId,
                            input: { missionId: selectedMission.id, projectId: project.id },
                          }),
                        )
                      }
                    >
                      <XCircleIcon /> Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[11px] text-muted-foreground">Tasks</p>
                  <p className="text-sm font-medium">{selectedMission.taskIds.length}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[11px] text-muted-foreground">Dependencies</p>
                  <p className="text-sm font-medium">{selectedMission.dependencies.length}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[11px] text-muted-foreground">Waves</p>
                  <p className="text-sm font-medium">{plan.waves.length}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[11px] text-muted-foreground">Cycles</p>
                  <p className="text-sm font-medium">{plan.graph.valid ? 0 : 1}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[11px] text-muted-foreground">Integration</p>
                  <p className="truncate text-sm font-medium">
                    {plan.integration?.status ?? "Not linked"}
                  </p>
                </div>
              </div>
              {selectedProviderCounts.size > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Providers</span>
                  {[...selectedProviderCounts].map(([provider, count]) => (
                    <span key={provider} className="rounded-full bg-muted/45 px-2 py-1">
                      {provider} {count} {count === 1 ? "Task" : "Tasks"}
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="space-y-4 p-4">
              {selectedMissionRun ? (
                <section
                  className="rounded-lg border border-border/70 bg-muted/20 p-3"
                  aria-label="Supervised Mission Run"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">Supervised Mission Run</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Max {selectedMissionRun.maxConcurrentTasks} active writable Tasks · started{" "}
                        {new Date(selectedMissionRun.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={statusVariant(selectedMissionRun.status)}>
                      {selectedMissionRun.status}
                    </Badge>
                  </div>
                  {selectedMissionRun.status === "completed" ? (
                    <p className="mt-3 rounded-md border border-success/25 bg-success/10 p-2 text-xs text-success">
                      All Mission Tasks completed. Mission ready for Integration.
                    </p>
                  ) : null}
                  {selectedMissionRun.attention.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs text-warning">
                      {selectedMissionRun.attention.map((item) => (
                        <li key={`${item.taskId ?? "mission"}:${item.code}`}>
                          {item.taskId
                            ? `${taskById.get(item.taskId)?.title ?? item.taskId}: `
                            : ""}
                          {item.detail}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(selectedMissionRun.taskRecovery ?? []).length > 0 ? (
                    <details className="mt-3 text-xs" open>
                      <summary className="cursor-pointer text-muted-foreground">
                        Execution attempts
                      </summary>
                      <div className="mt-2 space-y-2">
                        {(selectedMissionRun.taskRecovery ?? []).map((state) => (
                          <div key={state.taskId} className="rounded-md bg-background/65 p-2">
                            <p className="text-foreground">
                              {taskById.get(state.taskId)?.title ?? state.taskId} · retries{" "}
                              {state.transientRetries}/
                              {selectedMissionRun.recoveryPolicy?.transportRetryLimit ?? 2} ·
                              remediation {state.remediationRounds}/
                              {selectedMissionRun.recoveryPolicy?.remediationLimit ?? 2}
                            </p>
                            {state.attempts.map((attempt) => (
                              <p
                                key={`${attempt.threadId}:${attempt.number}`}
                                className="mt-1 text-muted-foreground"
                              >
                                Attempt {attempt.number} — {attempt.providerInstanceId} ·{" "}
                                {attempt.kind} · {attempt.status}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {(selectedMissionRun.coordinationRequests ?? []).some(
                    (request) => request.status === "pending",
                  ) ? (
                    <div className="mt-3 space-y-2">
                      {(selectedMissionRun.coordinationRequests ?? [])
                        .filter((request) => request.status === "pending")
                        .map((request) => (
                          <div
                            key={request.id}
                            className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs"
                          >
                            <p className="text-foreground">{request.kind.replaceAll("_", " ")}</p>
                            <p className="mt-1 text-muted-foreground">{request.reason}</p>
                            {request.kind === "ownership_request" ? (
                              <p className="mt-2 text-warning">
                                Approve or deny this in the Task ownership request workflow.
                              </p>
                            ) : (
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="xs"
                                  onClick={() => {
                                    const answer =
                                      request.kind === "contract_question" ||
                                      request.kind === "dependency_question"
                                        ? window.prompt(
                                            "Answer from an approved contract or human decision",
                                          )
                                        : null;
                                    if (
                                      (request.kind === "contract_question" ||
                                        request.kind === "dependency_question") &&
                                      !answer
                                    )
                                      return;
                                    void run("Could not resolve request", () =>
                                      resolveCoordinationRequest({
                                        environmentId,
                                        input: {
                                          runId: selectedMissionRun.id,
                                          requestId: request.id,
                                          resolution: answer ? "answered" : "approved",
                                          answer,
                                        },
                                      }),
                                    );
                                  }}
                                >
                                  {request.kind.includes("question") ? "Answer" : "Approve"}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    void run("Could not deny request", () =>
                                      resolveCoordinationRequest({
                                        environmentId,
                                        input: {
                                          runId: selectedMissionRun.id,
                                          requestId: request.id,
                                          resolution: "denied",
                                        },
                                      }),
                                    )
                                  }
                                >
                                  Deny
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : null}
                  {(selectedMissionRun.replanProposals ?? []).some(
                    (proposal) => proposal.status === "pending",
                  ) ? (
                    <div className="mt-3 space-y-2">
                      {(selectedMissionRun.replanProposals ?? [])
                        .filter((proposal) => proposal.status === "pending")
                        .map((proposal) => (
                          <div
                            key={proposal.id}
                            className="rounded-md border border-warning/30 p-2 text-xs"
                          >
                            <p className="text-foreground">
                              Replan proposal · {proposal.scope.replaceAll("_", " ")}
                            </p>
                            <p className="mt-1 text-muted-foreground">{proposal.summary}</p>
                            <p className="mt-1 text-muted-foreground">
                              Completed Task history preserved:{" "}
                              {proposal.preservedCompletedTaskIds.length}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="xs"
                                onClick={() =>
                                  void run("Could not approve replan proposal", () =>
                                    resolveReplan({
                                      environmentId,
                                      input: {
                                        runId: selectedMissionRun.id,
                                        proposalId: proposal.id,
                                        resolution: "approved",
                                      },
                                    }),
                                  )
                                }
                              >
                                Approve proposal
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  void run("Could not reject replan proposal", () =>
                                    resolveReplan({
                                      environmentId,
                                      input: {
                                        runId: selectedMissionRun.id,
                                        proposalId: proposal.id,
                                        resolution: "rejected",
                                      },
                                    }),
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : null}
                  {selectedMissionRun.decisions.length > 0 ? (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Scheduler decisions ({selectedMissionRun.decisions.length})
                      </summary>
                      <ol className="mt-2 max-h-40 space-y-1 overflow-auto">
                        {selectedMissionRun.decisions
                          .toReversed()
                          .slice(0, 30)
                          .map((decision) => (
                            <li
                              key={decision.id}
                              className="rounded-md bg-background/65 px-2 py-1.5"
                            >
                              <span className="text-foreground">
                                {decision.taskId
                                  ? (taskById.get(decision.taskId)?.title ?? decision.taskId)
                                  : "Mission"}
                              </span>{" "}
                              <span className="text-muted-foreground">— {decision.reason}</span>
                            </li>
                          ))}
                      </ol>
                    </details>
                  ) : null}
                </section>
              ) : null}
              {!plan.graph.valid ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <TriangleAlertIcon className="mr-2 inline size-4" />
                  {plan.graph.error}
                </div>
              ) : null}
              {plan.attention.length > 0 ? (
                <section
                  className="rounded-lg border border-warning/30 bg-warning/10 p-3"
                  aria-label="Mission attention"
                >
                  <h3 className="flex items-center gap-2 text-sm font-medium text-warning">
                    <TriangleAlertIcon className="size-4" /> Needs attention
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-warning">
                    {[...new Set(plan.attention)].map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {selectedMission.status === "draft" || selectedMission.status === "active" ? (
                <div className="grid gap-3 rounded-lg border border-border/70 p-3 xl:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium">Task membership</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="xs" onClick={() => props.onCreateTask(selectedMission.id)}>
                        <PlusIcon /> Create Task in Mission
                      </Button>
                      <select
                        className="h-7 min-w-44 rounded-md border border-border bg-background px-2 text-xs"
                        value={attachTaskId}
                        onChange={(event) =>
                          setAttachTaskId(event.target.value ? TaskId.make(event.target.value) : "")
                        }
                        aria-label="Eligible existing Task"
                      >
                        <option value="">Attach existing Task…</option>
                        {attachableTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!attachTaskId || busy}
                        onClick={() =>
                          attachTaskId &&
                          void run("Could not attach Task", () =>
                            addMissionTask({
                              environmentId,
                              input: {
                                missionId: selectedMission.id,
                                projectId: project.id,
                                taskId: attachTaskId,
                              },
                            }),
                          ).then((ok) => ok && setAttachTaskId(""))
                        }
                      >
                        Attach
                      </Button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">Add dependency</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        className="h-7 min-w-36 rounded-md border border-border bg-background px-2 text-xs"
                        value={prerequisiteId}
                        onChange={(event) =>
                          setPrerequisiteId(
                            event.target.value ? TaskId.make(event.target.value) : "",
                          )
                        }
                        aria-label="Prerequisite Task"
                      >
                        <option value="">Prerequisite…</option>
                        {selectedMission.taskIds.map((taskId) => (
                          <option key={taskId} value={taskId}>
                            {taskById.get(taskId)?.title ?? taskId}
                          </option>
                        ))}
                      </select>
                      <ArrowRightIcon className="size-4 text-muted-foreground" />
                      <select
                        className="h-7 min-w-36 rounded-md border border-border bg-background px-2 text-xs"
                        value={dependentId}
                        onChange={(event) =>
                          setDependentId(event.target.value ? TaskId.make(event.target.value) : "")
                        }
                        aria-label="Dependent Task"
                      >
                        <option value="">Dependent…</option>
                        {selectedMission.taskIds.map((taskId) => (
                          <option key={taskId} value={taskId}>
                            {taskById.get(taskId)?.title ?? taskId}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!prerequisiteId || !dependentId || busy}
                        onClick={() =>
                          prerequisiteId &&
                          dependentId &&
                          prerequisiteId !== dependentId &&
                          confirmActiveEdit(selectedMission) &&
                          void run("Could not add dependency", () =>
                            addMissionDependency({
                              environmentId,
                              input: {
                                missionId: selectedMission.id,
                                projectId: project.id,
                                prerequisiteTaskId: prerequisiteId,
                                dependentTaskId: dependentId,
                                ...(selectedMission.status === "active"
                                  ? { confirmActiveEdit: true }
                                  : {}),
                              },
                            }),
                          ).then((ok) => {
                            if (ok) {
                              setPrerequisiteId("");
                              setDependentId("");
                            }
                          })
                        }
                      >
                        <Link2Icon /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <GitBranchIcon className="size-4 text-primary" />
                    Execution plan
                  </h3>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      variant={view === "graph" ? "default" : "outline"}
                      onClick={() => setView("graph")}
                    >
                      Graph
                    </Button>
                    <Button
                      size="xs"
                      variant={view === "waves" ? "default" : "outline"}
                      onClick={() => setView("waves")}
                    >
                      Waves
                    </Button>
                  </div>
                </div>
                {view === "graph" ? (
                  <MissionGraph
                    mission={selectedMission}
                    plan={plan}
                    onOpenTask={props.onOpenTask}
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {plan.waves.map((wave) => (
                      <section key={wave.number} className="rounded-lg border border-border/70 p-3">
                        <h4 className="text-sm font-medium">Wave {wave.number}</h4>
                        <ul className="mt-2 space-y-2">
                          {wave.taskIds.map((taskId) => {
                            const item = plan.tasks.find(
                              (candidate) => candidate.task.id === taskId,
                            );
                            if (!item) return null;
                            return (
                              <li key={taskId}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/35 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => props.onOpenTask(taskId)}
                                >
                                  <span className="truncate text-sm">{item.task.title}</span>
                                  <Badge size="sm" variant={statusVariant(item.status)}>
                                    {item.status}
                                  </Badge>
                                </button>
                                {item.blockerReasons.length > 0 ? (
                                  <p className="mt-1 text-[11px] text-warning">
                                    {item.blockerReasons.join(" · ")}
                                  </p>
                                ) : null}
                                {item.resourceBlockers.length > 0 ? (
                                  <p className="mt-1 text-[11px] text-warning">
                                    Waiting for{" "}
                                    {item.resourceBlockers
                                      .map(
                                        ({ resource, lease }) =>
                                          `${resource.name} · held by ${tasks.find((task) => task.id === lease.taskId)?.title ?? lease.taskId}`,
                                      )
                                      .join(" · ")}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-border/70 p-3">
                  <h3 className="text-sm font-medium">Tasks and dependencies</h3>
                  <ul className="mt-2 space-y-2">
                    {plan.tasks.map((item, index) => (
                      <li key={item.task.id} className="rounded-md bg-muted/30 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 truncate text-left text-sm font-medium underline-offset-2 hover:underline"
                            onClick={() => props.onOpenTask(item.task.id)}
                          >
                            {item.task.title}
                          </button>
                          <div className="flex items-center gap-1">
                            <Badge size="sm" variant={statusVariant(item.status)}>
                              {item.status}
                            </Badge>
                            {selectedMission.status === "draft" ||
                            (selectedMission.status === "active" &&
                              item.task.status === "draft") ? (
                              <>
                                <Button
                                  aria-label={`Move ${item.task.title} up`}
                                  size="icon-xs"
                                  variant="ghost"
                                  disabled={index === 0}
                                  onClick={() => {
                                    const next = [...selectedMission.taskIds];
                                    [next[index - 1], next[index]] = [
                                      next[index]!,
                                      next[index - 1]!,
                                    ];
                                    void run("Could not reorder Tasks", () =>
                                      reorderMissionTasks({
                                        environmentId,
                                        input: {
                                          missionId: selectedMission.id,
                                          projectId: project.id,
                                          taskIds: next,
                                        },
                                      }),
                                    );
                                  }}
                                >
                                  <ArrowUpIcon />
                                </Button>
                                <Button
                                  aria-label={`Move ${item.task.title} down`}
                                  size="icon-xs"
                                  variant="ghost"
                                  disabled={index === plan.tasks.length - 1}
                                  onClick={() => {
                                    const next = [...selectedMission.taskIds];
                                    [next[index], next[index + 1]] = [
                                      next[index + 1]!,
                                      next[index]!,
                                    ];
                                    void run("Could not reorder Tasks", () =>
                                      reorderMissionTasks({
                                        environmentId,
                                        input: {
                                          missionId: selectedMission.id,
                                          projectId: project.id,
                                          taskIds: next,
                                        },
                                      }),
                                    );
                                  }}
                                >
                                  <ArrowDownIcon />
                                </Button>
                                <Button
                                  aria-label={`Remove ${item.task.title} from Mission`}
                                  size="icon-xs"
                                  variant="ghost"
                                  onClick={() =>
                                    confirmActiveEdit(selectedMission) &&
                                    void run("Could not remove Task", () =>
                                      removeMissionTask({
                                        environmentId,
                                        input: {
                                          missionId: selectedMission.id,
                                          projectId: project.id,
                                          taskId: item.task.id,
                                          ...(selectedMission.status === "active"
                                            ? { confirmActiveEdit: true }
                                            : {}),
                                        },
                                      }),
                                    )
                                  }
                                >
                                  <Trash2Icon />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {item.attention.length > 0 ? (
                          <p className="mt-1 text-[11px] text-warning">
                            {item.attention.join(" · ")}
                          </p>
                        ) : null}
                        {selectedMission.dependencies
                          .filter((edge) => edge.dependentTaskId === item.task.id)
                          .map((edge) => (
                            <div
                              key={`${edge.prerequisiteTaskId}:${edge.dependentTaskId}`}
                              className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                            >
                              <span>
                                Depends on{" "}
                                {taskById.get(edge.prerequisiteTaskId)?.title ??
                                  edge.prerequisiteTaskId}
                              </span>
                              {selectedMission.status === "draft" ||
                              (taskById.get(edge.prerequisiteTaskId)?.status === "draft" &&
                                item.task.status === "draft") ? (
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  aria-label={`Remove dependency from ${taskById.get(edge.prerequisiteTaskId)?.title ?? edge.prerequisiteTaskId} to ${item.task.title}`}
                                  onClick={() =>
                                    confirmActiveEdit(selectedMission) &&
                                    void run("Could not remove dependency", () =>
                                      removeMissionDependency({
                                        environmentId,
                                        input: {
                                          missionId: selectedMission.id,
                                          projectId: project.id,
                                          prerequisiteTaskId: edge.prerequisiteTaskId,
                                          dependentTaskId: edge.dependentTaskId,
                                          ...(selectedMission.status === "active"
                                            ? { confirmActiveEdit: true }
                                            : {}),
                                        },
                                      }),
                                    )
                                  }
                                >
                                  <XCircleIcon />
                                </Button>
                              ) : null}
                            </div>
                          ))}
                      </li>
                    ))}
                  </ul>
                </section>

                <div className="space-y-4">
                  <section className="rounded-lg border border-border/70 p-3">
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <ActivityIcon className="size-4 text-primary" />
                      Mission activity
                    </h3>
                    <ol className="mt-2 max-h-52 space-y-2 overflow-auto">
                      {selectedMission.activities
                        .toReversed()
                        .slice(0, 20)
                        .map((activity) => (
                          <li key={activity.id} className="flex gap-2 text-xs">
                            <CircleDotIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <span>
                              <span className="text-foreground">{activity.summary}</span>
                              <span className="ml-2 text-muted-foreground">
                                {new Date(activity.occurredAt).toLocaleString()}
                              </span>
                            </span>
                          </li>
                        ))}
                    </ol>
                  </section>
                  <section className="rounded-lg border border-border/70 p-3">
                    <h3 className="text-sm font-medium">Integrate Mission results</h3>
                    {plan.integration ? (
                      <>
                        <p className="mt-2 text-sm">
                          Linked Batch{" "}
                          <span className="font-mono text-xs">{plan.integration.id}</span> is{" "}
                          <Badge size="sm" variant={statusVariant(plan.integration.status)}>
                            {plan.integration.status}
                          </Badge>
                          .
                        </p>
                        {plan.integration.status === "failed" ||
                        plan.integration.status === "cancelled" ? (
                          <Button
                            className="mt-2"
                            size="xs"
                            disabled={busy || integrationOrder.length === 0}
                            onClick={() =>
                              window.confirm(
                                "Replace the failed or cancelled Integration Batch using the current topological order?",
                              ) &&
                              void run("Could not replace Mission Integration", () =>
                                createIntegration({
                                  environmentId,
                                  input: {
                                    batchId: IntegrationBatchId.make(randomUUID()),
                                    projectId: project.id,
                                    taskIds: integrationOrder,
                                    acknowledgeOverlaps: true,
                                    missionId: selectedMission.id,
                                  },
                                }),
                              )
                            }
                          >
                            <GitBranchIcon /> Replace Integration Batch
                          </Button>
                        ) : null}
                      </>
                    ) : eligibleIntegrationIds.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Completed Tasks with retained TaskResults appear here.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Topological order is suggested. Confirm or reorder before creating the
                          isolated Integration Batch.
                        </p>
                        <ol className="mt-2 space-y-1">
                          {integrationOrder.map((taskId, index) => (
                            <li
                              key={taskId}
                              className="flex items-center justify-between rounded-md bg-muted/35 px-2 py-1.5 text-xs"
                            >
                              <span>
                                {index + 1}. {taskById.get(taskId)?.title ?? taskId}
                              </span>
                              <span>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  disabled={index === 0}
                                  onClick={() => moveIntegration(taskId, -1)}
                                >
                                  <ArrowUpIcon />
                                </Button>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  disabled={index === integrationOrder.length - 1}
                                  onClick={() => moveIntegration(taskId, 1)}
                                >
                                  <ArrowDownIcon />
                                </Button>
                              </span>
                            </li>
                          ))}
                        </ol>
                        <Button
                          className="mt-2"
                          size="xs"
                          disabled={busy || integrationOrder.length === 0}
                          onClick={() =>
                            window.confirm(
                              "Create an Integration Batch in this order? This acknowledges reviewed overlap information; you can still inspect and resolve conflicts before validation.",
                            ) &&
                            void run("Could not create Mission Integration", () =>
                              createIntegration({
                                environmentId,
                                input: {
                                  batchId: IntegrationBatchId.make(randomUUID()),
                                  projectId: project.id,
                                  taskIds: integrationOrder,
                                  acknowledgeOverlaps: true,
                                  missionId: selectedMission.id,
                                },
                              }),
                            )
                          }
                        >
                          <GitBranchIcon /> Create Integration Batch
                        </Button>
                      </>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create Mission</DialogTitle>
            <DialogDescription>
              Define the objective. Tasks and dependencies remain explicitly human-authored.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Title
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Objective
              <Textarea
                className="mt-1"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Description (optional)
              <Textarea
                className="mt-1"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !title.trim() || !objective.trim()}
              onClick={() => void create()}
            >
              Create Mission
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Edit Mission</DialogTitle>
            <DialogDescription>
              Mission detail changes do not rewrite its Task graph.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Title
              <input
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Objective
              <Textarea
                className="mt-1"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Description
              <Textarea
                className="mt-1"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !title.trim() || !objective.trim()}
              onClick={() => void saveEdit()}
            >
              Save Mission
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
