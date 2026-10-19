import { createHmac } from "node:crypto";
import type { Pool } from "pg";
import type { Report, VerificationInput } from "./schema.js";
export interface AuditStore {
  write(
    input: VerificationInput,
    report: Report,
    provider: string,
  ): Promise<void>;
  health(): Promise<void>;
}
export function postgresAudit(
  pool: Pool,
  key: string,
  retentionDays = 30,
): AuditStore {
  if (key.length < 32 || key === "replace-with-random-at-least-32-characters")
    throw new Error("AUDIT_HMAC_KEY harus minimal 32 karakter.");
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 90
  )
    throw new Error("RETENTION_DAYS harus 1–90.");
  return {
    async health() {
      await pool.query("SELECT id FROM verification_audit LIMIT 0");
    },
    async write(input, r, provider) {
      const fingerprint = createHmac("sha256", key)
        .update(`${input.bank}:${input.accountNumber}`)
        .digest("hex");
      await pool.query(
        "INSERT INTO verification_audit (id,checked_at,expires_at,account_fingerprint,bank_code,payment_status,recipient_status,match_status,provider_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          r.id,
          r.checkedAt,
          new Date(Date.parse(r.checkedAt) + retentionDays * 86400000),
          fingerprint,
          input.bank,
          r.payment.status,
          r.recipient.status,
          r.match.status,
          provider,
        ],
      );
    },
  };
}
