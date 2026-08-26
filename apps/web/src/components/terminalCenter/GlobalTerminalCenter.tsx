import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ModelSelection, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  Columns3Icon,
  FocusIcon,
  LayoutDashboardIcon,
  Maximize2Icon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isElectron } from "../../env";
import { usePrimarySettings } from "../../hooks/useSettings";
import { newThreadId } from "../../lib/utils";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { useProjects, useServerConfigs, useThreadShells } from "../../state/entities";
import { terminalEnvironment } from "../../state/terminal";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
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
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import { DevServerControls, devServerTerminalId, resolveDevServerCwd } from "./DevServerControls";
import {
  arrangeTerminalNodes,
  DEFAULT_TERMINAL_CENTER_STATE,
  FOCUSED_TERMINAL_SHELL_CLASS,
  deriveTerminalNodeStatus,
  nextFreeformPosition,
  providerLaunchBlockReason,
  TERMINAL_CENTER_LAYOUTS,
  terminalCenterKeyboardAction,
  terminalThreadCreateFields,
  terminalWorkspaceLabel,
  type CanvasPoint,
  type TerminalCanvasNode,
  type TerminalCenterLayout,
} from "./terminalCenterLogic";

const ChatView = lazy(() => import("../ChatView"));
const GLOBAL_CANVAS_KEY = "nebula:global-terminal-center";
const MAX_INITIAL_NODES = 20;

const layoutLabels: Record<TerminalCenterLayout, string> = {
  freeform: "Freeform",
  grid: "Grid",
  compact: "Compact",
  "project-columns": "Project columns",
  "provider-columns": "Provider columns",
  "status-lanes": "Status lanes",
  radial: "Radial",
  "mission-flow": "Mission flow",
};

function reportError(title: string, description: string) {
  toastManager.add(stackedThreadToast({ type: "error", title, description }));
}

function GlobalDevServerSummary({
  environmentId,
  projectKey,
  thread,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectKey: string;
  readonly thread: EnvironmentThreadShell;
}) {
  const profile = usePrimarySettings(
    (settings) => settings.devServerProfilesByProject[projectKey]?.[0] ?? null,
  );
  const sessions = useKnownTerminalSessions({ environmentId, threadId: thread.id });
  if (!profile) return null;
  const running = sessions.some(
    (session) =>
      session.target.terminalId === devServerTerminalId(profile.id) &&
      session.state.hasRunningSubprocess,
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">Dev Server</span>
      <span className="truncate">
        {running ? "Running" : "Stopped"}
        {profile.preferredPort ? ` · :${profile.preferredPort}` : ""}
      </span>
    </div>
  );
}

function GlobalFocusedTerminal({
  environmentId,
  threadId,
  onExit,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly onExit: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = terminalCenterKeyboardAction({
        key: event.key,
        selectedThreadId: threadId,
        focused: true,
        targetIsFormControl: false,
      });
      if (action !== "exit") return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <SidebarInset className={FOCUSED_TERMINAL_SHELL_CLASS}>
      <div className="absolute left-2 top-2 z-50">
        <Button size="xs" variant="secondary" className="shadow-sm" onClick={onExit}>
          <ArrowLeftIcon /> Global canvas · Esc
        </Button>
      </div>
      <Suspense
        fallback={
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading terminal…
          </div>
        }
      >
        <ChatView
          environmentId={environmentId}
          threadId={threadId}
          routeKind="server"
          reserveTitleBarControlInset={false}
        />
      </Suspense>
    </SidebarInset>
  );
}

export function GlobalTerminalCenterPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const groups = useSettingsProjectGroups();
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const settings = usePrimarySettings();
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const writeTerminal = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const state = useUiStateStore(
    (store) => store.terminalCenterByProjectId[GLOBAL_CANVAS_KEY] ?? DEFAULT_TERMINAL_CENTER_STATE,
  );
  const showThread = useUiStateStore((store) => store.showTerminalCenterThread);
  const hideThread = useUiStateStore((store) => store.hideTerminalCenterThread);
  const setNodePosition = useUiStateStore((store) => store.setTerminalCenterNodePosition);
  const setLayout = useUiStateStore((store) => store.setTerminalCenterLayout);
  const setViewport = useUiStateStore((store) => store.setTerminalCenterViewport);
  const setSelection = useUiStateStore((store) => store.setTerminalCenterSelection);
  const canvasRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [search, setSearch] = useState("");
  const [launchOpen, setLaunchOpen] = useState(false);
  const [selectedProjectKey, setSelectedProjectKey] = useState(groups[0]?.projectKey ?? "");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedDevServerProfileId, setSelectedDevServerProfileId] = useState("");
  const [launching, setLaunching] = useState(false);
  const [focused, setFocused] = useState<{
    environmentId: EnvironmentId;
    threadId: ThreadId;
  } | null>(null);
  const [dragging, setDragging] = useState<{
    threadId: string;
    origin: CanvasPoint;
    pointer: CanvasPoint;
  } | null>(null);
  const [panning, setPanning] = useState<{ origin: CanvasPoint; pointer: CanvasPoint } | null>(
    null,
  );

  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project])),
    [projects],
  );
  const groupByProjectKey = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.memberProjects.map(
            (project) => [`${project.environmentId}:${project.id}`, group] as const,
          ),
        ),
      ),
    [groups],
  );
  const threadById = useMemo(
    () => new Map(threads.map((thread) => [thread.id, thread])),
    [threads],
  );
  const visibleThreads = useMemo(
    () =>
      state.visibleThreadIds.flatMap((threadId) => {
        const thread = threadById.get(threadId as ThreadId);
        return thread ? [thread] : [];
      }),
    [state.visibleThreadIds, threadById],
  );
  const nodes = useMemo<ReadonlyArray<TerminalCanvasNode>>(
    () =>
      visibleThreads.map((thread) => ({
        threadId: thread.id,
        projectId: thread.projectId,
        providerId: thread.modelSelection.instanceId,
        status: deriveTerminalNodeStatus(thread),
        taskId: null,
        missionId: null,
      })),
    [visibleThreads],
  );

  useEffect(() => {
    if (initializedRef.current || threads.length === 0) return;
    initializedRef.current = true;
    if (state.membershipInitialized) return;
    threads
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_INITIAL_NODES)
      .forEach((thread, index) =>
        showThread(GLOBAL_CANVAS_KEY, thread.id, nextFreeformPosition({}, index)),
      );
  }, [showThread, state.membershipInitialized, threads]);

  const selectedGroup = groups.find((group) => group.projectKey === selectedProjectKey) ?? null;
  const selectedProject =
    selectedGroup?.memberProjects.find(
      (project) =>
        project.environmentId === selectedGroup.environmentId && project.id === selectedGroup.id,
    ) ??
    selectedGroup?.memberProjects[0] ??
    null;
  const selectedEnvironmentSessions = useKnownTerminalSessions({
    environmentId: selectedProject?.environmentId ?? null,
    threadId: null,
  });
  const providerEntries = useMemo(
    () =>
      selectedProject
        ? sortProviderInstanceEntries(
            applyProviderInstanceSettings(
              deriveProviderInstanceEntries(
                serverConfigs.get(selectedProject.environmentId)?.providers ?? [],
              ),
              settings,
            ),
          )
        : [],
    [selectedProject, serverConfigs, settings],
  );
  const selectedProvider =
    providerEntries.find((entry) => entry.instanceId === selectedProviderId) ??
    providerEntries.find((entry) => providerLaunchBlockReason(entry) === null) ??
    null;
  const selectedDevServerProfiles = selectedGroup
    ? (settings.devServerProfilesByProject[selectedGroup.projectKey] ?? [])
    : [];

  useEffect(() => {
    if (!selectedProjectKey && groups[0]) setSelectedProjectKey(groups[0].projectKey);
  }, [groups, selectedProjectKey]);
  useEffect(() => {
    if (!selectedProvider || selectedProvider.instanceId !== selectedProviderId) {
      setSelectedProviderId(selectedProvider?.instanceId ?? "");
      setSelectedModel(selectedProvider?.models[0]?.slug ?? "auto");
    }
  }, [selectedProvider, selectedProviderId]);
  useEffect(() => {
    if (
      selectedDevServerProfileId &&
      !selectedDevServerProfiles.some((profile) => profile.id === selectedDevServerProfileId)
    ) {
      setSelectedDevServerProfileId("");
    }
  }, [selectedDevServerProfileId, selectedDevServerProfiles]);

  const applyLayout = useCallback(
    (layout: TerminalCenterLayout) =>
      setLayout(
        GLOBAL_CANVAS_KEY,
        layout,
        arrangeTerminalNodes({
          nodes,
          layout,
          selectedThreadId: state.selectedThreadId,
          currentPositions: state.positions,
        }),
      ),
    [nodes, setLayout, state.positions, state.selectedThreadId],
  );

  const fitAll = useCallback(() => {
    if (visibleThreads.length === 0) return setViewport(GLOBAL_CANVAS_KEY, { x: 0, y: 0, zoom: 1 });
    const points = visibleThreads.map(
      (thread) => state.positions[thread.id] ?? nextFreeformPosition({}, 0),
    );
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + 292));
    const maxY = Math.max(...points.map((point) => point.y + 190));
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1000;
    const height = rect?.height ?? 700;
    const zoom = Math.min(
      1,
      Math.max(
        0.35,
        Math.min((width - 80) / Math.max(1, maxX - minX), (height - 80) / Math.max(1, maxY - minY)),
      ),
    );
    setViewport(GLOBAL_CANVAS_KEY, { x: 40 - minX * zoom, y: 40 - minY * zoom, zoom });
  }, [setViewport, state.positions, visibleThreads]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const targetIsFormControl =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;
      const action = terminalCenterKeyboardAction({
        key: event.key,
        selectedThreadId: state.selectedThreadId,
        focused: false,
        targetIsFormControl,
      });
      if (action === "focus" && state.selectedThreadId) {
        const thread = threadById.get(state.selectedThreadId as ThreadId);
        if (!thread) return;
        event.preventDefault();
        setFocused({ environmentId: thread.environmentId, threadId: thread.id });
      }
      if (event.key === "f" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        fitAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitAll, state.selectedThreadId, threadById]);

  const launchSession = async () => {
    if (!selectedProject || !selectedProvider) return;
    const blockReason = providerLaunchBlockReason(selectedProvider);
    if (blockReason) return reportError("Provider is unavailable", blockReason);
    setLaunching(true);
    const threadId = newThreadId();
    const selection: ModelSelection = {
      instanceId: selectedProvider.instanceId,
      model: selectedModel || selectedProvider.models[0]?.slug || "auto",
    };
    const result = await createThread({
      environmentId: selectedProject.environmentId,
      input: {
        threadId,
        projectId: selectedProject.id,
        ...terminalThreadCreateFields({
          title: `${selectedProvider.displayName} terminal`,
          modelSelection: selection,
          workspace: { mode: "current" },
        }),
      },
    });
    if (result._tag === "Failure") {
      setLaunching(false);
      reportError("Could not create terminal", "The canonical Thread could not be created.");
      return;
    }
    showThread(
      GLOBAL_CANVAS_KEY,
      threadId,
      nextFreeformPosition(state.positions, state.visibleThreadIds.length),
    );
    const devServerProfile = selectedDevServerProfiles.find(
      (profile) => profile.id === selectedDevServerProfileId,
    );
    if (devServerProfile) {
      const cwd = resolveDevServerCwd(
        selectedProject.workspaceRoot,
        devServerProfile.workingDirectory,
      );
      const terminalId = devServerTerminalId(devServerProfile.id);
      const conflictingProfile =
        devServerProfile.preferredPort === null
          ? null
          : Object.values(settings.devServerProfilesByProject)
              .flat()
              .find(
                (profile) =>
                  profile.id !== devServerProfile.id &&
                  profile.preferredPort === devServerProfile.preferredPort &&
                  selectedEnvironmentSessions.some(
                    (session) =>
                      session.target.terminalId === devServerTerminalId(profile.id) &&
                      session.state.hasRunningSubprocess,
                  ),
              );
      if (!cwd) {
        reportError(
          "Dev Server was not started",
          "Its approved working directory is no longer project-relative.",
        );
      } else if (conflictingProfile) {
        reportError(
          `Port ${devServerProfile.preferredPort} is already assigned`,
          "Stop the other Nebula Dev Server or approve a different port.",
        );
      } else {
        const opened = await openTerminal({
          environmentId: selectedProject.environmentId,
          input: { threadId, terminalId, cwd, cols: 120, rows: 30 },
        });
        if (opened._tag === "Success") {
          const written = await writeTerminal({
            environmentId: selectedProject.environmentId,
            input: { threadId, terminalId, data: `${devServerProfile.command}\r` },
          });
          if (written._tag === "Failure") {
            reportError(
              "Dev Server was not started",
              "Nebula could not write the approved command to its terminal.",
            );
          }
        } else {
          reportError(
            "Dev Server was not started",
            "Nebula could not open its dedicated terminal.",
          );
        }
      }
    }
    setLaunching(false);
    setLaunchOpen(false);
    setFocused({ environmentId: selectedProject.environmentId, threadId });
  };

  if (focused)
    return (
      <GlobalFocusedTerminal
        environmentId={focused.environmentId}
        threadId={focused.threadId}
        onExit={() => setFocused(null)}
      />
    );

  const filteredThreads = visibleThreads.filter((thread) => {
    const group = groupByProjectKey.get(`${thread.environmentId}:${thread.projectId}`);
    return `${group?.displayName ?? ""} ${thread.title} ${thread.modelSelection.instanceId} ${thread.modelSelection.model}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });
  const selectedThread = state.selectedThreadId
    ? (threadById.get(state.selectedThreadId as ThreadId) ?? null)
    : null;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
      <div className="flex h-full min-h-0 flex-col">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border/70 bg-card/80">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <WorkspaceBreadcrumb ariaLabel="Global Terminal Center breadcrumb">
              <WorkspaceBreadcrumbItem current>Global Terminal Center</WorkspaceBreadcrumbItem>
            </WorkspaceBreadcrumb>
            <div className="flex items-center gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/" })}>
                <ArrowLeftIcon /> Workspace
              </Button>
              <Button size="xs" onClick={() => setLaunchOpen(true)}>
                <PlusIcon /> New session
              </Button>
            </div>
          </div>
        </WorkspacePageHeader>
        <section className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/55 px-3 py-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search projects, sessions, providers…"
              aria-label="Search global terminal nodes"
            />
          </div>
          <select
            aria-label="Project for quick launch"
            value={selectedProjectKey}
            onChange={(event) => setSelectedProjectKey(event.currentTarget.value)}
            className="h-8 max-w-48 rounded-md border border-border bg-background px-2 text-xs"
          >
            {groups.map((group) => (
              <option key={group.projectKey} value={group.projectKey}>
                {group.displayName}
              </option>
            ))}
          </select>
          {providerEntries
            .filter((entry) => providerLaunchBlockReason(entry) === null)
            .slice(0, 3)
            .map((entry) => (
              <Button
                key={entry.instanceId}
                size="xs"
                variant="outline"
                onClick={() => {
                  setSelectedProviderId(entry.instanceId);
                  setSelectedModel(entry.models[0]?.slug ?? "auto");
                  setLaunchOpen(true);
                }}
              >
                <ProviderInstanceIcon
                  driverKind={entry.driverKind}
                  displayName={entry.displayName}
                  accentColor={entry.accentColor}
                  className="size-3.5"
                />
                {entry.displayName}
              </Button>
            ))}
          <select
            aria-label="Arrange global canvas"
            value={state.layout}
            onChange={(event) => applyLayout(event.currentTarget.value as TerminalCenterLayout)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            {TERMINAL_CENTER_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {layoutLabels[layout]}
              </option>
            ))}
          </select>
          <Button size="xs" variant="ghost" onClick={() => applyLayout("project-columns")}>
            <Columns3Icon /> Project columns
          </Button>
          <Button size="xs" variant="ghost" onClick={fitAll}>
            <Maximize2Icon /> Fit all
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {visibleThreads.length} sessions ·{" "}
            {new Set(visibleThreads.map((thread) => thread.projectId)).size} projects
          </span>
        </section>

        <div className="flex min-h-0 flex-1">
          <div
            ref={canvasRef}
            className="relative min-w-0 flex-1 overflow-hidden bg-background"
            onWheel={(event) => {
              event.preventDefault();
              const rect = canvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              const nextZoom = Math.min(
                2,
                Math.max(0.35, state.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
              );
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;
              const ratio = nextZoom / state.viewport.zoom;
              setViewport(GLOBAL_CANVAS_KEY, {
                zoom: nextZoom,
                x: x - (x - state.viewport.x) * ratio,
                y: y - (y - state.viewport.y) * ratio,
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
                setViewport(GLOBAL_CANVAS_KEY, {
                  ...state.viewport,
                  x: panning.origin.x + event.clientX - panning.pointer.x,
                  y: panning.origin.y + event.clientY - panning.pointer.y,
                });
              if (dragging)
                setNodePosition(GLOBAL_CANVAS_KEY, dragging.threadId, {
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
              aria-hidden
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--muted-foreground) 32%, transparent) 1px, transparent 0)",
                backgroundSize: `${24 * state.viewport.zoom}px ${24 * state.viewport.zoom}px`,
                backgroundPosition: `${state.viewport.x}px ${state.viewport.y}px`,
              }}
            />
            {visibleThreads.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center p-6">
                <div className="max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
                  <LayoutDashboardIcon className="mx-auto size-8 text-primary" aria-hidden />
                  <h1 className="mt-4 text-lg font-semibold">
                    Supervise every project in one place
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Create a canonical Thread or add an existing session to this global canvas.
                  </p>
                  <Button className="mt-5" onClick={() => setLaunchOpen(true)}>
                    <PlusIcon /> New session
                  </Button>
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
              {filteredThreads.map((thread) => {
                const point =
                  state.positions[thread.id] ??
                  nextFreeformPosition(state.positions, state.visibleThreadIds.indexOf(thread.id));
                const group = groupByProjectKey.get(`${thread.environmentId}:${thread.projectId}`);
                const config = serverConfigs.get(thread.environmentId);
                const entry = deriveProviderInstanceEntries(config?.providers ?? []).find(
                  (candidate) => candidate.instanceId === thread.modelSelection.instanceId,
                );
                const selected = state.selectedThreadId === thread.id;
                return (
                  <article
                    key={`${thread.environmentId}:${thread.id}`}
                    data-terminal-node
                    tabIndex={0}
                    aria-label={`${group?.displayName ?? "Project"}, ${thread.title}, ${thread.modelSelection.model}`}
                    className={`absolute w-[292px] select-none rounded-xl border bg-card shadow-lg ${selected ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                    style={{ left: point.x, top: point.y }}
                    onClick={() => setSelection(GLOBAL_CANVAS_KEY, thread.id)}
                    onDoubleClick={() =>
                      setFocused({ environmentId: thread.environmentId, threadId: thread.id })
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      setFocused({ environmentId: thread.environmentId, threadId: thread.id });
                    }}
                  >
                    <div
                      className="flex cursor-grab items-center gap-2 border-b border-border px-3 py-2.5 active:cursor-grabbing"
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
                        displayName={entry?.displayName ?? thread.modelSelection.instanceId}
                        accentColor={entry?.accentColor}
                        className="size-5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{thread.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {entry?.displayName ?? thread.modelSelection.instanceId} ·{" "}
                          {thread.modelSelection.model}
                        </p>
                      </div>
                      <span
                        className={`size-2 rounded-full ${deriveTerminalNodeStatus(thread) === "attention" ? "bg-destructive" : deriveTerminalNodeStatus(thread) === "working" ? "bg-primary" : "bg-emerald-500"}`}
                        aria-label={deriveTerminalNodeStatus(thread)}
                      />
                    </div>
                    <div className="space-y-2 px-3 py-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Project</span>
                        <span className="truncate font-medium">
                          {group?.displayName ?? thread.projectId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Workspace</span>
                        <span className="truncate">
                          {terminalWorkspaceLabel({
                            worktreePath: thread.worktreePath,
                            taskBacked: thread.worktreePath !== null,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Branch</span>
                        <span className="truncate">{thread.branch ?? "main"}</span>
                      </div>
                      {group ? (
                        <GlobalDevServerSummary
                          environmentId={thread.environmentId}
                          projectKey={group.projectKey}
                          thread={thread}
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocused({ environmentId: thread.environmentId, threadId: thread.id });
                        }}
                      >
                        <FocusIcon /> Focus
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${thread.title} from global canvas`}
                        onClick={(event) => {
                          event.stopPropagation();
                          hideThread(GLOBAL_CANVAS_KEY, thread.id);
                        }}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="absolute bottom-3 left-3 z-20 flex items-center rounded-lg border border-border bg-card p-1 text-xs text-muted-foreground shadow-sm">
              <button
                type="button"
                className="px-2 py-1 hover:text-foreground"
                aria-label="Zoom out"
                onClick={() =>
                  setViewport(GLOBAL_CANVAS_KEY, {
                    ...state.viewport,
                    zoom: Math.max(0.35, state.viewport.zoom - 0.1),
                  })
                }
              >
                −
              </button>
              <span className="w-11 text-center">{Math.round(state.viewport.zoom * 100)}%</span>
              <button
                type="button"
                className="px-2 py-1 hover:text-foreground"
                aria-label="Zoom in"
                onClick={() =>
                  setViewport(GLOBAL_CANVAS_KEY, {
                    ...state.viewport,
                    zoom: Math.min(2, state.viewport.zoom + 0.1),
                  })
                }
              >
                +
              </button>
            </div>
          </div>

          <aside className="hidden w-72 shrink-0 border-l border-border bg-card/75 p-4 lg:block">
            <p className="text-xs text-muted-foreground">Selected terminal</p>
            {selectedThread ? (
              <div className="mt-3 space-y-3">
                <div>
                  <h2 className="truncate text-sm font-medium">{selectedThread.title}</h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {groupByProjectKey.get(
                      `${selectedThread.environmentId}:${selectedThread.projectId}`,
                    )?.displayName ?? selectedThread.projectId}
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    setFocused({
                      environmentId: selectedThread.environmentId,
                      threadId: selectedThread.id,
                    })
                  }
                >
                  <FocusIcon /> Focus terminal
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: {
                        environmentId: selectedThread.environmentId,
                        threadId: selectedThread.id,
                      },
                    })
                  }
                >
                  Open workspace
                </Button>
                {(() => {
                  const group = groupByProjectKey.get(
                    `${selectedThread.environmentId}:${selectedThread.projectId}`,
                  );
                  const project = projectByKey.get(
                    `${selectedThread.environmentId}:${selectedThread.projectId}`,
                  );
                  return group && project ? (
                    <div className="border-t border-border pt-3">
                      <p className="mb-2 text-xs font-medium">Dev Servers</p>
                      <DevServerControls
                        environmentId={selectedThread.environmentId}
                        projectKey={group.projectKey}
                        projectWorkspaceRoot={project.workspaceRoot}
                        thread={selectedThread}
                      />
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Select a node to inspect it.</p>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogPopup>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>New terminal session</DialogTitle>
              <DialogDescription>
                Creates a canonical Thread in the selected Project. This never grants new write
                scope.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Project</span>
                <select
                  value={selectedProjectKey}
                  onChange={(event) => setSelectedProjectKey(event.currentTarget.value)}
                  className="w-full rounded-md border border-border bg-background p-2"
                >
                  {groups.map((group) => (
                    <option key={group.projectKey} value={group.projectKey}>
                      {group.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Provider</span>
                <select
                  value={selectedProvider?.instanceId ?? ""}
                  onChange={(event) => {
                    const next = providerEntries.find(
                      (entry) => entry.instanceId === event.currentTarget.value,
                    );
                    setSelectedProviderId(event.currentTarget.value);
                    setSelectedModel(next?.models[0]?.slug ?? "auto");
                  }}
                  className="w-full rounded-md border border-border bg-background p-2"
                >
                  {providerEntries.map((entry) => (
                    <option
                      key={entry.instanceId}
                      value={entry.instanceId}
                      disabled={providerLaunchBlockReason(entry) !== null}
                    >
                      {entry.displayName}
                      {providerLaunchBlockReason(entry)
                        ? ` · ${providerLaunchBlockReason(entry)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Model</span>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.currentTarget.value)}
                  className="w-full rounded-md border border-border bg-background p-2"
                >
                  {(selectedProvider?.models ?? []).map((model) => (
                    <option key={model.slug} value={model.slug}>
                      {model.name ?? model.slug}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Dev Server (optional)</span>
                <select
                  value={selectedDevServerProfileId}
                  onChange={(event) => setSelectedDevServerProfileId(event.currentTarget.value)}
                  className="w-full rounded-md border border-border bg-background p-2"
                >
                  <option value="">Do not start a Dev Server</option>
                  {selectedDevServerProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.preferredPort ? ` · :${profile.preferredPort}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Current checkout</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  For an isolated worktree with explicit ownership, open the Project Terminal Center
                  and choose Isolated. Global launch intentionally does not infer permissions.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLaunchOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selectedProject || !selectedProvider || launching}
                onClick={() => void launchSession()}
              >
                {launching ? "Launching…" : "Launch"}
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
