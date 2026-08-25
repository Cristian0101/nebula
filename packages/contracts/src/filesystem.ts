import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const FILESYSTEM_PATH_MAX_LENGTH = 512;

export const FilesystemBrowseInput = Schema.Struct({
  partialPath: TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH)),
  cwd: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH))),
});
export type FilesystemBrowseInput = typeof FilesystemBrowseInput.Type;

export const FilesystemBrowseEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  fullPath: TrimmedNonEmptyString,
});
export type FilesystemBrowseEntry = typeof FilesystemBrowseEntry.Type;

export const FilesystemBrowseResult = Schema.Struct({
  parentPath: TrimmedNonEmptyString,
  entries: Schema.Array(FilesystemBrowseEntry),
});
export type FilesystemBrowseResult = typeof FilesystemBrowseResult.Type;

export const ProjectDiscoverySignal = Schema.Literals([
  "git",
  "package.json",
  "Cargo.toml",
  "Package.swift",
  "pyproject.toml",
  "go.mod",
]);
export type ProjectDiscoverySignal = typeof ProjectDiscoverySignal.Type;

export const ProjectDiscoveryInput = Schema.Struct({
  roots: Schema.Array(
    TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH)),
  ).check(Schema.isMaxLength(16)),
  maxDepth: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
});
export type ProjectDiscoveryInput = typeof ProjectDiscoveryInput.Type;

export const ProjectDiscoveryEntry = Schema.Struct({
  title: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  canonicalPath: TrimmedNonEmptyString,
  signals: Schema.Array(ProjectDiscoverySignal),
});
export type ProjectDiscoveryEntry = typeof ProjectDiscoveryEntry.Type;

export const ProjectDiscoveryResult = Schema.Struct({
  entries: Schema.Array(ProjectDiscoveryEntry),
  scannedDirectories: Schema.Int,
  truncated: Schema.Boolean,
});
export type ProjectDiscoveryResult = typeof ProjectDiscoveryResult.Type;

export const FilesystemBrowseFailure = Schema.Literals([
  "windows_path_unsupported",
  "current_project_required",
  "read_directory_failed",
]);
export type FilesystemBrowseFailure = typeof FilesystemBrowseFailure.Type;

function decodedFilesystemBrowseErrorMessage(props: object): string | undefined {
  if (!("message" in props)) return undefined;
  return typeof props.message === "string" ? props.message : undefined;
}

export class FilesystemBrowseError extends Schema.TaggedErrorClass<FilesystemBrowseError>()(
  "FilesystemBrowseError",
  {
    partialPath: Schema.optional(TrimmedNonEmptyString),
    cwd: Schema.optional(TrimmedNonEmptyString),
    failure: Schema.optional(FilesystemBrowseFailure),
    parentPath: Schema.optional(TrimmedNonEmptyString),
    platform: Schema.optional(TrimmedNonEmptyString),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  // Structured diagnostics stay optional for rolling compatibility with legacy message-only
  // payloads, while new call sites must provide the request context and failure classification.
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: {
    readonly partialPath: string;
    readonly cwd?: string | undefined;
    readonly failure: FilesystemBrowseFailure;
    readonly parentPath?: string;
    readonly platform?: string;
    readonly cause?: unknown;
  }) {
    const cwd = props.cwd === undefined ? "" : ` from '${props.cwd}'`;
    super({
      ...props,
      message:
        decodedFilesystemBrowseErrorMessage(props) ??
        `Failed to browse filesystem path '${props.partialPath}'${cwd}.`,
    } as any);
  }
}
