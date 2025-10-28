# Polymarket Copy-Trading Bot — Code Overview

This document captures the current architecture and data flow of the copy-trading bot so new contributors can ramp up quickly. Paths are workspace-relative.

## Runtime Topology

- `src/index.ts` is the entry point. It loads `.env` config (`src/config/env.ts`), connects Mongo (`src/config/db.ts`), prints startup context (`src/utils/logger.ts`), instantiates the Polymarket CLOB client (`src/utils/createClobClient.ts`), then launches the two long-lived loops:
  - `tradeMonitor()` ingests trader activity into Mongo.
  - `tradeExecutor()` mirrors qualifying trades via the CLOB.

- Mongo models are multi-tenant by trader: `src/models/userHistory.ts` exposes factory helpers that namespace activity/position collections as `user_activities_<trader>` and `user_positions_<trader>`.

## Environment & Configuration

- `src/config/env.ts` validates every required variable at boot (wallets, RPC, CLOB URLs, Mongo URI, USDC address). It also parses `USER_ADDRESSES` (comma string or JSON array) and surfaces operational knobs:
  - Retry envelopes (`RETRY_LIMIT`, `NETWORK_RETRY_LIMIT`, `REQUEST_TIMEOUT_MS`).
  - Monitor cadence (`FETCH_INTERVAL`), trade age filter (`TOO_OLD_TIMESTAMP`).
  - Trade sizing controls (`TRADE_MULTIPLIER`, aggregation toggle/window, order minimums).
- These constants are consumed throughout trade monitoring/execution and the CLI scripts for a consistent behavior surface.

## Data Ingestion — `tradeMonitor`

- The monitor (`src/services/tradeMonitor.ts`) builds `{UserActivity, UserPosition}` model handles for each tracked trader.
- `init()` runs once:
  - Prints Mongo counts per trader (`Logger.dbConnection`).
  - Fetches our wallet’s current positions and USDC balance to show the local portfolio snapshot (`Logger.myPositions`).
  - Summarizes each watched trader’s top positions (`Logger.tradersPositions`).
- On first loop iteration it marks any historical trades in Mongo as processed so only fresh Polymarket API events are acted on.
- `fetchTradeData()` iterates tracked traders every `FETCH_INTERVAL` seconds:
  - Requests `activity?user=<addr>&type=TRADE`; new events (by `transactionHash`) are inserted with `bot=false`, `botExcutedTime=0`.
  - Concurrently refreshes the trader’s `positions` snapshot via upsert for downstream sizing decisions.

## Trade Execution — `tradeExecutor`

- Builds lookup table of `UserActivity` models for the copy list and polls Mongo for trades flagged `bot=false` & `botExcutedTime=0`.
- Two operating modes:
  - **Aggregation enabled:** small BUY trades under $1 are buffered per `(trader, conditionId, asset, side)` until the configured window elapses; ready batches run via `doAggregatedTrading()`.
  - **Aggregation disabled:** trades execute immediately in arrival order.
- Execution path (`doTrading`/`doAggregatedTrading`):
  - Marks the trade(s) as “in progress” (`botExcutedTime=1`) to prevent duplicate handling.
  - Logs descriptive context (`Logger.trade`).
  - Fetches fresh positions for both our wallet and the source trader (using `src/utils/fetchData.ts`).
  - Retrieves our USDC balance (`src/utils/getMyBalance.ts`) and estimates trader capital (sum of their position values) for proportional sizing logs.
  - Delegates to `postOrder()` with the relevant context.

## Order Placement — `postOrder`

- Found in `src/utils/postOrder.ts`; this is the core copy logic covering `buy`, `sell`, and `merge` (closing residuals).
- Shared behaviors:
  - Uses environment-driven retry cap (`RETRY_LIMIT`) and multiplier (`TRADE_MULTIPLIER`).
  - Enforces Polymarket minimums ($1 USD buys, 1 token sells/merges) to avoid rejected orders.
  - Pulls the best quote from the live order book via `clobClient.getOrderBook`, posts FOK market orders, and handles exponential retry on general failures.
  - Detects allowance/balance rejections early to avoid wasting retries and prompts operator action.
  - Writes back to Mongo (`bot=true`, `botExcutedTime`, `myBoughtSize`) with the outcome for bookkeeping.
- **Buy branch**
  - Scales trader notional by the ratio of our capital to theirs; if sub-$1, applies `TRADE_MULTIPLIER` and rechecks; clamps to 99% of our available balance to leave a buffer.
  - Tracks total tokens purchased per trade in `myBoughtSize` so sells can unwind proportionally even if wallet state shifts.
- **Sell branch**
  - Reconstructs tokens we previously bought (via historical `myBoughtSize` entries) to compute a symmetric sell amount; fallback uses current position size when tracking is unavailable.
  - Caps sell size at our position and updates purchase tracking (clearing or scaling down) once sales succeed.
- **Merge branch**
  - Liquidates our entire position against current best bid, respecting minimum order size and logging each partial fill.

## CLOB Client & Wallet Detection

- `src/utils/createClobClient.ts` hides the signature-type branching:
  - Probes `ENV.PROXY_WALLET` via `ethers.providers.JsonRpcProvider` to determine if it is a Gnosis Safe (contract) or vanilla EOA.
  - Creates an initial `ClobClient` instance, silences stdout/stderr, attempts `createApiKey()` then `deriveApiKey()` fallback, and finally instantiates the authenticated client with the detected `SignatureType`.
  - Restores console binding once credentials are retrieved.
- A legacy version exists in `src/services/createClobClient.ts`; the runtime uses the utility variant (`src/utils/createClobClient.ts`).

## Logger & UX Utilities

- `src/utils/logger.ts` centralizes console/file logging:
  - Pretty console banners, structured trade summaries, progress spinner (`waiting()`), and file mirroring under `logs/bot-YYYY-MM-DD.log`.
  - Balance and portfolio snapshots for both our wallet and watched traders help contextualize actions during live runs.
- `src/utils/fetchData.ts` wraps axios with exponential backoff (network errors) and forced IPv4; used by monitor, executor, and scripts.
- `src/utils/getMyBalance.ts` queries USDC balance using the configured token address (supports native vs. bridged).
- `src/utils/spinner.ts` exposes an `ora` spinner for scripts needing long-running feedback.

## Operational Scripts (`src/scripts/`)

- **Allowance & Wallet Health**
  - `checkAllowance.ts` / `verifyAllowance.ts`: inspect USDC balance & allowance, detect Safe vs EOA, optionally set unlimited allowance, and sync Polymarket’s internal cache via `ClobClient.updateBalanceAllowance`.
  - `checkProxyWallet.ts`: status checks (not reviewed yet).
- **Manual Trading & Investigations**
  - `manualSell.ts`: ad-hoc liquidation by market search string, including cache refresh to keep Polymarket state consistent.
  - `checkMyStats.ts`, `checkPnLDiscrepancy.ts`: detailed portfolio and realized/unrealized PnL diagnostics via Polymarket APIs.
- **Historical Data & Sims**
  - `fetchHistoricalTrades.ts`: bulk export of trader activity with batching/backoff into `trader_data_cache/`.
  - `simulateProfitability.ts`: runs copy-trade simulations with configurable history window, multiplier, and minimum order size; writes reports to `simulation_results/`.
  - `runSimulations.ts`: orchestrator for interactive or preset batch simulations (spawns `ts-node` jobs with tuned env vars).
  - `compareResults.ts`: aggregates saved simulation outputs, printing summary tables/statistics.

## Data Persistence

- Mongo persists two dimensions per tracked trader:
  - **Activities**: stream of Polymarket trades (from monitor) with bot processing flags and auxiliary fields (e.g., `myBoughtSize`).
  - **Positions**: latest snapshot of trader holdings (updated each monitor cycle) for sizing and performance reporting.
- Our own wallet state is not directly persisted—Polymarket APIs and on-chain balance checks provide real-time information.

## Control Flow Summary

```
start → load env → connect Mongo → log startup overview → build Clob client
       → spawn tradeMonitor loop (poll Polymarket → persist new trades/positions)
       → spawn tradeExecutor loop (poll Mongo → aggregate if enabled → fetch live context → post orders)
       → Logger provides continuous CLI feedback + logs/bot-*.log mirroring
```

Key behavior toggles (`.env`):

- `TRADE_AGGREGATION_ENABLED` + `TRADE_AGGREGATION_WINDOW_SECONDS`: buffer tiny BUY trades.
- `TRADE_MULTIPLIER`: boost small orders symmetrically across buy/sell/merge.
- `FETCH_INTERVAL`: trade monitor polling frequency.
- `RETRY_LIMIT` / `NETWORK_RETRY_LIMIT`: resilience knobs for both HTTP and order posting.

## Notable Edge Handling

- Detects insufficient allowance/balance responses from the CLOB and halts retries with actionable operator guidance.
- Applies order minimums before signing orders to avoid futile submissions.
- Tracks purchased token quantities (`myBoughtSize`) to handle partial unwinds accurately even if wallet positions fluctuate outside the bot.
- Aggregation mode prevents sub-$1 spam while still mirroring trader intent once cumulative size is meaningful.

This overview reflects the repository state as of the latest inspection and should be updated whenever major flows or env expectations change.

