import { readFileSync } from 'node:fs';
const required = [
  'src/trading/data/connector-readiness.ts',
  'src/trading/runtime/deployment-sandbox.ts',
  'src/trading/observation/paper-observation.ts',
];
const missing = required.filter((p) => { try { readFileSync(p); return false; } catch { return true; } });
if (missing.length) { console.error(`PHASE4_OBSERVATION_GATE_FAIL ${missing.join(',')}`); process.exit(2); }
console.log('PHASE4_OBSERVATION_GATE_PASS connectors+sandbox+paper-observation');
