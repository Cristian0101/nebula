export type AntigravityResultStatus =
  | "SUCCESS"
  | "ERROR"
  | "CANCELED"
  | "INTERRUPTED"
  | "INVALID"
  | "WAITING"
  | "RUNNING";

export interface AntigravityInitEvent {
  readonly event: "init";
  readonly conversationId: string;
  readonly cwd?: string;
  readonly tools: ReadonlyArray<string>;
  readonly permissionMode?: string;
  readonly raw: Record<string, unknown>;
}

export interface AntigravityStepEvent {
  readonly event: "step_update";
  readonly stepIndex: number;
  readonly stepType: string;
  readonly state?: string;
  readonly text?: string;
  readonly tool?: {
    readonly name: string;
    readonly parameters?: unknown;
    readonly output?: unknown;
    readonly error?: string;
  };
  readonly raw: Record<string, unknown>;
}

export interface AntigravityResultEvent {
  readonly event: "result";
  readonly conversationId?: string;
  readonly status: AntigravityResultStatus;
  readonly response?: string;
  readonly error?: string;
  readonly usage?: Record<string, unknown>;
  readonly durationSeconds?: number;
  readonly raw: Record<string, unknown>;
}

export type AntigravityStreamEvent =
  | AntigravityInitEvent
  | AntigravityStepEvent
  | AntigravityResultEvent;

export interface AntigravityMalformedEvent {
  readonly event: "malformed";
  readonly message: string;
  readonly line: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const text = nonEmptyString(entry);
        return text ? [text] : [];
      })
    : [];
}

function safeError(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  return nonEmptyString(value.message) ?? nonEmptyString(value.type);
}

const RESULT_STATUSES = new Set<AntigravityResultStatus>([
  "SUCCESS",
  "ERROR",
  "CANCELED",
  "INTERRUPTED",
  "INVALID",
  "WAITING",
  "RUNNING",
]);

function parseInit(raw: Record<string, unknown>): AntigravityInitEvent | AntigravityMalformedEvent {
  const conversationId = nonEmptyString(raw.conversation_id);
  if (!conversationId) {
    return { event: "malformed", message: "init event has no conversation_id", line: "" };
  }
  const payload = isRecord(raw.init) ? raw.init : {};
  const cwd = nonEmptyString(payload.cwd);
  const permissionMode = nonEmptyString(payload.permission_mode);
  return {
    event: "init",
    conversationId,
    ...(cwd ? { cwd } : {}),
    tools: stringArray(payload.tools),
    ...(permissionMode ? { permissionMode } : {}),
    raw,
  };
}

function parseStep(raw: Record<string, unknown>): AntigravityStepEvent | AntigravityMalformedEvent {
  if (!isRecord(raw.step_update)) {
    return { event: "malformed", message: "step_update payload is not an object", line: "" };
  }
  const step = raw.step_update;
  const stepIndex = finiteNumber(step.step_index);
  const stepType = nonEmptyString(step.step_type);
  if (stepIndex === undefined || !stepType) {
    return { event: "malformed", message: "step_update is missing its index or type", line: "" };
  }
  const text =
    nonEmptyString(step.text_delta) ??
    nonEmptyString(step.delta) ??
    nonEmptyString(step.text) ??
    nonEmptyString(step.content);
  const info = isRecord(step.tool_info) ? step.tool_info : undefined;
  const toolName = nonEmptyString(step.tool_name) ?? (info ? nonEmptyString(info.name) : undefined);
  const state = nonEmptyString(step.state);
  const toolError = info ? safeError(info.error) : undefined;
  return {
    event: "step_update",
    stepIndex,
    stepType,
    ...(state ? { state } : {}),
    ...(text ? { text } : {}),
    ...(toolName
      ? {
          tool: {
            name: toolName,
            ...(info && "parameters" in info ? { parameters: info.parameters } : {}),
            ...(info && "output" in info ? { output: info.output } : {}),
            ...(toolError ? { error: toolError } : {}),
          },
        }
      : {}),
    raw,
  };
}

function parseResult(
  raw: Record<string, unknown>,
): AntigravityResultEvent | AntigravityMalformedEvent {
  if (!isRecord(raw.result)) {
    return { event: "malformed", message: "result payload is not an object", line: "" };
  }
  const result = raw.result;
  const rawStatus = nonEmptyString(result.status)?.toUpperCase();
  if (!rawStatus || !RESULT_STATUSES.has(rawStatus as AntigravityResultStatus)) {
    return { event: "malformed", message: "result has an unknown status", line: "" };
  }
  const conversationId = nonEmptyString(result.conversation_id);
  const durationSeconds = finiteNumber(result.duration_seconds);
  const error = safeError(result.error);
  return {
    event: "result",
    ...(conversationId ? { conversationId } : {}),
    status: rawStatus as AntigravityResultStatus,
    ...(typeof result.response === "string" ? { response: result.response } : {}),
    ...(error ? { error } : {}),
    ...(isRecord(result.usage) ? { usage: result.usage } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    raw,
  };
}

export function parseAntigravityStreamLine(
  line: string,
): AntigravityStreamEvent | AntigravityMalformedEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let decoded: unknown;
  try {
    decoded = JSON.parse(trimmed);
  } catch {
    return { event: "malformed", message: "invalid JSON", line: trimmed };
  }
  if (!isRecord(decoded)) {
    return { event: "malformed", message: "event is not an object", line: trimmed };
  }
  const event = nonEmptyString(decoded.event);
  const parsed =
    event === "init"
      ? parseInit(decoded)
      : event === "step_update"
        ? parseStep(decoded)
        : event === "result"
          ? parseResult(decoded)
          : { event: "malformed" as const, message: `unknown event '${event ?? ""}'`, line: "" };
  return parsed.event === "malformed" ? { ...parsed, line: trimmed } : parsed;
}

export function antigravityTurnState(
  status: AntigravityResultStatus,
): "completed" | "failed" | "cancelled" | "interrupted" {
  switch (status) {
    case "SUCCESS":
      return "completed";
    case "CANCELED":
      return "cancelled";
    case "INTERRUPTED":
      return "interrupted";
    case "ERROR":
    case "INVALID":
    case "WAITING":
    case "RUNNING":
      return "failed";
  }
}

export function safeAntigravitySummary(value: unknown, maxLength = 500): string | undefined {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      const encoded = JSON.stringify(value);
      if (typeof encoded !== "string") return undefined;
      text = encoded;
    } catch {
      return undefined;
    }
  }
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, maxLength) : undefined;
}
