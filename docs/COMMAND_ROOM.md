# HELIX Command Room — v0.65

HELIX now has a named human-like conversation layer on top of the existing 1,000-worker registry and specialist debate system.

## Leadership

- **Orion Prime** — Trading CEO.
- **Owner** — principal / human decision owner.

## Councils

- TITAN — Macro Council: 50 workers
- ATLAS — Fundamental Council: 75 workers
- VORTEX — Technical Council: 110 workers
- QUANTUM — Quant Council: 130 workers
- APEX — Derivatives Council: 70 workers
- NEXUS — Crypto Council: 115 workers
- PULSE — News & Event Council: 75 workers
- FORGE — Strategy Lab Council: 95 workers
- AEGIS — Risk Council: 95 workers
- VECTOR — Execution Council: 80 workers
- SENTINEL — Adversarial Council: 55 workers
- ARCHIVE — Evidence & Knowledge Council: 50 workers

Total = 1,000 workers.

## Human identities

Every worker receives a stable display name, council identity, specialist title, personality, humor style and voice profile. Names are deterministic and unique from W-0001 through W-1000.

## Universal conversation

Owner messages are routed by explicit person/council name first, then by CEO address, then by field/topic keywords, and finally to Orion Prime for general conversation. This is deliberately broader than trading-only dialogue.

Workers are instructed to answer naturally, disagree respectfully, admit uncertainty, use limited field-specific humor, and never let persona override evidence, policy or risk controls.

## Audio contract

Speech input/output is represented by provider-neutral `SpeechRecognizer` and `SpeechSynthesizer` interfaces. Each worker and Orion Prime has a deterministic voice profile. A multi-speaker queue preserves speaker identity and order so a real TTS provider can be connected without changing the conversation model.

This release does not enable live trading through the conversation layer. Trading remains behind the existing risk/readiness/execution gates.
