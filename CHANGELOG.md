## v0.99.25 — JARVIS-Style HELIX Command Room

- Added a full-screen dark conversational command room inspired by the provided UI reference images without copying their product branding.
- Added animated HELIX intelligence orb, reasoning constellation, glass/blur surfaces, compact system pulse, governance context, and event stream.
- Added named fictional agent identities: Orion, Lyra, Nova, Atlas, Polaris, Nebula, Titan, Cassini, Astra, Mira, Selene.
- Changed the user-facing leadership identity from “CEO” to Orion while preserving internal compatibility IDs/contracts.
- Added browser voice input and voice playback using native Speech Recognition/Speech Synthesis when available.
- Added quick command actions for market scan, risk status, news/sentiment, and portfolio summary.
- Added a command-room navigation launcher and preserved existing governed command/risk paths.

## v0.99.25 — Full-Project Deep Audit Hardening

- Enforced regime-aware risk budgets on paper limit-order admission, not only immediate market orders.
- Extended per-strategy risk caps to opening short orders.
- Valued cross-symbol exposure/leverage using persisted last market marks when available.
- Corrected runtime daily realized-PnL accounting to reset by UTC trading day and recover safely across snapshots.
- Preserved opening strategy attribution when a different strategy closes or flips an existing lot.
- Removed stale package backup artifact and refreshed the canonical source-count handoff.


## v0.99.25 — Part 1 Critical Accounting/Risk Fixes

- Fixed paper execution equity/PnL staleness after position scale-in by preserving last market marks and revaluing immediately after fills.
- Persisted/restored paper execution marks across runtime snapshots.
- Wired regime-aware risk-budget enforcement into paper market/limit order admission for gross, net, strategy-order, and cash-reserve limits.
- Preserved native risk vetoes and combined both gate reason sets.
- Added deterministic regression coverage for scale-in PnL, snapshot mark restoration, and risk-budget vetoes.

## v0.99.25 — Certification/Test Pipeline Remediation

- Unified the `npm test` runner so all test groups use the TypeScript strip-types runtime and alias loader.
- Added the required `public/__grok/icon-180.png` asset.
- Removed stray `master_contacts/` screenshots from the release working copy.
- Added current certification status reflecting real dependency-backed verification limits.
- Targeted regression: 53/53 PASS.


## Phase 10.8.4 — RL Stress / Adversarial Evaluation

- Added deterministic stress evaluation for regime shift, volatility spike, degraded data, transaction-cost shock, and liquidity shock.
- Added fail-closed handling for degraded data and non-finite metrics.
- Added worst-case stress promotion gates and deterministic evidence hashing.
- Added Phase 10.8.4 focused regression suite.

# v0.99.18 — Phase 10.2 Quant Capability Contract

- Added a governed quant capability contract covering PIT data pipelines, factor research, model training/evaluation, portfolio optimization, backtest acceleration, concept-drift research, and experiment governance.
- Kept quant lanes research/tactical only with explicit provenance, reproducibility, independent-validation, and live-disabled requirements.
- Added deterministic contract hashing and tamper verification.
- Added 5 focused Phase 10.2 tests.
- No new migration required; durable capability admission remains migration 0038.

# Changelog

## v0.99.17 — Phase 10.1 Capability Integration Admission
- Added a governed external-capability admission contract covering license/data rights, security, tests, latency, provenance, and reproducibility evidence.
- Added fail-closed lifecycle controls for proposed → assessed → approved → deployed → retired, plus explicit rejection.
- Added durable PostgreSQL migration `0038_capability_integration_registry.sql`.
- Added deterministic integration/evidence hashing and explicit prevention of accidental third-party core dependency adoption.
- Live trading remains disabled.

# v0.99.15 — Phase 9.11 Certification Evidence Reconciliation

- Added fail-closed reconciliation of PostgreSQL, external-certification, connector-probe, deployment-attestation, and certification-ledger evidence.
- Added `phase9.11:reconcile` and two contract tests.
- PASS now requires package-version agreement, required evidence presence, all component statuses PASS, and live execution disabled.
- Real external certification remains pending until the Windows deployment supplies genuine passing evidence.

## v0.99.11 — Phase 9.7 Runtime Admission Evidence & Observability

- Added canonical, hash-sealed admission observations for every certified worker startup decision.
- Added durable append-only PostgreSQL storage with in-memory deterministic test storage.
- Admission evidence records deploymentId, appVersion, requestId, binding context, attestation hash, deterministic reason codes, evaluatedAt, and observationHash.
- Worker bootstrap now fails closed if admission evidence cannot be persisted before supervisor startup.
- Added migration 0036_deployment_admission_observations.sql.
- Phase 9.7 focused gate: 16/16 PASS; test coverage integrity 114/114; migration integrity 35/35; release integrity PASS.
- Live execution remains disabled and real external certification remains unclaimed.

## v0.99.10 — Phase 9.6 Runtime Deployment Admission

- Added fail-closed `DeploymentAdmissionGate` binding worker startup to durable reviewer decision, deployment identity/version, and current attestation hash.
- Wired certified admission into `TradingWorkerActivationService.bootstrap()` when configured.
- Added Phase 9.6 test gate: 24/24 focused tests.
- Coverage integrity: 113/113; migration integrity: 34/34; release integrity: PASS.
- External certification remains unclaimed pending real infrastructure/evidence.


## v0.99.8 — Phase 9.4 Independent Reviewer Decision Controls
- Added bounded approval expiry and fail-closed deployment on expired/missing approval.
- Added canonical SHA-256 decision hashes.
- Added durable approval immutability migration 0034 with append-only update/delete trigger.
- Added 27/27 focused decision-control verification.
- Removed stale Master documents from the release root; v1.69 is authoritative.

## 0.99.7 — Phase 9.3 Sealed Evidence Replay

- Added deterministic sealed certification-bundle replay verifier.
- Added tamper tests for artifact bytes and `SEALED.flag`.
- Aligned package/package-lock versions to 0.99.7.
- Master specification advanced to v1.68.
- External certification remains fail-closed and pending real infrastructure evidence.
## v0.99.4 — Phase 8 FINAL Engineering Closure

- Closed Phase 8 native-tool governance engineering work as a consolidated release boundary.
- Added catalog/factory parity regression for all 16 native trading/research tools.
- Added `phase8:engineering:gate` and `phase8:final` consolidated local gate commands.
- Local Phase 8 focused/runtime verification: 30/30 PASS; migration integrity 32/32; release integrity PASS; coverage integrity 111/111.
- Explicitly preserves the external-certification boundary: dependency hydration, real PostgreSQL, connector permissions, deployment-host evidence, and independent readiness review remain pending.
- Live trading remains disabled.

## v0.99.3 — Phase 8.13 Native Tool Approval & Deployment Governance
- Added durable native-tool approval/deployment governance with independent reviewer, conflict declaration, evidence IDs, evidence hash, reason, and tool fingerprint capture.
- Added migration 0033_native_tool_approvals.sql for durable approval/rejection decisions.
- Added fail-closed fingerprint and safety checks before approval/deployment.
- Added Phase 8.13 focused gate: 23/23 PASS; test coverage integrity 111/111; migration integrity 32/32.
- Live execution remains disabled.

## v0.99.2 — Phase 8.12 Governed Worker Runtime Bootstrap
- Connected server-side worker activation to durable native-tool registry reconciliation before worker bootstrap.
- Added `GovernedNativeToolRuntime` so native execution requires a bootstrapped registry and a durable `deployed` lifecycle.
- Routed market snapshot, technical signal, risk check, and backtest worker tools through the governed native runtime when the server worker activation is used.
- Added fail-closed startup behavior for registry drift or unsafe durable tool records.
- Added activation regression coverage for the startup reconciliation boundary.
- Live execution remains disabled.


## v0.99.0 — Phase 8.10 Native Capability Routing
- Added deterministic worker capability → native-tool routing for the 1,000-worker architecture.
- Enforced permission intersection so capability discovery cannot escalate a worker beyond role-granted native tools.
- Added runtime fail-closed capability checks for native tool execution.
- Added capability-grant provenance and five focused routing tests.
- Live execution remains disabled.
# v0.98.9 — Phase 8.9 Native Tool Governance

- Governed native-tool lifecycle and execution registry.
- Added durable SQL migration 0032 for native tool records.
- Added schema/implementation hashes and provenance requirements.
- Added 5 regression tests and kept live execution disabled.

## v0.98.9 — Phase 8.8 External Attestation + Connector Probe

- Signed deployment attestation is now mandatory for external certification.
- Added bounded secret-safe connector staging probe.
- Updated external CI workflow and fail-closed certification inputs.

## v0.98.9 — Phase 8.6 Worker Activation & Executable Event Loop

- Added `event.analyze` as the executable task contract for allowlisted runtime events.
- Added `TradingWorkerActivationService` to connect event routing, the authoritative task queue, the 1,000-worker registry/supervisor, and persisted task results.
- Added `ServerTradingRuntime.createWorkerActivationService()` so activation reuses the runtime-owned queue/router instead of creating a duplicate execution path.
- Added worker-activation integration coverage and wired it into `npm test`.
- Live execution remains disabled.

# HELIX v0.98.4 — Phase 8.5 Durable Event-to-Worker Routing

## Added
- Added `TradingEventWorkerRouter` to bridge an allowlisted set of strategic/tactical runtime events into the durable worker task queue.
- Added deterministic `event-task:<event-id>` task identities with queue-level idempotency.
- Added explicit priority ordering for risk alerts, market-moving news, macro releases, regime changes, strategy signals/reviews, general news, and paper fills.
- Kept raw `market.tick` events off the default worker-routing path to protect the low-latency data loop.
- Added integration coverage proving paper-fill events are durably queued before event publication completes.

## Verification
- Focused event-router + runtime regression: 21/21 PASS.
- Test-file coverage: 106/106 `.test.ts` files represented in the main test gate.
- Live execution remains disabled.

## v0.98.3

- Added Phase 8.4 external certification evidence replay verifier.
- Added tamper-detection, secret-shaped-key rejection, and valid-artifact tests.
- Added `external:evidence:verify` command.
- Corrected master baseline to v0.98.3.
- Live execution remains disabled.

# HELIX v0.98.2

## Phase 8.3 — Direct-Command Dependency Guard
- Added dependency-integrity lifecycle guards for direct test, typecheck, lint, build, and db:smoke commands.
- Partial or missing node_modules states now stop these commands before application tooling runs.
- Synchronized package and lockfile version to 0.98.2.
- Full dependency-backed certification remains blocked locally because npm ci cannot complete due transport timeout.

# HELIX v0.98.1

## Phase 8.2 — Dependency Hydration Integrity

- Added an explicit dependency-integrity certification gate.
- Full CI and external certification now fail early when the installed dependency tree is incomplete.
- Added machine-readable dependency evidence under `artifacts/dependency-integrity.json`.
- Synchronized package and lockfile version to 0.98.1.
- Live execution remains disabled.

## v0.97.3 — Phase 7.4 Extended Paper Canary Cohorts

- Added deterministic paper-canary cohort admission bound to explicitly running, paper-only Phase 7 sessions.
- Added bounded observation windows with maximum duration enforcement.
- Added cohort qualification across minimum observations/trades, rejection rate, reconciliation mismatches, critical alerts, p95 latency, drawdown, slippage, required regimes and reconciliation provenance.
- Added deterministic safety-first cohort comparison evidence; comparison never enables live execution or auto-promotes a strategy.
- Added SQL/in-memory cohort stores and migration `0030_phase7_paper_canary_cohorts.sql`.
- Added `phase7:canary-cohorts` and GitHub CI coverage; source test coverage is now 104/104.
- Live execution remains disabled.

## v0.97.2 — Phase 7.3 Operational Control Room & Alert Routing

- Added deterministic control-room incident classification and ordered operator runbooks.
- Critical reconciliation/database incidents automatically rollback an active paper session.
- Critical security incidents abort the active paper session and require independent review before re-arming.
- Market-data and worker warnings route to candidate-halt/paper-pause procedures without silently changing session state when policy does not require it.
- Added hash-addressable control-room routes for audit evidence.
- Added `phase7:control-room` and included it in the Phase 7 preflight/CI graph.
- Added a permanent 103/103 test coverage-integrity expectation through the main test list plus phase gate.
- Live execution remains disabled.

# Changelog — HELIX v0.97.2

## v0.97.2 — Paper Runtime Safety Hardening
- Added a mandatory running `PaperOperationSession` gate to `ServerTradingRuntime.paperOrder()` and `paperLimitOrder()`; direct execution now fails closed without a running paper session.
- Hardened `AgentTradeGateway` to reject live connectors and require explicit risk approval, owner approval, and paper-session identity.
- Hardened `trade.execute` worker payload handling so omitted owner approval is never treated as approval.
- Repaired the specialist evidence-review contract so queued evidence IDs are resolved and the result includes an explicit, fail-closed `approved` decision with complete evidence coverage.
- Fixed Windows Phase 6 preflight to use `npm.cmd`.
- Updated release metadata and continuity documentation.
- Live execution remains disabled.

## Phase 7.2 — Paper Session Persistence + Recovery

- Added durable paper-operation session persistence with migration 0029.
- Added snapshot and event hash-chain verification before restore.
- Running sessions recover fail-closed into `paused` after process restart.
- Recovery is idempotent after the first recovery event.
- Added in-memory and SQL session stores plus tamper-detection tests.
- Live execution remains disabled.

## Previous release

## Phase 7.1 — Controlled Paper Operations
- Added paper-only operation session controller.
- Added readiness/owner/live-execution fail-closed guards.
- Added automatic rollback thresholds for rejection rate, reconciliation mismatch, critical alerts, and p95 latency.
- Added chained transition hashes and terminal abort semantics.
- Added 10 focused regression tests.
- Live execution remains disabled.

# v0.94.0 — Certification Consistency Hardening

- Enforced `npm run phase6:certify` in CI before the full certification chain.
- Updated release metadata to 0.94.0 and aligned package-lock root version.
- Updated Phase 6 certification fixtures to derive package version dynamically.
- Updated START-HERE, README, TARGETED_REQUIREMENTS, and project handoff references to the current phase/release.
- Added a stronger release-integrity secret scan and current-release manifest checks.

## v0.93.0 — Phase 6 Engineering Completion
- Phase 6.1-6.8 control chain implemented and unified under `npm run phase6:certify`.
- Added staging attestation, external DB verification contract, connector permission attestation, sandbox probe, observability drill, paper canary, and independent review gate.
- Live execution remains disabled; external production evidence remains pending.


## v0.92.0 — Phase 6.1 Certification Reproducibility Foundation

- Added Phase 6 certification gate model with fail-closed semantics.
- Added deterministic `phase6:preflight` environment/version checks.
- Generalized release-integrity version validation so future semver releases are not rejected by a hard-coded version.
- Preserved live execution disabled.
- Added Phase 6 roadmap and authoritative Phase 6.1 acceptance criteria.
# v0.87.0 - Phase 5.18-5.22

Implemented five Phase 5 control-plane steps together: order/execution reconciliation, broker failover, market-data health/quorum, observability/alerts, and strict deployment-level sandbox enforcement. Added deterministic hashes, fail-closed gates, paper-only connector restrictions, and focused regression tests.


## v0.69 — Phase 5.4
- Candidate-to-council debate orchestration and deterministic evidence aggregation.
- Risk council veto/coverage gate before risk review eligibility.
- Named specialist task routing preserved through debate.

## v0.70 — Phase 5.5
- Added deterministic candidate-to-paper-order risk gate.
- Confidence-bounded order sizing with hard maximum-order limits.
- Revalidated portfolio exposure, concentration, correlation, leverage, daily loss, drawdown, and evidence gates.
- Added auditable paper order intent with stable evidence references.
- No live broker call is made by the new gate.


## v0.71 — Phase 5.6 Paper Execution + Post-Trade Feedback
- Added `paper-order-router` to execute approved paper intents through the existing runtime/PaperExchange path.
- Added execution feedback for fills, account state, completed trade attribution and strategy performance snapshots.
- Fixed PaperExchange fill provenance propagation for strategy ID, regime and evidence IDs.
- Hardened paper fill journal idempotency to prevent duplicate learning/capital accounting on retry.
- Added Phase 5 paper execution regression coverage.
- Live broker execution remains outside this layer.

## v0.77 — Phase 5.8–5.12 Integrated Adaptive Learning Bundle
- Phase 5.8: added strategy adaptation using robustness, drawdown, correlation and post-trade member/council reliability.
- Phase 5.9: added champion/challenger rotation wrapper with existing statistical, OOS, walk-forward, sample-size and drawdown gates.
- Phase 5.10: added adaptive portfolio allocation with strategy caps, minimum weights, diversification/correlation penalties and capital budgeting.
- Phase 5.11: added execution-quality feedback that throttles weak fills and rewards strong execution without bypassing risk controls.
- Phase 5.12: added a deterministic Phase 5 learning orchestrator and durable SQL/in-memory learning store with decision hashes.
- Added migration 0027 for adaptive-learning cycle and execution-quality feedback persistence.
- Live execution remains disabled; all adaptive decisions stay behind existing readiness/risk boundaries.

## v0.78–v0.82 — Phase 5 Control Plane Expansion
- Added risk-budget, liquidity-sizing, learning-admission, learning-audit-ledger, and unified phase5-control-plane modules.
- Added migration 0028_phase5_control_plane.sql.
- Added focused tests for all five slices.
- Live execution remains disabled.

# v0.88.0 - Phase 5.23-5.25
- Phase 5.23: added Command Room ↔ trading bridge with owner-controlled capital envelopes, deterministic command audit hashes, and no per-trade human approval requirement.
- Phase 5.24: added provider-neutral voice runtime for speech recognition, Command Room response synthesis, and bounded multi-agent voice rounds with stable speaker identities.
- Phase 5.25: added controlled readiness/canary evaluation with deployment attestation, observation/rejection thresholds, zero-tolerance reconciliation mismatches by default, critical-alert gate, latency gate, and explicit live-review enablement.
- Live execution remains disabled unless all existing readiness/security/governance gates and the new controlled canary gate are explicitly satisfied.


## v0.89.0 — Full-program hardening kickoff
- Fixed worker sandbox direct Node builtin/network escape using a restricted module loader and sanitized process facade.
- Fixed broker order submission failover hazard: reconcile `clientOrderId` before/after submission and route cancels only to the known order owner.
- Fixed market-data quorum independence: duplicate provider identities cannot count as separate quorum sources.
- Added concrete deployment sandbox enforcement manifests (`deploy/worker.Dockerfile`, `deploy/docker-compose.sandbox.yml`) and static contract verification.
- Added regression coverage for all three critical blockers and current deployment/readiness behavior.
- Updated current project handoff references to the Phase-5.25 state; historical continuity files remain preserved.
- Live execution remains disabled.

## v0.90.0 — Hardening Certification Gate
- Verified 196/200 script tests (4 documented skips) and 31/31 critical runtime hardening tests.
- Reverified Phase 5 execution path at 13/13 PASS and migration integrity at 27/27 PASS.
- Locked the release at 300 TypeScript/TSX source files and 29,338 source lines.
- Recorded the clean dependency-backed certification boundary explicitly: current workspace hydration remains incomplete because npm registry transport timed out.
- `typecheck`, `lint`, and `build` are therefore not claimed as passing in this environment.
- Live execution remains disabled.

## v0.91.0 — Clean-Environment Certification Achieved
- Reproduced `npm ci` cleanly in this workspace (the v0.90 transport timeout did not recur) and, for the first time since v0.83, ran `typecheck`, `lint`, `test`, and `build` end-to-end.
- Fixed 23 typecheck errors, 3 lint errors, and 1 failing test — see `docs/WORK_CONTINUITY_LOG.md` v0.91 for the full list, including a real fill-ratio calculation bug in adversarial replay, a type-name collision between two unrelated `StrategyPerformanceSnapshot` types, and a stale test against an already-correct readiness gate.
- Verified (not just re-tested) the v0.89 critical fixes by reading the worker-sandbox ESM loader and broker-failover router directly; both hold up on inspection.
- Result: typecheck 0 errors, lint 0 errors/0 warnings, tests 309/309 PASS, production build succeeds end-to-end.
- Live execution remains disabled. External CI reproducibility, real database/connector verification, deployment-sandbox runtime validation, and independent production review remain outstanding.

## v0.91.1 — Release Integrity Hardening
- Aligned `package.json` and `package-lock.json` on `0.91.0` release metadata.
- Removed the shipped preview OAuth secret; live-preview credentials are now injected via `GROK_PREVIEW_CLIENT_SECRET`.
- Removed `.helix/work` test artifacts and stale historical master-document copies from the release workspace.
- Renamed the research/adaptation `StrategyPerformanceSnapshot` type to `StrategyExperimentSnapshot` to remove the cross-domain name collision.
- Added `release:integrity` and wired it into `ci:certify` so version, secret, and release-cleanliness regressions fail closed.

## v0.93.0 — Phase 6 Engineering Completion
- Added Phase 6.2-6.8 operationalization controls and unified certification command.
- Added staging bootstrap attestation, external DB verification contract, connector permission attestation, deployment sandbox probe, observability incident drill, paper canary policy, and independent review gate.
- Live execution remains disabled.

## v0.97.0 — Phase 1–7 Full Audit: Closed a Silent CI Coverage Gap
- Found that `npm test` (and therefore `ci:certify`/`ci:prod`/`ci:full`) silently excluded 20 of 102 test files, including `execution/broker-failover.test.ts`, both `runtime/deployment-sandbox-*.test.ts` files, `runtime/worker-supervisor.test.ts`, and this release's own `ops/paper-operations.test.ts` + `ops/paper-operation-persistence.test.ts`. `phase7:paper-ops` was never invoked in CI at all.
- Running the orphaned files surfaced and fixed 4 real failures: 2 invalid test fixtures (`org/ceo-reconciliation.test.ts`, referencing a nonexistent department id) and 2 safety-relevant assertions (`runtime/migrate.safety.test.ts`, catching that fresh/recovered organization state defaulted to `"development"` instead of the intended `"sandbox"` label — fixed at the source, confirmed unused elsewhere first).
- Added all 20 files to the main `test` script and added an explicit Phase 7 CI gate step alongside the existing Phase 6 one.
- Fixed two broken verification scripts: `release-integrity.mjs` correctly rejected this release's own zip for containing leftover git-ignored sandbox-test artifacts (a packaging gap, not a source defect — cleaned for this pass); `db-smoke.mjs`'s unique-index check used a string pattern that could never match Postgres's actual output, verified and replaced.
- `npm run ci:certify` now passes end-to-end in one unbroken clean-environment run — the first recorded instance in this project's history.
- Live execution remains disabled throughout.

## v0.97.4 — Phase 7.5 Independent Post-Canary Review
- Added `src/trading/canary/independent-post-canary-review.ts` with fail-closed independent review logic for extended paper-canary evidence.
- Enforced reviewer/implementer separation of duties, declared conflicts, zero open critical findings, valid evidence hashes, qualified cohorts and comparable cohort evidence.
- Review results are evidence-only and cannot re-arm paper sessions, enable live execution, or bypass the independent risk engine.
- Added migration 0031_phase7_independent_post_canary_review.sql with durable review snapshots/evidence hashes and a database-level reviewer/implementer separation constraint.
- Added `phase7:independent-review` and connected it to Phase 7 preflight and test coverage integrity.
- Verification: independent review 5/5 PASS, test coverage integrity 105/105 PASS, release integrity PASS, migration integrity PASS across 30 migrations.
- Full dependency-backed typecheck/lint/test/DB-smoke/build certification remains an external clean-environment gate.
- Live execution remains disabled.

## v0.99.6 — Phase 9.2 Evidence-Sealed External Certification Handoff
- Added `scripts/seal-external-evidence.mjs` to create a credential-safe, hash-sealed external certification bundle.
- Added deterministic per-artifact SHA-256 entries plus a bundle root hash and `SEALED.flag`.
- Sealing is fail-closed unless external certification is `PASS`, preflight is `READY`, and the evidence verifier passes.
- Added credential-shaped key rejection for sealed evidence and explicit live-execution-disabled metadata.
- Added Phase 9.2 sealing tests.

## v0.99.9 — Phase 9.5
- Added deployment-review binding: reviewer decision hash + deployment identity + signed attestation hash.
- Added SQL-backed append-only deployment binding store and migration 0035.
- Fixed native-tool approval SQL persistence placeholders for expiry and decision hash.
- Added 18 focused Phase 9.5 tests; coverage integrity is 112/112.
- External certification remains pending on real infrastructure/evidence.

## v0.99.12 — Phase 9.8 Certification Run Ledger
- Added reproducible certification-run ledger with package/lock/source hashes and Node/npm environment fingerprint.
- Added append-only PostgreSQL migration 0037 for certification run records.
- Added record-hash replay tests and explicit PENDING_EXTERNAL_PASS state.
- Live execution remains disabled; external certification remains pending.

## v0.99.14 — Phase 9.10 Real PostgreSQL Verification Gate
- Added `scripts/postgres-certification.mjs` as a focused, fail-closed real PostgreSQL verification gate.
- The gate runs real `db:migrate`, `db:verify`, and append-only `db-immutability` checks when `DATABASE_URL` is configured.
- Evidence is written to `artifacts/postgres-certification-evidence.json` with password and raw connection-string exposure explicitly disabled.
- Added dependency-free contract coverage for the blocked/no-`DATABASE_URL` path.
- Live execution remains disabled; this gate does not certify connectors, deployment sandbox, CI hydration, or independent readiness review.

## v0.99.16 — Phase 9 completion operator gate
- Added `scripts/phase9-complete.mjs` as the single fail-closed Phase 9 completion runner.
- Added `scripts/phase9-complete.test.mjs` covering prerequisite blocking, secret-safe dry-run sequencing, and reviewer/implementer separation.
- Added `phase9:complete` npm command. The operator gate never prints `DATABASE_URL` or other credential values and refuses to proceed with live execution enabled.
- Phase 9 remains externally pending until genuine Windows PostgreSQL, connector, deployment, CI, and independent-review evidence is produced and reconciled.

## v0.99.19 — Phase 10.3 Event-Driven Fast Path
- Added a deterministic, paper-only fast-path execution contract for normalized market events.
- Added monotonic sequence, duplicate-event, stale-data, paper-session, and hard-risk fail-closed controls.
- Added explicit latency-budget accounting and SHA-256 decision hashes.
- Kept live execution, LLM calls, and unrestricted network access outside the fast path.


## v0.99.22 — Phase 10.6
Governed crypto strategy capability contracts: market-making, arbitrage, trend and mean-reversion research modes; paper/dry-run only; bounded optimization; venue-admission dependency; cost/slippage/walk-forward/overfit evidence; hard position/notional/daily-loss limits. Live execution remains disabled.


## v0.99.23 — Phase 10.7 Vector Research Acceleration
- Added bounded deterministic vector research parameter-grid evaluation with candidate/run hashes and multiple-testing controls.
- Added in-sample, out-of-sample, walk-forward and paper research stages with fail-closed statistical promotion gates.
- Added migration 0042 and vector research focused tests; live execution remains disabled.

## v0.99.24 — Phase 10.8 Reinforcement-Learning Research Capability
- Added HELIX-native RL research capability contract inspired by FinRL/TensorTrade patterns without making either project a mandatory dependency.
- Added explicit observation/action spaces, bounded reward policy, training/validation/OOS budgets, multi-seed stability, and paper-only lifecycle governance.
- Added migration 0043 `rl_capability_registry` with structural `live_execution_enabled=false`.
- Added 7 focused RL tests; combined Phase 10.1–10.8 focused regression is 43/43 PASS.
- Live execution remains disabled; full dependency-backed CI remains an external gate.

## v0.99.24 — Phase 10.8.2 RL OOS Walk-Forward Hardening

- Added structural RL out-of-sample walk-forward evaluation.
- Added chronological train/test separation with configurable embargo bars.
- Added deterministic OOS evidence hashing bound to environment, algorithm, seed and configuration.
- Added fail-closed insufficient-data and invalid-window checks.
- Added 3 focused OOS/embargo/determinism tests; combined RL/walk-forward focused suite: 9/9 PASS.

## v0.99.24 — Phase 10.8.1 RL Evaluation Hardening
- Added deterministic multi-seed RL evaluation contract.
- Added reward-bound enforcement and finite metric validation.
- Added worst-case drawdown/turnover aggregation across seeds.
- Added deterministic evaluation hash for reproducible research evidence.
- Added regression tests for multi-seed requirements, reward bounds, determinism, and worst-case risk.
- Live execution remains structurally disabled.

## Phase 10.8.3 — Multi-Seed OOS Promotion Gate
- Added `src/trading/research/rl-multiseed-walk-forward.ts`.
- Added deterministic multi-seed chronological OOS aggregation and promotion gating.
- Added worst-case drawdown, minimum profitable-window rate, median-return, mean-Sharpe and seed-agreement gates.
- Added deterministic SHA-256 evidence hashing.
- Added focused regression tests and `phase10.8.3:rl-multiseed-oos` npm script.
- Live execution remains structurally disabled.

## Phase 10.8.5 — RL Robustness / Cross-Regime Generalization Gate
- Added deterministic combined multi-seed OOS + adversarial stress promotion gate.
- Added minimum combined stress pass-rate and per-seed robustness-rate controls.
- Bound combined evidence to OOS/stress hashes; preserved paper-only/live-disabled boundary.
- Verified 18/18 focused RL robustness regression tests.


## Phase 10.8.6 — RL Candidate Promotion Ledger
- Added deterministic append-only RL promotion ledger with candidate identity, experiment identity, configuration hash and OOS/robustness/stress evidence hashes.
- Added chained SHA-256 entry hashes and duplicate-candidate rejection.
- Promotion is only `promoted` when the supplied robustness/OOS gate is eligible; rejected candidates require explicit rejection reasons.
- Added migration 0045 `rl_promotion_ledger`.
- Added focused ledger tamper, duplicate, seed and evidence-integrity tests.
- Live execution remains structurally disabled.

## Phase 10.8.8 — RL Continuous Reassessment
- Added deterministic incumbent-champion reassessment gate.
- Added rollback decision on robustness/stress/seed/drawdown degradation.
- Added append-only reassessment audit migration 0047.
- Live execution remains disabled.

## Phase 10.8.9 — RL Evaluation Scheduler & Governance
- Added deterministic champion/challenger evaluation cadence and freshness governance.
- Missed evaluation windows and stale/missing evidence fail closed.
- Added immutable scheduler audit migration 0048.
- Added role-bound champion/challenger scheduler checks and deterministic evidence hashes.
- Live execution remains disabled.


## Phase 10.8.10 — RL Unified Lifecycle Control Plane
- Bound scheduler, reassessment, robustness/promotion evidence, and champion/challenger state into one deterministic lifecycle decision.
- Added fail-closed hold/rollback semantics and immutable control-plane evidence.
- Added PostgreSQL migration 0049 with append-only mutation protection.
- Added focused lifecycle regression tests.

## Phase 10.8.11–10.8.14 batch
- Added RL lifecycle persistence/recovery, champion drift monitoring, emergency stop, and unified audit bundle controls.
- Added migrations 0050–0053 and focused regression coverage.

## v0.99.25 — JARVIS orchestration layer
- Added a governed HELIX JARVIS orchestration control plane with intent routing, named agent personas, bounded specialist panels, action descriptors, and fail-closed fallback behavior.
- Added NVIDIA NIM as a configurable brain/provider (server-side credentials, OpenAI-compatible endpoint, configurable model).
- Command Room UI now dispatches conversational, research, risk, news/sentiment, governance, improvement, brain, and paper-trading-plan requests through the orchestration layer.
- Added explicit governance language for self-improvement: analyze → sandbox → test → audit → promote; no silent production self-editing.

## v0.99.25 — JARVIS orchestration completion slice

- Added a dedicated JARVIS orchestration core with named fictional identities: Orion, Lyra, Nova, Atlas, Polaris, Nebula, Titan, Cassini, Astra, Mira, Selene.
- Moved pure intent/identity routing into `src/runtime/jarvis/orchestrator-core.ts` for independent testability.
- Added bounded specialist council panels for market research, risk, news/sentiment, portfolio review, and debate, followed by lead synthesis.
- Connected browser voice transcripts directly into orchestration and browser speech synthesis for spoken replies.
- Added persistent command-session identity for the active browser session.
- Added live council reasoning trace and clickable agent selection in the command-room constellation.
- Added NVIDIA NIM as a first-class configurable Brain provider with fallback routing.
- Added governed self-improvement objective dispatch; no silent production code mutation.
- Preserved paper-only trading and structural live-execution disablement.
- JARVIS identity/voice/provider contract: 5/5 PASS; JARVIS routing unit tests: 2/2 PASS.

## v0.99.25 — Real Orion Runtime Orchestration
- Replaced the Orion autonomy UI mock with a runtime-backed Orion autonomy panel.
- Added a governed Orion autonomy policy with an 88% operational-autonomy target.
- Added autonomous objective creation for research, news/sentiment, debate, paper-trade planning and self-improvement proposals.
- Wired Orion governance actions through the real organization store with fail-closed emergency-stop behavior.
- Separated provider routing from live-execution enablement; routing can no longer implicitly switch live mode on.
- Added dedicated Orion autonomy and routing-governance regression tests.
