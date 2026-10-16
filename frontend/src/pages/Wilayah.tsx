import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Anak, Bobot, Detail, GeoFC, Resp, WilayahRow } from '../lib/api';
import { bobotQuery } from '../lib/api';
import { useApi } from '../lib/useApi';
import { angka, persen, rupiahSingkat, tanggal } from '../lib/format';
import { BobotPanel, BOBOT_BAWAAN } from '../components/BobotPanel';
import { PetaChoropleth, type TitikPeta } from '../components/PetaChoropleth';
import { TabelPeringkat } from '../components/TabelPeringkat';
import { Breadcrumb, Card, ErrorState, Loading, PageHead, Placeholder, Seg, SIMKOPDES, Sumber } from '../components/common';

type Indikator = 'indeks' | 'gerai_pct' | 'manajer_pct' | 'trx_per_kop';

const INDIKATOR: { value: Indikator; label: string; format: (v: number) => string }[] = [
  { value: 'indeks', label: 'Indeks', format: (v) => angka(v, 0) },
  { value: 'gerai_pct', label: 'Gerai %', format: (v) => persen(v, 0) },
  { value: 'manajer_pct', label: 'Manajer %', format: (v) => persen(v, 0) },
  { value: 'trx_per_kop', label: 'Transaksi/koperasi', format: (v) => rupiahSingkat(v) },
];

const LEVEL_LABEL: Record<string, string> = { provinsi: 'provinsi', kabupaten: 'kabupaten/kota', kecamatan: 'kecamatan' };

export function Wilayah() {
  const params = useParams();
  const segments = (params['*'] ?? '').split('/').filter(Boolean);
  const kode = segments.at(-1) ?? 'ID';
  const navigate = useNavigate();
  const [bobot, setBobot] = useState<Bobot>(BOBOT_BAWAAN);
  const [indikator, setIndikator] = useState<Indikator>('indeks');
  const bq = bobotQuery(bobot);

  const anak = useApi<Resp<Anak>>(`/api/wilayah/${kode}/anak?bobot=${bq}`);
  // Data lama dipertahankan selama memuat; jangan bentuk path geo dari level wilayah sebelumnya.
  const level = anak.data?.data.induk.kode === kode ? anak.data.data.level_anak : null;
  const geoPath = level ? `/api/geo/${level}?${level === 'provinsi' ? '' : `parent=${kode}&`}bobot=${bq}` : null;
  const geo = useApi<GeoFC>(geoPath);
  const detail = useApi<Resp<Detail>>(`/api/wilayah/${kode}`);
  const koperasi = useApi<Resp<Koperasi[]>>(level === 'kecamatan' ? `/api/koperasi?kode_kab=${kode}` : null);
  const [tampilTitik, setTampilTitik] = useState(true);

  const a = anak.data?.data;
  const tersedia = a?.komponen_tersedia ?? ['gerai', 'manajer', 'nib', 'rat', 'transaksi'];
  const tidakAda = (i: Indikator) => (i === 'gerai_pct' && !tersedia.includes('gerai')) || (i === 'manajer_pct' && !tersedia.includes('manajer'));
  const ind = tidakAda(indikator) ? 'indeks' : indikator;
  const indDef = INDIKATOR.find((i) => i.value === ind)!;

  const pilih = (kodeAnak: string) => {
    if (!a || level === 'kecamatan') return;
    const row = a.rows.find((r) => r.kode === kodeAnak);
    if (!row) return;
    navigate(`/wilayah/${[...segments, kodeAnak].join('/')}`);
  };

  const geoFc = useMemo(() => (geo.data && geo.data.features.length ? geo.data : null), [geo.data]);

  if (anak.error) return <ErrorState message={anak.error} />;
  if (!a) return <Loading />;

  const ada = a.rows.filter((r) => r.status_data === 'ada');
  const dim = anak.loading || geo.loading ? 'loading-dim' : '';
  const urut = ada.filter((r) => r.indeks !== null).sort((x, y) => (y.indeks ?? 0) - (x.indeks ?? 0));
  const judul = urut.length >= 2
    ? `Indeks kesiapan berkisar ${angka(urut.at(-1)!.indeks, 0)} (${urut.at(-1)!.nama}) sampai ${angka(urut[0].indeks, 0)} (${urut[0].nama})`
    : `Data ${LEVEL_LABEL[level ?? ''] ?? 'wilayah'} di ${a.induk.nama} baru sebagian terkumpul`;
  const namaKec = new Map(a.rows.map((r) => [r.kode, r.nama]));
  const kopAktif = (koperasi.data?.data ?? []).filter((k) => k.status === 'aktif');
  const kopTitik: TitikPeta[] = kopAktif
    .filter((k) => k.lokasi && k.lokasi_cocok !== false)
    .map((k) => ({
      id: k.slug,
      lokasi: k.lokasi!,
      judul: k.nama ?? k.slug,
      baris: [
        `Kec. ${namaKec.get(k.kode_kecamatan) ?? k.kode_kecamatan}`,
        `${angka(k.jumlah_anggota)} anggota (L ${angka(k.anggota_laki)} / P ${angka(k.anggota_perempuan)})`,
        `${angka(k.jumlah_gerai)} gerai · ${angka(k.jumlah_produk)} produk`,
      ],
      tautan: k.sumber_url ? [{ label: 'Profil di Simkopdes', url: k.sumber_url }] : [],
    }));
  const kopLuar = kopAktif.filter((k) => k.lokasi && k.lokasi_cocok === false);

  return (
    <>
      <PageHead
        eyebrow="Wilayah"
        title={judul}
        lede={`Peta dan peringkat ${LEVEL_LABEL[level ?? ''] ?? 'wilayah'} menurut Indeks Kesiapan Operasional. Klik wilayah untuk turun level.`}
      />
      <Breadcrumb items={a.leluhur} base="/wilayah" />

      {a.cakupan.ada < a.cakupan.total && (
        <div className="banner info" style={{ marginBottom: 12 }}>
          <span>
            Data {LEVEL_LABEL[level ?? '']} baru tersedia untuk <strong>{a.cakupan.ada} dari {a.cakupan.total}</strong> wilayah.
            Sisanya ditampilkan abu-abu sampai collector {level === 'kecamatan' ? 'sub-district' : 'district'} Simkopdes mengumpulkannya.
          </span>
        </div>
      )}

      <div className="split">
        <div className={`grid ${dim}`} style={{ alignContent: 'start' }}>
          <Card
            title={`Peta ${LEVEL_LABEL[level ?? ''] ?? ''}`}
            asal={ind === 'indeks' ? ['Resmi', 'Indeks'] : 'Resmi'}
            foot={<Sumber nama={SIMKOPDES} url={ada[0]?.sumber_url} tanggal={a.tanggal_data}>{geo.data?.atribusi && <span>· {geo.data.atribusi}</span>}</Sumber>}
          >
            <div className="toolbar">
              <Seg
                label="Indikator peta"
                value={ind}
                onChange={setIndikator}
                options={INDIKATOR.map((i) => ({
                  value: i.value,
                  label: i.label,
                  disabled: tidakAda(i.value),
                  title: tidakAda(i.value) ? 'Tidak tersedia di sumber untuk level ini' : undefined,
                }))}
              />
            </div>
            {geoFc ? (
              <PetaChoropleth
                fc={geoFc} properti={ind} format={indDef.format} judulIndikator={indDef.label}
                onPilih={level === 'kecamatan' ? undefined : pilih} atribusi={geo.data?.atribusi}
                titik={tampilTitik ? kopTitik : undefined} labelTitik="Koperasi (microsite)"
              />
            ) : geo.loading ? (
              <div className="map" />
            ) : (
              <Placeholder label="BATAS WILAYAH BELUM TERSEDIA">Batas poligon untuk level ini belum dimuat. Tabel di bawah tetap memuat seluruh wilayah.</Placeholder>
            )}
            {geo.data && !geo.data.poligon && geoFc && <p className="xs muted">Batas poligon belum dimuat untuk wilayah ini; titik menunjukkan titik tengah wilayah.</p>}
            {kopAktif.length > 0 && (
              <div className="xs muted" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={tampilTitik} onChange={(e) => setTampilTitik(e.target.checked)} />
                  Tampilkan titik koperasi
                </label>
                <span>
                  {kopTitik.length} titik dari {kopAktif.length} profil koperasi microsite; lokasi dari profil koperasi, bukan survei lapangan.
                  {kopLuar.length > 0 && ` ${kopLuar.length} titik tidak ditampilkan karena koordinatnya jatuh di luar kecamatannya (${kopLuar.map((k) => namaKec.get(k.kode_kecamatan) ?? k.kode_kecamatan).join(', ')}).`}
                </span>
              </div>
            )}
          </Card>

          <Card
            title={`Peringkat ${LEVEL_LABEL[level ?? ''] ?? ''}`}
            asal={['Resmi', 'Indeks']}
            foot={<Sumber nama={SIMKOPDES} tanggal={a.tanggal_data}>{tersedia.length < 5 && <span>· Indeks {tersedia.length} komponen</span>}</Sumber>}
          >
            <TabelPeringkat
              rows={a.rows}
              onPilih={level === 'kecamatan' ? undefined : (r: WilayahRow) => pilih(r.kode)}
              namaFile={`indeks_${a.induk.kode}_${a.tanggal_data ?? ''}.csv`}
              tampilkanGerai={tersedia.includes('gerai')}
              tampilkanManajer={tersedia.includes('manajer')}
            />
            {ada.some((r) => r.indeks === null) && (
              <p className="xs muted">Indeks tidak dihitung bila komponen yang tersedia kurang dari 3.</p>
            )}
          </Card>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <BobotPanel bobot={bobot} onChange={setBobot} tersedia={tersedia} />
          <DetailWilayah detail={detail.data?.data ?? null} />
        </div>
      </div>
      {level === 'kecamatan' && <KoperasiKabupaten rows={koperasi.data?.data ?? []} namaKec={namaKec} />}
    </>
  );
}

interface Koperasi {
  slug: string;
  nama: string | null;
  kode_kecamatan: string;
  jumlah_anggota?: number;
  anggota_laki?: number;
  anggota_perempuan?: number;
  jumlah_gerai?: number | null;
  jenis_usaha?: string[];
  jumlah_produk?: number;
  berita_terakhir?: string | null;
  diambil_pada: string;
  status: string;
  sumber_url?: string | null;
  lokasi?: [number, number] | null;
  lokasi_cocok?: boolean | null;
}

/** Profil koperasi dari microsite (kab pilot). Tanpa data pribadi: hanya agregat anggota. */
function KoperasiKabupaten({ rows, namaKec }: { rows: Koperasi[]; namaKec: Map<string, string> }) {
  if (rows.length === 0) return null;
  const aktif = rows.filter((r) => r.status === 'aktif').sort((x, y) => (x.kode_kecamatan + (x.nama ?? '')).localeCompare(y.kode_kecamatan + (y.nama ?? '')));
  const tanggalAmbil = rows.map((r) => r.diambil_pada).sort().at(-1)?.slice(0, 10) ?? null;
  return (
    <section className="section">
      <Card
        title={`Profil koperasi (${aktif.length} ditemukan dari ${rows.length} desa/kelurahan dicoba)`}
        asal="Resmi"
        foot={<Sumber nama="Microsite Simkopdes" url="https://simkopdes.go.id/" tanggal={tanggalAmbil}><span>· tanpa nama anggota atau pengurus</span></Sumber>}
      >
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="data">
            <thead>
              <tr><th>Koperasi</th><th>Kecamatan</th><th className="r">Anggota</th><th className="r">L / P</th><th className="r">Gerai</th><th className="r">Produk</th><th>Jenis usaha</th><th>Berita terakhir</th></tr>
            </thead>
            <tbody>
              {aktif.map((k) => (
                <tr key={k.slug}>
                  <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{k.sumber_url ? <a href={k.sumber_url} target="_blank" rel="noreferrer">{k.nama}</a> : k.nama}</td>
                  <td className="small">{namaKec.get(k.kode_kecamatan) ?? k.kode_kecamatan}</td>
                  <td className="r num">{angka(k.jumlah_anggota)}</td>
                  <td className="r num small">{angka(k.anggota_laki)} / {angka(k.anggota_perempuan)}</td>
                  <td className="r num">{angka(k.jumlah_gerai)}</td>
                  <td className="r num">{angka(k.jumlah_produk)}</td>
                  <td className="small" style={{ whiteSpace: 'normal', minWidth: 160 }}>{k.jenis_usaha?.join(', ') || '–'}</td>
                  <td className="small">{k.berita_terakhir ? tanggal(k.berita_terakhir) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function DetailWilayah({ detail }: { detail: Detail | null }) {
  if (!detail) return null;
  const s = detail.snapshot;
  const t = detail.turunan;
  return (
    <Card title={detail.wilayah.nama} asal="Resmi" foot={s ? <Sumber nama={SIMKOPDES} url={String(s.sumber_url ?? '')} tanggal={String(s.tanggal_data)} /> : undefined}>
      {!s ? (
        <Placeholder>Snapshot untuk wilayah ini belum dikumpulkan.</Placeholder>
      ) : (
        <>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0, fontSize: 13 }}>
            <dt className="muted">Koperasi</dt>
            <dd className="num" style={{ margin: 0 }}>{angka(s.jumlah_koperasi as number)}</dd>
            <dt className="muted">Nilai transaksi</dt>
            <dd className="num" style={{ margin: 0 }}>{rupiahSingkat(s.nilai_transaksi as number)}</dd>
            <dt className="muted">Per koperasi</dt>
            <dd className="num" style={{ margin: 0 }}>{rupiahSingkat(t?.trx_per_kop)}</dd>
            <dt className="muted">Gerai</dt>
            <dd className="num" style={{ margin: 0 }}>{t?.gerai !== null && t?.gerai !== undefined ? persen(t.gerai) : <span className="tag-missing">tidak tersedia</span>}</dd>
            <dt className="muted">Manajer aktif</dt>
            <dd className="num" style={{ margin: 0 }}>{t?.manajer !== null && t?.manajer !== undefined ? persen(t.manajer) : <span className="tag-missing">tidak tersedia</span>}</dd>
            <dt className="muted">Simpanan pokok</dt>
            <dd className="num" style={{ margin: 0 }}>{rupiahSingkat(s.simpanan_pokok as number | null)}</dd>
          </dl>
          <h3 className="card-title" style={{ marginTop: 14 }}>10 produk terlaris</h3>
          {detail.produk_terlaris.length ? (
            <ol className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
              {detail.produk_terlaris.map((p) => (
                <li key={p.peringkat}>
                  {p.nama_produk} <span className="num muted">{rupiahSingkat(p.nilai)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Placeholder>Produk terlaris untuk wilayah ini belum dikumpulkan (per {tanggal(String(s.tanggal_data))}).</Placeholder>
          )}
        </>
      )}
    </Card>
  );
}
