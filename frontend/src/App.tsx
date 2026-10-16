import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TopNav } from './components/TopNav';
import { useApi } from './lib/useApi';
import { Loading } from './components/common';

const Ringkasan = lazy(() => import('./pages/Ringkasan').then((m) => ({ default: m.Ringkasan })));
const Wilayah = lazy(() => import('./pages/Wilayah').then((m) => ({ default: m.Wilayah })));
const FisikUsaha = lazy(() => import('./pages/FisikUsaha').then((m) => ({ default: m.FisikUsaha })));
const UsahaMbg = lazy(() => import('./pages/UsahaMbg').then((m) => ({ default: m.UsahaMbg })));
const Permintaan = lazy(() => import('./pages/Permintaan').then((m) => ({ default: m.Permintaan })));
const Ekosistem = lazy(() => import('./pages/Ekosistem').then((m) => ({ default: m.Ekosistem })));
const Simulasi = lazy(() => import('./pages/Simulasi').then((m) => ({ default: m.Simulasi })));
const TentangData = lazy(() => import('./pages/TentangData').then((m) => ({ default: m.TentangData })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));

export function App() {
  const { data: health } = useApi<{ ok: boolean; tanggal_data: string | null }>('/api/health');
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <TopNav tanggalData={health?.tanggal_data ?? null} />
      <main>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/ringkasan" replace />} />
          <Route path="/ringkasan" element={<Ringkasan />} />
          <Route path="/wilayah/*" element={<Wilayah />} />
          <Route path="/gap" element={<Navigate to="/gap/fisik-usaha" replace />} />
          <Route path="/gap/fisik-usaha" element={<FisikUsaha />} />
          <Route path="/gap/usaha-mbg" element={<UsahaMbg />} />
          <Route path="/gap/permintaan" element={<Permintaan />} />
          <Route path="/gap/ekosistem" element={<Ekosistem />} />
          <Route path="/simulasi" element={<Simulasi />} />
          <Route path="/tentang" element={<TentangData />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/ringkasan" replace />} />
        </Routes>
        </Suspense>
      </main>
      <footer className="site">
        Sumber: Simkopdes, Kementerian Koperasi; BGN; Kemenkeu (APBN KiTa); Bapanas; kode dan batas wilayah Kemendagri via cahyadsn/wilayah (MIT); citra satelit Esri; peta jalan OpenStreetMap.
        Data per koperasi tidak mencakup nama anggota atau pengurus. <Link to="/tentang">Metodologi dan sumber</Link>.
      </footer>
    </div>
  );
}
