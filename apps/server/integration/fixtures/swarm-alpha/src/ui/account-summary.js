export function renderAccountSummary(profile, billing) {
  return `${profile.displayName} · ${billing.plan}`;
}
