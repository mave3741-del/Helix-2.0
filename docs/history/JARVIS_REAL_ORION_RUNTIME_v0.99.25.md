# HELIX v0.99.25 — Real Orion Runtime Orchestration

## Status
The earlier Orion autonomy UI mock has been removed from the active runtime. Orion's autonomy controls now execute against the real HELIX organization state and objective pipeline.

## Implemented
- Orion autonomy policy target: **88%** routine operational autonomy.
- Active research, news/sentiment, adversarial debate, governed paper-trade objectives and self-improvement requests can create **real organization objectives**.
- Objectives enter the existing worker/task pipeline, including native risk classification and approval gates.
- Pause/resume/provider-routing actions mutate the actual organization runtime state from the Command Room.
- The emergency shutdown action is fail-closed: Orion cannot self-initiate an emergency shutdown without a direct Owner command.
- Provider routing is now explicitly separated from live execution. Routing changes can never implicitly set `liveMode=true`.
- Rehydrated state is forced to `liveMode=false` in the current release.
- The Orion autonomy panel is derived from live runtime telemetry (org status, worker counts, approvals and routing mode), not hard-coded mock values.
- Voice and typed commands use the same orchestration path.

## Human boundaries retained
- Capital/risk-envelope changes remain Owner controlled.
- Emergency halt remains Owner controlled.
- Credentials/API secrets remain outside autonomous action execution.
- Major self-modification remains proposal/approval/release-gated.
- Live trading remains structurally disabled.

## Verification
- Orion autonomy policy + core routing: **9/9 PASS**.
- JARVIS orchestration contract: **5/5 PASS**.
- Static invariants for the Orion orchestrator: **PASS**.
- Full dependency-backed typecheck/lint/build is still a separate certification gate and has not been claimed here because the audit workspace does not have the complete dependency tree installed.
