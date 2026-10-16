# Observatorium KDKMP × MBG

Observatorium data publik: apakah Koperasi Desa/Kelurahan Merah Putih yang sudah dibangun benar-benar beroperasi, dan seberapa siap menjadi pemasok dapur Makan Bergizi Gratis. Spesifikasi: [konsep/KDKMP_MBG_CLAUDE_CODE_BRIEF.md](konsep/KDKMP_MBG_CLAUDE_CODE_BRIEF.md). Aturan kerja: [CLAUDE.md](CLAUDE.md).

## Menjalankan

```bash
cp .env.example .env      # isi ADMIN_TOKEN bila perlu halaman /admin
npm install
npm run seed              # bangun data/db/*.json dari data/seed
npm run dev               # API http://localhost:4000/api, web http://localhost:5173
npm test                  # test collector + backend + typecheck frontend
npm run schedule -- --list  # jadwal collector (WIB)
```

Atau dengan Docker: `make up` (backend :4000, frontend :5173).

## Struktur

```
collector/   HTTP sopan (robots.txt, jeda 3 dtk, kuota), parseIdNumber, pembersih PII, target wilayah, builder GeoJSON
backend/     Express API (BRIEF Bagian 8), service indeks/kuadran/komposisi/celah, seed, admin
frontend/    React + Vite + TS + Leaflet (peta satelit): Lapis 1 Fakta, Lapis 2 Gap, Lapis 3 Simulasi, Tentang data, /admin
data/seed/   seed bersumber (snapshot 15 Okt 2026, rilis, asumsi, wilayah, GeoJSON)
data/db/     tabel JSON hasil seed + input admin/collector (di-gitignore)
data/raw/    respons mentah per sumber per tanggal (di-gitignore)
```

## Status fase

| Fase | Status |
|---|---|
| 0 Kerangka | Selesai (monorepo, docker-compose, Makefile, `.env.example`, CLAUDE.md) |
| 1 Data model & seed | Selesai, versi JSON. Migrasi PostgreSQL menyusul |
| 2 Collector | Selesai: wilayah, dasbor nasional/provinsi/kabupaten (Playwright), Coop Trade, microsite kab pilot Kebumen (prioritas), Gresik, Kota Surabaya, Kab. Bangka, deteksi blokir, `impor-raw` |
| 3 API backend | Selesai |
| 4–6 Frontend | Selesai: Ringkasan, Wilayah, Gap (Fisik vs usaha, Usaha & celah MBG, Ekosistem), Simulasi, Tentang data, admin. Halaman "Permintaan vs kesiapan" dihapus atas permintaan pemilik proyek (endpoint `/api/permintaan` tetap ada untuk dipakai lagi bila data SPPG per provinsi tersedia) |
| 7 Jadwal & deploy | Selesai: penjadwal (`npm run schedule -- --list`), webhook n8n, backup harian, `Dockerfile` + `docker-compose.prod.yml`, [DEPLOY.md](DEPLOY.md). Build image belum diuji di mesin ini |

## Pindah ke PostgreSQL nanti

Skema ada di BRIEF Bagian 7, dan nama tabel/kunci di `backend/src/db/store.js` sudah mengikutinya. Implementasikan ulang fungsi di `backend/src/db/repo.js` dengan query SQL; service dan route tidak berubah. Profil `db` di `docker-compose.yml` sudah menyiapkan `postgis/postgis:16`.
