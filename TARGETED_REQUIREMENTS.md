# HELIX Targeted Requirements & North-Star Targets

Status: LOCKED; implementation is engineering-complete through Phase 6.8 and Phase 7.5 in v0.97.4; external production certification remains gated.
Purpose: keep the major owner-directed targets visible inside every future release package so future phases do not lose scope or direction.

## 1. Product identity
- HELIX is a private-use trading intelligence and autonomous trading system for the owner.
- The system is an AI organization, not only a single chatbot.
- Exactly 1,000 persistent specialist workers remain the core organization size.
- The organization should feel coherent, intelligent, human-readable, and polished.

## 2. Leadership and councils
- One Trading CEO: ORION PRIME.
- 12 named specialist councils:
  1. TITAN — Macro
  2. ATLAS — Fundamental
  3. VORTEX — Technical / Market Structure
  4. QUANTUM — Quantitative / Statistical
  5. APEX — Derivatives
  6. NEXUS — Crypto / On-chain / Whales
  7. PULSE — News / Events
  8. FORGE — Strategy Lab / Research Evolution
  9. AEGIS — Risk / Portfolio Protection
  10. VECTOR — Execution / Order Intelligence
  11. SENTINEL — Adversarial / Devil's Advocate
  12. ARCHIVE — Evidence / Knowledge / Provenance
- Every worker must have a stable unique identity, name, role, specialization, council, personality traits, communication style, and voice profile.
- ORION PRIME must be able to address any team member by name and route work to the right specialist.

## 3. Human-like communication
- Owner can talk to ORION PRIME, a council, or any individual worker.
- Agents should handle trading questions and normal/general conversation when appropriate.
- Agents should understand context, remember relevant prior discussion, disagree naturally, explain uncertainty, ask useful follow-ups, and use field-relevant humor without becoming cartoonish.
- Personality must never override evidence, risk controls, or execution rules.

## 4. HELIX Command Room
- Dedicated command-room interaction layer for owner ↔ CEO ↔ councils ↔ workers.
- Support text and voice conversation through one shared conversation model.
- Support multi-member discussions and debates.
- ORION PRIME can call named members into a conversation based on topic and expertise.
- Store speaker-attributed transcript, timestamps, evidence references, decisions, dissent, and outcomes.

## 5. Audio / voice
- Owner voice input and spoken agent responses.
- Distinct stable voice profiles per named identity.
- Multi-speaker conversation queue with turn ordering.
- Future provider adapters must remain replaceable and must not change the core conversation model.

## 6. Trading capability
- Market coverage should expand aggressively with validated free/open/public sources and mature connectors.
- Wallet/broker/exchange connectivity must support paper trading first and live trading only after all readiness gates.
- Agent trading flow: market data → research/evidence → strategy/council reasoning → risk gate → execution → fills → reconciliation → post-trade learning.
- No worker receives raw private keys.
- Owner controls the session/daily capital and risk envelope; individual trades can be autonomous within hard limits once the live boundary is explicitly enabled.

## 7. News and event intelligence
- News/event layer should ingest official, public, free/free-tier, and otherwise validated sources where allowed for private use.
- Every event must carry provenance, timestamps, PIT validation, confidence and source metadata.
- Event processing should identify severity, urgency, affected markets, and relevant councils/workers.
- News must not automatically become a trade signal without corroboration and risk checks.

## 8. Cross-market intelligence
- Events should propagate across related assets, sectors, FX, rates, commodities, and crypto where evidence supports the relationship.
- Propagation must be bounded with confidence, decay, hop limits, and duplicate protection.
- Direct market matches must not be double-counted as propagated matches.
- Correlation/relationship maps should mature toward evidence-backed, regime-aware market relationships.

## 9. Research and strategy intelligence
- Maintain research → code → backtest → audit → OOS → walk-forward → stress → paper → review → promote/retire lifecycle.
- Keep reproducibility, PIT integrity, provenance, and anti-overfitting controls throughout.
- Expand automated strategy generation, mutation, champion/challenger testing, and portfolio-level attribution.

## 10. Tool expansion
- External tools/connectors are welcome when they add real capability.
- Every imported capability must pass license/terms review, security review, provenance review, latency review, deterministic/replay testing where applicable, and regression coverage.
- Prefer adapters and native HELIX wrappers over blind code copying.
- Add useful free/internal-use sources aggressively while keeping the source-of-truth and security boundaries explicit.

## 11. Code-size target
- North-star target: 200,000+ useful source lines across the full system.
- 200k is a minimum scale target, not an exact ceiling.
- 205k, 220k, 250k+ is acceptable when additional code adds meaningful capability, tests, tooling, integration, security, UI, voice, simulation, observability, or documentation.
- Never add filler code only to increase line count.
- Quality and polishing are mandatory alongside scale: modularity, tests, readability, performance, security, recovery, and maintainability must improve with size.

## 12. Quality / polish target
- Every major subsystem should have focused tests, failure handling, observability and recovery paths.
- Release packages must document what is implemented, what is verified, and what remains environment/external-provider dependent.
- Do not call the system production-ready until clean dependency installation, typecheck, lint, tests, build, migration/smoke verification, provider validation, sandbox/egress enforcement, and readiness gates all pass.

## 13. Current Phase 5 direction
- Phase 5.1: News/Event → market impact → specialist routing.
- Phase 5.2: News/Event → affected-market candidate bridge.
- Phase 5.3: Cross-market propagation.
- Next direction: propagated candidates → multi-council evidence/debate → risk-aware trade candidates → execution pipeline.

## 14. UI identity work
- Unique visual identities for ORION PRIME, councils, and workers are planned.
- UI identity design is intentionally deferred until the owner provides a visual/reference direction.
- Identity UI must later align with the stable backend identities and voice profiles.

## 15. Owner priority
When choosing between features, prioritize in this order unless explicitly changed:
1. Correctness and safety
2. Trading usefulness
3. Organization intelligence and coordination
4. Market/data/tool breadth
5. Human-like communication and voice
6. Observability and recovery
7. UI polish
8. Scale toward 200k+ useful source lines

This file is a durable project target sheet. Update it when the owner makes a substantive new target or changes priority.

## 16. Phase 5 execution loop
- Approved candidate intents must flow through the deterministic risk gate into PaperExchange before any future live review.
- Paper fills must preserve strategy, regime, and evidence provenance for post-trade attribution.
- Paper order retries must be idempotent and must not double-count capital, journal events, or learning attribution.
- A completed paper trade should feed back into performance snapshots and future strategy/council learning.
- Live broker calls remain disabled until the full readiness boundary is explicitly passed.


## Phase 5.7 — Post-Trade Learning Feedback
- Closed paper trades feed deterministic feedback records to named workers and councils.
- Track wins/losses, credited P&L, decision score, confidence calibration error, and reliability.
- Attribution is tied to the decision context that opened the position; execution remains behind the risk gate.
- Feedback is idempotent via deterministic record hashes and has a SQL persistence path.

## 17. Phase 5.8–5.12 adaptive learning targets
- Strategy adaptation: use post-trade worker/council reliability, robustness, drawdown and correlation to increase, decrease or quarantine strategy weight.
- Champion/challenger: only promote challengers that clear the existing statistical, OOS, walk-forward, sample-size and drawdown gates plus a configurable advantage threshold.
- Portfolio allocation: convert approved strategy quality into bounded capital weights with max-strategy caps, diversification penalties and deterministic allocation output.
- Execution-quality learning: feed fill rate, implementation shortfall, fees and slippage back into execution throttling without allowing learning to bypass the risk gate.
- Learning cycle: run the above as one deterministic cycle with a decision hash and durable persistence so future agents/councils can inspect and learn from prior cycles.

## 18. Phase 5.13–5.17 control-plane targets
- Phase 5.13: regime-aware risk budgeting with hard gross/net/strategy exposure caps and cash reserve.
- Phase 5.14: liquidity-aware sizing using top-of-book participation, risk capital, and execution-quality throttling.
- Phase 5.15: fail-closed learning admission from paper observation and upstream operational health.
- Phase 5.16: tamper-evident hash-linked audit history for adaptive learning cycles.
- Phase 5.17: unified deterministic Phase 5 control plane that combines safety budget, liquidity, observation admission, adaptive learning, and audit provenance.

## 19. Phase 6 certification and production boundary
- Phase 6.1: reproducible certification preflight and environment contract.
- Phase 6.2: external staging bootstrap and environment attestation.
- Phase 6.3: real database and migration verification contract.
- Phase 6.4: connector credential and permission attestation.
- Phase 6.5: deployment sandbox runtime probe and egress enforcement.
- Phase 6.6: observability, alerting, and incident-drill controls.
- Phase 6.7: bounded paper-canary orchestration.
- Phase 6.8: independent production-readiness review and separation-of-duties gate.
- `npm run phase6:certify` is a required certification gate; CI must execute it before the broader certification chain.
- External database credentials, connector credentials, deployment-host probes, and independent reviewer evidence remain required before enabling live execution.


## Phase 7.4 — Extended Paper Canary Cohorts
- Cohort admission is fail-closed on non-running sessions, live execution, missing owner capital approval, invalid identities, or overlong observation windows.
- Observation windows are explicitly bounded by start/end timestamps and a maximum duration policy.
- Cohort qualification requires minimum observations/trades and enforces rejection-rate, reconciliation, critical-alert, latency, drawdown, slippage and provenance gates.
- Cohort comparison requires at least two qualified cohorts using the same observation window.
- Comparison evidence is deterministic and safety-first; ranking is not a live-trading authorization and does not auto-promote a strategy.
