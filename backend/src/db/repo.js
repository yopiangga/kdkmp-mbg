/**
 * Repository: satu-satunya lapisan yang tahu bentuk penyimpanan.
 * Saat pindah ke PostgreSQL, ganti implementasi fungsi-fungsi ini dengan query SQL;
 * service dan route tidak perlu berubah.
 */
export function createRepo(store) {
  const okSnapshots = () => store.all('kdkmp_snapshot').filter((r) => r.status === 'ok');
  const wilayahMap = () => new Map(store.all('wilayah').map((w) => [w.kode, w]));

  const repo = {
    store,

    // ---------- wilayah ----------
    wilayah(kode) {
      return wilayahMap().get(kode) ?? null;
    },
    anakWilayah(kode) {
      return store
        .all('wilayah')
        .filter((w) => w.parent_kode === kode)
        .sort((a, b) => a.kode.localeCompare(b.kode));
    },
    leluhur(kode) {
      const map = wilayahMap();
      const out = [];
      let cur = map.get(kode);
      while (cur) {
        out.unshift({ kode: cur.kode, nama: cur.nama, level: cur.level });
        cur = cur.parent_kode ? map.get(cur.parent_kode) : null;
      }
      return out;
    },
    wilayahByLevel(level) {
      return store.all('wilayah').filter((w) => w.level === level);
    },

    // ---------- snapshot ----------
    tanggalTerakhir(kode = 'ID') {
      const dates = okSnapshots().filter((r) => r.kode === kode).map((r) => r.tanggal_data).sort();
      return dates.at(-1) ?? null;
    },
    snapshot(kode, tanggal) {
      return okSnapshots().find((r) => r.kode === kode && r.tanggal_data === tanggal) ?? null;
    },
    /** Snapshot terbaru yang tanggalnya ≤ tanggal (dipakai bila anak wilayah punya tanggal berbeda). */
    snapshotTerbaru(kode, tanggal) {
      return (
        okSnapshots()
          .filter((r) => r.kode === kode && (!tanggal || r.tanggal_data <= tanggal))
          .sort((a, b) => a.tanggal_data.localeCompare(b.tanggal_data))
          .at(-1) ?? null
      );
    },
    /** Snapshot terakhir yang berumur ≥ `hari` hari sebelum `tanggal`, untuk delta KPI. */
    snapshotSebelum(kode, tanggal, hari = 7) {
      const batas = new Date(`${tanggal}T00:00:00Z`);
      batas.setUTCDate(batas.getUTCDate() - hari);
      const iso = batas.toISOString().slice(0, 10);
      return repo.snapshotTerbaru(kode, iso);
    },
    seriSnapshot(kode, field, dari, sampai) {
      return okSnapshots()
        .filter((r) => r.kode === kode && r[field] !== null && r[field] !== undefined)
        .filter((r) => (!dari || r.tanggal_data >= dari) && (!sampai || r.tanggal_data <= sampai))
        .sort((a, b) => a.tanggal_data.localeCompare(b.tanggal_data))
        .map((r) => ({ tanggal: r.tanggal_data, nilai: r[field], sumber_url: r.sumber_url }));
    },
    snapshotsPerTanggal(kodeList, tanggal) {
      return kodeList.map((k) => repo.snapshotTerbaru(k, tanggal));
    },
    insertSnapshots(rows) {
      return store.upsert('kdkmp_snapshot', rows);
    },

    // ---------- produk ----------
    produkTerlaris(kode, tanggal) {
      const rows = store.all('kdkmp_produk_terlaris').filter((r) => r.kode === kode);
      const t = tanggal
        ? rows.map((r) => r.tanggal_data).filter((d) => d <= tanggal).sort().at(-1)
        : rows.map((r) => r.tanggal_data).sort().at(-1);
      return rows.filter((r) => r.tanggal_data === t).sort((a, b) => a.peringkat - b.peringkat);
    },
    tanggalProdukTerlaris(kode) {
      return [...new Set(store.all('kdkmp_produk_terlaris').filter((r) => r.kode === kode).map((r) => r.tanggal_data))].sort();
    },
    kodeDenganProduk() {
      return [...new Set(store.all('kdkmp_produk_terlaris').map((r) => r.kode))];
    },
    polaKelompok() {
      return store.all('produk_kelompok');
    },

    // ---------- rilis ----------
    rilis({ indikator, kode_wilayah, status } = {}) {
      return store
        .all('rilis_angka')
        .filter((r) => (!indikator || r.indikator === indikator))
        .filter((r) => (!kode_wilayah || r.kode_wilayah === kode_wilayah))
        .filter((r) => (!status || r.status === status))
        .sort((a, b) => a.per_tanggal.localeCompare(b.per_tanggal));
    },
    rilisTerakhir(indikator, kode_wilayah = 'ID') {
      return repo.rilis({ indikator, kode_wilayah, status: 'terverifikasi' }).at(-1) ?? null;
    },
    insertRilis(row) {
      const id = store.nextId('rilis_angka');
      const full = { id, ...row, dibuat_pada: new Date().toISOString() };
      store.upsert('rilis_angka', [full]);
      return full;
    },
    updateRilis(id, patch) {
      const row = store.all('rilis_angka').find((r) => r.id === id);
      if (!row) return null;
      const next = { ...row, ...patch };
      store.upsert('rilis_angka', [next]);
      return next;
    },

    // ---------- harga pangan ----------
    /** Harga terbaru per komoditas untuk satu wilayah (jenis pasar tradisional). */
    hargaTerbaru(kode) {
      const rows = store.all('harga_pangan').filter((r) => r.kode === kode);
      const terakhir = new Map();
      for (const r of rows) {
        const k = `${r.komoditas}|${r.jenis_pasar}`;
        if (!terakhir.has(k) || terakhir.get(k).tanggal_data < r.tanggal_data) terakhir.set(k, r);
      }
      return [...terakhir.values()];
    },
    kodeDenganHarga() {
      return [...new Set(store.all('harga_pangan').map((r) => r.kode))];
    },

    // ---------- lain-lain ----------
    asumsi() {
      return store.all('asumsi_simulasi');
    },
    collectorRuns() {
      return store.all('collector_runs');
    },
    cooptradeRingkasan() {
      return [...store.all('cooptrade_ringkasan')].sort((a, b) => a.tanggal_data.localeCompare(b.tanggal_data));
    },
    cooptradeProduk(tanggal) {
      return store.all('cooptrade_produk_snapshot').filter((r) => !tanggal || r.tanggal_data === tanggal);
    },
    koperasi(kode_kecamatan, kode_kab) {
      return store.all('kdkmp_koperasi')
        .filter((r) => !kode_kecamatan || r.kode_kecamatan === kode_kecamatan)
        .filter((r) => !kode_kab || String(r.kode_kecamatan ?? '').startsWith(`${kode_kab}.`));
    },
  };
  return repo;
}
