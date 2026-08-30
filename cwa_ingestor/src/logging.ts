const SECRET_PATTERNS = [
  /Authorization=[^&\s]+/giu,
  /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/giu,
  /(x-forecast-ingestion-signature\s*[:=]\s*)[^\s,;]+/giu,
] as const;

export function redactMessage(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  for (const pattern of SECRET_PATTERNS) message = message.replace(pattern, "$1[redacted]");
  message = message.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/giu, "$1?[redacted]");
  return message.slice(0, 500);
}

export function structuredLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const output = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
