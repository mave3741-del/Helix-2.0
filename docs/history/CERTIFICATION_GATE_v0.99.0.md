# HELIX Certification Gate v0.99.0 — Phase 8.10

## Phase
1,000-Worker Native Capability Routing

## Implemented
- Deterministic worker capability → native-tool routing map.
- Permission intersection: capability grants cannot escalate beyond worker tool permissions.
- Native execution policy now rejects a native tool when the worker lacks the mapped capability.
- Capability grants expose provenance of why each native tool is available.
- Worker kernel supplies worker capability context to the tool runtime.
- No shell, unrestricted network, credential, wallet, or live-execution capability is introduced.

## Verification
- Native capability router: 5/5 PASS.
- Native-tool governance remains fail-closed for non-deployed tools.
- Live execution: DISABLED.

## External Boundary
Clean dependency-backed CI, real PostgreSQL execution, connector permissions, deployment-host sandbox evidence, and independent readiness evidence remain external certification requirements.
