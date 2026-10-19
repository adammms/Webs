# Integrasi rekening Midtrans Iris

## Status

Adapter production sudah disiapkan dan diuji dengan transport HTTP pengujian. **Belum ada pemeriksaan rekening nyata yang dijalankan.** Belum ada akun, API key, persetujuan penggunaan atau uji integrasi live. Default `BANK_PROVIDER=none` tidak memanggil layanan eksternal.

## Akses yang diperlukan

1. Hubungi Midtrans melalui kanal resmi di https://midtrans.com atau dashboard https://app.midtrans.com/iris dan tanyakan akses **Iris Account Validation** untuk use case pemeriksaan informasi penerima donasi. Pendaftaran/kelayakan, cakupan bank, biaya, dan izin penggunaan data harus dikonfirmasi langsung ke penyedia.
2. Minta dokumentasi Account Validation yang berlaku dan akses production. Merchant key Snap/Core biasa bukan pengganti key Iris. Sandbox tidak memeriksa rekening nyata dan tidak didukung adapter ini.
3. Setelah akses disetujui, tambahkan pada **Variables service aplikasi Railway**:

   ```text
   BANK_PROVIDER=midtrans-iris
   MIDTRANS_IRIS_API_KEY=<masukkan key Iris production langsung di Railway>
   ```

   Jangan kirim API key ke chat atau commit ke GitHub. Jangan gunakan nilai placeholder di atas sebagai kredensial. Domain API yang diperlukan: `app.midtrans.com` melalui HTTPS.

4. Deploy versi kode integrasi dari branch `codex/iris-verification` atau merge perubahan tersebut ke branch yang digunakan Railway. Endpoint `/api/capabilities` menunjukkan **configured**, bukan jaminan akses upstream sudah valid.
5. Uji satu rekening milik sendiri atau pihak yang memberikan izin, sesuai ketentuan penyedia. Jangan melakukan enumerasi rekening. Pastikan nama asli tidak muncul di respons publik/log, dan lakukan pemeriksaan biaya/kuota. Tanpa akses/key, aplikasi tetap memberi hasil belum terverifikasi.

Registrasi identitas penerima tetap belum diintegrasikan. Rekening terkonfirmasi tidak otomatis mengesahkan penggalangan dana.

## Dasar kontrak adapter

Sumber resmi yang diperiksa saat implementasi:

- npm `midtrans-client@1.4.3`: `lib/iris.js` (`validateBankAccount`, `getBeneficiaryBanks`), `lib/apiConfig.js` (base URL production), `lib/httpClient.js` (HTTP GET, Basic API-key authentication).
- https://github.com/Midtrans/midtrans-nodejs-client/blob/master/test/iris.test.js : parameter `bank`, `account` dan respons `account_no`, `account_name`; daftar `beneficiary_banks` dengan `code`, `name`.
- Dokumentasi lengkap: https://iris-docs.midtrans.com/ (akses dari environment pengembangan saat ini ditolak proxy; kesesuaian kontrak live terbaru belum diuji).

Adapter memakai native fetch Node dengan AbortSignal, endpoint HTTPS tetap, redirect ditolak, batas ukuran respons, dan schema respons. Tidak menginstal SDK payout atau menyediakan metode transfer uang. Tidak ada retry otomatis untuk menghindari biaya inquiry berulang. Metadata daftar bank dapat dicache selama 1 jam; inquiry rekening tidak dicache.

BSI hanya dipanggil jika daftar bank aktual dari penyedia secara eksplisit menyebut Bank Syariah Indonesia. Kode bank lama tidak diasumsikan masih mewakili BSI. Bank lain juga harus ada di daftar penyedia sebelum inquiry. Ketersediaan produk rekening tetap mengikuti penyedia.

HTTP 401/403 → akses ditolak, 429 → kuota penyedia, error jaringan → layanan tidak tersedia, payload tidak cocok → respons tidak cukup. HTTP 404 **tidak** dianggap rekening tidak ditemukan. Pemetaan not-found spesifik belum diaktifkan karena kontrak error resmi belum dapat dikonfirmasi; lebih baik unavailable daripada klaim tanpa bukti. Timeout tetap terpisah dari not-found pada lapisan laporan.

## Batasan publik

API publik tetap memiliki rate limit 15 permintaan/menit/IP pada endpoint pemeriksaan. Readiness probes dan capabilities tidak menggunakan kuota inquiry. Ini bukan batas biaya harian atau proteksi lintas-instance; sebelum aktivasi publik, atur pembatasan kuota/budget pada penyedia dan evaluasi kontrol penyalahgunaan, persetujuan, serta konfigurasi proxy tepercaya. Nama upstream hanya diproses di backend dan dikembalikan dalam bentuk tersamarkan.
