// Opt-in cache for public display data only. Never use for executable quotes,
// transactions, wallet permissions, or security verdicts.
export function createReadSnapshots(now = Date.now, maxAgeMs = 300_000) {
  type Entry = { value?: unknown; savedAt?: number; freshUntil?: number; retryAt?: number; error?: unknown };
  const entries = new Map<string, Entry>(), pending = new Map<string, Promise<{ value: unknown; stale: boolean }>>();
  async function read<T>(key: string, ttl: number, load: () => Promise<T>): Promise<{ value: T; stale: boolean }> {
    const entry = entries.get(key);
    const usable = () => entry?.savedAt !== undefined && now() - entry.savedAt <= maxAgeMs;
    if (entry?.freshUntil !== undefined && entry.freshUntil > now()) return { value: entry.value as T, stale: false };
    if (entry?.retryAt && entry.retryAt > now()) {
      if (usable()) return { value: entry.value as T, stale: true };
      throw entry.error;
    }
    if (pending.has(key)) return pending.get(key) as Promise<{ value: T; stale: boolean }>;
    const request = load().then(value => {
      if (entries.size >= 150 && !entries.has(key)) entries.delete(entries.keys().next().value!);
      entries.set(key, { value, savedAt: now(), freshUntil: now() + ttl });
      return { value, stale: false };
    }).catch(error => {
      const status = (error as { status?: number })?.status;
      // Input/authorization failures must not be replaced by old results.
      if (![429, 502, 503, 504].includes(status ?? 0)) throw error;
      const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
      const delay = Math.min(300_000, Math.max(10_000, Number.isFinite(retryAfterMs) ? retryAfterMs! : status === 429 ? 60_000 : 20_000));
      if (entries.size >= 150 && !entries.has(key)) entries.delete(entries.keys().next().value!);
      entries.set(key, { ...entry, retryAt: now() + delay, error });
      if (usable()) return { value: entry!.value as T, stale: true };
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  return { read };
}
