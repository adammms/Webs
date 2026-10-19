import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { verificationSchema, type VerificationInput } from "../server/schema";
import { createReport } from "../server/report";
import {
  unavailableBankProvider,
  unavailableRecipientProvider,
  type BankProvider,
} from "../server/providers";
import { maskName, namesMatch } from "../server/recipient";
const input: VerificationInput = {
  bank: "BCA",
  accountNumber: "1234567890",
  recipient: {
    type: "Yayasan",
    name: "Yayasan Cahaya",
    website: "https://example.org",
    purpose: "Bantuan pendidikan anak",
  },
};
const audit = () => ({
  write: vi.fn(async () => {}),
  health: vi.fn(async () => {}),
});
const provider = (
  kind: "confirmed" | "not_found" | "unavailable",
  holderName = "Yayasan Cahaya",
): BankProvider => ({
  id: "test-only",
  inquire: vi.fn(async () =>
    kind === "confirmed"
      ? { kind, holderName, source: "Fixture pengujian" }
      : { kind, source: "Fixture pengujian" },
  ),
});
describe("validasi dan privasi", () => {
  it("menolak rekening tidak lengkap sebelum provider dipanggil", async () => {
    const bank = provider("confirmed");
    const app = createApp({ audit: audit(), bank });
    await request(app)
      .post("/api/verifications")
      .send({ ...input, accountNumber: "123" })
      .expect(400);
    expect(bank.inquire).not.toHaveBeenCalled();
  });
  it.each(["12345abc90", "12345678901", "123 567890", ""])(
    "menolak format BCA %s",
    (number) =>
      expect(
        verificationSchema.safeParse({ ...input, accountNumber: number })
          .success,
      ).toBe(false),
  );
  it("menolak URL berbahaya, tujuan kosong, dan field asing", () => {
    expect(
      verificationSchema.safeParse({
        ...input,
        recipient: { ...input.recipient, website: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      verificationSchema.safeParse({
        ...input,
        recipient: { ...input.recipient, purpose: "" },
      }).success,
    ).toBe(false);
    expect(
      verificationSchema.safeParse({ ...input, secret: "x" }).success,
    ).toBe(false);
  });
  it("masking dan normalisasi tidak memberikan fuzzy match", () => {
    expect(maskName(" Adam   Rezki ")).toBe("A**** R****");
    expect(maskName("Åsa 李")).toBe("Å**** 李****");
    expect(namesMatch("YAYASAN  Cahaya", "Yayasan Cahaya")).toBe(true);
    expect(namesMatch("Cahaya", "Yayasan Cahaya")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
});
describe("status laporan", () => {
  it("tanpa provider tidak pernah menyatakan rekening terverifikasi", async () => {
    const r = await createReport(
      input,
      unavailableBankProvider,
      unavailableRecipientProvider,
    );
    expect(r.payment.status).toBe("unavailable");
    expect(r.payment.code).toBe("provider_unavailable");
    expect(r.overall.status).toBe("review");
    expect(r.recipient.status).toBe("unavailable");
    expect(JSON.stringify(r)).not.toContain(input.accountNumber);
    expect(JSON.stringify(r)).not.toContain(input.recipient.name);
  });
  it("menyamarkan konfirmasi dan tetap membedakan kampanye", async () => {
    const r = await createReport(
      input,
      provider("confirmed"),
      unavailableRecipientProvider,
    );
    expect(r.payment.status).toBe("verified");
    expect(r.holderMasked).toBe("Y**** C****");
    expect(r.match.status).toBe("review");
    expect(r.overall.status).toBe("review");
    expect(JSON.stringify(r)).not.toContain("Yayasan Cahaya");
  });
  it("mismatch didukung hasil provider", async () => {
    const r = await createReport(
      input,
      provider("confirmed", "Budi Rahman"),
      unavailableRecipientProvider,
    );
    expect(r.match.status).toBe("mismatch");
    expect(r.holderMasked).toBe("B**** R****");
    expect(JSON.stringify(r)).not.toContain("Budi Rahman");
  });
  it("not found hanya dari respons eksplisit", async () => {
    const r = await createReport(
      input,
      provider("not_found"),
      unavailableRecipientProvider,
    );
    expect(r.payment.status).toBe("not_found");
    expect(r.match.status).toBe("unavailable");
  });
  it("timeout membatalkan signal dan berbeda dari not found", async () => {
    let signal: AbortSignal | undefined;
    const bank: BankProvider = {
      id: "test-only",
      inquire: (_input, s) => {
        signal = s;
        return new Promise(() => {});
      },
    };
    const r = await createReport(input, bank, unavailableRecipientProvider, 10);
    expect(r.payment.code).toBe("timeout");
    expect(r.payment.status).toBe("unavailable");
    expect(signal?.aborted).toBe(true);
  });
  it("kegagalan provider tidak membocorkan data error", async () => {
    const bank: BankProvider = {
      id: "test-only",
      async inquire() {
        throw new Error("Budi Rahman 1234567890 SECRET");
      },
    };
    const r = await createReport(input, bank, unavailableRecipientProvider);
    expect(r.payment.code).toBe("provider_error");
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
  it("identitas tidak ditemukan tidak otomatis dianggap palsu", async () => {
    const r = await createReport(input, unavailableBankProvider, {
      async check() {
        return { kind: "not_found", source: "Fixture registrasi" };
      },
    });
    expect(r.recipient.status).toBe("not_found");
    expect(r.recipient.reason).toContain("tidak berarti identitas palsu");
    expect(r.overall.status).toBe("review");
  });
  it("konfirmasi identitas tidak mengesahkan kampanye", async () => {
    const r = await createReport(input, provider("confirmed"), {
      async check() {
        return { kind: "confirmed", source: "Fixture registrasi" };
      },
    });
    expect(r.recipient.status).toBe("verified");
    expect(r.overall.status).toBe("review");
  });
});
describe("API", () => {
  it("memberikan laporan parsial tanpa data asli", async () => {
    const store = audit();
    const response = await request(createApp({ audit: store }))
      .post("/api/verifications")
      .send(input)
      .expect(201);
    expect(response.body.payment.status).toBe("unavailable");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).not.toContain(input.accountNumber);
    expect(store.write).toHaveBeenCalledOnce();
  });
  it("gagal tertutup saat audit tidak dapat disimpan", async () => {
    const store = audit();
    store.write.mockRejectedValueOnce(new Error("database sensitive detail"));
    const response = await request(createApp({ audit: store }))
      .post("/api/verifications")
      .send(input)
      .expect(503);
    expect(response.text).not.toContain("sensitive");
  });
  it("health gagal saat database tidak siap", async () => {
    const store = audit();
    store.health.mockRejectedValueOnce(new Error("db"));
    await request(createApp({ audit: store }))
      .get("/api/health")
      .expect(503);
  });
  it("membatasi enumerasi", async () => {
    const app = createApp({ audit: audit(), rateLimit: 1 });
    await request(app).post("/api/verifications").send(input).expect(201);
    await request(app).post("/api/verifications").send(input).expect(429);
  });
  it("menolak JSON rusak, file upload, dan payload besar", async () => {
    const app = createApp({ audit: audit() });
    await request(app)
      .post("/api/verifications")
      .set("Content-Type", "application/json")
      .send("{bad")
      .expect(400);
    await request(app)
      .post("/api/verifications")
      .attach("file", Buffer.from("not an image"), "x.png")
      .expect(415);
    await request(app)
      .post("/api/verifications")
      .send({ ...input, large: "x".repeat(17000) })
      .expect(413);
  });
  it("menolak cross origin dan tidak mengekspos riwayat", async () => {
    const app = createApp({
      audit: audit(),
      origin: "https://charity.example",
    });
    await request(app)
      .post("/api/verifications")
      .set("Origin", "https://other.example")
      .send(input)
      .expect(403);
    await request(app).get("/api/history").expect(404);
  });
});
