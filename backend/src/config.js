import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Muat .env di root bila ada (tanpa dependensi tambahan). Variabel yang sudah diset tidak ditimpa.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT) || 4000,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data/db'),
  seedDir: path.join(ROOT, 'data/seed'),
  adminToken: process.env.ADMIN_TOKEN || '',
  // Password situs; kosong = tanpa gerbang password.
  sitePassword: process.env.SITE_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  cacheSeconds: Number(process.env.CACHE_SECONDS ?? (isProd ? 3600 : 0)),
  // Produksi: backend juga menyajikan hasil build frontend.
  staticDir: process.env.STATIC_DIR ? path.resolve(ROOT, process.env.STATIC_DIR) : isProd ? path.join(ROOT, 'frontend/dist') : null,
};
