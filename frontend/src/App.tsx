import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TopNav } from './components/TopNav';
import { clearApiCache, useApi } from './lib/useApi';
import { EVENT_PERLU_MASUK } from './lib/api';
import { Masuk } from './pages/Masuk';
import { Loading } from './components/common';

const Ringkasan = lazy(() => import('./pages/Ringkasan').then((m) => ({ default: m.Ringkasan })));
const Wilayah = lazy(() => import('./pages/Wilayah').then((m) => ({ default: m.Wilayah })));
const FisikUsaha = lazy(() => import('./pages/FisikUsaha').then((m) => ({ default: m.FisikUsaha })));
const UsahaMbg = lazy(() => import('./pages/UsahaMbg').then((m) => ({ default: m.UsahaMbg })));
const Ekosistem = lazy(() => import('./pages/Ekosistem').then((m) => ({ default: m.Ekosistem })));
const Simulasi = lazy(() => import('./pages/Simulasi').then((m) => ({ default: m.Simulasi })));
const TentangData = lazy(() => import('./pages/TentangData').then((m) => ({ default: m.TentangData })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));

interface Sesi {
  perlu_password: boolean;
  masuk: boolean;
}

export function App() {
  // Gerbang password: cek sesi sekali di awal; respons 401 dari API mengembalikan ke layar masuk.
  const [sesi, setSesi] = useState<Sesi | null>(null);
  const cekSesi = useCallback(() => {
    fetch('/api/sesi', { credentials: 'include' })
      .then((r) => r.json())
      .then((s: Sesi) => setSesi(s))
      .catch(() => setSesi({ perlu_password: false, masuk: true }));
  }, []);
  useEffect(() => {
    cekSesi();
    const keluarPaksa = () => {
      clearApiCache();
      setSesi((s) => (s ? { ...s, masuk: false } : s));
    };
    window.addEventListener(EVENT_PERLU_MASUK, keluarPaksa);
    return () => window.removeEventListener(EVENT_PERLU_MASUK, keluarPaksa);
  }, [cekSesi]);
  const keluar = async () => {
    await fetch('/api/keluar', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    clearApiCache();
    setSesi((s) => (s ? { ...s, masuk: false } : s));
  };

  if (!sesi) return null;
  if (sesi.perlu_password && !sesi.masuk) {
    return <Masuk onBerhasil={() => { clearApiCache(); setSesi({ ...sesi, masuk: true }); }} />;
  }
  return <Aplikasi onKeluar={sesi.perlu_password ? keluar : undefined} />;
}

function Aplikasi({ onKeluar }: { onKeluar?: () => void }) {
  const { data: health } = useApi<{ ok: boolean; tanggal_data: string | null }>('/api/health');
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <TopNav tanggalData={health?.tanggal_data ?? null} onKeluar={onKeluar} />
      <main>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/ringkasan" replace />} />
          <Route path="/ringkasan" element={<Ringkasan />} />
          <Route path="/wilayah/*" element={<Wilayah />} />
          <Route path="/gap" element={<Navigate to="/gap/fisik-usaha" replace />} />
          <Route path="/gap/fisik-usaha" element={<FisikUsaha />} />
          <Route path="/gap/usaha-mbg" element={<UsahaMbg />} />
          <Route path="/gap/permintaan" element={<Navigate to="/gap/fisik-usaha" replace />} />
          <Route path="/gap/ekosistem" element={<Ekosistem />} />
          <Route path="/simulasi" element={<Simulasi />} />
          <Route path="/tentang" element={<TentangData />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/ringkasan" replace />} />
        </Routes>
        </Suspense>
      </main>
      <footer className="site footer-row">
        <span style={{ maxWidth: '100ch' }}>
          Sumber: Simkopdes, Kementerian Koperasi; BGN; Kemenkeu (APBN KiTa); Bapanas; kode dan batas wilayah Kemendagri via cahyadsn/wilayah (MIT); citra satelit Esri; peta jalan OpenStreetMap.
          Data per koperasi tidak mencakup nama anggota atau pengurus. <Link to="/tentang">Metodologi dan sumber</Link>.
        </span>
        <span className="prisma-mark" aria-label="Dikembangkan oleh prisma">prisma</span>
      </footer>
    </div>
  );
}
