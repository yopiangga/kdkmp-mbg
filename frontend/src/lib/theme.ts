import { useEffect, useState } from 'react';

export type Tema = 'light' | 'dark';

function resolved(): Tema {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Tema aktif (mengikuti OS bila belum dipilih) + setter yang mengingat pilihan pengunjung. */
export function useTema() {
  const [tema, setTemaState] = useState<Tema>(resolved);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTemaState(resolved());
    mq.addEventListener('change', onChange);
    window.addEventListener('tema', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('tema', onChange);
    };
  }, []);

  const setTema = (t: Tema) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem('tema', t);
    } catch {
      /* penyimpanan bisa diblokir; tema tetap berlaku untuk sesi ini */
    }
    window.dispatchEvent(new Event('tema'));
  };

  return { tema, setTema };
}

/** Baca nilai token CSS saat ini (dipakai ECharts/MapLibre yang butuh warna literal). */
export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
