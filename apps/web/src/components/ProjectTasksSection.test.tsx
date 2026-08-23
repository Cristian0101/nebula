import { ProjectId, TaskId, ThreadId, type OrchestrationTask } from "@t3tools/contracts";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ownershipDraftsValid,
  ProjectTaskCard,
  setEntireRepositoryWritable,
  TaskCreateFields,
  TaskOwnershipEditor,
} from "./ProjectTasksSection";

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
    workspace: {
      status: "ready",
      sourceRepository: "/repo",
      baseCommit: "0123456789abcdef",
      branch: `nebula/manual/task-${status}`,
      path: `/worktrees/task-${status}`,
      createdAt: "2026-08-22T12:00:30.000Z",
      removedAt: null,
      failureCode: null,
      failureReason: null,
      updatedAt: "2026-08-22T12:00:30.000Z",
    },
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
    gitStatusSummary: "Clean",
    busy: false,
    onStart: () => undefined,
    onOpenThread: () => undefined,
    onCancel: () => undefined,
    onEditOwnership: () => undefined,
    onValidateOwnership: () => undefined,
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
    expect(html).toContain("nebula/manual/task-active");
    expect(html).toContain("0123456789ab");
    expect(html).toContain("Git status");
    expect(html).toContain("Clean");
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

  it("disables start until a managed Builder Task has a write rule", () => {
    const current = task("draft");
    const html = renderToStaticMarkup(
      card({
        ...current,
        ownership: {
          required: true,
          rules: [],
          status: "unconfigured",
          validatedAt: null,
          changedPathCount: 0,
          violations: [],
          errorReason: null,
          updatedAt: current.updatedAt,
        },
      }),
    );
    expect(html).toContain("Add at least one write path");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Start/s);
  });

  it("offers linked-thread, prepare-completion, and cancel actions while active", () => {
    const onOpenThread = vi.fn();
    const onPrepareReview = vi.fn();
    const onCancel = vi.fn();
    const tree = card(task("active"), { onOpenThread, onPrepareReview, onCancel });
    findAction(tree, "Open Thread")?.();
    findAction(tree, "Prepare completion")?.();
    findAction(tree, "Cancel")?.();
    expect(onOpenThread).toHaveBeenCalledOnce();
    expect(onPrepareReview).toHaveBeenCalledWith("provider");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps a completed Task inspectable without terminal mutation actions", () => {
    const onRemoveWorkspace = vi.fn();
    const tree = card(task("completed"), { onRemoveWorkspace });
    const text = textOf(tree);
    expect(text).toContain("Completed");
    expect(text).toContain("Open Thread");
    expect(findAction(tree, "Complete")).toBeUndefined();
    expect(findAction(tree, "Cancel")).toBeUndefined();
    findAction(tree, "Remove workspace")?.();
    expect(onRemoveWorkspace).toHaveBeenCalledOnce();
    expect(text).toContain("The Task branch and committed work are preserved.");
  });

  it("shows ownership violations and exposes remediation actions", () => {
    const onEditOwnership = vi.fn();
    const onValidateOwnership = vi.fn();
    const current = task("active");
    const tree = card(
      {
        ...current,
        ownership: {
          required: true,
          rules: [
            {
              id: "deny-package",
              access: "deny",
              pattern: "package.json",
              reason: null,
              createdAt: current.createdAt,
            },
          ],
          status: "violation",
          validatedAt: current.updatedAt,
          changedPathCount: 1,
          violations: [
            {
              path: "package.json",
              changeType: "modified",
              reason: "denied",
              matchedRules: [],
            },
          ],
          errorReason: null,
          updatedAt: current.updatedAt,
        },
      },
      { onEditOwnership, onValidateOwnership },
    );
    expect(textOf(tree)).toContain("Completion is blocked");
    expect(textOf(tree)).toContain("package.json");
    findAction(tree, "Edit ownership")?.();
    findAction(tree, "Validate ownership")?.();
    expect(onEditOwnership).toHaveBeenCalledOnce();
    expect(onValidateOwnership).toHaveBeenCalledOnce();
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
        ownershipRules={[{ access: "write", pattern: "apps/web/src/**", reason: "" }]}
        onOwnershipRulesChange={() => undefined}
      />,
    );
    expect(html).toContain("Title");
    expect(html).toContain("Task title");
    expect(html).toContain("Objective");
    expect(html).toContain("Task objective");
  });

  it("requires an explicit write rule and rejects traversal", () => {
    expect(ownershipDraftsValid([{ access: "read", pattern: "src/**", reason: "" }])).toBe(false);
    expect(ownershipDraftsValid([{ access: "write", pattern: "../src/**", reason: "" }])).toBe(
      false,
    );
    expect(
      ownershipDraftsValid([{ access: "write", pattern: "apps/web/src/**", reason: "" }]),
    ).toBe(true);
  });

  it("replaces the initial empty rule when the entire repository is selected", () => {
    const rules = setEntireRepositoryWritable([{ access: "write", pattern: "", reason: "" }], true);
    expect(rules.map((rule) => rule.pattern)).toEqual(["**"]);
    expect(ownershipDraftsValid(rules)).toBe(true);
  });

  it("renders write, read-only, deny, and Entire Repository controls", () => {
    const html = renderToStaticMarkup(
      <TaskOwnershipEditor
        rules={[
          { access: "write", pattern: "src/**", reason: "" },
          { access: "read", pattern: "shared/**", reason: "" },
          { access: "deny", pattern: "package.json", reason: "" },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Entire repository writable");
    expect(html).toContain("Write");
    expect(html).toContain("Read-only");
    expect(html).toContain("Denied");
  });
});
