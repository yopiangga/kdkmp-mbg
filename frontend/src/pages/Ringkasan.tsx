import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Building2, CalendarDays, ChefHat, ChevronDown, ChevronRight, ChevronUp, Gauge, MapPin, Plus, Store, UserCheck,
  type LucideIcon,
} from 'lucide-react';
import type { FunnelStage, Kpi, Matriks, Resp, Ringkasan as R } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka, persen, rupiahSingkat, tanggal } from '../lib/format';
import { BadgeAsal } from '../components/BadgeAsal';
import { ErrorState, Loading } from '../components/common';

const IKON_TAHAP: Record<string, { ikon: LucideIcon; pendek: string }> = {
  'Berbadan hukum': { ikon: Building2, pendek: 'Badan hukum' },
  'Lahan terverifikasi': { ikon: MapPin, pendek: 'Lahan' },
  'Gerai selesai': { ikon: Store, pendek: 'Gerai' },
  'Manajer aktif': { ikon: UserCheck, pendek: 'Manajer' },
  'Bertransaksi rutin': { ikon: Activity, pendek: 'Transaksi rutin' },
  'Pemasok MBG': { ikon: ChefHat, pendek: 'Pemasok MBG' },
};

const KETERANGAN_TAHAP: Record<string, string> = {
  'Berbadan hukum': 'koperasi sudah berbadan hukum',
  'Lahan terverifikasi': 'koperasi punya lahan terverifikasi',
  'Gerai selesai': 'koperasi gerainya selesai dibangun',
  'Manajer aktif': 'koperasi punya manajer aktif',
  'Bertransaksi rutin': 'data koperasi bertransaksi rutin belum tersedia',
  'Pemasok MBG': 'koperasi tercatat memasok dapur MBG',
};

interface Pilot {
  kode: string;
  nama: string;
  provinsi: string | null;
  prioritas: boolean;
  profil: number;
  desa_dicoba: number;
  anggota: number;
  path: string;
}

// ---------------------------------------------------------------- kartu utama: lolipop tahapan
function KartuKesiapan({ r }: { r: R }) {
  const tahap = r.funnel;
  const [aktif, setAktif] = useState(2); // gerai selesai
  const dasar = tahap[0]?.nilai ?? 1;
  const t = tahap[aktif];
  const pct = t?.nilai !== null && t?.nilai !== undefined ? (t.nilai / dasar) * 100 : null;
  const kpi = (k: string) => r.kpi.find((x) => x.kunci === k);
  const mini: (Kpi | undefined)[] = [kpi('nilai_transaksi'), kpi('rat_selesai'), kpi('manajer_aktif')];

  return (
    <section className="card" style={{ padding: 'clamp(20px, 3vw, 36px)' }} aria-labelledby="judul-kesiapan">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className="hero-icon" aria-hidden><Gauge size={24} /></span>
          <h1 className="hero-title" id="judul-kesiapan">Kesiapan KDKMP</h1>
        </div>
        <span className="chip" style={{ background: 'transparent', border: '1px solid var(--line-strong)' }}>
          <CalendarDays size={14} aria-hidden /> Per {tanggal(r.tanggal_data)}
        </span>
      </div>
      <p className="ink-2" style={{ margin: '14px 0 0', maxWidth: 62 + 'ch' }}>{r.judul}</p>

      <div className="hero-grid">
        <div>
          <div className="hero-number">{pct === null ? '–' : persen(pct, pct < 1 ? 2 : 0)}</div>
          <p className="ink-2" style={{ margin: '10px 0 0', maxWidth: '24ch' }}>
            {t?.tersedia ? `${KETERANGAN_TAHAP[t.tahap]} (${angka(t.nilai)} dari ${angka(dasar)})` : KETERANGAN_TAHAP[t?.tahap ?? '']}
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {t && <BadgeAsal asal={t.label_asal} />}
            {t?.tanggal && t.tanggal !== r.tanggal_data && <span className="xs muted">per {tanggal(t.tanggal)}</span>}
          </div>
        </div>

        <Lolipop tahap={tahap} dasar={dasar} aktif={aktif} onPilih={setAktif} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
        {mini.filter(Boolean).map((k) => (
          <div key={k!.kunci}>
            <div className="xs muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{k!.label} <BadgeAsal asal={k!.label_asal} /></div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{k!.satuan === 'Rp' ? rupiahSingkat(k!.nilai) : angka(k!.nilai)}</div>
            {k!.keterangan && <div className="xs muted">{k!.keterangan}</div>}
          </div>
        ))}
      </div>
      <div className="foot">
        <span>Sumber: <a href={r.sumber_url} target="_blank" rel="noreferrer">Simkopdes, Kementerian Koperasi</a>; pemasok MBG: BGN</span>
      </div>
    </section>
  );
}

function Lolipop({ tahap, dasar, aktif, onPilih }: { tahap: FunnelStage[]; dasar: number; aktif: number; onPilih: (i: number) => void }) {
  const TINGGI = 210;
  return (
    <div style={{ height: TINGGI + 150 }}>
      <div className="lolipop" role="group" aria-label="Tahapan dari berbadan hukum sampai pemasok MBG">
        {tahap.map((s, i) => {
          const meta = IKON_TAHAP[s.tahap] ?? { ikon: Activity, pendek: s.tahap };
          const Ikon = meta.ikon;
          const pct = s.nilai !== null ? s.nilai / dasar : null;
          const h = pct === null ? 18 : Math.max(10, pct * TINGGI);
          const pilih = i === aktif;
          return (
            <button
              key={s.tahap}
              type="button"
              className={`lolipop-col ${pilih ? 'aktif' : ''}`}
              onClick={() => onPilih(i)}
              aria-pressed={pilih}
              aria-label={`${s.tahap}: ${s.tersedia ? angka(s.nilai) : 'belum tersedia'}`}
            >
              {pilih && <span className="lolipop-tip">{s.tersedia ? angka(s.nilai) : 'Belum ada data'}</span>}
              <span className={`lolipop-dot ${s.tersedia ? '' : 'kosong'}`} />
              <span className="lolipop-stem" style={{ height: h, opacity: s.tersedia ? 1 : 0.5 }} />
              <span className="lolipop-label"><Ikon size={20} aria-hidden /></span>
              <span className="lolipop-name">{meta.pendek}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- wilayah perlu perhatian
const WARNA_TILE = ['var(--kop)', 'var(--navy)', 'var(--dot)', '#8a6fd1', '#d98a2b'];
const inisial = (nama: string) => nama.split(/\s+/).filter((w) => !/^(dan|kepulauan|kep\.?)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function WilayahPerhatian({ m }: { m: Matriks }) {
  const [buka, setBuka] = useState<string | null>(m.prioritas[0]?.kode ?? null);
  return (
    <section aria-labelledby="judul-perhatian">
      <div className="section-head">
        <h2 className="section-title" id="judul-perhatian">Wilayah perlu perhatian</h2>
        <Link to="/gap/fisik-usaha" className="link-underline">Lihat semua</Link>
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>
        Gerai ≥ {m.ambang.gerai}% tetapi transaksi &lt; {rupiahSingkat(m.ambang.trx)} per koperasi <BadgeAsal asal="Indeks" />
      </p>
      <div>
        {m.prioritas.map((p, i) => {
          const terbuka = buka === p.kode;
          return (
            <div key={p.kode} className="expand-item">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="tile" style={{ background: WARNA_TILE[i % WARNA_TILE.length], color: i === 1 ? 'var(--on-navy)' : '#fff' }} aria-hidden>{inisial(p.nama)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontWeight: 600 }}>{p.nama}</strong>
                    <span className="badge badge-resmi">Gedung siap</span>
                  </div>
                  <div className="ink-2 small">{rupiahSingkat(p.trx_per_kop)} / koperasi</div>
                </div>
                <button type="button" className="round-btn" onClick={() => setBuka(terbuka ? null : p.kode)} aria-expanded={terbuka} aria-label={`${terbuka ? 'Tutup' : 'Buka'} rincian ${p.nama}`}>
                  {terbuka ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
              {terbuka && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="chip">Gerai {persen(p.gerai_pct)}</span>
                    <span className="chip">{angka(p.jumlah_koperasi)} koperasi</span>
                  </div>
                  <p className="small ink-2" style={{ margin: '12px 0 8px' }}>
                    Transaksi rendah relatif terhadap kesiapan fisik: gerai hampir semuanya berdiri, tetapi nilai transaksinya baru {rupiahSingkat(p.trx_per_kop)} per koperasi sepanjang 2026.
                  </p>
                  <Link to={`/wilayah/${p.kode}`} className="small" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--ink-2)' }}>
                    <MapPin size={14} aria-hidden /> Lihat peta dan kab/kota <ArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- kabupaten dengan profil koperasi (microsite)
function KabupatenPilot({ data }: { data: Pilot[] }) {
  const tampil = data.filter((d) => d.profil > 0).slice(0, 3);
  return (
    <section aria-labelledby="judul-pilot">
      <div className="section-head">
        <h2 className="section-title" id="judul-pilot">Kabupaten dengan profil koperasi</h2>
        <Link to="/wilayah/33/33.05" className="link-underline">Lihat peta</Link>
      </div>
      <div className="grid" style={{ gap: 12 }}>
        {tampil.map((p) => (
          <div key={p.kode} className="row-item">
            <span className="avatar" aria-hidden>{inisial(p.nama.replace(/^(Kabupaten|Kota) /, ''))}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontWeight: 600 }}>{p.nama.replace(/^Kabupaten /, 'Kab. ')}</strong>
                <span className={`badge ${p.prioritas ? 'badge-rilis' : 'badge-indeks'}`}>{p.prioritas ? 'Prioritas' : 'Profil lengkap'}</span>
              </div>
              <div className="ink-2 small">{angka(p.profil)} koperasi · {angka(p.anggota)} anggota</div>
            </div>
            <Link to={p.path} className="round-btn light" aria-label={`Buka ${p.nama}`}><Plus size={18} /></Link>
          </div>
        ))}
      </div>
      <p className="xs muted" style={{ margin: '10px 4px 0' }}>
        {data.length} kabupaten · {angka(data.reduce((s, d) => s + d.profil, 0))} profil koperasi dari microsite Simkopdes <BadgeAsal asal="Resmi" />
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- dari koperasi ke dapur MBG
function DariKoperasiKeMbg({ r }: { r: R }) {
  const gerai = r.kpi.find((k) => k.kunci === 'gerai_selesai');
  const sppg = r.kpi.find((k) => k.kunci === 'sppg_beroperasi');
  const pemasok = r.funnel.find((f) => f.tahap === 'Pemasok MBG');
  const kolom = [
    { label: 'Gerai koperasi selesai', nilai: gerai?.nilai ?? null, asal: gerai?.label_asal ?? 'Resmi', warna: 'var(--line-strong)' },
    { label: 'Dapur SPPG beroperasi', nilai: sppg?.nilai ?? null, asal: sppg?.label_asal ?? 'Rilis', warna: 'var(--kop)' },
    { label: 'Koperasi pemasok MBG', nilai: pemasok?.nilai ?? null, asal: pemasok?.label_asal ?? 'Rilis', warna: 'var(--navy)' },
  ];
  const TICK = 13;
  return (
    <section className="card" style={{ padding: 'clamp(20px, 2.6vw, 30px)' }} aria-labelledby="judul-mbg">
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2 className="section-title" id="judul-mbg" style={{ margin: 0 }}>Dari koperasi ke dapur MBG</h2>
        <span className="small ink-2" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><CalendarDays size={14} aria-hidden /> {tanggal(r.tanggal_data)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 18 }}>
        {kolom.map((k, i) => (
          <div key={k.label} style={{ borderLeft: `2px solid ${i === 0 ? 'var(--line-strong)' : k.warna}`, paddingLeft: 'clamp(8px, 1.4vw, 18px)', minWidth: 0 }}>
            <div className="small ink-2" style={{ minHeight: '2.6em', lineHeight: 1.3 }}>{k.label}</div>
            <div style={{ fontSize: 'clamp(20px, 2.1vw, 30px)', fontWeight: 600, letterSpacing: '-0.03em', overflowWrap: 'anywhere' }}>{angka(k.nilai)}</div>
            <BadgeAsal asal={k.asal} />
            <div className="ticks" aria-hidden>
              {Array.from({ length: TICK }, (_, j) => <span key={j} style={{ background: k.warna }} />)}
            </div>
          </div>
        ))}
      </div>
      <p className="xs muted" style={{ margin: '14px 0 0' }}>
        Pemasok MBG per {tanggal(pemasok?.tanggal)} (BGN); SPPG per {tanggal(sppg?.tanggal)} (Kemenkeu). Tanggal ketiganya berbeda.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- halaman
export function Ringkasan() {
  const { data, error } = useApi<Resp<R>>('/api/ringkasan');
  const mat = useApi<Resp<Matriks>>('/api/matriks');
  const pilot = useApi<Resp<Pilot[]>>('/api/pilot');

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  const r = data.data;

  return (
    <div style={{ paddingTop: 12 }}>
      <div className="split" style={{ alignItems: 'start' }}>
        <KartuKesiapan r={r} />
        {mat.data ? <WilayahPerhatian m={mat.data.data} /> : <Loading />}
      </div>

      <div className="split section" style={{ alignItems: 'stretch' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24 }}>
          {pilot.data && <KabupatenPilot data={pilot.data.data} />}
          <section className="cta-card" aria-labelledby="judul-cta">
            <div>
              <h2 className="section-title" id="judul-cta">Simulasikan potensi ekonomi</h2>
              <p className="ink-2 small" style={{ margin: '8px 0 0', maxWidth: '36ch' }}>
                Berapa uang yang beredar di desa jika sebagian bahan baku MBG dibeli dari koperasi lokal? <BadgeAsal asal="Estimasi" />
              </p>
            </div>
            <Link to="/simulasi" className="btn-cta">Buka simulasi <ChevronRight size={18} aria-hidden /></Link>
          </section>
        </div>
        <DariKoperasiKeMbg r={r} />
      </div>

      <section className="section" aria-labelledby="judul-temuan">
        <div className="section-head">
          <div>
            <h2 className="section-title" id="judul-temuan">{r.pembanding ? 'Temuan minggu ini' : 'Temuan dari data terbaru'}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {r.pembanding
                ? `Dihitung otomatis dari snapshot ${tanggal(r.tanggal_data)}, dibanding ${tanggal(r.pembanding)}.`
                : `Dihitung otomatis dari snapshot ${tanggal(r.tanggal_data)}. Perubahan mingguan muncul setelah riwayat 7 hari terkumpul.`}
            </p>
          </div>
          <Link to="/tentang" className="link-underline">Metodologi</Link>
        </div>
        <div className="grid grid-3" style={{ gap: 20 }}>
          {r.temuan.map((t) => (
            <article key={t.kunci} className="card temuan">
              <BadgeAsal asal={t.label_asal} />
              <h3>{t.judul}</h3>
              <p>{t.isi}</p>
              <Link to={t.tautan} className="small" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 12, color: 'var(--ink-2)' }}>
                Lihat rincian <ArrowRight size={13} aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
