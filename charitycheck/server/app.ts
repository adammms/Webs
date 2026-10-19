import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { AuditStore } from "./audit.js";
import {
  type BankProvider,
  type RecipientProvider,
  unavailableBankProvider,
  unavailableRecipientProvider,
} from "./providers.js";
import { banks, verificationSchema } from "./schema.js";
import { createReport } from "./report.js";
export function createApp(deps: {
  audit: AuditStore;
  bank?: BankProvider;
  recipient?: RecipientProvider;
  timeout?: number;
  rateLimit?: number;
  origin?: string;
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimit ?? 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error:
          "Terlalu banyak pemeriksaan. Tunggu satu menit sebelum mencoba lagi.",
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", async (_req, res) => {
    try {
      await deps.audit.health();
      res.json({ status: "ok", provider: "unavailable" });
    } catch {
      res.status(503).json({ error: "Database belum siap." });
    }
  });
  app.get("/api/banks", (_req, res) => res.json(banks));
  app.post("/api/verifications", async (req, res) => {
    if (req.headers.origin && req.headers.origin !== deps.origin)
      return void res
        .status(403)
        .json({ error: "Asal permintaan tidak diizinkan." });
    if (!req.is("application/json"))
      return void res
        .status(415)
        .json({ error: "Gunakan format application/json." });
    const parsed = verificationSchema.safeParse(req.body);
    if (!parsed.success)
      return void res
        .status(400)
        .json({
          error: "Periksa kembali data masukan.",
          fields: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
    const started = Date.now();
    res.on("finish", () =>
      console.info(
        JSON.stringify({
          event: "verification_completed",
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
    try {
      const bank = deps.bank ?? unavailableBankProvider;
      const report = await createReport(
        parsed.data,
        bank,
        deps.recipient ?? unavailableRecipientProvider,
        deps.timeout,
      );
      await deps.audit.write(parsed.data, report, bank.id);
      // Never return provider payloads or raw input in errors or responses.
      res.status(201).json(report);
    } catch {
      res
        .status(503)
        .json({
          error:
            "Pemeriksaan belum tersimpan. Layanan audit tidak tersedia; silakan coba kembali.",
        });
    }
  });
  // History intentionally has no public route. Audit access is restricted to DB roles.
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Layanan tidak ditemukan." }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? Number(err.status)
          : 500;
      res
        .status(status === 413 ? 413 : status === 400 ? 400 : 500)
        .json({
          error:
            status === 413
              ? "Data terlalu besar. Maksimum 16 KB."
              : status === 400
                ? "JSON tidak valid."
                : "Terjadi kesalahan layanan.",
        });
    },
  );
  return app;
}
