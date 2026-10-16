#!/usr/bin/env node
/**
 * Backup harian.
 * - DATABASE_URL diisi → pg_dump format custom ke backups/kdkmp-<tgl>.dump
 * - selain itu (fase JSON) → arsip data/db ke backups/data-db-<tgl>.tar.gz
 * Menyimpan BACKUP_KEEP_DAYS terakhir (bawaan 14). Kegagalan dikirim ke N8N_WEBHOOK_URL.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR } from '../collector/src/lib/paths.js';
import { notify } from '../collector/src/lib/runs.js';

const BACKUP_DIR = path.resolve(ROOT, process.env.BACKUP_DIR || 'backups');
const KEEP = Number(process.env.BACKUP_KEEP_DAYS) || 14;
const tgl = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let file;
  if (process.env.DATABASE_URL) {
    file = path.join(BACKUP_DIR, `kdkmp-${tgl}.dump`);
    execFileSync('pg_dump', ['--format=custom', `--file=${file}`, process.env.DATABASE_URL], { stdio: 'inherit' });
  } else {
    if (!fs.existsSync(DATA_DIR)) throw new Error(`Folder data tidak ada: ${DATA_DIR}`);
    file = path.join(BACKUP_DIR, `data-db-${tgl}.tar.gz`);
    execFileSync('tar', ['-czf', file, '-C', path.dirname(DATA_DIR), path.basename(DATA_DIR)]);
  }
  const size = fs.statSync(file).size;
  if (size < 100) throw new Error(`Berkas backup terlalu kecil (${size} byte)`);

  // Rotasi: hapus backup buatan skrip ini yang melebihi KEEP hari.
  const batas = Date.now() - KEEP * 86_400_000;
  const dihapus = [];
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    const m = f.match(/^(?:kdkmp|data-db)-(\d{4}-\d{2}-\d{2})\.(?:dump|tar\.gz)$/);
    if (m && new Date(`${m[1]}T00:00:00Z`).getTime() < batas) {
      fs.rmSync(path.join(BACKUP_DIR, f));
      dihapus.push(f);
    }
  }
  return { file, size, dihapus };
}

try {
  const r = backup();
  console.log(`Backup: ${path.relative(ROOT, r.file)} (${(r.size / 1024).toFixed(0)} KB)${r.dihapus.length ? `; dihapus ${r.dihapus.join(', ')}` : ''}`);
} catch (e) {
  console.error(`Backup gagal: ${e.message}`);
  await notify(`Backup harian gagal: ${e.message}`);
  process.exit(1);
}
