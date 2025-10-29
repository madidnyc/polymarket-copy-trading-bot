# Simulation Quick Start

Three simple steps to backtest copy-trading strategies.

## 🚀 Quick Start (3 Steps)

### 1. Launch a simulation

```
# Interactive wizard (easiest)
npm run sim

# or a quick preset
npm run sim quick
```

### 2. Let it run

The script prints trade downloads, per-trade progress, and a final ROI/P&L report.

### 3. Inspect the results

```
npm run compare
```

## 📊 Command overview

### Simulations

```
npm run sim              # interactive setup
npm run sim quick        # 7 days, 2 multipliers
npm run sim standard     # 30 days, 3 multipliers (default)
npm run sim full         # 90 days, 4 multipliers
npm run sim custom <trader> [days] [multiplier]
```

### Comparing outputs

```
npm run compare          # all results + summary tables
npm run compare best 10  # top configurations
npm run compare worst 5  # worst performers
npm run compare stats    # aggregate statistics only
npm run compare detail <name_part> # deep dive on a single run
```

## 💡 Usage examples

### Quick trader health check

```
npm run sim custom 0x7c3d... 7 1.0
npm run sim custom 0x7c3d... 30 1.0
npm run compare
```

### Multiplier tuning

```
npm run sim custom 0x7c3d... 30 0.5
npm run sim custom 0x7c3d... 30 1.0
npm run sim custom 0x7c3d... 30 2.0
npm run compare
```

### Comparing multiple traders

```
npm run sim   # choose "Standard" and provide several addresses
npm run compare
```

## 📈 Metric cheat sheet

| Metric | Meaning | Good benchmark |
|--------|---------|----------------|
| ROI | Return on investment (%) | > 15% |
| Total P&L | Net profit/loss ($) | Positive |
| Copied/Total | Share of trades copied | > 70% |
| Unrealized P&L | P&L on open positions | Positive |

✅ Good signs: positive ROI, high copy rate, positive unrealized P&L, consistent performance across presets.

⚠️ Warnings: ROI < 0, many skipped trades, large drawdowns, inconsistent results between windows.

> Tip: If you see many skipped trades, either increase simulated capital, reduce the multiplier, or enable trade aggregation in the live bot.

## 🛠 Configuration

Examples for `.env`:

```
USER_ADDRESSES = '0xTrader1, 0xTrader2'
TRADE_MULTIPLIER = 1.5

SIM_TRADER_ADDRESS = '0x...'
SIM_HISTORY_DAYS = 30
SIM_MIN_ORDER_USD = 1.0
SIM_MAX_TRADES = 2000
```

Historic trades are cached in `trader_data_cache/` to accelerate reruns. Remove the folder to force a refresh:

```
rm -rf trader_data_cache/
```

## 📁 File layout

```
simulation_results/          # JSON outputs per run
trader_data_cache/           # Cached trade history
src/scripts/
  simulateProfitability.ts
  runSimulations.ts
  compareResults.ts
docs/
  SIMULATION_RUNNER_GUIDE.md
  SIMULATION_GUIDE.md
```

## 🔍 Troubleshooting

- "No simulation results found" → run any simulation first (`npm run sim quick`).
- "Failed to fetch trades" → check network, confirm trader address, retry after a minute (rate limiting).
- Too many skipped trades → increase simulated capital, lower multiplier, or pick a trader with larger order sizes.
- Slow runs → use `npm run sim quick` or set `SIM_MAX_TRADES=500` when invoking the command.

## 📚 Additional resources

- [Simulation Runner Guide](./SIMULATION_RUNNER_GUIDE.md)
- [Simulation Guide](./SIMULATION_GUIDE.md)
- [Multi-Trader Guide](./MULTI_TRADER_GUIDE.md)
- [Bot Quick Start](./QUICK_START.md)

## 💬 Help

```
npm run sim help
npm run compare help
```

> Past performance does not guarantee future returns. Start with small capital in production.

Happy simming! 🚀📊

