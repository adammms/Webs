# CharityCheck — MVP Phase 1–3

Aplikasi pemeriksaan informasi donasi berbahasa Indonesia. Tidak menerima atau menyalurkan uang. **Default aplikasi belum mengaktifkan penyedia rekening atau registrasi resmi.** Adapter Midtrans Iris production tersedia tetapi memerlukan akses dan API key; lihat [MIDTRANS.md](MIDTRANS.md). Data lengkap dan format sesuai tetap menghasilkan **Tidak Dapat Diverifikasi / Belum terverifikasi**, bukan konfirmasi rekening aktif atau donasi aman.

Aplikasi berada di subdirektori `charitycheck/` karena audit awal menemukan portfolio statis yang tidak memiliki backend, database, atau fungsi verifikasi. Seluruh file portfolio asli dipertahankan. Lihat [AUDIT.md](AUDIT.md) untuk gap P0/P1 dan status implementasi.

## Menjalankan pengembangan

Prasyarat: Node.js 22.12+ atau 24 LTS (diuji 24), npm, Docker dengan Compose, atau PostgreSQL 17 yang dikelola sendiri. Semua perintah berikut dijalankan dari `Webs/charitycheck`.

```sh
npm ci
npm run setup:local
# Membuat .env hanya jika belum ada; HMAC key dibuat acak.
# Password database contoh hanya untuk pengembangan pada loopback.
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Frontend memakai port 5173, API loopback port 3001, PostgreSQL loopback port 5433. Vite meneruskan `/api` ke backend sehingga tidak perlu CORS. Periksa kesiapan dengan `curl -f http://127.0.0.1:3001/api/health` dan buka aplikasi melalui akses development lokal Anda. Tidak ada API key di frontend.

Untuk PostgreSQL sendiri, atur `DATABASE_URL` di `.env`; Compose tidak diperlukan. Gunakan `AUDIT_HMAC_KEY` acak minimal 32 karakter, `APP_ORIGIN` sesuai origin frontend, dan `RETENTION_DAYS` 1–90 (default 30). `.env` diabaikan Git. Jangan memasukkan kredensial ke file publik atau chat.

```sh
npm run lint
npm run typecheck
npm run build
npm test
# Dengan npm run dev masih berjalan:
npx playwright install chromium
npm run test:browser
# Alternatif jika Chromium sistem sudah tersedia:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`npm test` menjalankan 43 tes termasuk PostgreSQL nyata, migrasi berulang di schema terisolasi, minimasi audit, penghapusan data, validasi, status provider, timeout, masking, error, rate limit, dan pembatasan akses. DATABASE_URL wajib; tes DB tidak dilewati diam-diam. Akun DB pengujian perlu izin CREATE/DROP SCHEMA pada database pengujian. Jangan gunakan database produksi untuk tes. Fixture provider hanya terdapat pada tes, tidak dapat diaktifkan pada aplikasi.

Tes browser menguji frontend dan API nyata, debounce, input belum lengkap, masking, respons lama yang datang terlambat, error/retry, tampilan mobile tanpa overflow, serta status QRIS yang belum tersedia. Penundaan/error jaringan hanya disuntikkan dari runner tes. Screenshot lokal ditulis ke direktori ignored `playwright-results/`.

## Build dan runtime

```sh
npm run build
NODE_ENV=production APP_ORIGIN=https://domain-anda.example npm start
```

Backend production melayani `dist/` dan API pada `0.0.0.0` (dapat diubah dengan `HOST`); development tetap loopback. Pasang reverse proxy HTTPS untuk deployment; pastikan `APP_ORIGIN` cocok. Default CSP Helmet membatasi resource ke origin sendiri; aplikasi tidak memerlukan CDN/font eksternal. Runtime produksi tidak memiliki mock provider. `BANK_PROVIDER=none` adalah default; pilih `midtrans-iris` dan atur `MIDTRANS_IRIS_API_KEY` hanya setelah akses resmi disetujui.

Ini adalah MVP untuk pengujian, bukan deployment publik yang sudah diperkeras. Rate limit memakai memory satu proses (15 permintaan/menit/IP). Jangan mengaktifkan `trust proxy` sembarangan; untuk banyak instance gunakan limiter bersama serta konfigurasi proxy tepercaya. History/dashboard publik sengaja tidak tersedia; implementasikan autentikasi dan otorisasi peran sebelum membuka audit internal. Gunakan role PostgreSQL khusus aplikasi dengan hak minimum, role migrasi terpisah, TLS database terverifikasi, dan password unik di deployment. Password pada contoh Compose hanya untuk development loopback.

## API dan struktur

- `GET /api/health`: status kesiapan DB dan migrasi; 503 jika tidak siap.
- `GET /api/banks`: subset format umum BCA, BRI, BNI, Mandiri, BSI. Panjang rekening dapat bervariasi menurut produk; aturan awal bukan bukti pendaftaran atau dukungan penyedia.
- `POST /api/verifications`: JSON `{bank, accountNumber, recipient: {type, name, website, purpose}}`. Bank diisi kode dari `/api/banks`; tipe penerima Yayasan/Organisasi/Komunitas/Masjid/Perorangan. Maksimum 16 KB, schema strict; hanya data lengkap diperiksa. Respons 201 berisi laporan tersamarkan; 400 input salah, 403 origin salah, 415 format tak didukung, 429 rate limit, 503 audit tidak tersedia.
- Tidak ada endpoint history atau upload. Multipart ditolak; tidak ada file diterima/disimpan pada Phase 1–3.

`server/providers.ts` adalah kontrak adapter server-only dengan AbortSignal dan timeout. `recipient.ts` menangani masking dan pencocokan nama tepat setelah normalisasi; kesamaan nama tidak membuktikan otorisasi kampanye. `report.ts` memisahkan status rekening, identitas, kecocokan dan keseluruhan. `audit.ts` menyimpan audit minimal berparameter SQL. UI di `src/`, migrasi di `migrations/`.

## Privasi dan retensi

Nomor rekening, nama asli pemilik, nama penerima, website, dan tujuan tidak disimpan di DB atau dicetak ke log. Audit berisi UUID, waktu, expiry, bank, kode status/provider dan sidik HMAC-SHA256 untuk korelasi pemeriksaan tanpa menyimpan rekening mentah. HMAC bukan anonimisasi sempurna; batasi akses DB, lindungi key dan jangan rotasi tanpa menilai kebutuhan korelasi. Tidak ada informasi sensitif yang perlu disimpan dengan enkripsi reversibel pada scope ini. Logs hanya berisi event, HTTP status dan durasi.

Retensi audit default 30 hari, dibersihkan saat startup dan setiap jam (batas penghapusan dapat terlambat hingga satu interval saat server aktif). `npm run db:cleanup` dapat dijadwalkan mandiri; proses harus dijalankan bila aplikasi mati. Backup database wajib mengikuti kebijakan retensi operasional tersendiri. Laporan di browser hanya berada dalam memory, hilang saat reload, dan tidak dicache oleh API. Hasil disarankan diperiksa ulang setelah 24 jam; input berubah langsung menghapus laporan lama dan membatalkan request terkait.

## Deploy dengan URL publik

Lihat [RAILWAY.md](RAILWAY.md) untuk deployment frontend + backend + PostgreSQL pada Railway. Dockerfile menjalankan migrasi sebelum server dan tidak menyertakan `.env`.

## Sebelum Phase 4

Adapter Midtrans Iris telah disiapkan berdasarkan SDK resmi dan diuji dengan fixture HTTP. Belum diuji dengan rekening nyata; lihat [MIDTRANS.md](MIDTRANS.md). Diperlukan konfirmasi pemilihan penyedia rekening resmi, dokumentasi API dan kontrak penggunaan, bank/produk yang didukung, kredensial yang disimpan server-side, tujuan HTTPS yang diizinkan, aturan penyamaran/penggunaan nama, serta perilaku not-found/error/timeout resmi. Tidak ada endpoint eksternal atau respons provider yang dikarang. Sumber registrasi identitas juga memerlukan akses legal dan dokumentasi. Setelah tersedia, implementasikan adapter resmi serta tes integrasi terpisah.

QRIS parsing/upload, dokumen pendukung, export, riwayat dan dashboard review adalah P1/Phase 3 extended dari roadmap PRD, belum diimplementasikan. Tab QRIS secara eksplisit menjelaskan keterbatasan dan tidak mengunggah file. Kesimpulan donasi selalu membutuhkan bukti kampanye tambahan; konfirmasi rekening saja tidak menjamin keamanan.
