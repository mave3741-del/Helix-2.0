# HELIX JARVIS Orchestration — v0.99.25

## Control plane
The HELIX command room now routes natural-language and browser voice commands through a governed orchestration layer before any action is applied.

### Named identities
Orion is the primary orchestrator. Key specialist identities are Lyra, Nova, Atlas, Polaris, Nebula, Titan, Cassini, Astra, Mira, and Selene. The UI avoids the generic “CEO” label.

### Intent routing
The orchestrator recognizes conversation, system status, market research, news/sentiment, risk review, portfolio review, workforce review, brain control, improvement, debate, paper-trade planning, and governance control.

### Multi-agent panels
Market/research requests can use Nova + Lyra + Cassini. Risk requests can use Polaris + Atlas + Lyra. Debate uses Lyra + Nova + Polaris. Orion performs the bounded synthesis. Each specialist is separately instructed to avoid inventing evidence or claiming execution.

### Brain routing
NVIDIA NIM is configured as a first-class optional provider and may be selected in the Brain settings page. Keys remain server-side in the encrypted credential vault. The model is configurable. Other providers remain optional fallbacks.

### Voice
The command composer provides browser speech recognition and speech synthesis. Voice commands enter the same orchestration path as typed commands.

### Self-improvement
Requests to improve or modify HELIX become governed objectives. The intended lifecycle is analyze → sandbox → test → audit → promote. The command room never silently edits production code.

### Trading autonomy boundary
The orchestration layer may prepare research, risk, and paper-trading decision paths. Live execution remains structurally disabled in v0.99.25. Owner capital/risk envelopes and existing fail-closed trading controls remain authoritative.


### Runtime test boundary
The pure identity and intent classifier lives in `src/runtime/jarvis/orchestrator-core.ts`, while server-side Brain calls and server-function execution remain in `src/runtime/jarvis/orchestrator.ts`. This split keeps the command grammar independently testable from the web framework runtime.

### Command-room UX
The UI maintains an active JARVIS session identity, renders the selected specialist, exposes a clickable 11-node reasoning constellation, and shows the latest council reasoning trace. Typed and voice commands share the same `orchestrateJarvis` server path.
