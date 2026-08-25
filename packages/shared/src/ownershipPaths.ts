const DRIVE_PATH = /^[A-Za-z]:\//;
const URI_PATH = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const PROSE_ANNOTATION = /\s(?:—|–|-)\s*(?:explicit\s+)?(?:note|reason|because)\s*:/i;

export function normalizeOwnershipPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    DRIVE_PATH.test(normalized) ||
    URI_PATH.test(normalized) ||
    normalized.endsWith("/") ||
    normalized.includes("//")
  ) {
    throw new Error("Ownership paths must be non-empty repository-relative Git paths.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Ownership paths cannot contain '.', '..', or empty segments.");
  }
  return normalized;
}

export function normalizeOwnershipPattern(value: string): string {
  const normalized = normalizeOwnershipPath(value.trim());
  if (normalized.startsWith("!") || normalized.startsWith("#")) {
    throw new Error("Ownership patterns cannot use negation or comment syntax.");
  }
  if (PROSE_ANNOTATION.test(normalized)) {
    throw new Error("Ownership patterns must contain path syntax only; put explanations in notes.");
  }
  return normalized;
}
