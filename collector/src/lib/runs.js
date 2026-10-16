import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const FILE = path.join(DATA_DIR, 'collector_runs.json');

async function readRuns() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return [];
  }
}

/** Catat satu run ke tabel collector_runs (JSON). */
export async function recordRun(run) {
  const runs = await readRuns();
  const id = runs.reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1;
  const row = { id, ...run };
  runs.push(row);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(`${FILE}.tmp`, JSON.stringify(runs, null, 2));
  await fs.rename(`${FILE}.tmp`, FILE);
  return row;
}

export async function updateRun(id, patch) {
  const runs = await readRuns();
  const next = runs.map((r) => (r.id === id ? { ...r, ...patch } : r));
  await fs.writeFile(`${FILE}.tmp`, JSON.stringify(next, null, 2));
  await fs.rename(`${FILE}.tmp`, FILE);
}

/** True bila target ini sudah diblokir hari ini dan sudah dicoba ulang sekali (Bagian 6.3). */
export async function blockedToday(target, date) {
  const runs = await readRuns();
  const blocked = runs.filter((r) => r.target === target && r.status === 'diblokir' && String(r.mulai).startsWith(date));
  return blocked.length >= 2;
}

/** Kirim notifikasi ke webhook (mis. n8n). Mengembalikan true bila terkirim. */
export async function notify(message, { env = process.env } = {}) {
  const url = env.N8N_WEBHOOK_URL;
  if (!url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sumber: 'kdkmp-mbg-collector', pesan: message, waktu: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    return true;
  } catch {
    return false;
  }
}
