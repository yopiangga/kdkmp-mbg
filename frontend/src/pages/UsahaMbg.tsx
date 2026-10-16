import { useCallback, useState } from 'react';
import type { Celah, Harga, Komposisi, Resp } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka, persen, rupiah, rupiahSingkat, tanggal } from '../lib/format';
import { Chart, tooltipBase, type Palet } from '../components/Chart';
import { Card, ErrorState, Loading, PageHead, Placeholder, SIMKOPDES, Sumber } from '../components/common';
import { BadgeAsal } from '../components/BadgeAsal';


interface Segmen {
  key: string;
  label: string;
  nilai: number;
  pct: number;
  css: string;
  warna: (p: Palet) => string;
}

export function UsahaMbg() {
  const [kodeKomp, setKodeKomp] = useState('ID');
  const komp = useApi<Resp<Komposisi>>(`/api/usaha/komposisi?kode=${kodeKomp}`);
  const daftarKomp = useApi<Resp<{ kode: string; nama: string; level: string; provinsi: string | null }[]>>('/api/usaha/wilayah');
  const grupKomp = (() => {
    const list = daftarKomp.data?.data ?? [{ kode: 'ID', nama: 'Indonesia', level: 'nasional', provinsi: null }];
    const grup: [string, { kode: string; nama: string }[]][] = [
      ['Nasional', list.filter((w) => w.level === 'nasional').map((w) => ({ kode: w.kode, nama: 'Nasional' }))],
      ['Provinsi', list.filter((w) => w.level === 'provinsi')],
    ];
    const kab = list.filter((w) => w.level === 'kabupaten');
    for (const prov of [...new Set(kab.map((w) => w.provinsi ?? 'Lainnya'))]) {
      grup.push([`Kab/kota · ${prov}`, kab.filter((w) => (w.provinsi ?? 'Lainnya') === prov)]);
    }
    return grup.filter(([, l]) => l.length);
  })();
  const [kabPilihan, setKab] = useState('33.05'); // Kebumen: wilayah prioritas
  const kabList = useApi<Resp<{ kode: string; nama: string; provinsi: string | null }[]>>('/api/wilayah-berdata/kabupaten');
  const tersedia = kabList.data?.data ?? [];
  const kab = !tersedia.length || tersedia.some((k) => k.kode === kabPilihan) ? kabPilihan : tersedia.find((k) => k.kode === '35.25')?.kode ?? tersedia[0].kode;
  const kabGrup = Object.entries(
    (kabList.data?.data ?? [{ kode: '35.25', nama: 'Kabupaten Gresik', provinsi: 'Jawa Timur' }]).reduce<Record<string, { kode: string; nama: string }[]>>((acc, k) => {
      (acc[k.provinsi ?? 'Lainnya'] ??= []).push(k);
      return acc;
    }, {}),
  );
  const celah = useApi<Resp<Celah>>(`/api/celah-mbg?kode_kab=${kab}`);
  const harga = useApi<Resp<Harga>>(`/api/harga?kode=${kab}`);
  const coop = useApi<Resp<{
    ringkasan: { tanggal_data: string; jumlah_produk: number; jumlah_terjual: number; jumlah_koperasi?: number; sumber_url: string }[];
    produk: { produk: string; nama_koperasi: string; harga: number | null; kabupaten: string | null; terjual: number | null; url?: string }[];
  }>>('/api/cooptrade');

  const k = komp.data?.data;
  const segmen: Segmen[] = [];
  if (k?.total_transaksi) {
    const find = (key: string) => k.kelompok.find((x) => x.kelompok === key)!;
    const defs: [string, string, (p: Palet) => string][] = [
      ['program', 'var(--series-1)', (p) => p.series[0]],
      ['sembako', 'var(--series-2)', (p) => p.series[1]],
      ['segar_protein', 'var(--series-3)', (p) => p.series[2]],
    ];
    for (const [key, css, warna] of defs) {
      const g = find(key);
      segmen.push({ key, label: g.label, nilai: g.nilai, pct: g.porsi_total_pct ?? 0, css, warna });
    }
    const sisa = k.total_transaksi - k.total_top + find('lainnya').nilai;
    segmen.push({ key: 'sisa', label: 'Lainnya dan di luar 10 terlaris', nilai: sisa, pct: (sisa / k.total_transaksi) * 100, css: 'var(--series-other)', warna: (p) => p.other });
  }

  const build = useCallback(
    (p: Palet) => ({
      grid: { left: 4, right: 4, top: 4, bottom: 4 },
      tooltip: { ...tooltipBase(p), trigger: 'item', formatter: (x: { seriesName: string; value: number; data: { nilai: number } }) => `<strong>${x.seriesName}</strong><br/>${persen(x.value, 2)} · ${rupiahSingkat(x.data.nilai)}` },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: { type: 'category', show: false, data: ['Nasional'] },
      series: segmen.map((s, i) => ({
        name: s.label,
        type: 'bar',
        stack: 'total',
        barWidth: 36,
        data: [{ value: s.pct, nilai: s.nilai }],
        itemStyle: {
          color: s.warna(p),
          borderColor: p.surface,
          borderWidth: 2,
          borderRadius: i === 0 ? [4, 0, 0, 4] : i === segmen.length - 1 ? [0, 4, 4, 0] : 0,
        },
        label: { show: s.pct >= 8, formatter: () => persen(s.pct, 0), color: s.key === 'sisa' ? p.ink : '#fff', fontWeight: 600, fontSize: 12 },
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [k],
  );

  if (komp.error) return <ErrorState message={komp.error} />;
  if (!k) return <Loading />;
  const segar = segmen.find((s) => s.key === 'segar_protein');
  const c = celah.data?.data;
  const rn = c?.ringkasan_nasional;
  const ct = coop.data?.data.ringkasan.at(-1);
  const ctPrev = coop.data?.data.ringkasan.at(-2);
  const ctProduk = [...(coop.data?.data.produk ?? [])].sort((a, b) => (b.terjual ?? 0) - (a.terjual ?? 0));
  const namaKomp = k.wilayah.level === 'nasional' ? 'nasional' : k.wilayah.nama;

  return (
    <>
      <PageHead
        eyebrow="Lapis 2 · Gap · Usaha & celah MBG"
        title={`Pangan segar dan protein baru ${persen(segar?.pct ?? null, 2)} dari transaksi koperasi`}
        lede="Komposisi usaha menunjukkan apa yang sudah dijual koperasi. Porsi pangan segar dan protein adalah indikator utama masuknya koperasi ke rantai pasok dapur MBG."
      />

      <div className="split">
        <Card
          title={`Komposisi nilai transaksi menurut kelompok produk (${namaKomp})`}
          asal="Resmi"
          action={
            <select className="input" style={{ maxWidth: 220 }} value={kodeKomp} onChange={(e) => setKodeKomp(e.target.value)} aria-label="Pilih wilayah komposisi">
              {grupKomp.map(([label, list]) => (
                <optgroup key={label} label={label}>
                  {list.map((w) => <option key={w.kode} value={w.kode}>{w.nama}</option>)}
                </optgroup>
              ))}
            </select>
          }
          foot={<Sumber nama={SIMKOPDES} url="https://simkopdes.go.id/pers/dashboard" tanggal={k.tanggal_data}><span>· 10 produk terlaris mencakup {persen(k.cakupan_pct)} nilai transaksi</span></Sumber>}
        >
          <Chart build={build} height={48} ariaLabel="Batang bertumpuk 100% komposisi transaksi per kelompok produk" />
          <div className="legend" style={{ marginTop: 8 }}>
            {segmen.map((s) => (
              <span key={s.key}><span className="swatch" style={{ background: s.css }} />{s.label} <span className="num">{persen(s.pct, s.pct < 1 ? 2 : 1)}</span></span>
            ))}
          </div>
          <h3 className="card-title" style={{ marginTop: 18 }}>Tren porsi pangan segar dan protein</h3>
          {k.tren_segar_protein.cukup ? null : (
            <p className="small muted">
              Riwayat mulai dikumpulkan sejak {tanggal(k.tren_segar_protein.titik[0]?.tanggal)} ({k.tren_segar_protein.titik.length} titik). Grafik tren tampil setelah 3 snapshot.
            </p>
          )}
        </Card>

        <Card title="Skala celah nasional" asal={['Resmi', 'Rilis', 'Estimasi']} foot={rn?.penerima ? <Sumber nama="Kemenkeu, APBN KiTa" url={rn.penerima.sumber_url} tanggal={rn.penerima.tanggal} /> : undefined}>
          {rn && rn.kebutuhan_harian ? (
            <>
              <div className="small ink-2">Kebutuhan bahan baku MBG per hari <BadgeAsal asal="Estimasi" /></div>
              <div className="stat-big">{rupiahSingkat(rn.kebutuhan_harian)}</div>
              <div className="xs muted" style={{ marginBottom: 12 }}>
                {angka(rn.penerima!.nilai)} penerima × {rupiah(rn.biaya_per_porsi)} × {persen(rn.porsi_bahan_baku * 100, 0)} bahan baku
              </div>
              <div className="small ink-2">Transaksi seluruh koperasi sepanjang 2026 <BadgeAsal asal="Resmi" /></div>
              <div className="stat-big">{rupiahSingkat(rn.nilai_transaksi_koperasi)}</div>
              <div className="small" style={{ marginTop: 10 }}>
                Setara <strong className="num">{angka(rn.setara_hari, 2)} hari</strong> kebutuhan bahan baku MBG <BadgeAsal asal="Estimasi" />
              </div>
              <p className="xs muted">{rn.catatan}</p>
            </>
          ) : (
            <Placeholder>Data penerima MBG belum tersedia.</Placeholder>
          )}
        </Card>
      </div>

      <div className="grid grid-2 section">
        <Card title={`10 produk terlaris ${namaKomp}`} asal="Resmi" foot={<Sumber nama={SIMKOPDES} tanggal={k.tanggal_data} />}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th className="r">#</th><th>Produk</th><th>Kelompok</th><th className="r">Volume</th><th className="r">Nilai</th></tr>
              </thead>
              <tbody>
                {k.produk.map((p) => (
                  <tr key={p.peringkat}>
                    <td className="r num muted">{p.peringkat}</td>
                    <td>{p.nama_produk}</td>
                    <td className="small">{k.label_kelompok[p.kelompok ?? 'lainnya']}</td>
                    <td className="r num">{angka(p.volume)}</td>
                    <td className="r num">{rupiahSingkat(p.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Katalog B2B Coop Trade" asal="Resmi" foot={ct ? <Sumber nama="Coop Trade" url={ct.sumber_url} tanggal={ct.tanggal_data} /> : undefined}>
          {ct ? (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div><div className="small ink-2">Produk terdaftar</div><div className="stat-big">{angka(ct.jumlah_produk)}</div></div>
              <div><div className="small ink-2">Unit terjual</div><div className="stat-big">{angka(ct.jumlah_terjual)}</div></div>
              {ct.jumlah_koperasi !== undefined && <div><div className="small ink-2">Koperasi penjual</div><div className="stat-big">{angka(ct.jumlah_koperasi)}</div></div>}
            </div>
          ) : <Placeholder />}
          {ct && ctPrev && (
            <p className="xs muted">Per {tanggal(ctPrev.tanggal_data)}: {angka(ctPrev.jumlah_produk)} produk, {angka(ctPrev.jumlah_terjual)} terjual.</p>
          )}
          {ctProduk.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: 260 }}>
              <table className="data">
                <thead><tr><th>Produk</th><th>Kab/kota</th><th className="r">Harga</th><th className="r">Terjual</th></tr></thead>
                <tbody>
                  {ctProduk.map((p) => (
                    <tr key={`${p.nama_koperasi}|${p.produk}`}>
                      <td title={p.nama_koperasi}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.produk}</a> : p.produk}</td>
                      <td className="small">{p.kabupaten ?? '–'}</td>
                      <td className="r num">{p.harga ? rupiah(p.harga) : '–'}</td>
                      <td className="r num">{angka(p.terjual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">Rincian per produk tampil setelah collector Coop Trade berjalan.</p>
          )}
        </Card>
      </div>

      <section className="section">
        <HargaCard harga={harga.data?.data ?? null} />
      </section>

      <section className="section">
        <Card
          title="Celah pasok per kecamatan"
          asal={['Resmi', 'Estimasi']}
          action={
            <select className="input" style={{ maxWidth: 220 }} value={kab} onChange={(e) => setKab(e.target.value)} aria-label="Pilih kabupaten">
              {kabGrup.map(([prov, list]) => (
                <optgroup key={prov} label={prov}>
                  {list.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
                </optgroup>
              ))}
            </select>
          }
          foot={<Sumber nama={SIMKOPDES} url="https://simkopdes.go.id/pers/dashboard" tanggal={c?.kecamatan?.tanggal_data ?? null}>
            {c?.kecamatan && <span>· data {c.kecamatan.cakupan.ada} dari {c.kecamatan.cakupan.total} kecamatan</span>}
          </Sumber>}
        >
          <p className="small muted" style={{ marginTop: 0 }}>
            Kolom SPPG dan kebutuhan terisi setelah data SPPG per kecamatan tersedia dari rilis BGN atau permohonan informasi PPID.
          </p>
          {c?.kecamatan ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Kecamatan</th><th className="r">Koperasi</th><th className="r">Transaksi 2026</th><th className="r">Per koperasi</th><th>SPPG</th><th>Kebutuhan/hari</th><th>Setara hari</th></tr>
                </thead>
                <tbody>
                  {c.kecamatan.rows.map((r) => (
                    <tr key={r.kode}>
                      <td>{r.nama}</td>
                      {r.status_data === 'ada' ? (
                        <>
                          <td className="r num">{angka(r.jumlah_koperasi)}</td>
                          <td className="r num">{rupiahSingkat(r.nilai_transaksi)}</td>
                          <td className="r num">{rupiahSingkat(r.trx_per_kop)}</td>
                        </>
                      ) : (
                        <td colSpan={3}><span className="tag-missing">belum dikumpulkan</span></td>
                      )}
                      <td>{r.sppg !== null ? <span className="num">{angka(r.sppg)}</span> : <span className="tag-missing">[DATA SPPG]</span>}</td>
                      <td>{r.kebutuhan_harian !== null ? <span className="num">{rupiahSingkat(r.kebutuhan_harian)}</span> : <span className="tag-missing">[ESTIMASI]</span>}</td>
                      <td>{r.setara_hari !== null ? <span className="num">{angka(r.setara_hari, 2)}</span> : <span className="tag-missing">[ESTIMASI]</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : celah.error ? <ErrorState message={celah.error} /> : <Loading />}
        </Card>
      </section>
    </>
  );
}

const PERAN: Record<string, string> = { wilayah: '', provinsi: 'rata-rata provinsi', kota_survei_terdekat: 'kota survei terdekat' };

/** Harga 10 komoditas pokok MBG di pasar tradisional (PIHPS Bank Indonesia). */
function HargaCard({ harga }: { harga: Harga | null }) {
  if (!harga) return null;
  return (
    <Card
      title={`Harga pangan pokok di sekitar ${harga.wilayah.nama}`}
      asal="Resmi"
      foot={<Sumber nama="PIHPS Nasional, Bank Indonesia" url="https://www.bi.go.id/hargapangan" tanggal={harga.tanggal_data}><span>· pasar tradisional, harga per kg</span></Sumber>}
    >
      {harga.catatan && <p className="small muted" style={{ marginTop: 0 }}>{harga.catatan}</p>}
      {harga.kolom.length === 0 ? (
        <Placeholder label="DATA HARGA BELUM TERSEDIA" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Komoditas</th>
                {harga.kolom.map((c) => (
                  <th key={c.kode} className="r" style={{ whiteSpace: 'normal', minWidth: 110 }}>
                    {c.nama}
                    {PERAN[c.peran] && <div className="xs muted" style={{ fontWeight: 400 }}>{PERAN[c.peran]}{c.jarak_km !== undefined ? ` · ${c.jarak_km} km` : ''}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {harga.komoditas.map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  {harga.kolom.map((c) => {
                    const h = c.harga.find((x) => x.komoditas === k);
                    return (
                      <td key={c.kode} className="r num" title={h?.rata_rata_7_hari ? `Rata-rata 7 hari: ${rupiah(h.rata_rata_7_hari)}` : undefined}>
                        {h ? rupiah(h.harga) : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="xs muted" style={{ marginBottom: 0 }}>
        Harga terakhir dalam 7 hari; arahkan kursor ke angka untuk rata-rata 7 hari. PIHPS hanya mencatat kota survei, jadi kab/kota lain memakai pendekatan wilayah terdekat.
      </p>
    </Card>
  );
}
