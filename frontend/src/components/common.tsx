import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Crumb, LabelAsal } from '../lib/api';
import { tanggal as fmtTanggal } from '../lib/format';
import { BadgeAsal } from './BadgeAsal';

export function PageHead({ eyebrow, title, lede, children }: { eyebrow: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="page-title">{title}</h1>
      {lede && <p className="page-lede">{lede}</p>}
      {children}
    </header>
  );
}

export function Card({ title, asal, children, foot, className = '', action }: {
  title?: ReactNode;
  asal?: LabelAsal | LabelAsal[];
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || asal || action) && (
        <div className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {action}
            {asal && <BadgeAsal asal={asal} />}
          </span>
        </div>
      )}
      {children}
      {foot && <div className="foot">{foot}</div>}
    </section>
  );
}

/** Catatan kaki sumber + tanggal, wajib di setiap angka (BRIEF Bagian 10.6). */
export function Sumber({ nama, url, tanggal, children }: { nama?: string; url?: string | null; tanggal?: string | null; children?: ReactNode }) {
  return (
    <>
      {tanggal !== undefined && <span>Per {fmtTanggal(tanggal)}</span>}
      {(nama || url) && (
        <span>
          Sumber:{' '}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              {nama ?? new URL(url).hostname}
              <ExternalLink size={11} style={{ marginLeft: 3, verticalAlign: -1 }} aria-hidden />
            </a>
          ) : (
            nama
          )}
        </span>
      )}
      {children}
    </>
  );
}

export const SIMKOPDES = 'Simkopdes, Kementerian Koperasi';

export function Placeholder({ label = 'DATA BELUM TERSEDIA', children }: { label?: string; children?: ReactNode }) {
  return (
    <div className="placeholder">
      <span className="tag-missing">[{label}]</span>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="state" role="status">
      <LoaderCircle size={18} className="spin" aria-hidden /> Memuat data…
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state" role="alert">
      <TriangleAlert size={18} aria-hidden style={{ verticalAlign: -3, marginRight: 6 }} />
      {message}. Pastikan backend berjalan (<code>npm run dev</code>).
    </div>
  );
}

export function Breadcrumb({ items, base }: { items: Crumb[]; base: string }) {
  const paths = items.slice(1).map((_, i) => `${base}/${items.slice(1, i + 2).map((x) => x.kode).join('/')}`);
  return (
    <nav className="crumbs" aria-label="Jejak wilayah">
      {items.map((c, i) => {
        const href = i === 0 ? base : paths[i - 1];
        const last = i === items.length - 1;
        return (
          <span key={c.kode} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {last ? <span className="here">{c.nama}</span> : <Link to={href}>{c.nama}</Link>}
            {!last && <ChevronRight size={13} className="muted" aria-hidden />}
          </span>
        );
      })}
    </nav>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
