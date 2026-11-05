# RILO launchpad

Next.js 15 app with the metallic landing page at `/` and the launchpad at `/app`.

## Integrated services

| Feature | Implementation and coverage |
| --- | --- |
| Discover | GeckoTerminal Solana mainnet trending and new indexed pools, cached refresh, actual price/volume/liquidity, provider timestamps |
| Market terminal | Five-minute OHLCV candles and white volume bars using Lightweight Charts; selectable indexed pool |
| DEX trading | Jupiter Swap V2 order → Phantom signature → managed execution; wallet-bound transaction tickets and confirmation reporting |
| Bonding-curve trading | Direct Meteora DBC quote, slippage minimum, simulation, Phantom signature, RPC submission and confirmation for active original-SPL/SOL curves |
| Token launch | 0.5 SOL native on-chain creation fee plus rent/network costs; creator-signed profile authorization, immutable content-addressed metadata upload to Supabase, Meteora DBC pool/mint preparation, simulation, new mint partial signature and creator wallet approval |
| Launch configuration | Treasury-only builder with operator-entered supply, starting/graduation market caps in SOL and trading fee; fixed supply, immutable metadata, no creator vesting, no first buy, no base transfer tax |
| Creator rebate | 1% of distributable platform curve trading fees after protocol fees, enforced by the configured DBC account; creator claims accrued curve fees with their own wallet |
| Liquidity at graduation | DAMM v2 migration via Meteora's migration infrastructure; 100% of graduated LP positions permanently locked, 99% platform / 1% creator fee rights |
| Treasury | Platform curve fee claim and explicit SOL-budget Jupiter buyback into the configured treasury wallet |
| Creator history | Verified Meteora pool creator and returned Meteora launch records; no creator inference from mint authority, no rug-history verdict |
| Wallet analysis | Owners of up to 12 largest token accounts and up to 4 recent successful transactions for each of 6 sampled owners; shared SOL sender evidence includes signatures and slots |
| Token controls | Mint/freeze authorities, supply, token program and largest token-account distribution through the configured Solana RPC |

Market rankings and shared funding are observations, not safety ratings. Pools, exchanges and service wallets can create benign concentration and funding relationships. No private-bundle attribution, cross-program full-history index, independent global rug classifier or clean-launch verdict is implemented. Security reports now include attributed RugCheck warnings and a bounded sample of the verified Meteora creator’s other launches. Token-2022 extension behavior is not fully analyzed, and direct curve trading is limited to original SPL tokens with SOL quotes. Graduated LP fees are claimed through Meteora; the in-app fee claim covers accrued DBC curve fees.

Buybacks are treasury-wallet-approved swaps, not an unattended trading bot. The operator chooses a budget after collecting fees; this version does not automatically allocate treasury deposits, burn purchased tokens, or promise returns. Jupiter referral fee collection is optional and requires properly initialized referral accounts; quotes display the provider's returned total fee.

## Run and verify

Use Node.js 22.18+ (CI uses Node 24).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npm run test:api
npm audit --omit=dev
```

The public market feed and wallet-free Jupiter quotes work without API keys within provider limits. On-chain analysis needs `SOLANA_RPC_URL`. Wallet actions additionally require the origin, signing secret and relevant provider configuration below. No placeholder statistics or simulated wallet approvals are used in the app.

## Activation

All wallet actions are built for explicit visitor approval in Phantom. No wallet seed, signing key, treasury key or mint private key belongs in server environment variables. A new mint/config signer is generated in the visitor's browser and retained in memory only until signing.

1. Deploy the app from this repository to the existing Vercel project. The app lives at `/app`.
2. Configure server-only environment variables in the hosting dashboard:

| Variable | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Helius or another compatible RPC; start with devnet for transaction testing |
| `APP_ORIGIN` | Exact public origin, e.g. `https://riloprotocol.xyz`, without `/app` |
| `APP_SIGNING_SECRET` | Cryptographically random secret of at least 32 characters for short-lived action tickets; use one stable value across instances |
| `SUPABASE_URL` | Metadata storage project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage credential |
| `TOKEN_METADATA_BUCKET` | Defaults to `token-metadata` |
| `RILO_TREASURY_ADDRESS` | Public treasury wallet address; only this wallet can initialize the platform config or claim partner fees |
| `RILO_DBC_CONFIG` | Public config address produced by the confirmed treasury setup transaction |
| `RILO_TOKEN_MINT` | Public RILO token mint, required for buyback quotes |
| `JUPITER_API_KEY` | Production API key; optional for limited keyless prototyping |
| `JUPITER_REFERRAL_ACCOUNT` / `JUPITER_REFERRAL_FEE_BPS` | Optional explicit referral setup; omitted by default |
| `ENABLE_MAINNET_TRANSACTIONS` | Defaults to false; keep false until devnet transaction flows are verified |

The native launch fee is fixed at **0.5 SOL** (500,000,000 lamports) in every new platform config. Activation rejects configs with another fee, including older zero-fee configs. Meteora retains 10% (0.05 SOL); the treasury claims 0.45 SOL per launch using **Prepare launch fee claim**, separately from trading fee claims. Pool creation and its fee are atomic; rejected launches do not pay the creation fee, although network fees can still apply.

3. Run `supabase/token-metadata.sql` once in Supabase's SQL editor. The bucket is publicly readable for token metadata; no public upload policy is added. Server uploads require a verified creator signature and use immutable hash-based paths.
4. With devnet RPC configured, connect the treasury wallet in Phantom. Open Launch → Fee Engine → Initialize platform bonding curve. Enter the economics, review the summary, and approve the configuration transaction in the wallet. Rent and protocol costs are additional to the estimated network fee.
5. After on-chain confirmation, set the returned public address as `RILO_DBC_CONFIG` and redeploy. Launch activation validates the actual config: SOL quote, fixed supply, immutable token metadata, 1% creator fee share, no creator vesting/extra migration levy and 100% permanently locked LP allocation.
6. Complete devnet launch, direct-curve buy/sell and fee-claim checks. The automated fixtures do not replace a real wallet/devnet run.
7. Create a separate mainnet configuration with reviewed economics and set the mainnet RPC/config addresses. Enable `ENABLE_MAINNET_TRANSACTIONS=true` only for that reviewed deployment. Jupiter swaps are mainnet-only; market charts/feed also show mainnet. Transaction construction/submission verifies the full network genesis hash.

### Public APIs

Existing `/api/solana/status`, `/api/solana/scan` and inherited `/api/waitlist` remain. The waitlist requires its existing Supabase table and should have bot/rate protection before promotion.

`/api/rilo/` routes:

- GET `status`, `discover?mode=trending|new`, `market?mint=...`, `chart?pool=...&side=base|quote`
- GET `order`, `curve/order`, `pool?mint=...`, `wallets?mint=...`, `curve`, `transaction?signature=...`
- POST `launch/challenge`, `launch/prepare`, `curve/prepare`, `fees/claim`, `buyback/order`, `swap/execute`, `transaction/submit`

POSTs require the configured same origin, JSON content and bounded bodies. Unsigned transactions have HMAC tickets binding message bytes, signer, network and expiry; submissions reject changed messages, missing signatures, expired tickets and network changes. Profile upload requires a wallet-signed authorization bound to origin, mint and the entire profile hash. Transaction submission always uses preflight. Success is displayed only after provider/on-chain confirmation; a submitted signature can remain pending.

The read APIs use bounded per-instance caches/capacity limits and upstream timeouts. These do not provide distributed abuse protection across instances. Configure Vercel/WAF limits and provider quotas for public traffic. Market-provider cache is 60–90 seconds; fresh candle requests do not manufacture intermediate price ticks. The SDK's RPC filters and provider account indexing determine history coverage.

## Dependencies and validation limits

The compatible Solana v1 SDK line is required by Meteora DBC 2.0.0. Overrides upgrade Jayson and TOML, retain a patched PostCSS version, and replace the native `bigint-buffer` dependency with a small, unsigned JavaScript-BigInt compatibility layer under `vendor/`. That adapter has no native addon and rejects unsupported widths/overflow; tests cover round trips for Solana integer widths. This is an application-owned adapter, not an upstream patched release. Review the overrides when upgrading Solana/Meteora.

Unit and local-provider integration tests cover exact amount conversion, candles, SDK curve policy construction, origin checks, forged/expired/tampered tickets, signed transaction integrity, confirmation handling and rejection of forged profile authorization. Live wallet approvals, on-chain config creation, metadata storage and a complete devnet economic flow require the operator's accounts and remain activation steps. The app does not claim a smart-contract security audit.

## Primary API references

- [Jupiter Swap V2](https://developers.jup.ag/docs/swap/order-and-execute)
- [Meteora DBC SDK](https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/getting-started)
- [GeckoTerminal API](https://api.geckoterminal.com/docs/index.html)
- [Solana RPC](https://solana.com/docs/rpc/http)
- [Phantom connection](https://docs.phantom.com/solana/establishing-a-connection)

### Market chart intervals

The terminal offers Live (one-minute candles, polled every 15 seconds), 5m, and 4h. Historical views refresh every minute. GeckoTerminal is an indexed, cached source and can lag by about a minute; Live does not imply tick streaming. Server caches are isolated by pool, token side, and interval. Hidden tabs pause chart requests, failed requests retry after one minute, and chart refreshes preserve the viewport. Terminal price, volume, and liquidity snapshots refresh every minute.

### Token artwork and liquidity evidence

Market cards and terminal headings render GeckoTerminal token `image_url` artwork, with HTTPS/IPFS support and an initials fallback for missing or failed images. Images are loaded directly by the browser with no referrer.

The liquidity panel reads RugCheck's public report for the selected mint and pool, cached for one minute. It shows reported locked/burned, partially locked, unlocked, or unverified LP tokens. Missing or inconsistent values, unmatched pools, and position-based pools with placeholder LP-token fields stay unverified. The percentage covers the provider's tracked LP tokens, not total token supply, dollar liquidity, or all markets. The integration does not independently verify locker duration or developer withdrawal control. It never interprets unlocked LP as proof the developer owns it. Provider outages show unverified status, rather than a stale positive badge.

## Security report and on-page monitoring

`GET /api/rilo/security?mint=<mint>&pool=<optional pool>` combines confirmed mint authority and freeze authority reads, largest-token-account concentration, bounded shared-SOL-sender and same-slot token accumulation evidence, verified Meteora creator launch records, attributed RugCheck token warnings and creator launch reports, and selected-pool liquidity evidence. Independent source failures become unknown checks; an invalid or missing mint fails the report. Reports cache for 30 seconds; wallet evidence caches for 60 seconds and LP evidence for 60 seconds. Sources are separate snapshots, not atomic state.

The terminal offers opt-in monitoring every 60 seconds while visible. Alerts are local to the mounted panel and trigger when a check changes to attention or its evidence changes after the first snapshot. Closing/reloading the panel clears monitoring and its ten-entry alert buffer. This does not provide background monitoring, push notifications, or persisted alert history. Existing source caching can delay a signal.

Coverage remains partial: private bundles, independent historical rug classification, holder-owner concentration (including pool exclusions), transfer simulations, and clean-launch verification are not implemented. Largest token accounts are not unique holders. Meteora creator history is capped at 30 records, covers Meteora only, and is not proof of misconduct. A report never certifies safety; unknown evidence cannot produce a clean verdict.

### Detection evidence

Wallet sampling inspects up to 12 large token accounts, six owners and four recent successful transactions per owner, with a 12-second sampling budget after owner lookup. Same-slot accumulation requires positive raw token-balance changes and the wallet’s signature; failed transactions, missing ownership/balances, self-funding and repeated samples cannot manufacture signals. These are recent observations, not a launch-time reconstruction or proof of private bundle membership. Transfers and independent activity can explain same-slot accumulation. Funding groups include public services; common funding does not prove common control.

RugCheck reports are restricted to a verified mainnet genesis hash, shared with LP checks and cached for 60 seconds. Rugged status requires an explicit boolean and matching mint; numeric scores alone never classify a rug. Other developer launches are obtained from the verified Meteora creator, deduplicated and capped at five reports per scan. Each report must match both mint and creator. Failed or mismatched reports remain unknown, and false or missing rugged status never certifies safety. The list is not guaranteed chronological; it does not claim each launch predates the selected token. Fetch timestamps describe retrieval, not the provider’s underlying analysis time.

The expandable evidence panel displays source-attributed warnings, other launch mints, wallet receivers, funding amounts, slots and transaction signatures. Alert comparisons survive manual refresh and monitoring toggles for the same token; switching token/pool clears the baseline. This release has no closed-tab/background alert worker or push delivery.

### Token-2022 controls and validation

The on-chain mint scan now highlights configured permanent-delegate, transfer-hook, transfer-fee, default-account-state, non-transferable and pausable extensions. Presence requests review; it does not establish the current authority or settings, inspect hook code, simulate a sale, or independently establish a honeypot. Unknown extension types and missing extension coverage remain unverified. Provider warning flags remain separate from these RPC observations.

Largest-account snapshots with duplicate accounts, malformed balances, or totals above the mint supply are discarded as unavailable. Wallet sampling continues past a missing transaction and reports the number of owners actually attempted. Developer risk requests begin when the creator resolves, alongside the other evidence requests.

Validation for this update: 29 unit tests, TypeScript checking, production build, and both local-provider API suites. Fixtures cover shared funding, same-slot accumulation, extension warnings, mismatched provider mints, absent transactions, and unavailable sources. These checks do not establish production provider performance or an exhaustive detection rate.
