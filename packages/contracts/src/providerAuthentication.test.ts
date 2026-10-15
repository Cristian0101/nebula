import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  ProviderAuthenticationInput,
  ProviderAuthenticationStatus,
} from "./providerAuthentication.ts";

const encodeStatus = Schema.encodeSync(Schema.fromJsonString(ProviderAuthenticationStatus));

describe("provider authentication wire boundary", () => {
  const decode = Schema.decodeUnknownSync(ProviderAuthenticationInput);
  it("accepts only controlled operations and identity, never executable, command, Task or permission changes", () => {
    const parsed = decode({
      environmentId: "remote",
      instanceId: "personal",
      operation: "begin",
      ceremony: "browser",
      executable: "evil",
      command: "echo secret",
      taskId: "task",
      worktreePath: "/other",
      runtimeMode: "full-access",
    });
    expect(parsed).toEqual({
      environmentId: "remote",
      instanceId: "personal",
      operation: "begin",
      ceremony: "browser",
    });
    expect(() => decode({ ...parsed, operation: "execute" })).toThrow();
    expect(() => decode({ ...parsed, ceremony: "oauth-token" })).toThrow();
  });
  it("does not carry credentials or arbitrary process errors in status", () => {
    const decodeStatus = Schema.decodeUnknownSync(ProviderAuthenticationStatus);
    const value = decodeStatus({
      environmentId: "remote",
      environmentLabel: "Remote host",
      instanceId: "personal",
      driver: "codex",
      capability: "managed-app-server",
      ceremonies: ["browser"],
      state: "failed",
      attemptId: "attempt",
      expiresAt: null,
      verifiedAt: null,
      reason: "process-failed",
      handoff: null,
      guidance: null,
      error: "synthetic-secret",
      accessToken: "synthetic-secret",
    });
    const encoded = encodeStatus(value);
    expect(encoded).not.toContain("synthetic-secret");
    expect(encoded).not.toContain("accessToken");
  });
});
