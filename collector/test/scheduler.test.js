import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCron, cocok, berikutnya } from '../src/scheduler/cron.js';
import { JADWAL } from '../src/scheduler/jadwal.js';
import { jalankanJob, daftarJadwal } from '../src/scheduler/index.js';

const COLLECTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(COLLECTOR, '..');

// Penerima webhook lokal untuk mensimulasikan n8n.
let server;
let webhookUrl;
const diterima = [];
before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      diterima.push(JSON.parse(body));
      res.end('ok');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  webhookUrl = `http://127.0.0.1:${server.address().port}/webhook`;
});
after(() => server.close());

const at = (iso) => new Date(iso);

test('cron dievaluasi dalam WIB', () => {
  const harian6 = parseCron('0 6 * * *');
  assert.equal(cocok(harian6, at('2026-10-16T23:00:00Z')), true); // 06.00 WIB 17 Okt
  assert.equal(cocok(harian6, at('2026-10-17T06:00:00Z')), false); // 13.00 WIB
  const senin = parseCron('0 7 * * 1');
  assert.equal(berikutnya(senin, at('2026-10-16T03:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
  const bulanan = parseCron('0 5 1 * *');
  assert.equal(berikutnya(bulanan, at('2026-10-16T03:00:00Z')).toISOString(), '2026-10-31T22:00:00.000Z');
  assert.ok(parseCron('*/15 1-3 * * 1,3').menit.has(45));
  assert.throws(() => parseCron('61 * * * *'));
  assert.throws(() => parseCron('* * *'));
});

test('jadwal sesuai Fase 7: nasional harian 06.00 WIB, kab pilot & Coop Trade mingguan, wilayah bulanan', () => {
  const byNama = Object.fromEntries(daftarJadwal(JADWAL, at('2026-10-16T03:00:00Z')).map((j) => [j.nama, j]));
  assert.equal(byNama.nasional.cron, '0 6 * * *');
  assert.deepEqual(byNama['kabupaten-pilot'].args, ['kabupaten', '--pilot']);
  assert.equal(byNama.cooptrade.cron.split(' ')[4], '3');
  assert.equal(byNama.wilayah.cron, '0 5 1 * *');
  assert.ok(byNama.backup);
  // Tidak ada dua job jaringan pada menit yang sama
  const menit = JADWAL.filter((j) => j.args).map((j) => j.cron);
  assert.equal(new Set(menit).size, menit.length);
});

function runCli(args, env) {
  return new Promise((resolve) => {
    const p = spawn('node', ['src/run.js', ...args], { cwd: COLLECTOR, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => resolve({ code, out }));
  });
}

test('simulasi kegagalan collector memicu webhook dan tercatat di collector_runs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdkmp-runs-'));
  diterima.length = 0;
  const r = await runCli(['uji-gagal'], { DATA_DIR: dataDir, N8N_WEBHOOK_URL: webhookUrl });
  assert.equal(r.code, 1, r.out);
  assert.equal(diterima.length, 1);
  assert.match(diterima[0].pesan, /uji-gagal gagal: Simulasi kegagalan/);
  const runs = JSON.parse(fs.readFileSync(path.join(dataDir, 'collector_runs.json'), 'utf8'));
  assert.equal(runs.at(-1).status, 'gagal');
  assert.ok(runs.at(-1).selesai);
});

test('penjadwal mengirim webhook bila job gagal tanpa laporan sendiri (mis. kontak kosong)', async () => {
  diterima.length = 0;
  const env = { ...process.env, CONTACT_EMAIL: '', N8N_WEBHOOK_URL: webhookUrl, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'kdkmp-runs-')) };
  const r = await jalankanJob({ nama: 'nasional', args: ['nasional'] }, { cwd: ROOT, env, log: () => {} });
  assert.equal(r.code, 4);
  assert.equal(diterima.length, 1);
  assert.match(diterima[0].pesan, /nasional gagal: kode keluar 4/);
  assert.match(diterima[0].pesan, /CONTACT_EMAIL/);
});

test('penjadwal menghentikan job yang melewati batas waktu dan memberi notifikasi', async () => {
  diterima.length = 0;
  const env = { ...process.env, N8N_WEBHOOK_URL: webhookUrl };
  const r = await jalankanJob({ nama: 'lambat', perintah: ['node', '-e', 'setTimeout(()=>{}, 10000)'] }, { cwd: ROOT, env, batasMs: 300, log: () => {} });
  assert.equal(r.signal, 'SIGTERM');
  assert.equal(diterima.length, 1);
  assert.match(diterima[0].pesan, /lambat gagal: dihentikan/);
});

test('backup data/db menghasilkan arsip', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdkmp-db-'));
  fs.writeFileSync(path.join(dataDir, 'wilayah.json'), JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ kode: String(i) }))));
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdkmp-bak-'));
  fs.writeFileSync(path.join(backupDir, 'data-db-2020-01-01.tar.gz'), 'lama');
  const r = await new Promise((resolve) => {
    const p = spawn('node', ['scripts/backup.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: backupDir, DATABASE_URL: '' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => resolve({ code, out }));
  });
  assert.equal(r.code, 0, r.out);
  const files = fs.readdirSync(backupDir);
  assert.ok(files.some((f) => /^data-db-\d{4}-\d{2}-\d{2}\.tar\.gz$/.test(f) && f !== 'data-db-2020-01-01.tar.gz'));
  assert.ok(!files.includes('data-db-2020-01-01.tar.gz'), 'backup lama dirotasi');
});
