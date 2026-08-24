import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  ModelSelection,
  OrchestrationThreadShell,
  TaskId,
  ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BotIcon,
  CrosshairIcon,
  FocusIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  Maximize2Icon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "../../env";
import { usePrimarySettings } from "../../hooks/useSettings";
import { newTaskId, newThreadId, randomUUID } from "../../lib/utils";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { useServerConfigs } from "../../state/entities";
import { environmentSnapshotAtom } from "../../state/shell";
import { taskEnvironment } from "../../state/tasks";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { deriveCurrentAction } from "../commandDeck/commandDeckLogic";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
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
import { SidebarInset } from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import {
  arrangeTerminalNodes,
  DEFAULT_TERMINAL_CENTER_STATE,
  deriveTerminalNodeStatus,
  hasSharedCheckoutWarning,
  hydrateTerminalCanvasThreads,
  nextFreeformPosition,
  providerLaunchBlockReason,
  TERMINAL_CENTER_LAYOUTS,
  type CanvasPoint,
  type TerminalCanvasNode,
  type TerminalCenterLayout,
  type TerminalCenterWorkspaceMode,
  terminalThreadCreateFields,
  terminalWorkspaceLabel,
} from "./terminalCenterLogic";

const ChatView = lazy(() => import("../ChatView"));

const layoutLabels: Record<TerminalCenterLayout, string> = {
  grid: "Grid",
  "provider-columns": "Provider columns",
  "status-lanes": "Status lanes",
  "mission-flow": "Mission flow",
  radial: "Radial",
  compact: "Compact",
  freeform: "Freeform",
};

function commandError(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The command could not be completed.";
}

function statusLabel(thread: OrchestrationThreadShell): string {
  const status = deriveTerminalNodeStatus(thread);
  return status === "attention" ? "Needs attention" : status === "working" ? "Working" : "Ready";
}

export function TerminalCenterPage({ projectKey }: { readonly projectKey: string }) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) => candidate.projectKey === projectKey) ?? null;
  if (!group)
    return (
      <SidebarInset className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        This project is no longer available.
      </SidebarInset>
    );
  const project =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  return (
    <TerminalCenter project={project} projectKey={projectKey} displayName={group.displayName} />
  );
}

function TerminalCenter({
  project,
  projectKey,
  displayName,
}: {
  readonly project: ReturnType<typeof useSettingsProjectGroups>[number]["memberProjects"][number];
  readonly projectKey: string;
  readonly displayName: string;
}) {
  const navigate = useNavigate();
  const snapshot = useAtomValue(environmentSnapshotAtom(project.environmentId));
  const serverConfig = useServerConfigs().get(project.environmentId) ?? null;
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
  const projectThreads = useMemo(
    () => (snapshot?.threads ?? []).filter((thread) => thread.projectId === project.id),
    [project.id, snapshot?.threads],
  );
  const tasks = useMemo(
    () => (snapshot?.tasks ?? []).filter((task) => task.projectId === project.id),
    [project.id, snapshot?.tasks],
  );
  const missions = useMemo(
    () => (snapshot?.missions ?? []).filter((mission) => mission.projectId === project.id),
    [project.id, snapshot?.missions],
  );
  const activeMissionRuns = useMemo(
    () =>
      (snapshot?.missionRuns ?? []).filter(
        (run) =>
          run.projectId === project.id &&
          (run.status === "running" || run.status === "paused" || run.status === "attention"),
      ),
    [project.id, snapshot?.missionRuns],
  );
  const taskByThread = useMemo(
    () => new Map(tasks.filter((task) => task.threadId).map((task) => [task.threadId!, task])),
    [tasks],
  );
  const missionByTask = useMemo(
    () =>
      new Map(
        missions.flatMap((mission) => mission.taskIds.map((taskId) => [taskId, mission] as const)),
      ),
    [missions],
  );
  const state = useUiStateStore(
    (store) => store.terminalCenterByProjectId[project.id] ?? DEFAULT_TERMINAL_CENTER_STATE,
  );
  const showThread = useUiStateStore((store) => store.showTerminalCenterThread);
  const hideThread = useUiStateStore((store) => store.hideTerminalCenterThread);
  const setNodePosition = useUiStateStore((store) => store.setTerminalCenterNodePosition);
  const setLayout = useUiStateStore((store) => store.setTerminalCenterLayout);
  const setViewport = useUiStateStore((store) => store.setTerminalCenterViewport);
  const setSelection = useUiStateStore((store) => store.setTerminalCenterSelection);
  const setQuickLaunch = useUiStateStore((store) => store.setTerminalCenterQuickLaunch);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const setOwnership = useAtomCommand(taskEnvironment.setOwnership, { reportFailure: false });
  const prepareWorkspace = useAtomCommand(taskEnvironment.prepareWorkspace, {
    reportFailure: false,
  });
  const bindThread = useAtomCommand(taskEnvironment.bindThread, { reportFailure: false });
  const [configureEntry, setConfigureEntry] = useState<ProviderInstanceEntry | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<TerminalCenterWorkspaceMode>(
    state.quickLaunch?.workspaceMode ?? "current",
  );
  const [writePattern, setWritePattern] = useState(state.quickLaunch?.isolatedWritePattern ?? "");
  const [model, setModel] = useState("");
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<{
    taskId: TaskId;
    threadId: ThreadId;
    selection: ModelSelection;
  } | null>(null);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusThreadId, setFocusThreadId] = useState<ThreadId | null>(null);
  const [dragging, setDragging] = useState<{
    threadId: string;
    origin: CanvasPoint;
    pointer: CanvasPoint;
  } | null>(null);
  const [panning, setPanning] = useState<{ origin: CanvasPoint; pointer: CanvasPoint } | null>(
    null,
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const arrangedNodeCountRef = useRef(0);
  const supervisedThreadIds = useMemo(() => {
    const taskIds = new Set(
      activeMissionRuns.flatMap(
        (run) => missions.find((mission) => mission.id === run.missionId)?.taskIds ?? [],
      ),
    );
    return tasks.flatMap((task) => (taskIds.has(task.id) && task.threadId ? [task.threadId] : []));
  }, [activeMissionRuns, missions, tasks]);
  const attemptByThread = useMemo(
    () =>
      new Map(
        activeMissionRuns.flatMap((run) =>
          (run.taskRecovery ?? []).flatMap((state) =>
            state.attempts.map((attempt) => [attempt.threadId, attempt] as const),
          ),
        ),
      ),
    [activeMissionRuns],
  );
  const historicalAttemptThreadIds = useMemo(
    () =>
      activeMissionRuns.flatMap((run) =>
        (run.taskRecovery ?? []).flatMap((state) => {
          const currentThreadId = tasks.find((task) => task.id === state.taskId)?.threadId;
          return state.attempts.flatMap((attempt) =>
            attempt.threadId !== currentThreadId ? [attempt.threadId] : [],
          );
        }),
      ),
    [activeMissionRuns, tasks],
  );

  useEffect(() => {
    const missing = supervisedThreadIds.filter(
      (threadId) => !state.visibleThreadIds.includes(threadId),
    );
    missing.forEach((threadId, index) =>
      showThread(
        project.id,
        threadId,
        nextFreeformPosition(state.positions, state.visibleThreadIds.length + index),
      ),
    );
  }, [project.id, showThread, state.positions, state.visibleThreadIds, supervisedThreadIds]);

  useEffect(() => {
    historicalAttemptThreadIds
      .filter((threadId) => state.visibleThreadIds.includes(threadId))
      .forEach((threadId) => hideThread(project.id, threadId));
  }, [hideThread, historicalAttemptThreadIds, project.id, state.visibleThreadIds]);

  const visibleThreads = useMemo(
    () => hydrateTerminalCanvasThreads(state.visibleThreadIds, projectThreads),
    [projectThreads, state.visibleThreadIds],
  );
  const canvasNodes = useMemo<ReadonlyArray<TerminalCanvasNode>>(
    () =>
      visibleThreads.map((thread) => {
        const task = taskByThread.get(thread.id);
        const mission = task ? missionByTask.get(task.id) : null;
        return {
          threadId: thread.id,
          providerId: thread.modelSelection.instanceId,
          status: deriveTerminalNodeStatus(thread),
          taskId: task?.id ?? null,
          missionId: mission?.id ?? null,
        };
      }),
    [missionByTask, taskByThread, visibleThreads],
  );
  const taskThreadIdByTaskId = useMemo(
    () =>
      new Map(
        canvasNodes.flatMap((node) =>
          node.taskId ? ([[node.taskId, node.threadId]] as const) : [],
        ),
      ),
    [canvasNodes],
  );
  const selectedThread =
    visibleThreads.find((thread) => thread.id === state.selectedThreadId) ?? null;
  const sharedCheckout = hasSharedCheckoutWarning(visibleThreads);

  const reportError = useCallback(
    (title: string, description: string) =>
      toastManager.add(stackedThreadToast({ type: "error", title, description })),
    [],
  );
  const addThreadToCanvas = useCallback(
    (threadId: ThreadId) => {
      showThread(
        project.id,
        threadId,
        nextFreeformPosition(state.positions, state.visibleThreadIds.length),
      );
    },
    [project.id, showThread, state.positions, state.visibleThreadIds.length],
  );

  const launchCurrent = useCallback(
    async (entry: ProviderInstanceEntry, selection: ModelSelection) => {
      const threadId = newThreadId();
      const error = commandError(
        await createThread({
          environmentId: project.environmentId,
          input: {
            threadId,
            projectId: project.id,
            ...terminalThreadCreateFields({
              title: `${entry.displayName} terminal`,
              modelSelection: selection,
              workspace: { mode: "current" },
            }),
          },
        }),
      );
      if (error) return reportError("Could not create terminal", error);
      addThreadToCanvas(threadId);
      requestAnimationFrame(() => setFocusThreadId(threadId));
    },
    [addThreadToCanvas, createThread, project.environmentId, project.id, reportError],
  );

  const launchIsolated = useCallback(
    async (entry: ProviderInstanceEntry, selection: ModelSelection, pattern: string) => {
      if (!pattern.trim())
        return reportError(
          "Write scope required",
          "Choose an explicit path for the isolated Task. WRITE ** is never granted automatically.",
        );
      const taskId = newTaskId();
      const threadId = newThreadId();
      let error = commandError(
        await createTask({
          environmentId: project.environmentId,
          input: {
            taskId,
            projectId: project.id,
            title: `${entry.displayName} isolated terminal`,
            objective: "Manual Terminal Center workspace",
            role: "builder",
            modelSelection: selection,
          },
        }),
      );
      if (!error)
        error = commandError(
          await setOwnership({
            environmentId: project.environmentId,
            input: {
              taskId,
              rules: [
                {
                  id: randomUUID(),
                  access: "write",
                  pattern: pattern.trim(),
                  reason: "Explicit Terminal Center quick-launch scope",
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
        );
      if (!error)
        error = commandError(
          await prepareWorkspace({ environmentId: project.environmentId, input: { taskId } }),
        );
      if (error) return reportError("Could not prepare isolated terminal", error);
      setPendingTask({ taskId, threadId, selection });
    },
    [createTask, prepareWorkspace, project.environmentId, project.id, reportError, setOwnership],
  );

  useEffect(() => {
    if (!pendingTask) return;
    const task = tasks.find((candidate) => candidate.id === pendingTask.taskId);
    if (!task?.workspace) return;
    if (task.workspace.status === "failed" || task.workspace.status === "missing") {
      reportError(
        "Could not prepare isolated terminal",
        task.workspace.failureReason ?? "Workspace preparation failed.",
      );
      setPendingTask(null);
      return;
    }
    if (task.workspace.status !== "ready" || !task.workspace.path || !task.workspace.branch) return;
    void (async () => {
      let error = commandError(
        await createThread({
          environmentId: project.environmentId,
          input: {
            threadId: pendingTask.threadId,
            projectId: project.id,
            ...terminalThreadCreateFields({
              title: task.title,
              modelSelection: pendingTask.selection,
              workspace: {
                mode: "isolated",
                branch: task.workspace!.branch!,
                path: task.workspace!.path!,
              },
            }),
          },
        }),
      );
      if (!error)
        error = commandError(
          await bindThread({
            environmentId: project.environmentId,
            input: { taskId: task.id, threadId: pendingTask.threadId },
          }),
        );
      if (error) reportError("Could not create isolated terminal", error);
      else {
        addThreadToCanvas(pendingTask.threadId);
        requestAnimationFrame(() => setFocusThreadId(pendingTask.threadId));
      }
      setPendingTask(null);
    })();
  }, [
    addThreadToCanvas,
    bindThread,
    createThread,
    pendingTask,
    project.environmentId,
    project.id,
    reportError,
    tasks,
  ]);

  const requestLaunch = useCallback(
    (entry: ProviderInstanceEntry) => {
      if (!entry.enabled || !entry.isAvailable || entry.status !== "ready") return;
      const savedModel = state.quickLaunch?.modelByProvider[entry.instanceId];
      const selection = {
        instanceId: entry.instanceId,
        model: savedModel ?? entry.models[0]?.slug ?? "auto",
      };
      if (!state.quickLaunch) {
        setWorkspaceMode("current");
        setWritePattern("");
        setModel(selection.model);
        setConfigureEntry(entry);
        return;
      }
      setBusyProviderId(entry.instanceId);
      void (
        state.quickLaunch.workspaceMode === "isolated"
          ? launchIsolated(entry, selection, state.quickLaunch.isolatedWritePattern)
          : launchCurrent(entry, selection)
      ).finally(() => setBusyProviderId(null));
    },
    [launchCurrent, launchIsolated, state.quickLaunch],
  );

  const saveAndLaunch = async () => {
    if (!configureEntry) return;
    const selection = {
      instanceId: configureEntry.instanceId,
      model: model || configureEntry.models[0]?.slug || "auto",
    };
    setQuickLaunch(project.id, {
      workspaceMode,
      isolatedWritePattern: writePattern.trim(),
      modelByProvider: {
        ...state.quickLaunch?.modelByProvider,
        [configureEntry.instanceId]: selection.model,
      },
    });
    setConfigureEntry(null);
    setBusyProviderId(configureEntry.instanceId);
    await (workspaceMode === "isolated"
      ? launchIsolated(configureEntry, selection, writePattern)
      : launchCurrent(configureEntry, selection));
    setBusyProviderId(null);
  };

  const applyLayout = useCallback(
    (layout: TerminalCenterLayout) =>
      setLayout(
        project.id,
        layout,
        arrangeTerminalNodes({
          nodes: canvasNodes,
          layout,
          selectedThreadId: state.selectedThreadId,
          currentPositions: state.positions,
          tasks,
          missions,
        }),
      ),
    [canvasNodes, missions, project.id, setLayout, state.positions, state.selectedThreadId, tasks],
  );
  useEffect(() => {
    if (arrangedNodeCountRef.current === canvasNodes.length) return;
    arrangedNodeCountRef.current = canvasNodes.length;
    if (state.layout !== "freeform") applyLayout(state.layout);
  }, [applyLayout, canvasNodes.length, state.layout]);
  const fitAll = useCallback(() => {
    if (visibleThreads.length === 0) return setViewport(project.id, { x: 0, y: 0, zoom: 1 });
    const points = visibleThreads.map((thread) => state.positions[thread.id] ?? { x: 0, y: 0 });
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + 272));
    const maxY = Math.max(...points.map((point) => point.y + 164));
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 900;
    const height = rect?.height ?? 600;
    const zoom = Math.min(
      1,
      Math.max(
        0.35,
        Math.min((width - 80) / Math.max(1, maxX - minX), (height - 80) / Math.max(1, maxY - minY)),
      ),
    );
    setViewport(project.id, { zoom, x: 40 - minX * zoom, y: 40 - minY * zoom });
  }, [project.id, setViewport, state.positions, visibleThreads]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusThreadId) {
        event.preventDefault();
        setFocusThreadId(null);
      }
      if (event.key === "f" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        fitAll();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && selectedThread) {
        event.preventDefault();
        setFocusThreadId(selectedThread.id);
      }
      if (
        (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLSelectElement) &&
        visibleThreads.length > 0
      ) {
        const currentIndex = Math.max(
          0,
          visibleThreads.findIndex((thread) => thread.id === state.selectedThreadId),
        );
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next =
          visibleThreads[
            (currentIndex + direction + visibleThreads.length) % visibleThreads.length
          ];
        if (next) setSelection(project.id, next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    fitAll,
    focusThreadId,
    project.id,
    selectedThread,
    setSelection,
    state.selectedThreadId,
    visibleThreads,
  ]);

  const filteredThreads = visibleThreads.filter((thread) => {
    const task = taskByThread.get(thread.id);
    const mission = task ? missionByTask.get(task.id) : null;
    return `${thread.title} ${thread.modelSelection.instanceId} ${task?.title ?? ""} ${mission?.title ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  if (focusThreadId)
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background">
        <div className="flex h-full flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.08] bg-card px-3">
            <Button size="xs" variant="ghost" onClick={() => setFocusThreadId(null)}>
              <ArrowLeftIcon /> Canvas
            </Button>
            <span className="text-xs text-muted-foreground">
              Focused terminal · Escape to return
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Loading terminal…
                </div>
              }
            >
              <ChatView
                environmentId={project.environmentId}
                threadId={focusThreadId}
                routeKind="server"
                reserveTitleBarControlInset={false}
              />
            </Suspense>
          </div>
        </div>
      </SidebarInset>
    );

  return (
    <SidebarInset className="h-dvh min-h-0 w-auto overflow-hidden bg-[#070d1b] text-slate-100 isolate">
      <div className="flex h-full min-h-0 flex-col">
        <WorkspacePageHeader electron={isElectron} className="border-white/8 bg-[#0a1224]">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <WorkspaceBreadcrumb ariaLabel="Terminal Center breadcrumb">
              <WorkspaceBreadcrumbItem>Projects</WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator />
              <WorkspaceBreadcrumbItem>{displayName}</WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator />
              <WorkspaceBreadcrumbItem current>Terminal Center</WorkspaceBreadcrumbItem>
            </WorkspaceBreadcrumb>
            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/" })}>
                <ArrowLeftIcon /> Workspace
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/projects/$projectKey/command-deck",
                    params: { projectKey },
                  })
                }
              >
                <LayoutDashboardIcon /> Command Deck
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Project settings"
                onClick={() =>
                  void navigate({ to: "/projects/$projectKey", params: { projectKey } })
                }
              >
                <Settings2Icon />
              </Button>
            </div>
          </div>
        </WorkspacePageHeader>
        <section
          className="shrink-0 border-b border-white/8 bg-[#0a1224] px-4 py-3"
          aria-label="Quick provider launcher"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-slate-400">Launch provider</span>
            {entries.map((entry) => {
              const blockReason = providerLaunchBlockReason(entry);
              const ready = blockReason === null;
              const reason = blockReason ?? "Create a ready terminal";
              return (
                <button
                  key={entry.instanceId}
                  type="button"
                  disabled={!ready || busyProviderId === entry.instanceId}
                  onClick={() => requestLaunch(entry)}
                  className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-slate-200 transition hover:border-[#ff7f6a]/45 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <PlusIcon className="size-3.5 text-[#ff7f6a]" />
                  <ProviderInstanceIcon
                    driverKind={entry.driverKind}
                    displayName={entry.displayName}
                    className="size-4"
                    iconClassName="size-4"
                  />
                  <span>{entry.displayName}</span>
                  {!ready ? (
                    <span className="max-w-28 truncate text-[10px] text-slate-500">{reason}</span>
                  ) : null}
                </button>
              );
            })}
            <Button
              size="xs"
              variant="ghost"
              disabled={entries.every((entry) => providerLaunchBlockReason(entry) !== null)}
              onClick={() => {
                const entry =
                  entries.find(
                    (candidate) =>
                      candidate.instanceId === selectedThread?.modelSelection.instanceId,
                  ) ?? entries.find((candidate) => providerLaunchBlockReason(candidate) === null);
                if (!entry) return;
                setWorkspaceMode(state.quickLaunch?.workspaceMode ?? "current");
                setWritePattern(state.quickLaunch?.isolatedWritePattern ?? "");
                setModel(
                  state.quickLaunch?.modelByProvider[entry.instanceId] ??
                    entry.models[0]?.slug ??
                    "auto",
                );
                setConfigureEntry(entry);
              }}
            >
              <Settings2Icon /> Quick launch:{" "}
              {state.quickLaunch?.workspaceMode === "isolated" ? "Isolated" : "Current checkout"}
            </Button>
          </div>
        </section>
        {activeMissionRuns.length > 0 ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#ff7f6a]/20 bg-[#ff7f6a]/8 px-4 py-2 text-xs text-slate-200">
            <span>
              {activeMissionRuns.length} supervised Mission{" "}
              {activeMissionRuns.length === 1 ? "Run" : "Runs"} active ·{" "}
              {supervisedThreadIds.length} Task{" "}
              {supervisedThreadIds.length === 1 ? "Thread" : "Threads"} on canvas
            </span>
            <Button size="xs" variant="outline" onClick={() => applyLayout("mission-flow")}>
              <GitBranchIcon /> Mission flow
            </Button>
          </div>
        ) : null}
        {sharedCheckout ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-400/20 bg-amber-400/8 px-4 py-2 text-xs text-amber-100">
            <span className="flex items-center gap-2">
              <TriangleAlertIcon className="size-4" />
              <strong className="font-medium">Shared checkout.</strong> Multiple agents can modify
              the same workspace.
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const entry =
                  entries.find(
                    (candidate) =>
                      candidate.instanceId === selectedThread?.modelSelection.instanceId,
                  ) ??
                  entries[0] ??
                  null;
                if (!entry) return;
                setWorkspaceMode("isolated");
                setWritePattern(state.quickLaunch?.isolatedWritePattern ?? "");
                setModel(
                  state.quickLaunch?.modelByProvider[entry.instanceId] ??
                    entry.models[0]?.slug ??
                    "auto",
                );
                setConfigureEntry(entry);
              }}
            >
              Launch isolated instead
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div
            className="relative min-w-0 flex-1 overflow-hidden"
            ref={canvasRef}
            onWheel={(event) => {
              event.preventDefault();
              const rect = canvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              const nextZoom = Math.min(
                2,
                Math.max(0.35, state.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
              );
              const cx = event.clientX - rect.left;
              const cy = event.clientY - rect.top;
              const ratio = nextZoom / state.viewport.zoom;
              setViewport(project.id, {
                zoom: nextZoom,
                x: cx - (cx - state.viewport.x) * ratio,
                y: cy - (cy - state.viewport.y) * ratio,
              });
            }}
            onPointerDown={(event) => {
              if (
                (event.target as HTMLElement).closest("[data-terminal-node], button, input, select")
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setPanning({
                origin: { x: state.viewport.x, y: state.viewport.y },
                pointer: { x: event.clientX, y: event.clientY },
              });
            }}
            onPointerMove={(event) => {
              if (panning)
                setViewport(project.id, {
                  ...state.viewport,
                  x: panning.origin.x + event.clientX - panning.pointer.x,
                  y: panning.origin.y + event.clientY - panning.pointer.y,
                });
              if (dragging)
                setNodePosition(project.id, dragging.threadId, {
                  x: dragging.origin.x + (event.clientX - dragging.pointer.x) / state.viewport.zoom,
                  y: dragging.origin.y + (event.clientY - dragging.pointer.y) / state.viewport.zoom,
                });
            }}
            onPointerUp={() => {
              setPanning(null);
              setDragging(null);
            }}
          >
            <div
              className="absolute inset-0 opacity-25"
              aria-hidden
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(148,163,184,.32) 1px, transparent 0)",
                backgroundSize: `${24 * state.viewport.zoom}px ${24 * state.viewport.zoom}px`,
                backgroundPosition: `${state.viewport.x}px ${state.viewport.y}px`,
              }}
            />
            <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0a1224]/95 p-1.5 shadow-xl backdrop-blur">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-2 size-3.5 text-slate-500" />
                <input
                  aria-label="Search terminal nodes"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Search nodes"
                  className="h-8 w-40 rounded-md border border-white/10 bg-black/20 pl-7 pr-2 text-xs outline-none focus:border-[#ff7f6a]/50"
                />
              </div>
              <select
                aria-label="Arrange canvas"
                value={state.layout}
                onChange={(event) => applyLayout(event.currentTarget.value as TerminalCenterLayout)}
                className="h-8 rounded-md border border-white/10 bg-[#0d172b] px-2 text-xs"
              >
                <option disabled>Arrange</option>
                {TERMINAL_CENTER_LAYOUTS.map((layout) => (
                  <option key={layout} value={layout}>
                    {layoutLabels[layout]}
                  </option>
                ))}
              </select>
              <Button size="xs" variant="ghost" onClick={fitAll}>
                <Maximize2Icon /> Fit all
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setAddExistingOpen(true)}>
                <PlusIcon /> Add thread
              </Button>
            </div>
            {visibleThreads.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0a1224]/80 p-8 text-center shadow-2xl">
                  <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-[#ff7f6a]/25 bg-[#ff7f6a]/10">
                    <BotIcon className="size-5 text-[#ff9a86]" />
                  </div>
                  <h1 className="text-lg font-medium">Terminal Center</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Launch a configured provider above. A canonical Thread appears here ready for
                    its first prompt—no Mission or Task required.
                  </p>
                </div>
              </div>
            ) : null}
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {state.layout === "mission-flow" ? (
                <svg
                  className="pointer-events-none absolute left-0 top-0 overflow-visible"
                  aria-hidden
                >
                  {missions.flatMap((mission) =>
                    mission.dependencies.flatMap((dependency) => {
                      const fromId = taskThreadIdByTaskId.get(dependency.prerequisiteTaskId);
                      const toId = taskThreadIdByTaskId.get(dependency.dependentTaskId);
                      const from = fromId ? state.positions[fromId] : null;
                      const to = toId ? state.positions[toId] : null;
                      if (!from || !to) return [];
                      return [
                        <path
                          key={`${mission.id}:${dependency.prerequisiteTaskId}:${dependency.dependentTaskId}`}
                          d={`M ${from.x + 272} ${from.y + 82} C ${from.x + 302} ${from.y + 82}, ${to.x - 30} ${to.y + 82}, ${to.x} ${to.y + 82}`}
                          fill="none"
                          stroke="rgba(148,163,184,.5)"
                          strokeWidth="1.5"
                        />,
                      ];
                    }),
                  )}
                </svg>
              ) : null}
              {filteredThreads.map((thread) => {
                const point =
                  state.positions[thread.id] ??
                  nextFreeformPosition(state.positions, state.visibleThreadIds.indexOf(thread.id));
                const entry = entries.find(
                  (candidate) => candidate.instanceId === thread.modelSelection.instanceId,
                );
                const task = taskByThread.get(thread.id);
                const mission = task ? missionByTask.get(task.id) : null;
                const attempt = attemptByThread.get(thread.id);
                const selected = state.selectedThreadId === thread.id;
                return (
                  <article
                    key={thread.id}
                    data-terminal-node
                    className={`absolute w-[272px] select-none rounded-xl border bg-[#0c1629]/95 shadow-xl backdrop-blur ${selected ? "border-[#ff7f6a]/65 ring-1 ring-[#ff7f6a]/25" : "border-white/10"}`}
                    style={{ left: point.x, top: point.y }}
                    onClick={() => setSelection(project.id, thread.id)}
                    tabIndex={0}
                    aria-label={`${thread.title}, ${statusLabel(thread)}, ${terminalWorkspaceLabel({ worktreePath: thread.worktreePath, taskBacked: Boolean(task) })}`}
                  >
                    <div
                      className="flex cursor-grab items-center gap-2 border-b border-white/8 px-3 py-2.5 active:cursor-grabbing"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDragging({
                          threadId: thread.id,
                          origin: point,
                          pointer: { x: event.clientX, y: event.clientY },
                        });
                      }}
                    >
                      <ProviderInstanceIcon
                        driverKind={
                          entry?.driverKind ?? ("codex" as ProviderInstanceEntry["driverKind"])
                        }
                        displayName={entry?.displayName ?? String(thread.modelSelection.instanceId)}
                        accentColor={entry?.accentColor}
                        className="size-5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{thread.title}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {entry?.displayName ?? thread.modelSelection.instanceId} ·{" "}
                          {thread.modelSelection.model}
                          {attempt ? ` · Attempt ${attempt.number}` : ""}
                        </p>
                      </div>
                      <span
                        className={`size-2 rounded-full ${deriveTerminalNodeStatus(thread) === "attention" ? "bg-amber-400" : deriveTerminalNodeStatus(thread) === "working" ? "bg-sky-400" : "bg-emerald-400"}`}
                        aria-label={statusLabel(thread)}
                      />
                    </div>
                    <div className="space-y-2 px-3 py-2.5 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Workspace</span>
                        <span className="truncate text-slate-300">
                          {terminalWorkspaceLabel({
                            worktreePath: thread.worktreePath,
                            taskBacked: Boolean(task),
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Current action</span>
                        <span className="truncate text-slate-300">
                          {deriveCurrentAction(thread)}
                        </span>
                      </div>
                      {task ? (
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">Task</span>
                          <span className="truncate text-slate-300">
                            {task.title}
                            {mission ? ` · ${mission.title}` : ""}
                          </span>
                        </div>
                      ) : null}
                      {!entry || !entry.isAvailable ? (
                        <p className="rounded-md bg-amber-400/10 px-2 py-1.5 text-amber-200">
                          Provider unavailable. Thread preserved.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/8 px-2 py-1.5">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocusThreadId(thread.id);
                        }}
                      >
                        <FocusIcon /> Focus
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${thread.title} from canvas`}
                        onClick={(event) => {
                          event.stopPropagation();
                          hideThread(project.id, thread.id);
                        }}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a1224]/95 p-1 text-xs text-slate-400">
              <button
                className="px-2 py-1 hover:text-white"
                onClick={() =>
                  setViewport(project.id, {
                    ...state.viewport,
                    zoom: Math.max(0.35, state.viewport.zoom - 0.1),
                  })
                }
              >
                −
              </button>
              <span className="w-10 text-center">{Math.round(state.viewport.zoom * 100)}%</span>
              <button
                className="px-2 py-1 hover:text-white"
                onClick={() =>
                  setViewport(project.id, {
                    ...state.viewport,
                    zoom: Math.min(2, state.viewport.zoom + 0.1),
                  })
                }
              >
                +
              </button>
            </div>
          </div>
          <aside className="hidden w-72 shrink-0 border-l border-white/8 bg-[#0a1224] p-4 xl:block">
            <p className="text-xs text-slate-500">Selected terminal</p>
            {selectedThread ? (
              <div className="mt-3 space-y-4">
                <div>
                  <h2 className="text-sm font-medium">{selectedThread.title}</h2>
                  <p className="mt-1 text-xs text-slate-400">Thread {selectedThread.id}</p>
                </div>
                <Button className="w-full" onClick={() => setFocusThreadId(selectedThread.id)}>
                  <CrosshairIcon /> Focus selected terminal
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId: project.environmentId, threadId: selectedThread.id },
                    })
                  }
                >
                  Open full workspace
                </Button>
                <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
                  <p className="text-slate-200">Canonical Thread</p>
                  <p className="mt-1">
                    Messages, composer, provider stream, tools, terminal, and model controls are the
                    existing Thread workspace—not canvas copies.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Select a node to inspect or focus it.</p>
            )}
          </aside>
        </div>
      </div>

      <Dialog
        open={configureEntry !== null}
        onOpenChange={(open) => {
          if (!open) setConfigureEntry(null);
        }}
      >
        <DialogPopup>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>Configure quick launch</DialogTitle>
              <DialogDescription>
                Choose once how this project should create{" "}
                {configureEntry?.displayName ?? "provider"} terminals. Future clicks reuse this
                explicit preference.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Default workspace</span>
                <select
                  className="w-full rounded-md border border-black/[0.08] bg-background p-2"
                  value={workspaceMode}
                  onChange={(event) =>
                    setWorkspaceMode(event.currentTarget.value as TerminalCenterWorkspaceMode)
                  }
                >
                  <option value="current">Current project checkout</option>
                  <option value="isolated">New isolated Task-backed workspace</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Default model</span>
                <select
                  className="w-full rounded-md border border-black/[0.08] bg-background p-2"
                  value={model}
                  onChange={(event) => setModel(event.currentTarget.value)}
                >
                  {configureEntry?.models.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name ?? option.slug}
                    </option>
                  ))}
                </select>
              </label>
              {workspaceMode === "isolated" ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Task write scope</span>
                  <input
                    className="w-full rounded-md border border-black/[0.08] bg-background p-2"
                    value={writePattern}
                    onChange={(event) => setWritePattern(event.currentTarget.value)}
                    placeholder="apps/web/**"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    An explicit scope is required. Nebula never silently grants WRITE **.
                  </span>
                </label>
              ) : (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/8 p-3 text-xs text-amber-800 dark:text-amber-200">
                  Current checkout is writable and shared with other current-checkout terminals.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigureEntry(null)}>
                Cancel
              </Button>
              <Button
                disabled={!model || (workspaceMode === "isolated" && !writePattern.trim())}
                onClick={() => void saveAndLaunch()}
              >
                Save and launch
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Dialog open={addExistingOpen} onOpenChange={setAddExistingOpen}>
        <DialogPopup>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>Add existing Thread</DialogTitle>
              <DialogDescription>
                Adds a canonical project or Task Thread to this canvas. It does not duplicate or
                modify the Thread.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 space-y-2 overflow-auto py-4">
              {projectThreads
                .filter((thread) => !state.visibleThreadIds.includes(thread.id))
                .map((thread) => {
                  const task = taskByThread.get(thread.id);
                  return (
                    <button
                      key={thread.id}
                      className="flex w-full items-center justify-between rounded-lg border border-black/[0.08] p-3 text-left hover:bg-muted/40"
                      onClick={() => {
                        addThreadToCanvas(thread.id);
                        setAddExistingOpen(false);
                      }}
                    >
                      <span>
                        <span className="block text-sm font-medium">{thread.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {task
                            ? `Task · ${task.title}`
                            : `Thread · ${thread.modelSelection.instanceId}`}
                        </span>
                      </span>
                      <PlusIcon className="size-4" />
                    </button>
                  );
                })}
              {projectThreads.every((thread) => state.visibleThreadIds.includes(thread.id)) ? (
                <p className="text-sm text-muted-foreground">
                  Every project Thread is already visible.
                </p>
              ) : null}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
