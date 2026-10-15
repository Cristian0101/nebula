import type { CodexSettings, ClaudeSettings, ServerProviderAuth } from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import { CodexAppServerRequestError } from "effect-codex-app-server/errors";
import { expandHomePath } from "../pathExpansion.ts";
import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";
import { resolveCodexLaunchArgs } from "./Layers/codexLaunchArgs.ts";
import { makeClaudeEnvironment } from "./Drivers/ClaudeHome.ts";
import { spawnAndCollect } from "./providerSnapshot.ts";
import type { ProviderAuthenticationFlow } from "./providerAuthentication.ts";

const isCodexRequestError = Schema.is(CodexAppServerRequestError);

/** Only official HTTPS destinations. Reject userinfo, custom ports and executable URL schemes. */
export function officialAuthenticationUrl(
  raw: string,
  provider: "codex" | "cursor",
): string | undefined {
  try {
    const url = new URL(raw);
    const domains =
      provider === "codex"
        ? ["auth.openai.com", "chatgpt.com"]
        : ["cursor.com", "www.cursor.com", "cursor.sh", "auth.cursor.com"];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !domains.includes(url.hostname)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export const makeCodexAuthenticationFlow = Effect.fn("makeCodexAuthenticationFlow")(function* (
  config: CodexSettings,
  environment: NodeJS.ProcessEnv,
  cwd: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const env: NodeJS.ProcessEnv = {
    ...environment,
    ...(config.homePath ? { CODEX_HOME: expandHomePath(config.homePath) } : {}),
  };
  const supportedLaunch = resolveCodexLaunchArgs(config.launchArgs, env).trim().length === 0;
  return {
    capability: supportedLaunch ? "managed-app-server" : "unsupported",
    ceremonies: supportedLaunch ? ["browser", "device-code"] : [],
    guidance: supportedLaunch
      ? "Sign in connects a ChatGPT account using the official Codex App Server. OpenAI API billing is a separate route. Authentication does not verify subscription entitlement or remaining usage."
      : "Managed login requires the default local App Server launch configuration. Use the official Codex CLI with this instance's custom launch configuration, then refresh readiness. Nebula will not copy arbitrary configuration values into authentication process arguments or alter your execution configuration.",
    apiOverride: Boolean(env.OPENAI_API_KEY || env.CODEX_API_KEY || env.CODEX_ACCESS_TOKEN),
    run: (ceremony, progress) =>
      Effect.scoped(
        Effect.gen(function* () {
          if (!supportedLaunch) return yield* Effect.fail("unsupported");
          const command = yield* resolveSpawnCommand(
            config.binaryPath,
            ["app-server", "--listen", "stdio://"],
            { env, extendEnv: false },
          );
          // Authentication never uses a shell, task cwd, native event logger, or inference methods.
          if (command.shell) return yield* Effect.fail("unsupported");
          const child = yield* spawner.spawn(
            ChildProcess.make(command.command, command.args, {
              cwd,
              env,
              extendEnv: false,
              forceKillAfter: "2 seconds",
              shell: false,
            }),
          );
          const context = yield* Layer.build(
            CodexClient.layerChildProcess(child, { logIncoming: false, logOutgoing: false }),
          );
          const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
            Effect.provide(context),
          );
          yield* client.request("initialize", buildCodexInitializeParams());
          yield* client.notify("initialized", undefined);
          const completed = yield* Deferred.make<{ loginId: string | null; success: boolean }>();
          let loginId: string | undefined;
          const early: Array<{ loginId: string | null; success: boolean }> = [];
          yield* client.handleServerNotification("account/login/completed", (event) => {
            const result = { loginId: event.loginId ?? null, success: event.success };
            if (loginId === undefined)
              return Effect.sync(() => {
                if (early.length < 16) early.push(result);
              });
            return result.loginId === loginId
              ? Deferred.succeed(completed, result).pipe(Effect.asVoid)
              : Effect.void;
          });
          const response = yield* client.request(
            "account/login/start",
            ceremony === "device-code"
              ? { type: "chatgptDeviceCode" }
              : { type: "chatgpt", useHostedLoginSuccessPage: true },
          );
          if (response.type !== "chatgpt" && response.type !== "chatgptDeviceCode")
            return yield* Effect.fail("unsupported-response");
          loginId = response.loginId;
          const matching = early.find((event) => event.loginId === loginId);
          if (matching) yield* Deferred.succeed(completed, matching);
          // Always cancel this ceremony on timeout, failure, or interruption before closing its process.
          // This never calls account/logout or revokes shared application credentials.
          yield* Effect.addFinalizer(() =>
            client
              .request("account/login/cancel", { loginId: response.loginId })
              .pipe(Effect.timeoutOption("2 seconds"), Effect.ignore),
          );
          const url = officialAuthenticationUrl(
            response.type === "chatgpt" ? response.authUrl : response.verificationUrl,
            "codex",
          );
          if (!url) return yield* Effect.fail("invalid-handoff");
          yield* progress({
            url,
            ...(response.type === "chatgptDeviceCode" ? { userCode: response.userCode } : {}),
          });
          const event = yield* Deferred.await(completed);
          if (event.loginId !== response.loginId || !event.success)
            return yield* Effect.fail("login-failed");
          const account = yield* client.request("account/read", { refreshToken: true });
          if (account.account?.type !== "chatgpt") return yield* Effect.fail("verification-failed");
        }),
      ).pipe(
        Effect.mapError((error) =>
          error === "unsupported" ||
          (isCodexRequestError(error) && (error.code === -32601 || error.code === -32602))
            ? "unsupported"
            : "provider-flow-failed",
        ),
      ),
  } satisfies ProviderAuthenticationFlow;
});

export const makeCursorAuthenticationFlow = Effect.fn("makeCursorAuthenticationFlow")(function* (
  binaryPath: string,
  environment: NodeJS.ProcessEnv,
  cwd: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return {
    capability: "official-cli",
    ceremonies: ["browser"],
    apiOverride: Boolean(environment.CURSOR_API_KEY || environment.CURSOR_AUTH_TOKEN),
    run: (_ceremony, progress) =>
      Effect.scoped(
        Effect.gen(function* () {
          const env = { ...environment, NO_OPEN_BROWSER: "1" };
          const command = yield* resolveSpawnCommand(binaryPath, ["login"], {
            env,
            extendEnv: false,
          });
          if (command.shell) return yield* Effect.fail("unsupported-launcher");
          // Use the configured Cursor executable; bare `agent` may be an entirely different provider.
          const child = yield* spawner.spawn(
            ChildProcess.make(command.command, command.args, {
              cwd,
              env,
              extendEnv: false,
              forceKillAfter: "2 seconds",
              shell: false,
            }),
          );
          let bytes = 0;
          const reader = () => {
            let pending = "";
            const decoder = new TextDecoder();
            return (chunk: Uint8Array) =>
              Effect.gen(function* () {
                bytes += chunk.byteLength;
                if (bytes > 65_536) return yield* Effect.fail("output-limit");
                pending += decoder.decode(chunk, { stream: true });
                const lines = pending.split(/\r?\n/);
                pending = lines.pop() ?? "";
                for (const line of lines) {
                  for (const candidate of line.match(/https:\/\/[^\s<>"\p{Cc}]+/gu) ?? []) {
                    const url = officialAuthenticationUrl(candidate, "cursor");
                    if (url) yield* progress({ url });
                  }
                }
              });
          };
          const [code] = yield* Effect.all(
            [
              child.exitCode,
              Stream.runForEach(child.stdout, reader()),
              // Drain but never log provider output. Neither raw stream enters history or diagnostics.
              Stream.runForEach(child.stderr, reader()),
            ],
            { concurrency: "unbounded" },
          );
          if (code !== 0) return yield* Effect.fail("login-failed");
        }),
      ).pipe(Effect.mapError(() => "provider-flow-failed")),
  } satisfies ProviderAuthenticationFlow;
});

export function makeClaudeGuidedAuthenticationFlow(
  apiOverride: boolean,
): ProviderAuthenticationFlow {
  return {
    capability: "guided-terminal",
    ceremonies: ["terminal"],
    apiOverride,
    guidance:
      "On this execution host, open your own terminal with this provider instance's configured executable, environment and Claude configuration directory. Run the official `claude auth login` flow, then choose Check status here. Cancel here stops tracking; cancel the CLI flow yourself in your terminal. Nebula does not collect tokens or launch Claude OAuth. Existing API-key, auth-token, helper and cloud-provider overrides can take precedence; review them yourself before choosing a billing route. Subscription entitlement and usage remain unverified.",
    run: () => Effect.never,
  };
}

/** Pure allowlist parser; no credential fields or provider error text can enter a snapshot. */
export function parseClaudeAuthenticationStatus(output: string): ServerProviderAuth {
  try {
    const value: unknown = JSON.parse(output);
    if (
      !value ||
      typeof value !== "object" ||
      !("loggedIn" in value) ||
      typeof value.loggedIn !== "boolean"
    )
      return { status: "unknown" };
    const method =
      "authMethod" in value && typeof value.authMethod === "string" ? value.authMethod : undefined;
    return {
      status: value.loggedIn ? "authenticated" : "unauthenticated",
      billingRoute:
        method === "api_key" || method === "apiKey"
          ? "api"
          : method === "oauth" || method === "claude.ai"
            ? "subscription"
            : "unknown",
      subscriptionEntitlement: "unknown",
      ...(value.loggedIn && "email" in value && typeof value.email === "string"
        ? { email: value.email, accountVerified: true }
        : {}),
    };
  } catch {
    return { status: "unknown" };
  }
}

export const readClaudeAuthenticationStatus = Effect.fn("readClaudeAuthenticationStatus")(
  function* (config: ClaudeSettings, environment: NodeJS.ProcessEnv) {
    const env = yield* makeClaudeEnvironment(config, environment);
    const command = yield* resolveSpawnCommand(config.binaryPath, ["auth", "status", "--json"], {
      env,
      extendEnv: false,
    });
    if (command.shell) return { status: "unknown" } as const;
    const output = yield* spawnAndCollect(
      config.binaryPath,
      ChildProcess.make(command.command, command.args, { env, extendEnv: false, shell: false }),
    );
    // A logged-out CLI may return a nonzero exit code with valid structured status.
    return parseClaudeAuthenticationStatus(output.stdout);
  },
);
