import { useEffect, useState } from 'react';
import { ArrowRight, ChefHat, FlaskConical, GraduationCap, Sprout, Store } from 'lucide-react';
import type { Asumsi, Resp, Ringkasan } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka, angkaSingkat, persen, rupiahSingkat } from '../lib/format';
import { BadgeAsal } from '../components/BadgeAsal';
import { Card, ErrorState, Loading, PageHead } from '../components/common';

const PRESET = [20, 40, 75];

export function Simulasi() {
  const { data, error } = useApi<Resp<Asumsi[]>>('/api/simulasi/asumsi');
  const ringkas = useApi<Resp<Ringkasan>>('/api/ringkasan');
  const asumsi = data?.data ?? [];
  const nilai = (k: string) => asumsi.find((a) => a.kunci === k)?.nilai ?? null;

  const pagu = nilai('pagu_mbg');
  const porsiBahan = nilai('porsi_bahan_baku');
  const belanjaBawaan = pagu !== null && porsiBahan !== null ? pagu * porsiBahan : null;

  const [pct, setPct] = useState(40);
  const [belanjaT, setBelanjaT] = useState<number | null>(null);
  const [lihatAsumsi, setLihatAsumsi] = useState(false);

  useEffect(() => {
    if (belanjaBawaan !== null && belanjaT === null) setBelanjaT(Math.round(belanjaBawaan / 1e11) / 10);
    const lokal = nilai('porsi_koperasi_lokal');
    if (lokal !== null && belanjaT === null) setPct(Math.round(lokal * 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belanjaBawaan]);

  if (error) return <ErrorState message={error} />;
  if (!data || belanjaT === null) return <Loading />;

  const belanja = belanjaT * 1e12;
  const serapan = belanja * (pct / 100);
  const pengganda = nilai('efek_pengganda') ?? 1;
  const perOrang = nilai('pendapatan_per_petani');
  const beredar = serapan * pengganda;
  const orang = perOrang ? serapan / perOrang : null;
  const trxKop = ringkas.data?.data.kpi.find((k) => k.kunci === 'nilai_transaksi')?.nilai ?? null;

  const output = [
    { label: 'Serapan bahan baku lewat koperasi', nilai: rupiahSingkat(serapan), rumus: `belanja bahan baku × ${pct}%` },
    { label: 'Nilai beredar di desa', nilai: rupiahSingkat(beredar), rumus: `serapan × efek pengganda ${angka(pengganda, 1)}` },
    { label: 'Petani/UMKM terlibat', nilai: orang !== null ? `${angkaSingkat(orang)} orang` : '–', rumus: `serapan ÷ ${rupiahSingkat(perOrang)} per orang per tahun` },
  ];

  const alur = [
    { ikon: Sprout, label: 'Petani / nelayan', nilai: orang !== null ? `${angkaSingkat(orang)} orang` : '–' },
    { ikon: Store, label: 'KDKMP', nilai: rupiahSingkat(serapan) },
    { ikon: ChefHat, label: 'SPPG', nilai: rupiahSingkat(belanja) },
    { ikon: GraduationCap, label: 'Penerima MBG', nilai: 'makanan bergizi' },
  ];

  return (
    <>
      <PageHead
        eyebrow="Simulasi · Potensi ekonomi"
        title={`Jika ${pct}% bahan baku MBG dibeli dari koperasi lokal, serapannya ${rupiahSingkat(serapan)} per tahun`}
        lede="Ubah asumsi untuk melihat skala potensi. Semua keluaran adalah estimasi dari asumsi yang dicantumkan di bawah, bukan realisasi."
      />
      <div className="banner" role="note" style={{ marginBottom: 16 }}>
        <FlaskConical size={18} aria-hidden style={{ flex: 'none', marginTop: 2, color: 'var(--sim)' }} />
        <span><strong>Simulasi potensi, bukan realisasi.</strong> Angka di halaman ini menunjukkan apa yang mungkin terjadi pada asumsi tertentu.</span>
      </div>

      <div className="split">
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="grid grid-3">
            {output.map((o) => (
              <div key={o.label} className="card kpi">
                <div className="kpi-accent" style={{ background: 'var(--sim)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
                  <span className="kpi-label">{o.label}</span>
                  <BadgeAsal asal="Estimasi" />
                </div>
                <div className="kpi-value">{o.nilai}</div>
                <div className="xs muted">{o.rumus}</div>
              </div>
            ))}
          </div>

          <Card title="Alur rantai pasok" asal="Estimasi">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {alur.map((a, i) => (
                <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)' }}>
                    <a.ikon size={20} aria-hidden style={{ color: a.label === 'KDKMP' ? 'var(--kop)' : a.label === 'SPPG' ? 'var(--mbg)' : 'var(--ink-2)' }} />
                    <span>
                      <span className="small" style={{ fontWeight: 600 }}>{a.label}</span>
                      <br />
                      <span className="xs num muted">{a.nilai}</span>
                    </span>
                  </div>
                  {i < alur.length - 1 && <ArrowRight size={16} className="muted" aria-hidden />}
                </div>
              ))}
            </div>
            {trxKop !== null && (
              <p className="small ink-2" style={{ marginBottom: 0 }}>
                Sebagai pembanding, transaksi seluruh koperasi sepanjang 2026 sejauh ini {rupiahSingkat(trxKop)} <BadgeAsal asal="Resmi" />, atau{' '}
                {persen((trxKop / serapan) * 100, 2)} dari serapan pada skenario ini.
              </p>
            )}
          </Card>
        </div>

        <Card title="Asumsi skenario" asal="Estimasi">
          <div className="slider-row">
            <label htmlFor="pct">Bahan baku dari koperasi lokal</label>
            <span className="num small">{pct}%</span>
            <input id="pct" type="range" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ accentColor: 'var(--sim)' }} />
          </div>
          <div className="toolbar">
            {PRESET.map((p) => (
              <button key={p} type="button" className="btn" aria-pressed={pct === p} onClick={() => setPct(p)}>{p}%</button>
            ))}
          </div>
          <div className="slider-row">
            <label htmlFor="belanja">Belanja bahan baku per tahun</label>
            <span className="num small">Rp{angka(belanjaT, 1)} T</span>
            <input id="belanja" type="range" min={20} max={300} step={0.1} value={belanjaT} onChange={(e) => setBelanjaT(Number(e.target.value))} style={{ accentColor: 'var(--sim)' }} />
          </div>
          <p className="xs muted" style={{ marginTop: 0 }}>
            Bawaan: pagu BGN {rupiahSingkat(pagu)} × {persen((porsiBahan ?? 0) * 100, 0)} porsi bahan baku = {rupiahSingkat(belanjaBawaan)}.{' '}
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setBelanjaT(Math.round((belanjaBawaan ?? 0) / 1e11) / 10)}>Kembalikan</button>
          </p>
          <button type="button" className="btn" onClick={() => setLihatAsumsi((v) => !v)} aria-expanded={lihatAsumsi}>
            {lihatAsumsi ? 'Sembunyikan asumsi' : 'Lihat asumsi'}
          </button>
          {lihatAsumsi && (
            <ul className="list-plain small" style={{ marginTop: 10 }}>
              {asumsi.map((a) => (
                <li key={a.kunci}>
                  <strong>{a.label}</strong>: <span className="num">{a.satuan.startsWith('Rp') ? rupiahSingkat(a.nilai) : a.satuan === 'rasio' ? persen(a.nilai * 100, 0) : angka(a.nilai, 1)}</span>{' '}
                  <span className="muted">({a.satuan})</span>
                  <div className="xs">
                    {a.sumber_url ? (
                      <a href={a.sumber_url} target="_blank" rel="noreferrer">Sumber</a>
                    ) : (
                      <span className="tag-missing">asumsi penulis</span>
                    )}
                    {a.catatan && <span className="muted"> · {a.catatan}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
