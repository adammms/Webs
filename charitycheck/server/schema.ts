import { z } from "zod";
export const banks = [
  { code: "BCA", name: "BCA", min: 10, max: 10 },
  { code: "BRI", name: "BRI", min: 15, max: 15 },
  { code: "BNI", name: "BNI", min: 10, max: 10 },
  { code: "MANDIRI", name: "Mandiri", min: 13, max: 13 },
  { code: "BSI", name: "BSI", min: 10, max: 10 },
] as const;
export const recipientTypes = [
  "Yayasan",
  "Organisasi",
  "Komunitas",
  "Masjid",
  "Perorangan",
] as const;
export const verificationSchema = z
  .object({
    bank: z.enum(["BCA", "BRI", "BNI", "MANDIRI", "BSI"]),
    accountNumber: z
      .string()
      .regex(/^\d{10,15}$/, "Gunakan 10–15 digit angka."),
    recipient: z
      .object({
        type: z.enum(recipientTypes),
        name: z.string().trim().min(3).max(120),
        website: z
          .string()
          .trim()
          .max(300)
          .refine((v) => {
            try {
              const u = new URL(v);
              return (
                ["https:", "http:"].includes(u.protocol) &&
                !u.username &&
                !u.password
              );
            } catch {
              return false;
            }
          }, "Masukkan URL website atau akun sosial yang lengkap (https://...)."),
        purpose: z.string().trim().min(10).max(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const b = banks.find((b) => b.code === v.bank)!;
    if (v.accountNumber.length < b.min || v.accountNumber.length > b.max)
      ctx.addIssue({
        code: "custom",
        path: ["accountNumber"],
        message: `Nomor rekening ${b.name} harus ${b.min} digit. Validasi ini hanya memeriksa format umum.`,
      });
  });
export type VerificationInput = z.infer<typeof verificationSchema>;
export type Status =
  "verified" | "mismatch" | "not_found" | "review" | "unavailable";
export interface Finding {
  status: Status;
  reason: string;
  source: string;
  checkedAt: string;
  code: string;
}
export interface Report {
  id: string;
  checkedAt: string;
  expiresAt: string;
  payment: Finding;
  recipient: Finding;
  match: Finding;
  overall: Finding;
  accountMasked: string;
  holderMasked?: string;
  recipientMasked: string;
  bank: string;
  limitations: string[];
  recommendations: string[];
}
export const statusLabels: Record<Status, string> = {
  verified: "Terverifikasi",
  mismatch: "Tidak Cocok",
  not_found: "Tidak Ditemukan",
  review: "Perlu Pemeriksaan Lanjutan",
  unavailable: "Tidak Dapat Diverifikasi",
};
