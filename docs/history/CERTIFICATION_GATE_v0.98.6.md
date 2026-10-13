# HELIX Certification Gate — v0.98.6

## Phase 8.7 — External CI Workflow Hardening

This release hardens the external certification workflow so GitHub Actions does not rely on unsupported secret-context expressions inside `jobs.<job_id>.if`.

### Changes
- Production and external-certification jobs are gated by explicit `workflow_dispatch` only.
- Secret-dependent preconditions are checked inside runner steps through environment variables.
- Real database/connector/reviewer inputs remain fail-closed requirements.
- Live execution remains disabled.

### Local validation
- Workflow YAML parse: PASS.
- CI environment check: PASS.
- Release integrity: PASS.
- Migration integrity: PASS (30 migrations).
- Test coverage integrity: PASS (107/107).
- Deployment sandbox contract: PASS (11/11).

### External boundary
A successful `npm ci` on a clean GitHub runner, real PostgreSQL verification, real connector staging evidence, and deployment-host sandbox evidence remain required for final external certification.
