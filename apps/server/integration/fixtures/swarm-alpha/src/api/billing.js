export function getBillingSummary(userId) {
  return {
    userId,
    plan: "starter",
    canManageBilling: false,
  };
}
