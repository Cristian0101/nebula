/** Redacts common credential assignments before evidence crosses a persistence boundary. */
export const redactSensitiveText = (input: string, limit = 8_000): string =>
  input
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
      "[REDACTED]",
    )
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|token|secret|password)\s*[:=]\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/gi,
      (_match, key: string) => `${key}=[REDACTED]`,
    )
    .replace(
      /\b(authorization\s*:\s*(?:bearer|basic)|(?:bearer|basic))\s+[A-Za-z0-9._~+/=-]{8,}/gi,
      (_match, prefix: string) => `${prefix} [REDACTED]`,
    )
    .replace(
      /\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{25,}|sk-(?:ant-)?[A-Za-z0-9_-]{20,}|xox[pbar]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
      "[REDACTED]",
    )
    .replace(/\b(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .slice(0, limit);
