import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createMidtransIrisProvider } from "../server/integrations/midtrans-iris";
import { configureBankProvider } from "../server/provider-config";
import { createReport } from "../server/report";
import {
  unavailableRecipientProvider,
  withTimeout,
  ProviderTimeout,
} from "../server/providers";
import { createApp } from "../server/app";
const input = {
  bank: "BCA" as const,
  accountNumber: "1234567890",
  recipient: {
    type: "Yayasan" as const,
    name: "Yayasan Contoh",
    website: "https://example.org",
    purpose: "Bantuan pendidikan anak",
  },
};
const banks = {
  beneficiary_banks: [
    { code: "bca", name: "Bank Central Asia" },
    { code: "bsm", name: "Bank Syariah Indonesia" },
  ],
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
function transportFor(data: unknown, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith("/beneficiary_banks")
        ? json(banks)
        : json(data, status),
    );
}
describe("Midtrans Iris HTTP contract (test-only fixtures; no real inquiry)", () => {
  it("uses official production read endpoints and Basic auth, confirms only matching account response", async () => {
    const transport = transportFor({
      account_no: input.accountNumber,
      account_name: "Yayasan Contoh",
    });
    const provider = createMidtransIrisProvider("test-only-key", transport);
    const r = await provider.inquire(input, new AbortController().signal);
    expect(r.kind).toBe("confirmed");
    const [url, opts] = transport.mock.calls[1];
    expect(String(url)).toBe(
      "https://app.midtrans.com/iris/api/v1/account_validation?bank=bca&account=1234567890",
    );
    expect(opts?.method).toBe("GET");
    expect(opts?.redirect).toBe("error");
    expect(opts?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("test-only-key:").toString("base64")}`,
    });
  });
  it("only queries BSI when current provider list explicitly names Bank Syariah Indonesia", async () => {
    const transport = transportFor({
      account_no: input.accountNumber,
      account_name: "Yayasan Contoh",
    });
    await createMidtransIrisProvider("test-key", transport).inquire(
      { ...input, bank: "BSI" },
      new AbortController().signal,
    );
    expect(String(transport.mock.calls[1][0])).toContain("bank=bsm");
  });
  it("does not guess BSI code from legacy bank name", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({
          beneficiary_banks: [{ code: "bsm", name: "Bank Syariah Mandiri" }],
        }),
      );
    const r = await createMidtransIrisProvider("test-key", transport).inquire(
      { ...input, bank: "BSI" },
      new AbortController().signal,
    );
    expect(r).toMatchObject({ kind: "unavailable", code: "unsupported_bank" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("caches only bank metadata, never account inquiry responses", async () => {
    const transport = transportFor({
      account_no: input.accountNumber,
      account_name: "Yayasan Contoh",
    });
    const provider = createMidtransIrisProvider("test-key", transport);
    for (let i = 0; i < 2; i++)
      await provider.inquire(input, new AbortController().signal);
    expect(
      transport.mock.calls.filter((c) =>
        String(c[0]).endsWith("/beneficiary_banks"),
      ),
    ).toHaveLength(1);
    expect(
      transport.mock.calls.filter((c) =>
        String(c[0]).includes("/account_validation"),
      ),
    ).toHaveLength(2);
  });
  it.each([
    [401, "authentication_failed"],
    [403, "authentication_failed"],
    [429, "rate_limited"],
    [404, "provider_error"],
    [500, "provider_error"],
  ])(
    "handles HTTP %s without inferring not-found or exposing raw errors",
    async (status, code) => {
      const transport = transportFor(
        { error: "SECRET Yayasan Contoh 1234567890" },
        Number(status),
      );
      const r = await createMidtransIrisProvider("test-key", transport).inquire(
        input,
        new AbortController().signal,
      );
      expect(r).toMatchObject({ kind: "unavailable", code });
      expect(JSON.stringify(r)).not.toContain("SECRET");
      expect(JSON.stringify(r)).not.toContain(input.accountNumber);
    },
  );
  it.each([
    { account_no: "9999999999", account_name: "Budi Rahman" },
    { account_no: input.accountNumber, account_name: "" },
    { account_no: input.accountNumber, account_name: "B****" },
    { message: "unknown" },
    { account_no: 1234567890, account_name: "Budi" },
  ])("rejects malformed or mismatched provider payloads", async (payload) => {
    const r = await createMidtransIrisProvider(
      "test-key",
      transportFor(payload),
    ).inquire(input, new AbortController().signal);
    expect(r).toMatchObject({ kind: "unavailable", code: "invalid_response" });
  });
  it("rejects oversized provider responses", async () => {
    const r = await createMidtransIrisProvider(
      "test-key",
      transportFor({
        account_no: input.accountNumber,
        account_name: "Yayasan Contoh",
        padding: "x".repeat(17000),
      }),
    ).inquire(input, new AbortController().signal);
    expect(r).toMatchObject({ kind: "unavailable", code: "invalid_response" });
  });
  it("never returns holder name or credentials through public report", async () => {
    const provider = createMidtransIrisProvider(
      "test-key",
      transportFor({
        account_no: input.accountNumber,
        account_name: "Yayasan Contoh",
      }),
    );
    const r = await createReport(input, provider, unavailableRecipientProvider);
    expect(r.payment.status).toBe("verified");
    expect(r.overall.status).toBe("review");
    expect(r.holderMasked).toBe("Y**** C****");
    expect(JSON.stringify(r)).not.toContain("Yayasan Contoh");
    expect(JSON.stringify(r)).not.toContain("test-key");
  });
  it("timeout aborts provider HTTP request", async () => {
    let aborted = false;
    const transport = vi.fn<typeof fetch>().mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          }),
        ),
    );
    const provider = createMidtransIrisProvider("test-key", transport);
    await expect(
      withTimeout((s) => provider.inquire(input, s), 10),
    ).rejects.toBeInstanceOf(ProviderTimeout);
    expect(aborted).toBe(true);
  });
  it("does not leak network exception or key", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("SECRET 1234567890"));
    const r = await createMidtransIrisProvider("test-key", transport).inquire(
      input,
      new AbortController().signal,
    );
    expect(r).toMatchObject({ kind: "unavailable", code: "provider_error" });
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
});
describe("configuration and public capabilities", () => {
  it("defaults disabled and handles missing credentials without claiming configured", async () => {
    expect(configureBankProvider({}).id).toBe("none");
    const provider = configureBankProvider({ BANK_PROVIDER: "midtrans-iris" });
    expect(provider.id).toBe("none");
    expect(
      await provider.inquire(input, new AbortController().signal),
    ).toMatchObject({ kind: "unavailable", code: "missing_credentials" });
    expect(configureBankProvider({ BANK_PROVIDER: "other" }).id).toBe("none");
  });
  it("only creates production provider after explicit selection and key", () => {
    expect(
      configureBankProvider({
        BANK_PROVIDER: "midtrans-iris",
        MIDTRANS_IRIS_API_KEY: "test-only-key",
      }).id,
    ).toBe("midtrans-iris");
    expect(
      configureBankProvider({ MIDTRANS_IRIS_API_KEY: "test-only-key" }).id,
    ).toBe("none");
  });
  it("health probes do not consume inquiry rate quota; capabilities never claim upstream validated", async () => {
    const app = createApp({
      audit: { async write() {}, async health() {} },
      rateLimit: 1,
    });
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/health").expect(200);
    const caps = await request(app).get("/api/capabilities").expect(200);
    expect(caps.body.bankProvider.configured).toBe(false);
    await request(app).post("/api/verifications").send(input).expect(201);
    await request(app).post("/api/verifications").send(input).expect(429);
  });
});
