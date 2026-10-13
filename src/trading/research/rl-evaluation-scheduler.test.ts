import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRlEvaluationSchedule, evaluateRlChampionChallengerSchedule } from './rl-evaluation-scheduler.ts';

const h = 'a'.repeat(64);
const input = (o:any={}) => ({subjectId:'c', role:'champion', lastEvaluationAt:1000, now:1500, cadenceMs:1000, freshnessMs:2000, graceMs:100, evidenceHash:h, ...o});

test('healthy future schedule is eligible', () => {
  const r=evaluateRlEvaluationSchedule(input());
  assert.equal(r.due,false); assert.equal(r.eligible,true); assert.equal(r.missed,false);
});
test('due evaluation is not eligible until refreshed', () => {
  const r=evaluateRlEvaluationSchedule(input({now:2000}));
  assert.equal(r.due,true); assert.equal(r.eligible,false); assert.ok(r.reasons.includes('evaluation_due'));
});
test('missed evaluation fails closed', () => {
  const r=evaluateRlEvaluationSchedule(input({now:2201}));
  assert.equal(r.missed,true); assert.equal(r.eligible,false); assert.ok(r.reasons.includes('evaluation_window_missed'));
});
test('stale evidence fails closed', () => {
  const r=evaluateRlEvaluationSchedule(input({now:4001, freshnessMs:1000}));
  assert.equal(r.evidenceFresh,false); assert.equal(r.eligible,false);
});
test('missing first evaluation fails closed', () => {
  const r=evaluateRlEvaluationSchedule(input({lastEvaluationAt:null}));
  assert.equal(r.due,true); assert.equal(r.eligible,false); assert.ok(r.reasons.includes('initial_evaluation_required'));
});
test('invalid evidence hash rejected', () => assert.throws(()=>evaluateRlEvaluationSchedule(input({evidenceHash:'bad'})),/evidence_hash_invalid/));
test('deterministic hash', () => {
  const a=evaluateRlEvaluationSchedule(input()), b=evaluateRlEvaluationSchedule(input());
  assert.equal(a.deterministicHash,b.deterministicHash);
});
test('champion and challenger governance is role-bound', () => {
  const r=evaluateRlChampionChallengerSchedule(
    input(),
    input({subjectId:'x',role:'challenger'})
  );
  assert.equal(r.eligible,true);
});
test('role mismatch rejected', () => assert.throws(()=>evaluateRlChampionChallengerSchedule(input({role:'challenger'}),input({role:'challenger'})),/role_mismatch/));
