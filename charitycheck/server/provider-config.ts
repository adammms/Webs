import { type BankProvider, unavailableBankProvider } from "./providers.js";
import { createMidtransIrisProvider } from "./integrations/midtrans-iris.js";
export function configureBankProvider(env: NodeJS.ProcessEnv): BankProvider {
  const selected = env.BANK_PROVIDER?.trim() ?? "none";
  if (selected === "none" || !selected) return unavailableBankProvider;
  if (selected !== "midtrans-iris")
    return {
      id: "none",
      async inquire() {
        return {
          kind: "unavailable",
          source: "Konfigurasi integrasi rekening",
          code: "configuration_error",
          reason: "Penyedia rekening yang dipilih belum didukung aplikasi.",
        };
      },
    };
  if (!env.MIDTRANS_IRIS_API_KEY?.trim())
    return {
      id: "none",
      async inquire() {
        return {
          kind: "unavailable",
          source: "Konfigurasi Midtrans Iris",
          code: "missing_credentials",
          reason:
            "API key Midtrans Iris belum diatur. Pengelola perlu menambahkan kredensial production setelah akses disetujui.",
        };
      },
    };
  return createMidtransIrisProvider(env.MIDTRANS_IRIS_API_KEY);
}
