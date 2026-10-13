# HELIX JARVIS Orchestration Implementation — v0.99.25

## Delivered in this slice

HELIX now has a governed JARVIS-style orchestration layer connecting the conversational command room, named worker identities, voice input/output, brain/provider routing, specialist council panels, governance actions, and existing HELIX objectives.

### Named identities

The command interface uses named fictional identities:

- Orion — primary command/orchestration identity. The UI does not label Orion as “CEO”.
- Lyra — research/evidence challenge
- Nova — market intelligence/strategy
- Atlas — execution/portfolio/liquidity
- Polaris — risk/capital governance
- Nebula — news/sentiment/external intelligence
- Titan — engineering/tools/testing
- Cassini — macro/cross-market context
- Astra — quality control/verification
- Mira — memory/knowledge continuity
- Selene — recovery/resilience/fail-closed operations

### Brain layer

NVIDIA NIM is a first-class configurable provider in the existing Brain settings and fallback routing layer. Provider credentials remain server-side and are never rendered back after save.

The orchestration layer routes different intents to capability-specific brain chains and supports fallback providers. The existing routing modes remain available: Auto, Hybrid, Cloud first, and Local only.

### Voice layer

The command-room composer supports browser SpeechRecognition/webkitSpeechRecognition for voice input and SpeechSynthesis for spoken responses. A final voice transcript is dispatched directly into JARVIS orchestration rather than merely filling the text box.

### Council / multi-agent orchestration

Market research, risk review, news/sentiment, portfolio review, and debate intents can invoke bounded specialist panels before Orion synthesizes the result. The UI exposes the panel as a live reasoning constellation and trace.

### Governed actions

The orchestrator can return UI actions such as selecting a specialist, opening Brain/Workforce/Governance/Improvement views, routing changes, pause/resume/shutdown controls, and issuing a governed improvement objective.

Self-improvement requests do not directly mutate production code. They create a governed objective path: analyze → sandbox → test → audit → promote.

Paper-trading intents remain paper-only and are explicitly constrained by existing risk and capital controls. Live execution is still structurally disabled in this release.

### Testability

The pure JARVIS intent/identity logic lives in `src/runtime/jarvis/orchestrator-core.ts`, which keeps command classification and agent mapping independently testable from the web framework/server function layer.

## Verification

- Modified/new JARVIS TS/TSX files: parser/syntax validation PASS.
- JARVIS identity/routing unit test: **2/2 PASS**.
- JARVIS orchestration contract test: **5/5 PASS**.
- Full project typecheck/build remains environment-dependent because the audit workspace may not contain the complete dependency set.

## Deliberate non-claims

This slice does **not** claim that CCXT exchange execution, FinBERT, external social APIs, or unrestricted self-modifying production code are complete. Those remain governed roadmap integrations.
