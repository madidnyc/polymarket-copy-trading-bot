# Repository Guides Overview

This document summarizes the reference material in `/docs` so the engineering view stays aligned with the authored guides.

## 1. QUICK_START.md & FUNDING_GUIDE.md

- **Audience:** Operators getting the bot live in minutes.
- Key steps: install deps (Node 18+, Mongo), copy `.env.example`, populate wallets/RPC/Mongo URI, build (`npm run build`) and start (`npm start`).
- Highlights expected terminal output (ASCII banner + waiting spinner) and trader discovery tips (leaderboard, Predictfolio, good/bad trader traits).
- Explains trade sizing math (capital ratio) and slippage guard, with safety advice: start small, dedicate wallet, daily monitoring, allowance checks.
- Funding guide dives into obtaining USDC/MATIC, bridging, RPC providers, and recommended capital allocation hygiene.

## 2. MULTI_TRADER_GUIDE.md & POSITION_TRACKING.md

- **Multi-trader operations:** how to track multiple wallets—optimal env formatting (`USER_ADDRESSES` comma list or JSON), Mongo collection naming, and CLI examples for adding/removing traders. Notes on balancing against combined capital and recommended monitoring cadence.
- **Position tracking:** describes how Mongo models (`user_positions_*`) mirror Polymarket data, impact of `myBoughtSize`, merge handling, and how the Executor maintains parity through buys/sells. Includes troubleshooting for mismatched balances (allowance, API lag).

## 3. LOGGING_PREVIEW.md & IMPROVED_LOGGING_EXAMPLES.md

- Visual tour of Logger output: startup banners, trade cards, balance comparisons, waiting spinner, aggregated trade headers.
- Documents the structured logging additions (headers, separators, trade summaries) and how console + file logs align. Provides example screenshots (`docs/screenshot.png`) and suggested monitoring workflow.

## 4. CODE_IMPROVEMENTS.md & EXPLANATION.md

- Capture rationale behind recent refactors: centralized order size constants, consistent safety buffers, minimum order guards in the SELL loop, removal of duplicate balance checks.
- `EXPLANATION.md` explains environment parsing logic, aggregation buffers, and flags like `botExcutedTime` (0 = pending, 1 = in progress, >1 = retry count). Useful for debugging odd trade states.

## 5. SIMULATION_GUIDE.md, SIMULATION_QUICKSTART.md, SIMULATION_RUNNER_GUIDE.md

- **Quickstart:** minimal env needed for simulations (cached trader data or live fetch), command matrix (`npm run simulate`, `npm run sim standard` etc.), and interpreting saved `simulation_results/*.json`.
- **Full guide:** explains simulation internals—starting capital, multiplier handling, skip logic under Polymarket minimums, writing reports, and post-processing with `compareResults.ts`.
- **Runner guide:** covers batch orchestration (`runSimulations.ts`) including interactive preset selection, custom trader runs, top/worst result reporting, and workflow examples for multiplier tuning or cross-trader comparisons.

## 6. Polymarket Copy Trading Bot Documentation.pdf

- Comprehensive PDF version consolidating quick start, configuration, allowance management, monitoring dashboards, and simulation tooling—mirrors the Markdown set but formatted for sharing.

## 7. Operational Checklists

- Allowance scripts (`checkAllowance`, `verifyAllowance`) are emphasized across guides: run before production, confirm unlimited allowance vs USDC.e specifics, sync Polymarket cache.
- Suggested routine: `npm run verify-allowance` ➜ `npm run check-stats` for own wallet ➜ monitor bot with logging preview best practices ➜ periodically export history / run simulations for strategy validation.

Keep this summary updated as documentation evolves so code changes and written SOPs stay synchronized.

