// Fetch helper with timeout, a single retry on network/5xx errors, and an injectable implementation for tests.

let fetchImpl = (...args) => globalThis.fetch(...args);
export function setFetch(fn) { fetchImpl = fn; }
export function resetFetch() { fetchImpl = (...args) => globalThis.fetch(...args); }

const UA = 'Mozilla/5.0 (compatible; IrelandJobMatcher/1.0; +https://github.com/somashekarpoojahs/jobsearch)';

export async function fetchJson(url, { method = 'GET', body, timeoutMs = 25000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method,
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
        err.status = res.status;
        if (res.status >= 500 && attempt < retries) { lastErr = err; continue; }
        throw err;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.status && err.status < 500) throw err;
      if (attempt >= retries) break;
    }
  }
  throw lastErr;
}

/** Run async fn over items with at most `limit` in flight. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch (err) { results[i] = { error: err }; }
    }
  });
  await Promise.all(workers);
  return results;
}
