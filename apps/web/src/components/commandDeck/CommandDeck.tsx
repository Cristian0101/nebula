import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { createModelSelection } from "@t3tools/shared/model";
import { resourceMatchesPath } from "@t3tools/shared/resourceCoordination";
import { MissionId, OwnershipRequestId, TaskRestoreId, TaskReviewId } from "@t3tools/contracts";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationTask,
  ProjectId,
  TaskId,
  ProjectQualityPolicy,
  ProjectReviewPolicy,
  SharedResourceId,
  SharedResourceDefinition,
  ResourceLease,
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
  WorkflowIcon,
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
import { projectEnvironment } from "../../state/projects";
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
import { IntegrationPanel } from "./IntegrationPanel";
import { MissionPanel } from "./MissionPanel";
import { ArchitectPlanPanel } from "./ArchitectPlanPanel";
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
  providerSupportsStructuredReview,
  resolveTaskModelSelection,
  resolveTaskProviderEntry,
  selectProjectTasks,
  summarizeCommandDeck,
  taskRequiredQualityGatesPassed,
  taskChangedFileCount,
  type CommandDeckAttention,
} from "./commandDeckLogic";

interface CommandDeckProject {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly defaultModelSelection: ModelSelection | null;
  readonly qualityPolicy?: ProjectQualityPolicy | null | undefined;
  readonly reviewPolicy?: ProjectReviewPolicy | null | undefined;
  readonly sharedResources?: ReadonlyArray<SharedResourceDefinition> | undefined;
  readonly resourceLeases?: ReadonlyArray<ResourceLease> | undefined;
}

type InspectorSection = "overview" | "ownership" | "resources" | "changes" | "review" | "workspace";
type CommandDeckSection = "tasks" | "missions" | "integration";

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

function taskResourceContext(project: CommandDeckProject, task: OrchestrationTask): string {
  const required = new Set(task.requiredResourceIds ?? []);
  const held = new Map(
    (project.resourceLeases ?? [])
      .filter((lease) => lease.status === "held")
      .map((lease) => [lease.resourceId, lease]),
  );
  const resources = project.sharedResources ?? [];
  return [
    "SHARED RESOURCES",
    resources.length === 0
      ? "- None configured"
      : resources
          .map((resource) => {
            const lease = held.get(resource.id);
            const requirement = required.has(resource.id) ? "required" : "not required";
            const leaseState = lease ? `leased to Task ${lease.taskId}` : "available";
            return `- ${resource.name}: ${requirement}; ${leaseState}; paths ${resource.patterns.join(", ")}`;
          })
          .join("\n"),
    "Do not edit a shared-resource path unless this Task explicitly requires it and holds its lease. Request human approval for any ownership expansion.",
  ].join("\n\n");
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
            aria-label="Back to Project Home"
            onClick={() => void navigate({ to: "/projects/$projectKey", params: { projectKey } })}
          >
            <ArrowLeftIcon /> Project Home
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void navigate({ to: "/projects/$projectKey/settings", params: { projectKey } })
            }
          >
            <Settings2Icon /> Project settings
          </Button>
        </div>
      </div>
    </WorkspacePageHeader>
  );
}

export function CommandDeckPage({
  projectKey,
  initialSection = "tasks",
}: {
  readonly projectKey: string;
  readonly initialSection?: CommandDeckSection;
}) {
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
        <CommandDeck
          project={representative}
          projectKey={projectKey}
          displayName={group.displayName}
          initialSection={initialSection}
        />
      </div>
    </SidebarInset>
  );
}

export function CommandDeck({
  project,
  projectKey,
  displayName,
  initialSection = "tasks",
}: {
  readonly project: CommandDeckProject;
  readonly projectKey: string;
  readonly displayName: string;
  readonly initialSection?: CommandDeckSection;
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
  const reviewerInstanceEntries = useMemo(
    () => instanceEntries.filter(providerSupportsStructuredReview),
    [instanceEntries],
  );
  const fallbackSelection = useMemo(
    () => resolveDefaultProviderModelSelection(serverProviders, project.defaultModelSelection),
    [project.defaultModelSelection, serverProviders],
  );
  const tasks = useMemo(
    () => selectProjectTasks(snapshot?.tasks ?? [], project.id),
    [project.id, snapshot?.tasks],
  );
  const currentProject =
    snapshot?.projects.find((candidate) => candidate.id === project.id) ?? null;
  const missions = useMemo(
    () => (snapshot?.missions ?? []).filter((mission) => mission.projectId === project.id),
    [project.id, snapshot?.missions],
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
              resourceBlockerTaskId:
                (project.resourceLeases ?? []).find(
                  (lease) =>
                    lease.status === "held" &&
                    lease.taskId !== task.id &&
                    (task.requiredResourceIds ?? []).includes(lease.resourceId),
                )?.taskId ?? null,
            }),
          ] as const;
        }),
      ),
    [modelSelectionByTaskId, project.resourceLeases, providerEntryByTaskId, tasks, threadById],
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
  const unavailableProviderTaskIds = useMemo(
    () =>
      new Set(
        tasks
          .filter((task) =>
            (attentionByTaskId.get(task.id) ?? []).some((item) => item.kind === "provider"),
          )
          .map((task) => task.id),
      ),
    [attentionByTaskId, tasks],
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
  const setResourceRequirements = useAtomCommand(taskEnvironment.setResourceRequirements, {
    reportFailure: false,
  });
  const createOwnershipRequest = useAtomCommand(taskEnvironment.createOwnershipRequest, {
    reportFailure: false,
  });
  const approveOwnershipRequest = useAtomCommand(taskEnvironment.approveOwnershipRequest, {
    reportFailure: false,
  });
  const denyOwnershipRequest = useAtomCommand(taskEnvironment.denyOwnershipRequest, {
    reportFailure: false,
  });
  const prepareReview = useAtomCommand(taskEnvironment.prepareReview, { reportFailure: false });
  const updateHandoff = useAtomCommand(taskEnvironment.updateHandoff, { reportFailure: false });
  const setAcceptanceCriteria = useAtomCommand(taskEnvironment.setAcceptanceCriteria, {
    reportFailure: false,
  });
  const runQualityGates = useAtomCommand(taskEnvironment.runQualityGates, {
    reportFailure: false,
  });
  const cancelQualityGate = useAtomCommand(taskEnvironment.cancelQualityGate, {
    reportFailure: false,
  });
  const requestIndependentReview = useAtomCommand(taskEnvironment.requestIndependentReview, {
    reportFailure: false,
  });
  const sendReviewFindings = useAtomCommand(taskEnvironment.sendReviewFindings, {
    reportFailure: false,
  });
  const requestRestore = useAtomCommand(taskEnvironment.requestRestore, { reportFailure: false });
  const undoRestore = useAtomCommand(taskEnvironment.undoRestore, { reportFailure: false });
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, { reportFailure: false });
  const addMissionTask = useAtomCommand(projectEnvironment.addMissionTask, {
    reportFailure: false,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createMissionId, setCreateMissionId] = useState<MissionId | null>(null);
  const [deckSection, setDeckSection] = useState<CommandDeckSection>(initialSection);
  const [createTitle, setCreateTitle] = useState("");
  const [createObjective, setCreateObjective] = useState("");
  const [createCriteria, setCreateCriteria] = useState<string[]>([]);
  const [createResourceIds, setCreateResourceIds] = useState<ReadonlySet<SharedResourceId>>(
    () => new Set(),
  );
  const [createSelection, setCreateSelection] = useState<ModelSelection | null>(fallbackSelection);
  const [createOwnership, setCreateOwnership] = useState<ReadonlyArray<OwnershipRuleDraft>>([
    { draftId: randomUUID(), access: "write", pattern: "", reason: "" },
  ]);
  const [editingTask, setEditingTask] = useState<OrchestrationTask | null>(null);
  const [editingRules, setEditingRules] = useState<ReadonlyArray<OwnershipRuleDraft>>([]);
  const [busyTaskId, setBusyTaskId] = useState<TaskId | null>(null);
  const [pendingStartTaskIds, setPendingStartTaskIds] = useState<ReadonlySet<TaskId>>(
    () => new Set(),
  );
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>("overview");
  const [handoffSummary, setHandoffSummary] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [reviewerSelection, setReviewerSelection] = useState<ModelSelection | null>(null);
  const [requestPattern, setRequestPattern] = useState("");
  const [requestReason, setRequestReason] = useState("");

  useEffect(() => setCreateSelection(fallbackSelection), [fallbackSelection]);
  useEffect(() => setHandoffSummary(selectedTask?.handoff?.summary ?? ""), [selectedTask?.handoff]);
  useEffect(
    () => setCriteriaText((selectedTask?.acceptanceCriteria ?? []).join("\n")),
    [selectedTask?.acceptanceCriteria],
  );
  const selectedTaskIdForReviewer = selectedTask?.id ?? null;
  const selectedBuilderSelection = selectedTaskIdForReviewer
    ? (modelSelectionByTaskId.get(selectedTaskIdForReviewer) ?? null)
    : null;
  useEffect(() => {
    if (!selectedTaskIdForReviewer) return setReviewerSelection(null);
    const builderEntry = reviewerInstanceEntries.find(
      (entry) => entry.instanceId === selectedBuilderSelection?.instanceId,
    );
    const different = reviewerInstanceEntries.find(
      (entry) =>
        entry.driverKind !== builderEntry?.driverKind &&
        entry.enabled &&
        entry.isAvailable &&
        entry.status === "ready",
    );
    const fallback = reviewerInstanceEntries.find(
      (entry) => entry.enabled && entry.isAvailable && entry.status === "ready",
    );
    const entry = different ?? fallback;
    setReviewerSelection(
      entry ? createModelSelection(entry.instanceId, entry.models[0]?.slug ?? "auto") : null,
    );
  }, [reviewerInstanceEntries, selectedBuilderSelection?.instanceId, selectedTaskIdForReviewer]);

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
          acceptanceCriteria: createCriteria.map((criterion) => criterion.trim()).filter(Boolean),
          requiredResourceIds: [...createResourceIds],
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
    if (error === null && createMissionId) {
      error = commandError(
        await addMissionTask({
          environmentId: project.environmentId,
          input: { missionId: createMissionId, projectId: project.id, taskId },
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
    setCreateCriteria([]);
    setCreateResourceIds(new Set());
    setCreateOwnership([{ draftId: randomUUID(), access: "write", pattern: "", reason: "" }]);
    setCreateMissionId(null);
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
              text: `Task: ${task.title}\n\nObjective:\n${task.objective}\n\n${taskOwnershipContext(task)}\n\n${taskResourceContext(project, task)}`,
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
      project.resourceLeases,
      project.sharedResources,
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
    setPendingStartTaskIds((current) => new Set(current).add(task.id));
    const error = commandError(
      await prepareWorkspace({
        environmentId: project.environmentId,
        input: { taskId: task.id },
      }),
    );
    if (error) {
      setPendingStartTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      setBusyTaskId(null);
      reportError("Could not prepare Task workspace", error);
    }
  };

  useEffect(() => {
    for (const taskId of pendingStartTaskIds) {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task?.workspace) continue;
      if (task.workspace.status === "ready") {
        setPendingStartTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        void launchReadyTask(task);
      } else if (task.workspace.status === "failed" || task.workspace.status === "missing") {
        setPendingStartTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        setBusyTaskId(null);
        reportError(
          "Could not prepare Task workspace",
          task.workspace.failureReason ?? "Workspace preparation failed.",
        );
      }
    }
  }, [launchReadyTask, pendingStartTaskIds, reportError, tasks]);

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

  const submitOwnershipRequest = async (task: OrchestrationTask) => {
    if (!requestPattern.trim() || !requestReason.trim()) return;
    await runTaskCommand(task, "Could not create ownership request", () =>
      createOwnershipRequest({
        environmentId: project.environmentId,
        input: {
          taskId: task.id,
          requestId: OwnershipRequestId.make(randomUUID()),
          requestedRules: [
            {
              id: randomUUID(),
              access: "write",
              pattern: requestPattern.trim(),
              reason: requestReason.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
          reason: requestReason.trim(),
          source: task.ownership?.violations.some(
            (violation) => violation.path === requestPattern.trim(),
          )
            ? "violation"
            : "human",
        },
      }),
    );
    setRequestPattern("");
    setRequestReason("");
  };

  const approveScopeRequest = async (
    task: OrchestrationTask,
    request: NonNullable<OrchestrationTask["ownershipRequests"]>[number],
  ) => {
    const matchingResources = (project.sharedResources ?? []).filter(
      (resource) =>
        resource.enabled &&
        request.requestedRules.some((rule) => resourceMatchesPath(resource, rule.pattern)),
    );
    const addMatchingResources =
      matchingResources.length > 0 &&
      window.confirm(
        `This scope intersects ${matchingResources.map((resource) => resource.name).join(", ")}. Also require the matching resource lease?`,
      );
    setBusyTaskId(task.id);
    const approvalError = commandError(
      await approveOwnershipRequest({
        environmentId: project.environmentId,
        input: { taskId: task.id, requestId: request.id },
      }),
    );
    if (approvalError) {
      setBusyTaskId(null);
      reportError("Could not approve ownership request", approvalError);
      return;
    }
    if (addMatchingResources) {
      const resourceIds = [
        ...new Set([
          ...(task.requiredResourceIds ?? []),
          ...matchingResources.map((resource) => resource.id),
        ]),
      ];
      const requirementError = commandError(
        await setResourceRequirements({
          environmentId: project.environmentId,
          input: {
            taskId: task.id,
            resourceIds,
            ...(task.status === "active" ? { confirmActiveChange: true } : {}),
          },
        }),
      );
      if (requirementError) {
        reportError(
          "Write ownership granted, but the resource is not available",
          `${requirementError} The Task must acquire the resource before modifying that path.`,
        );
      }
    }
    setBusyTaskId(null);
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

  const saveCriteria = async (task: OrchestrationTask) => {
    const criteria = criteriaText
      .split("\n")
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    const started = task.status !== "draft";
    if (
      started &&
      !window.confirm(
        "Changing acceptance criteria after execution starts invalidates the current quality and review evidence. Continue?",
      )
    )
      return;
    await runTaskCommand(task, "Could not update acceptance criteria", () =>
      setAcceptanceCriteria({
        environmentId: project.environmentId,
        input: {
          taskId: task.id,
          criteria,
          ...(started ? { confirmStartedTaskChange: true } : {}),
        },
      }),
    );
  };

  const requestReview = async (task: OrchestrationTask) => {
    if (!task.reviewSnapshot || !reviewerSelection) return;
    await runTaskCommand(task, "Could not request independent review", () =>
      requestIndependentReview({
        environmentId: project.environmentId,
        input: {
          taskId: task.id,
          snapshotId: task.reviewSnapshot!.id,
          reviewId: TaskReviewId.make(randomUUID()),
          reviewerModelSelection: reviewerSelection,
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
  const configuredGates = (project.qualityPolicy?.gates ?? []).filter((gate) => gate.enabled);
  const currentQualityRuns = selectedTask?.reviewSnapshot
    ? (selectedTask.qualityGateRuns ?? []).filter(
        (run) => run.snapshotId === selectedTask.reviewSnapshot?.id,
      )
    : [];
  const requiredGatesPassed = selectedTask
    ? taskRequiredQualityGatesPassed(configuredGates, selectedTask)
    : false;
  const latestReview = selectedTask?.reviews?.at(-1) ?? null;
  const currentApprovedReview =
    selectedTask?.reviews?.findLast(
      (review) =>
        review.snapshotId === selectedTask.reviewSnapshot?.id &&
        review.status === "completed" &&
        (review.verdict === "approve" || review.verdict === "approve_with_notes"),
    ) ?? null;
  const completionEligible =
    selectedTask?.handoff?.status === "ready" &&
    selectedTask.reviewSnapshot?.status === "current" &&
    requiredGatesPassed &&
    (selectedTask.reviewRequired !== true || currentApprovedReview !== null);

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
            {deckSection === "tasks" ? (
              <Button
                size="sm"
                onClick={() => {
                  setCreateMissionId(null);
                  setCreateOpen(true);
                }}
              >
                <PlusIcon /> New Task
              </Button>
            ) : null}
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
          <nav className="mt-3 flex flex-wrap gap-1" aria-label="Command Deck sections">
            <Button
              size="xs"
              variant={deckSection === "tasks" ? "default" : "outline"}
              onClick={() => setDeckSection("tasks")}
            >
              Tasks
            </Button>
            <Button
              size="xs"
              variant={deckSection === "missions" ? "default" : "outline"}
              onClick={() => setDeckSection("missions")}
            >
              Missions
            </Button>
            <Button
              size="xs"
              variant={deckSection === "integration" ? "default" : "outline"}
              onClick={() => setDeckSection("integration")}
            >
              Integration
            </Button>
          </nav>
        </section>

        {deckSection === "integration" && currentProject ? (
          <IntegrationPanel
            environmentId={project.environmentId}
            project={currentProject}
            tasks={tasks}
          />
        ) : null}

        {deckSection === "missions" && currentProject ? (
          <div className="space-y-3">
            <ArchitectPlanPanel
              environmentId={project.environmentId}
              project={currentProject}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={modelOptionsByInstance}
              fallbackSelection={fallbackSelection}
            />
            <MissionPanel
              environmentId={project.environmentId}
              project={currentProject}
              missions={missions}
              missionRuns={snapshot?.missionRuns ?? []}
              tasks={tasks}
              threads={snapshot?.threads ?? []}
              unavailableProviderTaskIds={unavailableProviderTaskIds}
              onStartTask={startTask}
              onOpenTask={(taskId) => {
                setSelectedTaskId(taskId);
                setDeckSection("tasks");
              }}
              onCreateTask={(missionId) => {
                setCreateMissionId(missionId);
                setCreateOpen(true);
              }}
              onOpenTerminalCenter={() =>
                void navigate({
                  to: "/projects/$projectKey/terminal-center",
                  params: { projectKey },
                })
              }
            />
          </div>
        ) : null}

        {deckSection === "tasks" &&
          (tasks.length === 0 ? (
            <section className="flex min-h-[26rem] flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/75 p-8 text-center">
              <div className="max-w-md">
                <WorkflowIcon className="mx-auto size-8 text-primary" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold">Build with Nebula</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Describe an objective and Architect will propose a Mission plan for you to review
                  before any agent starts. Or create one tightly scoped Task yourself.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setDeckSection("missions")}>
                    <WorkflowIcon /> Plan with Architect
                  </Button>
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <PlusIcon /> Create a Task manually
                  </Button>
                </div>
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
                                void runTaskCommand(
                                  selectedTask,
                                  "Could not stop current turn",
                                  () =>
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
                      {(
                        [
                          "overview",
                          "ownership",
                          "resources",
                          "changes",
                          "review",
                          "workspace",
                        ] as const
                      ).map((section) => (
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
                      ))}
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
                            <button
                              type="button"
                              key={`${violation.path}:${violation.changeType}`}
                              className="block w-full rounded-md bg-destructive/8 px-2 py-1.5 text-left text-xs text-destructive"
                              onClick={() => setRequestPattern(violation.path)}
                            >
                              {violation.path} · {violation.reason} · Create scope request
                            </button>
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
                          <div className="space-y-2 border-t border-black/[0.08] pt-3">
                            <p className="text-sm font-medium">Request scope expansion</p>
                            <input
                              aria-label="Requested write path"
                              className="w-full rounded-md border border-black/[0.08] bg-transparent px-2 py-1.5 text-sm"
                              placeholder="packages/contracts/src/auth.ts"
                              value={requestPattern}
                              onChange={(event) => setRequestPattern(event.currentTarget.value)}
                            />
                            <Textarea
                              aria-label="Ownership request reason"
                              rows={3}
                              placeholder="Why this Task needs the additional write path"
                              value={requestReason}
                              onChange={(event) => setRequestReason(event.currentTarget.value)}
                            />
                            <Button
                              size="xs"
                              disabled={!requestPattern.trim() || !requestReason.trim()}
                              onClick={() => void submitOwnershipRequest(selectedTask)}
                            >
                              Create request
                            </Button>
                          </div>
                          <div className="space-y-2 border-t border-black/[0.08] pt-3">
                            <p className="text-sm font-medium">Requests</p>
                            {(selectedTask.ownershipRequests ?? []).map((request) => (
                              <div
                                key={request.id}
                                className="rounded-md border border-black/[0.08] p-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span>
                                    {request.requestedRules
                                      .map((rule) => `${rule.access} ${rule.pattern}`)
                                      .join(" · ")}
                                  </span>
                                  <Badge
                                    size="sm"
                                    variant={
                                      request.status === "approved"
                                        ? "success"
                                        : request.status === "denied"
                                          ? "destructive"
                                          : "outline"
                                    }
                                  >
                                    {request.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-muted-foreground">{request.reason}</p>
                                {request.status === "pending" ? (
                                  <div className="mt-2 flex gap-2">
                                    <Button
                                      size="xs"
                                      onClick={() =>
                                        void approveScopeRequest(selectedTask, request)
                                      }
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() =>
                                        void runTaskCommand(
                                          selectedTask,
                                          "Could not deny ownership request",
                                          () =>
                                            denyOwnershipRequest({
                                              environmentId: project.environmentId,
                                              input: {
                                                taskId: selectedTask.id,
                                                requestId: request.id,
                                                resolutionNote: null,
                                              },
                                            }),
                                        )
                                      }
                                    >
                                      Deny
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {inspectorSection === "resources" ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Resources</span>
                            <Badge
                              size="sm"
                              variant={
                                selectedTask.resourceCompliance?.status === "valid"
                                  ? "success"
                                  : selectedTask.resourceCompliance?.status === "violation"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {selectedTask.resourceCompliance?.status ?? "Not validated"}
                            </Badge>
                          </div>
                          {(project.sharedResources ?? [])
                            .filter((resource) => resource.enabled)
                            .map((resource) => {
                              const required = (selectedTask.requiredResourceIds ?? []).includes(
                                resource.id,
                              );
                              const lease = (project.resourceLeases ?? []).find(
                                (candidate) =>
                                  candidate.resourceId === resource.id &&
                                  candidate.status === "held",
                              );
                              return (
                                <label
                                  key={resource.id}
                                  className="flex items-start gap-2 rounded-md border border-black/[0.08] p-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    aria-label={`Require ${resource.name}`}
                                    checked={required}
                                    onChange={(event) => {
                                      if (
                                        selectedTask.status === "active" &&
                                        !window.confirm("Change resources for this active Task?")
                                      )
                                        return;
                                      const ids = new Set(selectedTask.requiredResourceIds ?? []);
                                      if (event.currentTarget.checked) ids.add(resource.id);
                                      else ids.delete(resource.id);
                                      void runTaskCommand(
                                        selectedTask,
                                        "Could not update Task resources",
                                        () =>
                                          setResourceRequirements({
                                            environmentId: project.environmentId,
                                            input: {
                                              taskId: selectedTask.id,
                                              resourceIds: [...ids],
                                              confirmActiveChange: selectedTask.status === "active",
                                            },
                                          }),
                                      );
                                    }}
                                  />
                                  <span>
                                    <span className="font-medium">{resource.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {lease
                                        ? lease.taskId === selectedTask.id
                                          ? "Exclusive lease held by this Task"
                                          : `Waiting for resource · held by ${tasks.find((task) => task.id === lease.taskId)?.title ?? lease.taskId}`
                                        : required
                                          ? "Resource ready"
                                          : "Not required"}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          {selectedTask.resourceCompliance?.violations.map((violation) => (
                            <p
                              key={`${violation.resourceId}:${violation.path}`}
                              className="rounded-md bg-destructive/8 p-2 text-xs text-destructive"
                            >
                              {violation.path} · Exclusive resource {violation.resourceName} is not
                              leased by this Task.
                            </p>
                          ))}
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
                          <div className="space-y-1.5 rounded-lg border border-black/[0.08] p-3">
                            <p className="text-xs font-medium">Acceptance criteria</p>
                            <Textarea
                              aria-label="Task acceptance criteria"
                              rows={4}
                              placeholder="One optional criterion per line"
                              value={criteriaText}
                              onChange={(event) => setCriteriaText(event.currentTarget.value)}
                            />
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyTaskId === selectedTask.id}
                              onClick={() => void saveCriteria(selectedTask)}
                            >
                              Save criteria
                            </Button>
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
                          <div className="space-y-2 rounded-lg border border-black/[0.08] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-medium">Quality gates</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {configuredGates.length === 0
                                    ? "No project quality gates configured"
                                    : `${configuredGates.filter((gate) => gate.required).length} required`}
                                </p>
                              </div>
                              {selectedTask.reviewSnapshot?.status === "current" &&
                              selectedTask.handoff?.status === "ready" ? (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={
                                    busyTaskId === selectedTask.id ||
                                    configuredGates.some(
                                      (gate) => gate.approvedCommand !== gate.command,
                                    )
                                  }
                                  onClick={() =>
                                    void runTaskCommand(
                                      selectedTask,
                                      "Could not run quality gates",
                                      () =>
                                        runQualityGates({
                                          environmentId: project.environmentId,
                                          input: {
                                            taskId: selectedTask.id,
                                            snapshotId: selectedTask.reviewSnapshot!.id,
                                          },
                                        }),
                                    )
                                  }
                                >
                                  Run gates
                                </Button>
                              ) : null}
                            </div>
                            {configuredGates.length > 0 ? (
                              <div className="rounded-md bg-muted/30 p-2 font-mono text-[11px]">
                                {configuredGates.map((gate) => (
                                  <p key={gate.id}>{gate.command}</p>
                                ))}
                              </div>
                            ) : null}
                            <div className="space-y-1">
                              {configuredGates.map((gate) => {
                                const run = currentQualityRuns.findLast(
                                  (candidate) =>
                                    candidate.gateId === gate.id &&
                                    candidate.command === gate.command,
                                );
                                return (
                                  <div key={gate.id} className="space-y-1 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>
                                        {run?.status === "passed" ? "✓" : run ? "○" : "–"}{" "}
                                        {gate.label}
                                        {gate.required ? " · Required" : " · Optional"}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {run?.status ?? "Not run"}
                                        {run?.exitCode === null || run?.exitCode === undefined
                                          ? ""
                                          : ` · exit ${run.exitCode}`}
                                      </span>
                                      {run?.status === "running" || run?.status === "queued" ? (
                                        <Button
                                          size="xs"
                                          variant="ghost"
                                          onClick={() =>
                                            void runTaskCommand(
                                              selectedTask,
                                              "Could not cancel quality gate",
                                              () =>
                                                cancelQualityGate({
                                                  environmentId: project.environmentId,
                                                  input: { taskId: selectedTask.id, runId: run.id },
                                                }),
                                            )
                                          }
                                        >
                                          Cancel
                                        </Button>
                                      ) : null}
                                    </div>
                                    {run?.outputSummary ? (
                                      <details className="rounded bg-muted/30 px-2 py-1">
                                        <summary className="cursor-pointer text-muted-foreground">
                                          Output summary{run.outputTruncated ? " · Truncated" : ""}
                                        </summary>
                                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                                          {run.outputSummary}
                                        </pre>
                                      </details>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-2 rounded-lg border border-black/[0.08] p-3">
                            <div>
                              <p className="text-xs font-medium">Independent review</p>
                              <p className="text-[11px] text-muted-foreground">
                                {latestReview
                                  ? `${latestReview.status}${latestReview.verdict ? ` · ${latestReview.verdict}` : ""}`
                                  : selectedTask.reviewRequired
                                    ? "Required for this Task"
                                    : "Optional for this Task"}
                              </p>
                            </div>
                            {reviewerSelection ? (
                              <ProviderModelPicker
                                activeInstanceId={reviewerSelection.instanceId}
                                model={reviewerSelection.model}
                                lockedProvider={null}
                                instanceEntries={reviewerInstanceEntries}
                                modelOptionsByInstance={modelOptionsByInstance}
                                triggerVariant="outline"
                                triggerClassName="max-w-full"
                                triggerAriaLabel="Reviewer provider and model"
                                onInstanceModelChange={(instanceId, model) =>
                                  setReviewerSelection(createModelSelection(instanceId, model))
                                }
                              />
                            ) : (
                              <p className="text-xs text-destructive">
                                No ready reviewer provider.
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Review diversity:{" "}
                              {instanceEntries.find(
                                (entry) => entry.instanceId === reviewerSelection?.instanceId,
                              )?.driverKind === selectedProviderEntry?.driverKind
                                ? "Same provider · Degraded"
                                : "Cross-provider"}
                            </p>
                            <Button
                              size="xs"
                              disabled={
                                !reviewerSelection ||
                                !requiredGatesPassed ||
                                selectedTask.handoff?.status !== "ready" ||
                                selectedTask.reviewSnapshot?.status !== "current" ||
                                busyTaskId === selectedTask.id
                              }
                              onClick={() => void requestReview(selectedTask)}
                            >
                              Request review
                            </Button>
                            {latestReview?.summary ? (
                              <div className="space-y-2 rounded-md bg-muted/30 p-2 text-xs">
                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  <span>
                                    Reviewer:{" "}
                                    {instanceEntries.find(
                                      (entry) =>
                                        entry.instanceId ===
                                        latestReview.reviewerModelSelection.instanceId,
                                    )?.displayName ??
                                      latestReview.reviewerModelSelection.instanceId}
                                  </span>
                                  <span>Snapshot: {latestReview.snapshotId}</span>
                                  <span>
                                    Diversity:{" "}
                                    {latestReview.diversity === "cross-provider"
                                      ? "Cross-provider"
                                      : "Same provider · Degraded"}
                                  </span>
                                </div>
                                <p className="font-medium">{latestReview.verdict}</p>
                                <p>{latestReview.summary}</p>
                                {latestReview.findings.length > 0 ? (
                                  <div className="space-y-1">
                                    {latestReview.findings.map((finding) => (
                                      <div
                                        key={`${finding.severity}:${finding.title}:${finding.detail}:${finding.file ?? ""}:${finding.line ?? ""}`}
                                        className="rounded border border-black/[0.08] p-2"
                                      >
                                        <p className="font-medium">
                                          {finding.severity} · {finding.title}
                                        </p>
                                        <p className="text-muted-foreground">{finding.detail}</p>
                                        {finding.file ? (
                                          <p className="font-mono text-[10px] text-muted-foreground">
                                            {finding.file}
                                            {finding.line ? `:${finding.line}` : ""}
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {latestReview.criteria.length > 0 ? (
                                  <div className="space-y-1">
                                    <p className="font-medium">Acceptance criteria</p>
                                    {latestReview.criteria.map((criterion) => (
                                      <p
                                        key={`${criterion.criterion}:${criterion.status}:${criterion.detail}`}
                                      >
                                        {criterion.status} · {criterion.criterion}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
                                {latestReview.requiredChanges.length > 0 ? (
                                  <ol className="list-decimal space-y-1 pl-4">
                                    {latestReview.requiredChanges.map((change) => (
                                      <li key={change}>{change}</li>
                                    ))}
                                  </ol>
                                ) : null}
                                {latestReview.verdict === "request_changes" ||
                                latestReview.verdict === "reject" ? (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={busyTaskId === selectedTask.id}
                                    onClick={() =>
                                      void runTaskCommand(
                                        selectedTask,
                                        "Could not send findings to Builder",
                                        () =>
                                          sendReviewFindings({
                                            environmentId: project.environmentId,
                                            input: {
                                              taskId: selectedTask.id,
                                              reviewId: latestReview.id,
                                            },
                                          }),
                                      )
                                    }
                                  >
                                    Send review findings to Builder
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                            {(selectedTask.reviews?.length ?? 0) > 0 ? (
                              <details className="text-[11px] text-muted-foreground">
                                <summary className="cursor-pointer">
                                  Review history: {selectedTask.reviews?.length} round
                                  {selectedTask.reviews?.length === 1 ? "" : "s"} preserved
                                </summary>
                                <ol className="mt-1 space-y-1 pl-4">
                                  {selectedTask.reviews?.map((review, index) => (
                                    <li key={review.id}>
                                      Round {index + 1} · {review.status}
                                      {review.verdict ? ` · ${review.verdict}` : ""} ·{" "}
                                      {review.diversity === "cross-provider"
                                        ? "Cross-provider"
                                        : "Same provider"}
                                    </li>
                                  ))}
                                </ol>
                              </details>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedTask.status === "active" ? (
                              <>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={
                                    busyTaskId === selectedTask.id ||
                                    selectedTask.ownership?.status === "pending" ||
                                    selectedTask.reviewSnapshot?.status === "current"
                                  }
                                  onClick={() =>
                                    void runTaskCommand(
                                      selectedTask,
                                      "Could not prepare review",
                                      () =>
                                        prepareReview({
                                          environmentId: project.environmentId,
                                          input: {
                                            taskId: selectedTask.id,
                                            generation: "provider",
                                          },
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
                                    selectedTask.ownership?.status === "pending" ||
                                    selectedTask.reviewSnapshot?.status === "current"
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
                                disabled={!completionEligible || busyTaskId === selectedTask.id}
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
                                    void runTaskCommand(
                                      selectedTask,
                                      "Could not undo restore",
                                      () =>
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
          ))}

        {deckSection === "tasks" && activity.length > 0 ? (
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateMissionId(null);
        }}
      >
        <DialogPopup className="max-h-[90vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{createMissionId ? "New Mission Task" : "New Task"}</DialogTitle>
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
          <DialogPanel className="space-y-1.5">
            <span className="text-sm font-medium">Acceptance criteria</span>
            <Textarea
              aria-label="New Task acceptance criteria"
              rows={4}
              placeholder="Optional · one criterion per line"
              value={createCriteria.join("\n")}
              onChange={(event) =>
                setCreateCriteria(
                  event.currentTarget.value.split("\n").map((criterion) => criterion.trimStart()),
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Keep this compact: state only the observable outcomes the reviewer should verify.
            </p>
          </DialogPanel>
          {(project.sharedResources ?? []).filter((resource) => resource.enabled).length > 0 ? (
            <DialogPanel className="space-y-2">
              <span className="text-sm font-medium">Shared resources</span>
              {(project.sharedResources ?? [])
                .filter((resource) => resource.enabled)
                .map((resource) => (
                  <label key={resource.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Require ${resource.name}`}
                      checked={createResourceIds.has(resource.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setCreateResourceIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(resource.id);
                          else next.delete(resource.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <span className="font-medium">{resource.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {resource.patterns.join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
            </DialogPanel>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setCreateMissionId(null);
              }}
            >
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
