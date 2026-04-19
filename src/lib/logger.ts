// Light wrapper around console.error so server-side errors land in Vercel
// logs with a consistent shape. No external service — Vercel's log pane is
// sufficient for MVP. Fields are flat JSON so they're easy to query in
// Vercel's log drains if we ever add one.
export function logError(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "unknown";
  const payload = {
    level: "error",
    action,
    error: message,
    ...context,
  };
  try {
    console.error(JSON.stringify(payload));
  } catch {
    // JSON.stringify can throw on circular structures; fall back to raw log.
    console.error("logError failed to serialize payload", { action, message });
  }
}

export function logInfo(
  action: string,
  context?: Record<string, unknown>,
): void {
  const payload = {
    level: "info",
    action,
    ...context,
  };
  try {
    console.info(JSON.stringify(payload));
  } catch {
    console.info("logInfo failed to serialize payload", { action });
  }
}
