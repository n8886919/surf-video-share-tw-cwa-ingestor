const SECRET_PATTERNS = [
  /Authorization=[^&\s]+/giu,
  /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/giu,
  /(x-forecast-ingestion-signature\s*[:=]\s*)[^\s,;]+/giu,
] as const;

type LogLevel = "info" | "warn" | "error";
type LogField = string | number | boolean | null | undefined;

const EVENT_TITLES: Readonly<Record<string, string>> = {
  app_started: "CWA ingestor started",
  app_fatal: "CWA ingestor stopped after a fatal error",
  cwa_ingestion_started: "Starting CWA ingestion attempt",
  cwa_fetch_complete: "Downloaded and normalized CWA forecast",
  cwa_fetch_warning: "CWA forecast completed with a warning",
  cwa_ingestion_complete: "Sent CWA forecast batches to the Worker",
  cwa_ingestion_failed: "CWA ingestion attempt failed",
  state_read_failed: "Could not read saved retry state",
  stale_success: "No successful ingestion for more than 7 hours",
  next_attempt_scheduled: "Next ingestion attempt scheduled",
};

export function formatTaipeiTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} Asia/Taipei`;
}

function formatRetry(seconds: number): string {
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function summarizeValidationMessage(message: string): string {
  try {
    const issues = JSON.parse(message) as unknown;
    if (!Array.isArray(issues)) return message;
    const summaries = issues.flatMap((issue) => {
      if (typeof issue !== "object" || issue === null) return [];
      const record = issue as Record<string, unknown>;
      const path = Array.isArray(record.path) ? record.path.map(String).join(".") : "value";
      if (record.code === "too_big" && typeof record.maximum === "number") {
        const unit = record.origin === "array" ? "items" : "characters";
        return [`${path || "value"} has too many ${unit} (maximum ${record.maximum})`];
      }
      if (typeof record.message === "string") return [`${path || "value"}: ${record.message}`];
      return [];
    });
    return summaries.length ? summaries.join("; ") : message;
  } catch {
    return message;
  }
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function formatField(key: string, value: Exclude<LogField, undefined>, now: Date): string {
  if (value === null) return `${key}=none`;
  if (key === "message") return `error=${oneLine(summarizeValidationMessage(String(value)))}`;
  if (key === "consecutiveFailures") return `failures=${value}`;
  if (key === "retrySeconds" && typeof value === "number") return `retry=${formatRetry(value)}`;
  if (key.endsWith("At") && typeof value === "string") return `${key}=${formatTaipeiTime(value)}`;
  return `${key}=${oneLine(String(value))}`;
}

export function formatLogLine(
  level: LogLevel,
  event: string,
  fields: Record<string, LogField> = {},
  now = new Date(),
): string {
  const title = EVENT_TITLES[event] ?? event.replaceAll("_", " ");
  const details = Object.entries(fields)
    .filter((entry): entry is [string, Exclude<LogField, undefined>] => entry[1] !== undefined)
    .map(([key, value]) => formatField(key, value, now));
  const heading = `[${formatTaipeiTime(now)}] ${level.toUpperCase()} ${title} [${event}]`;
  return details.length ? `${heading} | ${details.join(" | ")}` : heading;
}

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
  level: LogLevel,
  event: string,
  fields: Record<string, LogField> = {},
): void {
  const output = formatLogLine(level, event, fields);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
