import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Muat .env di root (variabel yang sudah diset tidak ditimpa).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data/db');
export const RAW_DIR = path.join(ROOT, 'data/raw');
export const SEED_DIR = path.join(ROOT, 'data/seed');

export const today = () => new Date().toISOString().slice(0, 10);
