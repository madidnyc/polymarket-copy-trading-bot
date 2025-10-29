# Position Tracking System

## Problem

If you top up your wallet after buying a position, later sells can be mis-sized. The naive approach scales sells off your **current** balance instead of the **quantity actually purchased**, so the bot could sell too many or too few tokens when traders scale in/out.

### Example

1. You have $100, trader has $500
2. Trader buys $50 → you buy $10 (20% of their size)
3. You add funds and your balance jumps to $500
4. Trader sells 50% of their position
5. **Old logic**: sells 50% of your current balance (wrong)
6. **New logic**: sells 50% of the tokens you actually bought (correct)

## Solution

We track how many tokens were purchased in each buy and use that figure when selling.

### Buy flow

1. Calculate proportional order size
2. After a successful POST, record the actual token amount (`myBoughtSize`)
3. Persist `myBoughtSize` to MongoDB alongside the trade entry

### Sell flow

1. Query all prior buys for the same `asset` + `conditionId`
2. Sum all tracked token amounts
3. Compute the trader’s sell percentage
4. Apply that percentage to the tracked tokens, not the current wallet holding
5. After selling:
   - If ≥99% sold, clear the tracking entries
   - Otherwise, decrement each tracked buy proportionally

## Code Touchpoints

### Data model (`userHistory.ts`)

```ts
myBoughtSize: { type: Number, required: false } // actual tokens we bought
```

### Interface (`interfaces/User.ts`)

```ts
myBoughtSize?: number;
```

### Buy logic (`utils/postOrder.ts`)

- Track `totalBoughtTokens` during the loop
- Save `{ myBoughtSize: totalBoughtTokens }` once the trade is marked `bot: true`
- Log the tracked amount for visibility

### Sell logic (`utils/postOrder.ts`)

- Fetch prior buys with `myBoughtSize > 0`
- Calculate sell size from tracked tokens
- Update or clear tracking based on how much was sold

## Benefits

- ✅ Accurate proportional sells even after deposits
- ✅ Decouples copy sizing from current balance
- ✅ Transparent logs show how many tokens are tracked
- ✅ Falls back to old behavior when no tracking data exists

## Log Examples

**Buy**
```
✓ Bought $10.00 at $0.52 (19.23 tokens)
📝 Tracked purchase: 19.23 tokens for future sell calculations
```

**Sell (partial)**
```
📊 Found 2 previous purchases: 35.45 tokens bought
Calculating from tracked purchases: 35.45 × 50.00% = 17.72 tokens
✓ Sold 17.72 tokens at $0.55
📝 Updated purchase tracking (sold 50.0% of tracked position)
```

**Sell (full)**
```
🧹 Cleared purchase tracking (sold 100.0% of position)
```

## Backward Compatibility

- Existing trades without `myBoughtSize` will still use current-position sizing
- New trades automatically record purchase sizes
- Over time, all positions migrate to the tracking system

## Testing Checklist

1. Copy a buy with capital ratio X
2. Top up wallet balance significantly
3. Wait for trader to sell partially/fully
4. Check logs for “Found previous purchases” and confirm correct amounts sold

## FAQ

**Q: What if I manually sell part of a position?**  
A: Manual sells aren’t tracked; tracking only reflects bot-managed buys.

**Q: What if the trader exits completely?**  
A: The bot sells your entire remaining position regardless of tracking data.

**Q: Can I disable tracking?**  
A: There’s no toggle—when tracking data is missing, the bot automatically falls back to the previous behavior.

