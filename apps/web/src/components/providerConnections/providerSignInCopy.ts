import type { ProviderDriverKind } from "@t3tools/contracts";
export const CLAUDE_ELIGIBILITY =
  "Claude reports your account and sign-in method. Whether your Claude plan covers use in third-party apps like Nebula depends on Anthropic's current terms for your account. Nebula doesn't verify entitlement or remaining usage. API keys, auth tokens, key helpers and cloud-provider settings can take precedence over this sign-in.";
export function signInCopy(driver: ProviderDriverKind) {
  switch (driver) {
    case "codex":
      return {
        label: "Sign in with ChatGPT",
        description:
          "Sign in with ChatGPT through the official Codex App Server. OpenAI API billing is a separate route.",
      };
    case "cursor":
      return {
        label: "Sign in with Cursor",
        description:
          "Nebula runs Cursor's official login with the configured executable on this host. A command named agent may belong to a different product.",
      };
    case "claudeAgent":
      return {
        label: "Start terminal sign-in",
        description:
          "Claude sign-in runs in your own terminal, under your control. Nebula doesn't open Claude OAuth or collect tokens.",
      };
    default:
      return {
        label: "How to sign in",
        description:
          "Sign-in from Nebula isn't available for this provider. Use its official tools on the selected execution host, then check again.",
      };
  }
}
export const OVERRIDE_NAMES: Record<string, readonly string[]> = {
  codex: ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN"],
  cursor: ["CURSOR_API_KEY", "CURSOR_AUTH_TOKEN"],
  claudeAgent: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ],
};
/** Defense in depth on an E2-validated handoff. Never accept arbitrary schemes or domains. */
export function officialHandoffHost(url: string, driver: ProviderDriverKind): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const domains =
      driver === "codex"
        ? ["openai.com", "chatgpt.com"]
        : driver === "cursor"
          ? ["cursor.com", "cursor.sh"]
          : [];
    return parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      domains.some((d) => host === d || host.endsWith(`.${d}`))
      ? host
      : null;
  } catch {
    return null;
  }
}
export const INSTALL_GUIDES: Record<string, string> = {
  codex: "https://developers.openai.com/codex/cli/",
  cursor: "https://cursor.com/docs/cli/installation",
  claudeAgent: "https://code.claude.com/docs/en/setup",
};
