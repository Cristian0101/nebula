import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CodexSettings, ClaudeSettings } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Logger from "effect/Logger";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  makeCodexAuthenticationFlow,
  makeCursorAuthenticationFlow,
  readClaudeAuthenticationStatus,
} from "./providerAuthenticationFlows.ts";
import { checkCodexProviderStatus } from "./Layers/CodexProvider.ts";

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const codexConfig = Schema.decodeUnknownSync(CodexSettings);
const claudeConfig = Schema.decodeUnknownSync(ClaudeSettings);
const encoder = new TextEncoder();
const handle = (
  stdout: Stream.Stream<Uint8Array>,
  stdin: Sink.Sink<void, Uint8Array> = Sink.drain,
  exitCode: Effect.Effect<ChildProcessSpawner.ExitCode> = Effect.never,
) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(123),
    exitCode,
    isRunning: Effect.succeed(true),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin,
    stdout,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });

it.layer(NodeServices.layer)("official auth protocols with synthetic processes", (it) => {
  it.effect(
    "fresh Codex readiness refreshes managed auth without making an inference request",
    () =>
      Effect.gen(function* () {
        const output = yield* Queue.unbounded<Uint8Array>();
        const methods: string[] = [];
        const send = (message: unknown) =>
          Queue.offer(output, encoder.encode(encode(message) + "\n"));
        const stdin = Sink.forEach((chunk: Uint8Array) =>
          Effect.gen(function* () {
            for (const line of new TextDecoder().decode(chunk).trim().split("\n")) {
              const message = decode(line) as { id?: string; method: string; params?: unknown };
              methods.push(message.method);
              if (message.method === "initialize")
                yield* send({
                  id: message.id,
                  result: {
                    userAgent: "synthetic/0.153.4",
                    codexHome: "/synthetic",
                    platformFamily: "unix",
                    platformOs: "linux",
                  },
                });
              if (message.method === "account/read") {
                assert.deepEqual(message.params, { refreshToken: true });
                yield* send({
                  id: message.id,
                  result: { account: null, requiresOpenaiAuth: true },
                });
              }
            }
          }),
        );
        const spawner = ChildProcessSpawner.make(() =>
          Effect.succeed(handle(Stream.fromQueue(output), stdin)),
        );
        const result = yield* checkCodexProviderStatus(codexConfig({}), undefined, {}).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        );
        assert.equal(result.auth.status, "unauthenticated");
        assert.deepEqual(methods, ["initialize", "initialized", "account/read"]);
      }).pipe(Effect.scoped, Effect.provideService(HostProcessPlatform, "linux")),
  );
  it.effect("never copies custom Codex launch configuration into login arguments", () =>
    Effect.gen(function* () {
      let spawned = false;
      const spawner = ChildProcessSpawner.make(() =>
        Effect.sync(() => {
          spawned = true;
          return handle(Stream.empty);
        }),
      );
      const flow = yield* makeCodexAuthenticationFlow(
        codexConfig({ launchArgs: '-c custom="synthetic-private-value"' }),
        {},
        "/synthetic",
      ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
      assert.equal(flow.capability, "unsupported");
      assert.deepEqual(flow.ceremonies, []);
      assert.equal(yield* Effect.flip(flow.run("browser", () => Effect.void)), "unsupported");
      assert.isFalse(spawned);
    }),
  );
  for (const ceremony of ["browser", "device-code"] as const) {
    it.effect(
      `Codex ${ceremony} uses only managed login/status methods and ignores stale completion`,
      () =>
        Effect.gen(function* () {
          const output = yield* Queue.unbounded<Uint8Array>();
          const logs: unknown[] = [];
          const logger = Logger.make<unknown, void>((options) => {
            logs.push(options.message, options.cause);
          });
          const methods: string[] = [];
          const params: unknown[] = [];
          const send = (message: unknown) =>
            Queue.offer(output, encoder.encode(encode(message) + "\n"));
          const stdin = Sink.forEach((chunk: Uint8Array) =>
            Effect.gen(function* () {
              for (const line of new TextDecoder().decode(chunk).trim().split("\n")) {
                const message = decode(line) as { id?: string; method: string; params?: unknown };
                methods.push(message.method);
                params.push(message.params);
                if (message.method === "initialize")
                  yield* send({
                    id: message.id,
                    result: {
                      userAgent: "synthetic/0.153.4",
                      codexHome: "/synthetic",
                      platformFamily: "unix",
                      platformOs: "linux",
                    },
                  });
                if (message.method === "account/login/start") {
                  yield* send({
                    method: "account/login/completed",
                    params: { loginId: "stale", success: true, error: null },
                  });
                  yield* send({
                    id: message.id,
                    result:
                      ceremony === "browser"
                        ? {
                            type: "chatgpt",
                            loginId: "current",
                            authUrl: "https://auth.openai.com/authorize?synthetic=private",
                          }
                        : {
                            type: "chatgptDeviceCode",
                            loginId: "current",
                            verificationUrl: "https://auth.openai.com/codex/device",
                            userCode: "SYNTHETIC-CODE",
                          },
                  });
                  yield* send({
                    method: "account/login/completed",
                    params: { loginId: "current", success: true, error: null },
                  });
                }
                if (message.method === "account/read")
                  yield* send({
                    id: message.id,
                    result: {
                      account: {
                        type: "chatgpt",
                        email: "fixture@example.invalid",
                        planType: "unknown",
                      },
                      requiresOpenaiAuth: true,
                    },
                  });
                if (message.method === "account/login/cancel")
                  yield* send({ id: message.id, result: { status: "notFound" } });
              }
            }),
          );
          const spawner = ChildProcessSpawner.make((command) =>
            Effect.sync(() => {
              const value = command as unknown as {
                command: string;
                args: string[];
                options: { shell?: boolean; env?: NodeJS.ProcessEnv };
              };
              assert.equal(value.command, "configured-codex;literal");
              assert.deepEqual(value.args, ["app-server", "--listen", "stdio://"]);
              assert.equal(value.options.shell, false);
              assert.equal(value.options.env?.CODEX_HOME, "/synthetic-account");
              return handle(Stream.fromQueue(output), stdin);
            }),
          );
          const flow = yield* makeCodexAuthenticationFlow(
            codexConfig({ binaryPath: "configured-codex;literal", homePath: "/synthetic-account" }),
            {},
            "/synthetic-workspace",
          ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
          const handoffs: unknown[] = [];
          yield* flow
            .run(ceremony, (value) =>
              Effect.sync(() => {
                handoffs.push(value);
              }),
            )
            .pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));
          assert.equal(handoffs.length, 1);
          assert.deepEqual(methods, [
            "initialize",
            "initialized",
            "account/login/start",
            "account/read",
            "account/login/cancel",
          ]);
          assert.deepEqual(params[3], { refreshToken: true });
          assert.isFalse(
            methods.some(
              (method) =>
                method.startsWith("turn/") ||
                method.startsWith("thread/") ||
                method === "account/logout",
            ),
          );
          const diagnostics = encode(logs);
          assert.notInclude(diagnostics, "synthetic=private");
          assert.notInclude(diagnostics, "SYNTHETIC-CODE");
        }).pipe(Effect.scoped, Effect.provideService(HostProcessPlatform, "linux")),
    );
  }

  it.effect(
    "Cursor sends a fixed login argv, forwards only official browser URLs, and releases only its child on cancellation",
    () =>
      Effect.gen(function* () {
        const output = yield* Queue.unbounded<Uint8Array>();
        const handedOff = yield* Deferred.make<void>();
        let released = 0;
        const spawner = ChildProcessSpawner.make((command) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const value = command as unknown as {
                command: string;
                args: string[];
                options: { shell?: boolean; env?: NodeJS.ProcessEnv };
              };
              assert.equal(value.command, "configured-cursor;literal");
              assert.deepEqual(value.args, ["login"]);
              assert.equal(value.options.shell, false);
              assert.equal(value.options.env?.NO_OPEN_BROWSER, "1");
              return handle(Stream.fromQueue(output));
            }),
            () =>
              Effect.sync(() => {
                released++;
              }),
          ),
        );
        const flow = yield* makeCursorAuthenticationFlow(
          "configured-cursor;literal",
          { CURSOR_ACCOUNT: "synthetic" },
          "/synthetic",
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
        const handoffs: unknown[] = [];
        const worker = yield* flow
          .run("browser", (value) =>
            Effect.sync(() => {
              handoffs.push(value);
            }).pipe(Effect.andThen(Deferred.succeed(handedOff, undefined)), Effect.asVoid),
          )
          .pipe(Effect.forkScoped);
        yield* Queue.offer(
          output,
          encoder.encode("secret-output-marker https://evil.invalid/\nhttps://cur"),
        );
        yield* Queue.offer(output, encoder.encode("sor.com/login?challenge=synthetic\n"));
        yield* Deferred.await(handedOff);
        assert.deepEqual(handoffs, [{ url: "https://cursor.com/login?challenge=synthetic" }]);
        yield* Fiber.interrupt(worker);
        assert.equal(released, 1);
      }).pipe(Effect.scoped, Effect.provideService(HostProcessPlatform, "linux")),
  );

  it.effect(
    "Claude reads official structured status with fixed arguments and the instance's own config directory",
    () =>
      Effect.gen(function* () {
        const spawner = ChildProcessSpawner.make((command) =>
          Effect.sync(() => {
            const value = command as unknown as {
              command: string;
              args: string[];
              options: { env?: NodeJS.ProcessEnv; extendEnv?: boolean; shell?: boolean };
            };
            assert.equal(value.command, "configured-claude;literal");
            assert.deepEqual(value.args, ["auth", "status", "--json"]);
            assert.equal(value.options.env?.CLAUDE_CONFIG_DIR, "/synthetic-claude");
            assert.equal(value.options.extendEnv, false);
            assert.equal(value.options.shell, false);
            return handle(
              Stream.make(encoder.encode('{"loggedIn":false,"accessToken":"synthetic-secret"}')),
              Sink.drain,
              Effect.succeed(ChildProcessSpawner.ExitCode(1)),
            );
          }),
        );
        const result = yield* readClaudeAuthenticationStatus(
          claudeConfig({ binaryPath: "configured-claude;literal", homePath: "/synthetic-claude" }),
          {},
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
        assert.equal(result.status, "unauthenticated");
        assert.notInclude(encode(result), "synthetic-secret");
      }).pipe(Effect.scoped, Effect.provideService(HostProcessPlatform, "linux")),
  );
});
