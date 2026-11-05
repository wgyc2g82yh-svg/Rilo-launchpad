export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** Validate the decoded byte length, not only the base58 character count. */
export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(0);
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return false;
    number = number * BigInt(58) + BigInt(digit);
  }
  let bytes = 0;
  for (let remaining = number; remaining > 0; remaining >>= BigInt(8)) bytes++;
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}

export type MintInfo = {
  supply: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
  extensions?: { extension: string; state?: unknown }[];
};
export type LargestAccount = { address: string; amount: string };
export type Check = { title: string; state: "attention" | "observed" | "unavailable"; detail: string };
export type Scan = {
  mint: string;
  checkedAt: string;
  slot: number;
  program: "SPL Token" | "Token-2022";
  info: MintInfo;
  accounts: { address: string; share: number | null }[];
  topAccountsShare: number | null;
  checks: Check[];
  coverage: "partial";
};

/** Extension presence is a review signal, not proof an authority is active. */
export function extensionCheck(program: string, extensions: MintInfo['extensions']): Check {
  if (program === TOKEN_PROGRAM) return { title: 'Token extensions', state: 'observed', detail: 'This mint uses the original SPL Token program.' };
  const behaviors: Record<string, string> = {
    permanentDelegate: 'a mint-level delegate can transfer or burn holder tokens',
    transferHook: 'custom code can run during transfers',
    transferFeeConfig: 'transfer fees can affect received amounts',
    defaultAccountState: 'new accounts can default to frozen',
    nonTransferable: 'tokens cannot be transferred',
    pausableConfig: 'mint activity can be paused',
  };
  const configured = Array.isArray(extensions) ? [...new Set(extensions.map(item => item?.extension).filter(name => Object.hasOwn(behaviors, name)))] : [];
  return { title: 'Token extensions', state: configured.length ? 'attention' : 'unavailable', detail: configured.length
    ? `Review Token-2022 controls: ${configured.map(name => `${name} (${behaviors[name]})`).join('; ')}. Extension presence is observed; current authority, settings, custom code, and sellability require further verification.`
    : 'Token-2022 behavior is not fully analyzed. Missing or unrecognized extensions do not establish unrestricted transfers.' };
}

export function percentage(amount: string, supply: string): number | null {
  const total = BigInt(supply);
  if (total === BigInt(0)) return null;
  // Integer arithmetic retains precision for supplies beyond Number.MAX_SAFE_INTEGER.
  return Number(BigInt(amount) * BigInt(1_000_000) / total) / 10_000;
}

export function analyzeMint(mint: string, program: string, info: MintInfo, largest: LargestAccount[] | null, slot: number): Scan {
  if (![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(program)) throw new Error("Unsupported token program");
  if (!/^\d+$/.test(info.supply) || !Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 255 || !info.isInitialized
    || ![info.mintAuthority, info.freezeAuthority].every(authority => authority === null || typeof authority === "string" && isSolanaAddress(authority))) {
    throw new Error("Invalid mint data");
  }
  // Readings come from separate snapshots. Reject impossible or duplicated
  // holder totals as missing coverage instead of displaying over 100%.
  if (largest !== null) {
    const seen = new Set<string>();
    let total = 0n;
    for (const account of largest) {
      if (!isSolanaAddress(account.address) || !/^\d+$/.test(account.amount) || seen.has(account.address)) { largest = null; break; }
      seen.add(account.address); total += BigInt(account.amount);
    }
    if (total > BigInt(info.supply)) largest = null;
  }
  const accounts = (largest ?? []).map(account => {
    if (!isSolanaAddress(account.address) || !/^\d+$/.test(account.amount)) throw new Error("Invalid account data");
    return { address: account.address, share: percentage(account.amount, info.supply) };
  });
  const topAccountsShare = largest === null ? null : percentage(largest.reduce((total, account) => total + BigInt(account.amount), BigInt(0)).toString(), info.supply);
  const checks: Check[] = [
    { title: "Mint authority", state: info.mintAuthority ? "attention" : "observed", detail: info.mintAuthority ? "An authority can create additional token supply." : "Mint authority is revoked at this snapshot." },
    { title: "Freeze authority", state: info.freezeAuthority ? "attention" : "observed", detail: info.freezeAuthority ? "An authority can freeze token accounts." : "Freeze authority is revoked at this snapshot." },
    { title: "Largest token accounts", state: topAccountsShare === null ? "unavailable" : topAccountsShare >= 50 ? "attention" : "observed", detail: topAccountsShare === null ? "Largest-account data is unavailable." : `${accounts.length} token accounts hold ${topAccountsShare.toFixed(2)}% of supply. Accounts may be pools, exchanges, or multiple accounts belonging to one owner.` },
    extensionCheck(program, info.extensions),
    { title: "Bundle detection", state: "unavailable", detail: "Private bundle membership is not available. The wallet panel separately reports sampled public funding evidence." },
    { title: "Developer history", state: "unavailable", detail: "A creator is not inferred from the mint authority. See the verified creator panel when a matching Meteora pool exists." },
    { title: "Liquidity & sellability", state: "unavailable", detail: "No general liquidity-lock audit is performed. Trade preparation and pool state are shown separately." },
  ];
  return { mint, checkedAt: new Date().toISOString(), slot, program: program === TOKEN_PROGRAM ? "SPL Token" : "Token-2022", info, accounts, topAccountsShare, checks, coverage: "partial" };
}

export function formatSupply(raw: string, decimals: number): string {
  const padded = raw.padStart(decimals + 1, "0");
  const integer = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
}
