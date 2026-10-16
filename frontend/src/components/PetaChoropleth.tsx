import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cssVar, useTema } from '../lib/theme';

/** Batas kelas kuantil (5 kelas) dari nilai yang tersedia. */
export function kelasKuantil(values: number[]): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return [];
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return [...new Set([v[0], q(0.2), q(0.4), q(0.6), q(0.8), v[v.length - 1]])];
}

export interface TitikPeta {
  id: string;
  lokasi: [number, number]; // [lng, lat]
  judul: string;
  baris: string[];
  tautan?: { label: string; url: string }[];
}

const SEQ = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'];

// Basemap: citra satelit Esri World Imagery (dipakai juga oleh dasbor Simkopdes) dan OpenStreetMap.
const BASEMAP = {
  satelit: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opsi: { maxZoom: 19, attribution: 'Citra © Esri, Maxar, Earthstar Geographics' },
  },
  label: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    opsi: { maxZoom: 19 },
  },
  jalan: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opsi: { maxZoom: 19, attribution: '© kontributor OpenStreetMap' },
  },
};

export const tautanGoogleMaps = ([lng, lat]: [number, number]) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Radius titik mengikuti zoom supaya ratusan titik tidak saling menumpuk saat peta dilihat jauh. */
const radiusTitik = (z: number) => (z < 9.5 ? 2.5 : z < 10.5 ? 3.5 : z < 12 ? 5 : 6.5);

const PAD: L.FitBoundsOptions = { paddingTopLeft: [12, 12], paddingBottomRight: [12, 28], maxZoom: 13 };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

export function PetaChoropleth({ fc, properti, format, onPilih, judulIndikator, terpilih, titik, labelTitik = 'Koperasi' }: {
  fc: GeoJSON.FeatureCollection | null;
  properti: string;
  format: (v: number) => string;
  onPilih?: (kode: string) => void;
  judulIndikator: string;
  atribusi?: string | null;
  terpilih?: string | null;
  titik?: TitikPeta[];
  labelTitik?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const wilayah = useRef<L.GeoJSON | null>(null);
  const lapisTitik = useRef<L.LayerGroup | null>(null);
  const bingkai = useRef<L.LatLngBounds | null>(null);
  const digerakkan = useRef(false);
  const pilihRef = useRef(onPilih);
  pilihRef.current = onPilih;
  const fmtRef = useRef(format);
  fmtRef.current = format;
  const { tema } = useTema();

  const breaks = useMemo(() => {
    const vals = (fc?.features ?? []).map((f) => f.properties?.[properti]).filter((v): v is number => typeof v === 'number');
    return kelasKuantil(vals);
  }, [fc, properti]);

  // ---------- inisialisasi sekali
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, {
      center: [-2.5, 118],
      zoom: 4,
      zoomSnap: 0.25,
      scrollWheelZoom: false, // aktif setelah peta diklik, supaya gulir halaman tidak terjebak
    });
    // Atribusi batas wilayah ditampilkan di catatan kaki kartu; di peta cukup atribusi basemap agar ringkas di ponsel.
    m.attributionControl.setPrefix(false);

    const satelit = L.layerGroup([L.tileLayer(BASEMAP.satelit.url, BASEMAP.satelit.opsi), L.tileLayer(BASEMAP.label.url, BASEMAP.label.opsi)]).addTo(m);
    const jalan = L.tileLayer(BASEMAP.jalan.url, BASEMAP.jalan.opsi);
    L.control.layers({ Satelit: satelit, 'Peta jalan': jalan, Polos: L.layerGroup() }, undefined, { position: 'topright' }).addTo(m);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    m.on('click', () => m.scrollWheelZoom.enable());
    m.on('mouseout', () => m.scrollWheelZoom.disable());
    // Geser/zoom oleh pengguna menghentikan pembingkaian ulang otomatis.
    m.on('dragstart', () => {
      digerakkan.current = true;
    });
    m.on('zoomstart', (e) => {
      if ((e as L.LeafletEvent & { originalEvent?: Event }).originalEvent) digerakkan.current = true;
    });

    wilayah.current = L.geoJSON(undefined).addTo(m);
    lapisTitik.current = L.layerGroup().addTo(m);
    m.on('zoomend', () => {
      const r = radiusTitik(m.getZoom());
      lapisTitik.current?.eachLayer((l) => (l as L.CircleMarker).setRadius(r));
    });

    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      if (bingkai.current && !digerakkan.current) m.fitBounds(bingkai.current, PAD);
    });
    ro.observe(box.current);
    map.current = m;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- poligon wilayah (semi-transparan di atas citra)
  useEffect(() => {
    const m = map.current;
    const layer = wilayah.current;
    if (!m || !layer || !fc) return;
    const colors = SEQ.map(cssVar);
    const none = cssVar('--seq-none');
    const warnaDari = (v: unknown) => {
      if (typeof v !== 'number' || !breaks.length) return none;
      let i = breaks.findIndex((b, idx) => idx > 0 && v <= b) - 1;
      if (i < 0) i = 0;
      return colors[Math.min(i, colors.length - 1)];
    };
    const gaya = (f?: GeoJSON.Feature): L.PathOptions => ({
      color: '#ffffff',
      weight: f?.properties?.kode === terpilih ? 3 : 1,
      opacity: 0.9,
      fillColor: warnaDari(f?.properties?.[properti]),
      fillOpacity: f?.properties?.status_data === 'ada' ? 0.6 : 0.3,
    });

    layer.clearLayers();
    layer.options.style = gaya;
    layer.options.pointToLayer = (f, latlng) => L.circleMarker(latlng, { ...gaya(f), radius: 7, weight: 2, fillOpacity: 0.9 });
    layer.options.onEachFeature = (f, lyr) => {
      const v = f.properties?.[properti];
      const isi = f.properties?.status_data !== 'ada' ? 'Belum dikumpulkan' : typeof v === 'number' ? fmtRef.current(v) : 'Tidak tersedia';
      const tip = node('div');
      tip.append(node('strong', String(f.properties?.nama ?? '')), node('br'), document.createTextNode(`${judulIndikator}: ${isi}`));
      lyr.bindTooltip(tip, { sticky: true, direction: 'top' });
      lyr.on({
        mouseover: () => (lyr as L.Path).setStyle({ weight: 2.5, fillOpacity: 0.78 }),
        mouseout: () => (lyr as L.Path).setStyle(gaya(f)),
        click: () => pilihRef.current?.(String(f.properties?.kode)),
      });
    };
    layer.addData(fc);
    layer.bringToBack();

    // Bingkai wilayah yang sudah punya data (mis. tanpa Pulau Bawean bila datanya belum ada).
    const berdata = fc.features.filter((f) => f.properties?.status_data === 'ada');
    const fokus = berdata.length >= fc.features.length / 2 ? berdata : fc.features;
    const b = L.geoJSON({ type: 'FeatureCollection', features: fokus } as GeoJSON.FeatureCollection).getBounds();
    if (b.isValid() && bingkai.current?.toBBoxString() !== b.toBBoxString()) {
      bingkai.current = b;
      digerakkan.current = false;
      m.invalidateSize();
      m.fitBounds(b, PAD);
    }
  }, [fc, properti, breaks, terpilih, judulIndikator, tema]);

  // ---------- titik koperasi + tautan ke Google Maps
  useEffect(() => {
    const group = lapisTitik.current;
    if (!group) return;
    group.clearLayers();
    const merah = cssVar('--kop');
    const r = radiusTitik(map.current?.getZoom() ?? 10);
    for (const t of titik ?? []) {
      const [lng, lat] = t.lokasi;
      const mk = L.circleMarker([lat, lng], { radius: r, color: '#ffffff', weight: 1, fillColor: merah, fillOpacity: 1 });
      const isi = node('div');
      isi.append(node('strong', t.judul));
      for (const line of t.baris) isi.append(node('br'), document.createTextNode(line));
      const links = node('div', undefined, { class: 'popup-links' });
      for (const tl of [{ label: 'Buka di Google Maps', url: tautanGoogleMaps(t.lokasi) }, ...(t.tautan ?? [])]) {
        links.append(node('a', tl.label, { href: tl.url, target: '_blank', rel: 'noreferrer' }));
      }
      isi.append(links);
      mk.bindPopup(isi, { maxWidth: 280 });
      mk.bindTooltip(t.judul, { direction: 'top', offset: [0, -4] });
      // Tooltip nama tidak perlu selama popup lengkapnya terbuka.
      mk.on('popupopen', () => mk.closeTooltip());
      mk.on('tooltipopen', () => {
        if (mk.isPopupOpen()) mk.closeTooltip();
      });
      mk.addTo(group);
    }
  }, [titik, tema]);

  return (
    <div>
      <div ref={box} className="map" />
      <div className="legend" style={{ marginTop: 8 }} aria-label={`Legenda ${judulIndikator}`}>
        <span className="muted">{judulIndikator}:</span>
        {breaks.slice(0, -1).map((b, i) => (
          <span key={i}>
            <span className="swatch" style={{ background: `var(${SEQ[Math.min(i, SEQ.length - 1)]})` }} />
            <span className="num">{format(b)}–{format(breaks[i + 1])}</span>
          </span>
        ))}
        <span>
          <span className="swatch" style={{ background: 'var(--seq-none)' }} />
          belum ada data
        </span>
        {titik && titik.length > 0 && (
          <span>
            <span className="swatch" style={{ background: 'var(--kop)', borderRadius: '50%', border: '1.5px solid #fff' }} />
            {labelTitik} ({titik.length})
          </span>
        )}
      </div>
      <p className="xs muted" style={{ margin: '4px 0 0' }}>
        Klik peta untuk mengaktifkan zoom dengan roda tetikus. Ganti basemap (Satelit, Peta jalan, Polos) lewat tombol lapisan di kanan atas.
      </p>
    </div>
  );
}
