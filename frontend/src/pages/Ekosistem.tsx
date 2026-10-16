import { useMemo, useState } from 'react';
import {
  Building, Building2, ChefHat, Database, Flame, FlaskConical, GraduationCap, HandHeart, Landmark, Package, Sprout, Store, Truck, Users, Utensils, Warehouse,
  type LucideIcon,
} from 'lucide-react';
import data from '../data/ekosistem.json';
import { Card, PageHead, Seg } from '../components/common';

type Jenis = 'barang' | 'uang' | 'regulasi_data';
type Ketersediaan = 'publik' | 'rilis' | 'tertutup';
type Mode = 'jenis' | 'ketersediaan';

interface Node { id: string; label: string; kelompok: string; ikon: string; x: number; y: number; peran: string }
interface Edge { dari: string; ke: string; jenis: Jenis; ketersediaan: Ketersediaan; label: string; catatan?: string }

const NODES = data.nodes as Node[];
const EDGES = data.edges as Edge[];
const IKON: Record<string, LucideIcon> = { Building, Building2, ChefHat, Database, Flame, FlaskConical, GraduationCap, HandHeart, Landmark, Package, Sprout, Store, Truck, Users, Utensils, Warehouse };

const JENIS: Record<Jenis, { label: string; warna: string; dash?: string }> = {
  barang: { label: 'Barang', warna: 'var(--series-1)' },
  uang: { label: 'Uang', warna: 'var(--series-2)' },
  regulasi_data: { label: 'Regulasi / data', warna: 'var(--series-3)' },
};
const KETERSEDIAAN: Record<Ketersediaan, { label: string; warna: string; dash?: string }> = {
  publik: { label: 'Publik', warna: 'var(--mbg)' },
  rilis: { label: 'Hanya rilis', warna: 'var(--series-2)', dash: '7 5' },
  tertutup: { label: 'Tertutup', warna: 'var(--muted)', dash: '2 4' },
};

const R = 28;

function geometry(edges: Edge[]) {
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const seen = new Map<string, number>();
  return edges.map((e) => {
    const a = byId.get(e.dari)!;
    const b = byId.get(e.ke)!;
    const key = `${e.dari}>${e.ke}`;
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const off = 16 + dup * 26;
    const mx = (a.x + b.x) / 2 - uy * off;
    const my = (a.y + b.y) / 2 + ux * off;
    // potong di tepi lingkaran node, menuju titik kontrol
    const trim = (px: number, py: number, tx: number, ty: number, r: number) => {
      const l = Math.hypot(tx - px, ty - py);
      return [px + ((tx - px) / l) * r, py + ((ty - py) / l) * r];
    };
    const [sx, sy] = trim(a.x, a.y, mx, my, R + 2);
    const [ex, ey] = trim(b.x, b.y, mx, my, R + 8);
    return { e, d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}` };
  });
}

export function Ekosistem() {
  const [mode, setMode] = useState<Mode>('jenis');
  const [pilih, setPilih] = useState<string | null>('kdkmp');
  const geo = useMemo(() => geometry(EDGES), []);
  const skema = mode === 'jenis' ? JENIS : KETERSEDIAAN;
  const style = (e: Edge) => (mode === 'jenis' ? JENIS[e.jenis] : KETERSEDIAAN[e.ketersediaan]);
  const terkait = (e: Edge) => !pilih || e.dari === pilih || e.ke === pilih;
  const node = NODES.find((n) => n.id === pilih) ?? null;
  const nama = (id: string) => NODES.find((n) => n.id === id)?.label ?? id;

  return (
    <>
      <PageHead
        eyebrow="Gap · Ekosistem"
        title={`${EDGES.filter((e) => e.ketersediaan === 'tertutup').length} dari ${EDGES.length} alur belum punya data publik, termasuk dana dan pasokan ke dapur MBG`}
        lede="Graf 16 entitas yang membentuk ekosistem koperasi desa dan MBG. Ganti mode untuk melihat jenis alur atau seberapa terbuka datanya. Klik entitas untuk melihat perannya."
      />
      <div className="toolbar">
        <Seg label="Mode graf" value={mode} onChange={setMode} options={[{ value: 'jenis', label: 'Jenis alur' }, { value: 'ketersediaan', label: 'Ketersediaan data' }]} />
        <div className="legend">
          {Object.entries(skema).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={v.warna} strokeWidth="2.5" strokeDasharray={v.dash} /></svg>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="split">
        <Card>
          <div style={{ overflowX: 'auto', margin: '-4px' }}>
            <svg viewBox="0 0 1000 620" style={{ minWidth: 720, width: '100%', display: 'block' }} role="img" aria-label="Graf ekosistem KDKMP dan MBG">
              <defs>
                {Object.entries(skema).map(([k, v]) => (
                  <marker key={k} id={`panah-${mode}-${k}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={v.warna} />
                  </marker>
                ))}
              </defs>
              {geo.map(({ e, d }, i) => {
                const s = style(e);
                const key = mode === 'jenis' ? e.jenis : e.ketersediaan;
                return (
                  <path
                    key={i} d={d} fill="none" stroke={s.warna} strokeWidth={terkait(e) && pilih ? 2.5 : 1.6}
                    strokeDasharray={s.dash} opacity={terkait(e) ? 1 : 0.15} markerEnd={`url(#panah-${mode}-${key})`}
                  >
                    <title>{`${nama(e.dari)} → ${nama(e.ke)}: ${e.label}`}</title>
                  </path>
                );
              })}
              {NODES.map((n) => {
                const Icon = IKON[n.ikon] ?? Package;
                const aktif = n.id === pilih;
                const redup = pilih && !aktif && !EDGES.some((e) => (e.dari === pilih && e.ke === n.id) || (e.ke === pilih && e.dari === n.id));
                return (
                  <g
                    key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }} opacity={redup ? 0.35 : 1}
                    onClick={() => setPilih(aktif ? null : n.id)} tabIndex={0} role="button" aria-label={n.label} aria-pressed={aktif}
                    onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setPilih(aktif ? null : n.id)}
                  >
                    <circle r={R} fill={n.id === 'kdkmp' ? 'var(--kop)' : n.id === 'sppg' ? 'var(--mbg)' : 'var(--surface)'} stroke={aktif ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth={aktif ? 2.5 : 1.2} />
                    <Icon x={-12} y={-12} width={24} height={24} color={n.id === 'kdkmp' || n.id === 'sppg' ? '#fff' : 'var(--ink-2)'} strokeWidth={1.8} aria-hidden />
                    <text y={R + 18} textAnchor="middle" fontSize="14" fontWeight={aktif ? 700 : 600} fill="var(--ink)" style={{ fontFamily: 'var(--font-sans)' }}>{n.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="xs muted">Graf bisa digeser ke samping di layar sempit.</p>
        </Card>

        <Card title={node ? node.label : 'Pilih entitas'}>
          {node ? (
            <>
              <p className="small" style={{ marginTop: 0 }}>{node.peran}</p>
              <ul className="list-plain small">
                {EDGES.filter((e) => e.dari === node.id || e.ke === node.id).map((e, i) => (
                  <li key={i}>
                    <strong>{e.dari === node.id ? `→ ${nama(e.ke)}` : `← ${nama(e.dari)}`}</strong>: {e.label}
                    <div className="xs muted">
                      {JENIS[e.jenis].label} · data {KETERSEDIAAN[e.ketersediaan].label.toLowerCase()}
                      {e.catatan && ` · ${e.catatan}`}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="small muted">Klik node pada graf.</p>
          )}
        </Card>
      </div>

      <details className="section card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Tabel semua alur ({EDGES.length})</summary>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead><tr><th>Dari</th><th>Ke</th><th>Alur</th><th>Jenis</th><th>Data</th><th>Catatan</th></tr></thead>
            <tbody>
              {EDGES.map((e, i) => (
                <tr key={i}>
                  <td>{nama(e.dari)}</td><td>{nama(e.ke)}</td><td>{e.label}</td>
                  <td>{JENIS[e.jenis].label}</td><td>{KETERSEDIAAN[e.ketersediaan].label}</td>
                  <td className="small" style={{ whiteSpace: 'normal', minWidth: 220 }}>{e.catatan ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
