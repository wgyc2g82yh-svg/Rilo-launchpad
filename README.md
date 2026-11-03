# RILO launchpad

Next.js 15 app with the metallic landing page at `/` and the launchpad at `/app`.

## Integrated services

| Feature | Implementation and coverage |
| --- | --- |
| Discover | GeckoTerminal Solana mainnet trending and new indexed pools, cached refresh, actual price/volume/liquidity, provider timestamps |
| Market terminal | Five-minute OHLCV candles and white volume bars using Lightweight Charts; selectable indexed pool |
| DEX trading | Jupiter Swap V2 order → Phantom signature → managed execution; wallet-bound transaction tickets and confirmation reporting |
| Bonding-curve trading | Direct Meteora DBC quote, slippage minimum, simulation, Phantom signature, RPC submission and confirmation for active original-SPL/SOL curves |
| Token launch | Creator-signed profile authorization, immutable content-addressed metadata upload to Supabase, Meteora DBC pool/mint preparation, simulation, new mint partial signature and creator wallet approval |
| Launch configuration | Treasury-only builder with operator-entered supply, starting/graduation market caps in SOL and trading fee; fixed supply, immutable metadata, no creator vesting, no first buy, no base transfer tax |
| Creator rebate | 1% of distributable platform curve trading fees after protocol fees, enforced by the configured DBC account; creator claims accrued curve fees with their own wallet |
| Liquidity at graduation | DAMM v2 migration via Meteora's migration infrastructure; 100% of graduated LP positions permanently locked, 99% platform / 1% creator fee rights |
| Treasury | Platform curve fee claim and explicit SOL-budget Jupiter buyback into the configured treasury wallet |
| Creator history | Verified Meteora pool creator and returned Meteora launch records; no creator inference from mint authority, no rug-history verdict |
| Wallet analysis | Owners of up to 12 largest token accounts and up to 2 recent successful transactions for each of 6 sampled owners; shared SOL sender evidence includes signatures and slots |
| Token controls | Mint/freeze authorities, supply, token program and largest token-account distribution through the configured Solana RPC |

Market rankings and shared funding are observations, not safety ratings. Pools, exchanges and service wallets can create benign concentration and funding relationships. No private-bundle attribution, cross-program full-history index, global rug classifier or clean-launch verdict is implemented. Token-2022 extension behavior is not fully analyzed, and direct curve trading is limited to original SPL tokens with SOL quotes. Graduated LP fees are claimed through Meteora; the in-app fee claim covers accrued DBC curve fees.

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
