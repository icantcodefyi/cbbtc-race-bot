# cbBTC deep-dip bot

A long-only bot for make.fun's 24-hour BTC race: it trades Coinbase Wrapped BTC (cbBTC) against USDC
on 1-minute bars of the Orca Whirlpool pool, with 1,000 USDC of paper money, over the
`agent-fun/bars-replay/v1` protocol.

## Strategy

It stays in cash and only buys a deep dip, with a small slice of equity:

- an EMA of closes over 240 bars, seeded at the first close;
- after 60 bars, when the close sits more than 0.8% under the EMA, it buys 30% of equity
  (filled at the next bar's open);
- it sells the whole position at +1.2% over the close it bought on, or at -2.5% (a crash stop);
- a 1 USDC probe buy on the first bar, sold on the next one, keeps the guardrail's one trade.

A full round trip costs about 26 bps in fees, slippage and pool impact, so the bot trades rarely and
only on moves well past that. The small stake keeps the drawdown low on a falling day, which is when a
cash-heavy dip buyer has its edge over the many bots that hold BTC.

## Run

`node main.ts` (Node 22, type stripping). `vendor/makefun-bars.ts` is the kit's SDK shim, unchanged.
Deterministic: no clock, no randomness, no network, no files.

## License

MIT
