import { z } from "zod";
import type { BankProvider, BankResult } from "../providers.js";
// Contract: official midtrans-client 1.4.3, lib/iris.js,
// lib/apiConfig.js, lib/httpClient.js; official test/iris.test.js.
// Only read-only beneficiary_banks/account_validation endpoints are used.
const BASE = "https://app.midtrans.com/iris/api/v1";
const SOURCE = "Midtrans Iris — Account Validation (production)";
const bankListSchema = z.object({
  beneficiary_banks: z
    .array(
      z.object({
        code: z
          .string()
          .regex(/^[a-z0-9_]+$/)
          .max(100),
        name: z.string().max(200),
      }),
    )
    .max(1000),
});
const accountSchema = z.object({
  account_no: z.string().regex(/^\d+$/).max(40),
  account_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((n) => /\p{L}/u.test(n) && !/[＊*•]/u.test(n)),
});
class IrisFailure extends Error {
  constructor(public readonly code: string) {
    super("Bank inquiry unavailable");
  }
}
async function readJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new IrisFailure("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new IrisFailure("invalid_response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new IrisFailure("invalid_response");
  }
}
const errorMessages: Record<string, string> = {
  authentication_failed:
    "Akses penyedia ditolak. Pengelola perlu memeriksa API key dan izin Account Validation.",
  rate_limited:
    "Batas permintaan penyedia tercapai. Silakan coba kembali nanti.",
  provider_error:
    "Penyedia rekening sedang tidak dapat diakses. Silakan coba kembali.",
  invalid_response:
    "Respons penyedia belum cukup untuk mengonfirmasi rekening. Tidak ada klaim verifikasi yang dibuat.",
  unsupported_bank:
    "Bank ini belum dapat dipetakan ke daftar bank yang didukung penyedia.",
};
export function createMidtransIrisProvider(
  apiKey: string,
  transport: typeof fetch = fetch,
): BankProvider {
  if (!apiKey.trim())
    throw new Error("MIDTRANS_IRIS_API_KEY wajib diatur untuk integrasi Iris.");
  // Fixed HTTPS origin and redirect:error prevent credential forwarding to arbitrary hosts.
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
  };
  let cachedBanks:
      z.infer<typeof bankListSchema>["beneficiary_banks"] | undefined,
    cacheExpires = 0;
  async function get(
    path: string,
    signal: AbortSignal,
    maxBytes: number,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await transport(`${BASE}${path}`, {
        method: "GET",
        headers,
        signal,
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new IrisFailure("provider_error");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new IrisFailure(
        response.status === 401 || response.status === 403
          ? "authentication_failed"
          : response.status === 429
            ? "rate_limited"
            : "provider_error",
      );
    }
    return readJson(response, maxBytes);
  }
  return {
    id: "midtrans-iris",
    async inquire(input, signal): Promise<BankResult> {
      try {
        if (!cachedBanks || Date.now() >= cacheExpires) {
          const parsed = bankListSchema.safeParse(
            await get("/beneficiary_banks", signal, 262144),
          );
          if (!parsed.success) throw new IrisFailure("invalid_response");
          cachedBanks = parsed.data.beneficiary_banks;
          cacheExpires = Date.now() + 3600000;
        }
        const codes: Record<string, string> = {
          BCA: "bca",
          BRI: "bri",
          BNI: "bni",
          MANDIRI: "mandiri",
        };
        const supported =
          input.bank === "BSI"
            ? cachedBanks.find((b) =>
                /^(?:pt )?bank syariah indonesia(?: tbk)?$/.test(
                  b.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, " ")
                    .trim(),
                ),
              )
            : cachedBanks.find((b) => b.code === codes[input.bank]);
        if (!supported) throw new IrisFailure("unsupported_bank");
        const query = new URLSearchParams({
          bank: supported.code,
          account: input.accountNumber,
        });
        const result = accountSchema.safeParse(
          await get(`/account_validation?${query}`, signal, 16384),
        );
        if (!result.success || result.data.account_no !== input.accountNumber)
          throw new IrisFailure("invalid_response");
        return {
          kind: "confirmed",
          holderName: result.data.account_name,
          source: SOURCE,
        };
      } catch (e) {
        // Never log/return the request URL, API key, raw response or upstream errors.
        // Unknown errors and HTTP 404 are NOT evidence that an account does not exist.
        const code = e instanceof IrisFailure ? e.code : "provider_error";
        return {
          kind: "unavailable",
          source: SOURCE,
          code,
          reason: errorMessages[code] ?? errorMessages.provider_error,
        };
      }
    },
  };
}
