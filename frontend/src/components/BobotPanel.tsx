import type { Bobot, KomponenKey } from '../lib/api';
import { BadgeAsal } from './BadgeAsal';

export const BOBOT_BAWAAN: Bobot = { gerai: 1, manajer: 1, nib: 1, rat: 1, transaksi: 1 };

const LABEL: Record<KomponenKey, string> = {
  gerai: 'Pembangunan gerai',
  manajer: 'Manajer aktif',
  nib: 'Punya NIB',
  rat: 'Sudah RAT',
  transaksi: 'Transaksi per koperasi (log)',
};

export function BobotPanel({ bobot, onChange, tersedia }: { bobot: Bobot; onChange: (b: Bobot) => void; tersedia?: KomponenKey[] }) {
  const keys = Object.keys(LABEL) as KomponenKey[];
  const kurang = tersedia ? keys.filter((k) => !tersedia.includes(k)) : [];
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Bobot indeks kesiapan</h2>
        <BadgeAsal asal="Indeks" />
      </div>
      <p className="xs muted" style={{ marginTop: 0 }}>
        Indeks = Σ(bobot × komponen) / Σ bobot. Komponen transaksi memakai skala log10 yang dinormalisasi 0–100 antar wilayah sejenjang.
        {kurang.length > 0 && ` Di level ini ${kurang.map((k) => LABEL[k].toLowerCase()).join(' dan ')} tidak tersedia di sumber, jadi indeks memakai ${keys.length - kurang.length} komponen.`}
      </p>
      {keys.map((k) => {
        const off = kurang.includes(k);
        return (
          <div className="slider-row" key={k} style={off ? { opacity: 0.45 } : undefined}>
            <label htmlFor={`b-${k}`}>{LABEL[k]}{off ? ' (tidak tersedia)' : ''}</label>
            <span className="num small">{bobot[k].toFixed(1)}</span>
            <input id={`b-${k}`} type="range" min={0} max={3} step={0.5} value={bobot[k]} disabled={off} onChange={(e) => onChange({ ...bobot, [k]: Number(e.target.value) })} />
          </div>
        );
      })}
      <button type="button" className="btn" onClick={() => onChange(BOBOT_BAWAAN)}>Kembalikan bobot bawaan</button>
    </div>
  );
}
