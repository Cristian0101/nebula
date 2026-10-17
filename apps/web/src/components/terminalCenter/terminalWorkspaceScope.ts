import type { ScopedProjectRef } from "@t3tools/contracts";
import { encodeProjectCheckout } from "../../projectNavigation";
import type { UiState } from "../../uiStateStore";

/** Move presentation state without changing a single workspace, pane or terminal ID. */
export function migrateTerminalWorkspaceScope(
  state: UiState,
  ref: ScopedProjectRef,
  candidates: readonly ScopedProjectRef[],
  explicitlyAssigned = false,
): UiState {
  const key = encodeProjectCheckout(ref);
  const origins = new Set(
    candidates
      .filter((candidate) => candidate.projectId === ref.projectId)
      .map(encodeProjectCheckout),
  );
  if (!origins.has(key) || (!explicitlyAssigned && origins.size !== 1)) return state;
  const legacyWorkspaces = state.terminalWorkspacesByProjectId[ref.projectId];
  const legacyCanvas = state.terminalCenterByProjectId[ref.projectId];
  // Migrate each presentation independently; never overwrite a destination.
  const moveWorkspaces = legacyWorkspaces && !state.terminalWorkspacesByProjectId[key];
  const moveCanvas = legacyCanvas && !state.terminalCenterByProjectId[key];
  if (!moveWorkspaces && !moveCanvas) return state;
  const workspaces = { ...state.terminalWorkspacesByProjectId };
  const canvases = { ...state.terminalCenterByProjectId };
  if (moveWorkspaces) {
    workspaces[key] = legacyWorkspaces;
    delete workspaces[ref.projectId];
  }
  if (moveCanvas) {
    canvases[key] = legacyCanvas;
    delete canvases[ref.projectId];
  }
  return {
    ...state,
    terminalWorkspacesByProjectId: workspaces,
    terminalCenterByProjectId: canvases,
  };
}
