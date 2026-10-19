# Deploy ke Railway

1. Kode aplikasi harus sudah tersedia di repository GitHub yang dipilih.
2. Buat proyek Railway, tambahkan database PostgreSQL, lalu service **GitHub Repo** untuk repository `adammms/Webs` dan branch yang berisi CharityCheck.
3. Pada Settings service aplikasi, atur **Root Directory** ke `/charitycheck`. Dockerfile dan railway.json pada direktori ini menangani build, migrasi sebelum startup dan healthcheck.
4. Pada Variables service aplikasi, atur:
   - `DATABASE_URL`: pilih referensi variable `DATABASE_URL` dari service PostgreSQL melalui editor Railway. Jangan gunakan URL contoh development.
   - `AUDIT_HMAC_KEY`: hasilkan nilai acak 32 byte secara lokal (contoh `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), lalu masukkan langsung di Variables Railway. Jangan kirim nilainya di chat.
   - `RETENTION_DAYS`: `30`.
5. Deploy lalu pilih **Settings → Networking → Generate Domain**. Railway menyediakan `PORT` dan `RAILWAY_PUBLIC_DOMAIN`; aplikasi menggunakan domain tersebut sebagai origin HTTPS. Jika memakai domain kustom, atur `APP_ORIGIN` ke URL HTTPS domain itu tanpa slash akhir.
6. Pastikan deployment sehat (`/api/health` merespons 200). Buka domain HTTPS, isi form dan pastikan laporan menunjukkan belum terverifikasi. Migrasi dijalankan pada setiap startup dengan transactional advisory lock.

Frontend dan API berada dalam satu service dan domain. Database diakses dari backend saja. Aplikasi berjalan sebagai user non-root, mendengarkan `0.0.0.0` pada port Railway, dan image tidak menyertakan `.env` atau kredensial development. Tetap pertahankan verifikasi TLS jika memakai koneksi database eksternal.

Batasan MVP: rate limiter masih memory satu proses dan tidak mempercayai header forwarded. Di belakang proxy, pengguna dapat berbagi kuota IP yang sama; sesuaikan limiter/proxy tepercaya sebelum pemakaian publik berskala besar. Tidak ada API verifikasi bank resmi atau dashboard internal yang diaktifkan.

Docker image, volume, secret dan deployment belum otomatis dibuat di akun Railway hanya dengan menambahkan konfigurasi ini. Pengaturan akun dan biaya dikendalikan melalui dashboard Railway.

## Mengaktifkan pemeriksaan rekening nyata

Ikuti [MIDTRANS.md](MIDTRANS.md). Tambahkan `BANK_PROVIDER=midtrans-iris` serta `MIDTRANS_IRIS_API_KEY` pada service aplikasi hanya setelah akses production disetujui. Tanpa keduanya, default tetap tidak melakukan inquiry. Adapter tersedia pada branch `codex/iris-verification`; gunakan versi kode tersebut atau merge ke branch deployment. Registrasi identitas belum terhubung.
