// Layouts from pump-fun/pump-public-docs/idl/pump.json. Reject unknown
// owners/layouts instead of estimating graduation from market capitalization.
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
type Account = { owner?: string; executable?: boolean; data?: [string, string] } | null;
function bytes(account: Account, discriminator: number[], length: number): Buffer | null {
  if (!account || account.owner !== PUMP_PROGRAM || account.executable || !Array.isArray(account.data) || account.data[1] !== "base64") return null;
  const data = Buffer.from(account.data[0], "base64");
  return data.length >= length && data.subarray(0, 8).equals(Buffer.from(discriminator)) ? data : null;
}
export function pumpInitialReserves(account: Account) {
  const data = bytes(account, [167, 232, 232, 177, 200, 108, 114, 127], 105);
  if (!data) return null;
  const initial = data.readBigUInt64LE(89), supply = data.readBigUInt64LE(97);
  return initial > 0n && initial <= supply ? { initial, supply } : null;
}
export function pumpCurveProgress(account: Account, config: { initial: bigint; supply: bigint }) {
  const data = bytes(account, [23, 183, 248, 55, 96, 216, 172, 96], 49);
  if (!data || data[48] !== 0 || data.readBigUInt64LE(40) !== config.supply) return null;
  // Mayhem, non-native quote and recursive curves have different parameters.
  if (data.length > 81 && data[81] !== 0) return null;
  if (data.length >= 115 && !data.subarray(83, 115).every(byte => byte === 0)) return null;
  if (data.length > 141 && data[141] !== 0) return null;
  const remaining = data.readBigUInt64LE(24);
  if (remaining === 0n || remaining > config.initial) return null;
  return Number((config.initial - remaining) * 1_000_000n / config.initial) / 10_000;
}
