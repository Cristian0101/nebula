import { parseProjectNavigationSearch } from "../../projectNavigation";
export interface TerminalCenterSearch {
  readonly checkout?: string;
  readonly files?: boolean;
  readonly inspect?: boolean;
  readonly taskId?: string;
}

export function parseTerminalCenterSearch(search: Record<string, unknown>): TerminalCenterSearch {
  const taskId = typeof search.taskId === "string" ? search.taskId.trim() : "";
  return {
    ...parseProjectNavigationSearch(search),
    ...(search.inspect === true ? { inspect: true } : {}),
    ...(search.files === true ? { files: true } : {}),
    ...(taskId ? { taskId } : {}),
  };
}
