import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { RAW_DIR } from './paths.js';
import { BlockedError, userAgent } from './http.js';
import { parseRobots, isAllowed } from './robots.js';

const LOCK = path.join(RAW_DIR, '.playwright.lock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Satu proses Playwright pada satu waktu (Bagian 10.4). Lock basi > 2 jam diabaikan. */
async function acquireLock() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  try {
    const st = await fs.stat(LOCK);
    if (Date.now() - st.mtimeMs < 2 * 3600_000) {
      throw new Error(`Proses Playwright lain sedang berjalan (lock ${LOCK}).`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await fs.writeFile(LOCK, String(process.pid));
}

const releaseLock = () => fs.rm(LOCK, { force: true });

/**
 * Peluncur Chromium. Lokal bisa memakai Chrome terpasang (PLAYWRIGHT_CHANNEL=chrome atau CHROME_PATH);
 * di server pakai Chromium dari `npx playwright-core install chromium`.
 */
export async function withBrowser(fn) {
  await acquireLock();
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.CHROME_PATH ? undefined : (process.env.PLAYWRIGHT_CHANNEL || undefined),
    executablePath: process.env.CHROME_PATH || undefined,
  });
  try {
    const context = await browser.newContext({ userAgent: userAgent(), locale: 'id-ID', viewport: { width: 1366, height: 900 } });
    return await fn(createSession(context));
  } finally {
    await browser.close();
    await releaseLock();
  }
}

/** Tanda tantangan CAPTCHA yang membutuhkan interaksi (reCAPTCHA v3 yang tak terlihat bukan tantangan). */
export async function detectChallenge(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 40 && r.height > 40 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1;
    };
    const frames = [...document.querySelectorAll('iframe')].filter((f) => /recaptcha\/.*bframe|hcaptcha|challenges\.cloudflare/i.test(f.src) && visible(f));
    if (frames.length) return `iframe tantangan: ${frames[0].src.slice(0, 80)}`;
    const cap = [...document.querySelectorAll('cap-widget, [data-cap-widget], .cap-widget')].filter(visible);
    if (cap.length) return 'widget Cap.js meminta interaksi';
    const text = (document.body?.innerText ?? '').slice(0, 2000);
    if (/verify you are human|verifikasi bahwa anda manusia|access denied|akses ditolak|too many requests/i.test(text)) return `teks blokir: ${text.slice(0, 80)}`;
    return null;
  });
}

/**
 * Ubah ukuran halaman setiap tabel Ant Design ke opsi terbesar supaya semua baris tampil (Bagian 6.3).
 * Mengembalikan [{ total, rows }] per tabel berpaginasi.
 */
export async function expandPagination(page) {
  const hasil = [];
  const pagers = page.locator('.ant-pagination');
  const n = await pagers.count();
  for (let i = 0; i < n; i++) {
    const pager = pagers.nth(i);
    const info = (await pager.innerText()).match(/dari\s+([\d.]+)\s+data/);
    const total = info ? Number(info[1].replace(/\./g, '')) : null;
    const select = pager.locator('.ant-pagination-options .ant-select');
    if ((await select.count()) && total) {
      await select.click();
      const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
      await options.first().waitFor({ timeout: 5000 });
      const texts = await options.allInnerTexts();
      const sizes = texts.map((t) => Number(t.match(/\d+/)?.[0] ?? 0));
      const maxIdx = sizes.indexOf(Math.max(...sizes));
      await options.nth(maxIdx).click();
      if (sizes[maxIdx] < total) {
        throw new Error(`Ukuran halaman maksimum ${sizes[maxIdx]} < ${total} baris; perlu klik per halaman.`);
      }
      await page.waitForFunction(
        ({ idx, total: t }) => {
          const pg = document.querySelectorAll('.ant-pagination')[idx];
          const table = pg?.closest('.ant-table-wrapper')?.querySelector('.ant-table-tbody');
          return table && table.querySelectorAll('tr[data-row-key]').length >= t;
        },
        { idx: i, total },
        { timeout: 30_000 },
      );
    }
    hasil.push({ total });
  }
  return hasil;
}

function createSession(context) {
  const robots = new Map();
  const lastHit = new Map();
  const delayMs = Math.max(3000, Number(process.env.COLLECTOR_DELAY_MS) || 3000);
  let pages = 0;

  async function allowed(u) {
    if (!robots.has(u.origin)) {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': userAgent() } }).catch(() => null);
      robots.set(u.origin, res?.ok ? parseRobots(await res.text(), 'KDKMP-MBG-Observatorium') : []);
    }
    return isAllowed(robots.get(u.origin), u.pathname + u.search);
  }

  return {
    get pages() { return pages; },
    /**
     * Buka halaman, tunggu sampai `ready(page)` true, lalu kembalikan page.
     * Berhenti dengan BlockedError pada 403/429, tantangan CAPTCHA, atau halaman kosong.
     */
    async open(url, { ready, timeoutMs = 60_000 } = {}) {
      const u = new URL(url);
      if (u.hostname === 'api.simkopdes.go.id') throw new Error('api.simkopdes.go.id tidak boleh dipanggil langsung.');
      if (!(await allowed(u))) throw new Error(`Dilarang robots.txt: ${u.pathname}`);

      const wait = (lastHit.get(u.hostname) ?? 0) + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastHit.set(u.hostname, Date.now());

      const page = await context.newPage();
      pages += 1;
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const status = res?.status() ?? 0;
      if (status === 403 || status === 429) throw new BlockedError(`HTTP ${status} dari ${u.hostname}`, status);

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const challenge = await detectChallenge(page);
        if (challenge) throw new BlockedError(`Tantangan CAPTCHA terdeteksi (${challenge}); tidak dicoba dilewati.`, 0);
        if (!ready || (await ready(page))) return page;
        await sleep(1000);
      }
      const len = await page.evaluate(() => document.body?.innerText.trim().length ?? 0);
      if (len < 50) throw new BlockedError('Halaman kosong setelah menunggu render.', 0);
      throw new Error(`Halaman tidak selesai dirender dalam ${timeoutMs / 1000} detik: ${url}`);
    },
  };
}
