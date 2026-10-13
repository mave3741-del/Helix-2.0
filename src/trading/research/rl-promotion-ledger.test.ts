import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRlPromotionLedger, buildRlPromotionEntry, verifyRlPromotionLedger } from './rl-promotion-ledger.ts';

const h = (n: string) => n.replace(/[^a-f0-9]/gi, 'a').padEnd(64, '0').slice(0, 64);
const candidate = (id: string, eligible = true) => ({ candidateId:id, experimentId:`exp-${id}`, environmentHash:h('env'), algorithm:'ppo', seeds:[11,7], configHash:h('cfg'), evidence:{oosHash:h('oos'), robustnessHash:h('rob'), stressHashes:[h('stress')]}, gateEligible:eligible, rejectionReasons:eligible?[]:['oos_gate_failed'], createdAt:1000 });

test('promotion ledger creates deterministic chained entries', () => {
  const a = buildRlPromotionEntry(candidate('c1'), null);
  const b = buildRlPromotionEntry(candidate('c2', false), a.entryHash);
  assert.equal(verifyRlPromotionLedger([a,b]), true);
  assert.equal(a.decision, 'promoted');
  assert.equal(b.decision, 'rejected');
});

test('ledger rejects tampering, duplicate candidates and missing rejection reasons', () => {
  const ledger = new InMemoryRlPromotionLedger();
  const a = ledger.append(candidate('c1'));
  assert.throws(() => ledger.append(candidate('c1')), /duplicate/);
  const tampered = ledger.list(); tampered[0]!.algorithm = 'sac';
  assert.equal(verifyRlPromotionLedger(tampered), false);
  assert.equal(verifyRlPromotionLedger([{...a, previousHash: 'bad'}]), false);
});

test('promotion ledger requires distinct seeds and valid evidence hashes', () => {
  assert.throws(() => buildRlPromotionEntry({...candidate('c3'), seeds:[1,1]}, null), /two_distinct/);
  assert.throws(() => buildRlPromotionEntry({...candidate('c4'), evidence:{...candidate('c4').evidence, oosHash:'bad'}}, null), /evidence_hash_invalid/);
});
