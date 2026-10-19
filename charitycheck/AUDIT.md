# Audit dan pemetaan PRD

## Kondisi awal

Repo berisi 29 file portfolio statis (HTML, CSS, JavaScript dan aset). Tidak ada manifest, lockfile, README, instruksi AGENTS, backend, migrasi atau tes. Portfolio memiliki menu/theme, Swiper dan ScrollReveal; seluruhnya dipertahankan. EmailJS pada portfolio memakai `type="javascript"` sehingga bukan script JavaScript yang dieksekusi browser; tidak diubah karena bukan fitur CharityCheck. Pengujian aset portfolio: homepage dan 17 referensi lokal HTTP 200. Interaksi ikon portfolio belum lolos tes browser karena stylesheet eksternal tidak termuat. Tidak ada klaim readiness interaksi portfolio.

Karena tidak ada implementasi CharityCheck yang dapat diperluas, aplikasi React + TypeScript, Tailwind, Node + TypeScript, dan PostgreSQL ditambahkan dalam direktori terpisah, tanpa mengganti portfolio.

## P0

| Requirement             | Kondisi akhir Phase 1–3                                                   | Batasan                                                  |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| FR-01 input/format bank | Schema frontend/backend, subset 5 bank, cek data lengkap                  | Aturan format umum; bukan inquiry                        |
| Auto-check              | Debounce 650 ms, AbortController, guard generasi, timeout UI, retry       | Tidak ada request untuk input belum lengkap              |
| Inquiry resmi           | Kontrak BankProvider server-only, timeout/error/not-found terpisah        | Adapter live menunggu dokumentasi/kredensial Phase 4     |
| Masking                 | Nama provider dan penerima disamarkan, rekening hanya 4 digit akhir       | Fixture sukses/mismatch hanya dalam tes                  |
| FR-03 penerima          | Jenis/nama/URL/tujuan wajib; schema; adapter registrasi                   | Tidak melakukan crawling atau menganggap URL legalitas   |
| Pencocokan              | Pencocokan tepat dari nama provider, mismatch dengan penjelasan otorisasi | Tanpa provider: Tidak Dapat Diverifikasi                 |
| FR-04 laporan           | Status terpisah, sumber/waktu/expiry, alasan, keterbatasan, rekomendasi   | Kampanye tidak pernah otomatis disahkan                  |
| Privasi dan keamanan    | HMAC, audit minimal, no-store, Helmet, batas JSON, origin/rate limit      | Limiter memory single process; audit tidak dibuka publik |
| Database                | PostgreSQL 17, migrasi transactional/advisory lock, retensi/cleanup       | Produksi perlu role DB minimum dan backup retention      |
| Validasi                | Lint, typecheck/build, tes API/unit/PostgreSQL dan browser                | Tidak ada tes live provider tanpa akses resmi            |

## P1 / tahap lanjutan

- FR-02 QRIS dan dokumen: belum menerima upload; tab menjelaskan status. Perlu validasi konten, ukuran, decoder, sandbox, dan pemisahan terbaca versus konfirmasi merchant sebelum diaktifkan.
- Registrasi resmi: kontrak tersedia, integrasi menunggu akses legal.
- Export/simpan laporan dan dashboard/riwayat: belum tersedia; autentikasi/peran wajib sebelum akses audit.
- Tidak ada skor risiko/penipuan atau transaksi donasi.

## Bukti validasi

22 automated tests mencakup PostgreSQL nyata. Browser smoke menguji desktop 1440 px dan mobile 390 px, input/debounce, report dari API nyata, masking, race respons, retry error, QRIS tidak tersedia, dan tidak ada error JavaScript. Jalankan ulang perintah pada README untuk hasil terbaru.
