// Shared background revalidation normally absorbs refresh traffic. Recover in
// the request when it has fallen behind, rather than replaying an expired cache
// indefinitely on a serverless instance whose background refresh did not finish.
export async function readProviderSnapshot<T>(shared: () => Promise<{ value: T; receivedAt: number }>, recover: () => Promise<{ value: T; receivedAt: number }>, now = Date.now, maxAgeMs = 60_000) {
  const snapshot = await shared();
  return now() - snapshot.receivedAt > maxAgeMs ? recover() : snapshot;
}
