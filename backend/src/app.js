import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { JsonStore } from './db/store.js';
import { createRepo } from './db/repo.js';
import { meta } from './lib/meta.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { createAkses } from './lib/akses.js';

export function createApp({
  dataDir = config.dataDir,
  seedDir = config.seedDir,
  adminToken = config.adminToken,
  cacheSeconds = config.cacheSeconds,
  staticDir = config.staticDir,
  sitePassword = config.sitePassword,
  sessionSecret = config.sessionSecret,
} = {}) {
  const repo = createRepo(new JsonStore(dataDir));
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // di belakang nginx: req.secure/req.ip dari X-Forwarded-*
  app.use(cors({ origin: true, credentials: true }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, tanggal_data: repo.tanggalTerakhir('ID') }));

  // Gerbang password situs (SITE_PASSWORD) untuk seluruh /api selain health dan sesi.
  const akses = createAkses({ password: sitePassword, secret: sessionSecret });
  app.use('/api', akses.routes);
  app.use('/api', akses.wajibMasuk);

  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, adminRoutes({ repo, adminToken }));

  app.use('/api', (req, res, next) => {
    // Saat dilindungi password, respons tidak boleh disimpan cache bersama (proxy/CDN).
    if (req.method === 'GET') res.set('Cache-Control', cacheSeconds > 0 ? `${akses.aktif ? 'private' : 'public'}, max-age=${cacheSeconds}` : 'no-cache');
    next();
  }, publicRoutes({ repo, seedDir }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan', meta: meta({ label_asal: 'Resmi' }) }));

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use('/assets', express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '365d' }));
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // Rute SPA (/wilayah/35/35.25, dst.) dilayani index.html.
    app.get('*', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err.status ?? err.statusCode ?? 500;
    res.status(status).json({ error: status === 500 ? 'Kesalahan server' : err.message, meta: meta({ label_asal: 'Resmi' }) });
  });

  return { app, repo };
}
