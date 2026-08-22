import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { createModelSelection } from "@t3tools/shared/model";
import { TaskRestoreId } from "@t3tools/contracts";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationTask,
  ProjectId,
  TaskId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowLeftIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleSlash2Icon,
  Clock3Icon,
  ExternalLinkIcon,
  FolderGit2Icon,
  LayoutDashboardIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isElectron } from "../../env";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { newMessageId, newTaskId, newThreadId, randomUUID } from "../../lib/utils";
import { usePrimarySettings } from "../../hooks/useSettings";
import { useServerConfigs } from "../../state/entities";
import { environmentSnapshotAtom } from "../../state/shell";
import { taskEnvironment } from "../../state/tasks";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  ownershipDraftsValid,
  ownershipRulesFromDrafts,
  TaskChangesPanel,
  TaskCreateFields,
  TaskOwnershipEditor,
  taskOwnershipContext,
  type OwnershipRuleDraft,
} from "../ProjectTasksSection";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
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
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useSettingsProjectGroups } from "../settings/ProjectSettingsPanel";
import {
  buildCommandDeckActivity,
  deriveCurrentAction,
  deriveTaskAttention,
  deriveTaskPresentationStatus,
  providerTaskCounts,
  resolveTaskModelSelection,
  resolveTaskProviderEntry,
  selectProjectTasks,
  summarizeCommandDeck,
  taskChangedFileCount,
  type CommandDeckAttention,
} from "./commandDeckLogic";

interface CommandDeckProject {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly defaultModelSelection: ModelSelection | null;
}

type InspectorSection = "overview" | "ownership" | "changes" | "review" | "workspace";

const toneVariant = {
  neutral: "outline",
  info: "info",
  success: "success",
  warning: "warning",
} as const;

function commandError(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The command could not be completed.";
}

function taskChangedFiles(task: OrchestrationTask): number {
  return taskChangedFileCount(task);
}

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function CompactStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function AttentionList({ items }: { readonly items: ReadonlyArray<CommandDeckAttention> }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Task attention reasons">
      {items.map((item) => (
        <li
          key={`${item.kind}:${item.label}`}
          className="flex items-center gap-1.5 text-xs text-warning"
        >
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function CommandDeckHeader({
  projectKey,
  title,
}: {
  readonly projectKey: string;
  readonly title: string;
}) {
  const navigate = useNavigate();
  return (
    <WorkspacePageHeader electron={isElectron}>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <WorkspaceBreadcrumb ariaLabel="Command Deck breadcrumb">
          <WorkspaceBreadcrumbItem>Projects</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
          <WorkspaceBreadcrumbItem>{title}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
          <WorkspaceBreadcrumbItem current>Command Deck</WorkspaceBreadcrumbItem>
        </WorkspaceBreadcrumb>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            aria-label="Back to workspace"
            onClick={() => void navigate({ to: "/" })}
          >
            <ArrowLeftIcon /> Workspace
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => void navigate({ to: "/projects/$projectKey", params: { projectKey } })}
          >
            <Settings2Icon /> Project settings
          </Button>
        </div>
      </div>
    </WorkspacePageHeader>
  );
}

export function CommandDeckPage({ projectKey }: { readonly projectKey: string }) {
  const groups = useSettingsProjectGroups();
  const group = groups.find((candidate) => candidate.projectKey === projectKey) ?? null;
  if (!group) {
    return (
      <SidebarInset className="flex h-dvh min-h-0 w-auto items-center justify-center bg-background p-8 text-sm text-muted-foreground">
        This project is no longer available.
      </SidebarInset>
    );
  }
  const representative =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  return (
    <SidebarInset className="h-dvh min-h-0 w-auto overflow-hidden bg-background text-foreground isolate">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <CommandDeckHeader projectKey={projectKey} title={group.displayName} />
        <CommandDeck project={representative} displayName={group.displayName} />
      </div>
    </SidebarInset>
  );
}

export function CommandDeck({
  project,
  displayName,
}: {
  readonly project: CommandDeckProject;
  readonly displayName: string;
}) {
  const navigate = useNavigate();
  const snapshot = useAtomValue(environmentSnapshotAtom(project.environmentId));
  const serverConfig = useServerConfigs().get(project.environmentId) ?? null;
  const settings = usePrimarySettings();
  const serverProviders = serverConfig?.providers ?? [];
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(serverProviders), settings),
      ),
    [serverProviders, settings],
  );
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, serverProviders),
    [serverProviders, settings],
  );
  const fallbackSelection = useMemo(
    () => resolveDefaultProviderModelSelection(serverProviders, project.defaultModelSelection),
    [project.defaultModelSelection, serverProviders],
  );
  const tasks = useMemo(
    () => selectProjectTasks(snapshot?.tasks ?? [], project.id),
    [project.id, snapshot?.tasks],
  );
  const threadById = useMemo(
    () => new Map((snapshot?.threads ?? []).map((thread) => [thread.id, thread] as const)),
    [snapshot?.threads],
  );
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const selectedThread =
    selectedTask?.threadId === null || selectedTask?.threadId === undefined
      ? null
      : (threadById.get(selectedTask.threadId) ?? null);
  useEffect(() => {
    if (selectedTask && selectedTask.id !== selectedTaskId) setSelectedTaskId(selectedTask.id);
  }, [selectedTask, selectedTaskId]);

  const modelSelectionByTaskId = useMemo(
    () =>
      new Map(
        tasks.map((task) => {
          const thread = task.threadId ? (threadById.get(task.threadId) ?? null) : null;
          return [task.id, resolveTaskModelSelection(task, thread, fallbackSelection)] as const;
        }),
      ),
    [fallbackSelection, tasks, threadById],
  );
  const providerEntryByTaskId = useMemo(
    () =>
      new Map(
        tasks.map(
          (task) =>
            [
              task.id,
              resolveTaskProviderEntry(
                modelSelectionByTaskId.get(task.id) ?? null,
                instanceEntries,
              ),
            ] as const,
        ),
      ),
    [instanceEntries, modelSelectionByTaskId, tasks],
  );
  const attentionByTaskId = useMemo(
    () =>
      new Map(
        tasks.map((task) => {
          const thread = task.threadId ? (threadById.get(task.threadId) ?? null) : null;
          return [
            task.id,
            deriveTaskAttention({
              task,
              thread,
              providerEntry: providerEntryByTaskId.get(task.id) ?? null,
              modelSelection: modelSelectionByTaskId.get(task.id) ?? null,
            }),
          ] as const;
        }),
      ),
    [modelSelectionByTaskId, providerEntryByTaskId, tasks, threadById],
  );
  const summary = useMemo(
    () => summarizeCommandDeck(tasks, attentionByTaskId),
    [attentionByTaskId, tasks],
  );
  const activity = useMemo(() => buildCommandDeckActivity(tasks), [tasks]);
  const providerCounts = useMemo(
    () => providerTaskCounts([...modelSelectionByTaskId.values()]),
    [modelSelectionByTaskId],
  );

  const createTask = useAtomCommand(taskEnvironment.create, { reportFailure: false });
  const bindThread = useAtomCommand(taskEnvironment.bindThread, { reportFailure: false });
  const activateTask = useAtomCommand(taskEnvironment.activate, { reportFailure: false });
  const completeTask = useAtomCommand(taskEnvironment.complete, { reportFailure: false });
  const cancelTask = useAtomCommand(taskEnvironment.cancel, { reportFailure: false });
  const prepareWorkspace = useAtomCommand(taskEnvironment.prepareWorkspace, {
    reportFailure: false,
  });
  const removeWorkspace = useAtomCommand(taskEnvironment.removeWorkspace, { reportFailure: false });
  const setOwnership = useAtomCommand(taskEnvironment.setOwnership, { reportFailure: false });
  const validateOwnership = useAtomCommand(taskEnvironment.validateOwnership, {
    reportFailure: false,
  });
  const prepareReview = useAtomCommand(taskEnvironment.prepareReview, { reportFailure: false });
  const updateHandoff = useAtomCommand(taskEnvironment.updateHandoff, { reportFailure: false });
  const requestRestore = useAtomCommand(taskEnvironment.requestRestore, { reportFailure: false });
  const undoRestore = useAtomCommand(taskEnvironment.undoRestore, { reportFailure: false });
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, { reportFailure: false });

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createObjective, setCreateObjective] = useState("");
  const [createSelection, setCreateSelection] = useState<ModelSelection | null>(fallbackSelection);
  const [createOwnership, setCreateOwnership] = useState<ReadonlyArray<OwnershipRuleDraft>>([
    { draftId: randomUUID(), access: "write", pattern: "", reason: "" },
  ]);
  const [editingTask, setEditingTask] = useState<OrchestrationTask | null>(null);
  const [editingRules, setEditingRules] = useState<ReadonlyArray<OwnershipRuleDraft>>([]);
  const [busyTaskId, setBusyTaskId] = useState<TaskId | null>(null);
  const [pendingStartTaskId, setPendingStartTaskId] = useState<TaskId | null>(null);
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>("overview");
  const [handoffSummary, setHandoffSummary] = useState("");

  useEffect(() => setCreateSelection(fallbackSelection), [fallbackSelection]);
  useEffect(() => setHandoffSummary(selectedTask?.handoff?.summary ?? ""), [selectedTask?.handoff]);

  const reportError = useCallback((title: string, description: string) => {
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  }, []);

  const submitTask = async () => {
    if (!createTitle.trim() || !createObjective.trim() || !createSelection) return;
    const taskId = newTaskId();
    setBusyTaskId(taskId);
    let error = commandError(
      await createTask({
        environmentId: project.environmentId,
        input: {
          taskId,
          projectId: project.id,
          title: createTitle.trim(),
          objective: createObjective.trim(),
          role: "builder",
          modelSelection: createSelection,
        },
      }),
    );
    if (error === null) {
      error = commandError(
        await setOwnership({
          environmentId: project.environmentId,
          input: { taskId, rules: ownershipRulesFromDrafts(createOwnership) },
        }),
      );
    }
    setBusyTaskId(null);
    if (error) {
      reportError("Could not create Task", error);
      return;
    }
    setSelectedTaskId(taskId);
    setCreateTitle("");
    setCreateObjective("");
    setCreateOwnership([{ draftId: randomUUID(), access: "write", pattern: "", reason: "" }]);
    setCreateOpen(false);
  };

  const launchReadyTask = useCallback(
    async (task: OrchestrationTask) => {
      const modelSelection = modelSelectionByTaskId.get(task.id) ?? null;
      if (
        !modelSelection ||
        task.workspace?.status !== "ready" ||
        !task.workspace.path ||
        !task.workspace.branch
      ) {
        return;
      }
      const providerEntry = providerEntryByTaskId.get(task.id) ?? null;
      if (
        !providerEntry ||
        providerEntry.status !== "ready" ||
        !providerEntry.enabled ||
        !providerEntry.isAvailable
      ) {
        setBusyTaskId(null);
        reportError("Provider unavailable", "Choose a ready provider before starting this Task.");
        return;
      }
      const threadId = newThreadId();
      let error = commandError(
        await createThread({
          environmentId: project.environmentId,
          input: {
            threadId,
            projectId: project.id,
            title: task.title,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: task.workspace.branch,
            worktreePath: task.workspace.path,
          },
        }),
      );
      if (error === null) {
        error = commandError(
          await bindThread({
            environmentId: project.environmentId,
            input: { taskId: task.id, threadId },
          }),
        );
      }
      if (error === null) {
        error = commandError(
          await activateTask({
            environmentId: project.environmentId,
            input: { taskId: task.id },
          }),
        );
      }
      if (error) {
        setBusyTaskId(null);
        reportError("Could not start Task", error);
        return;
      }
      const executionError = commandError(
        await startThreadTurn({
          environmentId: project.environmentId,
          input: {
            threadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: `Task: ${task.title}\n\nObjective:\n${task.objective}\n\n${taskOwnershipContext(task)}`,
              attachments: [],
            },
            modelSelection,
            titleSeed: task.title,
            runtimeMode: "full-access",
            interactionMode: "default",
          },
        }),
      );
      setBusyTaskId(null);
      if (executionError) {
        reportError(
          "Task is active, but provider start failed",
          `${executionError} Open the Thread to retry without losing the Task or workspace.`,
        );
      }
    },
    [
      activateTask,
      bindThread,
      createThread,
      modelSelectionByTaskId,
      project.environmentId,
      project.id,
      providerEntryByTaskId,
      reportError,
      startThreadTurn,
    ],
  );

  const startTask = async (task: OrchestrationTask) => {
    if ((attentionByTaskId.get(task.id) ?? []).some((item) => item.kind === "provider")) {
      reportError("Provider unavailable", "Assign a ready provider before starting this Task.");
      return;
    }
    setBusyTaskId(task.id);
    if (task.workspace?.status === "ready") {
      await launchReadyTask(task);
      return;
    }
    setPendingStartTaskId(task.id);
    const error = commandError(
      await prepareWorkspace({
        environmentId: project.environmentId,
        input: { taskId: task.id },
      }),
    );
    if (error) {
      setPendingStartTaskId(null);
      setBusyTaskId(null);
      reportError("Could not prepare Task workspace", error);
    }
  };

  useEffect(() => {
    if (!pendingStartTaskId) return;
    const task = tasks.find((candidate) => candidate.id === pendingStartTaskId);
    if (!task?.workspace) return;
    if (task.workspace.status === "ready") {
      setPendingStartTaskId(null);
      void launchReadyTask(task);
    } else if (task.workspace.status === "failed" || task.workspace.status === "missing") {
      setPendingStartTaskId(null);
      setBusyTaskId(null);
      reportError(
        "Could not prepare Task workspace",
        task.workspace.failureReason ?? "Workspace preparation failed.",
      );
    }
  }, [launchReadyTask, pendingStartTaskId, reportError, tasks]);

  const runTaskCommand = async (
    task: OrchestrationTask,
    title: string,
    command: () => Promise<AtomCommandResult<unknown, unknown>>,
  ) => {
    setBusyTaskId(task.id);
    const error = commandError(await command());
    setBusyTaskId(null);
    if (error) reportError(title, error);
  };

  const openThread = (task: OrchestrationTask) => {
    if (!task.threadId) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: project.environmentId, threadId: task.threadId },
    });
  };

  const editOwnership = (task: OrchestrationTask) => {
    setEditingTask(task);
    setEditingRules(
      (task.ownership?.rules ?? []).map((rule) => ({
        draftId: rule.id,
        access: rule.access,
        pattern: rule.pattern,
        reason: rule.reason ?? "",
      })),
    );
  };

  const saveOwnership = async () => {
    if (!editingTask || !ownershipDraftsValid(editingRules)) return;
    await runTaskCommand(editingTask, "Could not update ownership", () =>
      setOwnership({
        environmentId: project.environmentId,
        input: { taskId: editingTask.id, rules: ownershipRulesFromDrafts(editingRules) },
      }),
    );
    setEditingTask(null);
  };

  const saveHandoffReady = async (task: OrchestrationTask) => {
    if (
      !task.reviewSnapshot ||
      !task.handoff ||
      task.handoff.snapshotId !== task.reviewSnapshot.id ||
      !handoffSummary.trim()
    )
      return;
    await runTaskCommand(task, "Could not update handoff", () =>
      updateHandoff({
        environmentId: project.environmentId,
        input: {
          taskId: task.id,
          snapshotId: task.handoff!.snapshotId,
          status: "ready",
          summary: handoffSummary.trim(),
          testsRun: task.handoff!.testsRun,
          assumptions: task.handoff!.assumptions,
          interfaceChanges: task.handoff!.interfaceChanges,
          migrations: task.handoff!.migrations,
          knownRisks: task.handoff!.knownRisks,
          followUps: task.handoff!.followUps,
        },
      }),
    );
  };

  const confirmRestore = async (task: OrchestrationTask) => {
    if (
      !window.confirm(
        "Restore only this Task workspace to its recorded baseline? A recovery snapshot will be retained first.",
      )
    )
      return;
    await runTaskCommand(task, "Could not restore Task", () =>
      requestRestore({
        environmentId: project.environmentId,
        input: { taskId: task.id, restoreId: TaskRestoreId.make(randomUUID()) },
      }),
    );
  };

  const selectedSelection = selectedTask
    ? (modelSelectionByTaskId.get(selectedTask.id) ?? null)
    : null;
  const selectedProviderEntry = selectedTask
    ? (providerEntryByTaskId.get(selectedTask.id) ?? null)
    : null;
  const selectedAttention = selectedTask ? (attentionByTaskId.get(selectedTask.id) ?? []) : [];

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_8%,transparent),transparent_32%)] p-3 sm:p-4">
      <div className="mx-auto flex min-h-full w-full max-w-[1800px] flex-col gap-3">
        <section
          className="rounded-xl border border-border/70 bg-card/95 p-3 shadow-sm"
          aria-label="Command Deck summary"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LayoutDashboardIcon className="size-4 text-primary" aria-hidden />
                <h1 className="text-base font-semibold">Command Deck</h1>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {displayName} · {project.workspaceRoot}
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon /> New Task
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <CompactStat label="Tasks" value={summary.total} />
            <CompactStat label="Active" value={summary.active} />
            <CompactStat label="Needs attention" value={summary.attention} />
            <CompactStat label="Review-ready" value={summary.reviewReady} />
            <CompactStat label="Changed files" value={summary.changedFiles} />
          </div>
          {providerCounts.size > 0 ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
              aria-label="Provider Task counts"
            >
              <BotIcon className="size-3.5" aria-hidden />
              {[...providerCounts].map(([instanceId, count]) => (
                <span key={instanceId} className="rounded-full bg-muted/45 px-2 py-1">
                  {instanceEntries.find((entry) => entry.instanceId === instanceId)?.displayName ??
                    instanceId}{" "}
                  {count}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {tasks.length === 0 ? (
          <section className="flex min-h-[26rem] flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/75 p-8 text-center">
            <div className="max-w-md">
              <FolderGit2Icon className="mx-auto size-8 text-primary" aria-hidden />
              <h2 className="mt-4 text-lg font-semibold">
                Run multiple coding agents without sharing one writable workspace.
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a Task, choose a provider, set ownership, then start and review the work
                here.
              </p>
              <Button className="mt-5" onClick={() => setCreateOpen(true)}>
                Create your first Task
              </Button>
            </div>
          </section>
        ) : (
          <div className="grid min-h-[34rem] flex-1 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_23rem]">
            <section
              className="min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card/95"
              aria-label="Task rail"
            >
              <div className="border-b border-border/70 px-3 py-2.5">
                <h2 className="text-sm font-medium">Tasks</h2>
                <p className="text-xs text-muted-foreground">
                  Select a Task to inspect its canonical state.
                </p>
              </div>
              <div className="max-h-[calc(100dvh-18rem)] overflow-auto p-1.5 [content-visibility:auto]">
                {tasks.map((task) => {
                  const thread = task.threadId ? (threadById.get(task.threadId) ?? null) : null;
                  const attention = attentionByTaskId.get(task.id) ?? [];
                  const presentation = deriveTaskPresentationStatus({ task, thread, attention });
                  const providerEntry = providerEntryByTaskId.get(task.id) ?? null;
                  const selection = modelSelectionByTaskId.get(task.id) ?? null;
                  return (
                    <button
                      type="button"
                      key={task.id}
                      aria-current={selectedTask?.id === task.id ? "true" : undefined}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`mb-1 w-full rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selectedTask?.id === task.id
                          ? "bg-primary/10 ring-1 ring-primary/25"
                          : "hover:bg-muted/45"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">{task.title}</span>
                        <ChevronRightIcon
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge size="sm" variant={toneVariant[presentation.tone]}>
                          {presentation.label}
                        </Badge>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {providerEntry?.displayName ?? selection?.instanceId ?? "Unassigned"} ·{" "}
                          {selection?.model || "No model"}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                        <span>{task.role === "builder" ? "Builder" : task.role}</span>
                        <span className="text-right">{taskChangedFiles(task)} files</span>
                        <span>{task.workspace?.status ?? "No workspace"}</span>
                        <span className="truncate text-right">
                          {task.handoff?.status ?? "No handoff"}
                        </span>
                      </div>
                      <AttentionList items={attention.slice(0, 1)} />
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className="min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card/95"
              aria-label="Active Task workspace"
            >
              {selectedTask ? (
                <div className="flex h-full min-h-[30rem] flex-col">
                  <header className="border-b border-border/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Active workspace</p>
                        <h2 className="truncate text-base font-semibold">{selectedTask.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedProviderEntry?.displayName ??
                            selectedSelection?.instanceId ??
                            "Unassigned"}{" "}
                          · {selectedSelection?.model || "No model"} · {selectedTask.role}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedTask.status === "draft" ? (
                          <Button
                            size="xs"
                            disabled={busyTaskId === selectedTask.id}
                            onClick={() => void startTask(selectedTask)}
                          >
                            <PlayIcon />{" "}
                            {selectedTask.workspace?.status === "preparing"
                              ? "Preparing…"
                              : "Start"}
                          </Button>
                        ) : null}
                        {selectedThread?.latestTurn?.state === "running" ? (
                          <Button
                            size="xs"
                            variant="destructive"
                            disabled={busyTaskId === selectedTask.id}
                            onClick={() =>
                              void runTaskCommand(selectedTask, "Could not stop current turn", () =>
                                interruptTurn({
                                  environmentId: project.environmentId,
                                  input: { threadId: selectedThread.id },
                                }),
                              )
                            }
                          >
                            <SquareIcon /> Stop current turn
                          </Button>
                        ) : null}
                        {selectedTask.threadId ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => openThread(selectedTask)}
                          >
                            <ExternalLinkIcon /> Open Thread
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </header>
                  <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                    <CompactStat label="Task status" value={selectedTask.status} />
                    <CompactStat
                      label="Current action"
                      value={deriveCurrentAction(selectedThread)}
                    />
                    <CompactStat
                      label="Workspace"
                      value={selectedTask.workspace?.status ?? "Not prepared"}
                    />
                    <CompactStat
                      label="Ownership"
                      value={selectedTask.ownership?.status ?? "Unconfigured"}
                    />
                  </div>
                  <div className="mx-3 rounded-lg border border-border/60 bg-background/45 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ActivityIcon className="size-4 text-primary" aria-hidden /> Canonical
                      provider execution
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedTask.threadId
                        ? "This Task uses its existing Thread, provider stream, composer, tools, and terminal. Open it to continue execution without creating a second chat surface."
                        : "Starting prepares an isolated worktree, creates the canonical Thread, binds it to this Task, and dispatches the objective to the selected provider."}
                    </p>
                    {selectedThread ? (
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Thread</dt>
                          <dd className="truncate font-mono">{selectedThread.id}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Session</dt>
                          <dd>{selectedThread.session?.status ?? "Not started"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Turn</dt>
                          <dd>{selectedThread.latestTurn?.state ?? "No turn"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Updated</dt>
                          <dd>{formatTimestamp(selectedThread.updatedAt)}</dd>
                        </div>
                      </dl>
                    ) : null}
                  </div>
                  <div className="mt-auto border-t border-border/70 p-3">
                    <AttentionList items={selectedAttention} />
                    {selectedAttention.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2Icon className="size-3.5 text-success" aria-hidden /> No
                        attention required.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

            <section
              className="min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card/95 lg:col-span-2 xl:col-span-1"
              aria-label="Task inspector"
            >
              {selectedTask ? (
                <div className="flex h-full min-h-[30rem] flex-col">
                  <div className="border-b border-border/70 px-3 py-2.5">
                    <h2 className="text-sm font-medium">Inspector</h2>
                  </div>
                  <div
                    className="flex gap-1 overflow-x-auto border-b border-border/60 p-1.5"
                    role="tablist"
                    aria-label="Task inspector sections"
                  >
                    {(["overview", "ownership", "changes", "review", "workspace"] as const).map(
                      (section) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={inspectorSection === section}
                          key={section}
                          onClick={() => setInspectorSection(section)}
                          className={`rounded-md px-2 py-1.5 text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inspectorSection === section ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-muted/45"}`}
                        >
                          {section}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-3">
                    {inspectorSection === "overview" ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Objective</p>
                          <p className="mt-1 text-sm leading-5">{selectedTask.objective}</p>
                        </div>
                        <dl className="space-y-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Provider / model</dt>
                            <dd>
                              {selectedProviderEntry?.displayName ??
                                selectedSelection?.instanceId ??
                                "Unassigned"}{" "}
                              · {selectedSelection?.model || "No model"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Role</dt>
                            <dd>{selectedTask.role}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Created</dt>
                            <dd>{formatTimestamp(selectedTask.createdAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Activated</dt>
                            <dd>{formatTimestamp(selectedTask.activatedAt)}</dd>
                          </div>
                        </dl>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTask.status === "draft" || selectedTask.status === "active" ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() =>
                                void runTaskCommand(selectedTask, "Could not cancel Task", () =>
                                  cancelTask({
                                    environmentId: project.environmentId,
                                    input: { taskId: selectedTask.id },
                                  }),
                                )
                              }
                            >
                              <CircleSlash2Icon /> Cancel Task
                            </Button>
                          ) : null}
                          {(selectedTask.status === "completed" ||
                            selectedTask.status === "cancelled") &&
                          selectedTask.workspace &&
                          selectedTask.workspace.status !== "removed" ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() =>
                                void runTaskCommand(
                                  selectedTask,
                                  "Could not remove workspace",
                                  () =>
                                    removeWorkspace({
                                      environmentId: project.environmentId,
                                      input: { taskId: selectedTask.id },
                                    }),
                                )
                              }
                            >
                              <Trash2Icon /> Remove workspace
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {inspectorSection === "ownership" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <ShieldCheckIcon className="size-4" /> Ownership
                          </span>
                          <Badge
                            size="sm"
                            variant={
                              selectedTask.ownership?.status === "valid"
                                ? "success"
                                : selectedTask.ownership?.status === "violation" ||
                                    selectedTask.ownership?.status === "error"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {selectedTask.ownership?.status ?? "Unconfigured"}
                          </Badge>
                        </div>
                        {(["write", "read", "deny"] as const).map((access) => (
                          <div key={access}>
                            <p className="text-[11px] text-muted-foreground">
                              {access === "read" ? "Read-only" : access}
                            </p>
                            <div className="mt-1 space-y-1">
                              {selectedTask.ownership?.rules
                                .filter((rule) => rule.access === access)
                                .map((rule) => (
                                  <code
                                    key={rule.id}
                                    className="block truncate rounded bg-muted/45 px-2 py-1 text-xs"
                                  >
                                    {rule.pattern}
                                  </code>
                                )) || null}
                            </div>
                          </div>
                        ))}
                        {selectedTask.ownership?.violations.map((violation) => (
                          <p
                            key={`${violation.path}:${violation.changeType}`}
                            className="rounded-md bg-destructive/8 px-2 py-1.5 text-xs text-destructive"
                          >
                            {violation.path} · {violation.reason}
                          </p>
                        ))}
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => editOwnership(selectedTask)}
                          >
                            Edit ownership
                          </Button>
                          {selectedTask.workspace?.status === "ready" ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() =>
                                void runTaskCommand(
                                  selectedTask,
                                  "Could not validate ownership",
                                  () =>
                                    validateOwnership({
                                      environmentId: project.environmentId,
                                      input: { taskId: selectedTask.id },
                                    }),
                                )
                              }
                            >
                              Validate ownership
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {inspectorSection === "changes" ? (
                      selectedTask.workspace?.status === "ready" ? (
                        <TaskChangesPanel
                          environmentId={project.environmentId}
                          task={selectedTask}
                          provider={
                            selectedProviderEntry?.displayName ?? selectedSelection?.instanceId
                          }
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Changes become available after the Task workspace is ready.
                        </p>
                      )
                    ) : null}
                    {inspectorSection === "review" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <CompactStat
                            label="Snapshot"
                            value={selectedTask.reviewSnapshot?.status ?? "Not prepared"}
                          />
                          <CompactStat
                            label="Handoff"
                            value={selectedTask.handoff?.status ?? "Not prepared"}
                          />
                        </div>
                        {selectedTask.handoff ? (
                          <label className="block space-y-1.5 text-xs">
                            <span className="text-muted-foreground">Handoff summary</span>
                            <Textarea
                              rows={7}
                              value={handoffSummary}
                              onChange={(event) => setHandoffSummary(event.currentTarget.value)}
                            />
                          </label>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Prepare completion to capture an immutable review snapshot and
                            structured handoff.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTask.status === "active" ? (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={
                                  busyTaskId === selectedTask.id ||
                                  selectedTask.ownership?.status === "pending"
                                }
                                onClick={() =>
                                  void runTaskCommand(
                                    selectedTask,
                                    "Could not prepare review",
                                    () =>
                                      prepareReview({
                                        environmentId: project.environmentId,
                                        input: { taskId: selectedTask.id, generation: "provider" },
                                      }),
                                  )
                                }
                              >
                                Prepare completion
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={
                                  busyTaskId === selectedTask.id ||
                                  selectedTask.ownership?.status === "pending"
                                }
                                onClick={() =>
                                  void runTaskCommand(
                                    selectedTask,
                                    "Could not prepare manual handoff",
                                    () =>
                                      prepareReview({
                                        environmentId: project.environmentId,
                                        input: { taskId: selectedTask.id, generation: "manual" },
                                      }),
                                  )
                                }
                              >
                                Manual handoff
                              </Button>
                            </>
                          ) : null}
                          {selectedTask.handoff &&
                          selectedTask.reviewSnapshot?.status === "current" &&
                          selectedTask.handoff.snapshotId === selectedTask.reviewSnapshot.id ? (
                            <Button
                              size="xs"
                              disabled={!handoffSummary.trim() || busyTaskId === selectedTask.id}
                              onClick={() => void saveHandoffReady(selectedTask)}
                            >
                              Mark ready
                            </Button>
                          ) : null}
                          {selectedTask.handoff?.status === "ready" &&
                          selectedTask.reviewSnapshot?.status === "current" ? (
                            <Button
                              size="xs"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() =>
                                void runTaskCommand(selectedTask, "Could not complete Task", () =>
                                  completeTask({
                                    environmentId: project.environmentId,
                                    input: { taskId: selectedTask.id },
                                  }),
                                )
                              }
                            >
                              Complete Task
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {inspectorSection === "workspace" ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Isolation</p>
                          <p>{selectedTask.workspace ? "Git-isolated" : "Not prepared"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Branch</p>
                          <code className="block truncate">
                            {selectedTask.workspace?.branch ?? "Not assigned"}
                          </code>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Base SHA</p>
                          <code className="block truncate">
                            {selectedTask.workspace?.baseCommit ?? "Not recorded"}
                          </code>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Worktree</p>
                          <code className="block break-all">
                            {selectedTask.workspace?.path ?? "Not prepared"}
                          </code>
                        </div>
                        {selectedTask.status === "active" &&
                        selectedTask.workspace?.status === "ready" ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="xs"
                              variant="destructive"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() => void confirmRestore(selectedTask)}
                            >
                              <RotateCcwIcon /> Restore Task
                            </Button>
                            {selectedTask.restore?.safetyCheckpointRef ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={busyTaskId === selectedTask.id}
                                onClick={() =>
                                  void runTaskCommand(selectedTask, "Could not undo restore", () =>
                                    undoRestore({
                                      environmentId: project.environmentId,
                                      input: { taskId: selectedTask.id },
                                    }),
                                  )
                                }
                              >
                                <Undo2Icon /> Undo restore
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )}

        {activity.length > 0 ? (
          <section
            className="rounded-xl border border-border/70 bg-card/95 p-3"
            aria-label="Command Deck activity"
          >
            <div className="flex items-center gap-2">
              <Clock3Icon className="size-4 text-primary" aria-hidden />
              <h2 className="text-sm font-medium">Activity</h2>
              <span className="text-xs text-muted-foreground">
                Persisted Task, workspace, ownership, review, and restore milestones
              </span>
            </div>
            <ol className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              {activity.slice(0, 12).map((item) => (
                <li key={item.id} className="rounded-lg bg-muted/30 px-2.5 py-2 text-xs">
                  <time className="text-muted-foreground">
                    {new Date(item.occurredAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <p className="mt-0.5 truncate">{item.label}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup className="max-h-[90vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>
              Create a bounded Builder Task, assign a ready provider, and declare path ownership.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Provider and model</span>
              {createSelection ? (
                <ProviderModelPicker
                  activeInstanceId={createSelection.instanceId}
                  model={createSelection.model}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  triggerVariant="outline"
                  triggerClassName="max-w-full"
                  triggerAriaLabel="Task provider and model"
                  onInstanceModelChange={(instanceId, model) =>
                    setCreateSelection(createModelSelection(instanceId, model))
                  }
                />
              ) : (
                <p className="text-sm text-destructive">
                  No ready provider is available. Configure one in Provider settings.
                </p>
              )}
            </div>
          </DialogPanel>
          <TaskCreateFields
            title={createTitle}
            objective={createObjective}
            onTitleChange={setCreateTitle}
            onObjectiveChange={setCreateObjective}
            ownershipRules={createOwnership}
            onOwnershipRulesChange={setCreateOwnership}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !createTitle.trim() ||
                !createObjective.trim() ||
                !createSelection ||
                !ownershipDraftsValid(createOwnership) ||
                busyTaskId !== null
              }
              onClick={() => void submitTask()}
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={editingTask !== null} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit ownership</DialogTitle>
            <DialogDescription>
              Scope changes remain explicit and trigger validation for a ready workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <TaskOwnershipEditor rules={editingRules} onChange={setEditingRules} />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>
              Cancel
            </Button>
            <Button
              disabled={!ownershipDraftsValid(editingRules) || busyTaskId !== null}
              onClick={() => void saveOwnership()}
            >
              Save and revalidate
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </main>
  );
}
