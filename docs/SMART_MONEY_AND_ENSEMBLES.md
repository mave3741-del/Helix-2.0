# Smart-Money, Critique, Research Orchestration & Ensemble Layer

## v0.22 implementation record

Helix now normalizes public smart-money observations for three evidence families:
- crypto/on-chain transfers with optional entity attribution and confidence
- institutional holdings using a 13F-style report-period plus filing-availability contract
- aggregate futures positioning using CFTC-style report/publication/availability timestamps

Every normalized observation is checked against the requested `asOfTs` before it can enter evidence. The smart-money context builder reports corroboration and opposing evidence but deliberately emits `tradeSignal: none` so large-wallet or positioning events can never become automatic trade commands.

The normalized smart-money batches can be passed through the existing `NormalizedSourceEvidencePipeline`, preserving durable evidence IDs, quality scoring, provenance and specialist fan-out.

The debate layer now supports explicit adversarial critique turns. Initial and critique turns are separately keyed and persisted, so a worker can challenge prior arguments without overwriting its initial turn. Critique tasks cite only the evidence supplied to the worker and store the challenge turn IDs in the durable reasoning trace.

Research orchestration now binds a replay-manifest ID to the research experiment and drives the ordered research path: backtest, OOS, walk-forward, paper evaluation, then promotion/retirement. Each stage writes an immutable evaluation record through the existing experiment store.

Strategy ensemble scoring now combines Sharpe-like performance, volatility, drawdown, robustness, turnover and correlation. Champion/challenger selection rejects fragile high-drawdown candidates; ensemble allocation weights eligible strategies deterministically; performance attribution reports contribution, risk contribution and excess contribution versus the ensemble.

Live trading remains disabled.
