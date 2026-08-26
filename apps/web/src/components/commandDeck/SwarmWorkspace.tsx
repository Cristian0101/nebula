import { useAtomValue } from "@effect/atom-react";
import {
  ArchitectPlanProposalId,
  MissionRunId,
  type ArchitectMissionDraft,
  type ArchitectModelSelection,
  type ArchitectPlanProposal,
  type ArchitectPlanningFailureCategory,
  type ArchitectTeamConfiguration,
  type EnvironmentId,
  type Mission,
  type MissionRun,
  type OrchestrationProject,
  type OrchestrationTask,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  ARCHITECT_TEAM_PRESET_OPTIONS,
  createArchitectTeamConfiguration,
  validateArchitectPlan,
} from "@t3tools/shared/architectPlan";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveMissionCheckpointState } from "@t3tools/shared/missionRunner";
import { useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  BoxesIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  Clock3Icon,
  Code2Icon,
  FileCode2Icon,
  GitBranchIcon,
  ListTreeIcon,
  NetworkIcon,
  PauseIcon,
  PlayIcon,
  RefreshCcwIcon,
  RouteIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  TerminalIcon,
  TestTube2Icon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "../../env";
import { usePrimarySettings } from "../../hooks/useSettings";
import { randomUUID } from "../../lib/utils";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { useServerConfigs } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { environmentSnapshotAtom } from "../../state/shell";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import { deriveTerminalAgentPresentation } from "../terminalCenter/terminalCenterLogic";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { deriveCurrentAction } from "./commandDeckLogic";
import type { CommandDeckSearch } from "../../routes/projects.$projectKey_.command-deck";
import {
  SWARM_PLANNING_STEPS,
  architectProposalWaves,
  deterministicArchitectMissionId,
  deterministicArchitectTaskId,
  highValueSwarmEvents,
  isPlanningActive,
  PLANNER_PENDING_TASK_LABEL,
  planningPhaseCopy,
  planningStepIndex,
  projectTaskForPlanTask,
  swarmRunProgress,
  SWARM_STAGE_AFTER_RUN,
  threadForTask,
} from "./swarmViewModel";

type SwarmStage = NonNullable<CommandDeckSearch["stage"]>;
type TeamPlanView = "dag" | "table";

const ROLE_LABELS = {
  builder: "Builder",
  reviewer: "Reviewer",
  debugger: "Debugger",
  test_specialist: "Test specialist",
  security_reviewer: "Security reviewer",
  integrator: "Integrator",
} as const;

const FAILURE_LABELS: Record<ArchitectPlanningFailureCategory, string> = {
  provider_unavailable: "Provider unavailable",
  authentication_required: "Authentication required",
  transport_interrupted: "Transport interrupted",
  invalid_structured_plan: "Invalid structured plan",
  validation_failed: "Validation failed",
  repository_changed: "Repository changed",
  unknown: "Unknown failure",
};

function commandError(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const failure = squashAtomCommandFailure(result);
  return failure instanceof Error ? failure.message : "The command could not be completed.";
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function useElapsedSeconds(startedAt: string | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1_000));
}

function Surface({
  children,
  className = "",
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border/70 bg-card/85 shadow-[0_18px_60px_-42px_color-mix(in_srgb,var(--primary)_42%,transparent)] backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 border-l border-border/60 px-4 first:border-l-0">
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className={`mt-1 truncate text-sm font-medium ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function SwarmHeader({
  projectKey,
  title,
  stage,
  onStage,
  planAvailable,
  runAvailable,
  reviewAvailable,
}: {
  projectKey: string;
  title: string;
  stage: SwarmStage;
  onStage: (stage: SwarmStage) => void;
  planAvailable: boolean;
  runAvailable: boolean;
  reviewAvailable: boolean;
}) {
  const navigate = useNavigate();
  const entries: ReadonlyArray<{
    stage: SwarmStage;
    label: string;
    enabled: boolean;
  }> = [
    { stage: "brief", label: "Swarm Brief", enabled: true },
    { stage: "plan", label: "Team Plan", enabled: planAvailable },
    { stage: "war-room", label: "War Room", enabled: runAvailable },
    { stage: "review", label: "Review & Integration", enabled: reviewAvailable },
  ];
  return (
    <>
      <WorkspacePageHeader electron={isElectron} className="border-border/70 bg-card/80">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <WorkspaceBreadcrumb ariaLabel="Swarm breadcrumb">
            <WorkspaceBreadcrumbItem>Projects</WorkspaceBreadcrumbItem>
            <WorkspaceBreadcrumbSeparator />
            <WorkspaceBreadcrumbItem>{title}</WorkspaceBreadcrumbItem>
            <WorkspaceBreadcrumbSeparator />
            <WorkspaceBreadcrumbItem current>Swarm</WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void navigate({ to: "/projects/$projectKey", params: { projectKey } })}
            >
              <ArrowLeftIcon /> Workspace
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                void navigate({
                  to: "/projects/$projectKey/settings",
                  params: { projectKey },
                })
              }
            >
              <ShieldCheckIcon /> Project settings
            </Button>
          </div>
        </div>
      </WorkspacePageHeader>
      <nav
        className="flex min-h-11 items-center gap-1 border-b border-border/70 bg-card/55 px-4"
        aria-label="Swarm workflow"
      >
        <span className="mr-3 flex items-center gap-2 text-sm font-medium">
          <NetworkIcon className="size-4 text-primary" /> Swarm
        </span>
        {entries.map((entry) => (
          <Button
            key={entry.stage}
            size="xs"
            variant={stage === entry.stage ? "secondary" : "ghost"}
            disabled={!entry.enabled}
            aria-current={stage === entry.stage ? "page" : undefined}
            onClick={() => onStage(entry.stage)}
          >
            {entry.label}
          </Button>
        ))}
      </nav>
    </>
  );
}

type SwarmProjectSnapshot = Pick<OrchestrationProject, "id" | "integrationBatches">;

function PlannerIdentity({
  selection,
  entries,
}: {
  selection: ArchitectModelSelection;
  entries: ReadonlyArray<ProviderInstanceEntry>;
}) {
  const entry = entries.find((candidate) => candidate.instanceId === selection.instanceId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {entry ? (
        <ProviderInstanceIcon
          driverKind={entry.driverKind}
          displayName={entry.displayName}
          accentColor={entry.accentColor}
          className="size-4"
        />
      ) : (
        <BotIcon className="size-4" />
      )}
      <span className="truncate">
        {entry?.displayName ?? selection.instanceId} · {selection.model}
      </span>
    </span>
  );
}

function TeamComposition({ team }: { team: ArchitectTeamConfiguration }) {
  const counts = new Map<string, number>();
  for (const seat of team.startingSeats) counts.set(seat.role, (counts.get(seat.role) ?? 0) + 1);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5">
        <div className="grid size-7 place-items-center rounded-lg bg-primary/12 text-primary">
          <SparklesIcon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Planner</p>
          <p className="text-xs text-muted-foreground">Plans, validates, coordinates</p>
        </div>
      </div>
      {[...counts].map(([role, count]) => (
        <div
          key={role}
          className="flex items-center gap-2 rounded-xl border border-border/70 p-2.5"
        >
          <div className="grid size-7 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
            {role === "reviewer" || role === "security_reviewer" ? (
              <ShieldCheckIcon className="size-4" />
            ) : role === "debugger" ? (
              <WrenchIcon className="size-4" />
            ) : role === "test_specialist" ? (
              <TestTube2Icon className="size-4" />
            ) : role === "integrator" ? (
              <GitBranchIcon className="size-4" />
            ) : (
              <Code2Icon className="size-4" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {count} {ROLE_LABELS[role as keyof typeof ROLE_LABELS]}
              {count === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              {role.includes("reviewer") ? "Review access" : "Execution seat"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SwarmBriefView({
  objective,
  constraints,
  contextPaths,
  selection,
  team,
  readyProviders,
  modelOptionsByInstance,
  working,
  error,
  onObjective,
  onConstraints,
  onContextPaths,
  onSelection,
  onTeam,
  onGenerate,
}: {
  objective: string;
  constraints: string;
  contextPaths: string;
  selection: ArchitectModelSelection | null;
  team: ArchitectTeamConfiguration;
  readyProviders: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<string, ReadonlyArray<{ slug: string; name?: string }>>;
  working: boolean;
  error: string | null;
  onObjective: (value: string) => void;
  onConstraints: (value: string) => void;
  onContextPaths: (value: string) => void;
  onSelection: (value: ArchitectModelSelection) => void;
  onTeam: (team: ArchitectTeamConfiguration) => void;
  onGenerate: () => void;
}) {
  const [customCount, setCustomCount] = useState(
    team.preset === "custom" ? team.executionAgentCount : 6,
  );
  const [editingBrief, setEditingBrief] = useState(!objective.trim());
  const contextPathItems = contextPaths
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-3">
        <Surface className="overflow-hidden">
          <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_13%,transparent),transparent_42%)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">Swarm mode</Badge>
                  <span className="text-xs text-muted-foreground">Planning only</span>
                </div>
                <h1 className="mt-2 text-xl font-semibold tracking-tight">Swarm Brief</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Define one bounded engineering mission, assemble the team, and review guardrails
                  before Nebula asks the Planner for a canonical Team Plan.
                </p>
              </div>
              {objective.trim() ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setEditingBrief((current) => !current)}
                >
                  {editingBrief ? "Review brief" : "Edit brief"}
                </Button>
              ) : (
                <div className="hidden size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary 2xl:grid">
                  <NetworkIcon className="size-5" />
                </div>
              )}
            </div>
          </div>
          {editingBrief ? (
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="text-sm font-medium">Mission objective</span>
                <span className="ml-2 text-xs text-muted-foreground">Required</span>
                <Textarea
                  className="mt-1.5 min-h-16 text-sm"
                  value={objective}
                  placeholder="Describe the heavy engineering outcome the Swarm should deliver."
                  aria-label="Swarm mission objective"
                  onChange={(event) => onObjective(event.currentTarget.value)}
                />
              </label>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Additional constraints</span>
                  <Textarea
                    className="mt-1.5 min-h-14 text-sm"
                    value={constraints}
                    placeholder="Protected paths, sequencing requirements, or acceptance constraints."
                    aria-label="Swarm additional constraints"
                    onChange={(event) => onConstraints(event.currentTarget.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Planning context</span>
                  <span className="ml-2 text-xs text-muted-foreground">Optional</span>
                  <Textarea
                    className="mt-1.5 min-h-14 text-sm"
                    value={contextPaths}
                    placeholder="One repository-relative path per line"
                    aria-label="Swarm planning context paths"
                    onChange={(event) => onContextPaths(event.currentTarget.value)}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-base font-medium leading-snug">{objective}</p>
              {constraints.trim() ? (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {constraints}
                </p>
              ) : null}
              {contextPathItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {contextPathItems.map((path) => (
                    <Badge key={path} variant="outline">
                      <FileCode2Icon /> {path}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Surface>

        <Surface className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-medium">Team size</h2>
              <p className="text-xs text-muted-foreground">
                Counts exclude the Planner. The Planner may refine roles within this limit.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline">Planner + {team.executionAgentCount} team agents</Badge>
              {selection ? (
                <ProviderModelPicker
                  activeInstanceId={selection.instanceId}
                  model={selection.model}
                  lockedProvider={null}
                  instanceEntries={readyProviders}
                  modelOptionsByInstance={modelOptionsByInstance as never}
                  triggerVariant="outline"
                  triggerClassName="max-w-[18rem]"
                  triggerAriaLabel="Swarm Planner provider and model"
                  onInstanceModelChange={(instanceId, model) =>
                    onSelection(createModelSelection(instanceId, model))
                  }
                />
              ) : (
                <Badge variant="destructive">No ready structured Planner</Badge>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {ARCHITECT_TEAM_PRESET_OPTIONS.map((option) => (
              <button
                key={option.preset}
                type="button"
                aria-pressed={team.preset === option.preset}
                className={`group rounded-xl border p-2.5 text-left outline-none transition-[border-color,background-color,transform] duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring ${
                  team.preset === option.preset
                    ? "border-primary/70 bg-primary/[0.08]"
                    : "border-border/70 bg-background/35 hover:border-primary/35 hover:bg-muted/35"
                }`}
                onClick={() =>
                  onTeam(
                    createArchitectTeamConfiguration({
                      preset: option.preset,
                      defaultModelSelection: selection,
                    }),
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <UsersIcon className="size-4 text-primary" />
                  {team.preset === option.preset ? (
                    <CheckCircle2Icon className="size-4 text-primary" />
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">Planner + {option.count} agents</p>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={team.preset === "custom"}
              className={`rounded-xl border p-2.5 text-left outline-none transition-colors duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring ${
                team.preset === "custom"
                  ? "border-primary/70 bg-primary/[0.08]"
                  : "border-border/70 bg-background/35 hover:border-primary/35"
              }`}
              onClick={() =>
                onTeam(
                  createArchitectTeamConfiguration({
                    preset: "custom",
                    customCount,
                    defaultModelSelection: selection,
                  }),
                )
              }
            >
              <div className="flex items-center justify-between">
                <BoxesIcon className="size-4 text-primary" />
                <span className="text-xs text-muted-foreground">1–20</span>
              </div>
              <p className="mt-2 text-sm font-medium">Custom</p>
              <p className="text-xs text-muted-foreground">Planner + {customCount} agents</p>
            </button>
          </div>
          {team.preset === "custom" ? (
            <div className="mt-3 rounded-xl border border-border/70 bg-muted/25 p-3">
              <label className="flex items-center gap-3 text-sm">
                <span className="min-w-24">Team agents</span>
                <input
                  className="min-w-0 flex-1 accent-primary"
                  type="range"
                  min={1}
                  max={20}
                  value={customCount}
                  aria-label="Custom non-Planner agent count"
                  onChange={(event) => {
                    const count = Number(event.currentTarget.value);
                    setCustomCount(count);
                    onTeam(
                      createArchitectTeamConfiguration({
                        preset: "custom",
                        customCount: count,
                        defaultModelSelection: selection,
                      }),
                    );
                  }}
                />
                <span className="w-7 text-right font-mono text-xs">{customCount}</span>
              </label>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_15rem]">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Starting composition</p>
              <TeamComposition team={team} />
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <p className="text-sm font-medium">Writable concurrency</p>
              <p className="mt-1 text-xl font-semibold text-primary">
                {team.maxWritableConcurrency}
              </p>
              <input
                className="mt-2 w-full accent-primary"
                type="range"
                min={1}
                max={team.executionAgentCount}
                value={team.maxWritableConcurrency}
                aria-label="Maximum writable concurrency"
                onChange={(event) =>
                  onTeam({
                    ...team,
                    maxWritableConcurrency: Number(event.currentTarget.value),
                  })
                }
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Team size includes Builders, Reviewers, Debugger, and other roles. Writable
                concurrency limits coding Tasks running simultaneously.
              </p>
            </div>
          </div>
        </Surface>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/[0.08] p-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-3 lg:self-start">
        <Surface className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ActivityIcon className="size-4 text-primary" /> Swarm summary
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Planner</dt>
              <dd className="max-w-[11rem] truncate text-right">
                {selection ? (
                  <PlannerIdentity selection={selection} entries={readyProviders} />
                ) : (
                  "Unavailable"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Team</dt>
              <dd>Planner + {team.executionAgentCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Writable slots</dt>
              <dd>{team.maxWritableConcurrency}</dd>
            </div>
          </dl>
        </Surface>
        <Surface className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon className="size-4 text-primary" /> Trust & guardrails
          </h2>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {[
              "Isolated Task worktrees",
              "Explicit WRITE / READ / DENY paths",
              "Shared Resource coordination",
              "Required quality gates",
              "Independent review",
              "Bounded remediation and provider recovery",
              "No direct merge to main",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Ownership is enforced from Git evidence and orchestration policy. It is not an OS-level
            filesystem sandbox.
          </p>
        </Surface>
        <Button
          size="lg"
          className="w-full"
          disabled={working || !objective.trim() || !selection}
          onClick={onGenerate}
        >
          <SparklesIcon /> {working ? "Starting Planner…" : "Generate Team Plan"}
        </Button>
      </aside>
    </div>
  );
}

function PlannerWorkingView({
  plan,
  entries,
  onCancel,
  onDiagnostics,
}: {
  plan: ArchitectPlanProposal;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  onCancel: () => void;
  onDiagnostics: () => void;
}) {
  const phase = plan.lifecycle?.phase ?? "validating_repository";
  const current = planningStepIndex(phase);
  const elapsed = useElapsedSeconds(plan.lifecycle?.startedAt ?? plan.createdAt, true);
  const stalled = elapsed >= 45 && phase === "planner_working";
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-6xl items-center justify-center py-6">
      <Surface className="w-full overflow-hidden">
        <div className="relative overflow-hidden border-b border-border/70 px-6 py-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_55%)]" />
          <div className="relative flex flex-col items-center text-center">
            <div className="grid size-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_42px_-12px_color-mix(in_srgb,var(--primary)_75%,transparent)] motion-safe:animate-status-pulse motion-reduce:animate-none">
              <SparklesIcon className="size-7" />
            </div>
            <Badge className="mt-4" variant="info">
              Planner working
            </Badge>
            <h1 className="mt-3 text-2xl font-semibold">{planningPhaseCopy[phase]}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{plan.objective}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <Badge variant="outline">
                <Clock3Icon /> Planning for {formatElapsed(elapsed)}
              </Badge>
              <Badge variant="outline">{PLANNER_PENDING_TASK_LABEL}</Badge>
              <Badge variant="outline">
                <PlannerIdentity selection={plan.architectModelSelection} entries={entries} />
              </Badge>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="relative grid gap-2 md:grid-cols-6" aria-live="polite">
            <div className="absolute left-[7%] right-[7%] top-4 hidden h-px bg-border md:block" />
            <div
              className="absolute left-[7%] top-4 hidden h-px bg-primary transition-[width] duration-200 motion-reduce:transition-none md:block"
              style={{
                width: `${Math.min(86, (current / (SWARM_PLANNING_STEPS.length - 1)) * 86)}%`,
              }}
            />
            {SWARM_PLANNING_STEPS.map((step, index) => {
              const complete = index < current;
              const active = index === current;
              return (
                <div key={step.phase} className="relative z-10 flex items-center gap-3 md:flex-col">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs transition-colors duration-200 motion-reduce:transition-none ${
                      complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary bg-background text-primary ring-4 ring-primary/10"
                          : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {complete ? <CheckCircle2Icon className="size-4" /> : index + 1}
                  </span>
                  <span
                    className={`text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-28 rounded-xl border border-border/60 bg-muted/25 p-4 opacity-70"
              >
                <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/15 motion-reduce:animate-none" />
                <div className="mt-4 h-2 w-full animate-pulse rounded bg-muted-foreground/10 motion-reduce:animate-none" />
                <div className="mt-2 h-2 w-2/3 animate-pulse rounded bg-muted-foreground/10 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          {stalled ? (
            <div className="mt-5 rounded-xl border border-warning/35 bg-warning/[0.08] p-4 text-sm">
              <p className="font-medium">Planner is still working</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The provider turn is still active. Nebula has not marked it failed.
              </p>
            </div>
          ) : null}
          <div className="mt-6 flex justify-between gap-2">
            <Button variant="outline" onClick={onDiagnostics}>
              <ActivityIcon /> View activity
            </Button>
            <Button variant="outline" onClick={onCancel}>
              <SquareIcon /> Cancel planning
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function FailureView({
  plan,
  entries,
  modelOptionsByInstance,
  selection,
  busy,
  diagnosticsOpen,
  onSelection,
  onRetry,
  onEdit,
  onManual,
  onDiagnostics,
  onCancel,
}: {
  plan: ArchitectPlanProposal;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<string, ReadonlyArray<{ slug: string; name?: string }>>;
  selection: ArchitectModelSelection;
  busy: boolean;
  diagnosticsOpen: boolean;
  onSelection: (selection: ArchitectModelSelection) => void;
  onRetry: () => void;
  onEdit: () => void;
  onManual: () => void;
  onDiagnostics: () => void;
  onCancel: () => void;
}) {
  const category = plan.lifecycle?.failureCategory ?? "unknown";
  const attempt = plan.lifecycle?.attempt ?? plan.attempts?.length ?? 1;
  const elapsed = Math.max(
    0,
    Math.floor(
      (Date.parse(plan.lifecycle?.completedAt ?? plan.updatedAt) -
        Date.parse(plan.lifecycle?.startedAt ?? plan.createdAt)) /
        1_000,
    ),
  );
  const failureReason = plan.failureReason?.replace(
    /^Text generation failed in generateStructured:\s*/,
    "",
  );
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-4xl items-center justify-center py-6">
      <Surface className="w-full p-6">
        <div role="alert" aria-live="assertive">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <AlertCircleIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Badge variant="destructive">{FAILURE_LABELS[category]}</Badge>
              <h1 className="mt-3 text-xl font-semibold">Planner could not finish this plan</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your mission brief, constraints, context, Planner selection, and team settings are
                safe. No Mission or Tasks were created.
              </p>
              {failureReason ? (
                <p className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                  {failureReason}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Switch Planner</p>
              <ProviderModelPicker
                activeInstanceId={selection.instanceId}
                model={selection.model}
                lockedProvider={null}
                instanceEntries={entries}
                modelOptionsByInstance={modelOptionsByInstance as never}
                triggerVariant="outline"
                triggerClassName="max-w-full"
                triggerAriaLabel="Recovery Planner provider and model"
                onInstanceModelChange={(instanceId, model) =>
                  onSelection(createModelSelection(instanceId, model))
                }
              />
            </div>
            <div className="flex items-end">
              <Button disabled={busy} onClick={onRetry}>
                <RefreshCcwIcon /> Retry with selected Planner
              </Button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onEdit}>
              Edit Brief
            </Button>
            <Button variant="outline" onClick={onManual}>
              <ListTreeIcon /> Build Plan Manually
            </Button>
            <Button variant="ghost" onClick={onDiagnostics}>
              <ActivityIcon /> View Diagnostics
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {diagnosticsOpen ? (
            <dl className="mt-5 grid gap-2 rounded-xl border border-border/70 bg-muted/25 p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Planner</dt>
                <dd className="mt-0.5">
                  <PlannerIdentity selection={plan.architectModelSelection} entries={entries} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attempt</dt>
                <dd className="mt-0.5">{attempt}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-0.5">{formatElapsed(elapsed)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last phase</dt>
                <dd className="mt-0.5">{plan.lifecycle?.phase ?? plan.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Category</dt>
                <dd className="mt-0.5">{category}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Proposal ID</dt>
                <dd className="mt-0.5 truncate font-mono">{plan.id}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

function CancelledPlanningView({
  plan,
  busy,
  onRestart,
  onEdit,
}: {
  plan: ArchitectPlanProposal;
  busy: boolean;
  onRestart: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-4xl items-center justify-center py-6">
      <Surface className="w-full p-6">
        <div role="status" aria-live="polite" className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <SquareIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="outline">Planning cancelled</Badge>
            <h1 className="mt-3 text-xl font-semibold">
              The planning attempt was cancelled safely
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your mission brief, constraints, context, Planner selection, and team settings are
              preserved. No Mission or Tasks were created.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Proposal <span className="font-mono">{plan.id}</span> remains in history as a
              cancelled attempt. A late provider response cannot create execution state.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit Brief
          </Button>
          <Button disabled={busy} onClick={onRestart}>
            <RefreshCcwIcon /> Restart planning
          </Button>
        </div>
      </Surface>
    </div>
  );
}

function TaskCard({
  task,
  selected,
  dependencies,
  onSelect,
}: {
  task: ArchitectMissionDraft["tasks"][number];
  selected: boolean;
  dependencies: number;
  onSelect: () => void;
}) {
  const writeSummary = task.ownership.write[0] ?? "No write scope";
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`w-full rounded-xl border p-3 text-left outline-none transition-[border-color,background-color,transform] duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "border-primary/70 bg-primary/[0.08] shadow-[0_12px_34px_-26px_color-mix(in_srgb,var(--primary)_90%,transparent)]"
          : "border-border/70 bg-background/45 hover:border-primary/35"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {task.role ? ROLE_LABELS[task.role] : "Builder"}
          </p>
        </div>
        <Badge size="sm" variant={task.assignedModelSelection ? "success" : "warning"}>
          {task.assignedModelSelection ? "Assigned" : "Assign"}
        </Badge>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {task.objective}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        <Badge size="sm" variant="outline">
          {task.acceptanceCriteria.length} criteria
        </Badge>
        <Badge size="sm" variant="outline">
          {dependencies} deps
        </Badge>
        <Badge size="sm" variant="outline" className="max-w-full truncate">
          {writeSummary}
        </Badge>
      </div>
    </button>
  );
}

function OwnershipEditor({
  label,
  values,
  tone,
  onChange,
}: {
  label: string;
  values: readonly string[];
  tone: string;
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="block">
      <span className={`text-[10px] font-medium tracking-[0.12em] ${tone}`}>{label}</span>
      <Textarea
        key={`${label}:${values.join("\n")}`}
        className="mt-1.5 min-h-16 resize-y font-mono text-[11px]"
        defaultValue={values.join("\n")}
        placeholder="One repository-relative path per line"
        onBlur={(event) => {
          const next = event.currentTarget.value
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean);
          if (next.join("\n") !== values.join("\n")) onChange(next);
        }}
      />
    </label>
  );
}

function TeamPlanView({
  plan,
  mission,
  tasks,
  entries,
  modelOptionsByInstance,
  selectedTaskKey,
  view,
  busy,
  approvalError,
  diagnosticsOpen,
  onView,
  onSelectTask,
  onUpdateProposal,
  onApprove,
  onRun,
  onEditBrief,
  onDiagnostics,
}: {
  plan: ArchitectPlanProposal;
  mission: Mission | null;
  tasks: ReadonlyArray<OrchestrationTask>;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  modelOptionsByInstance: ReadonlyMap<string, ReadonlyArray<{ slug: string; name?: string }>>;
  selectedTaskKey: string;
  view: TeamPlanView;
  busy: boolean;
  approvalError: string | null;
  diagnosticsOpen: boolean;
  onView: (view: TeamPlanView) => void;
  onSelectTask: (key: string) => void;
  onUpdateProposal: (proposal: ArchitectMissionDraft) => void;
  onApprove: () => void;
  onRun: () => void;
  onEditBrief: () => void;
  onDiagnostics: () => void;
}) {
  const proposal = plan.proposal!;
  const team = plan.team;
  const waves = architectProposalWaves(proposal);
  const selected =
    proposal.tasks.find((task) => task.key === selectedTaskKey) ?? proposal.tasks[0]!;
  const selectedIndex = proposal.tasks.indexOf(selected);
  const selectedDependencies = proposal.dependencies.filter(
    (edge) => edge.dependentKey === selected.key,
  );
  const updateSelected = (next: Partial<typeof selected>) => {
    const nextTasks = proposal.tasks.map((task, index) =>
      index === selectedIndex ? { ...task, ...next } : task,
    );
    onUpdateProposal({ ...proposal, tasks: nextTasks });
  };
  const checkpointCount = proposal.checkpoints?.length ?? 0;
  const risk =
    plan.validation?.warnings.some((warning) => warning.code === "write-overlap") ||
    proposal.risks.length > 2
      ? "Medium"
      : "Low";
  const unassigned = proposal.tasks.filter((task) => !task.assignedModelSelection).length;
  const canApprove = plan.validation?.status === "valid" && unassigned === 0;
  const needsEdits = !canApprove && plan.status !== "approved" && plan.status !== "stale";
  return (
    <div className="space-y-3">
      <Surface className="overflow-hidden">
        <div className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(5.5rem,auto))]">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.12em] text-muted-foreground">Mission</p>
            <h1 className="mt-1 truncate text-lg font-semibold">{proposal.title}</h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{proposal.objective}</p>
          </div>
          <Metric label="Team" value={`Planner + ${proposal.tasks.length}`} />
          <Metric label="Tasks" value={proposal.tasks.length} />
          <Metric label="Waves" value={waves.length} />
          <Metric label="Checkpoints" value={checkpointCount} />
          <Metric
            label="Status"
            value={
              <span
                className={`inline-flex items-center gap-1.5 ${plan.status === "stale" || needsEdits ? "text-warning" : "text-success"}`}
              >
                {plan.status === "stale" || needsEdits ? (
                  <AlertCircleIcon className="size-3.5" />
                ) : (
                  <CheckCircle2Icon className="size-3.5" />
                )}{" "}
                {plan.status === "approved"
                  ? "Approved"
                  : plan.status === "stale"
                    ? "Baseline changed"
                    : needsEdits
                      ? "Needs edits"
                      : "Plan ready"}
              </span>
            }
          />
        </div>
      </Surface>

      {plan.status === "stale" ? (
        <Surface className="border-warning/40 bg-warning/[0.06] p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <h2 className="text-sm font-medium">Repository changed after planning</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                This proposal remains pinned to {plan.planningBaseCommit.slice(0, 8)}. Regenerate
                from the current checkout, or review the plan and explicitly approve its original
                baseline.
              </p>
            </div>
          </div>
        </Surface>
      ) : null}

      <div className="grid min-h-0 min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <Surface className="min-w-0 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <UsersIcon className="size-4 text-primary" /> Team roster
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Planner plus the final Task roles and provider assignments proposed for this
                  mission.
                </p>
              </div>
              <div className="flex gap-1">
                <Badge variant="outline">Max writers {team?.maxWritableConcurrency ?? 1}</Badge>
                <Badge variant={risk === "Low" ? "success" : "warning"}>{risk} risk</Badge>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Planner / Team Lead</span>
                  <SparklesIcon className="size-4 text-primary" />
                </div>
                <p className="mt-2 text-sm font-medium">Architect Planner</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  <PlannerIdentity selection={plan.architectModelSelection} entries={entries} />
                </p>
                <Badge className="mt-2" size="sm" variant="info">
                  Planning & coordination
                </Badge>
              </div>
              {proposal.tasks.map((task) => {
                const role = task.role ?? "builder";
                const reviewOnly = role === "reviewer" || role === "security_reviewer";
                return (
                  <button
                    type="button"
                    key={task.key}
                    className="rounded-xl border border-border/70 bg-background/35 p-3 text-left outline-none transition-colors hover:border-primary/35 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectTask(task.key)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {ROLE_LABELS[role]}
                      </span>
                      <Badge size="sm" variant={reviewOnly ? "secondary" : "info"}>
                        {reviewOnly ? "Review" : "Write"}
                      </Badge>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {task.assignedModelSelection ? (
                        <PlannerIdentity
                          selection={task.assignedModelSelection}
                          entries={entries}
                        />
                      ) : (
                        "Provider pending"
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          </Surface>

          <Surface className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <GitBranchIcon className="size-4 text-primary" /> Task plan
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Canonical proposal dependencies rendered through the Mission graph model.
                </p>
              </div>
              <div className="flex rounded-lg border border-border/70 bg-muted/25 p-0.5">
                <Button
                  size="xs"
                  variant={view === "dag" ? "secondary" : "ghost"}
                  onClick={() => onView("dag")}
                >
                  <NetworkIcon /> DAG
                </Button>
                <Button
                  size="xs"
                  variant={view === "table" ? "secondary" : "ghost"}
                  onClick={() => onView("table")}
                >
                  <ListTreeIcon /> Table
                </Button>
              </div>
            </div>
            {view === "dag" ? (
              <div className="overflow-x-auto p-4">
                <div className="flex min-w-max items-stretch gap-3">
                  {waves.map((wave, waveIndex) => (
                    <div
                      key={wave.map((task) => task.key).join(":")}
                      className="flex items-stretch gap-3"
                    >
                      <div className="w-64 rounded-xl border border-border/60 bg-muted/20 p-3">
                        <p className="mb-3 text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
                          Wave {waveIndex + 1}
                        </p>
                        <div className="space-y-2">
                          {wave.map((task) => (
                            <TaskCard
                              key={task.key}
                              task={task}
                              selected={task.key === selected.key}
                              dependencies={
                                proposal.dependencies.filter(
                                  (edge) => edge.dependentKey === task.key,
                                ).length
                              }
                              onSelect={() => onSelectTask(task.key)}
                            />
                          ))}
                        </div>
                      </div>
                      {waveIndex < waves.length - 1 ? (
                        <div className="flex w-20 flex-col items-center justify-center gap-2 text-primary">
                          {(proposal.checkpoints ?? [])
                            .filter((checkpoint) =>
                              checkpoint.requiredTaskKeys.some((key) =>
                                wave.some((task) => task.key === key),
                              ),
                            )
                            .slice(0, 1)
                            .map((checkpoint) => (
                              <Badge
                                key={checkpoint.key}
                                variant="info"
                                className="max-w-20 truncate"
                              >
                                {checkpoint.name}
                              </Badge>
                            ))}
                          <ArrowRightIcon className="size-5" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[48rem] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2 font-medium">Task</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Provider</th>
                      <th className="px-3 py-2 font-medium">Write scope</th>
                      <th className="px-3 py-2 font-medium">Checkpoint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.tasks.map((task) => (
                      <tr
                        key={task.key}
                        className="cursor-pointer border-b border-border/50 hover:bg-muted/25"
                        onClick={() => onSelectTask(task.key)}
                      >
                        <td className="px-3 py-3 font-medium">{task.title}</td>
                        <td className="px-3 py-3">
                          {task.role ? ROLE_LABELS[task.role] : "Builder"}
                        </td>
                        <td className="px-3 py-3">
                          {task.assignedModelSelection ? (
                            <PlannerIdentity
                              selection={task.assignedModelSelection}
                              entries={entries}
                            />
                          ) : (
                            <span className="text-warning">Unassigned</span>
                          )}
                        </td>
                        <td className="max-w-56 truncate px-3 py-3 font-mono">
                          {task.ownership.write.join(", ") || "None"}
                        </td>
                        <td className="px-3 py-3">{task.checkpointKey ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <RouteIcon className="size-4 text-primary" /> Checkpoints
              </h2>
              <Badge variant="outline">{checkpointCount} barriers</Badge>
            </div>
            {(proposal.checkpoints ?? []).length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(proposal.checkpoints ?? []).map((checkpoint) => {
                  const materialized = mission?.checkpoints?.find(
                    (candidate) => candidate.key === checkpoint.key,
                  );
                  const state = materialized
                    ? resolveMissionCheckpointState(materialized, tasks)
                    : null;
                  return (
                    <div
                      key={checkpoint.key}
                      className="rounded-xl border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{checkpoint.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {checkpoint.requiredTaskKeys.length} Tasks ·{" "}
                            {checkpoint.requiredGateIds.length} gates ·{" "}
                            {checkpoint.reviewsRequired ? "Reviews required" : "No review barrier"}
                          </p>
                        </div>
                        <Badge variant={state?.state === "passed" ? "success" : "outline"}>
                          {state?.state.replaceAll("_", " ") ?? "Proposed"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Human approval{" "}
                        {checkpoint.humanApprovalRequired ? "required" : "not required"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                No named checkpoint barriers were proposed.
              </p>
            )}
          </Surface>
        </div>

        <aside className="min-w-0 space-y-3 lg:sticky lg:top-3 lg:self-start">
          <Surface className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground">Selected Task</p>
                <h2 className="mt-1 text-base font-medium">{selected.title}</h2>
              </div>
              <Badge variant="info">{selected.role ? ROLE_LABELS[selected.role] : "Builder"}</Badge>
            </div>
            <label className="mt-4 block text-xs text-muted-foreground">
              Objective
              <Textarea
                key={`objective:${selected.key}:${selected.objective}`}
                className="mt-1 min-h-20 text-xs text-foreground"
                defaultValue={selected.objective}
                onBlur={(event) => {
                  const objective = event.currentTarget.value.trim();
                  if (objective && objective !== selected.objective) updateSelected({ objective });
                }}
              />
            </label>
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted-foreground">Provider / model</p>
              {selected.assignedModelSelection ? (
                <ProviderModelPicker
                  activeInstanceId={selected.assignedModelSelection.instanceId}
                  model={selected.assignedModelSelection.model}
                  lockedProvider={null}
                  instanceEntries={entries}
                  modelOptionsByInstance={modelOptionsByInstance as never}
                  triggerVariant="outline"
                  triggerClassName="max-w-full"
                  triggerAriaLabel={`Provider assignment for ${selected.title}`}
                  onInstanceModelChange={(instanceId, model) =>
                    updateSelected({
                      assignedModelSelection: createModelSelection(instanceId, model),
                    })
                  }
                />
              ) : (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={entries.length === 0}
                  onClick={() => {
                    const entry = entries[0];
                    const model = entry?.models[0]?.slug;
                    if (entry && model)
                      updateSelected({
                        assignedModelSelection: createModelSelection(entry.instanceId, model),
                      });
                  }}
                >
                  <BotIcon /> Assign ready provider
                </Button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <OwnershipEditor
                label="WRITE PATHS"
                values={selected.ownership.write}
                tone="text-info-foreground"
                onChange={(write) =>
                  updateSelected({ ownership: { ...selected.ownership, write } })
                }
              />
              <OwnershipEditor
                label="READ PATHS"
                values={selected.ownership.read}
                tone="text-success-foreground"
                onChange={(read) => updateSelected({ ownership: { ...selected.ownership, read } })}
              />
              <OwnershipEditor
                label="DENY PATHS"
                values={selected.ownership.deny}
                tone="text-destructive"
                onChange={(deny) => updateSelected({ ownership: { ...selected.ownership, deny } })}
              />
            </div>
            <dl className="mt-4 space-y-2 border-t border-border/70 pt-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Shared Resources</dt>
                <dd className="max-w-40 truncate text-right">
                  {selected.requiredResourceIds.join(", ") || "None"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Dependencies</dt>
                <dd className="max-w-40 truncate text-right">
                  {selectedDependencies.map((edge) => edge.prerequisiteKey).join(", ") || "None"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Reviewer</dt>
                <dd>{selected.reviewerKey ?? "Independent policy"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Checkpoint</dt>
                <dd>{selected.checkpointKey ?? "None"}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Acceptance criteria</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {selected.acceptanceCriteria.map((criterion) => (
                  <li key={criterion} className="flex gap-2">
                    <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-success" />
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          </Surface>

          {(plan.validation?.warnings.length ?? 0) > 0 || unassigned > 0 ? (
            <Surface className="border-warning/35 bg-warning/[0.05] p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <AlertCircleIcon className="size-4 text-warning" /> Validation warnings
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {unassigned > 0 ? (
                  <li>{unassigned} Tasks still need a provider assignment.</li>
                ) : null}
                {plan.validation?.warnings.map((warning) => (
                  <li key={`${warning.code}:${warning.taskKey ?? ""}`}>{warning.message}</li>
                ))}
              </ul>
            </Surface>
          ) : null}

          {approvalError ? (
            <Surface className="border-destructive/35 bg-destructive/[0.05] p-4">
              <h2 className="text-sm font-medium">Team Plan could not be created</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                No agents were started. No partial Mission was created. Your proposal is safe.
              </p>
              <p
                role="alert"
                className="mt-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive"
              >
                {approvalError}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="xs" onClick={onApprove}>
                  Retry approval
                </Button>
                <Button size="xs" variant="outline" onClick={onEditBrief}>
                  Edit plan
                </Button>
                <Button size="xs" variant="ghost" onClick={onDiagnostics}>
                  View diagnostics
                </Button>
              </div>
              {diagnosticsOpen ? (
                <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                  proposal={plan.id} · mission={deterministicArchitectMissionId(plan)} · baseline=
                  {plan.planningBaseCommit}
                </p>
              ) : null}
            </Surface>
          ) : null}
        </aside>
      </div>

      <Collapsible>
        <Surface className="overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left text-sm font-medium">
            <span className="flex items-center gap-2">
              <FileCode2Icon className="size-4" /> Advanced plan editor
            </span>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <div className="border-t border-border/70 p-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Raw proposal JSON is available for dense inspection. Primary editing remains in the
                selected Task inspector.
              </p>
              <Textarea
                className="min-h-72 font-mono text-[11px]"
                value={JSON.stringify(proposal, null, 2)}
                readOnly
                aria-label="Advanced raw Team Plan JSON"
              />
            </div>
          </CollapsiblePanel>
        </Surface>
      </Collapsible>

      <Surface className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 p-3 shadow-xl">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Base {plan.planningBaseCommit.slice(0, 8)}</Badge>
          <Badge variant="outline">{plan.validation?.errors.length ?? 0} errors</Badge>
          <Badge variant="outline">{plan.validation?.warnings.length ?? 0} warnings</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEditBrief}>
            Edit Brief
          </Button>
          {plan.status === "approved" ? (
            <Button disabled={busy || !mission} onClick={onRun}>
              <PlayIcon /> Run Swarm
            </Button>
          ) : (
            <Button disabled={busy || !canApprove} onClick={onApprove}>
              <CheckCircle2Icon /> Approve Team Plan
            </Button>
          )}
        </div>
      </Surface>
    </div>
  );
}

function taskStatus(
  task: OrchestrationTask | null,
  thread: OrchestrationThreadShell | null,
  run: MissionRun,
  providerAvailable: boolean,
) {
  if (!task) return "Waiting";
  if (task.status === "completed") return "Complete";
  if (task.status === "cancelled") return "Cancelled";
  const currentReview = task.reviewSnapshot
    ? task.reviews?.findLast(
        (review) => review.snapshotId === task.reviewSnapshot?.id && review.status === "completed",
      )
    : null;
  if (currentReview?.verdict === "request_changes") return "Review needed";
  if (thread)
    return deriveTerminalAgentPresentation({
      thread,
      task,
      run,
      providerAvailable,
    }).label;
  if (task.status === "active") return "Ready";
  return "Waiting";
}

function WarRoomView({
  environmentId,
  project,
  projectKey,
  plan,
  mission,
  run,
  tasks,
  threads,
  entries,
  busy,
  onPause,
  onResume,
  onStop,
  onApproveCheckpoint,
  onOpenReview,
}: {
  environmentId: EnvironmentId;
  project: SwarmProjectSnapshot;
  projectKey: string;
  plan: ArchitectPlanProposal;
  mission: Mission;
  run: MissionRun;
  tasks: ReadonlyArray<OrchestrationTask>;
  threads: ReadonlyArray<OrchestrationThreadShell>;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onApproveCheckpoint: (checkpointKey: string) => void;
  onOpenReview: () => void;
}) {
  const navigate = useNavigate();
  const setTerminalSelection = useUiStateStore((state) => state.setTerminalCenterSelection);
  const elapsed = useElapsedSeconds(
    run.startedAt,
    ["running", "attention", "paused"].includes(run.status),
  );
  const progress = swarmRunProgress({ mission, run, tasks });
  const events = highValueSwarmEvents({ mission, run });
  const proposal = plan.proposal!;
  const materializedTasks = proposal.tasks.map((draft) => ({
    draft,
    task: projectTaskForPlanTask({ mission, tasks, proposal, taskKey: draft.key }),
  }));
  const checkpointStates = (mission.checkpoints ?? []).map((checkpoint) => ({
    checkpoint,
    state: resolveMissionCheckpointState(checkpoint, tasks),
  }));
  const currentCheckpoint =
    checkpointStates.find((item) => item.state.state !== "passed") ??
    checkpointStates.at(-1) ??
    null;
  const waves = architectProposalWaves(proposal);
  const completedWaves = waves.filter((wave) =>
    wave.every(
      (draft) =>
        materializedTasks.find((item) => item.draft.key === draft.key)?.task?.status ===
        "completed",
    ),
  ).length;
  const openTerminal = (thread: OrchestrationThreadShell) => {
    setTerminalSelection(project.id, thread.id);
    void navigate({ to: "/projects/$projectKey/terminal-center", params: { projectKey } });
  };
  const openThread = (thread: OrchestrationThreadShell) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId: thread.id },
    });
  return (
    <div className="space-y-3">
      <Surface className="grid gap-3 p-4 md:grid-cols-[auto_repeat(3,1fr)_auto]">
        <div className="flex items-center gap-2 pr-4">
          <span
            className={`size-2.5 rounded-full ${run.status === "running" ? "bg-success motion-safe:animate-pulse motion-reduce:animate-none" : run.status === "attention" ? "bg-warning" : "bg-muted-foreground"}`}
          />
          <div>
            <p className="text-[10px] tracking-[0.12em] text-muted-foreground">Run status</p>
            <p className="text-sm font-medium capitalize">{run.status}</p>
          </div>
        </div>
        <Metric
          label="Current checkpoint"
          value={currentCheckpoint?.checkpoint.name ?? "No active checkpoint"}
        />
        <Metric label="Elapsed" value={formatElapsed(elapsed)} />
        <Metric label="Waves complete" value={`${completedWaves} of ${waves.length}`} />
        <div className="flex items-center justify-end gap-2">
          {run.status === "paused" ? (
            <Button size="sm" disabled={busy} onClick={onResume}>
              <PlayIcon /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={onPause}>
              <PauseIcon /> Pause
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={onStop}>
            <SquareIcon /> Stop
          </Button>
        </div>
      </Surface>

      <Surface className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant="info">Live War Room</Badge>
            <h1 className="mt-2 text-xl font-semibold">{mission.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{mission.objective}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Branch isolation · Per-Task worktrees</Badge>
            <Badge variant="success">Guardrails active</Badge>
          </div>
        </div>
      </Surface>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Surface className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <UsersIcon className="size-4 text-primary" /> Live team board
            </h2>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 sm:grid-cols-[9rem_1fr]">
                <div>
                  <p className="text-sm font-medium">Planner</p>
                  <p className="text-xs text-muted-foreground">1 agent</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/[0.07] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Team Lead</p>
                      <p className="text-[11px] text-muted-foreground">
                        <PlannerIdentity
                          selection={plan.architectModelSelection}
                          entries={entries}
                        />
                      </p>
                    </div>
                    <Badge variant="success">Plan approved</Badge>
                  </div>
                </div>
              </div>
              {[
                { key: "builder", label: "Builders" },
                { key: "reviewer", label: "Reviewers" },
                { key: "debugger", label: "Debugger" },
                { key: "test_specialist", label: "Test specialist" },
                { key: "security_reviewer", label: "Security reviewer" },
                { key: "integrator", label: "Integrator" },
              ].map((group) => {
                const members = materializedTasks.filter(
                  (item) => (item.draft.role ?? "builder") === group.key,
                );
                if (members.length === 0) return null;
                return (
                  <div
                    key={group.key}
                    className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 sm:grid-cols-[9rem_1fr]"
                  >
                    <div>
                      <p className="text-sm font-medium">{group.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {members.length} agent{members.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      {members.map(({ draft, task }) => {
                        const thread = threadForTask(task, threads);
                        const providerAvailable = draft.assignedModelSelection
                          ? entries.some(
                              (entry) =>
                                entry.instanceId === draft.assignedModelSelection?.instanceId,
                            )
                          : false;
                        const status = taskStatus(task, thread, run, providerAvailable);
                        const waiting = run.decisions.findLast(
                          (decision) =>
                            decision.taskId === task?.id && decision.kind.startsWith("waiting_"),
                        );
                        return (
                          <article
                            key={draft.key}
                            className={`rounded-lg border p-3 transition-colors duration-200 motion-reduce:transition-none ${status === "Working" ? "border-info/60 bg-info/[0.06] shadow-[0_0_24px_-16px_color-mix(in_srgb,var(--info)_80%,transparent)]" : status === "Review needed" ? "border-warning/60 bg-warning/[0.06]" : "border-border/70 bg-background/40"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{draft.title}</p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {draft.assignedModelSelection ? (
                                    <PlannerIdentity
                                      selection={draft.assignedModelSelection}
                                      entries={entries}
                                    />
                                  ) : (
                                    "Provider pending"
                                  )}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  status === "Working"
                                    ? "info"
                                    : status === "Complete"
                                      ? "success"
                                      : status === "Error" || status === "Provider unavailable"
                                        ? "destructive"
                                        : status === "Review needed"
                                          ? "warning"
                                          : "outline"
                                }
                              >
                                {status}
                              </Badge>
                            </div>
                            <p className="mt-3 truncate text-[11px] text-muted-foreground">
                              Scope: {draft.ownership.write.join(", ") || "Read-only"}
                            </p>
                            <p className="mt-1 truncate text-xs">
                              {thread
                                ? deriveCurrentAction(thread)
                                : (waiting?.reason ?? "Waiting for scheduling")}
                            </p>
                            {waiting ? (
                              <div className="mt-2 rounded-md bg-muted/40 p-2 text-[11px]">
                                <span className="text-muted-foreground">Why?</span> {waiting.reason}
                              </div>
                            ) : null}
                            {thread ? (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => openThread(thread)}
                                >
                                  Open Thread
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => openTerminal(thread)}
                                >
                                  <TerminalIcon /> Terminal Center
                                </Button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>

          {currentCheckpoint ? (
            <Surface className="border-primary/30 bg-primary/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] tracking-[0.12em] text-primary">Current checkpoint</p>
                  <h2 className="mt-1 text-base font-medium">
                    {currentCheckpoint.checkpoint.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {currentCheckpoint.state.detail}
                  </p>
                </div>
                <Badge variant={currentCheckpoint.state.state === "passed" ? "success" : "info"}>
                  {currentCheckpoint.state.state.replaceAll("_", " ")}
                </Badge>
              </div>
              {currentCheckpoint.state.state === "awaiting_human" ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">
                    Tasks, required quality gates, and independent reviews have passed. A human must
                    release the next wave.
                  </p>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onApproveCheckpoint(currentCheckpoint.checkpoint.key)}
                  >
                    <ShieldCheckIcon /> Approve checkpoint
                  </Button>
                </div>
              ) : null}
            </Surface>
          ) : null}
        </div>

        <aside className="space-y-3">
          <Surface className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ActivityIcon className="size-4 text-primary" /> Activity stream
              </h2>
              <Badge variant="success">Live</Badge>
            </div>
            <ol className="mt-4 space-y-3">
              {events.length > 0 ? (
                events.map((event) => (
                  <li key={event.id} className="grid grid-cols-[3rem_0.5rem_1fr] gap-2 text-[11px]">
                    <time className="text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <span className="mt-1 size-2 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium capitalize">{event.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{event.detail}</p>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted-foreground">
                  Waiting for the first high-value run event.
                </li>
              )}
            </ol>
          </Surface>
          <Surface className="p-4">
            <h2 className="text-sm font-medium">Run progress</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-success/[0.08] p-3">
                <p className="text-xl font-semibold text-success-foreground">
                  {progress.completed}
                </p>
                <p className="text-[11px] text-muted-foreground">Completed</p>
              </div>
              <div className="rounded-lg bg-info/[0.08] p-3">
                <p className="text-xl font-semibold text-info-foreground">{progress.active}</p>
                <p className="text-[11px] text-muted-foreground">Active</p>
              </div>
              <div className="rounded-lg bg-warning/[0.08] p-3">
                <p className="text-xl font-semibold text-warning-foreground">
                  {progress.reviewReady}
                </p>
                <p className="text-[11px] text-muted-foreground">Review ready</p>
              </div>
              <div className="rounded-lg bg-destructive/[0.08] p-3">
                <p className="text-xl font-semibold text-destructive">{progress.blocked}</p>
                <p className="text-[11px] text-muted-foreground">Blocked</p>
              </div>
            </div>
            {run.status === "completed" ? (
              <Button className="mt-4 w-full" onClick={onOpenReview}>
                Open Review & Integration
              </Button>
            ) : null}
          </Surface>
        </aside>
      </div>
    </div>
  );
}

function ReviewIntegrationView({
  project,
  plan,
  mission,
  run,
  tasks,
}: {
  project: SwarmProjectSnapshot;
  plan: ArchitectPlanProposal;
  mission: Mission;
  run: MissionRun | null;
  tasks: ReadonlyArray<OrchestrationTask>;
}) {
  const missionTasks = mission.taskIds.flatMap((taskId) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    return task ? [task] : [];
  });
  const batch = mission.integrationBatchId
    ? ((project.integrationBatches ?? []).find(
        (candidate) => candidate.id === mission.integrationBatchId,
      ) ?? null)
    : null;
  const reviews = missionTasks.flatMap((task) => task.reviews ?? []);
  const gateRuns = missionTasks.flatMap((task) => task.qualityGateRuns ?? []);
  const remediationRounds =
    run?.taskRecovery?.reduce((total, state) => total + state.remediationRounds, 0) ?? 0;
  const changedFiles =
    batch?.tasks
      .toSorted((a, b) => a.order - b.order)
      .flatMap(
        ({ taskId }) => missionTasks.find((task) => task.id === taskId)?.result?.files ?? [],
      ) ?? [];
  return (
    <div className="space-y-3">
      <div>
        <Badge variant="info">Checkpoint</Badge>
        <h1 className="mt-2 text-2xl font-semibold">Review & Integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Final validation uses retained Task, review, quality, and Integration evidence only.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Surface className="p-4">
          <p className="text-2xl font-semibold text-success-foreground">
            {missionTasks.filter((task) => task.status === "completed").length} /{" "}
            {missionTasks.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Tasks completed</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-2xl font-semibold text-success-foreground">
            {
              reviews.filter(
                (review) => review.verdict === "approve" || review.verdict === "approve_with_notes",
              ).length
            }{" "}
            / {reviews.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Reviews passed</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-2xl font-semibold">{remediationRounds}</p>
          <p className="mt-1 text-xs text-muted-foreground">Remediation rounds</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-2xl font-semibold">
            {mission.checkpoints?.filter(
              (checkpoint) => resolveMissionCheckpointState(checkpoint, tasks).state === "passed",
            ).length ?? 0}{" "}
            / {mission.checkpoints?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Checkpoints passed</p>
        </Surface>
        <Surface className="p-4">
          <p
            className={`text-lg font-semibold ${batch?.status === "ready" ? "text-success-foreground" : "text-warning-foreground"}`}
          >
            {batch?.status === "ready" ? "Integration READY" : (batch?.status ?? "Not queued")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Canonical Integration state</p>
        </Surface>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Surface className="overflow-hidden">
          <div className="border-b border-border/70 p-4">
            <h2 className="text-sm font-medium">Batch results</h2>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-[16rem_1fr]">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Approved Tasks ({missionTasks.filter((task) => task.status === "completed").length}/
                {missionTasks.length})
              </p>
              <ul className="mt-3 space-y-2">
                {missionTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2 text-xs"
                  >
                    <span className="truncate">{task.title}</span>
                    <Badge size="sm" variant={task.status === "completed" ? "success" : "outline"}>
                      {task.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Combined Integration evidence
              </p>
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                {changedFiles.length > 0 ? (
                  <ul className="space-y-2 font-mono text-[11px]">
                    {changedFiles.slice(0, 30).map((file) => (
                      <li
                        key={`${file.path}:${file.changeType}`}
                        className="flex justify-between gap-3"
                      >
                        <span className="truncate">{file.path}</span>
                        <span className="text-muted-foreground">{file.changeType}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No combined Integration diff is available yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Surface>
        <aside className="space-y-3">
          <Surface className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheckIcon className="size-4 text-primary" /> Quality & safety
            </h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ownership validity</dt>
                <dd>
                  {missionTasks.every((task) => task.ownership?.status === "valid")
                    ? "Verified"
                    : "Pending"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quality gates</dt>
                <dd>
                  {gateRuns.filter((run) => run.status === "passed").length} / {gateRuns.length}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Independent review</dt>
                <dd>{reviews.filter((review) => review.status === "completed").length} complete</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Integration</dt>
                <dd
                  className={
                    batch?.status === "ready"
                      ? "text-success-foreground"
                      : "text-warning-foreground"
                  }
                >
                  {batch?.status ?? "Not queued"}
                </dd>
              </div>
            </dl>
          </Surface>
          <Surface className="p-4">
            <h2 className="text-sm font-medium">Known risks</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {plan.proposal?.risks.length ? (
                plan.proposal.risks.map((risk) => (
                  <li key={risk.risk}>
                    • {risk.risk}
                    {risk.mitigation ? ` — ${risk.mitigation}` : ""}
                  </li>
                ))
              ) : (
                <li>No retained plan risks.</li>
              )}
            </ul>
          </Surface>
        </aside>
      </div>
    </div>
  );
}

export function SwarmWorkspacePage({
  projectKey,
  search,
}: {
  readonly projectKey: string;
  readonly search: CommandDeckSearch;
}) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) => candidate.projectKey === projectKey) ?? null;
  if (!group)
    return (
      <SidebarInset className="grid h-dvh place-items-center bg-background p-8 text-sm text-muted-foreground">
        This project is no longer available.
      </SidebarInset>
    );
  const representative =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  return (
    <SwarmWorkspace
      projectKey={projectKey}
      displayName={group.displayName}
      projectRef={representative}
      search={search}
    />
  );
}

function SwarmWorkspace({
  projectKey,
  displayName,
  projectRef,
  search,
}: {
  projectKey: string;
  displayName: string;
  projectRef: ReturnType<typeof useSettingsProjectGroups>[number]["memberProjects"][number];
  search: CommandDeckSearch;
}) {
  const navigate = useNavigate();
  const snapshot = useAtomValue(environmentSnapshotAtom(projectRef.environmentId));
  const serverConfig = useServerConfigs().get(projectRef.environmentId) ?? null;
  const settings = usePrimarySettings();
  const entries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(
          deriveProviderInstanceEntries(serverConfig?.providers ?? []),
          settings,
        ),
      ),
    [serverConfig?.providers, settings],
  );
  const readyPlannerProviders = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.enabled &&
          entry.isAvailable &&
          entry.status === "ready" &&
          (entry.driverKind === "codex" || entry.driverKind === "antigravity"),
      ),
    [entries],
  );
  const readyExecutionProviders = useMemo(
    () => entries.filter((entry) => entry.enabled && entry.isAvailable && entry.status === "ready"),
    [entries],
  );
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, serverConfig?.providers ?? []),
    [serverConfig?.providers, settings],
  );
  const fallbackSelection = useMemo(
    () =>
      resolveDefaultProviderModelSelection(
        serverConfig?.providers ?? [],
        projectRef.defaultModelSelection,
      ),
    [projectRef.defaultModelSelection, serverConfig?.providers],
  );
  const project = snapshot?.projects.find((candidate) => candidate.id === projectRef.id) ?? null;
  const plans = project?.architectPlans ?? [];
  const selectedPlan =
    plans.find((candidate) => candidate.id === search.proposalId) ?? plans.at(-1) ?? null;
  const missions = (snapshot?.missions ?? []).filter(
    (mission) => mission.projectId === projectRef.id,
  );
  const selectedMission =
    missions.find((mission) => mission.id === search.missionId) ??
    missions.find((mission) => mission.id === selectedPlan?.materializedMissionId) ??
    null;
  const missionRuns = (snapshot?.missionRuns ?? []).filter(
    (run) => run.projectId === projectRef.id,
  );
  const selectedRun = missionRuns.find((run) => run.missionId === selectedMission?.id) ?? null;
  const tasks = (snapshot?.tasks ?? []).filter((task) => task.projectId === projectRef.id);
  const threads = (snapshot?.threads ?? []).filter((thread) => thread.projectId === projectRef.id);
  const stage = search.stage ?? "brief";
  const storageKey = `nebula:swarm-brief:${projectRef.environmentId}:${projectRef.id}`;
  const saved = useMemo(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as {
        objective?: string;
        constraints?: string;
        contextPaths?: string;
        selection?: ArchitectModelSelection;
        team?: ArchitectTeamConfiguration;
      } | null;
    } catch {
      return null;
    }
  }, [storageKey]);
  const [objective, setObjective] = useState(saved?.objective ?? selectedPlan?.objective ?? "");
  const [constraints, setConstraints] = useState(
    saved?.constraints ?? selectedPlan?.constraints ?? "",
  );
  const [contextPaths, setContextPaths] = useState(
    saved?.contextPaths ?? selectedPlan?.contextPaths.join("\n") ?? "",
  );
  const [selection, setSelection] = useState<ArchitectModelSelection | null>(
    saved?.selection ?? selectedPlan?.architectModelSelection ?? fallbackSelection,
  );
  const [team, setTeam] = useState<ArchitectTeamConfiguration>(
    () =>
      saved?.team ??
      selectedPlan?.team ??
      createArchitectTeamConfiguration({
        preset: "standard",
        defaultModelSelection: fallbackSelection,
      }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [planView, setPlanView] = useState<TeamPlanView>("dag");
  const [selectedTaskKey, setSelectedTaskKey] = useState(search.selectedTask ?? "");
  const scrollRef = useRef<HTMLElement>(null);
  const generate = useAtomCommand(projectEnvironment.generateArchitectPlan, {
    reportFailure: false,
  });
  const save = useAtomCommand(projectEnvironment.saveArchitectPlan, { reportFailure: false });
  const approve = useAtomCommand(projectEnvironment.approveArchitectPlan, { reportFailure: false });
  const approveCheckpoint = useAtomCommand(projectEnvironment.approveMissionCheckpoint, {
    reportFailure: false,
  });
  const activateMission = useAtomCommand(projectEnvironment.activateMission, {
    reportFailure: false,
  });
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

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ objective, constraints, contextPaths, selection, team }),
    );
  }, [constraints, contextPaths, objective, selection, storageKey, team]);

  useEffect(() => {
    if (
      selection &&
      readyPlannerProviders.some((entry) => entry.instanceId === selection.instanceId)
    )
      return;
    const first = readyPlannerProviders[0];
    const model = first?.models[0]?.slug;
    if (first && model) setSelection(createModelSelection(first.instanceId, model));
  }, [readyPlannerProviders, selection]);

  useEffect(() => {
    if (selectedTaskKey || !selectedPlan?.proposal?.tasks[0]) return;
    setSelectedTaskKey(selectedPlan.proposal.tasks[0].key);
  }, [selectedPlan?.proposal?.tasks, selectedTaskKey]);

  useEffect(() => {
    const savedScroll = Number(
      window.sessionStorage.getItem(`${storageKey}:scroll:${stage}`) ?? "0",
    );
    if (scrollRef.current) scrollRef.current.scrollTop = savedScroll;
  }, [stage, storageKey]);

  const navigateStage = useCallback(
    (
      nextStage: SwarmStage,
      options?: { proposalId?: string; missionId?: string; selectedTask?: string },
    ) => {
      const proposalId = options?.proposalId ?? selectedPlan?.id;
      const missionId = options?.missionId ?? selectedMission?.id;
      const selectedTask = options?.selectedTask ?? selectedTaskKey;
      void navigate({
        to: "/projects/$projectKey/command-deck",
        params: { projectKey },
        search: {
          mode: "swarm",
          stage: nextStage,
          ...(proposalId ? { proposalId } : {}),
          ...(missionId ? { missionId } : {}),
          ...(selectedTask ? { selectedTask } : {}),
        },
      });
    },
    [navigate, projectKey, selectedMission?.id, selectedPlan?.id, selectedTaskKey],
  );

  const updateTeam = (next: ArchitectTeamConfiguration) => setTeam(next);
  const updateSelection = (next: ArchitectModelSelection) => {
    setSelection(next);
    setTeam((current) => ({
      ...current,
      startingSeats: current.startingSeats.map((seat) => ({ ...seat, modelSelection: next })),
    }));
  };

  const generateTeamPlan = async () => {
    if (!project || !selection || !objective.trim()) return;
    setBusy(true);
    setError(null);
    const proposalId = ArchitectPlanProposalId.make(randomUUID());
    const result = await generate({
      environmentId: projectRef.environmentId,
      input: {
        proposalId,
        projectId: project.id,
        objective: objective.trim(),
        constraints: constraints.trim(),
        contextPaths: contextPaths
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        modelSelection:
          selection.options === undefined
            ? { instanceId: selection.instanceId, model: selection.model }
            : {
                instanceId: selection.instanceId,
                model: selection.model,
                options: selection.options,
              },
        team,
      },
    });
    const failure = commandError(result);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    navigateStage("plan", { proposalId });
  };

  const savePlan = async (plan: ArchitectPlanProposal) => {
    if (!project) return false;
    const result = await save({
      environmentId: projectRef.environmentId,
      input: { projectId: project.id, plan },
    });
    const failure = commandError(result);
    if (failure) setError(failure);
    return failure === null;
  };

  const cancelPlanning = async () => {
    if (!selectedPlan || selectedPlan.status !== "generating") return;
    const now = new Date().toISOString() as never;
    const attempt = selectedPlan.lifecycle?.attempt ?? selectedPlan.attempts?.length ?? 1;
    await savePlan({
      ...selectedPlan,
      status: "cancelled",
      lifecycle: {
        phase: "cancelled",
        attempt,
        startedAt: selectedPlan.lifecycle?.startedAt ?? selectedPlan.createdAt,
        lastProgressAt: now,
        completedAt: now,
        failureCategory: null,
      },
      attempts: (selectedPlan.attempts ?? []).map((item) =>
        item.number === attempt
          ? { ...item, lastPhase: "cancelled", outcome: "cancelled", completedAt: now }
          : item,
      ),
      updatedAt: now,
      resolvedAt: now,
    });
  };

  const retryPlanning = async () => {
    if (!selectedPlan || !selection) return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString() as never;
    const attempt = (selectedPlan.lifecycle?.attempt ?? selectedPlan.attempts?.length ?? 1) + 1;
    const nextTeam = {
      ...(selectedPlan.team ?? team),
      startingSeats: (selectedPlan.team ?? team).startingSeats.map((seat) => ({
        ...seat,
        modelSelection: seat.modelSelection ?? selection,
      })),
    };
    const ok = await savePlan({
      ...selectedPlan,
      status: "generating",
      architectProviderInstanceId: selection.instanceId,
      architectModelSelection: selection,
      team: nextTeam,
      proposal: null,
      validation: null,
      failureReason: null,
      lifecycle: {
        phase: "validating_repository",
        attempt,
        startedAt: now,
        lastProgressAt: now,
        completedAt: null,
        failureCategory: null,
      },
      attempts: [
        ...(selectedPlan.attempts ?? []),
        {
          number: attempt,
          providerInstanceId: selection.instanceId,
          model: selection.model,
          startedAt: now,
          completedAt: null,
          lastPhase: "validating_repository",
          outcome: "running",
          failureCategory: null,
          failureReason: null,
        },
      ],
      updatedAt: now,
      resolvedAt: null,
    });
    setBusy(false);
    if (ok) navigateStage("plan", { proposalId: selectedPlan.id });
  };

  const buildManualPlan = async () => {
    if (!project || !selectedPlan || !selection) return;
    if (selectedPlan.planningBaseCommit === "pending") {
      setError(
        "Manual planning needs a verified repository baseline. Retry repository validation first.",
      );
      return;
    }
    const now = new Date().toISOString() as never;
    const manualProposal: ArchitectMissionDraft = {
      title: objective.trim().slice(0, 100) || "Manual Swarm Team Plan",
      objective: objective.trim() || selectedPlan.objective,
      description: constraints.trim(),
      tasks: team.startingSeats.map((seat) => ({
        key: seat.key,
        title: seat.label,
        objective: `Define and deliver the bounded ${ROLE_LABELS[seat.role]} workstream for this mission.`,
        acceptanceCriteria: [
          "Replace this shell criterion with an observable acceptance criterion before approval.",
        ],
        ownership: { write: [], read: [], deny: [] },
        requiredResourceIds: [],
        assignedModelSelection: seat.modelSelection ?? selection,
        role: seat.role,
        reviewerKey: null,
        checkpointKey: null,
        notes: ["Manual fallback shell. Review scope and dependencies before approval."],
      })),
      dependencies: [],
      checkpoints: [],
      assumptions: ["The human will refine Task ownership before approval."],
      risks: [{ risk: "Manual shell requires explicit scope review." }],
      unresolvedQuestions: [],
      resourcePolicyGaps: [],
    };
    const validation = validateArchitectPlan({
      proposal: manualProposal,
      planningBaseCommit: selectedPlan.planningBaseCommit,
      resources: project.sharedResources ?? [],
      team,
      qualityGateIds: (project.qualityPolicy?.gates ?? [])
        .filter((gate) => gate.enabled)
        .map((gate) => gate.id),
      validatedAt: now,
    });
    const next: ArchitectPlanProposal = {
      ...selectedPlan,
      status: validation.status === "valid" ? "ready" : "invalid",
      team,
      architectProviderInstanceId: selection.instanceId,
      architectModelSelection: selection,
      planningBaseCommit: selectedPlan.planningBaseCommit,
      proposal: manualProposal,
      validation,
      revisions: [
        ...selectedPlan.revisions,
        {
          number: selectedPlan.revisions.length + 1,
          source: "human",
          feedback: "Manual fallback",
          proposal: manualProposal,
          validation,
          createdAt: now,
        },
      ],
      lifecycle: {
        phase: validation.status === "valid" ? "ready" : "failed",
        attempt: selectedPlan.lifecycle?.attempt ?? 1,
        startedAt: selectedPlan.lifecycle?.startedAt ?? selectedPlan.createdAt,
        lastProgressAt: now,
        completedAt: now,
        failureCategory: validation.status === "valid" ? null : "validation_failed",
      },
      failureReason: validation.status === "valid" ? null : "Manual proposal validation failed.",
      updatedAt: now,
      resolvedAt: null,
    };
    const firstTaskKey = manualProposal.tasks[0]?.key;
    if (await savePlan(next))
      navigateStage("plan", {
        proposalId: next.id,
        ...(firstTaskKey ? { selectedTask: firstTaskKey } : {}),
      });
  };

  const updateProposal = async (proposal: ArchitectMissionDraft) => {
    if (!project || !selectedPlan || ["approved", "rejected"].includes(selectedPlan.status)) return;
    const now = new Date().toISOString() as never;
    const validation = validateArchitectPlan({
      proposal,
      planningBaseCommit: selectedPlan.planningBaseCommit,
      resources: project.sharedResources ?? [],
      ...(selectedPlan.team ? { team: selectedPlan.team } : {}),
      qualityGateIds: (project.qualityPolicy?.gates ?? [])
        .filter((gate) => gate.enabled)
        .map((gate) => gate.id),
      validatedAt: now,
    });
    await savePlan({
      ...selectedPlan,
      proposal,
      validation,
      status: validation.status === "valid" ? "ready" : "invalid",
      revisions: [
        ...selectedPlan.revisions,
        {
          number: selectedPlan.revisions.length + 1,
          source: "human",
          feedback: null,
          proposal,
          validation,
          createdAt: now,
        },
      ],
      lifecycle: {
        phase: validation.status === "valid" ? "ready" : "failed",
        attempt: selectedPlan.lifecycle?.attempt ?? 1,
        startedAt: selectedPlan.lifecycle?.startedAt ?? selectedPlan.createdAt,
        lastProgressAt: now,
        completedAt: now,
        failureCategory: validation.status === "valid" ? null : "validation_failed",
      },
      updatedAt: now,
    });
  };

  const approveTeamPlan = async () => {
    if (!project || !selectedPlan?.proposal) return;
    setBusy(true);
    setApprovalError(null);
    const missionId = deterministicArchitectMissionId(selectedPlan);
    const result = await approve({
      environmentId: projectRef.environmentId,
      input: {
        projectId: project.id,
        proposalId: selectedPlan.id,
        missionId,
        tasks: selectedPlan.proposal.tasks.map((task) => ({
          key: task.key,
          taskId: deterministicArchitectTaskId(selectedPlan, task.key),
        })),
        confirmTaskAssignments: true,
        acknowledgeWarnings: true,
        acknowledgeOriginalBaseline: selectedPlan.status === "stale",
      },
    });
    const failure = commandError(result);
    setBusy(false);
    setApprovalOpen(false);
    if (failure) {
      setApprovalError(failure);
      return;
    }
    navigateStage("plan", { proposalId: selectedPlan.id, missionId });
  };

  const runSwarm = async () => {
    if (!project || !selectedMission || !selectedPlan) return;
    setBusy(true);
    setError(null);
    if (selectedMission.status === "draft") {
      const activation = await activateMission({
        environmentId: projectRef.environmentId,
        input: { missionId: selectedMission.id, projectId: project.id },
      });
      const failure = commandError(activation);
      if (failure) {
        setBusy(false);
        setError(failure);
        return;
      }
    }
    const runId = MissionRunId.make(`architect-run:${selectedMission.id}`);
    const existing = missionRuns.find((run) => run.id === runId);
    if (!existing) {
      const result = await startMissionRun({
        environmentId: projectRef.environmentId,
        input: {
          runId,
          missionId: selectedMission.id,
          projectId: project.id,
          maxConcurrentTasks: selectedPlan.team?.maxWritableConcurrency ?? 1,
          routingProfile: "balanced",
          transportRetryLimit: 2,
          remediationLimit: 2,
          autoIntegration: true,
          stopOnConflict: true,
          independentReviewRequired: true,
          preapprovedOverlapPaths: [],
          autoCompleteMission: false,
        },
      });
      const failure = commandError(result);
      if (failure) {
        setBusy(false);
        setError(failure);
        return;
      }
    }
    setBusy(false);
    navigateStage(SWARM_STAGE_AFTER_RUN, {
      proposalId: selectedPlan.id,
      missionId: selectedMission.id,
    });
  };

  const runCommand = async (command: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setBusy(true);
    const result = await command();
    const failure = commandError(result);
    setBusy(false);
    if (failure) setError(failure);
  };

  if (!project)
    return (
      <SidebarInset className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Loading Swarm…
      </SidebarInset>
    );

  const planAvailable = selectedPlan !== null;
  const runAvailable = selectedRun !== null;
  const reviewAvailable = selectedMission !== null;
  let content: React.ReactNode;
  if (stage === "brief") {
    content = (
      <SwarmBriefView
        objective={objective}
        constraints={constraints}
        contextPaths={contextPaths}
        selection={selection}
        team={team}
        readyProviders={readyPlannerProviders}
        modelOptionsByInstance={modelOptionsByInstance}
        working={busy}
        error={error}
        onObjective={setObjective}
        onConstraints={setConstraints}
        onContextPaths={setContextPaths}
        onSelection={updateSelection}
        onTeam={updateTeam}
        onGenerate={() => void generateTeamPlan()}
      />
    );
  } else if (!selectedPlan) {
    content = (
      <div className="grid min-h-[30rem] place-items-center">
        <div className="text-center">
          <NetworkIcon className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 text-lg font-medium">No Team Plan selected</h1>
          <Button className="mt-4" onClick={() => navigateStage("brief")}>
            Open Swarm Brief
          </Button>
        </div>
      </div>
    );
  } else if (stage === "plan" && isPlanningActive(selectedPlan)) {
    content = (
      <PlannerWorkingView
        plan={selectedPlan}
        entries={entries}
        onCancel={() => void cancelPlanning()}
        onDiagnostics={() => setDiagnosticsOpen((value) => !value)}
      />
    );
  } else if (stage === "plan" && selectedPlan.status === "cancelled") {
    content = (
      <CancelledPlanningView
        plan={selectedPlan}
        busy={busy}
        onRestart={() => void retryPlanning()}
        onEdit={() => navigateStage("brief")}
      />
    );
  } else if (stage === "plan" && selectedPlan.status === "failed") {
    content = (
      <FailureView
        plan={selectedPlan}
        entries={readyPlannerProviders}
        modelOptionsByInstance={modelOptionsByInstance}
        selection={selection ?? selectedPlan.architectModelSelection}
        busy={busy}
        diagnosticsOpen={diagnosticsOpen}
        onSelection={updateSelection}
        onRetry={() => void retryPlanning()}
        onEdit={() => navigateStage("brief")}
        onManual={() => void buildManualPlan()}
        onDiagnostics={() => setDiagnosticsOpen((value) => !value)}
        onCancel={() => navigateStage("brief")}
      />
    );
  } else if (stage === "plan" && selectedPlan.proposal) {
    content = (
      <TeamPlanView
        plan={selectedPlan}
        mission={selectedMission}
        tasks={tasks}
        entries={readyExecutionProviders}
        modelOptionsByInstance={modelOptionsByInstance}
        selectedTaskKey={selectedTaskKey || selectedPlan.proposal.tasks[0]?.key || ""}
        view={planView}
        busy={busy}
        approvalError={approvalError}
        diagnosticsOpen={diagnosticsOpen}
        onView={setPlanView}
        onSelectTask={(key) => {
          setSelectedTaskKey(key);
          navigateStage("plan", { selectedTask: key });
        }}
        onUpdateProposal={(proposal) => void updateProposal(proposal)}
        onApprove={() => setApprovalOpen(true)}
        onRun={() => void runSwarm()}
        onEditBrief={() => navigateStage("brief")}
        onDiagnostics={() => setDiagnosticsOpen((value) => !value)}
      />
    );
  } else if (stage === "war-room" && selectedPlan.proposal && selectedMission && selectedRun) {
    content = (
      <WarRoomView
        environmentId={projectRef.environmentId}
        project={project}
        projectKey={projectKey}
        plan={selectedPlan}
        mission={selectedMission}
        run={selectedRun}
        tasks={tasks}
        threads={threads}
        entries={entries}
        busy={busy}
        onPause={() =>
          void runCommand(() =>
            pauseMissionRun({
              environmentId: projectRef.environmentId,
              input: { runId: selectedRun.id },
            }),
          )
        }
        onResume={() =>
          void runCommand(() =>
            resumeMissionRun({
              environmentId: projectRef.environmentId,
              input: { runId: selectedRun.id },
            }),
          )
        }
        onStop={() =>
          void runCommand(() =>
            stopMissionRun({
              environmentId: projectRef.environmentId,
              input: { runId: selectedRun.id },
            }),
          )
        }
        onApproveCheckpoint={(checkpointKey) =>
          void runCommand(() =>
            approveCheckpoint({
              environmentId: projectRef.environmentId,
              input: {
                missionId: selectedMission.id,
                projectId: project.id,
                checkpointKey,
              },
            }),
          )
        }
        onOpenReview={() => navigateStage("review")}
      />
    );
  } else if (stage === "review" && selectedPlan.proposal && selectedMission) {
    content = (
      <ReviewIntegrationView
        project={project}
        plan={selectedPlan}
        mission={selectedMission}
        run={selectedRun}
        tasks={tasks}
      />
    );
  } else {
    content = (
      <div className="grid min-h-[30rem] place-items-center text-center">
        <div>
          <AlertCircleIcon className="mx-auto size-8 text-warning" />
          <h1 className="mt-3 text-lg font-medium">This Swarm stage is not ready yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Return to the Team Plan to continue the canonical flow.
          </p>
          <Button className="mt-4" onClick={() => navigateStage("plan")}>
            Open Team Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 w-auto overflow-hidden bg-background text-foreground isolate">
      <div className="flex h-full min-h-0 flex-col">
        <SwarmHeader
          projectKey={projectKey}
          title={displayName}
          stage={stage}
          onStage={navigateStage}
          planAvailable={planAvailable}
          runAvailable={runAvailable}
          reviewAvailable={reviewAvailable}
        />
        <main
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_34%)] p-3 sm:p-4"
          onScroll={(event) =>
            window.sessionStorage.setItem(
              `${storageKey}:scroll:${stage}`,
              String(event.currentTarget.scrollTop),
            )
          }
        >
          <div className="mx-auto w-full max-w-[1800px]">{content}</div>
        </main>
      </div>
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Approve Team Plan?</DialogTitle>
            <DialogDescription>
              Nebula will atomically create one draft Mission,{" "}
              {selectedPlan?.proposal?.tasks.length ?? 0} Tasks, ownership, dependencies, Shared
              Resource requirements, provider assignments, and{" "}
              {selectedPlan?.proposal?.checkpoints?.length ?? 0} checkpoint definitions. No agent
              starts until Run Swarm.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {selectedPlan?.status === "stale" ? (
              <div className="mb-3 rounded-xl border border-warning/35 bg-warning/[0.06] p-3 text-xs">
                You are explicitly approving the original planning baseline
                {` ${selectedPlan.planningBaseCommit.slice(0, 8)}`}, not the current checkout. Task
                worktrees will remain pinned to that reviewed commit.
              </div>
            ) : null}
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground">
              Approval is idempotent. Retrying or double-clicking resolves to the same deterministic
              Mission and Task IDs.
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void approveTeamPlan()}>
              <CheckCircle2Icon /> Approve Team Plan
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      {error && stage !== "brief" ? (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[140] max-w-xl -translate-x-1/2 rounded-xl border border-destructive/30 bg-background p-3 text-sm text-destructive shadow-xl"
        >
          {error}
        </div>
      ) : null}
    </SidebarInset>
  );
}
