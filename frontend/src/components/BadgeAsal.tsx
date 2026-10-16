import type { LabelAsal } from '../lib/api';

const PENJELASAN: Record<LabelAsal, string> = {
  Resmi: 'Diambil dari sumber resmi (dasbor/berkas pemerintah).',
  Rilis: 'Dari siaran pers atau laporan berkala, diinput manual dan diverifikasi.',
  Estimasi: 'Hasil hitungan dengan asumsi; bukan angka realisasi.',
  Indeks: 'Indeks atau klasifikasi buatan observatorium.',
};

export function BadgeAsal({ asal }: { asal: LabelAsal | LabelAsal[] }) {
  const list = Array.isArray(asal) ? asal : [asal];
  return (
    <span className="badges">
      {list.map((a) => (
        <span key={a} className={`badge badge-${a.toLowerCase()}`} title={PENJELASAN[a]}>
          {a}
        </span>
      ))}
    </span>
  );
}
