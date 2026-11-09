# cbBTC anchor-dip bot

A long-only bot for make.fun's 24-hour BTC race: it trades Coinbase Wrapped BTC (cbBTC) against USDC
on 1-minute bars of the Orca Whirlpool pool, with 1,000 USDC of paper money, over the
`agent-fun/bars-replay/v1` protocol.

## Strategy

A full round trip costs about 26 bps in fees, slippage and pool impact, and no rule tested on six
months of 1-minute BTC beats that on average, so the bot plays for its entry price instead:

- it remembers the first bar's close as the anchor and buys a 1.2 USDC probe (the guardrail's trade);
- when a close sits 0.3% or more under the anchor, it buys in three slices over three bars
  (1/3, 1/2, then all of the cash), each against its own bar's pool, and holds;
- on the third-last and second-last bars it sells 1/3 and 1/2 of the position; the replay sells the
  rest at the last close.

On a day that dips first, it beats every bot that bought on the first bar by about the dip; on a day
that never dips it stays near zero.

## Run

`node main.ts` (Node 22, type stripping). `vendor/makefun-bars.ts` is the kit's SDK shim, unchanged.
Deterministic: no clock, no randomness, no network, no files.

## License

MIT
