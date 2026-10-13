# HELIX v0.99.25 — Windows Certification Runner

Use `CERTIFY_WINDOWS.bat` from the project root on the real Windows host where PostgreSQL and network access are available.

The runner executes dependency hydration, integrity gates, typecheck, lint, the full test suite, build, PostgreSQL preflight, and Phase 9 external-certification preflight.

It writes only command results/status codes to `certification-windows-results.txt`; do not paste secrets, private keys, database passwords, or tokens into the report.

Required environment/configuration for external certification is enforced by the existing project gates. Do not weaken those gates to obtain a PASS.
