import { randomUUID } from "node:crypto";
import type { Finding, Report, VerificationInput } from "./schema.js";
import {
  type BankProvider,
  type RecipientProvider,
  ProviderTimeout,
  withTimeout,
} from "./providers.js";
import { maskName, namesMatch } from "./recipient.js";
export async function createReport(
  input: VerificationInput,
  bank: BankProvider,
  recipientProvider: RecipientProvider,
  timeout = 5000,
): Promise<Report> {
  const checkedAt = new Date().toISOString();
  const finding = (
    status: Finding["status"],
    reason: string,
    source: string,
    code: string,
  ): Finding => ({ status, reason, source, checkedAt, code });
  let payment: Finding,
    holderMasked: string | undefined,
    match = finding(
      "unavailable",
      "Kecocokan belum dapat diperiksa tanpa konfirmasi pemilik rekening.",
      "Pencocokan internal",
      "not_checked",
    );
  const paymentTask = (async () => {
    try {
      const result = await withTimeout(
        (signal) =>
          bank.inquire(
            { bank: input.bank, accountNumber: input.accountNumber },
            signal,
          ),
        timeout,
      );
      if (result.kind === "confirmed") {
        if (!result.holderName.trim())
          throw new Error("invalid provider result");
        holderMasked = maskName(result.holderName);
        payment = finding(
          "verified",
          "Kepemilikan rekening dikonfirmasi penyedia. Ini bukan verifikasi kampanye donasi.",
          result.source,
          "confirmed",
        );
        match = namesMatch(result.holderName, input.recipient.name)
          ? finding(
              "review",
              "Nama sesuai setelah normalisasi; otorisasi penggalangan dana masih perlu bukti.",
              "Perbandingan nama internal",
              "name_consistent",
            )
          : finding(
              "mismatch",
              "Nama dari penyedia tidak sama dengan nama penerima yang dimasukkan. Mintalah bukti otorisasi jika rekening digunakan oleh perwakilan.",
              "Perbandingan nama internal",
              "name_mismatch",
            );
      } else if (result.kind === "not_found")
        payment = finding(
          "not_found",
          "Penyedia secara eksplisit tidak menemukan rekening. Periksa kembali bank dan nomor rekening.",
          result.source,
          "not_found",
        );
      else
        payment = finding(
          "unavailable",
          "Belum terverifikasi. Format rekening sesuai aturan umum, tetapi penyedia resmi belum tersedia.",
          result.source,
          "provider_unavailable",
        );
    } catch (e) {
      payment = finding(
        "unavailable",
        e instanceof ProviderTimeout
          ? "Penyedia tidak merespons tepat waktu. Silakan coba kembali."
          : "Pemeriksaan penyedia gagal. Silakan coba kembali.",
        "Penyedia rekening",
        e instanceof ProviderTimeout ? "timeout" : "provider_error",
      );
    }
  })();
  const recipientTask = (async () => {
    try {
      const r = await withTimeout(
        (s) => recipientProvider.check(input.recipient, s),
        timeout,
      );
      if (r.kind === "confirmed")
        return finding(
          "verified",
          "Identitas ditemukan pada sumber resmi. Ini belum membuktikan otorisasi kampanye.",
          r.source,
          "identity_confirmed",
        );
      if (r.kind === "not_found")
        return finding(
          "not_found",
          "Sumber resmi tidak menemukan identitas. Hasil ini tidak berarti identitas palsu.",
          r.source,
          "identity_not_found",
        );
      return finding(
        "unavailable",
        "Data wajib lengkap. Legalitas dan hubungan dengan kampanye belum dapat dikonfirmasi.",
        r.source,
        "registry_unavailable",
      );
    } catch (e) {
      return finding(
        "unavailable",
        e instanceof ProviderTimeout
          ? "Pemeriksaan identitas melewati batas waktu."
          : "Sumber identitas tidak dapat diakses.",
        "Registrasi resmi",
        e instanceof ProviderTimeout ? "timeout" : "registry_error",
      );
    }
  })();
  const [, recipient] = await Promise.all([paymentTask, recipientTask]);
  return {
    id: randomUUID(),
    checkedAt,
    expiresAt: new Date(Date.parse(checkedAt) + 86400000).toISOString(),
    payment: payment!,
    recipient,
    match,
    overall: finding(
      "review",
      "Bukti belum cukup untuk memastikan keaslian penggalangan dana. Konfirmasi langsung kepada penerima melalui kanal resmi.",
      "Ringkasan pemeriksaan",
      "campaign_unconfirmed",
    ),
    accountMasked: `•••• ${input.accountNumber.slice(-4)}`,
    holderMasked,
    recipientMasked: maskName(input.recipient.name),
    bank: input.bank,
    limitations: [
      "Validasi format tidak membuktikan rekening aktif atau terdaftar.",
      "Rekening terkonfirmasi tidak menjamin keaslian atau keamanan donasi.",
      "Website dan akun sosial tidak otomatis membuktikan legalitas.",
    ],
    recommendations: [
      "Hubungi organisasi melalui kanal resmi yang Anda temukan secara mandiri.",
      "Minta bukti otorisasi rekening serta rincian penggunaan dana.",
      "Periksa kembali hasil setelah kedaluwarsa atau bila informasi berubah.",
    ],
  };
}
