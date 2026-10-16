import { useEffect, useRef, useState } from 'react';
import { apiGet } from './api';

const cache = new Map<string, unknown>();

/**
 * Ambil data dari API. Saat path berubah, render sebelumnya dipertahankan (redup) sampai data baru datang,
 * supaya tidak ada lompatan tata letak.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(() => (path ? ((cache.get(path) as T) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path && !cache.has(path)));
  const current = useRef(path);

  useEffect(() => {
    current.current = path;
    if (!path) return;
    if (cache.has(path)) {
      setData(cache.get(path) as T);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        cache.set(path, d);
        if (current.current === path) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (current.current === path) setError(e.message);
      })
      .finally(() => {
        if (current.current === path) setLoading(false);
      });
  }, [path]);

  return { data, error, loading };
}

export const clearApiCache = () => cache.clear();
