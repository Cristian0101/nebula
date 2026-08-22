import { ProjectId, TaskId, ThreadId, type OrchestrationTask } from "@t3tools/contracts";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ProjectTaskCard, TaskCreateFields } from "./ProjectTasksSection";

const projectId = ProjectId.make("project-1");

function task(status: OrchestrationTask["status"]): OrchestrationTask {
  return {
    id: TaskId.make(`task-${status}`),
    projectId,
    title: "Refactor authentication callback",
    objective: "Simplify OAuth without changing session authority.",
    role: "builder",
    status,
    threadId: status === "draft" ? null : ThreadId.make("thread-1"),
    createdAt: "2026-08-22T12:00:00.000Z",
    updatedAt: "2026-08-22T12:05:00.000Z",
    activatedAt: status === "active" ? "2026-08-22T12:01:00.000Z" : null,
    completedAt: status === "completed" ? "2026-08-22T12:05:00.000Z" : null,
    cancelledAt: status === "cancelled" ? "2026-08-22T12:05:00.000Z" : null,
  };
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement(node)) return "";
  return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
}

function findAction(node: ReactNode, label: string): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const action = findAction(child, label);
      if (action) return action;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (textOf(element.props.children).trim() === label && element.props.onClick) {
    return element.props.onClick;
  }
  return findAction(element.props.children, label);
}

function card(currentTask: OrchestrationTask, actions = {}) {
  return ProjectTaskCard({
    task: currentTask,
    projectId,
    provider: "codex",
    workspace: "/repo",
    busy: false,
    onStart: () => undefined,
    onOpenThread: () => undefined,
    onComplete: () => undefined,
    onCancel: () => undefined,
    ...actions,
  });
}

describe("ProjectTaskCard", () => {
  it("renders durable Task identity, objective, status, role, and execution context", () => {
    const html = renderToStaticMarkup(card(task("active")));
    expect(html).toContain("Refactor authentication callback");
    expect(html).toContain("Simplify OAuth without changing session authority.");
    expect(html).toContain("Active");
    expect(html).toContain("Builder");
    expect(html).toContain("project-1");
    expect(html).toContain("thread-1");
    expect(html).toContain("codex");
    expect(html).toContain("/repo");
  });

  it("offers start and cancel for a draft Task", () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const tree = card(task("draft"), { onStart, onCancel });
    findAction(tree, "Start")?.();
    findAction(tree, "Cancel")?.();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(textOf(tree)).not.toContain("Complete");
    expect(textOf(tree)).not.toContain("Open Thread");
  });

  it("offers linked-thread, complete, and cancel actions only while active", () => {
    const onOpenThread = vi.fn();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const tree = card(task("active"), { onOpenThread, onComplete, onCancel });
    findAction(tree, "Open Thread")?.();
    findAction(tree, "Complete")?.();
    findAction(tree, "Cancel")?.();
    expect(onOpenThread).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps a completed Task inspectable without terminal mutation actions", () => {
    const tree = card(task("completed"));
    const text = textOf(tree);
    expect(text).toContain("Completed");
    expect(text).toContain("Open Thread");
    expect(findAction(tree, "Complete")).toBeUndefined();
    expect(findAction(tree, "Cancel")).toBeUndefined();
  });
});

describe("TaskCreateFields", () => {
  it("renders the required title and objective fields", () => {
    const html = renderToStaticMarkup(
      <TaskCreateFields
        title="Task title"
        objective="Task objective"
        onTitleChange={() => undefined}
        onObjectiveChange={() => undefined}
      />,
    );
    expect(html).toContain("Title");
    expect(html).toContain("Task title");
    expect(html).toContain("Objective");
    expect(html).toContain("Task objective");
  });
});
