/**
 * Parser halaman dasbor Simkopdes yang sudah dirender (/pers/dashboard, /district/{id}, /sub-district/{id}).
 * Selektor bertumpu pada label teks dan header tabel, bukan class CSS, agar tahan perubahan gaya.
 * Struktur diturunkan dari fixture di collector/test/fixtures (ditangkap 16 Okt 2026).
 */
import * as cheerio from 'cheerio';
import { parseIdNumber } from '../lib/parseIdNumber.js';

const clean = (s) => String(s ?? '').replace(/[ ⁠​﻿]/g, ' ').replace(/\s+/g, ' ').trim();

/** Angka persen di dasbor memakai titik desimal ("77.98", "89.1%"), berbeda dari kolom lain. */
export function parseDotDecimal(input) {
  const s = clean(input).replace(/%$/, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Ambil angka di awal teks, mis. "4.855Laporan" → 4855. */
function leadingNumber(text, { pct = false } = {}) {
  const t = clean(text);
  if (pct || /%$/.test(t)) return parseDotDecimal(t.match(/^[\d.]+%?/)?.[0] ?? '');
  const m = t.match(/^(Rp\s?)?[-−]?[\d.,]+/);
  return m ? parseIdNumber(m[0]) : null;
}

const KPI_LABEL = [
  [/^Total Koperasi$/, 'jumlah_koperasi'],
  [/^Koperasi Telah Memiliki Akun$/, 'punya_akun'],
  [/^Koperasi Memiliki NPWP$/, 'punya_npwp'],
  [/^Koperasi Memiliki NIB$/, 'punya_nib'],
  [/^Manajer Aktif$/, 'manajer_aktif'],
  [/^Simpanan Pokok$/, 'simpanan_pokok'],
  [/^Simpanan Wajib$/, 'simpanan_wajib'],
  [/^Volume Transaksi \(\d{4}\)$/, 'volume_transaksi'],
  [/^Nilai Transaksi \(\d{4}\)$/, 'nilai_transaksi'],
  [/^Koperasi Telah Melaksanakan RAT$/, 'rat_selesai'],
  [/^Total RAT dilaporkan$/, 'rat_dilaporkan'],
  [/^Total diverifikasi Dinas$/, 'rat_diverifikasi'],
  [/^Koperasi Sedang RAT \(draft\)$/, 'rat_draft'],
  [/^Koperasi Belum RAT$/, 'rat_belum'],
  [/^Lahan yang diajukan$/i, 'lahan_diajukan'],
  [/^Lahan Belum Diverifikasi$/i, 'lahan_belum_diverifikasi'],
  [/^Lahan Terverifikasi$/i, 'lahan_terverifikasi'],
  [/^Belum Mulai Pembangunan Fisik Gedung\/Gerai$/i, 'gerai_belum'],
  [/^Sedang Pembangunan Fisik Gedung\/Gerai$/i, 'gerai_proses'],
  [/^Selesai Pembangunan Fisik Gedung\/Gerai 100%$/i, 'gerai_selesai'],
  [/^Pembangunan Gerai$/, 'pembangunan_gerai_pct'],
];

const KOLOM_WILAYAH = {
  'Jumlah Koperasi': 'jumlah_koperasi',
  'Manajer Aktif': 'manajer_aktif',
  'Koperasi Memiliki NIB': 'punya_nib',
  'Koperasi Memiliki NPWP': 'punya_npwp',
  'Koperasi Telah RAT (2025)': 'rat_selesai',
  'Simpanan Pokok': 'simpanan_pokok',
  'Simpanan Wajib': 'simpanan_wajib',
  'Volume Transaksi (2026)': 'volume_transaksi',
  'Nilai Transaksi (2026)': 'nilai_transaksi',
  'Pemetahaan Lahan': 'pemetaan_lahan', // ejaan sesuai sumber
  'Pemetaan Lahan': 'pemetaan_lahan',
  'Pemetahaan Lahan (%)': 'pemetaan_lahan_pct',
  'Pemetaan Lahan (%)': 'pemetaan_lahan_pct',
  'Pembangunan Gerai (%)': 'pembangunan_gerai_pct',
};
const KOLOM_PCT = new Set(['pemetaan_lahan_pct', 'pembangunan_gerai_pct']);
const KOLOM_NAMA = /^(Provinsi|Kabupaten\/Kota|Kecamatan)$/;

function kpis($) {
  const out = {};
  const labels = $('p').filter((_, e) => $(e).children('p,div').length === 0);
  labels.each((_, el) => {
    const label = clean($(el).text());
    const hit = KPI_LABEL.find(([re]) => re.test(label));
    // "Pemetahaan Lahan" muncul dua kali di halaman provinsi: jumlah lalu persen.
    const isPemetaan = /^Pemet(ah)?aan Lahan$/.test(label);
    if (!hit && !isPemetaan) return;
    const siblings = $(el).parent().children('p').not(el);
    let value = null;
    siblings.each((__, s) => {
      if (value === null) value = leadingNumber($(s).text());
    });
    if (value === null) return;
    if (isPemetaan) {
      const isPct = siblings.toArray().some((s) => /%$/.test(clean($(s).text())));
      const key = isPct ? 'pemetaan_lahan_pct' : 'pemetaan_lahan';
      out[key] ??= value;
    } else {
      out[hit[1]] ??= value;
    }
  });
  return out;
}

function headers($, table) {
  return $(table).find('thead th').map((_, th) => clean($(th).text())).get();
}

function rows($, table) {
  return $(table)
    .find('tbody tr')
    .filter((_, tr) => !$(tr).hasClass('ant-table-measure-row') && !$(tr).hasClass('ant-table-placeholder'))
    .toArray();
}

function produkTerlaris($) {
  const table = $('table').filter((_, t) => headers($, t).includes('Nama Produk')).first();
  if (!table.length) return [];
  const h = headers($, table);
  const iNama = h.indexOf('Nama Produk');
  const iVol = h.findIndex((x) => /^Volume Transaksi/.test(x));
  const iNilai = h.findIndex((x) => /^Nilai Transaksi/.test(x));
  const iNo = h.indexOf('No');
  return rows($, table).map((tr, i) => {
    const td = $(tr).find('td').map((_, c) => clean($(c).text())).get();
    return {
      peringkat: iNo >= 0 ? parseIdNumber(td[iNo]) ?? i + 1 : i + 1,
      nama_produk: td[iNama],
      volume: parseIdNumber(td[iVol]),
      nilai: parseIdNumber(td[iNilai]),
    };
  }).filter((p) => p.nama_produk);
}

function tabelWilayah($) {
  const table = $('table').filter((_, t) => headers($, t).some((x) => KOLOM_NAMA.test(x))).first();
  if (!table.length) return { level: null, rows: [] };
  const h = headers($, table);
  const iNama = h.findIndex((x) => KOLOM_NAMA.test(x));
  const level = { Provinsi: 'provinsi', 'Kabupaten/Kota': 'kabupaten', Kecamatan: 'kecamatan' }[h[iNama]];
  const out = rows($, table).map((tr) => {
    const key = $(tr).attr('data-row-key') ?? '';
    const idMatch = key.match(/^(?:dist|sub|prov)-(\d+)$/);
    const td = $(tr).find('td').map((_, c) => clean($(c).text())).get();
    const row = { row_key: key, simkopdes_id: idMatch ? Number(idMatch[1]) : null, nama: td[iNama] };
    h.forEach((col, i) => {
      const f = KOLOM_WILAYAH[col];
      if (f) row[f] = KOLOM_PCT.has(f) ? parseDotDecimal(td[i]) : parseIdNumber(td[i]);
    });
    return row;
  }).filter((r) => r.nama);
  return { level, kolom: h, rows: out };
}

/** Tanggal data: <time datetime> di halaman nasional; selain itu tanggal pengambilan (WIB). */
function tanggalData($, fallback) {
  const dt = $('time[datetime]').first().attr('datetime');
  if (dt) return dt.slice(0, 10);
  const m = clean($('body').text()).match(/Data Berdasarkan:\s*(\d{1,2}) (\w+) (\d{4})/);
  const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
  if (m) {
    const bln = BULAN.indexOf(m[2].toLowerCase()) + 1;
    if (bln) return `${m[3]}-${String(bln).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return fallback;
}

/** "Provinsi: JAWA TIMUR/Kabupaten/Kota: KAB. GRESIK" → { provinsi, kabupaten } */
function konteks($) {
  // Teks bisa terpecah ke beberapa span; ambil elemen terpanjang (< 200 karakter) yang diawali "Provinsi:".
  const t = $('p,span,div,h1,h2,h3')
    .toArray()
    .map((e) => clean($(e).text()))
    .filter((x) => /^Provinsi:/.test(x) && x.length < 200)
    .sort((a, b) => b.length - a.length)[0] ?? '';
  const prov = t.match(/^Provinsi:\s*(.+?)(?:\/Kabupaten\/Kota:|$)/)?.[1]?.trim() ?? null;
  const kab = t.match(/Kabupaten\/Kota:\s*(.+)$/)?.[1]?.trim() ?? null;
  return { provinsi: prov, kabupaten: kab };
}

export function parseDashboard(html, { tanggalPengambilan } = {}) {
  const $ = cheerio.load(html);
  const wilayah = tabelWilayah($);
  return {
    tanggal_data: tanggalData($, tanggalPengambilan ?? null),
    konteks: konteks($),
    kpi: kpis($),
    produk_terlaris: produkTerlaris($),
    level_anak: wilayah.level,
    anak: wilayah.rows,
    kolom_anak: wilayah.kolom ?? [],
  };
}

/** Tanda bahwa halaman terisi (dipakai collector sebelum parse). */
export function halamanTerisi(parsed, { minAnak = 1 } = {}) {
  return parsed.kpi.jumlah_koperasi !== undefined && parsed.anak.length >= minAnak;
}
