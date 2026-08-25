export function buildAntigravityTurnArgs(input: {
  readonly prompt: string;
  readonly conversationId?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly plan?: boolean;
  readonly fullAccess?: boolean;
}): ReadonlyArray<string> {
  return [
    ...(!input.conversationId ? ["--new-project"] : []),
    "--mode",
    input.plan ? "plan" : "accept-edits",
    ...(input.fullAccess ? ["--dangerously-skip-permissions"] : []),
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    ...(input.conversationId ? ["--conversation", input.conversationId] : []),
    ...(input.model && input.model !== "auto" ? ["--model", input.model] : []),
    ...(input.effort ? ["--effort", input.effort] : []),
  ];
}

export function buildAntigravityStructuredArgs(input: {
  readonly prompt: string;
  readonly jsonSchema: string;
  readonly model?: string;
  readonly effort?: string;
}): ReadonlyArray<string> {
  return [
    "--mode",
    "plan",
    "-p",
    input.prompt,
    "--output-format",
    "json",
    "--json-schema",
    input.jsonSchema,
    ...(input.model && input.model !== "auto" ? ["--model", input.model] : []),
    ...(input.effort ? ["--effort", input.effort] : []),
  ];
}
