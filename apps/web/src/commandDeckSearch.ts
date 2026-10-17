import { parseProjectNavigationSearch } from "./projectNavigation";
export interface CommandDeckSearch {
  readonly checkout?: string;
  readonly mode?: "swarm";
  readonly stage?: "brief" | "plan" | "war-room" | "review";
  readonly proposalId?: string;
  readonly missionId?: string;
  readonly selectedTask?: string;
  readonly section?: "integration";
  readonly createTask?: boolean;
  readonly workDraft?: string;
}
export function parseCommandDeckSearch(search: Record<string, unknown>): CommandDeckSearch {
  const common = {
    ...parseProjectNavigationSearch(search),
    ...(typeof search.selectedTask === "string" && search.selectedTask.length > 0
      ? { selectedTask: search.selectedTask }
      : {}),
    ...(search.section === "integration" ? { section: "integration" as const } : {}),
    ...(search.createTask === true || search.createTask === "true" ? { createTask: true } : {}),
    ...(typeof search.workDraft === "string" && search.workDraft.length <= 128
      ? { workDraft: search.workDraft }
      : {}),
  };
  if (search.mode !== "swarm") return common;
  const stage = ["brief", "plan", "war-room", "review"].includes(String(search.stage))
    ? (search.stage as NonNullable<CommandDeckSearch["stage"]>)
    : "brief";
  return {
    ...common,
    mode: "swarm",
    stage,
    ...(typeof search.proposalId === "string" ? { proposalId: search.proposalId } : {}),
    ...(typeof search.missionId === "string" ? { missionId: search.missionId } : {}),
  };
}
