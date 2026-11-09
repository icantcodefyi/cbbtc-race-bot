// Anchor dip on cbBTC/USDC for make.fun's 24-hour BTC race (agent-fun/bars-replay/v1).
//
// A ranking game more than a trading edge: a full round trip costs about 26 bps, and no rule tested
// on six months of 1-minute BTC beats that on average. What does move the rank is the entry price.
// Most days dip a little below where they start before they go anywhere, so this bot waits for that
// dip and then holds, which beats every bot that bought on the first bar by about the dip on any day
// that dips, and sits near zero on a day that never does.
//
//   - First bar: remember its close as the anchor, and buy PROBE_QUOTE_UNITS (1.2 USDC), the one
//     filled trade the guardrail asks for (held to the end).
//   - Waiting: when a close sits DIP_BPS or more under the anchor, enter.
//   - Entering, over ENTRY_SLICES batches from the trigger: buy 1/3 of the cash, then 1/2 of what is
//     left, then all of it. Each slice trades against its own bar's pool, so three slices pay about a
//     third of one full-size order's price impact.
//   - Holding: no stop, no take-profit. On the third-last and second-last bars of the window it sells
//     1/3 and then 1/2 of the position (same impact saving on the way out); the replay sells the rest
//     at the last close.
//
// The window's bars are found by time (hello.first_close_ms plus WINDOW_BARS - 1 minutes is the last
// close), never by counting batches, so a minute with no bar shifts nothing. A slice the market
// refuses is bought on the next batch instead. Deterministic: bigint money and integer comparisons
// only, no clock, no randomness, no files.

import { BPS, runBars, type Batch, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MINUTE_MS = 60_000;
/** The race and the dev window are both 1,440 one-minute bars. */
const WINDOW_BARS = 1440;

const DIP_BPS = 30n;
const ENTRY_SLICES = 3;
const EXIT_SLICES = 3;

const PROBE_QUOTE_UNITS = 1_200_000n;
const MIN_ORDER_QUOTE_UNITS = 1_000_000n;
const BUY_MAX_SLIPPAGE_BPS = 300;
const SELL_MAX_SLIPPAGE_BPS = 1_000;

type Order = BuyInput | SellInput;

const buy = (amount: bigint): BuyInput => ({ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: BUY_MAX_SLIPPAGE_BPS });
const sell = (qty: bigint): SellInput => ({ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SELL_MAX_SLIPPAGE_BPS });

let anchor: bigint | null = null;
let phase: 'wait' | 'enter' | 'hold' = 'wait';
/** Entry slices sent so far. */
let slices = 0;

function decide(state: BarsState, batch: Batch): Order[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;
  // bars of the window left after this one (0 on the last bar, whose orders the replay refuses)
  const left = (state.hello.first_close_ms + (WINDOW_BARS - 1) * MINUTE_MS - batch.t) / MINUTE_MS;

  if (anchor === null) {
    anchor = close;
    return [buy(PROBE_QUOTE_UNITS)];
  }

  if (phase === 'wait') {
    if (left < EXIT_SLICES) return [];
    if (close * BPS > anchor * (BPS - DIP_BPS)) return [];
    phase = 'enter';
  }

  if (phase === 'enter') {
    if (left < EXIT_SLICES) {
      phase = 'hold';
    } else {
      const parts = BigInt(ENTRY_SLICES - slices > 1 ? ENTRY_SLICES - slices : 1);
      slices++;
      if (slices >= ENTRY_SLICES) phase = 'hold';
      const amount = state.cash / parts;
      return amount >= MIN_ORDER_QUOTE_UNITS ? [buy(amount)] : [];
    }
  }

  // holding: a slice the market refused is bought now, then the exit split at the end
  if (left >= EXIT_SLICES && state.cash >= MIN_ORDER_QUOTE_UNITS) return [buy(state.cash)];
  if (left >= 1 && left < EXIT_SLICES && qty > 0n) {
    // left = 2: sell 1/3; left = 1: sell 1/2 of what is left
    const part = qty / BigInt(left + 1);
    return state.value(SYMBOL, part) >= MIN_ORDER_QUOTE_UNITS ? [sell(part)] : [];
  }
  return [];
}

await runBars({ onBatch: decide });
