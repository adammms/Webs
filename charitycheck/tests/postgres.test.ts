import "dotenv/config";
import { describe, it, expect } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { postgresAudit } from "../server/audit";
import { createReport } from "../server/report";
import {
  unavailableBankProvider,
  unavailableRecipientProvider,
} from "../server/providers";
// A real PostgreSQL connection is required; failures are not skipped or hidden.
describe("PostgreSQL migrations, minimization and retention", () => {
  it("migrates twice, stores only minimal HMAC audit and removes expired data", async () => {
    if (!process.env.DATABASE_URL)
      throw new Error("Set DATABASE_URL for PostgreSQL integration tests.");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      max: 1,
    });
    let schema = "";
    try {
      schema = `test_${randomUUID().replaceAll("-", "")}`;
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`SET search_path TO ${schema}`);
      const migration = await readFile(
        new URL("../migrations/001_audit.sql", import.meta.url),
        "utf8",
      );
      await pool.query(migration);
      await pool.query(migration);
      const store = postgresAudit(
        pool,
        "test-hmac-key-at-least-thirty-two-characters",
        30,
      );
      await store.health();
      const input = {
        bank: "BCA" as const,
        accountNumber: "1234567890",
        recipient: {
          type: "Yayasan" as const,
          name: "Nama Rahasia",
          website: "https://example.org",
          purpose: "Bantuan anak sekolah",
        },
      };
      const report = await createReport(
        input,
        unavailableBankProvider,
        unavailableRecipientProvider,
      );
      await store.write(input, report, "none");
      const rows = await pool.query("SELECT * FROM verification_audit");
      expect(rows.rowCount).toBe(1);
      const serialized = JSON.stringify(rows.rows);
      expect(serialized).not.toContain(input.accountNumber);
      expect(serialized).not.toContain(input.recipient.name);
      expect(serialized).not.toContain(input.recipient.website);
      expect(rows.rows[0].account_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      await pool.query(
        "UPDATE verification_audit SET expires_at = now()-interval '1 day'",
      );
      await pool.query(
        "DELETE FROM verification_audit WHERE expires_at <= now()",
      );
      expect(
        (await pool.query("SELECT * FROM verification_audit")).rowCount,
      ).toBe(0);
    } finally {
      if (schema) await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  });
});
