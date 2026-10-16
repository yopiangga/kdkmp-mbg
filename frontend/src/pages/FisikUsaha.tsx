import { useCallback, useState } from 'react';
import type { KuadranKey, Matriks, Resp } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka, persen, rupiahSingkat } from '../lib/format';
import { Chart, axisBase, tooltipBase, type Palet } from '../components/Chart';
import { Card, ErrorState, Loading, PageHead, Seg, SIMKOPDES, Sumber } from '../components/common';
import { BadgeAsal } from '../components/BadgeAsal';

const URUTAN: KuadranKey[] = ['siap', 'gedung_siap_usaha_belum', 'usaha_jalan_gedung_belum', 'tertinggal'];
const warnaKuadran = (p: Palet): Record<KuadranKey, string> => ({
  siap: p.series[0],
  gedung_siap_usaha_belum: p.crit,
  usaha_jalan_gedung_belum: p.series[2],
  tertinggal: p.other,
});
const cssKuadran: Record<KuadranKey, string> = {
  siap: 'var(--series-1)',
  gedung_siap_usaha_belum: 'var(--crit)',
  usaha_jalan_gedung_belum: 'var(--series-3)',
  tertinggal: 'var(--series-other)',
};
const AMBANG_TRX = [250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];

export function FisikUsaha() {
  const [level, setLevel] = useState<'provinsi' | 'kabupaten'>('provinsi');
  const [ambangGerai, setAmbangGerai] = useState(80);
  const [ambangTrx, setAmbangTrx] = useState(1_000_000);
  const { data, error, loading } = useApi<Resp<Matriks>>(`/api/matriks?level=${level}&ambang_gerai=${ambangGerai}&ambang_trx=${ambangTrx}`);
  const kab = useApi<Resp<Matriks>>('/api/matriks?level=kabupaten');
  const m = data?.data;

  const build = useCallback(
    (p: Palet) => {
      const w = warnaKuadran(p);
      const titik = m?.titik ?? [];
      const ys = titik.map((t) => t.trx_per_kop).filter((v) => v > 0);
      const yMin = 10 ** Math.floor(Math.log10(Math.min(...ys, ambangTrx)));
      const yMax = 10 ** Math.ceil(Math.log10(Math.max(...ys, ambangTrx)));
      return {
        grid: { left: 92, right: 24, top: 24, bottom: 44 },
        tooltip: {
          ...tooltipBase(p),
          trigger: 'item',
          formatter: (x: { data: { nama: string; value: [number, number]; kuadran: KuadranKey } }) =>
            `<strong>${x.data.nama}</strong><br/>Gerai ${persen(x.data.value[0])}<br/>Transaksi/koperasi ${rupiahSingkat(x.data.value[1])}<br/>${m?.kuadran[x.data.kuadran].label ?? ''}`,
        },
        xAxis: { type: 'value', name: 'Pembangunan gerai (%)', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: p.muted, fontSize: 11 }, min: 30, max: 100, ...axisBase(p) },
        yAxis: {
          type: 'log', logBase: 10, min: yMin, max: yMax, name: 'Transaksi per koperasi (log)', nameLocation: 'middle', nameGap: 76, nameTextStyle: { color: p.muted, fontSize: 11 },
          ...axisBase(p), axisLabel: { ...axisBase(p).axisLabel, formatter: (v: number) => rupiahSingkat(v) },
        },
        series: URUTAN.map((k) => ({
          name: m?.kuadran[k].label ?? k,
          type: 'scatter',
          symbolSize: 10,
          itemStyle: { color: w[k], borderColor: p.surface, borderWidth: 2 },
          emphasis: { scale: 1.4 },
          label: {
            show: k === 'gedung_siap_usaha_belum',
            formatter: (x: { data: { nama: string } }) => x.data.nama,
            color: p.ink2, fontSize: 11,
          },
          labelLayout: { hideOverlap: true },
          data: titik.filter((t) => t.kuadran === k).map((t) => ({
            value: [t.gerai_pct, Math.max(t.trx_per_kop, yMin)], nama: t.nama, kuadran: t.kuadran,
            label: { position: t.gerai_pct > 88 ? 'left' : 'right' },
          })),
          ...(k === 'siap'
            ? {
              markArea: { silent: true, itemStyle: { color: p.critSoft }, data: [[{ xAxis: ambangGerai, yAxis: yMin }, { xAxis: 100, yAxis: ambangTrx }]] },
              markLine: {
                silent: true, symbol: 'none', lineStyle: { color: p.muted, type: 'solid', width: 1 }, label: { color: p.muted, fontSize: 10 },
                data: [
                  { xAxis: ambangGerai, label: { formatter: `${ambangGerai}%`, position: 'end' } },
                  { yAxis: ambangTrx, label: { formatter: rupiahSingkat(ambangTrx), position: 'insideStartTop' } },
                ],
              },
            }
            : {}),
        })),
      };
    },
    [m, ambangGerai, ambangTrx],
  );

  if (error) return <ErrorState message={error} />;
  if (!m) return <Loading />;
  const j = m.jumlah;
  const gsub = m.titik.filter((t) => t.kuadran === 'gedung_siap_usaha_belum');

  return (
    <>
      <PageHead
        eyebrow="Lapis 2 · Gap · Fisik vs usaha"
        title={j ? `${j.gedung_siap_usaha_belum} provinsi punya gedung siap, tetapi transaksinya rendah relatif terhadap kesiapan fisik` : 'Matriks fisik vs usaha'}
        lede="Setiap titik adalah satu wilayah: sumbu X menunjukkan kemajuan pembangunan gerai, sumbu Y transaksi rata-rata per koperasi sepanjang 2026 (skala log). Ambang bisa diatur."
      />

      <div className="toolbar">
        <Seg
          label="Level wilayah"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'provinsi', label: 'Provinsi' },
            { value: 'kabupaten', label: 'Kab/kota', disabled: !kab.data?.data.aktif, title: kab.data?.data.alasan ?? undefined },
          ]}
        />
        <label className="small" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Ambang gerai
          <input type="range" min={50} max={95} step={5} value={ambangGerai} onChange={(e) => setAmbangGerai(Number(e.target.value))} style={{ accentColor: 'var(--kop)' }} />
          <span className="num">{ambangGerai}%</span>
        </label>
        <label className="small" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Ambang transaksi/koperasi
          <select className="input" value={ambangTrx} onChange={(e) => setAmbangTrx(Number(e.target.value))}>
            {AMBANG_TRX.map((v) => <option key={v} value={v}>{rupiahSingkat(v)}</option>)}
          </select>
        </label>
      </div>
      {!kab.data?.data.aktif && kab.data?.data.alasan && <p className="xs muted" style={{ marginTop: -4 }}>{kab.data.data.alasan}</p>}

      <div className="grid grid-kpi" style={{ marginBottom: 12 }}>
        {URUTAN.map((k) => (
          <div key={k} className="card" style={k === 'gedung_siap_usaha_belum' ? { background: 'var(--crit-soft)' } : undefined}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
              <span className="kpi-label"><span className="swatch" style={{ background: cssKuadran[k] }} />{m.kuadran[k].label}</span>
              <BadgeAsal asal="Indeks" />
            </div>
            <div className="kpi-value">{j ? j[k] : '–'}</div>
            <div className="xs muted">{m.kuadran[k].deskripsi}</div>
          </div>
        ))}
      </div>

      <div className="split">
        <Card
          title="Matriks fisik vs usaha"
          asal={['Resmi', 'Indeks']}
          foot={<Sumber nama={SIMKOPDES} url="https://simkopdes.go.id/pers/dashboard" tanggal={m.tanggal_data} />}
        >
          <div className={loading ? 'loading-dim' : ''}>
            <Chart build={build} height={400} ariaLabel="Diagram sebar pembangunan gerai terhadap transaksi per koperasi per provinsi" />
          </div>
          <div className="legend">
            {URUTAN.map((k) => (
              <span key={k}><span className="swatch" style={{ background: cssKuadran[k] }} />{m.kuadran[k].label}</span>
            ))}
            <span><span className="swatch" style={{ background: 'var(--crit-soft)', border: '1px solid var(--line)' }} />Area gedung siap, usaha belum</span>
          </div>
        </Card>

        <Card title="Prioritas pendampingan" asal="Indeks" foot={<span>Urut dari transaksi per koperasi terendah.</span>}>
          <p className="small muted" style={{ marginTop: 0 }}>Wilayah dengan gerai ≥ {ambangGerai}% tetapi transaksi per koperasi &lt; {rupiahSingkat(ambangTrx)}.</p>
          {gsub.length ? (
            <ol className="list-plain">
              {m.prioritas.map((t, i) => (
                <li key={t.kode} style={{ display: 'flex', gap: 10 }}>
                  <span className="num muted">{i + 1}</span>
                  <span style={{ flex: 1 }}>
                    <strong>{t.nama}</strong>
                    <br />
                    <span className="small ink-2">Gerai {persen(t.gerai_pct)} · {rupiahSingkat(t.trx_per_kop)}/koperasi · {angka(t.jumlah_koperasi)} koperasi</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small">Tidak ada wilayah di kuadran ini dengan ambang saat ini.</p>
          )}
        </Card>
      </div>

      <details className="section card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Tabel semua titik</summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr><th>Wilayah</th><th className="r">Gerai %</th><th className="r">Transaksi/koperasi</th><th className="r">Koperasi</th><th>Kuadran</th></tr>
            </thead>
            <tbody>
              {[...m.titik].sort((a, b) => a.nama.localeCompare(b.nama)).map((t) => (
                <tr key={t.kode}>
                  <td>{t.nama}</td>
                  <td className="r num">{persen(t.gerai_pct)}</td>
                  <td className="r num">{rupiahSingkat(t.trx_per_kop)}</td>
                  <td className="r num">{angka(t.jumlah_koperasi)}</td>
                  <td><span className="swatch" style={{ background: cssKuadran[t.kuadran] }} />{m.kuadran[t.kuadran].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
