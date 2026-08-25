import type {
  ArchitectMissionDraft,
  ArchitectPlanProposal,
  EnvironmentId,
  ModelSelection,
  SharedResourceDefinition,
} from "@t3tools/contracts";
import { ArchitectPlanProposalId, MissionId } from "@t3tools/contracts";
import { validateArchitectPlan } from "@t3tools/shared/architectPlan";
import { createModelSelection } from "@t3tools/shared/model";
import { useEffect, useMemo, useState } from "react";
import {
  BotIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { newTaskId, randomUUID } from "../../lib/utils";
import type { ProviderInstanceEntry } from "../../providerInstances";
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
import { Textarea } from "../ui/textarea";

export function ArchitectPlanPanel({
  environmentId,
  project,
  instanceEntries,
  modelOptionsByInstance,
  fallbackSelection,
}: {
  readonly environmentId: EnvironmentId;
  readonly project: {
    readonly id: import("@t3tools/contracts").ProjectId;
    readonly architectPlans?: ReadonlyArray<ArchitectPlanProposal> | undefined;
    readonly sharedResources?: ReadonlyArray<SharedResourceDefinition> | undefined;
  };
  readonly instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly modelOptionsByInstance: ReadonlyMap<
    string,
    ReadonlyArray<{ slug: string; name?: string }>
  >;
  readonly fallbackSelection: ModelSelection | null;
}) {
  const generate = useAtomCommand(projectEnvironment.generateArchitectPlan, {
    reportFailure: false,
  });
  const save = useAtomCommand(projectEnvironment.saveArchitectPlan, { reportFailure: false });
  const approve = useAtomCommand(projectEnvironment.approveArchitectPlan, { reportFailure: false });
  const reject = useAtomCommand(projectEnvironment.rejectArchitectPlan, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [constraints, setConstraints] = useState("");
  const [contextPaths, setContextPaths] = useState("");
  const [selection, setSelection] = useState<ModelSelection | null>(fallbackSelection);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approvalPlan, setApprovalPlan] = useState<ArchitectPlanProposal | null>(null);
  const [dependencyFrom, setDependencyFrom] = useState("");
  const [dependencyTo, setDependencyTo] = useState("");
  const plans = project.architectPlans ?? [];
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans.at(-1) ?? null;
  const selectedIsEditable =
    selected !== null && selected.status !== "approved" && selected.status !== "rejected";

  const readyProviders = useMemo(
    () =>
      instanceEntries.filter(
        (entry) =>
          entry.enabled &&
          entry.isAvailable &&
          entry.status === "ready" &&
          (entry.driverKind === "codex" || entry.driverKind === "antigravity"),
      ),
    [instanceEntries],
  );

  useEffect(() => {
    if (selection && readyProviders.some((entry) => entry.instanceId === selection.instanceId))
      return;
    const first = readyProviders[0];
    const model = first?.models[0]?.slug;
    setSelection(first && model ? createModelSelection(first.instanceId, model) : null);
  }, [readyProviders, selection]);

  async function generatePlan() {
    if (!objective.trim() || !selection) return;
    setWorking(true);
    setError(null);
    const proposalId = ArchitectPlanProposalId.make(randomUUID());
    const result = await generate({
      environmentId,
      input: {
        proposalId,
        projectId: project.id,
        objective: objective.trim(),
        constraints: constraints.trim(),
        modelSelection: selection,
        contextPaths: contextPaths
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      },
    });
    if (result._tag === "Failure") {
      setError(
        "Architect generation failed. Verify the repository is clean and the selected provider is ready.",
      );
      setWorking(false);
      return;
    }
    setSelectedId(proposalId);
    setOpen(false);
    setWorking(false);
  }

  async function updateProposal(plan: ArchitectPlanProposal, proposal: ArchitectMissionDraft) {
    if (plan.status === "approved" || plan.status === "rejected") return;
    const validation = validateArchitectPlan({
      proposal,
      planningBaseCommit: plan.planningBaseCommit,
      resources: project.sharedResources ?? [],
      validatedAt: new Date().toISOString(),
    });
    const updated: ArchitectPlanProposal = {
      ...plan,
      proposal,
      validation,
      status: validation.status === "valid" ? "ready" : "invalid",
      revisions: [
        ...plan.revisions,
        {
          number: plan.revisions.length + 1,
          source: "human",
          feedback: null,
          proposal,
          validation,
          createdAt: validation.validatedAt,
        },
      ],
      updatedAt: validation.validatedAt,
    };
    await save({ environmentId, input: { projectId: project.id, plan: updated } });
  }

  async function approveSelected(plan: ArchitectPlanProposal) {
    if (!plan.proposal) return;
    setWorking(true);
    const result = await approve({
      environmentId,
      input: {
        projectId: project.id,
        proposalId: plan.id,
        missionId: MissionId.make(randomUUID()),
        tasks: plan.proposal.tasks.map((task) => ({ key: task.key, taskId: newTaskId() })),
        acknowledgeWarnings: true,
        acknowledgeOriginalBaseline: plan.status === "stale",
      },
    });
    if (result._tag === "Failure")
      setError(
        "Approval was rejected. Recheck validation, provider assignments, resources, and baseline acknowledgment.",
      );
    else setApprovalPlan(null);
    setWorking(false);
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-black/[0.08] bg-card/75 p-4"
      aria-label="Architect Plan Proposals"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">Architect proposals</h2>
          <p className="text-xs text-muted-foreground">
            AI-drafted plans remain separate from Missions until you approve them.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <BotIcon /> Plan with Architect
        </Button>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/8 p-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/[0.08] p-5 text-center text-sm text-muted-foreground">
          No Architect proposals yet. Manual Mission creation remains available below.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[15rem_1fr]">
          <div className="space-y-1">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedId(plan.id)}
                className="w-full rounded-md border border-black/[0.08] p-2 text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {plan.proposal?.title ?? plan.objective}
                </span>
                <span className="text-xs text-muted-foreground">
                  {plan.status} · {plan.validation?.taskCount ?? 0} Tasks
                </span>
                {plan.status === "generating" ? (
                  <span className="block text-xs text-muted-foreground">
                    Base {plan.planningBaseCommit} · provider {plan.architectProviderInstanceId}
                    <br />
                    Planning only. No execution has started.
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {selected?.proposal ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={selected.validation?.status === "valid" ? "success" : "destructive"}
                >
                  {selected.validation?.status ?? selected.status}
                </Badge>
                <Badge variant="outline">Base {selected.planningBaseCommit.slice(0, 8)}</Badge>
                {selected.status === "stale" && selected.observedHeadCommit ? (
                  <Badge variant="destructive">
                    Current HEAD {selected.observedHeadCommit.slice(0, 8)} · regenerate or use
                    original
                  </Badge>
                ) : null}
                <Badge variant="outline">{selected.validation?.waveCount ?? 0} waves</Badge>
                <Badge variant="outline">{selected.validation?.taskCount ?? 0} Tasks</Badge>
                <Badge variant="outline">{selected.validation?.edgeCount ?? 0} edges</Badge>
                <Badge variant="outline">{selected.validation?.errors.length ?? 0} errors</Badge>
                <Badge variant="outline">
                  {selected.validation?.warnings.length ?? 0} warnings
                </Badge>
                <Badge variant="outline">Planning only · no execution</Badge>
              </div>
              <div>
                <input
                  aria-label="Proposed Mission title"
                  className="w-full rounded-md border border-black/[0.08] bg-transparent px-2 py-1.5 text-base font-medium"
                  defaultValue={selected.proposal.title}
                  disabled={!selectedIsEditable}
                  onBlur={(event) => {
                    const title = event.currentTarget.value.trim();
                    if (!title || title === selected.proposal!.title) return;
                    void updateProposal(selected, { ...selected.proposal!, title });
                  }}
                />
                <Textarea
                  aria-label="Proposed Mission objective"
                  className="mt-1 text-sm"
                  rows={2}
                  defaultValue={selected.proposal.objective}
                  disabled={!selectedIsEditable}
                  onBlur={(event) => {
                    const objective = event.currentTarget.value.trim();
                    if (!objective || objective === selected.proposal!.objective) return;
                    void updateProposal(selected, { ...selected.proposal!, objective });
                  }}
                />
              </div>
              {selected.validation?.errors.map((item) => (
                <p
                  role="alert"
                  key={`${item.code}:${item.taskKey ?? ""}:${item.message}`}
                  className="flex gap-1 text-xs text-destructive"
                >
                  <TriangleAlertIcon className="size-3.5" />
                  {item.message}
                </p>
              ))}
              {selected.validation?.warnings.map((item) => (
                <p
                  key={`${item.code}:${item.taskKey ?? ""}:${item.message}`}
                  className="flex gap-1 text-xs text-warning"
                >
                  <TriangleAlertIcon className="size-3.5" />
                  {item.message}
                </p>
              ))}
              <div className="space-y-2">
                {selected.proposal.tasks.map((task, index) => (
                  <article key={task.key} className="rounded-lg border border-black/[0.08] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <input
                          aria-label={`Task title for ${task.key}`}
                          className="w-full rounded border border-black/[0.08] bg-transparent px-2 py-1 text-sm font-medium"
                          defaultValue={task.title}
                          disabled={!selectedIsEditable}
                          onBlur={(event) => {
                            const title = event.currentTarget.value.trim();
                            if (!title || title === task.title) return;
                            const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                              taskIndex === index ? { ...candidate, title } : candidate,
                            );
                            void updateProposal(selected, { ...selected.proposal!, tasks });
                          }}
                        />
                        <Textarea
                          aria-label={`Task objective for ${task.key}`}
                          rows={2}
                          defaultValue={task.objective}
                          disabled={!selectedIsEditable}
                          onBlur={(event) => {
                            const objective = event.currentTarget.value.trim();
                            if (!objective || objective === task.objective) return;
                            const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                              taskIndex === index ? { ...candidate, objective } : candidate,
                            );
                            void updateProposal(selected, { ...selected.proposal!, tasks });
                          }}
                        />
                        <p className="text-xs text-muted-foreground">Proposal key: {task.key}</p>
                      </div>
                      {task.providerRecommendation ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          <Badge variant="outline">
                            Architect suggests{" "}
                            {task.providerRecommendation.driverKind ?? "provider"}
                          </Badge>
                          {task.providerRecommendation.driverKind &&
                          !readyProviders.some(
                            (entry) => entry.driverKind === task.providerRecommendation?.driverKind,
                          ) ? (
                            <Badge variant="destructive">Recommended provider unavailable</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Textarea
                      aria-label={`Acceptance criteria for ${task.key}`}
                      className="mt-2 text-xs"
                      rows={Math.min(6, Math.max(2, task.acceptanceCriteria.length))}
                      defaultValue={task.acceptanceCriteria.join("\n")}
                      disabled={!selectedIsEditable}
                      onBlur={(event) => {
                        const acceptanceCriteria = event.currentTarget.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean);
                        if (acceptanceCriteria.join("\n") === task.acceptanceCriteria.join("\n"))
                          return;
                        const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                          taskIndex === index ? { ...candidate, acceptanceCriteria } : candidate,
                        );
                        void updateProposal(selected, { ...selected.proposal!, tasks });
                      }}
                    />
                    <Textarea
                      aria-label={`Planning notes for ${task.key}`}
                      className="mt-2 text-xs"
                      rows={2}
                      placeholder="One planning note per line"
                      defaultValue={(task.notes ?? []).join("\n")}
                      disabled={!selectedIsEditable}
                      onBlur={(event) => {
                        const notes = event.currentTarget.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean);
                        if (notes.join("\n") === (task.notes ?? []).join("\n")) return;
                        const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                          taskIndex === index ? { ...candidate, notes } : candidate,
                        );
                        void updateProposal(selected, { ...selected.proposal!, tasks });
                      }}
                    />
                    <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
                      {(["write", "read", "deny"] as const).map((access) => (
                        <label key={access} className="capitalize">
                          {access}
                          <Textarea
                            aria-label={`${access} ownership for ${task.key}`}
                            rows={2}
                            defaultValue={task.ownership[access].join("\n")}
                            disabled={!selectedIsEditable}
                            onBlur={(event) => {
                              const values = event.currentTarget.value
                                .split("\n")
                                .map((value) => value.trim())
                                .filter(Boolean);
                              if (values.join("\n") === task.ownership[access].join("\n")) return;
                              const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                                taskIndex === index
                                  ? {
                                      ...candidate,
                                      ownership: { ...candidate.ownership, [access]: values },
                                    }
                                  : candidate,
                              );
                              void updateProposal(selected, { ...selected.proposal!, tasks });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px]">
                      <span className="text-muted-foreground">Shared resources</span>
                      <br />
                      {task.requiredResourceIds.length > 0
                        ? task.requiredResourceIds.join(", ")
                        : "None proposed"}
                    </p>
                    {(project.sharedResources ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {project.sharedResources?.map((resource) => (
                          <label key={resource.id} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={task.requiredResourceIds.includes(resource.id)}
                              disabled={!selectedIsEditable}
                              onChange={(event) => {
                                const requiredResourceIds = event.currentTarget.checked
                                  ? [...task.requiredResourceIds, resource.id]
                                  : task.requiredResourceIds.filter((id) => id !== resource.id);
                                const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                                  taskIndex === index
                                    ? { ...candidate, requiredResourceIds }
                                    : candidate,
                                );
                                void updateProposal(selected, { ...selected.proposal!, tasks });
                              }}
                            />
                            {resource.name}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    <div
                      className={
                        selectedIsEditable ? "mt-2" : "pointer-events-none mt-2 opacity-60"
                      }
                    >
                      <ProviderModelPicker
                        activeInstanceId={task.assignedModelSelection?.instanceId ?? ("" as never)}
                        model={task.assignedModelSelection?.model ?? "auto"}
                        lockedProvider={null}
                        instanceEntries={instanceEntries}
                        modelOptionsByInstance={modelOptionsByInstance as never}
                        triggerVariant="outline"
                        triggerClassName="max-w-full"
                        triggerAriaLabel={`Actual provider assignment for ${task.title}`}
                        onInstanceModelChange={(instanceId, model) => {
                          const tasks = selected.proposal!.tasks.map((candidate, taskIndex) =>
                            taskIndex === index
                              ? {
                                  ...candidate,
                                  assignedModelSelection: createModelSelection(instanceId, model),
                                }
                              : candidate,
                          );
                          void updateProposal(selected, { ...selected.proposal!, tasks });
                        }}
                      />
                    </div>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      disabled={!selectedIsEditable}
                      onClick={() => {
                        const tasks = selected.proposal!.tasks.filter(
                          (_, taskIndex) => taskIndex !== index,
                        );
                        const dependencies = selected.proposal!.dependencies.filter(
                          (edge) =>
                            edge.prerequisiteKey !== task.key && edge.dependentKey !== task.key,
                        );
                        void updateProposal(selected, {
                          ...selected.proposal!,
                          tasks,
                          dependencies,
                        });
                      }}
                    >
                      Delete proposed Task
                    </Button>
                  </article>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedIsEditable}
                  onClick={() => {
                    const existing = new Set(selected.proposal!.tasks.map((task) => task.key));
                    let number = selected.proposal!.tasks.length + 1;
                    while (existing.has(`task-${number}`)) number += 1;
                    void updateProposal(selected, {
                      ...selected.proposal!,
                      tasks: [
                        ...selected.proposal!.tasks,
                        {
                          key: `task-${number}`,
                          title: "New proposed Task",
                          objective: "Describe the Task objective",
                          acceptanceCriteria: ["Add an observable acceptance criterion"],
                          ownership: { write: [], read: [], deny: [] },
                          requiredResourceIds: [],
                          assignedModelSelection: null,
                          notes: [],
                        },
                      ],
                    });
                  }}
                >
                  <PlusIcon /> Add proposed Task
                </Button>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-xs">
                <p className="flex items-center gap-1 font-medium">
                  <GitBranchIcon className="size-3.5" /> DAG
                </p>
                {selected.proposal.dependencies.map((edge) => (
                  <div
                    key={`${edge.prerequisiteKey}:${edge.dependentKey}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <p>
                      {edge.prerequisiteKey} → {edge.dependentKey}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove dependency ${edge.prerequisiteKey} to ${edge.dependentKey}`}
                      disabled={!selectedIsEditable}
                      onClick={() =>
                        void updateProposal(selected, {
                          ...selected.proposal!,
                          dependencies: selected.proposal!.dependencies.filter(
                            (candidate) => candidate !== edge,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    aria-label="Proposed dependency prerequisite"
                    className="rounded border border-black/[0.08] bg-transparent px-2 py-1"
                    value={dependencyFrom}
                    disabled={!selectedIsEditable}
                    onChange={(event) => setDependencyFrom(event.currentTarget.value)}
                  >
                    <option value="">Prerequisite…</option>
                    {selected.proposal.tasks.map((task) => (
                      <option key={task.key} value={task.key}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Proposed dependency dependent"
                    className="rounded border border-black/[0.08] bg-transparent px-2 py-1"
                    value={dependencyTo}
                    disabled={!selectedIsEditable}
                    onChange={(event) => setDependencyTo(event.currentTarget.value)}
                  >
                    <option value="">Dependent…</option>
                    {selected.proposal.tasks.map((task) => (
                      <option key={task.key} value={task.key}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedIsEditable || !dependencyFrom || !dependencyTo}
                    onClick={() => {
                      void updateProposal(selected, {
                        ...selected.proposal!,
                        dependencies: [
                          ...selected.proposal!.dependencies,
                          { prerequisiteKey: dependencyFrom, dependentKey: dependencyTo },
                        ],
                      });
                      setDependencyFrom("");
                      setDependencyTo("");
                    }}
                  >
                    Add dependency
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium">Assumptions</p>
                  <Textarea
                    aria-label="Architect plan assumptions"
                    rows={4}
                    defaultValue={selected.proposal.assumptions.join("\n")}
                    disabled={!selectedIsEditable}
                    onBlur={(event) => {
                      const assumptions = event.currentTarget.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean);
                      if (assumptions.join("\n") !== selected.proposal!.assumptions.join("\n"))
                        void updateProposal(selected, { ...selected.proposal!, assumptions });
                    }}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium">Risks</p>
                  <Textarea
                    aria-label="Architect plan risks"
                    rows={4}
                    defaultValue={selected.proposal.risks
                      .map((value) => `${value.risk} | ${value.mitigation ?? ""}`)
                      .join("\n")}
                    disabled={!selectedIsEditable}
                    onBlur={(event) => {
                      const risks = event.currentTarget.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .map((value) => {
                          const [risk, ...mitigation] = value.split("|");
                          const resolvedMitigation = mitigation.join("|").trim();
                          return {
                            risk: risk!.trim(),
                            ...(resolvedMitigation ? { mitigation: resolvedMitigation } : {}),
                          };
                        });
                      if (JSON.stringify(risks) !== JSON.stringify(selected.proposal!.risks))
                        void updateProposal(selected, { ...selected.proposal!, risks });
                    }}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium">Questions</p>
                  <Textarea
                    aria-label="Architect plan unresolved questions"
                    rows={4}
                    defaultValue={selected.proposal.unresolvedQuestions.join("\n")}
                    disabled={!selectedIsEditable}
                    onBlur={(event) => {
                      const unresolvedQuestions = event.currentTarget.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean);
                      if (
                        unresolvedQuestions.join("\n") !==
                        selected.proposal!.unresolvedQuestions.join("\n")
                      )
                        void updateProposal(selected, {
                          ...selected.proposal!,
                          unresolvedQuestions,
                        });
                    }}
                  />
                </div>
              </div>
              {(selected.proposal.resourcePolicyGaps ?? []).length > 0 ? (
                <div className="rounded-lg border border-black/[0.08] p-3">
                  <p className="text-xs font-medium">Resource policy gaps</p>
                  {selected.proposal.resourcePolicyGaps?.map((gap) => (
                    <p
                      key={`${gap.suggestedName}:${gap.suggestedPatterns.join(",")}`}
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      {gap.suggestedName}: {gap.suggestedPatterns.join(", ")} — {gap.reason}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="rounded-lg border border-black/[0.08] p-3">
                <p className="text-xs font-medium">Revision history</p>
                <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {selected.revisions.map((revision) => (
                    <li key={revision.number}>
                      v{revision.number} · {revision.source} · {revision.createdAt}
                      {revision.feedback ? ` · ${revision.feedback}` : ""}
                    </li>
                  ))}
                </ol>
              </div>
              {selected.status !== "approved" && selected.status !== "rejected" ? (
                <div className="flex gap-2">
                  <Button
                    disabled={
                      working ||
                      selected.validation?.status !== "valid" ||
                      selected.proposal.tasks.some((task) => !task.assignedModelSelection)
                    }
                    onClick={() => setApprovalPlan(selected)}
                  >
                    <CheckCircle2Icon /> Approve Plan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void reject({
                        environmentId,
                        input: { projectId: project.id, proposalId: selected.id },
                      })
                    }
                  >
                    Reject proposal
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Plan with Architect</DialogTitle>
            <DialogDescription>
              Generate a bounded proposal against the repository's exact clean Git baseline. No
              execution will start.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <label className="block text-sm">
              Objective
              <Textarea
                aria-label="Architect objective"
                rows={4}
                value={objective}
                onChange={(event) => setObjective(event.currentTarget.value)}
              />
            </label>
            <label className="block text-sm">
              Additional constraints
              <Textarea
                aria-label="Architect constraints"
                rows={3}
                value={constraints}
                onChange={(event) => setConstraints(event.currentTarget.value)}
              />
            </label>
            <label className="block text-sm">
              Planning context paths
              <Textarea
                aria-label="Planning context paths"
                rows={3}
                placeholder="One repository-relative path per line"
                value={contextPaths}
                onChange={(event) => setContextPaths(event.currentTarget.value)}
              />
            </label>
            {selection ? (
              <ProviderModelPicker
                activeInstanceId={selection.instanceId}
                model={selection.model}
                lockedProvider={null}
                instanceEntries={readyProviders}
                modelOptionsByInstance={modelOptionsByInstance as never}
                triggerVariant="outline"
                triggerClassName="max-w-full"
                triggerAriaLabel="Architect provider and model"
                onInstanceModelChange={(instanceId, model) =>
                  setSelection(createModelSelection(instanceId, model))
                }
              />
            ) : (
              <p className="text-sm text-destructive">No ready Architect provider.</p>
            )}
            {working ? (
              <p role="status" className="text-sm">
                Architect planning… No execution has started.
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={working || !objective.trim() || !selection}
              onClick={() => void generatePlan()}
            >
              <PlusIcon /> Generate Plan
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog
        open={approvalPlan !== null}
        onOpenChange={(next) => {
          if (!next) setApprovalPlan(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Approve Architect Plan?</DialogTitle>
            <DialogDescription>
              This creates 1 draft Mission, {approvalPlan?.proposal?.tasks.length ?? 0} draft Tasks,
              and {approvalPlan?.proposal?.dependencies.length ?? 0} dependencies. Nothing will
              start. No worktrees, Threads, providers, or leases will be created.
              {approvalPlan?.status === "stale"
                ? ` This explicitly uses original planning baseline ${approvalPlan.planningBaseCommit.slice(0, 8)}, not current HEAD ${approvalPlan.observedHeadCommit?.slice(0, 8) ?? "unknown"}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalPlan(null)}>
              Cancel
            </Button>
            <Button
              disabled={working}
              onClick={() => approvalPlan && void approveSelected(approvalPlan)}
            >
              Approve Plan
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
