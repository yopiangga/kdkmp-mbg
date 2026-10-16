# CLAUDE.md — Observatorium KDKMP × MBG

Spesifikasi lengkap: `konsep/KDKMP_MBG_CLAUDE_CODE_BRIEF.md` (disebut BRIEF). Kerjakan per fase (BRIEF Bagian 11) dan jangan lanjut ke fase berikutnya tanpa diminta.

## Stack (menggantikan BRIEF Bagian 5 atas keputusan pemilik proyek, 16 Okt 2026)

- **frontend/**: React 18 + Vite + TypeScript, ECharts, Leaflet (basemap satelit Esri World Imagery / OpenStreetMap, atas permintaan pemilik proyek 16 Okt 2026), ikon Lucide. Font Plus Jakarta Sans + IBM Plex Mono.
- **backend/**: Express (JavaScript ESM). API sesuai BRIEF Bagian 8, dengan `meta: { tanggal_data, sumber, label_asal }` di setiap respons.
- **Data**: sementara **file JSON** di `data/db/<tabel>.json`. Nama tabel dan kunci primer mengikuti skema PostgreSQL di BRIEF Bagian 7 (`backend/src/db/store.js`). Hanya `backend/src/db/repo.js` yang tahu bentuk penyimpanan; saat pindah ke PostgreSQL + PostGIS, ganti modul itu saja.
- **collector/**: Node 20. Menulis respons mentah ke `data/raw/{sumber}/{YYYY-MM-DD}/` sebelum diparse, dan mencatat run ke `collector_runs`.
- Admin memakai token Bearer `ADMIN_TOKEN` (pengganti Laravel Sanctum sementara).
- `data/seed/` = sumber kebenaran seed; `data/db/` dibangun ulang dengan `npm run seed` (baris dari admin/collector dipertahankan).

Perintah collector: `npm run collect -- <wilayah|nasional|provinsi [id..]|kabupaten [id..]|cooptrade|microsite [--limit N]|impor-raw YYYY-MM-DD>`.

Jadwal: `collector/src/scheduler/jadwal.js` (WIB), daemon `npm run schedule`, daftar `npm run schedule -- --list`. Deploy: `DEPLOY.md`.

Perintah: `npm install`, `npm run seed`, `npm run dev` (API :4000, web :5173), `npm test`, `npm run collect -- <target>`, `make geo`.

## Sumber data dan collector (ringkasan BRIEF Bagian 6)

Prinsip: ambil lewat HTTP langsung hanya untuk endpoint yang memang terbuka. Untuk yang dilindungi, baca halaman yang sudah dirender seperti pengunjung biasa, dengan frekuensi rendah. Kalau diblokir, berhenti dan pakai impor manual.

| Sumber | Cara | Frekuensi |
|---|---|---|
| `simkopdes.go.id/data/wilayah/index.json` (38 prov, 514 kab/kota) | HTTP langsung | Bulanan; simpan versi baru bila `generated_at` berubah |
| Kecamatan/desa + batas poligon | `cahyadsn/wilayah`, `cahyadsn/wilayah_boundaries` (MIT, cantumkan atribusi) | Sekali |
| Microsite `POST /api/getCooperativeBySlug`, `getCooperativeProductsBySlug` | HTTP langsung, terbatas | Mingguan per koperasi yang dikenal |
| `/pers/dashboard`, `/pers/dashboard/district/{id_prov}`, `/pers/dashboard/sub-district/{id_kab}` | Playwright, baca teks DOM | Harian 06.00 WIB / mingguan bergilir / bulanan bergilir (Gresik `245` mingguan) |
| Pemetaan lahan | Dari DOM halaman dasbor yang sama; jangan panggil `pemetaan-lahan.portalkdkmp.id` langsung | Ikut dasbor |
| Coop Trade `trade.simkopdes.go.id/search` | Playwright | Mingguan |
| MBG (BGN, Kemenkeu, Bapanas) | Input admin / impor CSV PPID; ekstraksi otomatis = draf | Saat ada rilis |
| Harga pangan (opsional) | Hanya lewat API/unduhan resmi; kalau tidak ada, tunda | — |

Catatan teknis penting:
- Microsite: hanya pilot Kab. Gresik; kandidat slug dari nama desa Kemendagri (huruf kecil, spasi → `-`); 404 dicatat `slug_tidak_ditemukan` tanpa mencoba variasi agresif. **Jangan menebak slug massal.** Jeda ≥ 3 detik, maks 500 request/hari, `User-Agent: KDKMP-MBG-Observatorium/0.1 (+<CONTACT_EMAIL>)`.
- Field microsite yang dibuang di memori dan tidak pernah ditulis: `members[].name`, `managements[].*`, `distinct_managements[].name`. Dari `members` simpan hanya `jumlah_anggota`, `anggota_laki`, `anggota_perempuan` (`collector/src/lib/sanitize.js`). JSON mentah di `data/raw` juga harus sudah bersih.
- API `api.simkopdes.go.id/*` mengembalikan data terenkripsi dan halamannya memuat reCAPTCHA v3 + Cap.js → **jangan dipanggil**; klien HTTP menolaknya.
- `{id_prov}`/`{id_kab}` adalah ID internal Simkopdes (15 = Jawa Timur, 245 = Kab. Gresik). Pemetaan ke kode Kemendagri disimpan di `simkopdes_wilayah_map`; yang tidak cocok masuk antrean verifikasi manual.
- Langkah pertama Playwright: simpan HTML hasil render sebagai fixture di `collector/test/fixtures`, lalu tulis parser dari fixture. Angka format Indonesia diurai `parseIdNumber()`.
- Validasi: jumlah 38 provinsi = total nasional (toleransi 0); kalau tidak, snapshot `perlu_cek` dan tidak dipublikasikan.
- CAPTCHA, halaman kosong, atau HTTP 403/429: hentikan run, catat `diblokir` di `collector_runs`, kirim notifikasi (`N8N_WEBHOOK_URL`), jangan coba ulang lebih dari 1 kali hari itu. Jalur cadangan: impor CSV admin.

### Temuan struktur sumber (fixture 16 Okt 2026, `collector/test/fixtures`)

- Baris tabel provinsi tidak punya `href`; nama provinsi berupa tombol (`data-row-key="prov-ACEH"`). ID internal provinsi = urutan kode Kemendagri (1 = Aceh/11, 15 = Jatim/35, 38 = Papua Barat Daya/96). Collector provinsi membuka `/district/1..38` bergilir dan memverifikasi lewat teks "Provinsi: …" sebelum menyimpan pemetaan.
- Baris kab/kota dan kecamatan memuat ID internal di `data-row-key` (`dist-245`, `sub-6881`), dan pemetaannya disimpan otomatis.
- Kolom persen (`Pemetahaan Lahan (%)`, `Pembangunan Gerai (%)`) memakai titik desimal → `parseDotDecimal`, bukan `parseIdNumber`.
- Gerai % dan pemetaan lahan hanya ada sampai level provinsi; manajer aktif sampai kab/kota. Indeks kab/kota = 4 komponen, kecamatan = 3 komponen; matriks fisik vs usaha hanya level provinsi.
- KPI "Volume Transaksi" nasional tidak sama dengan jumlah per provinsi di sumbernya, sehingga tidak ikut validasi.
- Tabel kab/kota dan kecamatan berpaginasi 10 baris; `expandPagination` memilih ukuran halaman maksimum.
- Kab pilot (microsite + halaman kecamatan mingguan), urut prioritas: Kebumen 33.05 (prioritas pemilik proyek), Gresik 35.25, Kota Surabaya 35.78, Kab. Bangka 19.01 — `PILOT_MICROSITE` di `collector/src/targets/microsite.js`.
- Slug microsite: `<desa>-kecamatan-<kecamatan>` (pola nyata), cadangan satu kali `<desa>`. Respons 200 berisi profil di level atas (tanpa bungkus `data`), produk berupa array, penduduk di `village.total_population`.

### Sumber tambahan yang diperiksa (16 Okt 2026)

- **BGN Radar MBG** (`bgn.go.id/radar-mbg`): halaman instansi menampilkan SPPG penyedia, tetapi daftar wilayah/instansi dimuat lewat API yang dijaga Cloudflare Turnstile ("Verifikasi gagal" di browser otomatis) dan tidak ada sitemap. **Tidak dikumpulkan** (aturan 10.2). Data SPPG per wilayah lewat rilis/PPID + impor admin.
- **Panel Harga Bapanas**: endpoint referensi terbuka, endpoint harga mensyaratkan API key → tidak dipakai sampai ada kunci resmi (jangan ambil kunci dari bundle JS, aturan 10.1).
- **PIHPS Bank Indonesia** (`bi.go.id/hargapangan`): endpoint JSON publik (`GetRefProvince`, `GetRefRegency`, `GetRefCommodityAndCategory`, `GetGridDataDaerah`), robots.txt mengizinkan. Dipakai target `harga` (mingguan). Angka berformat en-US (`15,800`). Cakupan 34 provinsi lama + kota survei saja; kab/kota lain memakai pendekatan provinsi + 2 kota survei terdekat.
- **BPS WebAPI**: butuh kunci pendaftaran; belum dipakai.

## Aturan data dan etika (BRIEF Bagian 10 — wajib, tanpa pengecualian)

1. Jangan membongkar, mendekripsi, atau mengakali enkripsi respons API Simkopdes, dan jangan mengambil kunci atau logika dekripsi dari bundle JavaScript.
2. Jangan menyelesaikan, melewati, atau memalsukan CAPTCHA (reCAPTCHA, Cap.js, atau sejenisnya). Kalau diblokir, berhenti dan beri notifikasi.
3. Jangan menyimpan data pribadi: nama anggota, pengurus, pengawas, foto profil, atau NIK. Hitung agregatnya di memori lalu buang.
4. Batasi frekuensi: jeda ≥ 3 detik antar request ke domain yang sama, kuota harian per target, satu proses Playwright pada satu waktu, dan User-Agent yang jujur beserta kontak.
5. Periksa `robots.txt` setiap domain di awal run, dan patuhi.
6. Setiap angka di UI memiliki sumber, tanggal, dan label asal. Angka estimasi atau simulasi tidak boleh tampil tanpa badge.
7. Angka dari ekstraksi otomatis rilis berita selalu berstatus `draf` sampai dikonfirmasi admin.
8. Gunakan bahasa netral di UI. Jangan memakai label seperti "gagal" untuk wilayah; pakai deskripsi, misalnya "transaksi rendah relatif terhadap kesiapan fisik".
9. Cantumkan atribusi: "Sumber: Simkopdes, Kementerian Koperasi", BGN, Kemenkeu, Bapanas, dan Kemendagri sesuai data yang dipakai.
10. Kalau Kemenkop atau BGN menerbitkan API atau dataset resmi, ganti jalur Playwright dengan sumber resmi itu.

## Konvensi UI

- Gaya visual (16 Okt 2026, atas permintaan pemilik proyek): kanvas abu kebiruan, kartu putih radius 24–32px dengan bayangan lembut, navigasi atas bergaris bawah + kolom cari wilayah (`/api/cari`), badge dan tombol berbentuk pil, aksen merah KDKMP dan navy. Token di `frontend/src/styles/tokens.css` (terang/gelap).
- Ringkasan = dasbor ringkas: kartu Kesiapan (lolipop tahapan), Wilayah perlu perhatian, Kabupaten pilot (`/api/pilot`), ajakan Simulasi, Dari koperasi ke dapur MBG, Temuan.

- Setiap KPI, grafik, dan tabel memakai `BadgeAsal` (Resmi / Rilis / Estimasi / Indeks) dan catatan kaki sumber + tanggal.
- Tanpa emoji; pakai ikon Lucide. Judul halaman berupa temuan yang dihitung dari data.
- Angka prototipe "Jejaring" (21.102 SPPG, 58,3 juta penerima, Rp18 T, rincian per provinsi) adalah data lama/ilustratif — jangan dipakai.
- Klaim "Perpres 115/2025 Pasal 38" belum diverifikasi ke JDIH, jadi tidak ditampilkan.
- Halaman harus lolos di lebar 375px tanpa scroll horizontal halaman.
