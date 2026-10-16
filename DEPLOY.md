# Deploy ke VPS (Docker)

## Instalasi yang berjalan (16 Okt 2026)

| | |
|---|---|
| Web | https://kdkmp.kameranusantara.id |
| API | https://api-kdkmp.kameranusantara.id/api/… (akar dialihkan ke `/tentang`) |
| Server | VPS Ubuntu 22.04 bersama aplikasi lain (karhutla, live, unras, …) |
| Folder | `/opt/kdkmp-mbg` (proyek Docker `kdkmp-mbg`) |
| Port aplikasi | `127.0.0.1:4310` (`APP_PORT` di `.env`) |
| nginx | `/etc/nginx/sites-available/{kdkmp,api-kdkmp}.kameranusantara.id`, sertifikat Let's Encrypt via certbot (perpanjang otomatis) |
| Token admin | baris `ADMIN_TOKEN` di `/opt/kdkmp-mbg/.env` (hanya di server) |
| Password dasbor | `SITE_PASSWORD` di `.env` server (sejak 16 Okt 2026); API juga terkunci kecuali `/api/health` |

Pembaruan dari mesin pengembang:

```bash
# 1. Cadangkan data hidup di server
ssh root@<server> 'cd /opt/kdkmp-mbg && tar -czf backups/pra-deploy-$(date +%Y%m%d-%H%M).tar.gz -C data db'
# 2. Folder kode disinkronkan dengan --delete supaya file yang dihapus di lokal ikut hilang
#    (file lama yang tertinggal bisa menggagalkan build, mis. halaman yang sudah dihapus)
for d in frontend backend collector scripts data/seed; do
  rsync -az --delete --exclude node_modules --exclude dist ./$d/ root@<server>:/opt/kdkmp-mbg/$d/
done
# 3. Berkas di root (tanpa --delete; .env, data/db, data/raw, backups tidak disentuh)
rsync -az --exclude node_modules --exclude frontend/dist --exclude data/raw --exclude data/db --exclude .env --exclude backups ./ root@<server>:/opt/kdkmp-mbg/
# 4. Build ulang
ssh root@<server> 'cd /opt/kdkmp-mbg && docker compose -f docker-compose.prod.yml up -d --build'
```

Bila build gagal, container lama tetap berjalan; perbaiki lalu ulangi langkah 4.

`data/db` di server adalah data hidup (diisi penjadwal), jadi jangan ditimpa dari mesin lokal.

Panduan memasang Observatorium KDKMP × MBG di VPS Linux dengan Docker, misalnya AWS Lightsail (yang sudah menjalankan n8n) atau Biznet Gio. Shared hosting tidak bisa dipakai karena collector butuh Chromium (Playwright).

Ada dua container:

| Container | Isi | Port |
|---|---|---|
| `app` | API Express + web hasil build React | `127.0.0.1:4000` (di belakang reverse proxy) |
| `scheduler` | Penjadwal collector (Playwright/Chromium), backup harian | tidak membuka port |

Keduanya berbagi folder `data/db` (tabel JSON). Collector juga menulis `data/raw` (respons mentah) dan `backups/`.

## 1. Kebutuhan

- VPS minimal 2 vCPU, 4 GB RAM, 20 GB disk (Chromium butuh ±1 GB RAM saat berjalan).
- Docker Engine 24+ dengan plugin `docker compose`.
- Domain atau subdomain yang mengarah ke IP VPS, misalnya `observatorium.contoh.id`.
- Alamat email kontak untuk User-Agent collector (wajib, BRIEF Bagian 10.4).

## 2. Ambil kode dan isi `.env`

```bash
git clone <repo> kdkmp-mbg && cd kdkmp-mbg
cp .env.example .env
```

Isi minimal di `.env`:

| Variabel | Isi |
|---|---|
| `CONTACT_EMAIL` | Email yang boleh dihubungi pengelola situs sumber. Tanpa ini semua job jaringan menolak jalan. |
| `ADMIN_TOKEN` | Token acak panjang untuk `/admin` dan `POST /api/admin/*`. Buat dengan `openssl rand -hex 32`. |
| `SITE_PASSWORD` | Password untuk membuka dasbor dan seluruh `/api` (kecuali `/api/health`). Kosongkan untuk situs terbuka. Cookie sesi berlaku 30 hari. |
| `N8N_WEBHOOK_URL` | URL webhook n8n untuk notifikasi kegagalan (lihat bagian 6). |
| `PLAYWRIGHT_CHANNEL`, `CHROME_PATH` | Biarkan kosong. Image `scheduler` sudah membawa Chromium. |

`CACHE_SECONDS` bawaan produksi 3600 (cache HTTP 1 jam untuk API publik).

## 3. Bangun, seed, dan jalankan

```bash
mkdir -p data/db data/raw backups
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm app node backend/scripts/seed.js
docker compose -f docker-compose.prod.yml up -d
```

Cek:

```bash
curl -s http://127.0.0.1:4000/api/health
# {"ok":true,"tanggal_data":"2026-10-15"}
```

Seed hanya membuat ulang baris seed; data dari collector dan admin tetap dipertahankan. Jadi seed aman diulang setelah memperbarui `data/seed/`.

### Isi data awal

Jalankan sekali agar pemetaan ID internal Simkopdes terbentuk sebelum jadwal bergilir berjalan:

```bash
S="docker compose -f docker-compose.prod.yml exec scheduler node collector/src/run.js"
$S nasional
$S provinsi 1 2 3 4 5 6      # sisanya diambil otomatis 6 provinsi per hari
$S provinsi --semua          # atau langsung semua 38 provinsi → 514 kab/kota terpetakan
$S kabupaten --semua         # semua halaman kab/kota → kecamatan se-Indonesia (±1–2 jam, bisa dilanjutkan)
$S cooptrade
$S microsite                 # kab pilot; berhenti rapi saat kuota harian habis, lanjut di run berikutnya
```

## 4. Reverse proxy dan HTTPS

Contoh Caddy (sertifikat otomatis), tambahkan ke `Caddyfile`:

```
observatorium.contoh.id {
    encode gzip
    reverse_proxy 127.0.0.1:4000
}
```

Contoh nginx (bila server sudah memakai nginx untuk n8n):

```nginx
server {
    server_name observatorium.contoh.id;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 443 ssl; # kelola dengan certbot
}
```

Halaman `/admin` dilindungi token. Bila ingin lapisan tambahan, batasi `/admin` dan `/api/admin` per IP di reverse proxy.

## 5. Jadwal collector

Penjadwal berjalan di container `scheduler`. Semua waktu WIB, dan job dijalankan berurutan (satu proses Playwright pada satu waktu).

```bash
docker compose -f docker-compose.prod.yml exec scheduler node collector/src/scheduler/index.js --list
```

| Job | Waktu (WIB) | Isi |
|---|---|---|
| `wilayah` | tanggal 1, 05.00 | Referensi wilayah Simkopdes (bulanan) |
| `nasional` | setiap hari 06.00 | Dasbor nasional + tabel 38 provinsi + 10 produk terlaris |
| `provinsi` | setiap hari 06.20 | 6 halaman provinsi bergilir (tiap provinsi ±mingguan) |
| `kabupaten-gresik` | Senin 07.00 | Pilot Kab. Gresik (sub-district 245) |
| `kabupaten-bergilir` | setiap hari 07.30 | 17 kab/kota bergilir (tiap kab/kota ±bulanan) |
| `cooptrade` | Rabu 09.00 | Katalog Coop Trade |
| `microsite-pilot` | setiap hari 10.00 | Profil koperasi kab pilot: Kebumen, Gresik, Kota Surabaya, Kab. Bangka. Maks. 500 request/hari; tiap koperasi diperbarui mingguan, slug tidak ditemukan dicoba lagi setelah 30 hari |
| `harga-pangan` | Kamis 08.00 | Harga 10 komoditas pokok, PIHPS Bank Indonesia (34 provinsi + kota survei) |
| `backup` | setiap hari 23.30 | Backup `data/db` |

Mengubah jadwal: edit `collector/src/scheduler/jadwal.js`, lalu `docker compose -f docker-compose.prod.yml up -d --build scheduler`.

Menjalankan satu job sekarang:

```bash
docker compose -f docker-compose.prod.yml exec scheduler node collector/src/scheduler/index.js --jalankan nasional
```

## 6. Notifikasi kegagalan (n8n)

1. Di n8n, buat workflow dengan node **Webhook** (metode POST). Salin URL produksinya ke `N8N_WEBHOOK_URL`.
2. Lanjutkan ke node email/Telegram/Slack sesuai kebutuhan. Payload yang dikirim:

   ```json
   { "sumber": "kdkmp-mbg-collector", "pesan": "Collector nasional diblokir: HTTP 403 dari simkopdes.go.id", "waktu": "2026-10-17T23:00:05.123Z" }
   ```

3. Uji dengan simulasi kegagalan:

   ```bash
   docker compose -f docker-compose.prod.yml exec scheduler node collector/src/run.js uji-gagal
   ```

   Pesan "Collector uji-gagal gagal: Simulasi kegagalan…" harus masuk ke n8n, dan halaman **Tentang data** menampilkan run berstatus `gagal`.

Notifikasi dikirim saat: run `gagal` atau `diblokir` (CAPTCHA, halaman kosong, HTTP 403/429), snapshot `perlu_cek` (jumlah wilayah tidak cocok dengan total), job melewati batas 2 jam, `CONTACT_EMAIL` kosong, atau backup gagal.

### Bila collector diblokir

Collector berhenti dan tidak mencoba lebih dari sekali per hari. Jangan mencoba melewati CAPTCHA. Jalur cadangan:

- Unduh data dari dasbor secara manual, lalu impor lewat `/admin` → **Impor CSV** → "Snapshot provinsi (format Lampiran A)".
- Snapshot yang jumlahnya tidak cocok dengan total nasional otomatis berstatus `perlu_cek` dan tidak tampil di publik.

Bila struktur halaman sumber berubah, perbaiki parser (`collector/src/parsers/`), perbarui fixture, lalu parse ulang HTML mentah tanpa mengambil ulang:

```bash
docker compose -f docker-compose.prod.yml exec scheduler node collector/src/run.js impor-raw 2026-10-17
```

## 7. Backup dan pemulihan

Backup harian ditulis ke `backups/data-db-YYYY-MM-DD.tar.gz` dan disimpan 14 hari (`BACKUP_KEEP_DAYS`). Salin ke luar server secara berkala, misalnya:

```bash
rsync -a backups/ user@server-cadangan:/arsip/kdkmp-mbg/
```

Pemulihan:

```bash
docker compose -f docker-compose.prod.yml stop app scheduler
tar -xzf backups/data-db-2026-10-17.tar.gz -C data/
docker compose -f docker-compose.prod.yml start app scheduler
```

`data/raw` (respons mentah) tidak ikut backup harian karena bisa besar. Arsipkan bulanan bila ingin bisa mem-parse ulang riwayat lama.

## 8. Pembaruan aplikasi

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm app node backend/scripts/seed.js   # bila data/seed berubah
```

Bila versi `playwright-core` di `collector/package.json` naik, samakan tag image `mcr.microsoft.com/playwright:v<versi>-noble` di `Dockerfile`.

## 9. Pemantauan

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=100 scheduler
curl -s http://127.0.0.1:4000/api/collector/status | head -c 600
```

Container `app` punya healthcheck ke `/api/health`.

## 10. Nanti: pindah ke PostgreSQL

1. Isi `POSTGRES_PASSWORD` dan `DATABASE_URL=postgres://kdkmp:<password>@db:5432/kdkmp` di `.env`.
2. Jalankan `docker compose -f docker-compose.prod.yml --profile db up -d db`.
3. Buat skema dari BRIEF Bagian 7, implementasikan ulang `backend/src/db/repo.js` dengan SQL, lalu migrasikan isi `data/db/*.json`.
4. Begitu `DATABASE_URL` terisi, `scripts/backup.js` otomatis memakai `pg_dump` (image `scheduler` sudah membawa `postgresql-client`).
