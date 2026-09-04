import { resolveAgentWorkspace } from "./agentWorkspace";
import { useAtomValue } from "@effect/atom-react";
import {
  EnvironmentId,
  TaskId,
  ThreadId,
  type DevServerProfile,
  type DiscoveredLocalServer,
  type NebulaTaskRole,
  type OrchestrationTask,
  type OrchestrationThreadShell,
  type PreviewAnnotationPayload,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  AppWindowIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  Columns2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileCode2Icon,
  FileDiffIcon,
  FileClockIcon,
  FlaskConicalIcon,
  FocusIcon,
  GitBranchIcon,
  Grid2X2Icon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  LinkIcon,
  ListChecksIcon,
  Maximize2Icon,
  MessageSquareIcon,
  MousePointer2Icon,
  Minimize2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Rows2Icon,
  SendIcon,
  SearchIcon,
  SquareIcon,
  TerminalSquareIcon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

import { readLocalApi } from "../../localApi";
import { useComposerDraftStore } from "../../composerDraftStore";
import { buildPreviewAnnotationPrompt } from "../../lib/previewAnnotation";
import { newMessageId, newTaskId, randomUUID, newThreadId } from "../../lib/utils";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { environmentSnapshotAtom } from "../../state/shell";
import { useServerConfigs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { terminalEnvironment } from "../../state/terminal";
import { taskEnvironment } from "../../state/tasks";
import { previewEnvironment } from "../../state/preview";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { threadEnvironment } from "../../state/threads";
import { vcsEnvironment } from "../../state/vcs";
import { reviewEnvironment } from "../../state/review";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePrimarySettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useUiStateStore } from "../../uiStateStore";
import { useProjectFilePickerQuery, useProjectFileQuery } from "../files/projectFilesQueryState";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { StyledDiffCodeView } from "../diffs/StyledDiffCodeView";
import { PreviewView } from "../preview/PreviewView";
import { openPreviewSession } from "../preview/openPreviewSession";
import { isPreviewSupportedInRuntime, useThreadPreviewState } from "../../previewStateStore";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
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
import { useTheme } from "../../hooks/useTheme";
import {
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../lib/diffRendering";
import {
  TaskChangesPanel,
  TaskCreateFields,
  ownershipDraftsValid,
  ownershipRulesFromDrafts,
  taskOwnershipContext,
  type OwnershipRuleDraft,
} from "../ProjectTasksSection";
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
  activateAgentSurfaceView,
  activateWorkspaceLayoutPane,
  applyWorkspaceLayoutPreset,
  firstAvailableGridPlacement,
  hideWorkspacePane,
  isWorkspacePaneOnBottomEdge,
  linkAgentPaneViews,
  migrateTerminalCanvasToWorkspace,
  movePaneInWorkspaceLayout,
  movePaneToGrid,
  normalizeWorkspaceLayoutTree,
  providerTerminalLaunchSpec,
  removeEmptyWorkspaceLayoutSlot,
  removeWorkspacePane,
  resizeWorkspaceFloor,
  resizeWorkspaceLayoutSplit,
  resolveWorkspacePaneResizeBindings,
  resolveTerminalWorkspaceProjectServices,
  restoreWorkspacePane,
  setWorkspacePaneFormat,
  terminalWorkspaceGridDimensions,
  terminalWorkspaceHostThreadId,
  updateWorkspace,
  type TerminalWorkspace,
  type TerminalWorkspaceGridPlacement,
  type TerminalWorkspacePane,
  type TerminalWorkspacePaneType,
  type TerminalWorkspaceLayoutNode,
  type TerminalWorkspaceLayoutPreset,
  type TerminalWorkspacePaneResizeBinding,
  type TerminalWorkspaceProjectService,
  type TerminalWorkspaceProjectState,
  TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS,
  TERMINAL_WORKSPACE_LAYOUT_PRESET_GROUPS,
} from "./terminalWorkspace";
import { WorkspaceTerminalViewport } from "./WorkspaceTerminalViewport";
import { TaskInspector } from "./TaskInspector";

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

interface DesignPreviewBinding {
  readonly workspaceId: string;
  readonly paneId: string | null;
  readonly url: string;
  readonly title: string;
  readonly returnMode: "workbench" | "preview" | "build_preview";
}

const TERMINAL_WORKSPACE_SPLIT_GUTTER_PX = 10;

function beginTerminalWorkspaceResize(cursor: "col-resize" | "row-resize") {
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  return () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
  };
}

function ResizeHandle({
  direction,
  label,
  onPointerDown,
  onKeyDown,
}: {
  readonly direction: "horizontal" | "vertical";
  readonly label: string;
  readonly onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`group relative z-40 grid touch-none place-items-center bg-border/45 outline-none transition-colors hover:bg-primary/45 focus-visible:bg-primary/55 ${direction === "horizontal" ? "h-full w-2.5 cursor-col-resize" : "h-2.5 w-full cursor-row-resize"}`}
    >
      <span
        className={`rounded-full bg-muted-foreground/55 transition-[width,height,background-color] duration-150 group-hover:bg-primary-foreground group-focus-visible:bg-primary-foreground ${direction === "horizontal" ? "h-12 w-0.5 group-hover:w-1 group-focus-visible:w-1" : "h-0.5 w-12 group-hover:h-1 group-focus-visible:h-1"}`}
      />
    </button>
  );
}

function ResizablePair({
  nodeId,
  direction,
  ratio,
  minRatio,
  maxRatio,
  onCommit,
  first,
  second,
  label,
  className = "",
}: {
  readonly nodeId?: string;
  readonly direction: "horizontal" | "vertical";
  readonly ratio: number;
  readonly minRatio: number;
  readonly maxRatio: number;
  readonly onCommit: (ratio: number) => void;
  readonly first: ReactNode;
  readonly second: ReactNode;
  readonly label: string;
  readonly className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const liveRatioRef = useRef(ratio);
  const [liveRatio, setLiveRatio] = useState(ratio);
  useEffect(() => {
    liveRatioRef.current = ratio;
    setLiveRatio(ratio);
  }, [ratio]);
  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const restoreDocumentInteraction = beginTerminalWorkspaceResize(
      direction === "horizontal" ? "col-resize" : "row-resize",
    );
    const start = direction === "horizontal" ? event.clientX : event.clientY;
    const extent = direction === "horizontal" ? bounds.width : bounds.height;
    const startRatio = liveRatioRef.current;
    const move = (pointerEvent: PointerEvent) => {
      const position = direction === "horizontal" ? pointerEvent.clientX : pointerEvent.clientY;
      const next = Math.min(
        maxRatio,
        Math.max(minRatio, startRatio + ((position - start) / Math.max(1, extent)) * 100),
      );
      liveRatioRef.current = next;
      setLiveRatio(next);
    };
    const finish = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerEvent.pointerId)) {
        handle.releasePointerCapture(pointerEvent.pointerId);
      }
      restoreDocumentInteraction();
      onCommit(liveRatioRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
  const nudgeResize = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      direction === "horizontal"
        ? event.key === "ArrowLeft"
          ? -5
          : event.key === "ArrowRight"
            ? 5
            : 0
        : event.key === "ArrowUp"
          ? -5
          : event.key === "ArrowDown"
            ? 5
            : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(maxRatio, Math.max(minRatio, liveRatioRef.current + delta));
    liveRatioRef.current = next;
    setLiveRatio(next);
    onCommit(next);
  };
  return (
    <div
      ref={rootRef}
      data-terminal-layout-node-id={nodeId}
      className={`grid min-h-0 min-w-0 ${className}`}
      style={
        direction === "horizontal"
          ? {
              gridTemplateColumns: `minmax(0, ${liveRatio}fr) ${TERMINAL_WORKSPACE_SPLIT_GUTTER_PX}px minmax(0, ${100 - liveRatio}fr)`,
            }
          : {
              gridTemplateRows: `minmax(0, ${liveRatio}fr) ${TERMINAL_WORKSPACE_SPLIT_GUTTER_PX}px minmax(0, ${100 - liveRatio}fr)`,
            }
      }
    >
      {first}
      <ResizeHandle
        direction={direction}
        label={`${label}. Drag, or use arrow keys.`}
        onPointerDown={beginResize}
        onKeyDown={nudgeResize}
      />
      {second}
    </div>
  );
}

type TerminalWorkspaceViewTransition = {
  readonly finished: Promise<void>;
};

type TerminalWorkspaceTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => TerminalWorkspaceViewTransition;
};

let latestTerminalWorkspaceTransition = 0;

function runTerminalWorkspaceLayoutTransition(update: () => void) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    update();
    return;
  }
  const transitionDocument = document as TerminalWorkspaceTransitionDocument;
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (prefersReducedMotion || !transitionDocument.startViewTransition) {
    update();
    return;
  }

  let updateStarted = false;
  const applyUpdate = () => {
    if (updateStarted) return;
    updateStarted = true;
    flushSync(update);
  };
  const transitionId = ++latestTerminalWorkspaceTransition;
  transitionDocument.documentElement.dataset.terminalWorkspaceLayoutTransition = "true";
  try {
    const transition = transitionDocument.startViewTransition(applyUpdate);
    void transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (latestTerminalWorkspaceTransition === transitionId) {
          delete transitionDocument.documentElement.dataset.terminalWorkspaceLayoutTransition;
        }
      });
  } catch {
    applyUpdate();
    if (latestTerminalWorkspaceTransition === transitionId) {
      delete transitionDocument.documentElement.dataset.terminalWorkspaceLayoutTransition;
    }
  }
}

function terminalWorkspaceSlotTransitionName(nodeId: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < nodeId.length; index += 1) {
    hash = Math.imul(hash ^ nodeId.charCodeAt(index), 16_777_619);
  }
  return `t3-terminal-slot-${(hash >>> 0).toString(36)}`;
}

function EmptyWorkbenchSlot({
  nodeId,
  removable,
  onAdd,
  onRemove,
}: {
  readonly nodeId: string;
  readonly removable: boolean;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const remove = () => {
    if (removing) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onRemove();
      return;
    }
    setRemoving(true);
    window.setTimeout(onRemove, 140);
  };
  return (
    <div
      data-terminal-workspace-empty-slot={nodeId}
      className={`group/empty relative h-full min-h-32 w-full overflow-hidden rounded-xl border border-dashed bg-card/25 text-xs text-muted-foreground transition-[opacity,transform,border-color,background-color] duration-150 ease-out motion-reduce:transition-none ${
        removing
          ? "scale-[0.985] border-transparent opacity-0"
          : "border-border/70 hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
      }`}
      style={{ viewTransitionName: terminalWorkspaceSlotTransitionName(nodeId) }}
    >
      <button
        type="button"
        aria-label="Add pane to empty slot"
        className="grid h-full w-full place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={onAdd}
      >
        <span className="flex flex-col items-center gap-2 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover/empty:scale-[1.03]">
          <PlusIcon className="size-5" /> Add pane
        </span>
      </button>
      {removable ? (
        <button
          type="button"
          aria-label="Remove empty pane slot"
          className="pointer-events-none absolute right-2 top-2 grid size-7 -translate-y-1 scale-90 place-items-center rounded-md border border-border/70 bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,transform,color,background-color,border-color] duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:scale-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-focus-within/empty:pointer-events-auto group-focus-within/empty:translate-y-0 group-focus-within/empty:scale-100 group-focus-within/empty:opacity-100 group-hover/empty:pointer-events-auto group-hover/empty:translate-y-0 group-hover/empty:scale-100 group-hover/empty:opacity-100 motion-reduce:transition-none"
          onClick={(event) => {
            event.stopPropagation();
            remove();
          }}
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const layoutPresetGroupLabel = {
  essentials: "Essentials",
  focus: "Focus",
  build: "Build",
  review: "Review",
  dense: "Dense",
} as const;

function layoutPresetIcon(preset: TerminalWorkspaceLayoutPreset) {
  if (preset === "stacked" || preset === "main_bottom") return Rows2Icon;
  if (
    preset === "side_by_side" ||
    preset === "main_rail" ||
    preset === "main_two_rails" ||
    preset === "three_columns"
  )
    return Columns2Icon;
  if (preset === "preview_chat" || preset === "preview_terminal" || preset === "preview_logs")
    return EyeIcon;
  if (preset === "diff_chat" || preset === "diff_preview" || preset === "git_diff")
    return FileDiffIcon;
  if (preset === "test_triage") return FlaskConicalIcon;
  if (preset === "zen_tabs") return FocusIcon;
  return Grid2X2Icon;
}

function LayoutPresetPicker({
  value,
  paneCount,
  onApply,
}: {
  readonly value: TerminalWorkspaceLayoutPreset;
  readonly paneCount: number;
  readonly onApply: (preset: TerminalWorkspaceLayoutPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const active =
    TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS.find((preset) => preset.id === value) ??
    TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS[0];
  const normalizedSearch = search.trim().toLowerCase();
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Choose layout preset. Current layout: ${active.label}`}
          />
        }
      >
        <LayoutTemplateIcon />
        <span className="hidden sm:inline">Layout:</span>
        <span className="max-w-28 truncate">{active.label}</span>
        <ChevronDownIcon className="size-3" />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-[min(680px,calc(100vw-24px))]" viewportClassName="p-0">
        <div className="border-b border-border p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Layout presets</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Twenty starting points. Pane identity and running processes stay attached.
              </p>
            </div>
            <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
              {paneCount} panes
            </span>
          </div>
          <label className="mt-3 flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search 20 presets"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <div className="max-h-[min(560px,70vh)] overflow-y-auto p-3">
          {TERMINAL_WORKSPACE_LAYOUT_PRESET_GROUPS.map((group) => {
            const presets = TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS.filter(
              (preset) =>
                preset.group === group &&
                (!normalizedSearch ||
                  `${preset.label} ${preset.description}`.toLowerCase().includes(normalizedSearch)),
            );
            if (presets.length === 0) return null;
            return (
              <section key={group} className="mb-4 last:mb-0">
                <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                  {layoutPresetGroupLabel[group]}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {presets.map((preset) => {
                    const Icon = layoutPresetIcon(preset.id);
                    const selected = preset.id === value;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        className={`flex min-h-14 items-center gap-3 rounded-lg border p-2.5 text-left ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-muted/10 hover:bg-muted/30"
                        }`}
                        onClick={() => {
                          onApply(preset.id);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background">
                          <Icon className="size-4 text-primary" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium">{preset.label}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {preset.description}
                          </span>
                        </span>
                        {selected ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {normalizedSearch &&
          !TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS.some((preset) =>
            `${preset.label} ${preset.description}`.toLowerCase().includes(normalizedSearch),
          ) ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No layout preset matches “{search}”.
            </p>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function PaneResizeHandles({
  paneTitle,
  bindings,
  layoutRoot,
  visible,
  onCommit,
}: {
  readonly paneTitle: string;
  readonly bindings: ReadonlyArray<TerminalWorkspacePaneResizeBinding>;
  readonly layoutRoot: RefObject<HTMLDivElement | null>;
  readonly visible: boolean;
  readonly onCommit: (nodeId: string, ratio: number) => void;
}) {
  const beginResize = (
    event: React.PointerEvent<HTMLButtonElement>,
    activeBindings: ReadonlyArray<TerminalWorkspacePaneResizeBinding>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const restoreDocumentInteraction = beginTerminalWorkspaceResize(
      activeBindings[0]?.direction === "horizontal" ? "col-resize" : "row-resize",
    );
    const roots = new Map<string, HTMLDivElement>();
    const currentLayoutRoot = layoutRoot.current;
    for (const binding of activeBindings) {
      const root = Array.from(
        currentLayoutRoot?.querySelectorAll<HTMLDivElement>("[data-terminal-layout-node-id]") ?? [],
      ).find((candidate) => candidate.dataset.terminalLayoutNodeId === binding.nodeId);
      if (root) roots.set(binding.nodeId, root);
    }
    if (roots.size === 0) {
      handle.releasePointerCapture(event.pointerId);
      restoreDocumentInteraction();
      return;
    }
    const ratios = new Map<string, number>();
    const move = (pointerEvent: PointerEvent) => {
      for (const binding of activeBindings) {
        const root = roots.get(binding.nodeId);
        if (!root) continue;
        const bounds = root.getBoundingClientRect();
        const ratio =
          binding.direction === "horizontal"
            ? ((pointerEvent.clientX - bounds.left) / Math.max(1, bounds.width)) * 100
            : ((pointerEvent.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
        const next = Math.min(85, Math.max(15, ratio));
        ratios.set(binding.nodeId, next);
        if (binding.direction === "horizontal")
          root.style.gridTemplateColumns = `minmax(0, ${next}fr) ${TERMINAL_WORKSPACE_SPLIT_GUTTER_PX}px minmax(0, ${100 - next}fr)`;
        else
          root.style.gridTemplateRows = `minmax(0, ${next}fr) ${TERMINAL_WORKSPACE_SPLIT_GUTTER_PX}px minmax(0, ${100 - next}fr)`;
      }
    };
    const finish = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerEvent.pointerId)) {
        handle.releasePointerCapture(pointerEvent.pointerId);
      }
      restoreDocumentInteraction();
      for (const binding of activeBindings) {
        const ratio = ratios.get(binding.nodeId);
        if (ratio !== undefined) onCommit(binding.nodeId, ratio);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
  const nudgeResize = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    bindingsToNudge: ReadonlyArray<TerminalWorkspacePaneResizeBinding>,
  ) => {
    const horizontalDelta = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0;
    const verticalDelta = event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0;
    let handled = false;
    for (const binding of bindingsToNudge) {
      const delta = binding.direction === "horizontal" ? horizontalDelta : verticalDelta;
      if (delta === 0) continue;
      handled = true;
      onCommit(binding.nodeId, Math.min(85, Math.max(15, binding.ratio + delta)));
    }
    if (handled) event.preventDefault();
  };
  const horizontal = bindings.filter((binding) => binding.direction === "horizontal");
  const vertical = bindings.filter((binding) => binding.direction === "vertical");
  const opacity = visible
    ? "opacity-100"
    : "opacity-0 group-hover/pane:opacity-100 group-focus-within/pane:opacity-100";
  const edgeClass: Record<TerminalWorkspacePaneResizeBinding["edge"], string> = {
    left: "-left-1 top-10 h-[calc(100%-2.5rem)] w-3 cursor-col-resize",
    right: "-right-1 top-10 h-[calc(100%-2.5rem)] w-3 cursor-col-resize",
    top: "-top-1 left-0 h-3 w-full cursor-row-resize",
    bottom: "-bottom-1 left-0 h-3 w-full cursor-row-resize",
  };
  return (
    <>
      {bindings.map((binding) => (
        <button
          key={binding.edge}
          type="button"
          aria-label={`Resize ${paneTitle} from the ${binding.edge} edge. Drag, or use arrow keys.`}
          className={`group/resize absolute z-30 grid touch-none place-items-center ${edgeClass[binding.edge]} ${opacity} bg-primary/0 outline-none hover:bg-primary/15 focus-visible:bg-primary/20`}
          onPointerDown={(event) => beginResize(event, [binding])}
          onKeyDown={(event) => nudgeResize(event, [binding])}
        >
          <span
            aria-hidden="true"
            className={`rounded-full bg-muted-foreground/45 transition-[width,height,opacity,background-color] duration-150 group-hover/resize:bg-primary group-focus-visible/resize:bg-primary ${
              binding.direction === "horizontal"
                ? "h-12 w-0.5 group-hover/resize:w-1 group-focus-visible/resize:w-1"
                : "h-0.5 w-12 group-hover/resize:h-1 group-focus-visible/resize:h-1"
            }`}
          />
        </button>
      ))}
      {vertical.flatMap((verticalBinding) =>
        horizontal.map((horizontalBinding) => (
          <button
            key={`${verticalBinding.edge}-${horizontalBinding.edge}`}
            type="button"
            aria-label={`Resize ${paneTitle} from the ${verticalBinding.edge} ${horizontalBinding.edge} corner. Drag, or use arrow keys.`}
            className={`absolute z-40 size-5 touch-none rounded-sm border border-primary/70 bg-background/90 text-primary shadow-sm ${opacity} ${
              verticalBinding.edge === "top" ? "top-0" : "bottom-0"
            } ${horizontalBinding.edge === "left" ? "left-0" : "right-0"} ${
              (verticalBinding.edge === "top" && horizontalBinding.edge === "left") ||
              (verticalBinding.edge === "bottom" && horizontalBinding.edge === "right")
                ? "cursor-nwse-resize"
                : "cursor-nesw-resize"
            }`}
            onPointerDown={(event) => beginResize(event, [horizontalBinding, verticalBinding])}
            onKeyDown={(event) => nudgeResize(event, [horizontalBinding, verticalBinding])}
          />
        )),
      )}
    </>
  );
}

const MIN_WORKBENCH_CANVAS_HEIGHT = 520;
const MAX_WORKBENCH_CANVAS_HEIGHT = 6_000;
const WORKBENCH_FLOOR_KEYBOARD_STEP = 120;

interface WorkbenchFloorSplitSnapshot {
  readonly binding: TerminalWorkspacePaneResizeBinding;
  readonly root: HTMLDivElement;
  readonly startHeight: number;
  readonly firstPixels: number;
}

function WorkbenchFloorResizeHandle({
  paneTitle,
  layoutRoot,
  scrollRoot,
  verticalBindings,
  onCommit,
}: {
  readonly paneTitle: string;
  readonly layoutRoot: RefObject<HTMLDivElement | null>;
  readonly scrollRoot: RefObject<HTMLDivElement | null>;
  readonly verticalBindings: ReadonlyArray<TerminalWorkspacePaneResizeBinding>;
  readonly onCommit: (
    height: number,
    splitRatios: ReadonlyArray<{ readonly nodeId: string; readonly ratio: number }>,
  ) => void;
}) {
  const snapshot = () => {
    const canvas = layoutRoot.current;
    if (!canvas) return null;
    const splitRoots = Array.from(
      canvas.querySelectorAll<HTMLDivElement>("[data-terminal-layout-node-id]"),
    );
    const splits = verticalBindings.flatMap<WorkbenchFloorSplitSnapshot>((binding) => {
      const root = splitRoots.find(
        (candidate) => candidate.dataset.terminalLayoutNodeId === binding.nodeId,
      );
      if (!root) return [];
      const startHeight = root.getBoundingClientRect().height;
      const contentHeight = Math.max(1, startHeight - TERMINAL_WORKSPACE_SPLIT_GUTTER_PX);
      return [
        {
          binding,
          root,
          startHeight,
          firstPixels: contentHeight * (binding.ratio / 100),
        },
      ];
    });
    return {
      canvas,
      height: canvas.getBoundingClientRect().height,
      splits,
    };
  };

  const renderHeight = (
    startHeight: number,
    nextHeight: number,
    canvas: HTMLDivElement,
    splits: ReadonlyArray<WorkbenchFloorSplitSnapshot>,
  ) => {
    const height = Math.min(
      MAX_WORKBENCH_CANVAS_HEIGHT,
      Math.max(MIN_WORKBENCH_CANVAS_HEIGHT, nextHeight),
    );
    const growth = height - startHeight;
    canvas.style.height = `${height}px`;
    const splitRatios = splits.map(({ binding, root, startHeight: splitHeight, firstPixels }) => {
      const nextContentHeight = Math.max(
        1,
        splitHeight + growth - TERMINAL_WORKSPACE_SPLIT_GUTTER_PX,
      );
      const ratio = Math.min(85, Math.max(15, (firstPixels / nextContentHeight) * 100));
      root.style.gridTemplateRows = `minmax(0, ${ratio}fr) ${TERMINAL_WORKSPACE_SPLIT_GUTTER_PX}px minmax(0, ${100 - ratio}fr)`;
      return { nodeId: binding.nodeId, ratio };
    });
    return { height, splitRatios };
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const initial = snapshot();
    if (!initial) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const restoreDocumentInteraction = beginTerminalWorkspaceResize("row-resize");
    const startY = event.clientY;
    let pointerY = event.clientY;
    let autoGrowth = 0;
    let draggingDown = false;
    let frame = 0;
    let latest = renderHeight(initial.height, initial.height, initial.canvas, initial.splits);

    const draw = () => {
      const pointerGrowth = pointerY - startY;
      latest = renderHeight(
        initial.height,
        initial.height + pointerGrowth + autoGrowth,
        initial.canvas,
        initial.splits,
      );
      const scroller = scrollRoot.current;
      if (scroller && draggingDown && pointerY >= scroller.getBoundingClientRect().bottom - 28) {
        autoGrowth += 8;
        scroller.scrollTop += 8;
      }
      frame = window.requestAnimationFrame(draw);
    };
    const move = (pointerEvent: PointerEvent) => {
      pointerY = pointerEvent.clientY;
      if (pointerY > startY + 3) draggingDown = true;
    };
    const finish = (pointerEvent: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerEvent.pointerId)) {
        handle.releasePointerCapture(pointerEvent.pointerId);
      }
      restoreDocumentInteraction();
      onCommit(latest.height, latest.splitRatios);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    frame = window.requestAnimationFrame(draw);
  };

  const nudgeResize = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      event.key === "ArrowDown"
        ? WORKBENCH_FLOOR_KEYBOARD_STEP
        : event.key === "ArrowUp"
          ? -WORKBENCH_FLOOR_KEYBOARD_STEP
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initial = snapshot();
    if (!initial) return;
    const next = renderHeight(
      initial.height,
      initial.height + delta,
      initial.canvas,
      initial.splits,
    );
    onCommit(next.height, next.splitRatios);
    window.requestAnimationFrame(() => {
      const scroller = scrollRoot.current;
      if (scroller && delta > 0) scroller.scrollBy({ top: delta, behavior: "smooth" });
    });
  };

  return (
    <button
      type="button"
      aria-label={`Extend the Workbench below ${paneTitle}. Drag down, or use the arrow keys.`}
      className="group/floor absolute bottom-0 left-0 z-50 grid h-4 w-full touch-none cursor-row-resize items-end justify-items-center outline-none"
      onPointerDown={beginResize}
      onKeyDown={nudgeResize}
    >
      <span
        aria-hidden="true"
        className="mb-1 h-1 w-16 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background)),0_0_10px_hsl(var(--primary)/0.45)] transition-[width,filter] duration-150 group-hover/floor:w-24 group-hover/floor:brightness-125 group-focus-visible/floor:w-24 group-focus-visible/floor:brightness-125"
      />
    </button>
  );
}

const paneIcon: Record<TerminalWorkspacePaneType, typeof TerminalSquareIcon> = {
  shell: TerminalSquareIcon,
  provider: BotIcon,
  dev_server: AppWindowIcon,
  preview: EyeIcon,
  tests: FlaskConicalIcon,
  logs: FileClockIcon,
  git: GitBranchIcon,
  diff: FileDiffIcon,
  file: FileCode2Icon,
  thread: BotIcon,
};

const paneFormatLabel: Record<TerminalWorkspacePaneType, string> = {
  shell: "Terminal",
  provider: "Chat",
  dev_server: "Dev server",
  preview: "Preview",
  tests: "Tests",
  logs: "Logs",
  git: "Git",
  diff: "Diff",
  file: "File",
  thread: "Chat",
};

const configurablePaneFormats = [
  ["provider", "Chat", MessageSquareIcon],
  ["shell", "Terminal", TerminalSquareIcon],
  ["preview", "Preview", EyeIcon],
  ["logs", "Logs", FileClockIcon],
  ["diff", "Diff", FileDiffIcon],
  ["git", "Git", GitBranchIcon],
  ["tests", "Tests", FlaskConicalIcon],
] as const;

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
  task,
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
  onInspectTask,
  onSwitchAgentSurface,
  onChangePaneFormat,
  onOpenQuickAdd,
  providerLabel,
  originLabel,
}: {
  readonly pane: TerminalWorkspacePane;
  readonly task: OrchestrationTask | null;
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
  readonly onInspectTask: () => void;
  readonly onSwitchAgentSurface?: (surface: "chat" | "terminal") => void;
  readonly onChangePaneFormat?: (type: TerminalWorkspacePaneType) => void;
  readonly onOpenQuickAdd?: () => void;
  readonly providerLabel?: string | null;
  readonly originLabel?: string | null;
}) {
  const Icon = paneIcon[pane.type];
  const currentFormat =
    (pane.type === "provider" || pane.type === "thread" || pane.type === "shell") &&
    pane.agentSurface
      ? pane.agentSurface === "chat"
        ? "Chat"
        : "Terminal"
      : paneFormatLabel[pane.type];
  const hasAgentIdentity = Boolean(pane.providerInstanceId || pane.threadId);
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/70 bg-muted/20 px-1.5"
      onMouseDown={onSelect}
    >
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-label={`Move ${pane.title} pane`}
        className="grid h-7 w-4 shrink-0 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <span className="grid size-6 place-items-center rounded-md border border-border bg-background">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{pane.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {task
            ? `${task.title} · ${task.role} · ${task.status}`
            : (originLabel ?? pane.workspacePath)}
        </p>
      </div>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background/80 px-2 text-[10px] text-foreground hover:bg-muted"
              aria-label={`Change ${pane.title} pane format`}
              onMouseDown={(event) => event.stopPropagation()}
            />
          }
        >
          <span className="text-muted-foreground">Pane:</span> {currentFormat}
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </MenuTrigger>
        <MenuPopup align="end" className="w-56">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Change pane format
          </div>
          {configurablePaneFormats.map(([type, label, FormatIcon]) => {
            const surface = type === "provider" ? "chat" : type === "shell" ? "terminal" : null;
            const active = surface ? pane.agentSurface === surface : pane.type === type;
            const canUseAgentSurface = !surface || hasAgentIdentity;
            return (
              <MenuItem
                key={type}
                disabled={!canUseAgentSurface}
                onClick={() => {
                  if (surface && onSwitchAgentSurface) onSwitchAgentSurface(surface);
                  else onChangePaneFormat?.(type);
                }}
              >
                <FormatIcon />
                <span className="min-w-0 flex-1">{label}</span>
                {active ? <CheckIcon className="text-primary" /> : null}
              </MenuItem>
            );
          })}
          <MenuSeparator />
          <MenuItem onClick={onOpenQuickAdd}>
            <PlusIcon /> Add a pane to this Workspace
          </MenuItem>
        </MenuPopup>
      </Menu>
      {providerLabel ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className="hidden h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background/80 px-2 text-[10px] text-foreground hover:bg-muted lg:flex"
                aria-label={`Provider ${providerLabel}`}
                onMouseDown={(event) => event.stopPropagation()}
              />
            }
          >
            <span className="text-muted-foreground">Provider:</span> {providerLabel}
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </MenuTrigger>
          <MenuPopup align="end" className="w-60">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Canonical agent identity
            </div>
            <MenuItem>
              <CheckIcon className="text-primary" /> {providerLabel}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onOpenQuickAdd}>
              <PlusIcon /> Open another provider
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}
      {task ? (
        <Button
          size="xs"
          variant="ghost"
          className="h-6 max-w-40 gap-1 px-1.5 text-[10px]"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onInspectTask}
        >
          <ListChecksIcon className="size-3" />
          <span className="truncate">
            {task.ownership?.status === "valid"
              ? "Ownership valid"
              : task.ownership?.status === "violation"
                ? `Ownership issue ${task.ownership.violations.length}`
                : "Task details"}
          </span>
        </Button>
      ) : null}
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

const WorkspaceFilePane = memo(function WorkspaceFilePane({
  environmentId,
  cwd,
  relativePath,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string | null;
}) {
  const file = useProjectFileQuery(environmentId, cwd, relativePath);
  if (!relativePath)
    return (
      <div className="grid h-full place-items-center p-5 text-center text-xs text-muted-foreground">
        Choose a project file from New Pane to open it in this stack.
      </div>
    );
  if (file.error) return <div className="p-4 text-xs text-destructive">{file.error}</div>;
  if (!file.data)
    return <div className="p-4 text-xs text-muted-foreground">Reading {relativePath}…</div>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center border-b border-border/70 px-3 font-mono text-[10px] text-muted-foreground">
        <span className="truncate">{relativePath}</span>
        <span className="ml-auto shrink-0">{file.data.byteLength.toLocaleString()} bytes</span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-5 text-foreground selection:bg-primary/25">
        {file.data.contents}
      </pre>
    </div>
  );
});

const RepositoryDiffPane = memo(function RepositoryDiffPane({
  environmentId,
  cwd,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
}) {
  const { resolvedTheme } = useTheme();
  const diff = useEnvironmentQuery(
    reviewEnvironment.diffPreview({
      environmentId,
      input: { cwd, ignoreWhitespace: false },
    }),
  );
  const source = diff.data?.sources.find((candidate) => candidate.kind === "working-tree") ?? null;
  const renderable = useMemo(
    () =>
      getRenderablePatch(source?.diff, `terminal-workspace:${source?.diffHash ?? cwd}`, {
        compactPartialHunkOffsets: true,
      }),
    [cwd, source?.diff, source?.diffHash],
  );
  const items = useMemo(
    () =>
      renderable?.kind === "files"
        ? renderable.files.map((fileDiff, index) => ({
            id: `${resolveFileDiffPath(fileDiff)}:${index}`,
            type: "diff" as const,
            fileDiff,
            collapsed: false,
          }))
        : [],
    [renderable],
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/70 px-3 text-[10px] text-muted-foreground">
        <FileDiffIcon className="size-3.5" />
        <span>{source?.title ?? "Working tree diff"}</span>
        {source?.truncated ? <span className="text-amber-500">Truncated</span> : null}
        <Button size="micro" variant="ghost" className="ml-auto" onClick={diff.refresh}>
          <RefreshCwIcon /> Refresh
        </Button>
      </div>
      {diff.error ? (
        <div className="p-4 text-xs text-destructive">{diff.error}</div>
      ) : !diff.data ? (
        <div className="p-4 text-xs text-muted-foreground">Reading repository changes…</div>
      ) : items.length > 0 ? (
        <StyledDiffCodeView
          className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto [scrollbar-gutter:stable]"
          items={items}
          options={{
            diffStyle: "unified",
            lineDiffType: "word",
            overflow: "scroll",
            stickyHeaders: true,
            theme: resolveDiffThemeName(resolvedTheme),
            themeType: resolvedTheme,
          }}
        />
      ) : renderable?.kind === "raw" ? (
        <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto bg-[var(--code-background)] font-mono text-[11px] leading-5">
          <p className="sticky top-0 border-b border-border bg-background px-3 py-1 text-[10px] text-amber-500">
            {renderable.reason}
          </p>
          <pre className="min-w-max p-3 text-foreground selection:bg-primary/25">
            {renderable.text}
          </pre>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-xs text-emerald-500">
          Working tree clean
        </div>
      )}
    </div>
  );
});

const CanonicalPreviewSurface = memo(function CanonicalPreviewSurface({
  threadRef,
  annotationThreadRef,
  url,
  refreshKey,
  onReload,
  pickRequestNonce,
  onAnnotationCaptured,
  onSendAnnotation,
  persistAnnotationToDraft,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly annotationThreadRef?: ScopedThreadRef;
  readonly url: string;
  readonly refreshKey: number;
  readonly onReload: () => void;
  readonly pickRequestNonce?: number;
  readonly onAnnotationCaptured?: (annotation: PreviewAnnotationPayload) => void;
  readonly onSendAnnotation?: Parameters<typeof PreviewView>[0]["onSendAnnotation"];
  readonly persistAnnotationToDraft?: boolean;
}) {
  const previewState = useThreadPreviewState(threadRef);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const requestedKeyRef = useRef<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const activeSnapshot = previewState.activeTabId
    ? (previewState.sessions[previewState.activeTabId] ?? null)
    : null;
  const activeUrl =
    activeSnapshot?.navStatus._tag === "Idle" ? null : activeSnapshot?.navStatus.url;

  useEffect(() => {
    if (!url) return;
    const requestKey = `${url}:${refreshKey}`;
    if (requestedKeyRef.current === requestKey) return;
    if (refreshKey === 0 && activeUrl === url) {
      requestedKeyRef.current = requestKey;
      return;
    }
    requestedKeyRef.current = requestKey;
    setOpenFailed(false);
    let disposed = false;
    void openPreviewSession({ openPreview, threadRef, url }).then((result) => {
      if (!disposed && result._tag === "Failure") setOpenFailed(true);
    });
    return () => {
      disposed = true;
    };
  }, [activeUrl, openPreview, refreshKey, threadRef, url]);

  if (openFailed)
    return (
      <div className="grid h-full place-items-center bg-muted/10 p-6 text-center">
        <div className="max-w-md">
          <p className="text-sm font-medium">Preview could not open this server</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The server is still running. Retry the Preview runtime or continue in your browser.
          </p>
          <p className="mt-3 truncate font-mono text-[11px] text-primary">{url}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="xs" variant="outline" onClick={onReload}>
              <RefreshCwIcon /> Retry Preview
            </Button>
            <Button size="xs" onClick={() => openExternal(url)}>
              <ExternalLinkIcon /> Open Browser
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <PreviewView
      threadRef={threadRef}
      {...(annotationThreadRef ? { annotationThreadRef } : {})}
      configuredUrls={[url]}
      visible
      {...(pickRequestNonce !== undefined ? { pickRequestNonce } : {})}
      {...(onAnnotationCaptured ? { onAnnotationCaptured } : {})}
      {...(onSendAnnotation ? { onSendAnnotation } : {})}
      {...(persistAnnotationToDraft !== undefined ? { persistAnnotationToDraft } : {})}
    />
  );
});

const PreviewSurface = memo(function PreviewSurface({
  threadRef,
  annotationThreadRef,
  url,
  title,
  refreshKey,
  state,
  onReload,
  onRestart,
  pickRequestNonce,
  onAnnotationCaptured,
  onSendAnnotation,
  persistAnnotationToDraft,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly annotationThreadRef?: ScopedThreadRef;
  readonly url: string;
  readonly title: string;
  readonly refreshKey: number;
  readonly state: "idle" | "connecting" | "ready" | "stopped" | "blocked";
  readonly onReload: () => void;
  readonly onRestart?: (() => void) | undefined;
  readonly pickRequestNonce?: number;
  readonly onAnnotationCaptured?: (annotation: PreviewAnnotationPayload) => void;
  readonly onSendAnnotation?: Parameters<typeof PreviewView>[0]["onSendAnnotation"];
  readonly persistAnnotationToDraft?: boolean;
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
  if (isPreviewSupportedInRuntime())
    return (
      <CanonicalPreviewSurface
        threadRef={threadRef}
        {...(annotationThreadRef ? { annotationThreadRef } : {})}
        url={url}
        refreshKey={refreshKey}
        onReload={onReload}
        {...(pickRequestNonce !== undefined ? { pickRequestNonce } : {})}
        {...(onAnnotationCaptured ? { onAnnotationCaptured } : {})}
        {...(onSendAnnotation ? { onSendAnnotation } : {})}
        {...(persistAnnotationToDraft !== undefined ? { persistAnnotationToDraft } : {})}
      />
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
  initialTaskId,
}: {
  readonly project: WorkspaceProject;
  readonly projectKey: string;
  readonly displayName: string;
  readonly initialTaskId?: string;
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
  const projectTasks = useMemo(
    () => (snapshot?.tasks ?? []).filter((task) => task.projectId === project.id),
    [project.id, snapshot?.tasks],
  );
  const taskById = useMemo(
    () => new Map(projectTasks.map((task) => [task.id, task] as const)),
    [projectTasks],
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
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptThreadTurn = useAtomCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  const stopThreadSession = useAtomCommand(threadEnvironment.stopSession, {
    reportFailure: false,
  });
  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const bindTaskThread = useAtomCommand(taskEnvironment.bindThread, { reportFailure: false });
  const activateTask = useAtomCommand(taskEnvironment.activate, { reportFailure: false });
  const prepareTaskWorkspace = useAtomCommand(taskEnvironment.prepareWorkspace, {
    reportFailure: false,
  });
  const setTaskOwnership = useAtomCommand(taskEnvironment.setOwnership, { reportFailure: false });
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
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<"agent" | "tool" | "layout">("agent");
  const [quickAddSurface, setQuickAddSurface] = useState<"chat" | "terminal">("chat");
  const [quickAddProviderInstanceId, setQuickAddProviderInstanceId] = useState("");
  const [quickAddSearch, setQuickAddSearch] = useState("");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [layoutPresetChoice, setLayoutPresetChoice] =
    useState<TerminalWorkspaceLayoutPreset>("main_rail");
  const [layoutMainRatio, setLayoutMainRatio] = useState(68);
  const [layoutFillEmpty, setLayoutFillEmpty] = useState(true);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [designMode, setDesignMode] = useState(false);
  const [designPreviewBinding, setDesignPreviewBinding] = useState<DesignPreviewBinding | null>(
    null,
  );
  const [designHandoffStatus, setDesignHandoffStatus] = useState<"idle" | "sent">("idle");
  const [designPickRequestNonce, setDesignPickRequestNonce] = useState(0);
  const [designCapture, setDesignCapture] = useState<PreviewAnnotationPayload | null>(null);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskObjective, setTaskObjective] = useState("");
  const [taskRole, setTaskRole] = useState<NebulaTaskRole>("builder");
  const [taskProviderInstanceId, setTaskProviderInstanceId] = useState("");
  const [taskAcceptanceCriteria, setTaskAcceptanceCriteria] = useState("");
  const [taskOwnershipRules, setTaskOwnershipRules] = useState<ReadonlyArray<OwnershipRuleDraft>>([
    { draftId: randomUUID(), access: "write", pattern: "", reason: "" },
  ]);
  const [taskContextId, setTaskContextId] = useState<TaskId | null>(null);
  const [inspectedTaskId, setInspectedTaskId] = useState<TaskId | null>(null);
  const initialTaskSelectionAppliedRef = useRef<string | null>(null);
  const [taskCreateBusy, setTaskCreateBusy] = useState(false);
  const [addAt, setAddAt] = useState<{ column: number; row: number } | null>(null);
  const [quickAddTargetStackId, setQuickAddTargetStackId] = useState<string | null>(null);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const reloadPreview = useCallback(() => setPreviewRefreshKey((key) => key + 1), []);
  const [previewStagePaneId, setPreviewStagePaneId] = useState<string | null>(null);
  const [previewTray, setPreviewTray] = useState<"closed" | "agent" | "logs">("closed");
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
  const workbenchLayoutRef = useRef<HTMLDivElement>(null);
  const restoredViewportWorkspaceIdRef = useRef<string | null>(null);
  const viewportSaveTimerRef = useRef<number | null>(null);
  const agentSurfaceLaunchesRef = useRef(new Set<string>());
  const designAutoPickKeyRef = useRef<string | null>(null);

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
  useEffect(() => {
    if (!designPreviewBinding || activeWorkspace?.id === designPreviewBinding.workspaceId) return;
    setDesignMode(false);
    setDesignPreviewBinding(null);
    setDesignCapture(null);
    setDesignHandoffStatus("idle");
  }, [activeWorkspace?.id, designPreviewBinding]);
  useEffect(() => {
    if (!designMode || !designPreviewBinding) {
      designAutoPickKeyRef.current = null;
      return;
    }
    const key = `${designPreviewBinding.workspaceId}:${designPreviewBinding.paneId ?? "preview"}:${designPreviewBinding.url}`;
    if (designAutoPickKeyRef.current === key) return;
    designAutoPickKeyRef.current = key;
    // PreviewView is mounted by the Design Mode transition. Increment after
    // that mount so its request observer sees a fresh value and immediately
    // opens the native element picker.
    setDesignPickRequestNonce((nonce) => nonce + 1);
  }, [designMode, designPreviewBinding]);
  const providerTerminalLaunches = useMemo(
    () =>
      new Map(
        providerEntries.map((entry) => {
          const instanceSettings = settings.providerInstances?.[entry.instanceId];
          const legacyBinaryPath =
            entry.driverKind === "codex"
              ? settings.providers.codex.binaryPath
              : entry.driverKind === "claudeAgent"
                ? settings.providers.claudeAgent.binaryPath
                : entry.driverKind === "cursor"
                  ? settings.providers.cursor.binaryPath
                  : entry.driverKind === "grok"
                    ? settings.providers.grok.binaryPath
                    : entry.driverKind === "antigravity"
                      ? settings.providers.antigravity.binaryPath
                      : entry.driverKind === "opencode"
                        ? settings.providers.opencode.binaryPath
                        : null;
          return [
            entry.instanceId,
            providerTerminalLaunchSpec({
              driverKind: entry.driverKind,
              legacyBinaryPath,
              instanceConfig: instanceSettings?.config,
              ...(instanceSettings?.environment
                ? { instanceEnvironment: instanceSettings.environment }
                : {}),
            }),
          ] as const;
        }),
      ),
    [providerEntries, settings.providerInstances, settings.providers],
  );
  const selectedQuickAddProvider =
    providerEntries.find((entry) => entry.instanceId === quickAddProviderInstanceId) ??
    providerEntries.find(isProviderInstancePickerReady) ??
    providerEntries[0] ??
    null;
  const quickAddProviders = useMemo(() => {
    const query = quickAddSearch.trim().toLowerCase();
    if (!query) return providerEntries;
    return providerEntries.filter((entry) =>
      `${entry.displayName} ${entry.driverKind} ${entry.instanceId}`.toLowerCase().includes(query),
    );
  }, [providerEntries, quickAddSearch]);
  useEffect(() => {
    if (!quickAddOpen) return;
    const next =
      quickAddProviders.find((entry) => entry.instanceId === quickAddProviderInstanceId) ??
      quickAddProviders.find(isProviderInstancePickerReady) ??
      quickAddProviders[0] ??
      null;
    if (!next || quickAddProviderInstanceId === next.instanceId) return;
    setQuickAddProviderInstanceId(next.instanceId);
  }, [quickAddOpen, quickAddProviderInstanceId, quickAddProviders]);
  const projectServices = useMemo(
    () =>
      resolveTerminalWorkspaceProjectServices({
        projectId: project.id,
        workspacePath: project.workspaceRoot,
        workspaces: workspaceState?.workspaces ?? [],
        servers: discoveredServers,
      }),
    [discoveredServers, project.id, project.workspaceRoot, workspaceState?.workspaces],
  );
  const projectServiceServerKeys = useMemo(
    () =>
      new Set(
        projectServices.flatMap(({ servers }) =>
          servers.map((server) => `${server.host}:${server.port}`),
        ),
      ),
    [projectServices],
  );
  const otherLocalServers = useMemo(
    () =>
      discoveredServers.filter(
        (server) => !projectServiceServerKeys.has(`${server.host}:${server.port}`),
      ),
    [discoveredServers, projectServiceServerKeys],
  );
  const taskContext = taskContextId ? (taskById.get(taskContextId) ?? null) : null;
  const taskContextPath =
    taskContext?.workspace?.status === "ready" ? taskContext.workspace.path : null;
  const selectedWorkspacePath =
    taskContextPath ??
    activeWorkspace?.panes.find((pane) => pane.id === activeWorkspace.selectedPaneId)
      ?.workspacePath ??
    project.workspaceRoot;
  const filePicker = useProjectFilePickerQuery(
    project.environmentId,
    selectedWorkspacePath,
    fileSearch,
    60,
  );

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

  useEffect(() => {
    if (!initialTaskId || initialTaskSelectionAppliedRef.current === initialTaskId) return;
    const task = taskById.get(TaskId.make(initialTaskId));
    if (!task) return;
    initialTaskSelectionAppliedRef.current = initialTaskId;
    setTaskContextId(task.id);
    setInspectedTaskId(task.id);
    if (!activeWorkspace) return;
    const taskPane = activeWorkspace.panes.find((pane) => pane.taskId === task.id);
    if (!taskPane) return;
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      selectedPaneId: taskPane.id,
      panes: workspace.panes.map((pane) =>
        pane.id === taskPane.id ? { ...pane, visible: true } : pane,
      ),
    }));
  }, [activeWorkspace, initialTaskId, taskById, updateActiveWorkspace]);

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
      const boundTask = input.taskId ? taskById.get(TaskId.make(input.taskId)) : null;
      if (
        input.taskId &&
        (!boundTask || boundTask.workspace?.status !== "ready" || !boundTask.workspace.path)
      ) {
        reportError(
          "Task workspace is not ready",
          boundTask?.workspace?.failureReason ??
            "Task-bound panes require a ready canonical worktree.",
        );
        return null;
      }
      const placement = firstAvailableGridPlacement(
        currentWorkspace.panes,
        addAt ?? undefined,
        currentWorkspace.gridPreset === "auto"
          ? { columns: 4, rows: 4 }
          : terminalWorkspaceGridDimensions(currentWorkspace),
      );
      const pane = createTerminalWorkspacePane({
        ...input,
        id: randomUUID(),
        workspacePath: boundTask?.workspace?.path ?? input.workspacePath ?? project.workspaceRoot,
        grid: placement ?? { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
      });
      runTerminalWorkspaceLayoutTransition(() => {
        persistProjectState(
          updateWorkspace(currentState, currentWorkspace.id, (workspace) => {
            const withPane = {
              ...workspace,
              panes: [...workspace.panes, pane],
              selectedPaneId: pane.id,
              updatedAt: new Date().toISOString(),
            };
            return movePaneInWorkspaceLayout(withPane, pane.id, {
              targetPaneId: null,
              targetStackId: quickAddTargetStackId,
              placement: "tab",
            });
          }),
        );
      });
      setAddPaneOpen(false);
      setAddAt(null);
      setQuickAddTargetStackId(null);
      return pane;
    },
    [
      activeWorkspace,
      addAt,
      persistProjectState,
      project.id,
      project.workspaceRoot,
      quickAddTargetStackId,
      taskById,
    ],
  );

  const createBoundTask = useCallback(async () => {
    if (
      !taskTitle.trim() ||
      !taskObjective.trim() ||
      (taskRole === "builder" && !ownershipDraftsValid(taskOwnershipRules))
    )
      return;
    const taskId = newTaskId();
    setTaskCreateBusy(true);
    const criteria = taskAcceptanceCriteria
      .split("\n")
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    const providerEntry = providerEntries.find(
      (entry) => entry.instanceId === taskProviderInstanceId,
    );
    const created = await createTask({
      environmentId: project.environmentId,
      input: {
        taskId,
        projectId: project.id,
        title: taskTitle.trim(),
        objective: taskObjective.trim(),
        role: taskRole,
        modelSelection: providerEntry
          ? {
              instanceId: providerEntry.instanceId,
              model: providerEntry.models[0]?.slug ?? "auto",
            }
          : project.defaultModelSelection,
        acceptanceCriteria: criteria,
        reviewRequired: true,
        preferDifferentReviewerProvider: true,
      },
    });
    let error = commandFailure(created);
    if (!error && taskOwnershipRules.some((rule) => rule.pattern.trim()))
      error = commandFailure(
        await setTaskOwnership({
          environmentId: project.environmentId,
          input: { taskId, rules: ownershipRulesFromDrafts(taskOwnershipRules) },
        }),
      );
    if (!error)
      error = commandFailure(
        await prepareTaskWorkspace({
          environmentId: project.environmentId,
          input: { taskId },
        }),
      );
    setTaskCreateBusy(false);
    if (error) {
      reportError("Could not create Task workspace", error);
      return;
    }
    setTaskContextId(taskId);
    setTaskTitle("");
    setTaskObjective("");
    setTaskRole("builder");
    setTaskProviderInstanceId("");
    setTaskAcceptanceCriteria("");
    setTaskOwnershipRules([{ draftId: randomUUID(), access: "write", pattern: "", reason: "" }]);
    setTaskCreateOpen(false);
  }, [
    createTask,
    prepareTaskWorkspace,
    project.defaultModelSelection,
    project.environmentId,
    project.id,
    providerEntries,
    setTaskOwnership,
    taskAcceptanceCriteria,
    taskObjective,
    taskOwnershipRules,
    taskProviderInstanceId,
    taskRole,
    taskTitle,
  ]);

  const launchProvider = useCallback(
    async (
      entry: ProviderInstanceEntry,
      task: OrchestrationTask | null = null,
      replaceExisting = false,
      linkedPaneId: string | null = null,
      originWorkspace: ReturnType<typeof resolveAgentWorkspace> | null = null,
    ) => {
      if (!isProviderInstancePickerReady(entry)) {
        reportError(
          `${entry.displayName} unavailable`,
          entry.snapshot.message ?? "Enable a ready provider instance before creating this pane.",
        );
        return null;
      }
      if (
        task &&
        (task.workspace?.status !== "ready" || !task.workspace.path || !task.workspace.branch)
      ) {
        reportError(
          "Task workspace is not ready",
          task.workspace?.failureReason ?? "Wait for the canonical worktree to finish preparing.",
        );
        return null;
      }
      if (task?.threadId && !replaceExisting) {
        const thread = threadById.get(task.threadId);
        const pane = addPane({
          type: "thread",
          title: task.title,
          taskId: task.id,
          threadId: task.threadId,
          providerInstanceId: thread?.modelSelection.instanceId ?? entry.instanceId,
          agentSurface: "chat",
          linkedPaneId,
          workspacePath: task.workspace!.path!,
        });
        if (pane && linkedPaneId)
          updateActiveWorkspace((workspace) =>
            linkAgentPaneViews(workspace, linkedPaneId, pane.id),
          );
        return pane;
      }
      const { cwd: workspacePath, worktreePath } = resolveAgentWorkspace({
        projectPath: project.workspaceRoot,
        taskWorkspace: task?.workspace ?? null,
        chatWorktreePath: originWorkspace?.worktreePath ?? null,
        paneWorkspacePath: originWorkspace?.cwd ?? null,
      });
      const threadId = newThreadId();
      const modelSelection = {
        instanceId: entry.instanceId,
        model: entry.models[0]?.slug ?? "auto",
      };
      const result = await createThread({
        environmentId: project.environmentId,
        input: {
          threadId,
          projectId: project.id,
          ...(task
            ? {
                title: task.title,
                modelSelection,
                runtimeMode: "full-access" as const,
                interactionMode: "default" as const,
                branch: task.workspace!.branch!,
                worktreePath: task.workspace!.path!,
              }
            : {
                ...terminalThreadCreateFields({
                  title: `${entry.displayName} workspace`,
                  modelSelection,
                  workspace: { mode: "current" },
                }),
                worktreePath,
              }),
        },
      });
      if (commandFailure(result)) {
        reportError("Could not create provider pane", "The canonical Thread was not created.");
        return null;
      }
      if (task) {
        const bound = await bindTaskThread({
          environmentId: project.environmentId,
          input: {
            taskId: task.id,
            threadId,
            ...(replaceExisting ? { replaceProviderExecution: true, modelSelection } : {}),
          },
        });
        if (commandFailure(bound)) {
          reportError("Could not bind provider pane", "The canonical Task rejected this Thread.");
          return null;
        }
        if (task.status === "draft") {
          const activated = await activateTask({
            environmentId: project.environmentId,
            input: { taskId: task.id },
          });
          if (commandFailure(activated)) {
            reportError("Could not start Task", "The canonical Task transition was rejected.");
            return null;
          }
        }
        const latestReview = task.reviews?.at(-1) ?? null;
        const started = await startThreadTurn({
          environmentId: project.environmentId,
          input: {
            threadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: [
                `Task: ${task.title}`,
                `Task ID: ${task.id}`,
                `Role: ${task.role}`,
                `Workspace: ${task.workspace!.path!}`,
                "",
                "Objective:",
                task.objective,
                "",
                "Acceptance criteria:",
                ...(task.acceptanceCriteria?.length
                  ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`)
                  : ["- None recorded"]),
                "",
                taskOwnershipContext(task),
                ...(replaceExisting
                  ? [
                      "",
                      `This is a supervised replacement for interrupted Thread ${task.threadId}.`,
                      "Inspect the current Git diff in this same Task worktree before editing.",
                      latestReview
                        ? `Latest review: ${latestReview.verdict ?? latestReview.status}. Required changes: ${latestReview.requiredChanges.join("; ") || "None"}.`
                        : "No review findings are currently attached.",
                    ]
                  : []),
              ].join("\n"),
              attachments: [],
            },
            modelSelection,
            titleSeed: task.title,
            runtimeMode: "full-access",
            interactionMode: "default",
          },
        });
        if (commandFailure(started))
          reportError(
            "Task is active, but provider start failed",
            "The Task and worktree were preserved. Retry from the canonical Thread.",
          );
      }
      const pane = addPane({
        type: "provider",
        title: task ? `${task.title} · ${entry.displayName}` : entry.displayName,
        taskId: task?.id ?? null,
        threadId,
        providerInstanceId: entry.instanceId,
        agentSurface: "chat",
        linkedPaneId,
        workspacePath,
      });
      if (pane && linkedPaneId)
        updateActiveWorkspace((workspace) => linkAgentPaneViews(workspace, linkedPaneId, pane.id));
      return pane;
    },
    [
      activateTask,
      addPane,
      bindTaskThread,
      createThread,
      project.environmentId,
      project.id,
      project.workspaceRoot,
      startThreadTurn,
      threadById,
      updateActiveWorkspace,
    ],
  );

  const hostThreadId = activeWorkspace
    ? terminalWorkspaceHostThreadId(project.id, activeWorkspace.id)
    : terminalWorkspaceHostThreadId(project.id, "default");
  const previewThreadRef = useMemo<ScopedThreadRef>(
    () => ({
      environmentId: project.environmentId,
      threadId: ThreadId.make(hostThreadId),
    }),
    [hostThreadId, project.environmentId],
  );

  const launchProviderTerminal = useCallback(
    async (
      entry: ProviderInstanceEntry,
      task: OrchestrationTask | null = null,
      linkedPaneId: string | null = null,
      originWorkspace: ReturnType<typeof resolveAgentWorkspace> | null = null,
    ) => {
      const launch = providerTerminalLaunches.get(entry.instanceId) ?? null;
      if (!isProviderInstancePickerReady(entry) || !launch) {
        reportError(
          `${entry.displayName} terminal unavailable`,
          launch
            ? (entry.snapshot.message ?? "This provider is not ready yet.")
            : "This provider driver does not publish an interactive CLI launcher.",
        );
        return null;
      }
      if (task && (task.workspace?.status !== "ready" || !task.workspace.path)) {
        reportError(
          "Task workspace is not ready",
          task.workspace?.failureReason ?? "Wait for the canonical worktree to finish preparing.",
        );
        return null;
      }
      const terminalId = `agent-${entry.instanceId}-${randomUUID()}`;
      const { cwd: workspacePath, worktreePath } = resolveAgentWorkspace({
        projectPath: project.workspaceRoot,
        taskWorkspace: task?.workspace ?? null,
        chatWorktreePath: originWorkspace?.worktreePath ?? null,
        paneWorkspacePath: originWorkspace?.cwd ?? null,
      });
      const pane = addPane({
        type: "shell",
        title: task
          ? `${task.title} · ${entry.displayName} Terminal`
          : `${entry.displayName} Terminal`,
        taskId: task?.id ?? null,
        providerInstanceId: entry.instanceId,
        agentSurface: "terminal",
        linkedPaneId,
        terminalId,
        terminalThreadId: hostThreadId,
        command: launch.command,
        dock: { area: "left" },
        workspacePath,
      });
      if (!pane) return null;
      if (linkedPaneId)
        updateActiveWorkspace((workspace) => linkAgentPaneViews(workspace, linkedPaneId, pane.id));
      const opened = await openTerminal({
        environmentId: project.environmentId,
        input: {
          threadId: hostThreadId,
          terminalId,
          cwd: workspacePath,
          ...(worktreePath ? { worktreePath } : {}),
          cols: 120,
          rows: 30,
          ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
        },
      });
      if (commandFailure(opened)) {
        reportError(
          `Could not open ${entry.displayName} Terminal`,
          `Could not open workspace ${workspacePath}. Restore the directory and retry; no agent command was started.`,
        );
        return pane;
      }
      const written = await writeTerminal({
        environmentId: project.environmentId,
        input: { threadId: hostThreadId, terminalId, data: `${launch.command}\r` },
      });
      if (commandFailure(written))
        reportError(
          `Could not start ${entry.displayName}`,
          "The provider command was not written. The terminal remains available.",
        );
      return pane;
    },
    [
      addPane,
      hostThreadId,
      openTerminal,
      project.environmentId,
      project.workspaceRoot,
      providerTerminalLaunches,
      updateActiveWorkspace,
      writeTerminal,
    ],
  );

  const switchAgentSurface = useCallback(
    async (pane: TerminalWorkspacePane, surface: "chat" | "terminal") => {
      if (pane.agentSurface === surface) return pane;
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const currentWorkspace = currentState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace?.id,
      );
      if (!currentWorkspace) return null;
      const linkedPane = pane.linkedPaneId
        ? currentWorkspace.panes.find((candidate) => candidate.id === pane.linkedPaneId)
        : null;
      if (linkedPane?.agentSurface === surface) {
        updateActiveWorkspace((workspace) => activateAgentSurfaceView(workspace, pane.id, surface));
        return linkedPane;
      }
      const thread = pane.threadId ? threadById.get(ThreadId.make(pane.threadId)) : null;
      const entry = providerEntries.find(
        (candidate) =>
          candidate.instanceId ===
          (pane.providerInstanceId ?? thread?.modelSelection.instanceId ?? ""),
      );
      if (!entry) {
        reportError("Provider unavailable", "This pane no longer has a configured provider.");
        return null;
      }
      const task = pane.taskId ? (taskById.get(TaskId.make(pane.taskId)) ?? null) : null;
      const originWorkspace = resolveAgentWorkspace({
        projectPath: project.workspaceRoot,
        chatWorktreePath: thread?.worktreePath ?? null,
        paneWorkspacePath: pane.workspacePath,
      });
      if (agentSurfaceLaunchesRef.current.has(pane.id)) return null;
      agentSurfaceLaunchesRef.current.add(pane.id);
      try {
        return surface === "chat"
          ? await launchProvider(entry, task, false, pane.id, originWorkspace)
          : await launchProviderTerminal(entry, task, pane.id, originWorkspace);
      } finally {
        agentSurfaceLaunchesRef.current.delete(pane.id);
      }
    },
    [
      activeWorkspace?.id,
      launchProvider,
      launchProviderTerminal,
      project.id,
      project.workspaceRoot,
      providerEntries,
      taskById,
      threadById,
      updateActiveWorkspace,
    ],
  );

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
        taskId: taskContext?.id ?? null,
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
      taskContext?.id,
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
        taskId: taskContext?.id ?? null,
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
      taskContext?.id,
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
          updateActiveWorkspace((workspace) => {
            const restored = existingPreview.visible
              ? workspace
              : restoreWorkspacePane(workspace, existingPreview.id);
            return {
              ...restored,
              mode: "build_preview",
              previewPaneId: existingPreview.id,
            };
          });
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
        taskId: taskContext?.id ?? null,
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
        taskId: taskContext?.id ?? null,
        previewUrl: server.url,
        attachedPaneId: devPane.id,
        workspacePath: selectedWorkspacePath,
      });
      if (previewPane) {
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          mode: "build_preview",
          previewPaneId: previewPane.id,
        }));
        setPreviewStagePaneId(previewPane.id);
      }
      setAddPaneOpen(false);
    },
    [
      activeWorkspace?.id,
      addPane,
      project.id,
      selectedWorkspacePath,
      taskContext?.id,
      updateActiveWorkspace,
    ],
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

  const projectServiceTitle = useCallback(
    (service: TerminalWorkspaceProjectService) =>
      devServerProfiles.find((profile) => profile.id === service.devServerProfileId)?.name ??
      service.server.processName ??
      `Web App :${service.server.port}`,
    [devServerProfiles],
  );

  const addProjectServicePreview = useCallback(
    (service: TerminalWorkspaceProjectService) => {
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const currentWorkspace = currentState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace?.id,
      );
      if (!currentWorkspace) return;
      const existing = currentWorkspace.panes.find(
        (pane) =>
          pane.type === "preview" &&
          pane.previewUrl === service.server.url &&
          pane.sourceWorkspaceId === service.sourceWorkspaceId,
      );
      if (existing) {
        updateActiveWorkspace((workspace) => {
          const restored = existing.visible
            ? workspace
            : restoreWorkspacePane(workspace, existing.id);
          return { ...restored, selectedPaneId: existing.id };
        });
      } else {
        addPane({
          type: "preview",
          title: `${projectServiceTitle(service)} Preview`,
          previewUrl: service.server.url,
          terminalId: service.terminalId,
          terminalThreadId: service.terminalThreadId,
          sourceWorkspaceId: service.sourceWorkspaceId,
          devServerProfileId: service.devServerProfileId,
          workspacePath: service.workspacePath,
        });
      }
      setAddPaneOpen(false);
    },
    [activeWorkspace?.id, addPane, project.id, projectServiceTitle, updateActiveWorkspace],
  );

  const addProjectServiceWithLogs = useCallback(
    (service: TerminalWorkspaceProjectService) => {
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const currentWorkspace = currentState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace?.id,
      );
      if (!currentWorkspace) return;
      const existingDevPane = currentWorkspace.panes.find(
        (pane) =>
          pane.type === "dev_server" &&
          (pane.terminalThreadId ??
            terminalWorkspaceHostThreadId(project.id, currentWorkspace.id)) ===
            service.terminalThreadId &&
          pane.terminalId === service.terminalId,
      );
      if (existingDevPane && !existingDevPane.visible) {
        updateActiveWorkspace((workspace) => restoreWorkspacePane(workspace, existingDevPane.id));
      }
      const devPane =
        existingDevPane ??
        addPane({
          type: "dev_server",
          title: projectServiceTitle(service),
          previewUrl: service.server.url,
          terminalId: service.terminalId,
          terminalThreadId: service.terminalThreadId,
          sourceWorkspaceId: service.sourceWorkspaceId,
          devServerProfileId: service.devServerProfileId,
          workspacePath: service.workspacePath,
        });
      if (!devPane) return;
      const latestState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      const latestWorkspace = latestState?.workspaces.find(
        (workspace) => workspace.id === activeWorkspace?.id,
      );
      const existingLogs = latestWorkspace?.panes.find(
        (pane) =>
          pane.type === "logs" &&
          (pane.terminalThreadId ??
            terminalWorkspaceHostThreadId(project.id, currentWorkspace.id)) ===
            service.terminalThreadId &&
          pane.terminalId === service.terminalId,
      );
      if (existingLogs) {
        updateActiveWorkspace((workspace) => {
          const restored = existingLogs.visible
            ? workspace
            : restoreWorkspacePane(workspace, existingLogs.id);
          return { ...restored, selectedPaneId: existingLogs.id };
        });
      } else {
        addPane({
          type: "logs",
          title: `${projectServiceTitle(service)} Logs`,
          previewUrl: service.server.url,
          terminalId: service.terminalId,
          terminalThreadId: service.terminalThreadId,
          sourceWorkspaceId: service.sourceWorkspaceId,
          devServerProfileId: service.devServerProfileId,
          attachedPaneId: devPane.id,
          workspacePath: service.workspacePath,
        });
      }
      setAddPaneOpen(false);
    },
    [activeWorkspace?.id, addPane, project.id, projectServiceTitle, updateActiveWorkspace],
  );

  const focusProjectServiceOrigin = useCallback(
    (service: TerminalWorkspaceProjectService) => {
      const currentState = useUiStateStore.getState().terminalWorkspacesByProjectId[project.id];
      if (!currentState) return;
      persistProjectState({
        ...currentState,
        activeWorkspaceId: service.sourceWorkspaceId,
        workspaces: currentState.workspaces.map((workspace) =>
          workspace.id === service.sourceWorkspaceId && service.sourcePaneId
            ? {
                ...workspace,
                selectedPaneId: service.sourcePaneId,
                panes: workspace.panes.map((pane) =>
                  pane.id === service.sourcePaneId ? { ...pane, visible: true } : pane,
                ),
              }
            : workspace,
        ),
      });
      setPreviewStagePaneId(null);
      setPreviewTray("closed");
      setAddPaneOpen(false);
    },
    [persistProjectState, project.id],
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
      taskId: taskContext?.id ?? null,
      terminalId: `tests-${randomUUID()}`,
      command,
      workspacePath: selectedWorkspacePath,
    });
    setTestCommand("");
    if (pane) void startTests(pane);
  }, [addPane, selectedWorkspacePath, startTests, taskContext?.id, testCommand]);

  const splitSelectedPane = useCallback(
    (placement: "right" | "bottom") => {
      const targetPaneId = activeWorkspace?.selectedPaneId ?? null;
      const pane = addPane({
        type: "shell",
        title: taskContext ? `${taskContext.title} Shell` : "Shell",
        taskId: taskContext?.id ?? null,
        terminalId: `shell-${randomUUID()}`,
        workspacePath: selectedWorkspacePath,
      });
      if (!pane || !targetPaneId) return;
      updateActiveWorkspace((workspace) =>
        movePaneInWorkspaceLayout(workspace, pane.id, {
          targetPaneId,
          placement,
          nodeId: `layout:${randomUUID()}`,
        }),
      );
    },
    [
      activeWorkspace?.selectedPaneId,
      addPane,
      selectedWorkspacePath,
      taskContext,
      updateActiveWorkspace,
    ],
  );

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
      if (quickAddOpen || addPaneOpen || taskCreateOpen) return;
      if (event.key === "Escape") {
        if (previewStagePaneId || (activeWorkspace?.mode && activeWorkspace.mode !== "workbench")) {
          event.preventDefault();
          setPreviewStagePaneId(null);
          setPreviewTray("closed");
          updateActiveWorkspace((workspace) => ({ ...workspace, mode: "workbench" }));
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
      if (event.key === "\\") {
        event.preventDefault();
        splitSelectedPane(event.shiftKey ? "bottom" : "right");
      } else if (event.altKey && event.key.toLowerCase() === "t") {
        const selectedPaneId = activeWorkspace?.selectedPaneId;
        const visible = activeWorkspace?.panes.filter((pane) => pane.visible) ?? [];
        const selectedIndex = visible.findIndex((pane) => pane.id === selectedPaneId);
        const nextPane = visible[(selectedIndex + 1) % visible.length];
        if (selectedPaneId && nextPane && nextPane.id !== selectedPaneId) {
          event.preventDefault();
          updateActiveWorkspace((workspace) =>
            movePaneInWorkspaceLayout(workspace, nextPane.id, {
              targetPaneId: selectedPaneId,
              placement: "tab",
              nodeId: `layout:${randomUUID()}`,
            }),
          );
        }
      } else if (event.key === "Enter" && activeWorkspace?.selectedPaneId) {
        event.preventDefault();
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          focusedPaneId: workspace.selectedPaneId,
        }));
      } else if (event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        addPane({
          type: "shell",
          title: taskContext ? `${taskContext.title} Shell` : "Shell",
          taskId: taskContext?.id ?? null,
          terminalId: `shell-${randomUUID()}`,
          workspacePath: selectedWorkspacePath,
        });
      } else if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        const entry = providerEntries.find(
          (candidate) =>
            candidate.driverKind === "codex" && isProviderInstancePickerReady(candidate),
        );
        if (entry) void launchProvider(entry, taskContext);
      } else if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const entry = providerEntries.find(
          (candidate) =>
            candidate.driverKind === "antigravity" && isProviderInstancePickerReady(candidate),
        );
        if (entry) void launchProvider(entry, taskContext);
      } else if (!event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setQuickAddOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    activeWorkspace?.focusedPaneId,
    activeWorkspace?.mode,
    activeWorkspace?.selectedPaneId,
    addPaneOpen,
    addPane,
    launchProvider,
    maximizedPaneId,
    previewStagePaneId,
    providerEntries,
    quickAddOpen,
    selectedWorkspacePath,
    splitSelectedPane,
    taskCreateOpen,
    taskContext,
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
  const activeMode = activeWorkspace.mode ?? "workbench";
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
        session.target.threadId === (pane.terminalThreadId ?? hostThreadId) &&
        session.target.terminalId === pane.terminalId,
    );
  const serverForPane = (pane: TerminalWorkspacePane) =>
    pane.externalServer
      ? (discoveredServers.find(
          (server) =>
            server.host === pane.externalServer?.host && server.port === pane.externalServer.port,
        ) ?? null)
      : discoveredServerForTerminal({
          servers: discoveredServers,
          threadId: pane.terminalThreadId ?? hostThreadId,
          terminalId: pane.terminalId,
        });
  const stagePaneId =
    previewStagePaneId ??
    activeWorkspace.previewPaneId ??
    visiblePanes.find((pane) => pane.type === "preview")?.id ??
    null;
  const stagePane = stagePaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === stagePaneId) ?? null)
    : null;
  const attachedStageDevPane = stagePane?.attachedPaneId
    ? (activeWorkspace.panes.find((pane) => pane.id === stagePane.attachedPaneId) ?? null)
    : stagePane?.devServerProfileId
      ? (activeWorkspace.panes.find(
          (pane) =>
            pane.type === "dev_server" &&
            pane.devServerProfileId === stagePane.devServerProfileId &&
            pane.visible,
        ) ?? null)
      : (visiblePanes.find((pane) => pane.type === "dev_server") ?? null);
  const stageDevPane =
    attachedStageDevPane ?? visiblePanes.find((pane) => pane.type === "dev_server") ?? null;
  const stageProfileId = stagePane?.devServerProfileId ?? stageDevPane?.devServerProfileId ?? null;
  const stageProfile = stageProfileId
    ? (devServerProfiles.find((profile) => profile.id === stageProfileId) ?? null)
    : null;
  const stageServer = stageDevPane
    ? serverForPane(stageDevPane)
    : (discoveredServers.find((server) => server.url === stagePane?.previewUrl) ?? null);
  const stageProcessRunning = stageDevPane
    ? sessionForPane(stageDevPane)?.state.hasRunningSubprocess === true
    : false;
  const stageUrl = stageServer?.url || stagePane?.previewUrl || stageProfile?.previewUrl || "";
  const designStageUrl = designMode && designPreviewBinding ? designPreviewBinding.url : stageUrl;
  const designStageTitle =
    designMode && designPreviewBinding
      ? designPreviewBinding.title
      : (stagePane?.title ?? "Preview");
  const stagePreviewState = stageServer
    ? !isPreviewSupportedInRuntime() && stageServer.embeddingPolicy === "blocked"
      ? "blocked"
      : "ready"
    : stageProcessRunning
      ? "connecting"
      : stageUrl
        ? "stopped"
        : "idle";
  const providerPanes = visiblePanes.filter(
    (pane) =>
      (pane.type === "provider" || pane.type === "thread") &&
      pane.threadId &&
      threadById.has(ThreadId.make(pane.threadId)),
  );
  const providerTerminalPanes = visiblePanes.filter(
    (pane) => pane.agentSurface === "terminal" && Boolean(pane.providerInstanceId),
  );
  const stageAgentPanes = [...providerPanes, ...providerTerminalPanes];
  const selectedStageAgent =
    stageAgentPanes.find((pane) => pane.id === stageAgentPaneId) ?? stageAgentPanes[0] ?? null;
  const designTargetPanes = activeWorkspace.panes.filter(
    (pane) =>
      (pane.type === "provider" || pane.type === "thread") &&
      pane.threadId &&
      threadById.has(ThreadId.make(pane.threadId)),
  );
  const designLaunchProviders = providerEntries.filter(
    (entry) =>
      isProviderInstancePickerReady(entry) &&
      !designTargetPanes.some((pane) => {
        const thread = pane.threadId ? threadById.get(ThreadId.make(pane.threadId)) : null;
        return (pane.providerInstanceId ?? thread?.modelSelection.instanceId) === entry.instanceId;
      }),
  );
  const selectedDesignTargetPane =
    designTargetPanes.find((pane) => pane.id === stageAgentPaneId) ?? designTargetPanes[0] ?? null;
  const designTargetThread = selectedDesignTargetPane?.threadId
    ? (threadById.get(ThreadId.make(selectedDesignTargetPane.threadId)) ?? null)
    : null;
  const designTargetThreadRef = designTargetThread
    ? ({
        environmentId: project.environmentId,
        threadId: designTargetThread.id,
      } satisfies ScopedThreadRef)
    : undefined;
  const selectDesignTarget = (value: string) => {
    if (!value.startsWith("provider:")) {
      setStageAgentPaneId(value || null);
      return;
    }
    const instanceId = value.slice("provider:".length);
    const entry = providerEntries.find((candidate) => candidate.instanceId === instanceId);
    if (!entry) return;
    const terminalPane = providerTerminalPanes.find(
      (pane) => pane.providerInstanceId === entry.instanceId,
    );
    void (terminalPane ? switchAgentSurface(terminalPane, "chat") : launchProvider(entry)).then(
      (pane) => {
        if (pane) setStageAgentPaneId(pane.id);
      },
    );
  };
  const enterDesignMode = () => {
    if (!stageUrl) return;
    setDesignPreviewBinding({
      workspaceId: activeWorkspace.id,
      paneId: stagePane?.id ?? null,
      url: stageUrl,
      title: stagePane?.title ?? "Live Preview",
      returnMode: activeMode,
    });
    setDesignCapture(null);
    setDesignHandoffStatus("idle");
    setDesignMode(true);
    setPreviewTray("closed");
    updateActiveWorkspace((workspace) => ({ ...workspace, mode: "preview" }));
  };
  const exitDesignMode = (returnToWorkbench = false) => {
    const returnMode = returnToWorkbench
      ? "workbench"
      : (designPreviewBinding?.returnMode ?? "preview");
    setDesignMode(false);
    setDesignPreviewBinding(null);
    setDesignCapture(null);
    setDesignHandoffStatus("idle");
    updateActiveWorkspace((workspace) => ({ ...workspace, mode: returnMode }));
  };
  const sendDesignCapture = async (annotation: PreviewAnnotationPayload) => {
    if (!designTargetThread || !designTargetThreadRef) {
      reportError(
        "Choose an agent",
        "Design captures need a Chat agent target before they can send.",
      );
      return;
    }
    const screenshot = annotation.screenshot;
    const dataUrlBody = screenshot?.dataUrl.split(",", 2)[1] ?? "";
    const attachments = screenshot
      ? [
          {
            type: "image" as const,
            name: `preview-annotation-${annotation.id}.png`,
            mimeType: "image/png",
            sizeBytes: Math.floor((dataUrlBody.length * 3) / 4),
            dataUrl: screenshot.dataUrl,
          },
        ]
      : [];
    const result = await startThreadTurn({
      environmentId: project.environmentId,
      input: {
        threadId: designTargetThread.id,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: `${buildPreviewAnnotationPrompt(annotation)}\n\nNebula Design Mode scope: edit the project behind the preview already shown at ${designPreviewBinding?.url ?? stageUrl}. Keep this exact preview pane and running service; do not start, attach, or switch to a different preview server. The bound Workspace is ${designPreviewBinding?.workspaceId ?? activeWorkspace.id} and the bound Preview pane is ${designPreviewBinding?.paneId ?? "unassigned"}.`,
          attachments,
        },
        modelSelection: designTargetThread.modelSelection,
        runtimeMode: designTargetThread.runtimeMode,
        interactionMode: designTargetThread.interactionMode,
        createdAt: new Date().toISOString(),
      },
    });
    if (commandFailure(result)) {
      reportError("Capture handoff failed", "The target agent could not start a new turn.");
      return;
    }
    const draftStore = useComposerDraftStore.getState();
    draftStore.removePreviewAnnotation(designTargetThreadRef, annotation.id);
    draftStore.removeImage(designTargetThreadRef, annotation.id);
    setDesignHandoffStatus("sent");
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `Sent to ${selectedDesignTargetPane?.title ?? "agent"}`,
        description:
          "The capture is scoped to this exact Preview. Reload here when the agent changes land.",
      }),
    );
  };

  const renderPaneContent = (pane: TerminalWorkspacePane, active: boolean) => {
    if (pane.type === "shell")
      return (
        <WorkspaceTerminalViewport
          environmentId={project.environmentId}
          hostThreadId={pane.terminalThreadId ?? hostThreadId}
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
    if (pane.type === "file")
      return (
        <WorkspaceFilePane
          environmentId={project.environmentId}
          cwd={pane.workspacePath}
          relativePath={pane.filePath ?? null}
        />
      );
    if (pane.type === "diff") {
      const task = pane.taskId ? (taskById.get(TaskId.make(pane.taskId)) ?? null) : null;
      if (task)
        return (
          <div className="h-full overflow-auto p-2">
            <TaskChangesPanel
              environmentId={project.environmentId}
              task={task}
              provider={
                task.threadId ? threadById.get(task.threadId)?.modelSelection.instanceId : undefined
              }
            />
          </div>
        );
      return <RepositoryDiffPane environmentId={project.environmentId} cwd={pane.workspacePath} />;
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
      const liveServer = attachedDevPane
        ? serverForPane(attachedDevPane)
        : (discoveredServers.find((server) => server.url === pane.previewUrl) ?? null);
      const processRunning = attachedDevPane
        ? sessionForPane(attachedDevPane)?.state.hasRunningSubprocess === true
        : false;
      const previewUrl = liveServer?.url ?? pane.previewUrl ?? "";
      return (
        <PreviewSurface
          threadRef={previewThreadRef}
          url={previewUrl}
          title={pane.title}
          refreshKey={previewRefreshKey}
          state={
            liveServer
              ? !isPreviewSupportedInRuntime() && liveServer.embeddingPolicy === "blocked"
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
          hostThreadId={pane.terminalThreadId ?? hostThreadId}
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
                  input: {
                    threadId: pane.terminalThreadId ?? hostThreadId,
                    terminalId: pane.terminalId ?? undefined,
                  },
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
              hostThreadId={pane.terminalThreadId ?? hostThreadId}
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
    const reusedProjectService =
      Boolean(pane.sourceWorkspaceId) && pane.sourceWorkspaceId !== activeWorkspace.id;
    const sourceWorkspaceName = reusedProjectService
      ? (workspaceState.workspaces.find((workspace) => workspace.id === pane.sourceWorkspaceId)
          ?.name ?? "another Workspace")
      : null;
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
        updateActiveWorkspace((workspace) => {
          const restored = existingPreview.visible
            ? workspace
            : restoreWorkspacePane(workspace, existingPreview.id);
          return {
            ...restored,
            mode: "preview",
            previewPaneId: existingPreview.id,
            focusedPaneId: null,
          };
        });
        setPreviewStagePaneId(existingPreview.id);
        return;
      }
      const preview = addPane({
        type: "preview",
        title: `${pane.title} Preview`,
        previewUrl,
        devServerProfileId: profile?.id ?? null,
        attachedPaneId: pane.id,
        terminalThreadId: pane.terminalThreadId ?? null,
        sourceWorkspaceId: pane.sourceWorkspaceId ?? null,
        workspacePath: pane.workspacePath,
      });
      if (preview) {
        setPreviewStagePaneId(preview.id);
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          mode: "preview",
          previewPaneId: preview.id,
          focusedPaneId: null,
        }));
      }
    };
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/70 p-1.5">
          <span
            className={`mr-1 text-[10px] ${status === "Running" ? "text-emerald-500" : "text-muted-foreground"}`}
          >
            {status}
          </span>
          {profile && !reusedProjectService ? (
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
                  <EyeIcon /> Preview
                </Button>
              ) : null}
            </>
          ) : reusedProjectService ? (
            <>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                Running in {sourceWorkspaceName}
              </span>
              <Button
                size="micro"
                variant="ghost"
                disabled={!serverVerified}
                onClick={openPanePreviewStage}
              >
                <EyeIcon /> Preview
              </Button>
            </>
          ) : pane.externalServer ? (
            <>
              <Button
                size="micro"
                variant="ghost"
                disabled={!serverVerified}
                onClick={openPanePreviewStage}
              >
                <EyeIcon /> Preview
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
              hostThreadId={pane.terminalThreadId ?? hostThreadId}
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

  const workspaceLayoutTree = normalizeWorkspaceLayoutTree(
    activeWorkspace.layoutTree,
    activeWorkspace.panes,
    activeWorkspace.workbenchColumnRatios,
  );
  const changePaneFormat = (pane: TerminalWorkspacePane, type: TerminalWorkspacePaneType) => {
    const hasAgentIdentity = Boolean(pane.providerInstanceId || pane.threadId);
    const paneThread = pane.threadId ? threadById.get(ThreadId.make(pane.threadId)) : null;
    const agentName =
      providerEntries.find(
        (entry) =>
          entry.instanceId ===
          (pane.providerInstanceId ?? paneThread?.modelSelection.instanceId ?? ""),
      )?.displayName ?? "Agent";
    if (type === "provider") {
      if (
        hasAgentIdentity &&
        pane.agentSurface === "chat" &&
        pane.type !== "provider" &&
        pane.type !== "thread"
      ) {
        updateActiveWorkspace((workspace) =>
          activateWorkspaceLayoutPane(
            setWorkspacePaneFormat(workspace, pane.id, {
              type: "provider",
              title: agentName,
            }),
            pane.id,
          ),
        );
      } else if (hasAgentIdentity) void switchAgentSurface(pane, "chat");
      return;
    }
    if (type === "shell" && hasAgentIdentity) {
      if (pane.agentSurface === "terminal" && pane.type !== "shell") {
        updateActiveWorkspace((workspace) =>
          activateWorkspaceLayoutPane(
            setWorkspacePaneFormat(workspace, pane.id, {
              type: "shell",
              title: `${agentName} Terminal`,
              terminalId: pane.terminalId ?? `provider-terminal-${pane.id}`,
            }),
            pane.id,
          ),
        );
      } else void switchAgentSurface(pane, "terminal");
      return;
    }
    const titleByType: Partial<Record<TerminalWorkspacePaneType, string>> = {
      shell: "Terminal",
      preview: "Live Preview",
      logs: "Dev Logs",
      diff: "Working Diff",
      git: "Source Control",
      tests: "Tests",
    };
    updateActiveWorkspace((workspace) =>
      setWorkspacePaneFormat(
        workspace,
        pane.id,
        {
          type,
          title: titleByType[type] ?? pane.title,
          ...(type === "preview"
            ? {
                previewUrl: designStageUrl || pane.previewUrl,
                attachedPaneId: stageDevPane?.id ?? pane.attachedPaneId,
              }
            : {}),
          ...(type === "logs"
            ? {
                terminalId: stageDevPane?.terminalId ?? pane.terminalId ?? "logs",
                terminalThreadId: stageDevPane?.terminalThreadId ?? pane.terminalThreadId,
              }
            : {}),
          ...(type === "tests"
            ? {
                terminalId: pane.terminalId ?? `tests-${pane.id}`,
                command: pane.command ?? (testCommand || "npm test"),
              }
            : {}),
          ...(type === "shell" ? { terminalId: pane.terminalId ?? `shell-${pane.id}` } : {}),
        },
        undefined,
      ),
    );
  };
  const dropPane = (
    event: React.DragEvent,
    targetPaneId: string,
    placement: "left" | "right" | "top" | "bottom" | "tab",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const paneId = event.dataTransfer.getData("application/x-nebula-pane") || draggingPaneId;
    if (!paneId) return;
    updateActiveWorkspace((workspace) =>
      movePaneInWorkspaceLayout(workspace, paneId, {
        targetPaneId,
        placement,
        nodeId: `layout:${randomUUID()}`,
      }),
    );
    setDraggingPaneId(null);
  };
  const dropPaneAtWorkspaceEdge = (
    event: React.DragEvent,
    placement: "left" | "right" | "top" | "bottom",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const paneId = event.dataTransfer.getData("application/x-nebula-pane") || draggingPaneId;
    if (!paneId) return;
    const targetPaneId =
      (activeWorkspace.selectedPaneId !== paneId ? activeWorkspace.selectedPaneId : null) ??
      visiblePanes.find((pane) => pane.id !== paneId)?.id ??
      null;
    if (!targetPaneId) return;
    updateActiveWorkspace((workspace) =>
      movePaneInWorkspaceLayout(workspace, paneId, {
        targetPaneId,
        placement,
        nodeId: `layout:${randomUUID()}`,
      }),
    );
    setDraggingPaneId(null);
  };
  const renderWorkbenchStack = (node: Extract<TerminalWorkspaceLayoutNode, { kind: "stack" }>) => {
    const panes = node.paneIds.flatMap((paneId) => {
      const pane = activeWorkspace.panes.find((candidate) => candidate.id === paneId);
      return pane?.visible ? [pane] : [];
    });
    if (panes.length === 0)
      return (
        <EmptyWorkbenchSlot
          key={node.id}
          nodeId={node.id}
          removable={workspaceLayoutTree.kind === "split"}
          onAdd={() => {
            setQuickAddTargetStackId(node.id);
            setQuickAddOpen(true);
          }}
          onRemove={() =>
            runTerminalWorkspaceLayoutTransition(() => {
              updateActiveWorkspace((workspace) =>
                removeEmptyWorkspaceLayoutSlot(workspace, node.id),
              );
            })
          }
        />
      );
    const pane =
      panes.find((candidate) => candidate.id === activeWorkspace.selectedPaneId) ??
      panes.find((candidate) => candidate.id === node.activePaneId) ??
      panes[0]!;
    const selected = activeWorkspace.selectedPaneId === pane.id;
    const thread = pane.threadId ? threadById.get(ThreadId.make(pane.threadId)) : null;
    const working =
      thread?.latestTurn?.state === "running" ||
      sessionForPane(pane)?.state.hasRunningSubprocess === true;
    const resizeBindings = resolveWorkspacePaneResizeBindings(workspaceLayoutTree, pane.id);
    const canExtendWorkbenchFloor =
      selected && isWorkspacePaneOnBottomEdge(workspaceLayoutTree, pane.id);
    const floorSplitBindings = resizeBindings.filter(
      (binding) => binding.direction === "vertical" && binding.edge === "top",
    );
    const providerLabel =
      providerEntries.find(
        (entry) =>
          entry.instanceId === (pane.providerInstanceId ?? thread?.modelSelection.instanceId ?? ""),
      )?.displayName ?? null;
    return (
      <article
        key={node.id}
        data-terminal-workspace-pane={pane.id}
        data-pane-type={pane.type}
        tabIndex={0}
        aria-label={`${pane.title} pane`}
        className={`group/pane relative flex h-full min-h-32 w-full min-w-40 flex-col overflow-hidden rounded-xl border bg-card shadow-sm ${selected ? "border-primary ring-1 ring-primary/35" : "border-border"}`}
        style={{ viewTransitionName: terminalWorkspaceSlotTransitionName(node.id) }}
        onFocus={() =>
          updateActiveWorkspace((workspace) => activateWorkspaceLayoutPane(workspace, pane.id))
        }
      >
        {panes.length > 1 ? (
          <div className="flex h-8 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/20 px-1 pt-1">
            {panes.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`max-w-44 truncate rounded-t-md border border-b-0 px-2 py-1 text-[10px] ${tab.id === pane.id ? "border-border bg-card text-foreground" : "border-transparent text-muted-foreground hover:bg-muted"}`}
                onClick={() =>
                  updateActiveWorkspace((workspace) => ({
                    ...activateWorkspaceLayoutPane(workspace, tab.id),
                  }))
                }
              >
                {tab.title}
              </button>
            ))}
          </div>
        ) : null}
        <PaneHeader
          pane={pane}
          task={pane.taskId ? (taskById.get(TaskId.make(pane.taskId)) ?? null) : null}
          selected={selected}
          working={working}
          maximized={maximizedPaneId === pane.id}
          draggable
          onSelect={() =>
            updateActiveWorkspace((workspace) => activateWorkspaceLayoutPane(workspace, pane.id))
          }
          onFocus={() =>
            updateActiveWorkspace((workspace) => ({
              ...workspace,
              focusedPaneId: pane.id,
              selectedPaneId: pane.id,
            }))
          }
          onMaximize={() => setMaximizedPaneId((current) => (current === pane.id ? null : pane.id))}
          onHide={() => updateActiveWorkspace((workspace) => hideWorkspacePane(workspace, pane.id))}
          onInspectTask={() => {
            if (pane.taskId) setInspectedTaskId(TaskId.make(pane.taskId));
          }}
          onSwitchAgentSurface={(surface) => void switchAgentSurface(pane, surface)}
          onChangePaneFormat={(type) => changePaneFormat(pane, type)}
          onOpenQuickAdd={() => setQuickAddOpen(true)}
          providerLabel={providerLabel}
          originLabel={
            pane.sourceWorkspaceId && pane.sourceWorkspaceId !== activeWorkspace.id
              ? `Reused from ${workspaceState.workspaces.find((workspace) => workspace.id === pane.sourceWorkspaceId)?.name ?? "another Workspace"}`
              : null
          }
          onResize={() => setMaximizedPaneId((current) => (current === pane.id ? null : pane.id))}
          onDragStart={(event) => {
            setDraggingPaneId(pane.id);
            event.dataTransfer.setData("application/x-nebula-pane", pane.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => setDraggingPaneId(null)}
        />
        <div
          className="min-h-0 flex-1"
          onMouseDown={() =>
            updateActiveWorkspace((workspace) => activateWorkspaceLayoutPane(workspace, pane.id))
          }
        >
          {renderPaneContent(pane, true)}
        </div>
        <PaneResizeHandles
          paneTitle={pane.title}
          bindings={resizeBindings}
          layoutRoot={workbenchLayoutRef}
          visible={selected}
          onCommit={(nodeId, ratio) =>
            updateActiveWorkspace((workspace) =>
              resizeWorkspaceLayoutSplit(workspace, nodeId, ratio),
            )
          }
        />
        {canExtendWorkbenchFloor ? (
          <WorkbenchFloorResizeHandle
            paneTitle={pane.title}
            layoutRoot={workbenchLayoutRef}
            scrollRoot={mainRef}
            verticalBindings={floorSplitBindings}
            onCommit={(height, splitRatios) =>
              updateActiveWorkspace((workspace) =>
                resizeWorkspaceFloor(workspace, height, splitRatios),
              )
            }
          />
        ) : null}
        {draggingPaneId && draggingPaneId !== pane.id ? (
          <div className="absolute inset-1 z-50 grid grid-cols-[1fr_1.3fr_1fr] grid-rows-3 gap-1 rounded-lg bg-background/90 p-2 backdrop-blur-sm">
            <button
              type="button"
              className="row-span-3 rounded-md border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPane(event, pane.id, "left")}
            >
              Left
            </button>
            <button
              type="button"
              className="rounded-md border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPane(event, pane.id, "top")}
            >
              Top
            </button>
            <button
              type="button"
              className="col-start-2 row-start-2 rounded-md border border-primary bg-primary/20 text-[10px] font-medium text-primary hover:bg-primary/30"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPane(event, pane.id, "tab")}
            >
              Tab
            </button>
            <button
              type="button"
              className="col-start-2 row-start-3 rounded-md border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPane(event, pane.id, "bottom")}
            >
              Bottom
            </button>
            <button
              type="button"
              className="col-start-3 row-span-3 row-start-1 rounded-md border border-primary/60 bg-primary/10 text-[10px] font-medium text-primary hover:bg-primary/20"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPane(event, pane.id, "right")}
            >
              Right
            </button>
          </div>
        ) : null}
      </article>
    );
  };
  const renderWorkspaceLayoutNode = (node: TerminalWorkspaceLayoutNode): ReactNode => {
    if (node.kind === "stack") return renderWorkbenchStack(node);
    return (
      <ResizablePair
        key={node.id}
        nodeId={node.id}
        direction={node.direction}
        ratio={node.ratio}
        minRatio={15}
        maxRatio={85}
        label={`Resize ${node.direction === "horizontal" ? "left and right" : "top and bottom"} panes`}
        onCommit={(ratio) =>
          updateActiveWorkspace((workspace) =>
            resizeWorkspaceLayoutSplit(workspace, node.id, ratio),
          )
        }
        className="h-full min-h-0 min-w-0"
        first={
          <div
            className={
              node.direction === "horizontal" ? "min-h-0 min-w-0 pr-1" : "min-h-0 min-w-0 pb-1"
            }
          >
            {renderWorkspaceLayoutNode(node.first)}
          </div>
        }
        second={
          <div
            className={
              node.direction === "horizontal" ? "min-h-0 min-w-0 pl-1" : "min-h-0 min-w-0 pt-1"
            }
          >
            {renderWorkspaceLayoutNode(node.second)}
          </div>
        }
      />
    );
  };

  const stagePreview = (
    <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <PreviewSurface
        threadRef={previewThreadRef}
        {...(designMode && designTargetThreadRef
          ? { annotationThreadRef: designTargetThreadRef }
          : {})}
        url={designStageUrl}
        title={designStageTitle}
        refreshKey={previewRefreshKey}
        state={stagePreviewState}
        {...(designMode
          ? {
              pickRequestNonce: designPickRequestNonce,
              persistAnnotationToDraft: false,
              onAnnotationCaptured: (annotation: PreviewAnnotationPayload) => {
                setDesignCapture(annotation);
                setDesignHandoffStatus("idle");
              },
              onSendAnnotation: (annotation: PreviewAnnotationPayload) => {
                void sendDesignCapture(annotation);
              },
            }
          : {})}
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
  );
  const stageAgent = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <BotIcon className="size-3.5" />
        <span className="text-xs font-medium">Active Agent</span>
        <select
          aria-label="Pin active agent"
          value={selectedStageAgent?.id ?? ""}
          onChange={(event) => setStageAgentPaneId(event.currentTarget.value)}
          className="ml-auto max-w-40 rounded border border-border bg-background px-1.5 py-1 text-[10px]"
        >
          {stageAgentPanes.length === 0 ? <option value="">No live agent</option> : null}
          {stageAgentPanes.map((pane) => (
            <option key={pane.id} value={pane.id}>
              {pane.title} · {pane.agentSurface === "terminal" ? "Terminal" : "Chat"}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        {selectedStageAgent ? (
          renderPaneContent(selectedStageAgent, true)
        ) : (
          <div className="grid h-full place-items-center p-4 text-center">
            <div className="max-w-64">
              <BotIcon className="mx-auto size-6 text-primary" />
              <p className="mt-3 text-xs font-medium">Choose a live agent</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                The previous Chat thread is unavailable. Start another agent or return to the
                Workbench; this rail never blocks the rest of the workspace.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="micro" onClick={() => setQuickAddOpen(true)}>
                  <PlusIcon /> New agent
                </Button>
                <Button
                  size="micro"
                  variant="outline"
                  onClick={() =>
                    updateActiveWorkspace((workspace) => ({ ...workspace, mode: "workbench" }))
                  }
                >
                  <Grid2X2Icon /> Workbench
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
  const stageLogs = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-xs font-medium">
        <FileClockIcon className="size-3.5" /> Dev Logs
      </div>
      <div className="min-h-0 flex-1">
        {stageDevPane?.terminalId || stagePane?.terminalId ? (
          <WorkspaceTerminalViewport
            environmentId={project.environmentId}
            hostThreadId={
              stageDevPane?.terminalThreadId ?? stagePane?.terminalThreadId ?? hostThreadId
            }
            terminalId={
              stageDevPane?.terminalId ??
              stagePane?.terminalId ??
              (stageProfile ? devServerTerminalId(stageProfile.id) : "logs")
            }
            cwd={stageDevPane?.workspacePath ?? stagePane?.workspacePath ?? project.workspaceRoot}
            title="Dev Logs"
            statusLabel={stageServer ? "Running" : stageProcessRunning ? "Starting" : "Stopped"}
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
  );
  const designElement = designCapture?.elements[0]?.element ?? null;
  const designSource = designElement?.source ?? null;
  const designInspector = (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <MousePointer2Icon className="size-4 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-medium">Design inspector</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {designElement?.componentName ?? designElement?.selector ?? "No element selected"}
          </p>
        </div>
        <Button
          size="micro"
          variant="outline"
          className="ml-auto"
          onClick={() => setDesignPickRequestNonce((nonce) => nonce + 1)}
        >
          Pick element
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {designPreviewBinding ? (
          <section className="rounded-xl border border-primary/40 bg-primary/10 p-3">
            <p className="text-[10px] font-medium text-primary">Editing this Preview</p>
            <p className="mt-1 truncate text-xs font-medium">{designPreviewBinding.title}</p>
            <p className="mt-1 break-all font-mono text-[9px] leading-4 text-muted-foreground">
              {designPreviewBinding.url}
            </p>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Captures and agent handoffs stay pinned to this exact Workspace, pane, and service.
            </p>
          </section>
        ) : null}
        {!designCapture ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <MousePointer2Icon className="mx-auto size-6 text-primary" />
            <p className="mt-3 text-xs font-medium">Select live UI</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Pick an element in Preview, annotate the screenshot, then attach or send it to the
              selected agent.
            </p>
          </div>
        ) : (
          <>
            {designCapture.screenshot ? (
              <img
                src={designCapture.screenshot.dataUrl}
                alt="Captured preview element"
                className="max-h-40 w-full rounded-lg border border-border bg-muted object-contain"
              />
            ) : null}
            <section className="rounded-xl border border-border bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-primary">Source</p>
              <p className="mt-1 break-all font-mono text-[10px] text-foreground">
                {designSource?.fileName
                  ? `${designSource.fileName}${designSource.lineNumber ? `:${designSource.lineNumber}` : ""}`
                  : "Source mapping unavailable for this element"}
              </p>
              {designElement?.componentName ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  React component · {designElement.componentName}
                </p>
              ) : null}
            </section>
            <section className="rounded-xl border border-border bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-primary">HTML context</p>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-muted-foreground">
                {designElement?.htmlPreview || "No element markup captured."}
              </pre>
            </section>
            <section className="rounded-xl border border-border bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-primary">Computed author styles</p>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-muted-foreground">
                {designElement?.styles || "No author styles captured."}
              </pre>
            </section>
          </>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <label
          className="block text-[10px] font-medium text-muted-foreground"
          htmlFor="design-target-agent"
        >
          Target agent
        </label>
        <select
          id="design-target-agent"
          value={selectedDesignTargetPane?.id ?? ""}
          onChange={(event) => selectDesignTarget(event.currentTarget.value)}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px]"
        >
          {designTargetPanes.length === 0 ? <option value="">Choose a provider</option> : null}
          {designTargetPanes.map((pane) => (
            <option key={pane.id} value={pane.id}>
              {pane.title} · Chat
            </option>
          ))}
          {designLaunchProviders.map((entry) => (
            <option key={entry.instanceId} value={`provider:${entry.instanceId}`}>
              Open {entry.displayName} Chat
            </option>
          ))}
        </select>
        {!designTargetThread && designLaunchProviders.length > 0 ? (
          <p className="text-[10px] leading-4 text-muted-foreground">
            Selecting a provider opens its canonical Chat beside this same Preview, then targets it
            automatically.
          </p>
        ) : null}
        <textarea
          aria-label="Design capture note"
          rows={2}
          value={designCapture?.comment ?? ""}
          disabled={!designCapture}
          placeholder="Add a note for the agent…"
          onChange={(event) =>
            setDesignCapture((current) =>
              current ? { ...current, comment: event.currentTarget.value } : current,
            )
          }
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-primary disabled:opacity-50"
        />
        <Button
          className="w-full"
          disabled={!designCapture || !designTargetThread || designHandoffStatus === "sent"}
          onClick={() => {
            if (designCapture) void sendDesignCapture(designCapture);
          }}
        >
          {designHandoffStatus === "sent" ? <CheckIcon /> : <SendIcon />}
          {designHandoffStatus === "sent" ? "Sent to this Preview" : "Send scoped capture"}
        </Button>
        {designHandoffStatus === "sent" ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2">
            <span className="text-[10px] leading-4 text-muted-foreground">
              Reload this same Preview when the change lands.
            </span>
            <Button size="micro" variant="outline" onClick={reloadPreview}>
              <RefreshCwIcon /> Reload
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );

  if (activeMode !== "workbench")
    return (
      <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <WorkspacePageHeader className="border-b border-border bg-background">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setPreviewStagePaneId(null);
              setPreviewTray("closed");
              if (designMode) exitDesignMode(true);
              else updateActiveWorkspace((workspace) => ({ ...workspace, mode: "workbench" }));
            }}
          >
            <ChevronLeftIcon /> Return to Workbench
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName} · Live Preview</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {project.repositoryIdentity?.displayName ?? "Current checkout"} ·{" "}
              {designStageUrl || "No URL selected"}
            </p>
          </div>
          <div className="flex items-center rounded-md border border-border bg-muted/20 p-0.5">
            <Button
              size="xs"
              variant={activeMode === "preview" ? "secondary" : "ghost"}
              onClick={() =>
                updateActiveWorkspace((workspace) => ({ ...workspace, mode: "preview" }))
              }
            >
              <EyeIcon /> Preview
            </Button>
            <Button
              size="xs"
              variant={activeMode === "build_preview" ? "secondary" : "ghost"}
              onClick={() =>
                updateActiveWorkspace((workspace) => ({ ...workspace, mode: "build_preview" }))
              }
            >
              <Columns2Icon /> Build + Preview
            </Button>
          </div>
          <Button
            size="xs"
            variant={designMode ? "secondary" : "ghost"}
            disabled={!isPreviewSupportedInRuntime() || !stageUrl}
            onClick={() => (designMode ? exitDesignMode() : enterDesignMode())}
            title={
              isPreviewSupportedInRuntime()
                ? "Inspect live elements and hand their source context to an agent"
                : "Design Mode requires Nebula Desktop Preview"
            }
          >
            <MousePointer2Icon /> Design Mode
          </Button>
          {designMode && designPreviewBinding ? (
            <span className="hidden max-w-64 truncate rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] text-primary xl:inline">
              Editing this Preview · {designPreviewBinding.url}
            </span>
          ) : null}
          <span
            className={`flex items-center gap-1 text-[11px] ${stageServer ? "text-emerald-500" : "text-muted-foreground"}`}
          >
            <span
              className={`size-1.5 rounded-full ${stageServer ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            />
            {stageServer
              ? "Server running"
              : stageProcessRunning
                ? "Server starting"
                : "Server stopped"}
          </span>
          <Button size="xs" variant="ghost" onClick={reloadPreview}>
            <RefreshCwIcon /> Reload
          </Button>
          {stageProfile &&
          (!stageDevPane?.sourceWorkspaceId ||
            stageDevPane.sourceWorkspaceId === activeWorkspace.id) ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void startProfile(
                  stageProfile,
                  true,
                  stageDevPane?.terminalId ?? undefined,
                  stageDevPane?.workspacePath ?? project.workspaceRoot,
                )
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
        {activeMode === "preview" ? (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/10 py-2">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Return to Workbench"
                onClick={() =>
                  updateActiveWorkspace((workspace) => ({ ...workspace, mode: "workbench" }))
                }
              >
                <Grid2X2Icon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Open Build and Preview"
                onClick={() =>
                  updateActiveWorkspace((workspace) => ({ ...workspace, mode: "build_preview" }))
                }
              >
                <Columns2Icon />
              </Button>
            </aside>
            {designMode ? (
              <div className="flex min-h-0 min-w-0 flex-1 bg-muted/10">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
                  <div className="min-h-0 flex-1">{stagePreview}</div>
                  <div className="mt-2 flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2">
                    <Button
                      size="micro"
                      onClick={() => setDesignPickRequestNonce((nonce) => nonce + 1)}
                    >
                      <MousePointer2Icon /> Capture element
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      Screenshot, source mapping, HTML, styles, and annotations travel together.
                    </span>
                    <Button
                      size="micro"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => exitDesignMode()}
                    >
                      Exit Design Mode
                    </Button>
                  </div>
                </div>
                {designInspector}
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10 p-2">
                <div className="min-h-0 flex-1">{stagePreview}</div>
                {previewTray !== "closed" ? (
                  <div className="mt-2 h-56 min-h-0">
                    {previewTray === "agent" ? stageAgent : stageLogs}
                  </div>
                ) : null}
                <div className="mt-2 flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2">
                  <Button
                    size="micro"
                    variant={previewTray === "agent" ? "secondary" : "ghost"}
                    onClick={() =>
                      setPreviewTray((current) => (current === "agent" ? "closed" : "agent"))
                    }
                  >
                    <BotIcon /> Agent
                  </Button>
                  <Button
                    size="micro"
                    variant={previewTray === "logs" ? "secondary" : "ghost"}
                    onClick={() =>
                      setPreviewTray((current) => (current === "logs" ? "closed" : "logs"))
                    }
                  >
                    <FileClockIcon /> Logs
                  </Button>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Full Preview · workspace state preserved
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ResizablePair
            direction="horizontal"
            ratio={activeWorkspace.buildPreviewRatio ?? 70}
            minRatio={55}
            maxRatio={82}
            label="Resize Preview and build rail"
            onCommit={(ratio) =>
              updateActiveWorkspace((workspace) => ({ ...workspace, buildPreviewRatio: ratio }))
            }
            className="min-h-0 flex-1 bg-muted/10 p-2"
            first={<div className="min-h-0 pr-2">{stagePreview}</div>}
            second={
              <div className="min-h-0 pl-2">
                <ResizablePair
                  direction="vertical"
                  ratio={activeWorkspace.buildPreviewRailRatio ?? 50}
                  minRatio={28}
                  maxRatio={72}
                  label="Resize Agent and Dev Logs"
                  onCommit={(ratio) =>
                    updateActiveWorkspace((workspace) => ({
                      ...workspace,
                      buildPreviewRailRatio: ratio,
                    }))
                  }
                  className="h-full"
                  first={<div className="min-h-0 pb-2">{stageAgent}</div>}
                  second={<div className="min-h-0 pt-2">{stageLogs}</div>}
                />
              </div>
            }
          />
        )}
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
        <LayoutPresetPicker
          value={activeWorkspace.layoutPreset ?? "main_rail"}
          paneCount={visiblePanes.length}
          onApply={(preset) => {
            setLayoutPresetChoice(preset);
            updateActiveWorkspace((workspace) =>
              applyWorkspaceLayoutPreset(workspace, preset, {
                primaryPaneId: workspace.selectedPaneId,
                mainRatio: layoutMainRatio,
                fillEmpty: layoutFillEmpty,
                nodeId: `layout:preset:${randomUUID()}`,
              }),
            );
          }}
        />
        <div className="flex items-center rounded-md border border-border bg-muted/20 p-0.5">
          <Button
            size="xs"
            variant="secondary"
            onClick={() =>
              updateActiveWorkspace((workspace) => ({ ...workspace, mode: "workbench" }))
            }
          >
            <Grid2X2Icon /> Workbench
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                mode: "preview",
                focusedPaneId: null,
              }))
            }
          >
            <EyeIcon /> Preview
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              updateActiveWorkspace((workspace) => ({
                ...workspace,
                mode: "build_preview",
                focusedPaneId: null,
              }))
            }
          >
            <Columns2Icon /> Build + Preview
          </Button>
        </div>
        <div className="flex items-center rounded-md border border-border bg-muted/20 p-0.5">
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
        <Button size="xs" onClick={() => setQuickAddOpen(true)}>
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
        {!isolatedPane ? (
          <div
            ref={workbenchLayoutRef}
            className="relative h-full min-h-[520px] min-w-[760px] p-2"
            style={
              activeWorkspace.workbenchCanvasHeight
                ? { height: `${activeWorkspace.workbenchCanvasHeight}px` }
                : undefined
            }
          >
            {renderWorkspaceLayoutNode(workspaceLayoutTree)}
          </div>
        ) : null}
        {draggingPaneId && !isolatedPane ? (
          <div className="pointer-events-none absolute inset-2 z-20">
            <button
              type="button"
              className="pointer-events-auto absolute inset-y-12 left-0 w-12 rounded-l-xl border border-primary/60 bg-primary/15 text-[10px] font-medium text-primary backdrop-blur-sm hover:bg-primary/25"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPaneAtWorkspaceEdge(event, "left")}
            >
              Dock left
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute inset-y-12 right-0 w-12 rounded-r-xl border border-primary/60 bg-primary/15 text-[10px] font-medium text-primary backdrop-blur-sm hover:bg-primary/25"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPaneAtWorkspaceEdge(event, "right")}
            >
              Dock right
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute inset-x-14 top-0 h-11 rounded-t-xl border border-primary/60 bg-primary/15 text-[10px] font-medium text-primary backdrop-blur-sm hover:bg-primary/25"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPaneAtWorkspaceEdge(event, "top")}
            >
              Dock top
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute inset-x-14 bottom-0 h-11 rounded-b-xl border border-primary/60 bg-primary/15 text-[10px] font-medium text-primary backdrop-blur-sm hover:bg-primary/25"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropPaneAtWorkspaceEdge(event, "bottom")}
            >
              Dock bottom
            </button>
          </div>
        ) : null}
        {isolatedPane ? (
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
                        setQuickAddOpen(true);
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
                    updateActiveWorkspace((workspace) => ({
                      ...workspace,
                      selectedPaneId: pane.id,
                    }))
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
                      task={pane.taskId ? (taskById.get(TaskId.make(pane.taskId)) ?? null) : null}
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
                      onInspectTask={() => {
                        if (pane.taskId) setInspectedTaskId(TaskId.make(pane.taskId));
                      }}
                      onSwitchAgentSurface={(surface) => void switchAgentSurface(pane, surface)}
                      originLabel={
                        pane.sourceWorkspaceId && pane.sourceWorkspaceId !== activeWorkspace.id
                          ? `Reused from ${workspaceState.workspaces.find((workspace) => workspace.id === pane.sourceWorkspaceId)?.name ?? "another Workspace"}`
                          : null
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
        ) : null}
      </div>

      <footer className="flex min-h-10 shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{visiblePanes.length} visible panes</span>
        <span>·</span>
        <span>
          {sessions.filter((session) => session.state.hasRunningSubprocess).length} active processes
        </span>
        <Button size="micro" variant="ghost" onClick={() => splitSelectedPane("right")}>
          <Columns2Icon /> Split Right
        </Button>
        <Button size="micro" variant="ghost" onClick={() => splitSelectedPane("bottom")}>
          <Rows2Icon /> Split Down
        </Button>
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
          <span>⌘\\ Split Right · ⇧⌘\\ Split Down · ⌥⌘T Tab Next · ⌘N New Pane · ⌘Enter Focus</span>
        </div>
      </footer>

      <Dialog
        open={quickAddOpen}
        onOpenChange={(open) => {
          setQuickAddOpen(open);
          if (!open) setQuickAddTargetStackId(null);
        }}
      >
        <DialogPopup className="w-[min(46rem,calc(100vw-2rem))] max-w-none border-border bg-popover/98">
          <DialogHeader className="border-b border-border/70 pb-4">
            <DialogTitle>New Pane</DialogTitle>
            <DialogDescription>
              Start an agent exactly how you want it, add a tool, or change the workspace view.
            </DialogDescription>
            <div className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search providers and pane types"
                value={quickAddSearch}
                onChange={(event) => setQuickAddSearch(event.currentTarget.value)}
                placeholder="Search providers and pane types"
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"
              />
            </div>
          </DialogHeader>
          <div className="flex border-b border-border/70 px-6">
            {(["agent", "tool", "layout"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={quickAddTab === tab}
                className={
                  "border-b-2 px-4 py-2.5 text-xs capitalize " +
                  (quickAddTab === tab
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
                onClick={() => setQuickAddTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <DialogPanel className="max-h-[min(64vh,42rem)] space-y-5 py-5">
            {quickAddTab === "agent" ? (
              <>
                <section className="rounded-xl border border-border bg-muted/15 p-3">
                  <label className="text-[11px] font-medium" htmlFor="quick-add-context">
                    Execution context
                  </label>
                  <select
                    id="quick-add-context"
                    value={taskContextId ?? ""}
                    onChange={(event) =>
                      setTaskContextId(
                        event.currentTarget.value ? TaskId.make(event.currentTarget.value) : null,
                      )
                    }
                    className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Repository workspace · general session</option>
                    {projectTasks
                      .filter((task) => task.status !== "cancelled")
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title} · {task.workspace?.status ?? "workspace not prepared"}
                        </option>
                      ))}
                  </select>
                </section>

                <section>
                  <p className="text-[11px] font-medium">Surface</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["chat", "terminal"] as const).map((surface) => {
                      const selected = quickAddSurface === surface;
                      const SurfaceIcon =
                        surface === "chat" ? MessageSquareIcon : TerminalSquareIcon;
                      return (
                        <button
                          key={surface}
                          type="button"
                          aria-pressed={selected}
                          className={
                            "flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left " +
                            (selected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-muted/10 hover:bg-muted/25")
                          }
                          onClick={() => setQuickAddSurface(surface)}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background">
                            <SurfaceIcon className="size-4 text-primary" />
                          </span>
                          <span>
                            <span className="block text-xs font-medium">
                              {surface === "chat" ? "Chat GUI" : "Terminal"}
                            </span>
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              {surface === "chat"
                                ? "Structured composer, attachments, and conversation history."
                                : "The provider CLI in a normal interactive PTY."}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium">Provider</p>
                    <span className="text-[10px] text-muted-foreground">
                      {quickAddProviders.length} configured
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {quickAddProviders.map((entry) => {
                      const ready = isProviderInstancePickerReady(entry);
                      const terminalReady = Boolean(providerTerminalLaunches.get(entry.instanceId));
                      const selected = selectedQuickAddProvider?.instanceId === entry.instanceId;
                      return (
                        <button
                          key={entry.instanceId}
                          type="button"
                          aria-pressed={selected}
                          className={
                            "flex min-h-20 items-start gap-3 rounded-xl border p-3 text-left " +
                            (selected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-muted/10 hover:bg-muted/25")
                          }
                          onClick={() => setQuickAddProviderInstanceId(entry.instanceId)}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background">
                            <ProviderInstanceIcon
                              driverKind={entry.driverKind}
                              displayName={entry.displayName}
                              accentColor={entry.accentColor}
                              className="size-4"
                              iconClassName="size-4"
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {entry.displayName}
                            </span>
                            <span
                              className={
                                "mt-1 block truncate text-[10px] " +
                                (ready && (quickAddSurface === "chat" || terminalReady)
                                  ? "text-emerald-500"
                                  : "text-muted-foreground")
                              }
                            >
                              {!ready
                                ? entry.snapshot.message || "Needs setup"
                                : quickAddSurface === "terminal" && !terminalReady
                                  ? "CLI unavailable"
                                  : "Ready"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {quickAddProviders.length === 0 ? (
                    <div className="mt-2 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      No configured providers match “{quickAddSearch}”.
                    </div>
                  ) : null}
                </section>

                {selectedQuickAddProvider ? (
                  <section className="rounded-xl border border-border bg-muted/15 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium">One-click launch</span>
                      <span className="ml-auto truncate font-mono text-[10px] text-primary">
                        {quickAddSurface === "terminal"
                          ? (providerTerminalLaunches.get(selectedQuickAddProvider.instanceId)
                              ?.command ?? "CLI unavailable")
                          : selectedQuickAddProvider.displayName + " Chat"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      Starts in {selectedWorkspacePath}. Switch Chat ↔ Terminal from the pane
                      header.
                    </p>
                  </section>
                ) : null}
              </>
            ) : quickAddTab === "tool" ? (
              <section className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-left hover:bg-muted/25"
                  onClick={() => {
                    addPane({
                      type: "shell",
                      title: taskContext ? taskContext.title + " Shell" : "Shell",
                      taskId: taskContext?.id ?? null,
                      terminalId: "shell-" + randomUUID(),
                      workspacePath: selectedWorkspacePath,
                    });
                    setQuickAddOpen(false);
                  }}
                >
                  <TerminalSquareIcon className="size-5 text-primary" />
                  <span>
                    <span className="block text-xs font-medium">Terminal</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      A clean shell rooted in the current execution context.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-left hover:bg-muted/25"
                  onClick={() => {
                    setQuickAddOpen(false);
                    setFilePickerOpen(true);
                  }}
                >
                  <FileCode2Icon className="size-5 text-primary" />
                  <span>
                    <span className="block text-xs font-medium">File</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      Search the project and open a source file as a regular pane.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-left hover:bg-muted/25"
                  onClick={() => {
                    addPane({
                      type: "diff",
                      title: taskContext ? `${taskContext.title} Diff` : "Working Tree Diff",
                      taskId: taskContext?.id ?? null,
                      workspacePath: selectedWorkspacePath,
                    });
                    setQuickAddOpen(false);
                  }}
                >
                  <FileDiffIcon className="size-5 text-primary" />
                  <span>
                    <span className="block text-xs font-medium">Diff</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      Review Task or working-tree changes beside any other pane.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-left hover:bg-muted/25"
                  onClick={() => {
                    addPane({
                      type: "git",
                      title: "Source Control",
                      workspacePath: selectedWorkspacePath,
                    });
                    setQuickAddOpen(false);
                  }}
                >
                  <GitBranchIcon className="size-5 text-primary" />
                  <span>
                    <span className="block text-xs font-medium">Git</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      Branch and working-tree status in its own stackable pane.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-left hover:bg-muted/25"
                  onClick={() => {
                    setQuickAddOpen(false);
                    setAddPaneOpen(true);
                  }}
                >
                  <AppWindowIcon className="size-5 text-primary" />
                  <span>
                    <span className="block text-xs font-medium">Workspace tools</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      Dev servers, Project Services, tests, Preview, Git, and logs.
                    </span>
                  </span>
                </button>
                {projectServices[0] ? (
                  <button
                    type="button"
                    className="flex min-h-24 items-start gap-3 rounded-xl border border-primary/50 bg-primary/5 p-4 text-left hover:bg-primary/10 sm:col-span-2"
                    onClick={() => {
                      addProjectServicePreview(projectServices[0]!);
                      setQuickAddOpen(false);
                    }}
                  >
                    <LinkIcon className="size-5 text-primary" />
                    <span>
                      <span className="block text-xs font-medium">Add running project Preview</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        Reuse {projectServiceTitle(projectServices[0]!)} from{" "}
                        {projectServices[0]!.sourceWorkspaceName}. No duplicate process.
                      </span>
                    </span>
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-medium text-primary">Workspace mode</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["workbench", "Workbench", "Resizable agent, tool, and preview columns."],
                        ["preview", "Preview", "Use the full workspace for the running app."],
                        [
                          "build_preview",
                          "Build + Preview",
                          "Large Preview with Agent and Logs rail.",
                        ],
                      ] as const
                    ).map(([mode, label, detail]) => (
                      <button
                        key={mode}
                        type="button"
                        className={
                          "min-h-28 rounded-xl border p-4 text-left " +
                          (activeMode === mode
                            ? "border-primary bg-primary/10"
                            : "border-border bg-muted/10 hover:bg-muted/25")
                        }
                        onClick={() => {
                          updateActiveWorkspace((workspace) => ({ ...workspace, mode }));
                        }}
                      >
                        {mode === "workbench" ? (
                          <Grid2X2Icon className="size-5 text-primary" />
                        ) : mode === "preview" ? (
                          <EyeIcon className="size-5 text-primary" />
                        ) : (
                          <Columns2Icon className="size-5 text-primary" />
                        )}
                        <span className="mt-3 block text-xs font-medium">{label}</span>
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                          {detail}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium text-primary">Layout presets</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Replace the Workbench composition. Every divider remains independently
                        resizable.
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
                      {visiblePanes.length} panes
                    </span>
                  </div>
                  <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {TERMINAL_WORKSPACE_LAYOUT_PRESET_DEFINITIONS.map((preset) => {
                      const Icon = layoutPresetIcon(preset.id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={layoutPresetChoice === preset.id}
                          className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left ${
                            layoutPresetChoice === preset.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-muted/10 hover:bg-muted/25"
                          }`}
                          onClick={() => setLayoutPresetChoice(preset.id)}
                        >
                          <Icon className="size-5 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium">{preset.label}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {preset.description}
                            </span>
                          </span>
                          {layoutPresetChoice === preset.id ? (
                            <CheckIcon className="ml-auto size-4 text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/10 p-3">
                  <label className="flex items-center justify-between text-[11px] font-medium">
                    Main pane ratio
                    <span className="font-mono text-primary">{layoutMainRatio}%</span>
                  </label>
                  <input
                    aria-label="Main pane ratio"
                    type="range"
                    min="55"
                    max="80"
                    value={layoutMainRatio}
                    onChange={(event) => setLayoutMainRatio(Number(event.currentTarget.value))}
                    className="mt-2 w-full accent-[var(--primary)]"
                  />
                  <label className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={layoutFillEmpty}
                      onChange={(event) => setLayoutFillEmpty(event.currentTarget.checked)}
                      className="accent-[var(--primary)]"
                    />
                    Keep empty slots ready for one-click pane launch
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      updateActiveWorkspace((workspace) =>
                        applyWorkspaceLayoutPreset(workspace, layoutPresetChoice, {
                          primaryPaneId: workspace.selectedPaneId,
                          mainRatio: layoutMainRatio,
                          fillEmpty: layoutFillEmpty,
                          nodeId: `layout:preset:${randomUUID()}`,
                        }),
                      );
                      setQuickAddOpen(false);
                    }}
                  >
                    Replace layout
                  </Button>
                </div>
              </section>
            )}
          </DialogPanel>
          {quickAddTab === "agent" ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  quickAddBusy ||
                  quickAddProviders.length === 0 ||
                  !selectedQuickAddProvider ||
                  !isProviderInstancePickerReady(selectedQuickAddProvider) ||
                  (quickAddSurface === "terminal" &&
                    !providerTerminalLaunches.get(selectedQuickAddProvider.instanceId))
                }
                onClick={async () => {
                  if (!selectedQuickAddProvider) return;
                  setQuickAddBusy(true);
                  try {
                    const pane =
                      quickAddSurface === "chat"
                        ? await launchProvider(selectedQuickAddProvider, taskContext)
                        : await launchProviderTerminal(selectedQuickAddProvider, taskContext);
                    if (pane) setQuickAddOpen(false);
                  } finally {
                    setQuickAddBusy(false);
                  }
                }}
              >
                {quickAddSurface === "chat" ? <MessageSquareIcon /> : <TerminalSquareIcon />}
                {quickAddBusy
                  ? "Starting…"
                  : `Start ${selectedQuickAddProvider?.displayName ?? "Agent"} ${
                      quickAddSurface === "chat" ? "Chat" : "Terminal"
                    }`}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogPopup>
      </Dialog>

      <Dialog open={filePickerOpen} onOpenChange={setFilePickerOpen}>
        <DialogPopup className="w-[min(40rem,calc(100vw-2rem))] max-w-none border-border bg-popover/98">
          <DialogHeader className="border-b border-border/70 pb-4">
            <DialogTitle>Open file pane</DialogTitle>
            <DialogDescription>
              Search {activeWorkspace.name} and open a project file as a normal split or tab.
            </DialogDescription>
            <div className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                aria-label="Search project files"
                value={fileSearch}
                onChange={(event) => setFileSearch(event.currentTarget.value)}
                placeholder="Search files…"
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"
              />
            </div>
          </DialogHeader>
          <DialogPanel className="max-h-[min(60vh,36rem)] space-y-1 py-3">
            {filePicker.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  addPane({
                    type: "file",
                    title: entry.path.split("/").at(-1) ?? entry.path,
                    filePath: entry.path,
                    taskId: taskContext?.id ?? null,
                    workspacePath: selectedWorkspacePath,
                  });
                  setFilePickerOpen(false);
                  setFileSearch("");
                }}
              >
                <FileCode2Icon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {entry.path.split("/").at(-1)}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {entry.path}
                  </span>
                </span>
              </button>
            ))}
            {filePicker.isPending ? (
              <p className="p-5 text-center text-xs text-muted-foreground">Searching files…</p>
            ) : filePicker.error ? (
              <p className="p-5 text-center text-xs text-destructive">{filePicker.error}</p>
            ) : filePicker.entries.length === 0 ? (
              <p className="p-5 text-center text-xs text-muted-foreground">No matching files.</p>
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <Sheet open={addPaneOpen} onOpenChange={setAddPaneOpen}>
        <SheetPopup side="right" className="max-w-[28rem] border-l border-border bg-popover/98">
          <SheetHeader className="border-b border-border/70 pb-4">
            <SheetTitle className="text-lg">
              {taskContext ? "Add to Task" : "Add to Workspace"}
            </SheetTitle>
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
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() =>
                    addPane({
                      type: "shell",
                      title: taskContext ? `${taskContext.title} Shell` : "Shell",
                      taskId: taskContext?.id ?? null,
                      terminalId: `shell-${randomUUID()}`,
                      workspacePath: selectedWorkspacePath,
                    })
                  }
                >
                  <TerminalSquareIcon className="text-primary" />
                  <span className="text-xs">Terminal</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => {
                    setAddPaneOpen(false);
                    setQuickAddTab("agent");
                    setQuickAddOpen(true);
                  }}
                >
                  <BotIcon className="text-primary" />
                  <span className="text-xs">Choose Agent</span>
                </Button>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-medium text-primary">View</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Inspect a running app, repository state, or process output.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() => {
                    setAddPaneOpen(false);
                    setFilePickerOpen(true);
                  }}
                >
                  <FileCode2Icon className="text-primary" />
                  <span className="text-xs">File</span>
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
                    const profile = devServerProfiles.find(
                      (candidate) => candidate.id === devPane.devServerProfileId,
                    );
                    addPane({
                      type: "preview",
                      title: `${devPane.title} Preview`,
                      taskId: devPane.taskId,
                      previewUrl: serverForPane(devPane)?.url ?? profile?.previewUrl ?? "",
                      devServerProfileId: devPane.devServerProfileId,
                      attachedPaneId: devPane.id,
                      terminalThreadId: devPane.terminalThreadId ?? null,
                      sourceWorkspaceId: devPane.sourceWorkspaceId ?? null,
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
                  onClick={() =>
                    addPane({
                      type: "diff",
                      title: taskContext ? `${taskContext.title} Diff` : "Working Tree Diff",
                      taskId: taskContext?.id ?? null,
                      workspacePath: selectedWorkspacePath,
                    })
                  }
                >
                  <GitBranchIcon className="text-primary" />
                  <span className="text-xs">Diff</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-between gap-3 p-3"
                  onClick={() =>
                    addPane({
                      type: "git",
                      title: "Source Control",
                      workspacePath: selectedWorkspacePath,
                    })
                  }
                >
                  <GitBranchIcon className="text-primary" />
                  <span className="text-xs">Git</span>
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
                      taskId: devPane.taskId,
                      terminalId: devPane.terminalId,
                      devServerProfileId: devPane.devServerProfileId,
                      attachedPaneId: devPane.id,
                      terminalThreadId: devPane.terminalThreadId ?? null,
                      sourceWorkspaceId: devPane.sourceWorkspaceId ?? null,
                      workspacePath: devPane.workspacePath,
                    });
                  }}
                >
                  <FileClockIcon className="text-primary" />
                  <span className="text-xs">Logs</span>
                </Button>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-primary">Project Services</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Running once for this project. Reuse in any Workspace.
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {projectServices.length} running
                </span>
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-2">
                {projectServices.map((service) => {
                  const isCurrentWorkspace = service.sourceWorkspaceId === activeWorkspace.id;
                  return (
                    <div
                      key={service.terminalThreadId + ":" + service.terminalId}
                      className="rounded-lg border border-border/70 bg-background/60 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/30">
                          <AppWindowIcon className="size-4 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-xs font-medium">
                              {projectServiceTitle(service)}
                            </p>
                            <span className="text-[10px] text-emerald-500">Running</span>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-primary">
                            {service.server.url}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Owned by {service.sourceWorkspaceName}
                            {isCurrentWorkspace ? " · current Workspace" : ""}
                            {service.servers.length > 1
                              ? ` · ${service.servers.length} endpoints`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button
                          size="micro"
                          variant="outline"
                          onClick={() => addProjectServicePreview(service)}
                        >
                          <EyeIcon /> Add Preview Here
                        </Button>
                        <Button
                          size="micro"
                          variant="outline"
                          onClick={() => addProjectServiceWithLogs(service)}
                        >
                          <FileClockIcon /> Add Server + Logs
                        </Button>
                        <Button
                          size="micro"
                          variant="ghost"
                          disabled={isCurrentWorkspace}
                          onClick={() => focusProjectServiceOrigin(service)}
                        >
                          <FocusIcon />
                          {isCurrentWorkspace
                            ? "Current Workspace"
                            : "Focus in " + service.sourceWorkspaceName}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {projectServices.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No project-managed service is running yet.
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Start the detected Dev Server once; it will appear here in every Workspace.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-muted/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Execution context</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Task tools inherit the canonical worktree and Task identity.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setAddPaneOpen(false);
                    setTaskCreateOpen(true);
                  }}
                >
                  <PlusIcon /> Create Task
                </Button>
              </div>
              <select
                aria-label="Task execution context"
                value={taskContextId ?? ""}
                onChange={(event) =>
                  setTaskContextId(
                    event.currentTarget.value ? TaskId.make(event.currentTarget.value) : null,
                  )
                }
                className="mt-3 w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
              >
                <option value="">Repository workspace · general session</option>
                {projectTasks
                  .filter((task) => task.status !== "cancelled")
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title} · {task.workspace?.status ?? "workspace not prepared"}
                    </option>
                  ))}
              </select>
              {taskContext ? (
                <div className="mt-3 grid gap-1 text-[10px] text-muted-foreground">
                  <span>
                    {taskContext.role} · {taskContext.status} · Ownership{" "}
                    {taskContext.ownership?.status ?? "unconfigured"}
                  </span>
                  <span className="truncate font-mono">
                    {taskContextPath ?? "Canonical worktree is still preparing"}
                  </span>
                </div>
              ) : null}
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
                <p className="text-[11px] font-medium text-primary">Other Local Servers</p>
                <span className="text-[10px] text-muted-foreground">Explicit attachment</span>
              </div>
              <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-border bg-muted/10 p-2">
                {otherLocalServers.map((server) => {
                  const attachedPane = activeWorkspace.panes.find(
                    (pane) =>
                      pane.type === "dev_server" &&
                      pane.externalServer?.host === server.host &&
                      pane.externalServer.port === server.port,
                  );
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
                          {server.pid
                            ? `External process · PID ${server.pid}`
                            : "External local process"}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant={attachedPane ? "ghost" : "outline"}
                        disabled={Boolean(attachedPane)}
                        onClick={() => attachExternalServer(server)}
                      >
                        <LinkIcon />
                        {attachedPane ? "Attached" : "Attach & Preview"}
                      </Button>
                    </div>
                  );
                })}
                {otherLocalServers.length === 0 ? (
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
                            taskId:
                              projectTasks.find((task) => task.threadId === thread.id)?.id ?? null,
                            threadId: thread.id,
                            providerInstanceId: thread.modelSelection.instanceId,
                            agentSurface: "chat",
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

      <Sheet
        open={inspectedTaskId !== null}
        onOpenChange={(open) => !open && setInspectedTaskId(null)}
      >
        <SheetPopup side="right" className="max-w-[42rem] border-l border-border bg-popover/98">
          {(() => {
            const task = inspectedTaskId ? (taskById.get(inspectedTaskId) ?? null) : null;
            if (!task)
              return (
                <SheetPanel className="p-6 text-sm text-muted-foreground">
                  This canonical Task is no longer available.
                </SheetPanel>
              );
            const thread = task.threadId ? (threadById.get(task.threadId) ?? null) : null;
            const builderProviderInstanceId = thread?.modelSelection.instanceId ?? null;
            const builderProvider = builderProviderInstanceId
              ? providerEntries.find(
                  (provider) => provider.instanceId === builderProviderInstanceId,
                )
              : null;
            return (
              <>
                <SheetHeader className="border-b border-border/70 pb-4">
                  <SheetTitle className="text-lg">{task.title}</SheetTitle>
                  <SheetDescription>
                    {task.role} · {thread?.modelSelection.model ?? "No agent session"} ·{" "}
                    {task.status}
                  </SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-5 pb-8">
                  <TaskInspector
                    environmentId={project.environmentId}
                    task={task}
                    builderProviderInstanceId={builderProviderInstanceId}
                    builderProviderLabel={
                      builderProvider?.displayName ?? builderProviderInstanceId ?? "Unassigned"
                    }
                    providers={providerEntries}
                    onInterrupt={async () => {
                      if (!task.threadId) return;
                      const result = await interruptThreadTurn({
                        environmentId: project.environmentId,
                        input: { threadId: task.threadId },
                      });
                      if (commandFailure(result))
                        reportError(
                          "Could not interrupt agent",
                          "The canonical Thread rejected the interruption.",
                        );
                    }}
                    onStop={async () => {
                      if (!task.threadId) return;
                      const result = await stopThreadSession({
                        environmentId: project.environmentId,
                        input: { threadId: task.threadId },
                      });
                      if (commandFailure(result))
                        reportError(
                          "Could not stop agent",
                          "The canonical Thread rejected the stop request.",
                        );
                    }}
                    onReplaceProvider={async (provider) => {
                      await launchProvider(provider, task, true);
                    }}
                  />
                </SheetPanel>
              </>
            );
          })()}
        </SheetPopup>
      </Sheet>

      <Dialog open={taskCreateOpen} onOpenChange={setTaskCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Creates a canonical Task and prepares its isolated Git worktree. Panes remain views
              over that durable runtime object.
            </DialogDescription>
          </DialogHeader>
          <TaskCreateFields
            title={taskTitle}
            objective={taskObjective}
            onTitleChange={setTaskTitle}
            onObjectiveChange={setTaskObjective}
            ownershipRules={taskOwnershipRules}
            onOwnershipRulesChange={setTaskOwnershipRules}
          />
          <DialogPanel className="grid gap-4 pt-0 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Role</span>
              <select
                value={taskRole}
                onChange={(event) => setTaskRole(event.currentTarget.value as NebulaTaskRole)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                {(
                  ["builder", "tester", "reviewer", "scout", "architect", "integrator"] as const
                ).map((role) => (
                  <option key={role} value={role}>
                    {role[0]!.toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Provider</span>
              <select
                value={taskProviderInstanceId}
                onChange={(event) => setTaskProviderInstanceId(event.currentTarget.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">Project default</option>
                {providerEntries
                  .filter((entry) => entry.enabled && entry.isAvailable)
                  .map((entry) => (
                    <option key={entry.instanceId} value={entry.instanceId}>
                      {entry.displayName} · {entry.models[0]?.slug ?? "auto"}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">Acceptance criteria</span>
              <textarea
                value={taskAcceptanceCriteria}
                onChange={(event) => setTaskAcceptanceCriteria(event.currentTarget.value)}
                placeholder="One bounded criterion per line"
                className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                taskCreateBusy ||
                !taskTitle.trim() ||
                !taskObjective.trim() ||
                (taskRole === "builder" && !ownershipDraftsValid(taskOwnershipRules))
              }
              onClick={() => void createBoundTask()}
            >
              {taskCreateBusy ? "Preparing…" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

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
