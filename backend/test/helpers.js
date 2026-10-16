import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { seed } from '../scripts/seed.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

/** Seed ke folder sementara supaya test tidak menyentuh data/db. */
export function seededDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdkmp-test-'));
  const { store } = seed({ dataDir: dir, fresh: true, log: () => {} });
  return { dir, store };
}

export async function startApp({ adminToken = 'rahasia-uji' } = {}) {
  const { dir } = seededDir();
  const { app, repo } = createApp({ dataDir: dir, seedDir: config.seedDir, adminToken, cacheSeconds: 3600 });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, repo, close: () => new Promise((r) => server.close(r)), adminToken };
}
