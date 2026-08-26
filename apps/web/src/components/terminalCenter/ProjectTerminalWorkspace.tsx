import { useAtomValue } from "@effect/atom-react";
import {
  EnvironmentId,
  ThreadId,
  type DevServerProfile,
  type DiscoveredLocalServer,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  AppWindowIcon,
  BotIcon,
  ChevronLeftIcon,
  Columns2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileClockIcon,
  FlaskConicalIcon,
  FocusIcon,
  GitBranchIcon,
  Grid2X2Icon,
  LinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Rows2Icon,
  SquareIcon,
  TerminalSquareIcon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readLocalApi } from "../../localApi";
import { randomUUID, newThreadId } from "../../lib/utils";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { environmentSnapshotAtom } from "../../state/shell";
import { useServerConfigs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { terminalEnvironment } from "../../state/terminal";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { threadEnvironment } from "../../state/threads";
import { vcsEnvironment } from "../../state/vcs";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePrimarySettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useUiStateStore } from "../../uiStateStore";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
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
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import { deriveCurrentAction } from "../commandDeck/commandDeckLogic";
import { useDiscoveredLocalServers } from "../preview/useDiscoveredLocalServers";
import {
  approvedProfileFromSuggestion,
  discoveredServerForTerminal,
  discoverDevServerSuggestions,
  nextAvailablePreferredPort,
  replaceRetargetedProfile,
  retargetApprovedProfile,
  type DevServerSuggestion,
} from "./devServerDiscovery";
import {
  describeDevServerStatus,
  devServerTerminalId,
  resolveDevServerCwd,
} from "./DevServerControls";
import { deriveTerminalAgentPresentation, terminalThreadCreateFields } from "./terminalCenterLogic";
import {
  createDefaultTerminalWorkspaceProjectState,
  createTerminalWorkspacePane,
  firstAvailableGridPlacement,
  hideWorkspacePane,
  migrateTerminalCanvasToWorkspace,
  movePaneToGrid,
  removeWorkspacePane,
  reflowWorkspaceGrid,
  restoreWorkspacePane,
  TERMINAL_WORKSPACE_GRID_PRESETS,
  terminalWorkspaceGridDimensions,
  terminalWorkspaceHostThreadId,
  updateWorkspace,
  type TerminalWorkspace,
  type TerminalWorkspaceGridPlacement,
  type TerminalWorkspaceGridPreset,
  type TerminalWorkspacePane,
  type TerminalWorkspacePaneType,
  type TerminalWorkspaceProjectState,
} from "./terminalWorkspace";
import { WorkspaceTerminalViewport } from "./WorkspaceTerminalViewport";

const ChatView = lazy(() => import("../ChatView"));

type ProjectGroup = ReturnType<typeof useSettingsProjectGroups>[number];
type WorkspaceProject = ProjectGroup["memberProjects"][number];

interface FreeformDragState {
  readonly paneId: string;
  readonly startX: number;
  readonly startY: number;
  readonly originX: number;
  readonly originY: number;
  readonly x: number;
  readonly y: number;
}

interface GridResizeState {
  readonly paneId: string;
  readonly startX: number;
  readonly startY: number;
  readonly originColumnSpan: number;
  readonly originRowSpan: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
}

const paneIcon: Record<TerminalWorkspacePaneType, typeof TerminalSquareIcon> = {
  shell: TerminalSquareIcon,
  provider: BotIcon,
  dev_server: AppWindowIcon,
  preview: EyeIcon,
  tests: FlaskConicalIcon,
  logs: FileClockIcon,
  git: GitBranchIcon,
  thread: BotIcon,
};

function commandFailure(
  result: Awaited<ReturnType<ReturnType<typeof useAtomCommand>>>,
): string | null {
  return result._tag === "Failure" ? "The command could not be completed." : null;
}

function reportError(title: string, description: string) {
  toastManager.add(stackedThreadToast({ type: "error", title, description }));
}

function openExternal(url: string) {
  const localApi = readLocalApi();
  if (localApi) void localApi.shell.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function PaneHeader({
  pane,
  selected,
  working,
  onSelect,
  onFocus,
  maximized,
  onMaximize,
  onHide,
  onResize,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  readonly pane: TerminalWorkspacePane;
  readonly selected: boolean;
  readonly working: boolean;
  readonly onSelect: () => void;
  readonly onFocus: () => void;
  readonly maximized: boolean;
  readonly onMaximize: () => void;
  readonly onHide: () => void;
  readonly onResize: () => void;
  readonly draggable: boolean;
  readonly onDragStart: (event: React.DragEvent) => void;
  readonly onDragEnd: () => void;
}) {
  const Icon = paneIcon[pane.type];
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-border/70 bg-muted/20 px-2 active:cursor-grabbing"
      onMouseDown={onSelect}
    >
      <span className="grid size-6 place-items-center rounded-md border border-border bg-background">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{pane.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{pane.workspacePath}</p>
      </div>
      <span
        className={`size-1.5 rounded-full ${working ? "bg-emerald-500 motion-safe:animate-pulse" : selected ? "bg-primary" : "bg-muted-foreground/40"}`}
        aria-label={working ? "Working" : selected ? "Selected" : "Idle"}
      />
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Cycle ${pane.title} size`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onResize}
      >
        <Grid2X2Icon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={maximized ? `Restore ${pane.title}` : `Maximize ${pane.title}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onMaximize}
      >
        {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Focus ${pane.title}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onFocus}
      >
        <FocusIcon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Hide ${pane.title}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onHide}
      >
        <XIcon />
      </Button>
    </div>
  );
}

const GitStatusPane = memo(function GitStatusPane({
  environmentId,
  cwd,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
}) {
  const status = useEnvironmentQuery(vcsEnvironment.status({ environmentId, input: { cwd } }));
  if (status.error) return <div className="p-3 text-xs text-destructive">{status.error}</div>;
  if (!status.data)
    return <div className="p-3 text-xs text-muted-foreground">Reading Git status…</div>;
  return (
    <div className="h-full overflow-auto p-3 font-mono text-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span>Branch</span>
        <span className="text-primary">{status.data.refName ?? "Detached"}</span>
      </div>
      <p className="mb-2 text-muted-foreground">
        {status.data.workingTree.files.length} changed · +{status.data.workingTree.insertions} −
        {status.data.workingTree.deletions}
      </p>
      <div className="space-y-1">
        {status.data.workingTree.files.map((file) => (
          <div key={file.path} className="flex items-center gap-2 rounded bg-muted/25 px-2 py-1">
            <span className="text-amber-500">M</span>
            <span className="min-w-0 flex-1 truncate">{file.path}</span>
            <span className="text-muted-foreground">
              +{file.insertions} −{file.deletions}
            </span>
          </div>
        ))}
        {status.data.workingTree.files.length === 0 ? (
          <p className="text-emerald-500">Working tree clean</p>
        ) : null}
      </div>
    </div>
  );
});

const PreviewSurface = memo(function PreviewSurface({
  url,
  title,
  refreshKey,
  state,
  onReload,
  onRestart,
}: {
  readonly url: string;
  readonly title: string;
  readonly refreshKey: number;
  readonly state: "idle" | "connecting" | "ready" | "stopped" | "blocked";
  readonly onReload: () => void;
  readonly onRestart?: (() => void) | undefined;
}) {
  const [frameState, setFrameState] = useState<"connecting" | "ready" | "failed">(
    state === "ready" ? "connecting" : "failed",
  );
  useEffect(() => {
    setFrameState(state === "ready" ? "connecting" : "failed");
  }, [refreshKey, state, url]);

  if (!url || state === "idle")
    return (
      <div className="grid h-full place-items-center bg-muted/10 p-6 text-center">
        <div>
          <AppWindowIcon className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No running development server</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start or attach a Dev Server to load this Preview.
          </p>
        </div>
      </div>
    );
  if (state !== "ready")
    return (
      <div className="flex h-full min-h-0 flex-col bg-muted/10">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 bg-background/85 px-2">
          <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {url}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Open Preview in browser"
            onClick={() => openExternal(url)}
          >
            <ExternalLinkIcon />
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <RefreshCwIcon className="mx-auto size-6 text-primary" />
            <p className="mt-3 text-sm font-medium">
              {state === "connecting"
                ? "Connecting to development server…"
                : state === "blocked"
                  ? "Embedding blocked by this app"
                  : "Development server stopped"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {state === "connecting"
                ? "The process is running; Preview will attach after HTTP readiness succeeds."
                : state === "blocked"
                  ? "The server is healthy, but its frame security policy prevents an embedded Preview."
                  : "Restart the attached Dev Server, then retry Preview."}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              {state === "blocked" ? (
                <Button size="xs" onClick={() => openExternal(url)}>
                  <ExternalLinkIcon /> Open in Browser
                </Button>
              ) : (
                <Button size="xs" variant="outline" onClick={onReload}>
                  <RefreshCwIcon /> Retry Connection
                </Button>
              )}
              {state !== "blocked" && onRestart ? (
                <Button size="xs" onClick={onRestart}>
                  <RotateCcwIcon /> Restart Server
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/10">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/70 bg-background/85 px-2">
        <Button size="icon-xs" variant="ghost" aria-label="Reload Preview" onClick={onReload}>
          <RefreshCwIcon />
        </Button>
        <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {url}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-500">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Live
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Open Preview in browser"
          onClick={() => openExternal(url)}
        >
          <ExternalLinkIcon />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {frameState === "connecting" ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background text-xs text-muted-foreground">
            Loading {url}…
          </div>
        ) : null}
        {frameState === "failed" ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background p-6 text-center">
            <div>
              <p className="text-sm font-medium">Preview could not render this page</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The app may block embedding. Retry here or open it in your browser.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="xs" variant="outline" onClick={onReload}>
                  <RefreshCwIcon /> Retry
                </Button>
                {onRestart ? (
                  <Button size="xs" variant="outline" onClick={onRestart}>
                    <RotateCcwIcon /> Restart Server
                  </Button>
                ) : null}
                <Button size="xs" onClick={() => openExternal(url)}>
                  <ExternalLinkIcon /> Open Browser
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {/* Local dev apps need their real origin and scripts for HMR. The URL comes only from a
        human-approved Dev Server profile; arbitrary remote pages use Nebula's Preview runtime. */}
        {/* eslint-disable-next-line react/iframe-missing-sandbox -- sandboxing breaks local HMR origins */}
        <iframe
          key={`${url}:${refreshKey}`}
          title={title}
          src={url}
          className="h-full w-full border-0 bg-white"
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setFrameState("ready")}
          onError={() => setFrameState("failed")}
        />
      </div>
    </div>
  );
});

const ProviderPane = memo(function ProviderPane({
  environmentId,
  thread,
  compact,
  entry,
}: {
  readonly environmentId: EnvironmentId;
  readonly thread: OrchestrationThreadShell | null;
  readonly compact: boolean;
  readonly entry: ProviderInstanceEntry | null;
}) {
  if (!thread)
    return (
      <div className="grid h-full place-items-center p-4 text-center text-xs text-muted-foreground">
        The canonical Thread is unavailable. Remove this pane or restore the Thread.
      </div>
    );
  if (!compact)
    return (
      <Suspense
        fallback={<div className="grid h-full place-items-center text-xs">Loading Thread…</div>}
      >
        <div className="flex h-full min-h-0 min-w-0 [&_[contenteditable='true']]:min-h-10 [&_[contenteditable='true']]:max-h-24">
          <ChatView
            environmentId={environmentId}
            threadId={thread.id}
            routeKind="server"
            reserveTitleBarControlInset={false}
            embeddedTerminalPane
          />
        </div>
      </Suspense>
    );
  const presentation = deriveTerminalAgentPresentation({
    thread,
    task: null,
    run: null,
    providerAvailable: entry?.isAvailable ?? false,
  });
  return (
    <button
      type="button"
      className="flex h-full w-full flex-col items-start gap-3 overflow-auto p-4 text-left font-mono text-xs hover:bg-muted/15"
    >
      <div className="flex w-full items-center gap-2">
        {entry ? (
          <ProviderInstanceIcon
            driverKind={entry.driverKind}
            displayName={entry.displayName}
            accentColor={entry.accentColor}
            className="size-5"
          />
        ) : null}
        <span className="text-primary">{thread.modelSelection.model}</span>
        <span className="ml-auto text-muted-foreground">{presentation.label}</span>
      </div>
      <p className="text-foreground">
        {deriveCurrentAction(thread) ?? presentation.detail ?? "Ready for the next turn."}
      </p>
      {thread.planProgress?.step ? (
        <p className="text-emerald-500">{thread.planProgress.step}</p>
      ) : null}
      <p className="mt-auto text-muted-foreground">Select this pane to open its live composer.</p>
    </button>
  );
});

export function ProjectTerminalWorkspace({
  project,
  projectKey,
  displayName,
}: {
  readonly project: WorkspaceProject;
  readonly projectKey: string;
  readonly displayName: string;
}) {
  const navigate = useNavigate();
  const groups = useSettingsProjectGroups();
  const snapshot = useAtomValue(environmentSnapshotAtom(project.environmentId));
  const settings = usePrimarySettings();
  const updateClientSettings = useUpdateClientSettings();
  const serverConfig = useServerConfigs().get(project.environmentId) ?? null;
  const providerEntries = useMemo(
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
  const threadById = useMemo(
    () => new Map(projectThreads.map((thread) => [thread.id, thread] as const)),
    [projectThreads],
  );
  const workspaceState = useUiStateStore(
    (store) => store.terminalWorkspacesByProjectId[project.id],
  );
  const legacyState = useUiStateStore((store) => store.terminalCenterByProjectId[project.id]);
  const setWorkspaceState = useUiStateStore((store) => store.setTerminalWorkspaceProjectState);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const writeTerminal = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const closeTerminal = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const sessions = useKnownTerminalSessions({
    environmentId: project.environmentId,
    threadId: null,
  });
  const packageJson = useProjectFileQuery(
    project.environmentId,
    project.workspaceRoot,
    "package.json",
  );
  const devServerProfiles = settings.devServerProfilesByProject[projectKey] ?? [];
  const discoveredServers = useDiscoveredLocalServers({
    environmentId: project.environmentId,
    configuredUrls: devServerProfiles.flatMap((profile) =>
      profile.previewUrl ? [profile.previewUrl] : [],
    ),
  });
  const suggestions = useMemo(
    () =>
      discoverDevServerSuggestions({
        packageJsonContents: packageJson.data?.contents ?? null,
        projectScripts: project.scripts,
      }),
    [packageJson.data?.contents, project.scripts],
  );
  const [addPaneOpen, setAddPaneOpen] = useState(false);
  const [addAt, setAddAt] = useState<{ column: number; row: number } | null>(null);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const reloadPreview = useCallback(() => setPreviewRefreshKey((key) => key + 1), []);
  const [previewStagePaneId, setPreviewStagePaneId] = useState<string | null>(null);
  const [pendingProfileRestart, setPendingProfileRestart] = useState<{
    readonly profile: DevServerProfile;
    readonly terminalId: string;
    readonly workspacePath: string;
  } | null>(null);
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [stageAgentPaneId, setStageAgentPaneId] = useState<string | null>(null);
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [freeformDrag, setFreeformDrag] = useState<FreeformDragState | null>(null);
  const freeformDragRef = useRef<FreeformDragState | null>(null);
  const [gridResize, setGridResize] = useState<GridResizeState | null>(null);
  const gridResizeRef = useRef<GridResizeState | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredViewportWorkspaceIdRef = useRef<string | null>(null);
  const viewportSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (workspaceState) return;
    setWorkspaceState(
      project.id,
      migrateTerminalCanvasToWorkspace({
        projectId: project.id,
        workspacePath: project.workspaceRoot,
        legacy: legacyState,
      }),
    );
  }, [legacyState, project.id, project.workspaceRoot, setWorkspaceState, workspaceState]);

  const activeWorkspace =
    workspaceState?.workspaces.find(
      (workspace) => workspace.id === workspaceState.activeWorkspaceId,
    ) ??
    workspaceState?.workspaces[0] ??
    null;
  const selectedWorkspacePath =
    activeWorkspace?.panes.find((pane) => pane.id === activeWorkspace.selectedPaneId)
      ?.workspacePath ?? project.workspaceRoot;

  const persistProjectState = useCallback(
    (next: TerminalWorkspaceProjectState) => setWorkspaceState(project.id, next),
    [project.id, setWorkspaceState],
  );
  const updateActiveWorkspace = useCallback(
    (update: (workspace: TerminalWorkspace) => TerminalWorkspace) => {
      if (!activeWorkspace) return;
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      if (!currentState) return;
      persistProjectState(updateWorkspace(currentState, activeWorkspace.id, update));
    },
    [activeWorkspace, persistProjectState, project.id],
  );

  const addPane = useCallback(
    (
      input: Omit<
        Parameters<typeof createTerminalWorkspacePane>[0],
        "id" | "workspacePath" | "grid"
      > & { readonly workspacePath?: string },
    ) => {
      if (!activeWorkspace) return null;
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const currentWorkspace = currentState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace.id,
      );
      if (!currentState || !currentWorkspace) return null;
      const placement = firstAvailableGridPlacement(
        currentWorkspace.panes,
        addAt ?? undefined,
        currentWorkspace.gridPreset === "auto"
          ? { columns: 4, rows: 4 }
          : terminalWorkspaceGridDimensions(currentWorkspace),
      );
      if (!placement) {
        reportError(
          "Workspace grid is full",
          "Hide a pane, resize one, or create another Workspace.",
        );
        return null;
      }
      const pane = createTerminalWorkspacePane({
        ...input,
        id: randomUUID(),
        workspacePath: input.workspacePath ?? project.workspaceRoot,
        grid: placement,
      });
      persistProjectState(
        updateWorkspace(currentState, currentWorkspace.id, (workspace) => ({
          ...workspace,
          panes: [...workspace.panes, pane],
          selectedPaneId: pane.id,
          updatedAt: new Date().toISOString(),
        })),
      );
      setAddPaneOpen(false);
      setAddAt(null);
      return pane;
    },
    [activeWorkspace, addAt, persistProjectState, project.id, project.workspaceRoot],
  );

  const launchProvider = useCallback(
    async (driverKind: "codex" | "antigravity") => {
      const entry = providerEntries.find(
        (candidate) =>
          candidate.driverKind === driverKind && candidate.enabled && candidate.isAvailable,
      );
      if (!entry) {
        reportError(
          `${driverKind === "codex" ? "Codex" : "Antigravity"} unavailable`,
          "Enable a ready provider instance before creating this pane.",
        );
        return;
      }
      const threadId = newThreadId();
      const result = await createThread({
        environmentId: project.environmentId,
        input: {
          threadId,
          projectId: project.id,
          ...terminalThreadCreateFields({
            title: `${entry.displayName} workspace`,
            modelSelection: {
              instanceId: entry.instanceId,
              model: entry.models[0]?.slug ?? "auto",
            },
            workspace: { mode: "current" },
          }),
        },
      });
      if (commandFailure(result)) {
        reportError("Could not create provider pane", "The canonical Thread was not created.");
        return;
      }
      addPane({
        type: "provider",
        title: entry.displayName,
        threadId,
        providerInstanceId: entry.instanceId,
      });
    },
    [addPane, createThread, project.environmentId, project.id, providerEntries],
  );

  const hostThreadId = activeWorkspace
    ? terminalWorkspaceHostThreadId(project.id, activeWorkspace.id)
    : terminalWorkspaceHostThreadId(project.id, "default");

  const startProfile = useCallback(
    async (
      profile: DevServerProfile,
      restart: boolean,
      terminalId = devServerTerminalId(profile.id),
      workspacePath = project.workspaceRoot,
    ) => {
      const cwd = resolveDevServerCwd(workspacePath, profile.workingDirectory);
      if (!cwd) {
        reportError("Invalid Dev Server directory", "Use a project-relative working directory.");
        return;
      }
      if (restart) {
        const session = sessions.find(
          (candidate) =>
            candidate.target.threadId === hostThreadId &&
            candidate.target.terminalId === terminalId,
        );
        if (session?.state.hasRunningSubprocess) {
          const interrupted = await writeTerminal({
            environmentId: project.environmentId,
            input: { threadId: hostThreadId, terminalId, data: "\x03" },
          });
          if (commandFailure(interrupted)) {
            reportError(
              "Could not restart Dev Server",
              "Nebula could not interrupt the approved process.",
            );
            return;
          }
          setPendingProfileRestart({ profile, terminalId, workspacePath });
          return;
        }
      }
      const lifecycleResult = await openTerminal({
        environmentId: project.environmentId,
        input: { threadId: hostThreadId, terminalId, cwd, cols: 120, rows: 30 },
      });
      if (commandFailure(lifecycleResult)) {
        reportError(
          restart ? "Could not restart Dev Server" : "Could not start Dev Server",
          restart
            ? "Nebula could not restart its approved PTY."
            : "Nebula could not open its approved PTY.",
        );
        return;
      }
      const written = await writeTerminal({
        environmentId: project.environmentId,
        input: { threadId: hostThreadId, terminalId, data: `${profile.command}\r` },
      });
      if (commandFailure(written))
        reportError("Could not start Dev Server", "The approved command was not written.");
    },
    [
      hostThreadId,
      openTerminal,
      project.environmentId,
      project.workspaceRoot,
      sessions,
      writeTerminal,
    ],
  );

  useEffect(() => {
    if (!pendingProfileRestart) return;
    const session = sessions.find(
      (candidate) =>
        candidate.target.threadId === hostThreadId &&
        candidate.target.terminalId === pendingProfileRestart.terminalId,
    );
    if (session?.state.hasRunningSubprocess) return;
    const restart = pendingProfileRestart;
    setPendingProfileRestart(null);
    void startProfile(restart.profile, false, restart.terminalId, restart.workspacePath);
  }, [hostThreadId, pendingProfileRestart, sessions, startProfile]);

  const approveSuggestion = useCallback(
    async (suggestion: DevServerSuggestion) => {
      const occupied = new Set([
        ...devServerProfiles.flatMap((profile) =>
          profile.preferredPort === null ? [] : [profile.preferredPort],
        ),
        ...discoveredServers.map((server) => server.port),
      ]);
      const port = nextAvailablePreferredPort(suggestion.preferredPort, occupied);
      const profile = approvedProfileFromSuggestion({
        id: randomUUID(),
        suggestion,
        port,
        approvedAt: new Date().toISOString(),
      });
      updateClientSettings({
        devServerProfilesByProject: {
          ...settings.devServerProfilesByProject,
          [projectKey]: [...devServerProfiles, profile],
        },
      });
      const pane = addPane({
        type: "dev_server",
        title: profile.name,
        terminalId: `dev-${randomUUID()}`,
        devServerProfileId: profile.id,
        previewUrl: profile.previewUrl,
        workspacePath: selectedWorkspacePath,
      });
      if (pane)
        await startProfile(profile, false, pane.terminalId ?? undefined, pane.workspacePath);
    },
    [
      addPane,
      devServerProfiles,
      discoveredServers,
      project.workspaceRoot,
      projectKey,
      selectedWorkspacePath,
      settings.devServerProfilesByProject,
      startProfile,
      updateClientSettings,
    ],
  );

  const addApprovedDevServer = useCallback(
    async (approvedProfile: DevServerProfile) => {
      let profile = approvedProfile;
      if (
        profile.preferredPort !== null &&
        discoveredServers.some((server) => server.port === profile.preferredPort)
      ) {
        const occupied = new Set(discoveredServers.map((server) => server.port));
        const port = nextAvailablePreferredPort(profile.preferredPort, occupied);
        const retargeted =
          port === null
            ? null
            : retargetApprovedProfile({
                profile,
                id: randomUUID(),
                port,
                approvedAt: new Date().toISOString(),
              });
        if (!retargeted) {
          reportError(
            `${profile.preferredPort} is already in use`,
            "This approved command has no supported port option. Update its Project Settings profile before starting another run.",
          );
          return;
        }
        const profiles = replaceRetargetedProfile({
          profiles: devServerProfiles,
          originalProfileId: approvedProfile.id,
          retargetedProfile: retargeted,
        });
        profile =
          profiles.find(
            (candidate) =>
              candidate.command === retargeted.command &&
              candidate.workingDirectory === retargeted.workingDirectory &&
              candidate.preferredPort === retargeted.preferredPort,
          ) ?? retargeted;
        updateClientSettings({
          devServerProfilesByProject: {
            ...settings.devServerProfilesByProject,
            [projectKey]: profiles,
          },
        });
      }
      const pane = addPane({
        type: "dev_server",
        title: profile.name,
        terminalId: `dev-${randomUUID()}`,
        devServerProfileId: profile.id,
        previewUrl: profile.previewUrl,
        workspacePath: selectedWorkspacePath,
      });
      if (pane)
        await startProfile(profile, false, pane.terminalId ?? undefined, pane.workspacePath);
    },
    [
      addPane,
      devServerProfiles,
      discoveredServers,
      projectKey,
      selectedWorkspacePath,
      settings.devServerProfilesByProject,
      startProfile,
      updateClientSettings,
    ],
  );

  const stopProfile = useCallback(
    async (profile: DevServerProfile, terminalId = devServerTerminalId(profile.id)) => {
      await closeTerminal({
        environmentId: project.environmentId,
        input: {
          threadId: hostThreadId,
          terminalId,
          deleteHistory: false,
        },
      });
    },
    [closeTerminal, hostThreadId, project.environmentId],
  );

  const attachExternalServer = useCallback(
    (server: DiscoveredLocalServer) => {
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const currentWorkspace = currentState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace?.id,
      );
      const existingDevPane = currentWorkspace?.panes.find(
        (pane) =>
          pane.type === "dev_server" &&
          pane.externalServer?.host === server.host &&
          pane.externalServer.port === server.port,
      );
      if (existingDevPane) {
        if (!existingDevPane.visible)
          updateActiveWorkspace((workspace) => restoreWorkspacePane(workspace, existingDevPane.id));
        const existingPreview = currentWorkspace?.panes.find(
          (pane) => pane.type === "preview" && pane.attachedPaneId === existingDevPane.id,
        );
        if (existingPreview) {
          if (!existingPreview.visible)
            updateActiveWorkspace((workspace) =>
              restoreWorkspacePane(workspace, existingPreview.id),
            );
          setPreviewStagePaneId(existingPreview.id);
        }
        setAddPaneOpen(false);
        return;
      }

      const attachedAt = new Date().toISOString();
      const title = server.processName
        ? `${server.processName} · :${server.port}`
        : `Local server · :${server.port}`;
      const devPane = addPane({
        type: "dev_server",
        title,
        terminalId: null,
        previewUrl: server.url,
        externalServer: {
          host: server.host,
          port: server.port,
          url: server.url,
          pid: server.pid,
          processName: server.processName,
          attachedAt,
        },
        workspacePath: selectedWorkspacePath,
      });
      if (!devPane) return;
      const previewPane = addPane({
        type: "preview",
        title: `${title} Preview`,
        previewUrl: server.url,
        attachedPaneId: devPane.id,
        workspacePath: selectedWorkspacePath,
      });
      if (previewPane) setPreviewStagePaneId(previewPane.id);
      setAddPaneOpen(false);
    },
    [activeWorkspace?.id, addPane, project.id, selectedWorkspacePath, updateActiveWorkspace],
  );

  const detachExternalServer = useCallback(
    (paneId: string) => {
      updateActiveWorkspace((workspace) => removeWorkspacePane(workspace, paneId));
      const stagePreview = activeWorkspace?.panes.find(
        (pane) => pane.type === "preview" && pane.attachedPaneId === paneId,
      );
      if (stagePreview?.id === previewStagePaneId) setPreviewStagePaneId(null);
    },
    [activeWorkspace?.panes, previewStagePaneId, updateActiveWorkspace],
  );

  const startTests = useCallback(
    async (pane: TerminalWorkspacePane) => {
      if (!pane.command || !pane.terminalId) return;
      await openTerminal({
        environmentId: project.environmentId,
        input: {
          threadId: hostThreadId,
          terminalId: pane.terminalId,
          cwd: pane.workspacePath,
          cols: 120,
          rows: 30,
        },
      });
      await writeTerminal({
        environmentId: project.environmentId,
        input: { threadId: hostThreadId, terminalId: pane.terminalId, data: `${pane.command}\r` },
      });
    },
    [hostThreadId, openTerminal, project.environmentId, writeTerminal],
  );

  const createTestsPane = useCallback(() => {
    const command = testCommand.trim();
    if (!command) return;
    const pane = addPane({
      type: "tests",
      title: "Tests",
      terminalId: `tests-${randomUUID()}`,
      command,
    });
    setTestCommand("");
    if (pane) void startTests(pane);
  }, [addPane, startTests, testCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const formControl =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;
      const terminalControl =
        event.target instanceof Element &&
        event.target.closest(
          '[data-pane-type="shell"], [data-pane-type="dev_server"], [data-pane-type="tests"], [data-pane-type="logs"]',
        ) !== null;
      if (event.key === "Escape") {
        if (previewStagePaneId) {
          event.preventDefault();
          setPreviewStagePaneId(null);
          return;
        }
        if (maximizedPaneId) {
          event.preventDefault();
          setMaximizedPaneId(null);
          return;
        }
        if (activeWorkspace?.focusedPaneId) {
          event.preventDefault();
          updateActiveWorkspace((workspace) => ({ ...workspace, focusedPaneId: null }));
        }
        return;
      }
      if ((formControl && !terminalControl) || !(event.metaKey || event.ctrlKey)) return;
      if (event.key === "Enter" && activeWorkspace?.selectedPaneId) {
        event.preventDefault();
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          focusedPaneId: workspace.selectedPaneId,
        }));
      } else if (event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        addPane({ type: "shell", title: "Shell", terminalId: `shell-${randomUUID()}` });
      } else if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void launchProvider("codex");
      } else if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        void launchProvider("antigravity");
      } else if (!event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setAddPaneOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    activeWorkspace?.focusedPaneId,
    activeWorkspace?.selectedPaneId,
    addPane,
    launchProvider,
    maximizedPaneId,
    previewStagePaneId,
    updateActiveWorkspace,
  ]);

  useEffect(() => {
    if (!activeWorkspace || restoredViewportWorkspaceIdRef.current === activeWorkspace.id) return;
    const surface = mainRef.current;
    if (!surface) return;
    restoredViewportWorkspaceIdRef.current = activeWorkspace.id;
    surface.scrollLeft = activeWorkspace.viewport.x;
    surface.scrollTop = activeWorkspace.viewport.y;
  }, [activeWorkspace]);

  useEffect(
    () => () => {
      if (viewportSaveTimerRef.current !== null) {
        window.clearTimeout(viewportSaveTimerRef.current);
      }
    },
    [],
  );

  if (!workspaceState || !activeWorkspace)
    return (
      <SidebarInset className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Preparing the Project Terminal Workspace…
      </SidebarInset>
    );

  const visiblePanes = activeWorkspace.panes.filter((pane) => pane.visible);
  const hiddenPanes = activeWorkspace.panes.filter((pane) => !pane.visible);
  const gridDimensions = terminalWorkspaceGridDimensions(activeWorkspace);
  const focusedPane = activeWorkspace.focusedPaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === activeWorkspace.focusedPaneId) ?? null)
    : null;
  const maximizedPane = maximizedPaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === maximizedPaneId) ?? null)
    : null;
  const isolatedPane = maximizedPane ?? focusedPane;
  const sessionForPane = (pane: TerminalWorkspacePane) =>
    sessions.find(
      (session) =>
        session.target.threadId === hostThreadId && session.target.terminalId === pane.terminalId,
    );
  const serverForPane = (pane: TerminalWorkspacePane) =>
    pane.externalServer
      ? (discoveredServers.find(
          (server) =>
            server.host === pane.externalServer?.host && server.port === pane.externalServer.port,
        ) ?? null)
      : discoveredServerForTerminal({
          servers: discoveredServers,
          threadId: hostThreadId,
          terminalId: pane.terminalId,
        });
  const stagePane = previewStagePaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === previewStagePaneId) ?? null)
    : null;
  const stageProfile = stagePane?.devServerProfileId
    ? (devServerProfiles.find((profile) => profile.id === stagePane.devServerProfileId) ?? null)
    : null;
  const stageDevPane = stagePane?.attachedPaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === stagePane.attachedPaneId) ?? null)
    : stageProfile
      ? (activeWorkspace.panes.find(
          (pane) =>
            pane.type === "dev_server" &&
            pane.devServerProfileId === stageProfile.id &&
            pane.visible,
        ) ?? null)
      : null;
  const stageServer = stageDevPane ? serverForPane(stageDevPane) : null;
  const stageProcessRunning = stageDevPane
    ? sessionForPane(stageDevPane)?.state.hasRunningSubprocess === true
    : false;
  const stageUrl = stageServer?.url || stagePane?.previewUrl || stageProfile?.previewUrl || "";
  const stagePreviewState = stageServer
    ? stageServer.embeddingPolicy === "blocked"
      ? "blocked"
      : "ready"
    : stageProcessRunning
      ? "connecting"
      : stageUrl
        ? "stopped"
        : "idle";
  const providerPanes = visiblePanes.filter(
    (pane) => pane.type === "provider" || pane.type === "thread",
  );
  const selectedStageAgent =
    providerPanes.find((pane) => pane.id === stageAgentPaneId) ?? providerPanes[0] ?? null;

  const renderPaneContent = (pane: TerminalWorkspacePane, active: boolean) => {
    if (pane.type === "shell")
      return (
        <WorkspaceTerminalViewport
          environmentId={project.environmentId}
          hostThreadId={hostThreadId}
          terminalId={pane.terminalId ?? `shell-${pane.id}`}
          cwd={pane.workspacePath}
          title={pane.title}
          autoFocus={active}
          sizeEpoch={pane.grid.rowSpan + pane.grid.columnSpan}
        />
      );
    if (pane.type === "provider" || pane.type === "thread") {
      const thread = pane.threadId ? (threadById.get(ThreadId.make(pane.threadId)) ?? null) : null;
      const entry =
        providerEntries.find(
          (candidate) =>
            candidate.instanceId ===
            (pane.providerInstanceId ?? thread?.modelSelection.instanceId ?? ""),
        ) ?? null;
      return (
        <ProviderPane
          environmentId={project.environmentId}
          thread={thread}
          compact={
            !active &&
            ((activeWorkspace.layout === "grid" &&
              pane.grid.columnSpan === 1 &&
              pane.grid.rowSpan === 1 &&
              (gridDimensions.columns >= 3 || gridDimensions.rows >= 3)) ||
              (activeWorkspace.layout === "freeform" &&
                (pane.freeform.width < 520 || pane.freeform.height < 360)))
          }
          entry={entry}
        />
      );
    }
    if (pane.type === "git")
      return <GitStatusPane environmentId={project.environmentId} cwd={pane.workspacePath} />;
    if (pane.type === "preview") {
      const attachedDevPane = pane.attachedPaneId
        ? (activeWorkspace.panes.find((candidate) => candidate.id === pane.attachedPaneId) ?? null)
        : null;
      const attachedProfile = attachedDevPane?.devServerProfileId
        ? (devServerProfiles.find((profile) => profile.id === attachedDevPane.devServerProfileId) ??
          null)
        : null;
      const liveServer = attachedDevPane ? serverForPane(attachedDevPane) : null;
      const processRunning = attachedDevPane
        ? sessionForPane(attachedDevPane)?.state.hasRunningSubprocess === true
        : false;
      const previewUrl = liveServer?.url ?? pane.previewUrl ?? "";
      return (
        <PreviewSurface
          url={previewUrl}
          title={pane.title}
          refreshKey={previewRefreshKey}
          state={
            liveServer
              ? liveServer.embeddingPolicy === "blocked"
                ? "blocked"
                : "ready"
              : processRunning
                ? "connecting"
                : previewUrl
                  ? "stopped"
                  : "idle"
          }
          onReload={reloadPreview}
          onRestart={
            attachedProfile && attachedDevPane && !attachedDevPane.externalServer
              ? () => {
                  reloadPreview();
                  void startProfile(
                    attachedProfile,
                    true,
                    attachedDevPane.terminalId ?? undefined,
                    attachedDevPane.workspacePath,
                  );
                }
              : undefined
          }
        />
      );
    }
    if (pane.type === "logs")
      return (
        <WorkspaceTerminalViewport
          environmentId={project.environmentId}
          hostThreadId={hostThreadId}
          terminalId={pane.terminalId ?? "logs"}
          cwd={pane.workspacePath}
          title={pane.title}
          autoFocus={false}
          sizeEpoch={pane.grid.rowSpan + pane.grid.columnSpan}
        />
      );
    if (pane.type === "tests")
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 gap-1 border-b border-border/70 p-1.5">
            <Button size="micro" variant="outline" onClick={() => void startTests(pane)}>
              <PlayIcon /> Run
            </Button>
            <Button
              size="micro"
              variant="ghost"
              onClick={() =>
                void closeTerminal({
                  environmentId: project.environmentId,
                  input: { threadId: hostThreadId, terminalId: pane.terminalId ?? undefined },
                })
              }
            >
              <SquareIcon /> Stop
            </Button>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
              {pane.command}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <WorkspaceTerminalViewport
              environmentId={project.environmentId}
              hostThreadId={hostThreadId}
              terminalId={pane.terminalId ?? `tests-${pane.id}`}
              cwd={pane.workspacePath}
              title="Tests"
              autoFocus={active}
              sizeEpoch={pane.grid.rowSpan + pane.grid.columnSpan}
            />
          </div>
        </div>
      );
    const profile = pane.devServerProfileId
      ? (devServerProfiles.find((candidate) => candidate.id === pane.devServerProfileId) ?? null)
      : null;
    const session = sessionForPane(pane);
    const processStatus = describeDevServerStatus({
      status: session?.state.status,
      hasRunningSubprocess: session?.state.hasRunningSubprocess ?? false,
    });
    const liveServer = serverForPane(pane);
    const serverVerified = liveServer !== null;
    const previewUrl = liveServer?.url ?? profile?.previewUrl ?? pane.previewUrl ?? "";
    const status = pane.externalServer
      ? serverVerified
        ? "Running"
        : "Stopped"
      : processStatus === "Running" && !serverVerified
        ? "Starting"
        : processStatus;
    const openPanePreviewStage = () => {
      const existingPreview = activeWorkspace.panes.find(
        (candidate) => candidate.type === "preview" && candidate.attachedPaneId === pane.id,
      );
      if (existingPreview) {
        if (!existingPreview.visible)
          updateActiveWorkspace((workspace) => restoreWorkspacePane(workspace, existingPreview.id));
        setPreviewStagePaneId(existingPreview.id);
        return;
      }
      const preview = addPane({
        type: "preview",
        title: `${pane.title} Preview`,
        previewUrl,
        devServerProfileId: profile?.id ?? null,
        attachedPaneId: pane.id,
        workspacePath: pane.workspacePath,
      });
      if (preview) setPreviewStagePaneId(preview.id);
    };
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/70 p-1.5">
          <span
            className={`mr-1 text-[10px] ${status === "Running" ? "text-emerald-500" : "text-muted-foreground"}`}
          >
            {status}
          </span>
          {profile ? (
            <>
              <Button
                size="micro"
                variant="outline"
                onClick={() =>
                  void startProfile(
                    profile,
                    false,
                    pane.terminalId ?? undefined,
                    pane.workspacePath,
                  )
                }
              >
                <PlayIcon /> Start
              </Button>
              <Button
                size="micro"
                variant="ghost"
                onClick={() => void stopProfile(profile, pane.terminalId ?? undefined)}
              >
                <SquareIcon /> Stop
              </Button>
              <Button
                size="micro"
                variant="ghost"
                onClick={() =>
                  void startProfile(profile, true, pane.terminalId ?? undefined, pane.workspacePath)
                }
              >
                <RotateCcwIcon /> Restart
              </Button>
              {previewUrl ? (
                <Button
                  size="micro"
                  variant="ghost"
                  disabled={!serverVerified}
                  onClick={openPanePreviewStage}
                >
                  <EyeIcon /> Preview Stage
                </Button>
              ) : null}
            </>
          ) : pane.externalServer ? (
            <>
              <Button
                size="micro"
                variant="ghost"
                disabled={!serverVerified}
                onClick={openPanePreviewStage}
              >
                <EyeIcon /> Preview Stage
              </Button>
              <Button
                size="micro"
                variant="ghost"
                disabled={!previewUrl}
                onClick={() => openExternal(previewUrl)}
              >
                <ExternalLinkIcon /> Open Browser
              </Button>
              <Button size="micro" variant="ghost" onClick={() => detachExternalServer(pane.id)}>
                <UnlinkIcon /> Detach
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Profile unavailable</span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {pane.externalServer ? (
            <div className="grid h-full place-items-center bg-muted/10 p-5 text-center">
              <div className="max-w-sm">
                <LinkIcon className="mx-auto size-6 text-primary" />
                <p className="mt-3 text-sm font-medium">Attached existing server</p>
                <p className="mt-1 font-mono text-xs text-primary">{previewUrl}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {serverVerified
                    ? "HTTP is reachable. Nebula can preview this server but will not stop or restart it."
                    : "The server is not reachable. Retry when the external process is running again."}
                </p>
                {pane.externalServer.processName || pane.externalServer.pid ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {[
                      pane.externalServer.processName,
                      pane.externalServer.pid && `PID ${pane.externalServer.pid}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <WorkspaceTerminalViewport
              environmentId={project.environmentId}
              hostThreadId={hostThreadId}
              terminalId={pane.terminalId ?? `dev-${pane.id}`}
              cwd={pane.workspacePath}
              title={pane.title}
              statusLabel={status}
              autoFocus={false}
              sizeEpoch={pane.grid.rowSpan + pane.grid.columnSpan}
            />
          )}
        </div>
      </div>
    );
  };

  if (stagePane)
    return (
      <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <WorkspacePageHeader className="border-b border-border bg-background">
          <Button size="xs" variant="ghost" onClick={() => setPreviewStagePaneId(null)}>
            <ChevronLeftIcon /> Return to Workspace
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Preview Stage · {displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {project.repositoryIdentity?.displayName ?? "Current checkout"} ·{" "}
              {stageUrl || "No URL"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {stageProfile ? `Dev Server · ${stageProfile.name}` : "Attached Preview"}
          </span>
          <Button size="xs" variant="ghost" onClick={() => setPreviewRefreshKey((key) => key + 1)}>
            <RefreshCwIcon /> Reload
          </Button>
          {stageProfile ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void (async () => {
                  reloadPreview();
                  await startProfile(
                    stageProfile,
                    true,
                    stageDevPane?.terminalId ?? undefined,
                    stageDevPane?.workspacePath ?? project.workspaceRoot,
                  );
                })()
              }
            >
              <RotateCcwIcon /> Restart Server
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            disabled={!stageUrl}
            onClick={() => openExternal(stageUrl)}
          >
            <ExternalLinkIcon /> Open Browser
          </Button>
        </WorkspacePageHeader>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,3fr)_minmax(220px,1fr)] gap-2 p-2 lg:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)] lg:grid-rows-1">
          <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <PreviewSurface
              url={stageUrl}
              title="Preview Stage"
              refreshKey={previewRefreshKey}
              state={stagePreviewState}
              onReload={reloadPreview}
              onRestart={
                stageProfile && stageDevPane && !stageDevPane.externalServer
                  ? () => {
                      reloadPreview();
                      void startProfile(
                        stageProfile,
                        true,
                        stageDevPane.terminalId ?? undefined,
                        stageDevPane.workspacePath,
                      );
                    }
                  : undefined
              }
            />
          </div>
          <div className="grid min-h-0 grid-cols-2 gap-2 lg:grid-cols-1 lg:grid-rows-2">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
                <BotIcon className="size-3.5" />
                <span className="text-xs font-medium">Active Agent</span>
                <select
                  aria-label="Pin active agent"
                  value={selectedStageAgent?.id ?? ""}
                  onChange={(event) => setStageAgentPaneId(event.currentTarget.value)}
                  className="ml-auto max-w-40 rounded border border-border bg-background px-1.5 py-1 text-[10px]"
                >
                  {providerPanes.map((pane) => (
                    <option key={pane.id} value={pane.id}>
                      {pane.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-h-0 flex-1">
                {selectedStageAgent ? (
                  renderPaneContent(selectedStageAgent, true)
                ) : (
                  <div className="grid h-full place-items-center p-4 text-xs text-muted-foreground">
                    Add a Codex or Antigravity pane to pin it beside Preview.
                  </div>
                )}
              </div>
            </section>
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-xs font-medium">
                <FileClockIcon className="size-3.5" /> Dev Logs
              </div>
              <div className="min-h-0 flex-1">
                {stageProfile ? (
                  <WorkspaceTerminalViewport
                    environmentId={project.environmentId}
                    hostThreadId={hostThreadId}
                    terminalId={stageDevPane?.terminalId ?? devServerTerminalId(stageProfile.id)}
                    cwd={stageDevPane?.workspacePath ?? project.workspaceRoot}
                    title="Dev Logs"
                    statusLabel={
                      stageServer ? "Running" : stageProcessRunning ? "Starting" : "Stopped"
                    }
                    autoFocus={false}
                    sizeEpoch={2}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    No Dev Server logs attached.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </SidebarInset>
    );

  return (
    <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader className="border-b border-border bg-background">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{displayName} Terminal Workspace</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Live terminals, agents, servers, tests, and previews · UI composition, not a Git
            worktree
          </p>
        </div>
        <div className="flex items-center rounded-md border border-border bg-muted/20 p-0.5">
          {activeWorkspace.layout === "grid" ? (
            <label className="mr-1 flex items-center gap-1.5 pl-2 text-[10px] text-muted-foreground">
              Layout
              <select
                aria-label="Grid density"
                value={activeWorkspace.gridPreset}
                onChange={(event) => {
                  const preset = event.currentTarget.value as TerminalWorkspaceGridPreset;
                  updateActiveWorkspace((workspace) => {
                    const reflowed = reflowWorkspaceGrid(workspace, preset);
                    if (reflowed === workspace && workspace.gridPreset !== preset) {
                      reportError(
                        "That grid is too small",
                        "Hide a pane or choose a layout with more cells.",
                      );
                    }
                    return reflowed;
                  });
                }}
                className="h-7 rounded border border-border bg-background px-1.5 text-[11px] text-foreground"
              >
                {TERMINAL_WORKSPACE_GRID_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset === "auto" ? "Auto" : preset.replace("x", "×")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            size="xs"
            variant={activeWorkspace.layout === "grid" ? "secondary" : "ghost"}
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                layout: "grid",
                focusedPaneId: null,
              }))
            }
          >
            <Grid2X2Icon /> Grid
          </Button>
          <Button
            size="xs"
            variant={activeWorkspace.layout === "freeform" ? "secondary" : "ghost"}
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                layout: "freeform",
                focusedPaneId: null,
              }))
            }
          >
            <AppWindowIcon /> Freeform
          </Button>
          <Button
            size="xs"
            variant={activeWorkspace.layout === "split" ? "secondary" : "ghost"}
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                layout: "split",
                splitDirection: "horizontal",
                focusedPaneId: null,
              }))
            }
          >
            <Columns2Icon /> Split View
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!activeWorkspace.selectedPaneId}
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                focusedPaneId: workspace.selectedPaneId,
              }))
            }
          >
            <FocusIcon /> Focus
          </Button>
        </div>
        <Button size="xs" onClick={() => setAddPaneOpen(true)}>
          <PlusIcon /> New Pane
        </Button>
      </WorkspacePageHeader>

      <nav
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/15 px-3 py-2"
        aria-label="Project tabs"
      >
        <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/terminal-center" })}>
          All Projects
        </Button>
        {groups.map((group) => (
          <Button
            key={group.projectKey}
            size="xs"
            variant={group.projectKey === projectKey ? "secondary" : "ghost"}
            onClick={() =>
              void navigate({
                to: "/projects/$projectKey/terminal-center",
                params: { projectKey: group.projectKey },
              })
            }
          >
            {group.displayName}
          </Button>
        ))}
      </nav>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        {workspaceState.workspaces.map((workspace) => (
          <Button
            key={workspace.id}
            size="xs"
            variant={workspace.id === activeWorkspace.id ? "secondary" : "ghost"}
            onClick={() =>
              persistProjectState({ ...workspaceState, activeWorkspaceId: workspace.id })
            }
          >
            {workspace.name}
          </Button>
        ))}
        <Button size="xs" variant="ghost" onClick={() => setNewWorkspaceOpen(true)}>
          <PlusIcon /> New Workspace
        </Button>
      </div>

      <div
        ref={mainRef}
        className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--muted-foreground)_14%,transparent)_1px,transparent_0)] [background-size:24px_24px]"
        onScroll={(event) => {
          const x = event.currentTarget.scrollLeft;
          const y = event.currentTarget.scrollTop;
          if (viewportSaveTimerRef.current !== null) {
            window.clearTimeout(viewportSaveTimerRef.current);
          }
          viewportSaveTimerRef.current = window.setTimeout(() => {
            viewportSaveTimerRef.current = null;
            updateActiveWorkspace((workspace) => ({
              ...workspace,
              viewport: { ...workspace.viewport, x, y },
              updatedAt: new Date().toISOString(),
            }));
          }, 120);
        }}
        onPointerMove={(event) => {
          if (freeformDrag) {
            const next = {
              ...freeformDrag,
              x: Math.max(0, freeformDrag.originX + event.clientX - freeformDrag.startX),
              y: Math.max(0, freeformDrag.originY + event.clientY - freeformDrag.startY),
            };
            freeformDragRef.current = next;
            setFreeformDrag(next);
          }
          if (gridResize) {
            const pane = activeWorkspace.panes.find(
              (candidate) => candidate.id === gridResize.paneId,
            );
            const bounds = gridRef.current?.getBoundingClientRect();
            if (!pane || !bounds) return;
            const columnWidth = bounds.width / gridDimensions.columns;
            const rowHeight = bounds.height / gridDimensions.rows;
            const next = {
              ...gridResize,
              columnSpan: Math.min(
                gridDimensions.columns - pane.grid.column + 1,
                Math.max(
                  1,
                  gridResize.originColumnSpan +
                    Math.round((event.clientX - gridResize.startX) / columnWidth),
                ),
              ),
              rowSpan: Math.min(
                gridDimensions.rows - pane.grid.row + 1,
                Math.max(
                  1,
                  gridResize.originRowSpan +
                    Math.round((event.clientY - gridResize.startY) / rowHeight),
                ),
              ),
            };
            gridResizeRef.current = next;
            setGridResize(next);
          }
        }}
        onPointerUp={() => {
          const drag = freeformDragRef.current;
          if (drag) {
            updateActiveWorkspace((workspace) => ({
              ...workspace,
              panes: workspace.panes.map((pane) =>
                pane.id === drag.paneId
                  ? {
                      ...pane,
                      freeform: { ...pane.freeform, x: drag.x, y: drag.y },
                      updatedAt: new Date().toISOString(),
                    }
                  : pane,
              ),
            }));
          }
          freeformDragRef.current = null;
          setFreeformDrag(null);
          const resize = gridResizeRef.current;
          if (resize) {
            updateActiveWorkspace((workspace) => {
              const pane = workspace.panes.find((candidate) => candidate.id === resize.paneId);
              return pane
                ? movePaneToGrid(workspace, pane.id, {
                    ...pane.grid,
                    columnSpan: resize.columnSpan,
                    rowSpan: resize.rowSpan,
                  })
                : workspace;
            });
          }
          gridResizeRef.current = null;
          setGridResize(null);
        }}
      >
        <div
          ref={gridRef}
          className={
            isolatedPane
              ? "absolute inset-0 p-2"
              : activeWorkspace.layout === "grid"
                ? "grid h-full gap-2 p-2"
                : activeWorkspace.layout === "split"
                  ? `grid h-full min-h-[520px] gap-2 p-2 ${activeWorkspace.splitDirection === "horizontal" ? "grid-flow-col auto-cols-fr" : "grid-flow-row auto-rows-fr"}`
                  : "relative h-full min-h-[720px] min-w-[960px]"
          }
          style={
            !isolatedPane && activeWorkspace.layout === "grid"
              ? {
                  gridTemplateColumns: `repeat(${gridDimensions.columns}, minmax(240px, 1fr))`,
                  gridTemplateRows: `repeat(${gridDimensions.rows}, minmax(180px, 1fr))`,
                  minWidth: gridDimensions.columns * 252,
                  minHeight: Math.max(520, gridDimensions.rows * 192),
                }
              : undefined
          }
        >
          {!isolatedPane && activeWorkspace.layout === "grid"
            ? Array.from({ length: gridDimensions.columns * gridDimensions.rows }, (_, index) => {
                const column = (index % gridDimensions.columns) + 1;
                const row = Math.floor(index / gridDimensions.columns) + 1;
                const occupied = visiblePanes.some(
                  (pane) =>
                    column >= pane.grid.column &&
                    column < pane.grid.column + pane.grid.columnSpan &&
                    row >= pane.grid.row &&
                    row < pane.grid.row + pane.grid.rowSpan,
                );
                if (occupied) return null;
                return (
                  <button
                    key={`${column}:${row}`}
                    type="button"
                    aria-label={`Add pane at column ${column}, row ${row}`}
                    className={`group z-0 grid min-h-28 place-items-center rounded-xl border border-dashed bg-card/25 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${draggingPaneId ? "border-primary/60 bg-primary/5 text-foreground" : "border-border/70 hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"}`}
                    style={{ gridColumn: column, gridRow: row }}
                    onClick={() => {
                      setAddAt({ column, row });
                      setAddPaneOpen(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const paneId =
                        event.dataTransfer.getData("application/x-nebula-pane") || draggingPaneId;
                      if (!paneId) return;
                      updateActiveWorkspace((workspace) => {
                        const pane = workspace.panes.find((candidate) => candidate.id === paneId);
                        return pane
                          ? movePaneToGrid(workspace, paneId, {
                              column,
                              row,
                              columnSpan: pane.grid.columnSpan,
                              rowSpan: pane.grid.rowSpan,
                            })
                          : workspace;
                      });
                      setDraggingPaneId(null);
                    }}
                  >
                    <span className="flex flex-col items-center gap-2">
                      <PlusIcon className="size-5" /> Add pane
                    </span>
                  </button>
                );
              })
            : null}

          {(isolatedPane ? [isolatedPane] : visiblePanes).map((pane) => {
            const selected = activeWorkspace.selectedPaneId === pane.id;
            const thread = pane.threadId ? threadById.get(ThreadId.make(pane.threadId)) : null;
            const working =
              thread?.latestTurn?.state === "running" ||
              sessionForPane(pane)?.state.hasRunningSubprocess === true;
            const paneStyle = isolatedPane
              ? undefined
              : activeWorkspace.layout === "grid"
                ? {
                    gridColumn: `${pane.grid.column} / span ${gridResize?.paneId === pane.id ? gridResize.columnSpan : pane.grid.columnSpan}`,
                    gridRow: `${pane.grid.row} / span ${gridResize?.paneId === pane.id ? gridResize.rowSpan : pane.grid.rowSpan}`,
                  }
                : activeWorkspace.layout === "freeform"
                  ? {
                      position: "absolute" as const,
                      left: freeformDrag?.paneId === pane.id ? freeformDrag.x : pane.freeform.x,
                      top: freeformDrag?.paneId === pane.id ? freeformDrag.y : pane.freeform.y,
                      width: pane.freeform.width,
                      height: pane.freeform.height,
                      zIndex: selected ? 100 : pane.freeform.z,
                    }
                  : undefined;
            return (
              <article
                key={pane.id}
                data-terminal-workspace-pane={pane.id}
                data-pane-type={pane.type}
                tabIndex={0}
                aria-label={`${pane.title} pane`}
                className={`relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-[grid-column,grid-row,transform] duration-200 motion-reduce:transition-none ${selected ? "border-primary ring-1 ring-primary/35" : "border-border"}`}
                style={paneStyle}
                onFocus={() =>
                  updateActiveWorkspace((workspace) => ({ ...workspace, selectedPaneId: pane.id }))
                }
              >
                <div
                  onPointerDown={(event) => {
                    if (activeWorkspace.layout !== "freeform") return;
                    if (
                      event.target instanceof Element &&
                      event.target.closest("button, input, select, textarea")
                    )
                      return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const drag = {
                      paneId: pane.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: pane.freeform.x,
                      originY: pane.freeform.y,
                      x: pane.freeform.x,
                      y: pane.freeform.y,
                    };
                    freeformDragRef.current = drag;
                    setFreeformDrag(drag);
                  }}
                >
                  <PaneHeader
                    pane={pane}
                    selected={selected}
                    working={working}
                    maximized={maximizedPaneId === pane.id}
                    draggable={activeWorkspace.layout === "grid"}
                    onSelect={() =>
                      updateActiveWorkspace((workspace) => ({
                        ...workspace,
                        selectedPaneId: pane.id,
                      }))
                    }
                    onFocus={() =>
                      updateActiveWorkspace((workspace) => ({
                        ...workspace,
                        focusedPaneId: pane.id,
                        selectedPaneId: pane.id,
                      }))
                    }
                    onMaximize={() =>
                      setMaximizedPaneId((current) => (current === pane.id ? null : pane.id))
                    }
                    onHide={() =>
                      updateActiveWorkspace((workspace) => hideWorkspacePane(workspace, pane.id))
                    }
                    onResize={() => {
                      if (activeWorkspace.layout === "freeform") {
                        updateActiveWorkspace((workspace) => ({
                          ...workspace,
                          panes: workspace.panes.map((candidate) =>
                            candidate.id === pane.id
                              ? {
                                  ...candidate,
                                  freeform: {
                                    ...candidate.freeform,
                                    width:
                                      candidate.freeform.width >= 840
                                        ? 480
                                        : candidate.freeform.width + 180,
                                    height:
                                      candidate.freeform.height >= 620
                                        ? 300
                                        : candidate.freeform.height + 120,
                                  },
                                }
                              : candidate,
                          ),
                        }));
                        return;
                      }
                      const sizes: Array<
                        Pick<TerminalWorkspaceGridPlacement, "columnSpan" | "rowSpan">
                      > = [
                        { columnSpan: 1, rowSpan: 1 },
                        { columnSpan: 2, rowSpan: 1 },
                        { columnSpan: 2, rowSpan: 2 },
                        { columnSpan: 4, rowSpan: 2 },
                        { columnSpan: 4, rowSpan: 4 },
                      ];
                      const index = sizes.findIndex(
                        (size) =>
                          size.columnSpan === pane.grid.columnSpan &&
                          size.rowSpan === pane.grid.rowSpan,
                      );
                      const next = sizes[(index + 1) % sizes.length]!;
                      updateActiveWorkspace((workspace) =>
                        movePaneToGrid(workspace, pane.id, { ...pane.grid, ...next }),
                      );
                    }}
                    onDragStart={(event) => {
                      setDraggingPaneId(pane.id);
                      event.dataTransfer.setData("application/x-nebula-pane", pane.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingPaneId(null)}
                  />
                </div>
                <div
                  className="min-h-0 flex-1"
                  onMouseDown={() =>
                    updateActiveWorkspace((workspace) => ({
                      ...workspace,
                      selectedPaneId: pane.id,
                    }))
                  }
                >
                  {renderPaneContent(pane, selected || Boolean(isolatedPane))}
                </div>
                {!isolatedPane && activeWorkspace.layout === "grid" ? (
                  <button
                    type="button"
                    aria-label={`Resize ${pane.title} by dragging`}
                    className="absolute bottom-0 right-0 z-30 grid size-5 cursor-nwse-resize place-items-center rounded-tl border-l border-t border-border/70 bg-background/85 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const resize = {
                        paneId: pane.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        originColumnSpan: pane.grid.columnSpan,
                        originRowSpan: pane.grid.rowSpan,
                        columnSpan: pane.grid.columnSpan,
                        rowSpan: pane.grid.rowSpan,
                      };
                      gridResizeRef.current = resize;
                      setGridResize(resize);
                    }}
                  >
                    <Maximize2Icon className="size-3" aria-hidden />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <footer className="flex min-h-10 shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{visiblePanes.length} visible panes</span>
        <span>·</span>
        <span>
          {sessions.filter((session) => session.state.hasRunningSubprocess).length} active processes
        </span>
        {activeWorkspace.layout === "split" ? (
          <>
            <Button
              size="micro"
              variant="ghost"
              onClick={() =>
                updateActiveWorkspace((workspace) => ({
                  ...workspace,
                  splitDirection: "horizontal",
                }))
              }
            >
              <Columns2Icon /> Split Right
            </Button>
            <Button
              size="micro"
              variant="ghost"
              onClick={() =>
                updateActiveWorkspace((workspace) => ({ ...workspace, splitDirection: "vertical" }))
              }
            >
              <Rows2Icon /> Split Down
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {hiddenPanes.length > 0 ? (
            <details className="relative">
              <summary className="cursor-pointer rounded px-2 py-1 hover:bg-muted">
                Hidden panes ({hiddenPanes.length})
              </summary>
              <div className="absolute bottom-8 right-0 z-[150] min-w-56 rounded-lg border border-border bg-popover p-2 shadow-xl">
                {hiddenPanes.map((pane) => (
                  <button
                    key={pane.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() =>
                      updateActiveWorkspace((workspace) => restoreWorkspacePane(workspace, pane.id))
                    }
                  >
                    <span>{pane.title}</span>
                    <span className="text-muted-foreground">Restore</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <span>⌘N New Pane · ⇧⌘T Shell · ⇧⌘C Codex · ⇧⌘A Antigravity · ⌘Enter Focus</span>
        </div>
      </footer>

      <Sheet open={addPaneOpen} onOpenChange={setAddPaneOpen}>
        <SheetPopup side="right" className="max-w-[28rem] border-l border-border bg-popover/98">
          <SheetHeader className="border-b border-border/70 pb-4">
            <SheetTitle className="text-lg">Add to Workspace</SheetTitle>
            <SheetDescription>
              Bring live tools, approved processes, and canonical Threads into{" "}
              {activeWorkspace.name}.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="space-y-6 px-5 pb-8">
            <section>
              <p className="mb-2 text-[11px] font-medium text-primary">Live</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Interactive surfaces for building and collaborating.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() =>
                    addPane({
                      type: "shell",
                      title: "Shell",
                      terminalId: `shell-${randomUUID()}`,
                    })
                  }
                >
                  <TerminalSquareIcon className="text-primary" />
                  <span className="text-xs">Terminal</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => void launchProvider("codex")}
                >
                  <BotIcon className="text-primary" />
                  <span className="text-xs">Codex</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => void launchProvider("antigravity")}
                >
                  <BotIcon className="text-primary" />
                  <span className="text-xs">Antigravity</span>
                </Button>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-medium text-primary">Run</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Start and manage explicitly approved processes.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() =>
                    devServerProfiles.length > 0
                      ? void addApprovedDevServer(devServerProfiles[0]!)
                      : document
                          .getElementById("detected-dev-server")
                          ?.scrollIntoView({ block: "center", behavior: "smooth" })
                  }
                >
                  <AppWindowIcon className="text-primary" />
                  <span className="text-xs">Dev Server</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => document.getElementById("terminal-tests-command")?.focus()}
                >
                  <FlaskConicalIcon className="text-primary" />
                  <span className="text-xs">Tests</span>
                </Button>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-muted/15 p-3">
                <label className="text-xs font-medium" htmlFor="terminal-tests-command">
                  Approved test command
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="terminal-tests-command"
                    value={testCommand}
                    onChange={(event) => setTestCommand(event.currentTarget.value)}
                    placeholder="npm test -- --watch"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                  />
                  <Button size="xs" disabled={!testCommand.trim()} onClick={createTestsPane}>
                    Approve & Run
                  </Button>
                </div>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-medium text-primary">View</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Inspect a running app, repository state, or process output.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  disabled={!activeWorkspace.panes.some((pane) => pane.type === "dev_server")}
                  onClick={() => {
                    const devPane = activeWorkspace.panes.find(
                      (pane) => pane.type === "dev_server",
                    );
                    if (!devPane) return;
                    const profile = devServerProfiles.find(
                      (candidate) => candidate.id === devPane.devServerProfileId,
                    );
                    addPane({
                      type: "preview",
                      title: `${devPane.title} Preview`,
                      previewUrl: serverForPane(devPane)?.url ?? profile?.previewUrl ?? "",
                      devServerProfileId: devPane.devServerProfileId,
                      attachedPaneId: devPane.id,
                      workspacePath: devPane.workspacePath,
                    });
                  }}
                >
                  <EyeIcon className="text-primary" />
                  <span className="text-xs">Preview</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => addPane({ type: "git", title: "Git / Diff" })}
                >
                  <GitBranchIcon className="text-primary" />
                  <span className="text-xs">Git / Diff</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  disabled={!activeWorkspace.panes.some((pane) => pane.type === "dev_server")}
                  onClick={() => {
                    const devPane = activeWorkspace.panes.find(
                      (pane) => pane.type === "dev_server",
                    );
                    if (!devPane) return;
                    addPane({
                      type: "logs",
                      title: `${devPane.title} Logs`,
                      terminalId: devPane.terminalId,
                      devServerProfileId: devPane.devServerProfileId,
                      attachedPaneId: devPane.id,
                      workspacePath: devPane.workspacePath,
                    });
                  }}
                >
                  <FileClockIcon className="text-primary" />
                  <span className="text-xs">Logs</span>
                </Button>
              </div>
            </section>

            <section id="detected-dev-server">
              <p className="mb-3 text-[11px] font-medium text-primary">Detected Dev Server</p>
              <div className="rounded-xl border border-border bg-muted/15 p-3">
                {suggestions[0] ? (
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background">
                      <AppWindowIcon className="size-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium">{suggestions[0].name}</p>
                        <span className="text-[10px] text-emerald-500">Ready to start</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-primary">
                        {suggestions[0].command}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Working directory: {suggestions[0].workingDirectory}
                      </p>
                    </div>
                    <Button size="xs" onClick={() => void approveSuggestion(suggestions[0]!)}>
                      <PlayIcon /> Approve & Start
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No supported dev command was detected. Add one in Project Settings.
                  </p>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-medium text-primary">Existing Local Servers</p>
                <span className="text-[10px] text-muted-foreground">Explicit attachment</span>
              </div>
              <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-border bg-muted/10 p-2">
                {discoveredServers.map((server) => {
                  const attachedPane = activeWorkspace.panes.find(
                    (pane) =>
                      pane.type === "dev_server" &&
                      pane.externalServer?.host === server.host &&
                      pane.externalServer.port === server.port,
                  );
                  const managedByThisWorkspace =
                    server.terminal?.threadId === hostThreadId && server.terminal.terminalId;
                  return (
                    <div
                      key={`${server.host}:${server.port}`}
                      className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/60 p-2.5"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/30">
                        <LinkIcon className="size-4 text-primary" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-medium">
                            {server.processName ?? "Local web server"}
                          </p>
                          <span
                            className={`shrink-0 text-[10px] ${server.embeddingPolicy === "blocked" ? "text-amber-500" : "text-emerald-500"}`}
                          >
                            {server.embeddingPolicy === "blocked" ? "Browser only" : "HTTP ready"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {server.url}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {managedByThisWorkspace
                            ? "Managed by this Workspace"
                            : server.pid
                              ? `External process · PID ${server.pid}`
                              : "External local process"}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant={attachedPane ? "ghost" : "outline"}
                        disabled={Boolean(attachedPane || managedByThisWorkspace)}
                        onClick={() => attachExternalServer(server)}
                      >
                        <LinkIcon />
                        {attachedPane
                          ? "Attached"
                          : managedByThisWorkspace
                            ? "Managed"
                            : "Attach & Preview"}
                      </Button>
                    </div>
                  );
                })}
                {discoveredServers.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No HTTP-ready local servers detected.
                  </p>
                ) : null}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Attached servers remain externally owned. Nebula can preview or detach them, but
                cannot stop or restart their process.
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-medium text-primary">Existing Sessions</p>
                <span className="text-[10px] text-muted-foreground">Canonical Threads</span>
              </div>
              <div className="max-h-72 space-y-1 overflow-auto rounded-xl border border-border bg-muted/10 p-2">
                {projectThreads.map((thread) => {
                  const existingPane = activeWorkspace.panes.find(
                    (pane) => pane.threadId === thread.id,
                  );
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted disabled:opacity-50"
                      disabled={existingPane?.visible === true}
                      onClick={() => {
                        if (existingPane)
                          updateActiveWorkspace((workspace) =>
                            restoreWorkspacePane(workspace, existingPane.id),
                          );
                        else
                          addPane({
                            type: "thread",
                            title: thread.title,
                            threadId: thread.id,
                            providerInstanceId: thread.modelSelection.instanceId,
                            workspacePath: thread.worktreePath ?? project.workspaceRoot,
                          });
                        setAddPaneOpen(false);
                      }}
                    >
                      <BotIcon className="size-4" />
                      <span className="min-w-0 flex-1 truncate text-xs">{thread.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {existingPane?.visible
                          ? "Added"
                          : existingPane
                            ? "Restore"
                            : thread.modelSelection.model}
                      </span>
                    </button>
                  );
                })}
                {projectThreads.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    No existing Threads yet.
                  </p>
                ) : null}
              </div>
            </section>
          </SheetPanel>
        </SheetPopup>
      </Sheet>

      <Dialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen}>
        <DialogPopup>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>New Terminal Workspace</DialogTitle>
              <DialogDescription>
                A Workspace remembers its own panes, layout, selection, and viewport. It is not a
                Git worktree.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm" htmlFor="workspace-name">
                Name
              </label>
              <input
                id="workspace-name"
                autoFocus
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.currentTarget.value)}
                placeholder="Auth Refactor"
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewWorkspaceOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!newWorkspaceName.trim()}
                onClick={() => {
                  const created = createDefaultTerminalWorkspaceProjectState({
                    projectId: `${project.id}:${randomUUID()}`,
                    workspacePath: project.workspaceRoot,
                  });
                  const workspace = { ...created.workspaces[0]!, name: newWorkspaceName.trim() };
                  persistProjectState({
                    ...workspaceState,
                    activeWorkspaceId: workspace.id,
                    workspaces: [...workspaceState.workspaces, workspace],
                  });
                  setNewWorkspaceName("");
                  setNewWorkspaceOpen(false);
                }}
              >
                Create Workspace
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
