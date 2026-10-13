# Phase 5.5 — Trade Execution Risk Gate

The council decision is now converted into a deterministic, paper-only order intent before any execution gateway can be called.

Flow:

`candidate -> council decision -> eligibility -> portfolio readiness -> native risk check -> paper order intent`

The gate:
- rejects hold/reject decisions;
- rejects decisions vetoed by the risk council;
- requires evidence and risk-review eligibility;
- sizes orders from the configured maximum order percentage, optionally scaled by confidence;
- rechecks portfolio gross/single/theme/correlation constraints;
- rechecks native order, position, leverage, daily-loss, and drawdown limits;
- emits an auditable client order ID and evidence-linked paper intent;
- never calls a live broker.

Live broker submission remains behind the separate broker gateway and production-readiness boundary.
