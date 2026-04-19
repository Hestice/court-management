// Light wrapper around console.error so server-side errors land in Vercel
// logs with a consistent shape. No external service — Vercel's log pane is
// sufficient for MVP. Fields are flat JSON so they're easy to query in
// Vercel's log drains if we ever add one.
export function logError(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  // Supabase/PostgrestError is a plain object with `.message`/`.code`/`.details`
  // but isn't an `instanceof Error`, so pull those out explicitly before
  // falling through to "unknown". Without this, a DB error shows up in logs as
  // `error: "unknown"` and loses every hint of what actually failed.
  let message = "unknown";
  let code: string | undefined;
  let details: string | undefined;
  let hint: string | undefined;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    const e = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    if (typeof e.message === "string" && e.message) message = e.message;
    if (typeof e.code === "string") code = e.code;
    if (typeof e.details === "string") details = e.details;
    if (typeof e.hint === "string") hint = e.hint;
  }
  const payload = {
    level: "error",
    action,
    error: message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
    ...(hint ? { hint } : {}),
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
