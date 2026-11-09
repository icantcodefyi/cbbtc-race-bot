// Deep-dip reversion on cbBTC/USDC for make.fun's 24-hour BTC race (agent-fun/bars-replay/v1).
//
// The idea: stay in cash, and only buy a deep dip with a small slice of equity.
//
//   - Every bar's close updates an EMA of closes (EMA_BARS, seeded at the first close).
//   - Flat, once WARMUP_BARS closes have been seen: when the close sits more than DIP_BPS under the
//     EMA, buy STAKE_BPS of equity (the order fills at the next bar's open).
//   - Holding: sell the whole position once the close is TAKE_PROFIT_BPS over the close it was bought
//     on, or STOP_BPS under it (a wide stop, only for a crash).
//   - A 1 USDC probe buy on the first bar, sold on the next one, so the run always holds the one filled
//     trade the guardrail asks for, even on a day that never dips.
//
// Each batch the bot compares what it wants to hold with what the account holds, so an order the
// market refuses (no bar at the next open, a price past max_slippage) is simply sent again later.
// Deterministic: float64 arithmetic on + - * / only, bigint money, no clock, no randomness, no files.

import { BPS, runBars, type Batch, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

const EMA_BARS = 240;
const WARMUP_BARS = 60;
const DIP_BPS = 80;
const STAKE_BPS = 3_000n;
const TAKE_PROFIT_BPS = 120n;
const STOP_BPS = 250n;

const PROBE_QUOTE_UNITS = 1_000_000n;
const BUY_MAX_SLIPPAGE_BPS = 300;
const SELL_MAX_SLIPPAGE_BPS = 1_000;

type Order = BuyInput | SellInput;

const buy = (amount: bigint): BuyInput => ({ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: BUY_MAX_SLIPPAGE_BPS });
const sell = (qty: bigint): SellInput => ({ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SELL_MAX_SLIPPAGE_BPS });

let ema: number | null = null;
let seen = 0;
/** The close the current position was bought on (null when flat). */
let entryClose: bigint | null = null;
let probe: 'todo' | 'bought' | 'done' = 'todo';

function decide(state: BarsState, batch: Batch): Order[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  const price = Number(bar.c);
  ema = ema === null ? price : ema + (2 / (EMA_BARS + 1)) * (price - ema);
  seen++;

  if (probe === 'todo') {
    probe = 'bought';
    return [buy(PROBE_QUOTE_UNITS)];
  }
  if (probe === 'bought') {
    if (qty > 0n) {
      probe = 'done';
      return [sell(qty)];
    }
    // the probe buy was refused: try it again
    return [buy(PROBE_QUOTE_UNITS)];
  }

  if (qty > 0n) {
    // holding without a recorded entry (should not happen): exit at once
    if (entryClose === null) return [sell(qty)];
    const tp = close * BPS >= entryClose * (BPS + TAKE_PROFIT_BPS);
    const sl = close * BPS <= entryClose * (BPS - STOP_BPS);
    return tp || sl ? [sell(qty)] : [];
  }

  // flat
  entryClose = null;
  if (seen < WARMUP_BARS) return [];
  if (price * 10_000 < ema * (10_000 - DIP_BPS)) {
    let amount = (state.equity * STAKE_BPS) / BPS;
    if (amount > state.cash) amount = state.cash;
    if (amount < PROBE_QUOTE_UNITS) return [];
    entryClose = close;
    return [buy(amount)];
  }
  return [];
}

await runBars({ onBatch: decide });
