import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

/** Layar password sebelum dasbor (SITE_PASSWORD di server). */
export function Masuk({ onBerhasil }: { onBerhasil: () => void }) {
  const [password, setPassword] = useState('');
  const [pesan, setPesan] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);

  const masuk = async (e: FormEvent) => {
    e.preventDefault();
    setKirim(true);
    setPesan(null);
    try {
      const res = await fetch('/api/masuk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onBerhasil();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setPesan(body.error ?? 'Gagal masuk');
    } catch {
      setPesan('Server tidak dapat dihubungi');
    } finally {
      setKirim(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={masuk} className="card" style={{ width: 'min(420px, 100%)', padding: 'clamp(24px, 4vw, 40px)' }}>
        <div className="brand" style={{ marginBottom: 28 }}>
          <span className="brand-mark" aria-hidden><span /></span>
          <span>
            <div className="brand-title">KDKMP × MBG</div>
            <div className="brand-sub">Observatorium data publik</div>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 6 }}>
          <span className="hero-icon" style={{ width: 44, height: 44 }} aria-hidden><LockKeyhole size={20} /></span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Masuk ke dasbor</h1>
        </div>
        <p className="small muted" style={{ margin: '0 0 20px' }}>Masukkan password untuk membuka dasbor.</p>
        <label htmlFor="password" className="sr-only">Password</label>
        <input
          id="password"
          type="password"
          className="input"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', height: 48, padding: '0 20px', fontSize: 15 }}
          aria-invalid={Boolean(pesan)}
          aria-describedby={pesan ? 'pesan-masuk' : undefined}
        />
        {pesan && <p id="pesan-masuk" role="alert" className="small" style={{ color: 'var(--crit)', margin: '10px 4px 0' }}>{pesan}</p>}
        <button type="submit" className="btn primary" disabled={kirim || !password} style={{ width: '100%', justifyContent: 'center', height: 48, marginTop: 16, fontSize: 15 }}>
          {kirim ? 'Memeriksa…' : 'Masuk'} <ArrowRight size={16} aria-hidden />
        </button>
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <span className="prisma-mark" aria-label="Dikembangkan oleh prisma">prisma</span>
        </div>
      </form>
    </main>
  );
}
