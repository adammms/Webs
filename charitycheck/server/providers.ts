import type { VerificationInput } from "./schema.js";
// Server-only adapter contract. Official integrations require provider documentation,
// consent/use approval and credentials. Never invent an endpoint or return mock evidence.
export type BankResult =
  | { kind: "confirmed"; holderName: string; source: string }
  | { kind: "not_found"; source: string }
  | { kind: "unavailable"; source: string; code?: string; reason?: string };
export interface BankProvider {
  id: string;
  inquire(
    input: Pick<VerificationInput, "bank" | "accountNumber">,
    signal: AbortSignal,
  ): Promise<BankResult>;
}
export const unavailableBankProvider: BankProvider = {
  id: "none",
  async inquire() {
    return {
      kind: "unavailable",
      source: "Penyedia rekening resmi belum terhubung",
    };
  },
};
export type RecipientResult =
  | { kind: "confirmed"; source: string }
  | { kind: "not_found"; source: string }
  | { kind: "unavailable"; source: string };
export interface RecipientProvider {
  check(
    recipient: VerificationInput["recipient"],
    signal: AbortSignal,
  ): Promise<RecipientResult>;
}
export const unavailableRecipientProvider: RecipientProvider = {
  async check() {
    return { kind: "unavailable", source: "Registrasi resmi belum terhubung" };
  },
};
export class ProviderTimeout extends Error {}
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProviderTimeout());
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
