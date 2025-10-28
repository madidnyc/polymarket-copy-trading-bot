# Bot Setup & Launch Instructions

## 1. Prerequisites

- Install Node.js v18 or newer (includes npm).
- Have access to a MongoDB instance/connection string (Atlas or self-hosted).
- Prepare a Polygon wallet funded with USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) and a few MATIC for gas.
- Obtain a reliable Polygon RPC endpoint (Infura, Alchemy, QuickNode, etc.).

## 2. Project Installation

```bash
git clone <repo>
cd polymarket-pete
npm install
```

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

- `USER_ADDRESSES`: trader wallet(s) to copy (single, comma-separated, or JSON array).
- `PROXY_WALLET`: your Polygon wallet; `PRIVATE_KEY`: matching key without `0x`.
- `MONGO_URI`: Mongo connection string.
- `RPC_URL`: Polygon RPC endpoint.
- Leave `CLOB_HTTP_URL`, `CLOB_WS_URL`, `USDC_CONTRACT_ADDRESS` as provided unless instructed.
- Optional: adjust `FETCH_INTERVAL`, `TRADE_MULTIPLIER`, enable `TRADE_AGGREGATION_ENABLED`, tune window, or set `PREVIEW_MODE=true` for dry run.

## 4. Preflight Checks

- `npm run verify-allowance` to confirm Polymarket allowance.
- If prompted, run `npm run check-allowance` to approve spending, then re-run verify.
- Optionally: `npm run check-stats` to confirm wallet balance/positions.

## 5. Dry-Run Launch (Recommended)

- Ensure `PREVIEW_MODE=true` in `.env`.
- Start the bot with `npm run dev` (uses ts-node) or `npm run build && npm start` (compiled).
- Monitor console output and Mongo collections; trades should ingest without order execution.

## 6. Live Trading

- Update `.env` to `PREVIEW_MODE=false`.
- Relaunch (`npm run dev` or build/start workflow).
- Keep terminal open; monitor `logs/bot-YYYY-MM-DD.log` for executed orders and alerts.

## 7. Ongoing Operations

- Periodically verify allowance/USDC balance (`npm run verify-allowance`).
- Review Mongo for stuck trades (`botExcutedTime`), adjust env if adding/removing traders.
- Use supporting scripts for analysis: `npm run fetch-history`, `npm run sim…`, `npm run compare`, `npm run check-pnl`.
- Keep dependency/env secrets secure; rotate credentials if exposed.

