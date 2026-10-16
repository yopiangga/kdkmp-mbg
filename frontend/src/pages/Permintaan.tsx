import { useCallback } from 'react';
import { Clock, FileSearch, ShieldCheck } from 'lucide-react';
import type { Permintaan as P, Resp } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka } from '../lib/format';
import { Chart, axisBase, tooltipBase, type Palet } from '../components/Chart';
import { Card, ErrorState, Loading, PageHead } from '../components/common';

export function Permintaan() {
  const { data, error } = useApi<Resp<P>>('/api/permintaan');
  const p = data?.data;

  const build = useCallback(
    (pl: Palet) => {
      const maxPen = Math.max(...(p?.titik.map((t) => t.penerima ?? 0) ?? [1]), 1);
      return {
        grid: { left: 48, right: 16, top: 16, bottom: 44 },
        tooltip: { ...tooltipBase(pl), trigger: 'item', formatter: (x: { data: { nama: string; value: number[] } }) => `<strong>${x.data.nama}</strong><br/>SPPG ${angka(x.data.value[0])}<br/>Indeks ${angka(x.data.value[1], 1)}<br/>Penerima ${angka(x.data.value[2])}` },
        xAxis: { type: 'value', name: 'Jumlah SPPG', nameLocation: 'middle', nameGap: 28, ...axisBase(pl) },
        yAxis: { type: 'value', name: 'Indeks kesiapan', min: 0, max: 100, ...axisBase(pl) },
        series: [{
          type: 'scatter',
          data: p?.titik.map((t) => ({ value: [t.sppg, t.indeks, t.penerima ?? 0], nama: t.nama })) ?? [],
          symbolSize: (v: number[]) => 8 + 28 * Math.sqrt((v[2] ?? 0) / maxPen),
          itemStyle: { color: pl.mbg, opacity: 0.8, borderColor: pl.surface, borderWidth: 2 },
        }],
      };
    },
    [p],
  );

  if (error) return <ErrorState message={error} />;
  if (!p) return <Loading />;

  return (
    <>
      <PageHead
        eyebrow="Lapis 2 · Gap · Permintaan vs kesiapan"
        title={p.aktif ? 'Permintaan dapur MBG belum tentu bertemu koperasi yang siap' : 'Menunggu data SPPG per provinsi'}
        lede="Sumbu X jumlah SPPG (permintaan), sumbu Y Indeks Kesiapan Operasional koperasi, ukuran titik jumlah penerima MBG. Halaman ini aktif setelah data SPPG per provinsi terverifikasi."
      />
      {p.aktif ? (
        <Card title="Permintaan MBG vs kesiapan koperasi" asal={['Rilis', 'Indeks']}>
          <Chart build={build} height={420} ariaLabel="Diagram sebar jumlah SPPG terhadap indeks kesiapan per provinsi" />
        </Card>
      ) : (
        <div className="grid grid-2">
          <Card title="Kenapa belum tampil" asal="Rilis">
            <p className="small" style={{ marginTop: 0 }}>{p.alasan}</p>
            <p className="small ink-2">
              BGN belum menerbitkan jumlah SPPG dan penerima per provinsi dalam bentuk data terbuka. Angka nasional (27.485 SPPG per 30 Sep 2026) tersedia
              di Ringkasan, tetapi angka nasional tidak bisa dipecah ke provinsi tanpa asumsi, jadi diagram ini sengaja tidak diisi dengan estimasi.
            </p>
            <p className="xs muted">Cakupan saat ini: {p.cakupan.ada} dari {p.cakupan.total} provinsi. Diagram aktif pada ≥ 80% provinsi.</p>
          </Card>
          <Card title="Jalur memperoleh data">
            <ol className="list-plain small">
              <li style={{ display: 'flex', gap: 10 }}>
                <FileSearch size={18} className="muted" aria-hidden style={{ flex: 'none' }} />
                <span><strong>Permohonan informasi publik ke PPID BGN</strong><br />Minta jumlah SPPG beroperasi dan penerima per provinsi (dan per kab/kota bila ada), beserta tanggal datanya.</span>
              </li>
              <li style={{ display: 'flex', gap: 10 }}>
                <ShieldCheck size={18} className="muted" aria-hidden style={{ flex: 'none' }} />
                <span><strong>Impor ke observatorium</strong><br />Admin mengunggah CSV lewat <code>POST /api/admin/impor-csv?tabel=rilis_angka</code>, indikator <code>sppg_beroperasi</code> dan <code>penerima_mbg</code> dengan <code>kode_wilayah</code> provinsi.</span>
              </li>
              <li style={{ display: 'flex', gap: 10 }}>
                <Clock size={18} className="muted" aria-hidden style={{ flex: 'none' }} />
                <span><strong>Verifikasi</strong><br />Baris impor berstatus draf. Diagram aktif otomatis setelah admin menandainya terverifikasi.</span>
              </li>
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}
