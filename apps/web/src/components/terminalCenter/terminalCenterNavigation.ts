export interface TerminalCenterSearch {
  readonly taskId?: string;
}

export function parseTerminalCenterSearch(search: Record<string, unknown>): TerminalCenterSearch {
  const taskId = typeof search.taskId === "string" ? search.taskId.trim() : "";
  return taskId ? { taskId } : {};
}
