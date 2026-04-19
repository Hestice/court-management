import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/logger";

// Narrow, fixed list. Keep additions deliberate — audit noise is the
// fastest way to make the table useless.
export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.register"
  | "role.change"
  | "rate_limit.hit";

export type AuditMetadata = Record<string, unknown>;

export async function logAuditEvent(
  action: AuditAction,
  opts: {
    actorUserId?: string | null;
    metadata?: AuditMetadata | null;
    ipAddress?: string | null;
  } = {},
): Promise<void> {
  const { actorUserId = null, metadata = null, ipAddress = null } = opts;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_audit_event", {
      p_action: action,
      p_actor_user_id: actorUserId,
      p_metadata: metadata as never,
      p_ip_address: ipAddress,
    });
    if (error) {
      logError("audit.log", error, { action, actorUserId });
    }
  } catch (err) {
    // Never let audit logging fail a user-facing request.
    logError("audit.log.exception", err, { action, actorUserId });
  }
}
