#!/usr/bin/env node
/**
 * Penjadwal collector (pengganti Laravel scheduler).
 *   node src/scheduler/index.js            jalan terus (daemon)
 *   node src/scheduler/index.js --list     tampilkan jadwal dan waktu jalan berikutnya
 *   node src/scheduler/index.js --jalankan <nama>   jalankan satu job sekarang
 * Job dijalankan berurutan lewat antrean (satu proses Playwright pada satu waktu).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/paths.js';
import { notify } from '../lib/runs.js';
import { JADWAL } from './jadwal.js';
import { parseCron, cocok, berikutnya, formatWib } from './cron.js';

const BATAS_WAKTU_MS = 2 * 3600_000;
// Kode keluar run.js yang sudah mengirim notifikasi sendiri.
const SUDAH_LAPOR = new Set([0, 1]);

export function daftarJadwal(jobs = JADWAL, dari = new Date()) {
  return jobs.map((j) => ({ ...j, berikutnya: berikutnya(parseCron(j.cron), dari) }));
}

export function perintahJob(job) {
  return job.perintah ?? ['node', 'collector/src/run.js', ...job.args];
}

/** Jalankan satu job sebagai proses anak. Mengirim webhook bila gagal tanpa laporan sendiri. */
export function jalankanJob(job, { cwd = ROOT, env = process.env, batasMs = BATAS_WAKTU_MS, log = console.log } = {}) {
  const [cmd, ...args] = perintahJob(job);
  const mulai = Date.now();
  log(`[jadwal] mulai ${job.nama}: ${[cmd, ...args].join(' ')}`);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let ekor = '';
    const simpan = (d) => {
      ekor = (ekor + d.toString()).slice(-2000);
    };
    child.stdout.on('data', (d) => {
      simpan(d);
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      simpan(d);
      process.stderr.write(d);
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), batasMs);
    const selesai = async (code, signal, err) => {
      clearTimeout(timer);
      const detik = Math.round((Date.now() - mulai) / 1000);
      log(`[jadwal] selesai ${job.nama}: kode ${code ?? signal ?? err?.message} (${detik} dtk)`);
      if (err || signal || !SUDAH_LAPOR.has(code)) {
        const sebab = err ? err.message : signal ? `dihentikan (${signal}), kemungkinan melewati batas ${batasMs / 60000} menit` : `kode keluar ${code}`;
        await notify(`Job terjadwal ${job.nama} gagal: ${sebab}. ${ekor.trim().split('\n').slice(-3).join(' | ')}`, { env });
      }
      resolve({ code, signal, detik });
    };
    child.on('error', (err) => selesai(null, null, err));
    child.on('exit', (code, signal) => selesai(code, signal));
  });
}

function daemon() {
  const jobs = JADWAL.map((j) => ({ ...j, parsed: parseCron(j.cron) }));
  const antrean = [];
  const terakhir = new Map();
  let sibuk = false;

  if (!process.env.CONTACT_EMAIL?.trim()) {
    console.warn('[jadwal] PERINGATAN: CONTACT_EMAIL kosong; job jaringan akan menolak jalan (Bagian 10.4).');
  }
  if (!process.env.N8N_WEBHOOK_URL) console.warn('[jadwal] N8N_WEBHOOK_URL kosong; kegagalan hanya dicatat di log.');

  const proses = async () => {
    if (sibuk || !antrean.length) return;
    sibuk = true;
    const job = antrean.shift();
    await jalankanJob(job);
    sibuk = false;
    proses();
  };

  const tick = () => {
    const now = new Date();
    const kunci = Math.floor(now.getTime() / 60_000);
    for (const j of jobs) {
      if (terakhir.get(j.nama) === kunci || !cocok(j.parsed, now)) continue;
      terakhir.set(j.nama, kunci);
      if (antrean.some((x) => x.nama === j.nama)) continue;
      antrean.push(j);
      console.log(`[jadwal] antre ${j.nama} (${antrean.length} dalam antrean)`);
    }
    proses();
  };

  console.log(`[jadwal] aktif, ${jobs.length} job. Berikutnya:`);
  for (const j of daftarJadwal()) console.log(`  ${j.nama.padEnd(20)} ${formatWib(j.berikutnya)}`);
  tick();
  setInterval(tick, 20_000);
}

const isMain = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--list') {
    console.log('Nama                 Cron (WIB)      Berikutnya                Keterangan');
    for (const j of daftarJadwal()) {
      console.log(`${j.nama.padEnd(20)} ${j.cron.padEnd(15)} ${formatWib(j.berikutnya).padEnd(25)} ${j.keterangan}`);
    }
  } else if (argv[0] === '--jalankan') {
    const job = JADWAL.find((j) => j.nama === argv[1]);
    if (!job) {
      console.error(`Job tidak dikenal: ${argv[1]}. Tersedia: ${JADWAL.map((j) => j.nama).join(', ')}`);
      process.exit(2);
    }
    const r = await jalankanJob(job);
    process.exit(r.code ?? 1);
  } else {
    daemon();
  }
}
