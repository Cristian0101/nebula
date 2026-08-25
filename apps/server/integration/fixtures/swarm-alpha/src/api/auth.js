export function requireAuthenticatedUser(session) {
  if (!session || typeof session.userId !== "string" || session.userId.length === 0) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  return { status: 200, userId: session.userId };
}
