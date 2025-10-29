# Simulation Runner Guide

Convenient tooling for launching and comparing multiple copy-trading simulations with different parameters.

## Quick start

### Interactive mode (recommended)

```
npm run sim
```

The wizard prompts you to:
1. Choose a preset (quick / standard / full)
2. Enter trader addresses (or accept defaults)

### Preset shortcuts

```
npm run sim quick      # 7 days, 2 multipliers
npm run sim standard   # 30 days, 3 multipliers (recommended)
npm run sim full       # 90 days, 4 multipliers
```

### Custom run

```
npm run sim custom <trader_address> [days] [multiplier]

# Examples
npm run sim custom 0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b 30 2.0
npm run sim custom 0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292 60 1.5
```

## Presets

### Quick
- History: 7 days
- Max trades: 500
- Multipliers: 1.0×, 2.0×
- Runtime: ~2–3 minutes
- Use case: rapid sanity check

### Standard ⭐
- History: 30 days
- Max trades: 2,000
- Multipliers: 0.5×, 1.0×, 2.0×
- Runtime: ~5–10 minutes
- Use case: core analysis before copying live

### Full
- History: 90 days
- Max trades: 5,000
- Multipliers: 0.5×, 1.0×, 2.0×, 3.0×
- Runtime: ~15–30 minutes
- Use case: deep-dive validation

## Comparing results

After simulations finish, run `npm run compare` to review outputs.

### Full comparison

```
npm run compare
```

Lists every run by trader, top performers, worst performers, and aggregate stats.

### Best / worst

```
npm run compare best 10
npm run compare best 3
npm run compare worst 5
```

### Summary stats only

```
npm run compare stats
```

Shows simulation count, profitable share, average ROI/P&L, total copied vs skipped trades.

### Drill into one result

```
npm run compare detail <name_part>

# Examples
npm run compare detail std_m2p0
npm run compare detail 0x7c3d
```

## Practical scenarios

### 1. Evaluating a new trader

```
npm run sim custom 0x7c3d... 7 1.0
npm run sim custom 0x7c3d... 30 1.0
npm run compare
```

### 2. Tuning multipliers

```
npm run sim custom 0x7c3d... 30 0.5
npm run sim custom 0x7c3d... 30 1.0
npm run sim custom 0x7c3d... 30 2.0
npm run compare
```

### 3. Building a portfolio

```
npm run sim   # choose preset, provide multiple addresses
npm run compare
```

### 4. Planning capital

```
npm run sim custom <trader> 30 1.0
npm run compare detail <result>
```

Use the “Skipped trades” column to gauge required capital or aggregation settings.

## Metrics cheat sheet

| Metric | Explanation | Target |
|--------|-------------|--------|
| ROI | Total return (%) | > 15% |
| Total P&L | Net profit/loss ($) | Positive |
| Copied/Total | Share of trades copied | > 70% |
| Skipped Trades | Trades not executed (usually < $1) | Lower is better |
| Unrealized P&L | Open-position P&L | Positive |

## Suggested workflow

1. Run `npm run sim standard` for each candidate trader.
2. Filter out low ROI / high skip rate results.
3. Fine-tune multipliers with `npm run sim custom <trader> 30 {0.5|1.0|2.0}`.
4. Validate top picks with a 90-day run (`npm run sim custom <trader> 90 best_multiplier`).
5. Use `npm run compare best 3` to select a diversified set.
6. Carry chosen settings into `.env` for the live bot.

## Troubleshooting

- **"No simulation results found"** → run a simulation first (`npm run sim quick`).
- **"Failed to fetch trades"** → check connection, trader address, and wait for API rate limits.
- **High skip rate** → raise simulated capital, lower multiplier, or pick a trader with larger average orders.
- **Slow runs** → use quick preset or set `SIM_MAX_TRADES=500` before execution.

## Handy commands

```
npm run sim help
npm run compare help

rm -rf simulation_results/*.json
tar -czf simulation_results_$(date +%Y%m%d).tar.gz simulation_results/
```

## After analysis

1. Choose 2–3 top traders by ROI/stability.
2. Determine multipliers per trader.
3. Update `.env` accordingly:
   ```
   USER_ADDRESSES = '0xTrader1,0xTrader2'
   TRADE_MULTIPLIER = 1.5
   ```
4. Run the bot in preview mode first (`PREVIEW_MODE=true`).
5. Start live with small capital and monitor; rerun simulations periodically.

---

Past performance is not a guarantee of future returns. Use simulations as guidance and scale cautiously.

Happy backtesting! 📊🚀

