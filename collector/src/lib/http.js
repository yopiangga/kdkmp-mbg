import { parseRobots, isAllowed } from './robots.js';

export class BlockedError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BlockedError';
    this.status = status;
  }
}

export function userAgent() {
  const contact = process.env.CONTACT_EMAIL?.trim();
  return `KDKMP-MBG-Observatorium/0.1${contact ? ` (+${contact})` : ''}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Klien HTTP sopan (Bagian 10.4–10.5): cek robots.txt per domain di awal, jeda ≥ 3 detik
 * antar request ke domain yang sama, kuota harian, dan berhenti saat 403/429.
 */
export function createPoliteClient({
  delayMs = Math.max(3000, Number(process.env.COLLECTOR_DELAY_MS) || 3000),
  quota = Number(process.env.COLLECTOR_DAILY_QUOTA) || 500,
  fetchImpl = globalThis.fetch,
} = {}) {
  const robotsCache = new Map();
  const lastHit = new Map();
  let used = 0;

  async function throttle(host) {
    const wait = (lastHit.get(host) ?? 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
  }

  async function rulesFor(origin, host) {
    if (robotsCache.has(origin)) return robotsCache.get(origin);
    await throttle(host);
    used += 1;
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': userAgent() } });
    const rules = res.ok ? parseRobots(await res.text(), 'KDKMP-MBG-Observatorium') : [];
    robotsCache.set(origin, rules);
    return rules;
  }

  async function request(url, init = {}) {
    const u = new URL(url);
    if (u.hostname === 'api.simkopdes.go.id') {
      throw new Error('api.simkopdes.go.id tidak boleh dipanggil langsung (Bagian 6.3 / 10.1).');
    }
    if (used >= quota) throw new Error(`Kuota harian ${quota} request tercapai.`);

    const rules = await rulesFor(u.origin, u.hostname);
    if (!isAllowed(rules, u.pathname + u.search)) {
      throw new Error(`Dilarang robots.txt: ${u.pathname}`);
    }

    await throttle(u.hostname);
    used += 1;
    const res = await fetchImpl(url, {
      ...init,
      headers: { 'User-Agent': userAgent(), Accept: 'application/json, text/html;q=0.9', ...(init.headers ?? {}) },
    });
    if (res.status === 403 || res.status === 429) {
      throw new BlockedError(`HTTP ${res.status} dari ${u.hostname}`, res.status);
    }
    return res;
  }

  return { request, get used() { return used; }, get remaining() { return quota - used; } };
}
