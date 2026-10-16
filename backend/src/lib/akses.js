import crypto from 'node:crypto';
import express, { Router } from 'express';
import { meta } from './meta.js';

/**
 * Gerbang password situs (SITE_PASSWORD). Setelah password benar, server memasang cookie sesi
 * bertanda tangan HMAC; seluruh /api (kecuali health dan endpoint sesi) mensyaratkan cookie itu.
 * Kosongkan SITE_PASSWORD untuk menonaktifkan.
 */
export const COOKIE = 'kdkmp_akses';
const UMUR_DETIK = 30 * 24 * 3600;
const BATAS_PERCOBAAN = 10;
const JENDELA_MS = 15 * 60 * 1000;
const TERBUKA = new Set(['/health', '/sesi', '/masuk', '/keluar']);

const sama = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function bacaCookie(req, nama) {
  for (const bagian of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = bagian.trim().split('=');
    if (k === nama) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function createAkses({ password, secret }) {
  const aktif = Boolean(password);
  // Kunci tanda tangan: SESSION_SECRET bila ada; bila tidak, diturunkan dari password (sesi gugur bila password diganti).
  const kunci = secret || crypto.createHash('sha256').update(`kdkmp-akses:${password}`).digest('hex');
  const tanda = (exp) => crypto.createHmac('sha256', kunci).update(String(exp)).digest('hex');
  const percobaan = new Map();

  const sah = (req) => {
    if (!aktif) return true;
    const nilai = bacaCookie(req, COOKIE);
    if (!nilai) return false;
    const [exp, sig] = nilai.split('.');
    return Number(exp) > Date.now() / 1000 && sama(sig, tanda(exp));
  };

  /** Middleware untuk /api: tolak 401 bila belum masuk. */
  const wajibMasuk = (req, res, next) => {
    if (!aktif || TERBUKA.has(req.path) || sah(req)) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Perlu password', perlu_masuk: true, meta: meta({ label_asal: 'Resmi' }) });
  };

  const routes = Router();
  routes.get('/sesi', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ perlu_password: aktif, masuk: sah(req) });
  });

  routes.post('/masuk', express.json(), (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!aktif) return res.status(204).end();
    const ip = req.ip ?? 'tidak-diketahui';
    const now = Date.now();
    const catatan = (percobaan.get(ip) ?? []).filter((t) => now - t < JENDELA_MS);
    if (catatan.length >= BATAS_PERCOBAAN) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }
    if (!sama(req.body?.password ?? '', password)) {
      catatan.push(now);
      percobaan.set(ip, catatan);
      return res.status(401).json({ error: 'Password salah' });
    }
    percobaan.delete(ip);
    const exp = Math.floor(now / 1000) + UMUR_DETIK;
    const aman = req.secure || req.get('x-forwarded-proto') === 'https';
    res.set('Set-Cookie', `${COOKIE}=${exp}.${tanda(exp)}; Max-Age=${UMUR_DETIK}; Path=/; HttpOnly; SameSite=Lax${aman ? '; Secure' : ''}`);
    return res.status(204).end();
  });

  routes.post('/keluar', (_req, res) => {
    res.set('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
    res.status(204).end();
  });

  return { aktif, wajibMasuk, routes };
}
