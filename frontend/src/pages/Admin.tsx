import { useEffect, useState, type FormEvent } from 'react';
import type { Rilis } from '../lib/api';
import { apiSend, ApiError } from '../lib/api';
import { clearApiCache } from '../lib/useApi';
import { angka, tanggal } from '../lib/format';
import { Card, PageHead } from '../components/common';

const KOSONG = { indikator: '', nilai: '', satuan: '', kode_wilayah: 'ID', per_tanggal: '', sumber_nama: '', sumber_url: '', kutipan: '', status: 'draf' };

function useToken() {
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem('admin_token') ?? '';
    } catch {
      return '';
    }
  });
  const save = (t: string) => {
    setToken(t);
    try {
      sessionStorage.setItem('admin_token', t);
    } catch {
      /* abaikan */
    }
  };
  return [token, save] as const;
}

export function Admin() {
  const [token, setToken] = useToken();
  const [form, setForm] = useState(KOSONG);
  const [pesan, setPesan] = useState<string | null>(null);
  const [draf, setDraf] = useState<Rilis[]>([]);
  const [csv, setCsv] = useState('');
  const [tabel, setTabel] = useState<'rilis_angka' | 'kdkmp_snapshot_provinsi'>('rilis_angka');
  const [tglCsv, setTglCsv] = useState('');

  const muatDraf = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/rilis?status=draf', { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new ApiError(body.error, res.status);
      setDraf(body.data);
    } catch (e) {
      setPesan((e as Error).message);
    }
  };

  useEffect(() => {
    muatDraf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const kirim = async (ev: FormEvent) => {
    ev.preventDefault();
    try {
      await apiSend('POST', '/api/admin/rilis', token, { ...form, nilai: Number(form.nilai) });
      setPesan('Angka rilis tersimpan.');
      setForm(KOSONG);
      clearApiCache();
      muatDraf();
    } catch (e) {
      setPesan((e as Error).message);
    }
  };

  const verifikasi = async (id: number) => {
    try {
      await apiSend('PATCH', `/api/admin/rilis/${id}`, token, { status: 'terverifikasi' });
      clearApiCache();
      muatDraf();
    } catch (e) {
      setPesan((e as Error).message);
    }
  };

  const impor = async () => {
    const q = tabel === 'rilis_angka' ? 'tabel=rilis_angka' : `tabel=kdkmp_snapshot_provinsi&tanggal_data=${tglCsv}`;
    try {
      const r = await apiSend<{ data: { jumlah: number; status: string; masalah?: string[] } }>('POST', `/api/admin/impor-csv?${q}`, token, csv, 'text/csv');
      setPesan(`Impor ${r.data.jumlah} baris, status ${r.data.status}${r.data.masalah?.length ? `: ${r.data.masalah.join('; ')}` : ''}`);
      clearApiCache();
      muatDraf();
    } catch (e) {
      setPesan((e as Error).message);
    }
  };

  const field = (k: keyof typeof KOSONG, label: string, type = 'text', required = true) => (
    <label className="small" style={{ display: 'grid', gap: 4 }}>
      {label}
      <input className="input" type={type} required={required} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} step={type === 'number' ? 'any' : undefined} />
    </label>
  );

  return (
    <>
      <PageHead eyebrow="Admin" title="Tambah angka rilis dan impor data" lede="Angka dari rilis BGN, Kemenkeu, atau Bapanas. Angka hasil ekstraksi otomatis selalu draf sampai dikonfirmasi di sini." />
      <div className="toolbar">
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Token admin
          <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        </label>
        {pesan && <span className="small" role="status">{pesan}</span>}
      </div>

      <div className="grid grid-2">
        <Card title="Tambah angka rilis">
          <form onSubmit={kirim} style={{ display: 'grid', gap: 10 }}>
            {field('indikator', 'Indikator (mis. sppg_beroperasi)')}
            {field('nilai', 'Nilai', 'number')}
            {field('satuan', 'Satuan')}
            {field('kode_wilayah', 'Kode wilayah (ID, 35, 35.25)')}
            {field('per_tanggal', 'Per tanggal', 'date')}
            {field('sumber_nama', 'Nama sumber', 'text', false)}
            {field('sumber_url', 'URL sumber', 'url')}
            {field('kutipan', 'Kutipan singkat', 'text', false)}
            <label className="small" style={{ display: 'grid', gap: 4 }}>
              Status
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draf">draf</option>
                <option value="terverifikasi">terverifikasi</option>
              </select>
            </label>
            <button className="btn primary" type="submit" disabled={!token}>Simpan</button>
          </form>
        </Card>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={`Draf menunggu verifikasi (${draf.length})`}>
            {draf.length ? (
              <ul className="list-plain small">
                {draf.map((r) => (
                  <li key={r.id} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <strong>{r.indikator}</strong> {angka(r.nilai, 2)} {r.satuan} · {r.kode_wilayah} · {tanggal(r.per_tanggal)}
                      <br />
                      <a className="xs" href={r.sumber_url} target="_blank" rel="noreferrer">{r.sumber_url}</a>
                    </span>
                    <button type="button" className="btn" onClick={() => verifikasi(r.id)}>Verifikasi</button>
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">{token ? 'Tidak ada draf.' : 'Isi token untuk melihat draf.'}</p>}
          </Card>

          <Card title="Impor CSV">
            <div className="toolbar">
              <select className="input" value={tabel} onChange={(e) => setTabel(e.target.value as typeof tabel)}>
                <option value="rilis_angka">rilis_angka (data PPID/rilis)</option>
                <option value="kdkmp_snapshot_provinsi">Snapshot provinsi (format Lampiran A)</option>
              </select>
              {tabel === 'kdkmp_snapshot_provinsi' && <input className="input" type="date" value={tglCsv} onChange={(e) => setTglCsv(e.target.value)} aria-label="Tanggal data" />}
            </div>
            <textarea className="input" style={{ width: '100%', minHeight: 140, fontFamily: 'var(--font-mono)', fontSize: 12 }} value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder={tabel === 'rilis_angka' ? 'indikator,nilai,satuan,kode_wilayah,per_tanggal,sumber_url,kutipan' : 'provinsi,jumlah_koperasi,manajer_aktif,...'} />
            <button type="button" className="btn primary" style={{ marginTop: 8 }} disabled={!token || !csv} onClick={impor}>Impor</button>
            <p className="xs muted">Snapshot provinsi yang jumlahnya tidak cocok dengan total nasional ditandai perlu_cek dan tidak dipublikasikan.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
