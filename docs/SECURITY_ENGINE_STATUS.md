# Security engine status

Implemented:
- Combined security report and terminal panel; failures stay unknown.
- Mint/freeze authority, large-account concentration, Token-2022 control warnings.
- Shared SOL funding groups and signed same-slot token accumulation, with signatures and amounts.
- Token-history scan: up to 3,000 signatures and 24 early transactions, including owners no longer in the current holder sample. Launch labeling requires a successful mint-initialization instruction. Otherwise the window is explicitly earliest-available or recent.
- Mainnet-only RugCheck warnings and explicit rugged flags, matched to the token.
- Up to five other launch risk reports matched to mint and creator. Sources include on-chain Meteora creator records and RugCheck-reported creator/token indexes (including Pump.fun). Provider attribution is labeled separately from on-chain records; up to 100 indexed candidate tokens are retained.
- Pool-specific reported LP lock evidence; no inference of developer ownership from unlocked LP.
- Optional visible-page monitoring every 60 seconds and a local ten-entry alert buffer.

Validation: unit tests cover exited early owners, initialization verification, pagination limits, missing/failed transactions, creator attribution, cross-token rejection, and unavailable history. API fixtures exercise cross-program developer reports and early activity alongside the existing transaction-integrity controls. No live transactions or paid checks are required for this work.

Coverage still partial: bounded early and recent wallet samples, not full launch reconstruction; same-slot activity and common funding do not prove private bundles or common ownership. The RPC may prune history or reach the scan limit before initialization. Developer indexes and reports may be incomplete or unavailable. No independent historical rug classification, hook-code audit, sale simulation, background monitoring, push alerts, or clean-launch certification.

The interface distinguishes checked samples, risk flags, partial coverage, and unavailable data. A checked sample does not verify token safety. Launch implementation and configuration are outside this update.
