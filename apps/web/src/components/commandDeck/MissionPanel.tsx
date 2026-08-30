import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  IntegrationBatchId,
  MissionId,
  MissionRunId,
  ReplanProposalId,
  TaskId,
  type EnvironmentId,
  type Mission,
  type MissionRun,
  type OrchestrationProjectShell,
  type OrchestrationTask,
  type OrchestrationThreadShell,
  type ReplanChangeSet,
  type ReplanEvidence,
  type ReplanScope,
  type ReplanTrigger,
  type RoutingProfile,
} from "@t3tools/contracts";
import { computeMissionPlan, missionTopologicalTaskIds } from "@t3tools/shared/missionGraph";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
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
  TerminalIcon,
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
import { MissionCommandCenter } from "./MissionCommandCenter";
import { missionTaskStateLabel } from "./missionCommandCenterViewModel";

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
  readonly onOpenTaskWorkspace: (taskId: TaskId) => void;
  readonly onCreateTask: (missionId: MissionId) => void;
  readonly onOpenTerminalCenter: () => void;
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
  run,
  plan,
  onOpenTask,
}: {
  readonly mission: Mission;
  readonly run: MissionRun | null;
  readonly plan: ReturnType<typeof computeMissionPlan>;
  readonly onOpenTask: (taskId: TaskId) => void;
}) {
  const proposedReplan = run?.replanProposals?.find((proposal) =>
    ["requested", "analyzing", "awaiting_approval", "approved"].includes(proposal.status),
  );
  const proposedNewTasks = proposedReplan?.changeSet?.newTasks ?? [];
  const proposedAffectedTaskIds = new Set(proposedReplan?.affectedTaskIds ?? []);
  const currentAddedTaskIds = new Set(mission.planVersions?.at(-1)?.addedTaskIds ?? []);
  const positions = new Map<TaskId, { x: number; y: number }>();
  for (const wave of plan.waves) {
    wave.taskIds.forEach((taskId, index) =>
      positions.set(taskId, { x: (wave.number - 1) * 250 + 20, y: index * 112 + 38 }),
    );
  }
  const width = Math.max(300, plan.waves.length * 250 + 20, proposedNewTasks.length * 212 + 20);
  const graphHeight = Math.max(190, ...plan.waves.map((wave) => wave.taskIds.length * 112 + 40));
  const height = graphHeight + (proposedNewTasks.length > 0 ? 118 : 0);
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
          const stateLabel = missionTaskStateLabel(item, run, plan.integration);
          const replanState =
            item.task.replan?.state === "superseded"
              ? "superseded"
              : currentAddedTaskIds.has(item.task.id)
                ? "new"
                : proposedReplan
                  ? proposedAffectedTaskIds.has(item.task.id)
                    ? "affected"
                    : "preserved"
                  : null;
          return (
            <button
              key={item.task.id}
              type="button"
              onClick={() => onOpenTask(item.task.id)}
              className={`absolute w-[196px] rounded-lg border p-2.5 text-left shadow-sm transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${replanState === "superseded" ? "border-border/60 bg-muted/25 opacity-70" : replanState === "affected" ? "border-warning/50 bg-warning/10" : replanState === "preserved" ? "border-success/35 bg-success/5" : replanState === "new" ? "border-info/40 bg-info/5" : "border-border bg-card"}`}
              style={{ left: position.x, top: position.y }}
              aria-label={`${item.task.title}, ${stateLabel}, wave ${item.wave}`}
            >
              <span className="block truncate text-sm font-medium">{item.task.title}</span>
              <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {item.task.modelSelection?.instanceId ?? "Unassigned"} · {item.task.role}
                </span>
                <Badge size="sm" variant={statusVariant(item.status)}>
                  {replanState ? replanState.replaceAll("_", " ") : stateLabel}
                </Badge>
              </span>
            </button>
          );
        })}
        {proposedNewTasks.map((task, index) => (
          <div
            key={task.taskId}
            className="absolute w-[196px] rounded-lg border border-dashed border-info/50 bg-info/5 p-2.5 text-left shadow-sm"
            style={{ left: 20 + index * 212, top: graphHeight + 18 }}
          >
            <span className="block truncate text-sm font-medium">{task.title}</span>
            <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{task.modelSelection?.instanceId ?? "Unassigned"} · builder</span>
              <Badge size="sm" variant="info">
                Proposed new
              </Badge>
            </span>
          </div>
        ))}
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
  const [swarmLaunchOpen, setSwarmLaunchOpen] = useState(false);
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
  const [autonomyMode, setAutonomyMode] = useState<"manual" | "assisted" | "supervised_swarm">(
    "manual",
  );
  const [retryBudget, setRetryBudget] = useState(1);
  const [remediationBudget, setRemediationBudget] = useState(0);
  const [autoIntegration, setAutoIntegration] = useState(true);

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
  const requestReplan = useAtomCommand(projectEnvironment.requestMissionRunReplan, {
    reportFailure: false,
  });
  const proposeReplan = useAtomCommand(projectEnvironment.proposeMissionRunReplan, {
    reportFailure: false,
  });
  const applyReplan = useAtomCommand(projectEnvironment.applyMissionRunReplan, {
    reportFailure: false,
  });
  const resolveProviderSubstitution = useAtomCommand(
    projectEnvironment.resolveMissionRunProviderSubstitution,
    { reportFailure: false },
  );
  const createIntegration = useAtomCommand(projectEnvironment.createIntegration, {
    reportFailure: false,
  });
  const abortIntegration = useAtomCommand(projectEnvironment.abortIntegration, {
    reportFailure: false,
  });
  const removeIntegrationWorkspace = useAtomCommand(projectEnvironment.removeIntegrationWorkspace, {
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
  const swarmTaskCounts = useMemo(() => {
    if (!selectedMission) return { completed: 0, active: 0, waitingResource: 0 };
    const members = selectedMission.taskIds.flatMap((taskId) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      return task ? [task] : [];
    });
    return {
      completed: members.filter((task) => task.status === "completed").length,
      active: members.filter((task) => task.status === "active").length,
      waitingResource:
        selectedMissionRun?.decisions.filter((decision) => decision.kind === "waiting_resource")
          .length ?? 0,
    };
  }, [selectedMission, selectedMissionRun, tasks]);
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
    const started = await run("Could not start supervised Mission Run", () =>
      startMissionRun({
        environmentId,
        input: {
          runId: MissionRunId.make(randomUUID()),
          missionId: selectedMission.id,
          projectId: project.id,
          maxConcurrentTasks,
          routingProfile,
          transportRetryLimit: retryBudget,
          remediationLimit: remediationBudget,
          autoIntegration,
          stopOnConflict: true,
          independentReviewRequired: true,
          preapprovedOverlapPaths: [],
          autoCompleteMission: autoIntegration,
        },
      }),
    );
    if (started) setSwarmLaunchOpen(false);
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
  const restoreMissionBaseline = async () => {
    if (!selectedMission || !selectedMissionRun) return;
    const batch = (project.integrationBatches ?? []).find(
      (candidate) => candidate.id === selectedMission.integrationBatchId,
    );
    if (supervisedRunActive) {
      const stopped = await run("Could not abort Swarm Run", () =>
        stopMissionRun({ environmentId, input: { runId: selectedMissionRun.id } }),
      );
      if (!stopped) return;
    }
    if (batch && ["preparing", "applying", "conflict", "validating"].includes(batch.status)) {
      await run("Could not abort Integration", () =>
        abortIntegration({
          environmentId,
          input: { batchId: batch.id, projectId: project.id },
        }),
      );
      return;
    }
    if (batch?.workspacePath && ["ready", "failed", "cancelled"].includes(batch.status)) {
      await run("Could not remove Integration workspace", () =>
        removeIntegrationWorkspace({
          environmentId,
          input: { batchId: batch.id, projectId: project.id },
        }),
      );
    }
  };

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
                    <select
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                      value={autonomyMode}
                      onChange={(event) =>
                        setAutonomyMode(
                          event.target.value as "manual" | "assisted" | "supervised_swarm",
                        )
                      }
                      aria-label="Mission autonomy level"
                    >
                      <option value="manual">Manual</option>
                      <option value="assisted">Assisted</option>
                      <option value="supervised_swarm">Supervised Swarm</option>
                    </select>
                  ) : null}
                  {selectedMission.status === "active" &&
                  !supervisedRunActive &&
                  autonomyMode === "supervised_swarm" ? (
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
                  {selectedMission.status === "active" &&
                  !supervisedRunActive &&
                  autonomyMode === "supervised_swarm" ? (
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
                  {selectedMission.status === "active" &&
                  !supervisedRunActive &&
                  autonomyMode === "supervised_swarm" ? (
                    <Button
                      size="xs"
                      disabled={busy || !plan.graph.valid || !architectProposalApproved}
                      title={
                        architectProposalApproved
                          ? undefined
                          : "Approve and materialize the Architect plan before starting a supervised Run."
                      }
                      onClick={() => setSwarmLaunchOpen(true)}
                    >
                      <PlayIcon /> Run as Swarm
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
                      <SquareIcon /> Abort Swarm Run
                    </Button>
                  ) : null}
                  {selectedMissionRun ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          "Restore the Mission baseline? Nebula stops future scheduling and aborts or removes the current Integration workspace. Task results, recovery refs, audit history, and the source checkout are preserved. Run this action again after an active Integration finishes aborting to remove its workspace.",
                        ) && void restoreMissionBaseline()
                      }
                    >
                      <Trash2Icon /> Restore Mission Baseline
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
              {selectedMission.status === "active" && !supervisedRunActive ? (
                <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                  {autonomyMode === "manual"
                    ? "Manual: you create and start every Task."
                    : autonomyMode === "assisted"
                      ? "Assisted: Architect proposes the plan; you approve it and start execution manually."
                      : "Supervised Swarm: after approval and explicit launch, Nebula schedules the frozen DAG and pauses at high-risk boundaries."}
                </p>
              ) : null}
            </header>

            <div className="space-y-4 p-4">
              <MissionCommandCenter
                mission={selectedMission}
                run={selectedMissionRun}
                plan={plan}
                tasks={tasks}
                repository={project.repositoryIdentity?.displayName ?? project.title}
                onOpenTask={props.onOpenTask}
                onOpenTaskRecovery={props.onOpenTaskWorkspace}
                onOpenIntegration={() =>
                  document
                    .getElementById(`mission-integration-${selectedMission.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                onOpenTerminalCenter={props.onOpenTerminalCenter}
                onResolveCoordinationRequest={(request, resolution, answer) =>
                  void run("Could not resolve request", () =>
                    resolveCoordinationRequest({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        requestId: request.id,
                        resolution,
                        ...(answer !== undefined ? { answer } : {}),
                      },
                    }),
                  )
                }
                onResolveReplan={(proposal, resolution) =>
                  void run("Could not resolve replan proposal", () =>
                    resolveReplan({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        proposalId: proposal.id,
                        resolution,
                      },
                    }),
                  )
                }
                onRequestReplan={(input: {
                  sourceTaskId: TaskId | null;
                  trigger: ReplanTrigger;
                  scope: ReplanScope;
                  reason: string;
                  evidence: ReadonlyArray<ReplanEvidence>;
                }) =>
                  void run("Could not request bounded replan", () =>
                    requestReplan({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        proposalId: ReplanProposalId.make(`replan:${randomUUID()}`),
                        ...input,
                        evidence: [...input.evidence],
                        userInitiated: true,
                      },
                    }),
                  )
                }
                onProposeReplan={(proposal, changeSet: ReplanChangeSet) =>
                  void run("Could not validate proposed replan", () =>
                    proposeReplan({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        proposalId: proposal.id,
                        changeSet,
                      },
                    }),
                  )
                }
                onApplyReplan={(proposal) =>
                  void run("Could not apply approved replan", () =>
                    applyReplan({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        proposalId: proposal.id,
                      },
                    }),
                  )
                }
                onResolveProviderSubstitution={(taskId, resolution) =>
                  void run("Could not resolve provider substitution", () =>
                    resolveProviderSubstitution({
                      environmentId,
                      input: {
                        runId: selectedMissionRun!.id,
                        taskId,
                        resolution,
                      },
                    }),
                  )
                }
              />
              {selectedMissionRun ? (
                <section
                  className="rounded-lg border border-border/70 bg-muted/20 p-3"
                  aria-label="Supervised Mission Run"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">
                        {selectedMissionRun.status === "running"
                          ? "Swarm running"
                          : `Swarm ${selectedMissionRun.status}`}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {swarmTaskCounts.completed} / {selectedMission.taskIds.length} Tasks
                        complete · {swarmTaskCounts.active} active ·{" "}
                        {swarmTaskCounts.waitingResource} waiting on resource ·{" "}
                        {selectedMissionRun.attention.length} attention
                      </p>
                    </div>
                    <Badge variant={statusVariant(selectedMissionRun.status)}>
                      {selectedMissionRun.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Recorded elapsed{" "}
                      {Math.max(
                        0,
                        Math.round(
                          (new Date(selectedMissionRun.updatedAt).getTime() -
                            new Date(selectedMissionRun.startedAt).getTime()) /
                            1000,
                        ),
                      )}
                      s
                    </span>
                    <Button size="xs" variant="outline" onClick={props.onOpenTerminalCenter}>
                      <ActivityIcon /> Terminal Center
                    </Button>
                  </div>
                  {selectedMissionRun.status === "completed" ? (
                    <p className="mt-3 rounded-md border border-success/25 bg-success/10 p-2 text-xs text-success">
                      {selectedMission.status === "completed"
                        ? "Mission completed after Integration and final validation passed."
                        : selectedMissionRun.finalReport?.finalValidation === "ready"
                          ? "Latest Run completed. Mission remains active because canonical auto-completion was disabled for this Run."
                          : "All Mission Tasks completed. Mission ready for Integration."}
                    </p>
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
                    run={selectedMissionRun}
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
                                    {missionTaskStateLabel(
                                      item,
                                      selectedMissionRun,
                                      plan.integration,
                                    )}
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
                              {missionTaskStateLabel(item, selectedMissionRun, plan.integration)}
                            </Badge>
                            <Button
                              aria-label={`Open ${item.task.title} in Terminal Center`}
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => props.onOpenTaskWorkspace(item.task.id)}
                            >
                              <TerminalIcon />
                            </Button>
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
                  <section
                    id={`mission-integration-${selectedMission.id}`}
                    className="scroll-mt-4 rounded-lg border border-border/70 p-3"
                  >
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

      <Dialog open={swarmLaunchOpen} onOpenChange={setSwarmLaunchOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Run as Swarm</DialogTitle>
            <DialogDescription>
              Review the frozen policy snapshot. Nebula will never approve the plan or merge main.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Architect proposed this plan and you approved it.</li>
              <li>Nebula schedules only the approved Tasks.</li>
              <li>Provider work stays isolated by Task.</li>
              <li>Quality gates and independent reviews run automatically.</li>
              <li>
                Nebula pauses for ownership, policy, conflict, and exhausted recovery decisions.
              </li>
              <li>Integration may become Ready, but main is never merged automatically.</li>
            </ol>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border border-border/70 p-3 text-xs">
              <dt className="text-muted-foreground">Mission</dt>
              <dd>{selectedMission?.title ?? "Mission"}</dd>
              <dt className="text-muted-foreground">Tasks</dt>
              <dd>{selectedMission?.taskIds.length ?? 0}</dd>
              <dt className="text-muted-foreground">Providers</dt>
              <dd>{[...selectedProviderCounts.keys()].join(", ") || "Automatic routing"}</dd>
              <dt className="text-muted-foreground">Concurrency</dt>
              <dd>{maxConcurrentTasks}</dd>
              <dt className="text-muted-foreground">Routing</dt>
              <dd>{routingProfile.replaceAll("_", " ")}</dd>
              <dt className="text-muted-foreground">Retry budget</dt>
              <dd>
                <input
                  aria-label="Swarm retry budget"
                  className="h-6 w-12 rounded border border-border bg-background text-center"
                  type="number"
                  min={0}
                  max={10}
                  value={retryBudget}
                  onChange={(event) =>
                    setRetryBudget(Math.min(10, Math.max(0, Number(event.target.value) || 0)))
                  }
                />
              </dd>
              <dt className="text-muted-foreground">Remediation rounds</dt>
              <dd>
                <input
                  aria-label="Swarm remediation budget"
                  className="h-6 w-12 rounded border border-border bg-background text-center"
                  type="number"
                  min={0}
                  max={10}
                  value={remediationBudget}
                  onChange={(event) =>
                    setRemediationBudget(Math.min(10, Math.max(0, Number(event.target.value) || 0)))
                  }
                />
              </dd>
              <dt className="text-muted-foreground">Independent review</dt>
              <dd>Required</dd>
              <dt className="text-muted-foreground">Automatic Integration</dt>
              <dd>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoIntegration}
                    onChange={(event) => setAutoIntegration(event.target.checked)}
                  />
                  {autoIntegration ? "Enabled" : "Disabled"}
                </label>
              </dd>
              <dt className="text-muted-foreground">Main branch merge</dt>
              <dd>Never</dd>
            </dl>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwarmLaunchOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void startSupervisedRun()}>
              <PlayIcon /> Run Swarm
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

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
