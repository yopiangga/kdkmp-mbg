import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Moon, Search, Sun } from 'lucide-react';
import { apiGet } from '../lib/api';
import { useTema } from '../lib/theme';
import { tanggal } from '../lib/format';

const NAV = [
  { to: '/ringkasan', label: 'Ringkasan', aktifUntuk: ['/ringkasan'] },
  { to: '/wilayah', label: 'Wilayah', aktifUntuk: ['/wilayah'] },
  { to: '/gap/fisik-usaha', label: 'Gap', aktifUntuk: ['/gap'] },
  { to: '/simulasi', label: 'Simulasi', aktifUntuk: ['/simulasi'] },
  { to: '/tentang', label: 'Tentang data', aktifUntuk: ['/tentang'] },
];

const SUB_GAP = [
  { to: '/gap/fisik-usaha', label: 'Fisik vs usaha' },
  { to: '/gap/usaha-mbg', label: 'Usaha & celah MBG' },
  { to: '/gap/permintaan', label: 'Permintaan vs kesiapan' },
  { to: '/gap/ekosistem', label: 'Ekosistem' },
];

interface Hasil {
  kode: string;
  nama: string;
  level: string;
  konteks: string;
  path: string;
}

const LEVEL: Record<string, string> = { provinsi: 'Provinsi', kabupaten: 'Kab/kota', kecamatan: 'Kecamatan' };

function CariWilayah() {
  const [q, setQ] = useState('');
  const [hasil, setHasil] = useState<Hasil[]>([]);
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState(0);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const kata = q.trim();
    if (kata.length < 2) {
      setHasil([]);
      return;
    }
    const t = setTimeout(() => {
      apiGet<{ data: Hasil[] }>(`/api/cari?q=${encodeURIComponent(kata)}`)
        .then((r) => {
          setHasil(r.data);
          setPilih(0);
          setBuka(true);
        })
        .catch(() => setHasil([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const tutup = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener('mousedown', tutup);
    return () => document.removeEventListener('mousedown', tutup);
  }, []);

  const pergi = (h: Hasil) => {
    navigate(h.path);
    setQ('');
    setBuka(false);
  };

  return (
    <div className="search" ref={box}>
      <label className="sr-only" htmlFor="cari-wilayah">Cari wilayah</label>
      <input
        id="cari-wilayah"
        role="combobox"
        aria-expanded={buka && hasil.length > 0}
        aria-controls="hasil-cari"
        autoComplete="off"
        placeholder="Cari provinsi, kab/kota, kecamatan…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hasil.length && setBuka(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setPilih((p) => Math.min(p + 1, hasil.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setPilih((p) => Math.max(p - 1, 0));
          } else if (e.key === 'Enter' && hasil[pilih]) {
            pergi(hasil[pilih]);
          } else if (e.key === 'Escape') {
            setBuka(false);
          }
        }}
      />
      <Search size={18} className="search-icon" aria-hidden />
      {buka && hasil.length > 0 && (
        <ul className="search-results" id="hasil-cari" role="listbox">
          {hasil.map((h, i) => (
            <li key={h.kode}>
              <button type="button" role="option" aria-selected={i === pilih} onMouseEnter={() => setPilih(i)} onClick={() => pergi(h)}>
                <span>
                  <span style={{ fontWeight: 600 }}>{h.nama}</span>
                  <br />
                  <span className="xs muted">{h.konteks}</span>
                </span>
                <span className="xs muted">{LEVEL[h.level]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopNav({ tanggalData }: { tanggalData: string | null }) {
  const { pathname } = useLocation();
  const { tema, setTema } = useTema();
  const diGap = pathname.startsWith('/gap');
  return (
    <>
      <header className="topnav">
        <Link to="/ringkasan" className="brand" aria-label="Observatorium KDKMP × MBG, beranda">
          <span className="brand-mark" aria-hidden><span /></span>
          <span style={{ minWidth: 0 }}>
            <div className="brand-title">KDKMP × MBG</div>
            <div className="brand-sub">Observatorium data publik</div>
          </span>
        </Link>
        <nav className="navlinks" aria-label="Navigasi utama">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={() => `navlink ${n.aktifUntuk.some((p) => pathname.startsWith(p)) ? 'active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-right">
          <CariWilayah />
          <span className="pill" title="Tanggal snapshot terakhir yang lolos validasi">
            <CalendarDays size={15} aria-hidden /> {tanggalData ? tanggal(tanggalData) : '…'}
          </span>
          <button type="button" className="icon-btn" onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')} aria-label={tema === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap'}>
            {tema === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      {diGap && (
        <nav className="sub-row" aria-label="Halaman lapis Gap">
          {SUB_GAP.map((s) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => `sub-tab ${isActive ? 'active' : ''}`}>
              {s.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
