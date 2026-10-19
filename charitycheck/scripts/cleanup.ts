import "dotenv/config";
import { Pool } from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diatur.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const r = await pool.query(
    "DELETE FROM verification_audit WHERE expires_at <= now()",
  );
  console.log(`Audit kedaluwarsa dihapus: ${r.rowCount}`);
} finally {
  await pool.end();
}
