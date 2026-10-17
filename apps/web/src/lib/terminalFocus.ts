export type TerminalFocusOwner = "drawer" | "right-panel";

export function getTerminalFocusOwner(): TerminalFocusOwner | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return null;
  if (!isTerminalInteractionAllowed(activeElement)) return null;
  const owner = activeElement.closest<HTMLElement>("[data-terminal-owner]")?.dataset.terminalOwner;
  if (owner === "drawer" || owner === "right-panel") return owner;
  return null;
}

export function isTerminalFocused(): boolean {
  return getTerminalFocusOwner() !== null;
}

/** Respect the modal primitive's background boundary, including pending autofocus. */
export function isTerminalInteractionAllowed(element: HTMLElement): boolean {
  return (
    element.isConnected &&
    element.closest('[inert], [data-base-ui-inert], [aria-hidden="true"], [hidden]') === null
  );
}
