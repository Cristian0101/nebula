import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationTask,
  ProjectId,
  TaskOwnershipAccess,
  TaskOwnershipRule,
  TaskId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleSlash2Icon,
  ExternalLinkIcon,
  PlayIcon,
  PlusIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";

import { newMessageId, newTaskId, newThreadId, randomUUID } from "../lib/utils";
import { environmentSnapshotAtom } from "../state/shell";
import { taskEnvironment } from "../state/tasks";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useEnvironmentQuery } from "../state/query";
import { vcsEnvironment } from "../state/vcs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { SettingsSection } from "./settings/settingsLayout";

interface ProjectTaskContext {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly workspaceRoot: string;
  readonly defaultModelSelection: ModelSelection | null;
}

const statusVariant = {
  draft: "secondary",
  active: "info",
  completed: "success",
  cancelled: "outline",
} as const;

export function ProjectTaskCard({
  task,
  projectId,
  provider,
  workspace,
  gitStatusSummary,
  busy,
  onStart,
  onOpenThread,
  onComplete,
  onCancel,
  onRemoveWorkspace,
  onEditOwnership,
  onValidateOwnership,
}: {
  readonly task: OrchestrationTask;
  readonly projectId: ProjectId;
  readonly provider: string | undefined;
  readonly workspace: string;
  readonly gitStatusSummary: string;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onOpenThread: () => void;
  readonly onComplete: () => void;
  readonly onCancel: () => void;
  readonly onRemoveWorkspace?: () => void;
  readonly onEditOwnership: () => void;
  readonly onValidateOwnership: () => void;
}) {
  const ownership = task.ownership;
  const ownershipConfigured =
    ownership?.required !== true || ownership.rules.some((rule) => rule.access === "write");
  return (
    <article className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{task.title}</h3>
            <Badge size="sm" variant={statusVariant[task.status]}>
              {task.status[0]?.toUpperCase() + task.status.slice(1)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {task.role[0]?.toUpperCase() + task.role.slice(1)}
            </span>
          </div>
          <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{task.objective}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {task.status === "draft" ? (
            <Button size="xs" disabled={busy || !ownershipConfigured} onClick={onStart}>
              <PlayIcon />
              {task.workspace?.status === "preparing" ? "Preparing workspace…" : "Start"}
            </Button>
          ) : null}
          {task.threadId !== null ? (
            <Button size="xs" variant="outline" onClick={onOpenThread}>
              <ExternalLinkIcon />
              Open Thread
            </Button>
          ) : null}
          {task.status === "active" ? (
            <Button size="xs" variant="outline" disabled={busy} onClick={onComplete}>
              <CheckIcon />
              Complete
            </Button>
          ) : null}
          {task.status === "draft" || task.status === "active" ? (
            <Button size="xs" variant="ghost" disabled={busy} onClick={onCancel}>
              <CircleSlash2Icon />
              Cancel
            </Button>
          ) : null}
          {(task.status === "completed" || task.status === "cancelled") &&
          task.workspace != null &&
          task.workspace.status !== "removed" ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy || task.workspace.status === "removing"}
              onClick={onRemoveWorkspace}
            >
              <Trash2Icon />
              Remove workspace
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-foreground/70">Project</dt>
          <dd className="truncate font-mono">{projectId}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Thread</dt>
          <dd className="truncate font-mono">{task.threadId ?? "Not assigned"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Provider</dt>
          <dd className="truncate font-mono">{provider ?? "Not assigned"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Workspace</dt>
          <dd className="truncate font-mono">{workspace}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Workspace state</dt>
          <dd className="truncate font-mono">{task.workspace?.status ?? "Legacy shared"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Branch</dt>
          <dd className="truncate font-mono">{task.workspace?.branch ?? "Not isolated"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Base commit</dt>
          <dd className="truncate font-mono">
            {task.workspace?.baseCommit?.slice(0, 12) ?? "Not recorded"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-foreground/70">Git status</dt>
          <dd className="truncate font-mono">{gitStatusSummary}</dd>
        </div>
        <div>
          <dt className="text-foreground/70">Created</dt>
          <dd>{new Date(task.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-foreground/70">Updated</dt>
          <dd>{new Date(task.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <section className="space-y-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            {ownership?.status === "valid" ? (
              <ShieldCheckIcon className="size-4 text-success" />
            ) : ownership?.status === "violation" || ownership?.status === "error" ? (
              <ShieldAlertIcon className="size-4 text-destructive" />
            ) : null}
            <span className="font-medium">Ownership</span>
            <Badge
              size="sm"
              variant={
                ownership?.status === "valid"
                  ? "success"
                  : ownership?.status === "violation" || ownership?.status === "error"
                    ? "destructive"
                    : "outline"
              }
            >
              {ownership === null || ownership === undefined
                ? "Legacy / Unconfigured"
                : ownership.status[0]?.toUpperCase() + ownership.status.slice(1)}
            </Badge>
          </div>
          {ownership?.required === true ? (
            <div className="flex gap-2">
              <Button size="xs" variant="outline" onClick={onEditOwnership} disabled={busy}>
                Edit ownership
              </Button>
              {task.workspace?.status === "ready" && ownership.rules.length > 0 ? (
                <Button size="xs" variant="outline" onClick={onValidateOwnership} disabled={busy}>
                  Validate ownership
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {ownership?.required === true && ownership.rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add at least one write path before this Builder Task can start.
          </p>
        ) : null}
        {ownership?.status === "valid" ? (
          <p className="text-xs text-muted-foreground">
            {ownership.changedPathCount} changed{" "}
            {ownership.changedPathCount === 1 ? "path" : "paths"}. All changes are inside declared
            write scope.
          </p>
        ) : null}
        {ownership?.status === "violation" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-destructive">
              {ownership.violations.length} unauthorized{" "}
              {ownership.violations.length === 1 ? "change" : "changes"}. Completion is blocked.
            </p>
            <ul className="space-y-1">
              {ownership.violations.map((violation) => (
                <li
                  key={`${violation.path}:${violation.changeType}`}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5">{violation.path}</code>
                  <span className="text-muted-foreground">
                    {violation.reason === "denied"
                      ? "Denied"
                      : violation.reason === "read-only"
                        ? "Read-only path modified"
                        : "Outside write scope"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {ownership?.status === "error" ? (
          <p className="text-xs text-destructive">{ownership.errorReason}</p>
        ) : null}
      </section>
      {task.workspace?.failureReason ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {task.workspace.failureReason}
        </p>
      ) : null}
      {(task.status === "completed" || task.status === "cancelled") &&
      task.workspace != null &&
      task.workspace.status !== "removed" ? (
        <p className="text-xs text-muted-foreground">
          Remove workspace deletes only the local worktree. The Task branch and committed work are
          preserved.
        </p>
      ) : null}
    </article>
  );
}

export interface OwnershipRuleDraft {
  readonly draftId?: string;
  readonly access: TaskOwnershipAccess;
  readonly pattern: string;
  readonly reason: string;
}

export function TaskOwnershipEditor({
  rules,
  onChange,
}: {
  readonly rules: ReadonlyArray<OwnershipRuleDraft>;
  readonly onChange: (rules: ReadonlyArray<OwnershipRuleDraft>) => void;
}) {
  const entireRepository = rules.some((rule) => rule.access === "write" && rule.pattern === "**");
  const update = (index: number, patch: Partial<OwnershipRuleDraft>) =>
    onChange(rules.map((rule, current) => (current === index ? { ...rule, ...patch } : rule)));
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={entireRepository}
          onChange={(event) =>
            onChange(
              event.currentTarget.checked
                ? [
                    ...rules.filter((rule) => !(rule.access === "write" && rule.pattern === "**")),
                    {
                      draftId: randomUUID(),
                      access: "write",
                      pattern: "**",
                      reason: "Entire repository",
                    },
                  ]
                : rules.filter((rule) => !(rule.access === "write" && rule.pattern === "**")),
            )
          }
        />
        Entire repository writable
      </label>
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div
            key={rule.draftId ?? `${rule.access}:${rule.pattern}:${rule.reason}`}
            className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <select
              aria-label={`Rule ${index + 1} access`}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={rule.access}
              onChange={(event) =>
                update(index, { access: event.currentTarget.value as TaskOwnershipAccess })
              }
            >
              <option value="write">Write</option>
              <option value="read">Read-only</option>
              <option value="deny">Denied</option>
            </select>
            <Input
              aria-label={`Rule ${index + 1} path`}
              placeholder="apps/web/src/**"
              value={rule.pattern}
              onChange={(event) => update(index, { pattern: event.currentTarget.value })}
            />
            <Input
              aria-label={`Rule ${index + 1} reason`}
              placeholder="Optional reason"
              value={rule.reason}
              onChange={(event) => update(index, { reason: event.currentTarget.value })}
            />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove rule ${index + 1}`}
              onClick={() => onChange(rules.filter((_, current) => current !== index))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="xs"
        variant="outline"
        type="button"
        onClick={() =>
          onChange([...rules, { draftId: randomUUID(), access: "write", pattern: "", reason: "" }])
        }
      >
        <PlusIcon />
        Add path
      </Button>
      <p className="text-xs text-muted-foreground">
        Use repository-relative Git globs. Deny overrides write; read-only and unmatched changes
        block completion.
      </p>
    </div>
  );
}

function TaskCardWithGitStatus(
  props: Omit<ComponentProps<typeof ProjectTaskCard>, "gitStatusSummary"> & {
    readonly environmentId: EnvironmentId;
  },
) {
  const { environmentId, task, ...cardProps } = props;
  const statusQuery = useEnvironmentQuery(
    task.workspace?.status === "ready" && task.workspace.path
      ? vcsEnvironment.status({ environmentId, input: { cwd: task.workspace.path } })
      : null,
  );
  const gitStatusSummary = (() => {
    if (!task.workspace) return "Shared / legacy";
    if (task.workspace.status === "removed") return "Worktree removed";
    if (task.workspace.status === "missing") return "Worktree missing";
    if (task.workspace.status === "failed") return "Unavailable";
    if (task.workspace.status === "preparing") return "Pending";
    if (!statusQuery.data) return "Checking…";
    if (!statusQuery.data.isRepo) return "Not a Git repository";
    const changedFiles = statusQuery.data.workingTree.files.length;
    return statusQuery.data.hasWorkingTreeChanges
      ? `${changedFiles} changed ${changedFiles === 1 ? "file" : "files"}`
      : "Clean";
  })();
  return <ProjectTaskCard {...cardProps} task={task} gitStatusSummary={gitStatusSummary} />;
}

export function TaskCreateFields({
  title,
  objective,
  onTitleChange,
  onObjectiveChange,
  ownershipRules,
  onOwnershipRulesChange,
}: {
  readonly title: string;
  readonly objective: string;
  readonly onTitleChange: (value: string) => void;
  readonly onObjectiveChange: (value: string) => void;
  readonly ownershipRules: ReadonlyArray<OwnershipRuleDraft>;
  readonly onOwnershipRulesChange: (rules: ReadonlyArray<OwnershipRuleDraft>) => void;
}) {
  return (
    <DialogPanel className="space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Title</span>
        <Input value={title} onChange={(event) => onTitleChange(event.currentTarget.value)} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Objective</span>
        <Textarea
          value={objective}
          onChange={(event) => onObjectiveChange(event.currentTarget.value)}
        />
      </label>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Ownership</span>
        <TaskOwnershipEditor rules={ownershipRules} onChange={onOwnershipRulesChange} />
      </div>
    </DialogPanel>
  );
}

export function ownershipDraftsValid(rules: ReadonlyArray<OwnershipRuleDraft>): boolean {
  return (
    rules.some((rule) => rule.access === "write" && rule.pattern.trim().length > 0) &&
    rules.every((rule) => {
      const pattern = rule.pattern.trim().replaceAll("\\", "/");
      return (
        pattern.length > 0 &&
        !pattern.startsWith("/") &&
        !pattern.includes("//") &&
        !pattern.split("/").some((segment) => segment === "." || segment === "..")
      );
    })
  );
}

function ownershipRulesFromDrafts(rules: ReadonlyArray<OwnershipRuleDraft>): TaskOwnershipRule[] {
  const createdAt = new Date().toISOString();
  return rules.map((rule) => ({
    id: randomUUID(),
    access: rule.access,
    pattern: rule.pattern.trim().replaceAll("\\", "/"),
    ...(rule.reason.trim() ? { reason: rule.reason.trim() } : { reason: null }),
    createdAt,
  }));
}

function taskOwnershipContext(task: OrchestrationTask): string {
  const groups = {
    write: task.ownership?.rules.filter((rule) => rule.access === "write") ?? [],
    read: task.ownership?.rules.filter((rule) => rule.access === "read") ?? [],
    deny: task.ownership?.rules.filter((rule) => rule.access === "deny") ?? [],
  };
  const section = (title: string, rules: ReadonlyArray<TaskOwnershipRule>) =>
    `${title}\n${rules.length === 0 ? "- None" : rules.map((rule) => `- ${rule.pattern}`).join("\n")}`;
  return [
    section("WRITE SCOPE", groups.write),
    section("READ-ONLY", groups.read),
    section("DENIED", groups.deny),
    "If implementation requires a modification outside WRITE SCOPE, stop and explain what additional path is required.",
  ].join("\n\n");
}

function commandError(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The command could not be completed.";
}

export function ProjectTasksSection({ project }: { project: ProjectTaskContext }) {
  const navigate = useNavigate();
  const snapshot = useAtomValue(environmentSnapshotAtom(project.environmentId));
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
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [ownershipRules, setOwnershipRules] = useState<ReadonlyArray<OwnershipRuleDraft>>([
    { draftId: randomUUID(), access: "write", pattern: "", reason: "" },
  ]);
  const [editingTask, setEditingTask] = useState<OrchestrationTask | null>(null);
  const [editingRules, setEditingRules] = useState<ReadonlyArray<OwnershipRuleDraft>>([]);
  const [busyTaskId, setBusyTaskId] = useState<TaskId | null>(null);
  const [pendingStartTaskId, setPendingStartTaskId] = useState<TaskId | null>(null);

  const tasks = useMemo(
    () =>
      (snapshot?.tasks ?? [])
        .filter((task) => task.projectId === project.id)
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [project.id, snapshot?.tasks],
  );
  const threadById = useMemo(
    () => new Map((snapshot?.threads ?? []).map((thread) => [thread.id, thread] as const)),
    [snapshot?.threads],
  );

  const reportError = (title: string, description: string) => {
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  };

  const submitTask = async () => {
    const nextTitle = title.trim();
    const nextObjective = objective.trim();
    if (!nextTitle || !nextObjective) return;
    const taskId = newTaskId();
    setBusyTaskId(taskId);
    const result = await createTask({
      environmentId: project.environmentId,
      input: {
        taskId,
        projectId: project.id,
        title: nextTitle,
        objective: nextObjective,
        role: "builder",
      },
    });
    let error = commandError(result);
    if (error === null) {
      error = commandError(
        await setOwnership({
          environmentId: project.environmentId,
          input: { taskId, rules: ownershipRulesFromDrafts(ownershipRules) },
        }),
      );
    }
    setBusyTaskId(null);
    if (error !== null) {
      reportError("Could not create Task", error);
      return;
    }
    setTitle("");
    setObjective("");
    setOwnershipRules([{ draftId: randomUUID(), access: "write", pattern: "", reason: "" }]);
    setCreateOpen(false);
  };

  const launchReadyTask = async (task: OrchestrationTask) => {
    if (
      project.defaultModelSelection === null ||
      task.workspace?.status !== "ready" ||
      task.workspace.path === null ||
      task.workspace.branch === null
    )
      return;
    const threadId = newThreadId();
    const createResult = await createThread({
      environmentId: project.environmentId,
      input: {
        threadId,
        projectId: project.id,
        title: task.title,
        modelSelection: project.defaultModelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: task.workspace.branch,
        worktreePath: task.workspace.path,
      },
    });
    let error = commandError(createResult);
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
    if (error !== null) {
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
          modelSelection: project.defaultModelSelection,
          titleSeed: task.title,
          runtimeMode: "full-access",
          interactionMode: "default",
        },
      }),
    );
    setBusyTaskId(null);
    if (executionError !== null) {
      reportError(
        "Task is active, but provider start failed",
        `${executionError} Open the Thread to retry without losing the Task association.`,
      );
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: project.environmentId, threadId },
    });
  };

  const startTask = async (task: OrchestrationTask) => {
    if (project.defaultModelSelection === null) {
      reportError(
        "Choose a default model",
        "Set this project's default provider and model before starting a Task.",
      );
      return;
    }
    setBusyTaskId(task.id);
    if (task.workspace?.status === "ready") {
      await launchReadyTask(task);
      return;
    }
    setPendingStartTaskId(task.id);
    const result = await prepareWorkspace({
      environmentId: project.environmentId,
      input: { taskId: task.id },
    });
    const error = commandError(result);
    if (error !== null) {
      setPendingStartTaskId(null);
      setBusyTaskId(null);
      reportError("Could not prepare Task workspace", error);
    }
  };

  useEffect(() => {
    if (pendingStartTaskId === null) return;
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
  }, [pendingStartTaskId, tasks]);

  const transitionTask = async (task: OrchestrationTask, transition: "complete" | "cancel") => {
    setBusyTaskId(task.id);
    const command = transition === "complete" ? completeTask : cancelTask;
    const result = await command({
      environmentId: project.environmentId,
      input: { taskId: task.id },
    });
    setBusyTaskId(null);
    const error = commandError(result);
    if (error !== null) reportError(`Could not ${transition} Task`, error);
  };

  const openThread = (task: OrchestrationTask) => {
    if (task.threadId === null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: project.environmentId, threadId: task.threadId },
    });
  };

  const cleanupWorkspace = async (task: OrchestrationTask) => {
    setBusyTaskId(task.id);
    const result = await removeWorkspace({
      environmentId: project.environmentId,
      input: { taskId: task.id },
    });
    setBusyTaskId(null);
    const error = commandError(result);
    if (error !== null) reportError("Could not remove Task workspace", error);
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
    if (editingTask === null || !ownershipDraftsValid(editingRules)) return;
    setBusyTaskId(editingTask.id);
    const result = await setOwnership({
      environmentId: project.environmentId,
      input: { taskId: editingTask.id, rules: ownershipRulesFromDrafts(editingRules) },
    });
    setBusyTaskId(null);
    const error = commandError(result);
    if (error !== null) {
      reportError("Could not update ownership", error);
      return;
    }
    setEditingTask(null);
  };

  const validateTask = async (task: OrchestrationTask) => {
    setBusyTaskId(task.id);
    const result = await validateOwnership({
      environmentId: project.environmentId,
      input: { taskId: task.id },
    });
    setBusyTaskId(null);
    const error = commandError(result);
    if (error !== null) reportError("Could not validate ownership", error);
  };

  return (
    <>
      <SettingsSection
        title="Tasks"
        headerAction={
          <Button size="xs" type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            Create Task
          </Button>
        }
      >
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            No Tasks yet. Create a bounded objective, then start it with this project's inherited
            provider and workspace.
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {tasks.map((task) => {
              const thread =
                task.threadId === null ? null : (threadById.get(task.threadId) ?? null);
              const provider = thread?.session?.providerName ?? thread?.modelSelection.instanceId;
              const workspace =
                task.workspace?.path ?? thread?.worktreePath ?? project.workspaceRoot;
              const busy = busyTaskId === task.id;
              return (
                <TaskCardWithGitStatus
                  key={task.id}
                  environmentId={project.environmentId}
                  task={task}
                  projectId={project.id}
                  provider={provider}
                  workspace={workspace}
                  busy={busy}
                  onStart={() => void startTask(task)}
                  onOpenThread={() => openThread(task)}
                  onComplete={() => void transitionTask(task, "complete")}
                  onCancel={() => void transitionTask(task, "cancel")}
                  onRemoveWorkspace={() => void cleanupWorkspace(task)}
                  onEditOwnership={() => editOwnership(task)}
                  onValidateOwnership={() => void validateTask(task)}
                />
              );
            })}
          </div>
        )}
      </SettingsSection>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Capture one durable engineering objective. Builder is the only functional role in this
              release.
            </DialogDescription>
          </DialogHeader>
          <TaskCreateFields
            title={title}
            objective={objective}
            onTitleChange={setTitle}
            onObjectiveChange={setObjective}
            ownershipRules={ownershipRules}
            onOwnershipRulesChange={setOwnershipRules}
          />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !title.trim() ||
                !objective.trim() ||
                !ownershipDraftsValid(ownershipRules) ||
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
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Edit ownership</DialogTitle>
            <DialogDescription>
              Scope changes are explicit and auditable. Saving revalidates a ready workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <TaskOwnershipEditor rules={editingRules} onChange={setEditingRules} />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditingTask(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!ownershipDraftsValid(editingRules) || busyTaskId !== null}
              onClick={() => void saveOwnership()}
            >
              Save and revalidate
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
