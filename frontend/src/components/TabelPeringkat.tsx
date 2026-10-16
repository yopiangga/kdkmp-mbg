import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import type { WilayahRow } from '../lib/api';
import { angka, persen, rupiahSingkat } from '../lib/format';
import { downloadCsv } from './common';

type Kolom = 'peringkat' | 'nama' | 'indeks' | 'gerai' | 'manajer' | 'nib' | 'rat' | 'jumlah_koperasi' | 'trx_per_kop';

const val = (r: WilayahRow, k: Kolom): number | string | null => {
  switch (k) {
    case 'nama': return r.nama;
    case 'peringkat': return r.peringkat;
    case 'indeks': return r.indeks;
    case 'jumlah_koperasi': return r.jumlah_koperasi ?? null;
    case 'trx_per_kop': return r.trx_per_kop;
    default: return r.komponen?.[k] ?? null;
  }
};

export function TabelPeringkat({ rows, onPilih, namaFile, tampilkanManajer = true, tampilkanGerai = true }: {
  rows: WilayahRow[];
  onPilih?: (r: WilayahRow) => void;
  namaFile: string;
  tampilkanManajer?: boolean;
  tampilkanGerai?: boolean;
}) {
  const [cari, setCari] = useState('');
  const [sort, setSort] = useState<{ k: Kolom; asc: boolean }>({ k: 'peringkat', asc: true });

  const kolom: { k: Kolom; label: string; r?: boolean; show?: boolean }[] = [
    { k: 'peringkat', label: '#', r: true },
    { k: 'nama', label: 'Wilayah' },
    { k: 'indeks', label: 'Indeks' },
    { k: 'gerai', label: 'Gerai %', r: true, show: tampilkanGerai },
    { k: 'manajer', label: 'Manajer %', r: true, show: tampilkanManajer },
    { k: 'nib', label: 'NIB %', r: true },
    { k: 'rat', label: 'RAT %', r: true },
    { k: 'jumlah_koperasi', label: 'Koperasi', r: true },
    { k: 'trx_per_kop', label: 'Transaksi/kop', r: true },
  ];
  const visible = kolom.filter((c) => c.show !== false);

  const sorted = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.nama.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const va = val(a, sort.k);
      const vb = val(b, sort.k);
      if (va === null && vb === null) return a.nama.localeCompare(b.nama);
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.asc ? c : -c;
    });
  }, [rows, cari, sort]);

  const unduh = () =>
    downloadCsv(
      namaFile,
      ['kode', 'nama', 'peringkat', 'indeks', 'jumlah_komponen', 'gerai_pct', 'manajer_pct', 'nib_pct', 'rat_pct', 'jumlah_koperasi', 'nilai_transaksi', 'trx_per_kop', 'tanggal_data', 'sumber_url'],
      sorted.map((r) => [
        r.kode, r.nama, r.peringkat, r.indeks?.toFixed(2), r.jumlah_komponen, r.komponen?.gerai?.toFixed(2), r.komponen?.manajer?.toFixed(2),
        r.komponen?.nib?.toFixed(2), r.komponen?.rat?.toFixed(2), r.jumlah_koperasi, r.nilai_transaksi, r.trx_per_kop?.toFixed(0), r.tanggal_data, r.sumber_url,
      ]),
    );

  const header = (c: (typeof kolom)[number]) => (
    <th key={c.k} className={c.r ? 'r' : ''} aria-sort={sort.k === c.k ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ k: c.k, asc: s.k === c.k ? !s.asc : c.k === 'nama' || c.k === 'peringkat' }))}>
        {c.label}
        {sort.k === c.k && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div>
      <div className="toolbar">
        <label style={{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
          <span className="sr-only">Cari wilayah</span>
          <Search size={14} className="muted" style={{ position: 'absolute', left: 9, top: 9 }} aria-hidden />
          <input className="input" style={{ paddingLeft: 28, width: '100%' }} placeholder="Cari wilayah" value={cari} onChange={(e) => setCari(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={unduh}>
          <Download size={14} aria-hidden /> Unduh CSV
        </button>
      </div>
      <div className="table-wrap" style={{ maxHeight: 520 }}>
        <table className="data">
          <thead>
            <tr>{visible.map(header)}</tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.kode} className={onPilih ? 'clickable' : ''} onClick={() => onPilih?.(r)} tabIndex={onPilih ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onPilih?.(r)}>
                {visible.map((c) => {
                  if (c.k === 'peringkat') return <td key={c.k} className="r num muted">{r.peringkat ?? '–'}</td>;
                  if (c.k === 'nama') return <td key={c.k} style={{ fontWeight: 600 }}>{r.nama}</td>;
                  if (c.k === 'indeks')
                    return (
                      <td key={c.k} className="num">
                        {r.status_data !== 'ada' ? (
                          <span className="tag-missing">belum dikumpulkan</span>
                        ) : r.indeks === null ? (
                          <span className="muted" title={`Hanya ${r.jumlah_komponen} komponen tersedia`}>–</span>
                        ) : (
                          <>
                            <span className="minibar" aria-hidden><span style={{ width: `${r.indeks}%` }} /></span>
                            {angka(r.indeks, 1)}
                          </>
                        )}
                      </td>
                    );
                  if (c.k === 'jumlah_koperasi') return <td key={c.k} className="r num">{angka(r.jumlah_koperasi)}</td>;
                  if (c.k === 'trx_per_kop') return <td key={c.k} className="r num">{rupiahSingkat(r.trx_per_kop)}</td>;
                  return <td key={c.k} className="r num">{persen(r.komponen?.[c.k] ?? null)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
