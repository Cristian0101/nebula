import { requireAuthenticatedUser } from "./auth.js";

export function getProfile(session) {
  const auth = requireAuthenticatedUser(session);
  if (auth.status !== 200) return auth;

  return {
    status: 200,
    body: {
      id: auth.userId,
      displayName: "Alpha User",
    },
  };
}
