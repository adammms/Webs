import "dotenv/config";
import { Pool } from "pg";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { postgresAudit } from "./audit.js";
import { configureBankProvider } from "./provider-config.js";
if (!process.env.DATABASE_URL || !process.env.AUDIT_HMAC_KEY)
  throw new Error("DATABASE_URL dan AUDIT_HMAC_KEY wajib diatur.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
  statement_timeout: 5000,
});
const audit = postgresAudit(
  pool,
  process.env.AUDIT_HMAC_KEY,
  Number(process.env.RETENTION_DAYS ?? 30),
);
await audit.health();
const app = createApp({
  audit,
  bank: configureBankProvider(process.env),
  origin:
    process.env.APP_ORIGIN ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://127.0.0.1:5173"),
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
const cleanup = async () => {
  await pool.query("DELETE FROM verification_audit WHERE expires_at <= now()");
};
await cleanup();
const interval = setInterval(() => {
  void cleanup().catch(() => console.error("audit_cleanup_failed"));
}, 3600000);
interval.unref();
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () => console.log("CharityCheck API siap."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(interval);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
