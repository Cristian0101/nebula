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
  TaskId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleSlash2Icon,
  ExternalLinkIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";

import { newMessageId, newTaskId, newThreadId } from "../lib/utils";
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
}) {
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
            <Button size="xs" disabled={busy} onClick={onStart}>
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
}: {
  readonly title: string;
  readonly objective: string;
  readonly onTitleChange: (value: string) => void;
  readonly onObjectiveChange: (value: string) => void;
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
    </DialogPanel>
  );
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
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
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
    setBusyTaskId(null);
    const error = commandError(result);
    if (error !== null) {
      reportError("Could not create Task", error);
      return;
    }
    setTitle("");
    setObjective("");
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
            text: `Task: ${task.title}\n\nObjective:\n${task.objective}`,
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
          />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!title.trim() || !objective.trim() || busyTaskId !== null}
              onClick={() => void submitTask()}
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
