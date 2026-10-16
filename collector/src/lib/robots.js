/**
 * Parser robots.txt minimal: ambil aturan untuk user-agent kita, atau `*` bila tidak ada yang spesifik.
 * Mendukung Allow/Disallow dengan prefix, wildcard `*`, dan penanda akhir `$`. Aturan terpanjang menang.
 */
export function parseRobots(text, userAgent = 'KDKMP-MBG-Observatorium') {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (field === 'allow' || field === 'disallow') {
        current.rules.push({ allow: field === 'allow', path: value });
      }
    }
  }

  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || r.allow);
}

function ruleToRegex(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export function isAllowed(rules, urlPath) {
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue;
    if (ruleToRegex(r.path).test(urlPath)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) {
        best = r;
      }
    }
  }
  return best ? best.allow : true;
}
