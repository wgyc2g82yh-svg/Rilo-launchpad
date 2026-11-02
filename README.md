# RILO launchpad

Next.js app with the existing metallic landing page at `/` and an app at `/app`.

## Implemented

- Responsive black-and-silver Discover / Launch interface, standalone R mark, animated metallic background, X link, icon-only watchlist, and reduced-motion support.
- Phantom connection, disconnect, and account-change handling. Mobile users can open the site in Phantom's browser. No signatures or transactions are requested.
- Read-only Solana mint analysis: mint authority, freeze authority, current supply, token program, and up to 20 largest **token accounts**. Results include timestamp and mint snapshot slot.
- Explicit partial-coverage reporting: bundle detection, creator history, liquidity, and sellability remain unchecked. Missing signals never become safety badges.
- Token-2022 mints are identified, but extension behavior is not fully analyzed.
- Local watchlist for up to 50 mint addresses. Selecting an entry runs a fresh check, subject to the short server cache.
- Two-step token profile and review: name, ticker, description, website, X username, and optional PNG/JPG/WebP image up to 2 MB. Drafts save on this device under `rilo-launch-draft`.
- Connection status and scan APIs, input validation, sanitized provider errors, timeouts, bounded caching, and per-instance capacity limits.
- Unit tests and GitHub Actions checks.

## Not implemented yet

This branch is an app foundation, not a complete launch/trading protocol.

| Feature | Remaining integration |
| --- | --- |
| New launches / trending feed | Reliable launch and market-data indexer |
| Market charts / volume | Live OHLCV feed and chart integration |
| Buy / sell | Swap routing, transaction construction, simulation, signing and confirmation |
| Token deployment | Launch mechanism, metadata storage, mint creation, pool/bonding-curve creation, fees and signing |
| Bundle / connected wallets | Launch history, funding relationships, attribution and evidence-backed heuristics |
| Developer history | Creator attribution, indexed historical launches and reviewed criteria for adverse labels |
| Rebates / buybacks | Explicit fee basis, recipients, accounting, treasury controls and reviewed execution logic |

Trading and deployment stay disabled until those integrations exist. No clean-launch or rug verdict is generated. The existing landing page is retained and links to `/app`.

## Run

Use Node.js 22.18+ (CI uses Node 24):

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/app`. Set `SOLANA_RPC_URL` in `.env.local` to a server-side Solana RPC endpoint, such as your Helius URL. Set the same variable in your host's environment settings before deployment. Restart the local server after editing environment variables.

The endpoint determines the scan network; the UI does not assume mainnet. `/api/solana/status` returns the genesis hash so operators can verify the cluster. Only HTTPS provider URLs are accepted, except loopback HTTP for local testing. No RPC URL or API key is returned to the client. Never use a `NEXT_PUBLIC_` variable for the endpoint.

Without `SOLANA_RPC_URL`, the UI still opens and drafts work. Scans return HTTP 503 with a setup message. No sample balances or fabricated findings are displayed.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm run test:api
npm start
```

Unit tests cover exact base58 address length, large integer supply calculations, missing data, Token-2022 coverage and draft validation. Browser verification during development uses test fixtures for scan results and the Phantom provider; that does not verify a live Helius connection or an actual wallet approval.

The PostCSS override keeps the starter's compatible Next.js 15 version while resolving inherited dependency advisories. Review the override when upgrading Next.js.

## API and operations

- `GET /api/solana/status`: RPC configuration/connectivity and genesis hash.
- `GET /api/solana/scan?mint=<address>`: mint analysis. HTTP 400 for invalid addresses, 404 for absent accounts, 422 for non-mints, 503 for missing configuration, 429 for capacity, and 502 for provider failures. Largest-account failures produce partial results rather than a false zero.

Scans use `confirmed` commitment, an 8-second timeout per upstream call, a 30-second cache capped at 128 entries, at most four concurrent scans, and 30 uncached scans/minute **per server instance**. These limits do not replace distributed rate limiting or host/WAF controls. Configure quotas before public promotion. Concentration includes pool and exchange accounts and does not establish owner concentration or wallet relationships. Mint and largest-account snapshots may differ.

## Existing waitlist

Inherited `/api/waitlist` routes and `supabase/schema.sql` remain available. They require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, both server-only. No waitlist UI is rendered. Add distributed rate limiting, bot protection and appropriate privacy copy before exposing the endpoint publicly.

## Reference APIs

- [Solana getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo)
- [Solana getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts)
- [Phantom connection](https://docs.phantom.com/solana/establishing-a-connection)
- [Phantom mobile browse links](https://docs.phantom.com/phantom-deeplinks/other-methods/browse)
