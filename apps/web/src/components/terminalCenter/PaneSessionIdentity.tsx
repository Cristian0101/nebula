/** Layout links never establish provider conversation continuity. */
export function paneSessionIdentity(
  surface: "chat" | "terminal" | undefined,
  threadId?: string | null,
) {
  if (surface === "terminal") return "Separate CLI session, not linked to this chat";
  if (surface === "chat" && threadId) return "Canonical chat conversation";
  if (surface === "chat") return "New chat; no provider session yet";
  return null;
}

export function PaneSessionIdentity(props: {
  readonly surface: "chat" | "terminal" | undefined;
  readonly threadId?: string | null;
}) {
  const label = paneSessionIdentity(props.surface, props.threadId);
  return label ? <span>{label}</span> : null;
}
