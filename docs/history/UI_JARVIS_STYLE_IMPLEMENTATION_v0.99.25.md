# HELIX UI / JARVIS-Style Interaction — v0.99.25

## Current implementation
The HELIX command room now uses the uploaded dark conversational UI references as the visual direction, without copying their branding.

### Visual language
- Dark immersive full-screen command room.
- Minimal glass/blurred surfaces and restrained cyan/violet glow.
- Animated HELIX orb as the primary intelligence focal point.
- Agent reasoning constellation with named worker identities.
- Floating conversational composer with microphone, voice response, quick actions, and send controls.
- Responsive mobile/desktop behavior.

### HELIX identities
- Orion — primary leadership/orchestration identity.
- Lyra, Nova, Atlas, Polaris, Nebula, Titan, Cassini.
- Astra, Mira, Selene.

The UI intentionally avoids calling Orion “CEO”; internal IDs/implementation contracts remain unchanged where required for compatibility.

### Existing HELIX integration
- Command submission continues through the existing `planObjective` route.
- Messages are surfaced in a conversational feed.
- Voice input uses browser Speech Recognition when available.
- Voice output uses browser Speech Synthesis when available.
- Quick actions map to market scan, risk status, news/sentiment, and portfolio summary prompts.
- Existing governance/risk/routing paths are not bypassed.

## Verification
- TypeScript/JSX syntax transpilation for all modified TSX/TS files: PASS.
- Full dependency-backed build/typecheck not executed in the extracted workspace because dependencies are intentionally not installed there.
