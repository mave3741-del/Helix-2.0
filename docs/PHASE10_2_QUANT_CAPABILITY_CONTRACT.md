# HELIX Phase 10.2 — Quant Capability Contract

## Objective
Translate the strongest research patterns associated with Qlib and RD-Agent into a HELIX-native, governed capability contract before any third-party engine or adapter is deployed.

## Required lanes
- Point-in-time data pipelines
- Factor/feature research
- Model training and selection
- Out-of-sample / walk-forward evaluation
- Portfolio and risk optimization
- Backtest acceleration
- Concept-drift/adaptation research
- Experiment governance and immutable lineage

## Governance
All lanes remain research/tactical only. No lane receives live execution authority. Each lane carries evidence requirements for provenance, reproducibility, point-in-time safety, and independent validation.

## Integration rule
This contract defines what HELIX must provide. It does not import Qlib/RD-Agent as unconditional runtime dependencies. Any later adapter/reimplementation still enters through the Phase 10.1 capability-integration admission lifecycle.
