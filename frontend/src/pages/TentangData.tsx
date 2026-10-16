import type { CollectorRun, Resp, Sumber as S } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka } from '../lib/format';
import { BadgeAsal } from '../components/BadgeAsal';
import { Card, PageHead } from '../components/common';

const waktu = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export function TentangData() {
  const sumber = useApi<Resp<Record<string, S>>>('/api/sumber');
  const status = useApi<Resp<{ terakhir: CollectorRun[]; riwayat: CollectorRun[] }>>('/api/collector/status');

  return (
    <>
      <PageHead
        eyebrow="Tentang data"
        title="Setiap angka di observatorium ini punya sumber, tanggal, dan label asal"
        lede="Halaman ini menjelaskan cara data dikumpulkan, cara indeks dihitung, dan batas-batas datanya."
      />

      <div className="grid grid-2">
        <Card title="Label asal data">
          <ul className="list-plain small">
            <li><BadgeAsal asal="Resmi" /> Diambil dari sumber resmi (dasbor Simkopdes, berkas wilayah Kemendagri, Coop Trade).</li>
            <li><BadgeAsal asal="Rilis" /> Angka dari siaran pers atau laporan berkala (BGN, Kemenkeu, Bapanas), diinput admin dan diverifikasi.</li>
            <li><BadgeAsal asal="Estimasi" /> Hasil hitungan dengan asumsi, misalnya kebutuhan bahan baku MBG dan simulasi.</li>
            <li><BadgeAsal asal="Indeks" /> Indeks atau klasifikasi buatan observatorium.</li>
          </ul>
        </Card>

        <Card title="Metodologi Indeks Kesiapan Operasional" asal="Indeks">
          <div className="prose small">
            <p style={{ marginTop: 0 }}>Skala 0–100 per wilayah, rata-rata berbobot dari lima komponen (bobot bawaan 1):</p>
            <ul>
              <li><code>gerai</code> = persentase pembangunan gerai</li>
              <li><code>manajer</code> = manajer aktif ÷ jumlah koperasi × 100</li>
              <li><code>nib</code> = koperasi ber-NIB ÷ jumlah koperasi × 100</li>
              <li><code>rat</code> = koperasi yang sudah RAT ÷ jumlah koperasi × 100</li>
              <li><code>transaksi</code> = log10(nilai transaksi ÷ jumlah koperasi), dinormalisasi min–max 0–100 antar wilayah sejenjang</li>
            </ul>
            <p>Di level kecamatan, data manajer dan gerai tidak tersedia, sehingga indeks memakai tiga komponen. Indeks tidak dihitung bila komponen yang tersedia kurang dari tiga.</p>
            <p>Kuadran fisik vs usaha memakai ambang bawaan gerai 80% dan transaksi Rp1 juta per koperasi; keduanya bisa diatur.</p>
            <p>Kebutuhan bahan baku MBG (estimasi) = penerima × Rp15.000 per porsi × 70% porsi bahan baku.</p>
          </div>
        </Card>
      </div>

      <section className="section">
        <Card title="Sumber dan jadwal pembaruan">
          {sumber.data ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Sumber</th><th>Frekuensi</th><th>Cara pengambilan</th></tr></thead>
                <tbody>
                  {Object.entries(sumber.data.data).map(([k, s]) => (
                    <tr key={k}>
                      <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.nama}</a> : s.nama}</td>
                      <td className="small" style={{ whiteSpace: 'normal', minWidth: 160 }}>{s.frekuensi}</td>
                      <td className="small" style={{ whiteSpace: 'normal', minWidth: 220 }}>{s.cara}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="small muted">Memuat…</p>}
        </Card>
      </section>

      <section className="section">
        <Card title="Status collector">
          {status.data && status.data.data.riwayat.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Target</th><th>Mulai</th><th>Status</th><th className="r">Baris</th><th>Pesan</th></tr></thead>
                <tbody>
                  {status.data.data.riwayat.map((r) => (
                    <tr key={r.id}>
                      <td>{r.target}</td>
                      <td className="small">{waktu(r.mulai)}</td>
                      <td><span className="tag-missing" style={{ borderStyle: 'solid' }}>{r.status}</span></td>
                      <td className="r num">{angka(r.jumlah_baris)}</td>
                      <td className="small" style={{ whiteSpace: 'normal', minWidth: 260 }}>{r.pesan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">Belum ada run collector.</p>
          )}
          <p className="xs muted">
            Collector membaca halaman dasbor yang sudah dirender seperti pengunjung biasa, satu proses pada satu waktu dengan jeda minimal 3 detik.
            Bila halaman sumber menampilkan CAPTCHA atau menolak akses, collector berhenti, mencatat status <code>diblokir</code>, dan data diperbarui lewat impor manual.
            Snapshot yang jumlah wilayahnya tidak cocok dengan total diberi status <code>perlu_cek</code> dan tidak dipublikasikan.
          </p>
        </Card>
      </section>

      <div className="grid grid-2 section">
        <Card title="Privasi">
          <p className="small" style={{ marginTop: 0 }}>
            Data per koperasi tidak mencakup nama anggota, pengurus, atau pengawas, foto, maupun NIK. Dari daftar anggota hanya disimpan jumlah anggota laki-laki dan perempuan;
            daftar aslinya dibuang di memori sebelum apa pun ditulis ke disk.
          </p>
        </Card>
        <Card title="Batas data">
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Sebagian alur tertutup: volume pasokan Agrinas, dana per SPPG, dan pembelian hasil petani oleh koperasi belum punya data publik.</li>
            <li>Data SPPG dan penerima MBG hanya tersedia sebagai angka nasional dari rilis berkala.</li>
            <li>Data kab/kota dan kecamatan mengikuti jadwal collector bergilir; cakupannya tampil di halaman Wilayah.</li>
            <li>Persentase pembangunan gerai dan pemetaan lahan hanya tersedia sampai level provinsi; manajer aktif sampai level kab/kota.</li>
            <li>Riwayat waktu mulai dikumpulkan sejak 15 Okt 2026; tren tampil setelah tiga snapshot.</li>
            <li>Klaim regulasi yang belum bisa diverifikasi ke JDIH tidak ditampilkan.</li>
          </ul>
        </Card>
      </div>

      <section className="section">
        <Card title="Atribusi">
          <p className="small" style={{ margin: 0 }}>
            Sumber: Simkopdes, Kementerian Koperasi · Badan Gizi Nasional · Kementerian Keuangan (APBN KiTa) · Badan Pangan Nasional · Kode wilayah Kemendagri
            (Kepmendagri No. 300.2.2-2430 Tahun 2025) via berkas wilayah Simkopdes · Kode kecamatan dan batas wilayah: cahyadsn/wilayah dan cahyadsn/wilayah_boundaries (lisensi MIT) · Citra satelit: Esri World Imagery (Esri, Maxar, Earthstar Geographics) · Peta jalan: © kontributor OpenStreetMap · Lokasi koperasi: profil microsite Simkopdes.
          </p>
        </Card>
      </section>
    </>
  );
}
