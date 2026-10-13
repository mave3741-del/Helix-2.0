import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize13FHolding, normalizeCftcPositioning, normalizeOnChainTransfers, buildSmartMoneyContext } from './smart-money.ts';

test('smart-money adapters preserve PIT safety and attribution', () => {
  const asOf = Date.UTC(2026, 0, 10);
  const chain = normalizeOnChainTransfers({ txHash:'tx1', asset:'BTC', amount:10, notionalUsd:900_000, from:'a', to:'b', blockTs:asOf-1000, source:'test.onchain', retrievedTs:asOf, entity:{entityId:'e1',label:'Known Holder',confidence:.9,method:'explicit'} }, asOf);
  assert.equal(chain.observations.length,1);
  assert.equal(chain.observations[0]!.value.entity?.entityId,'e1');
  const filing = normalize13FHolding({ filerId:'0001', issuer:'ABC', shares:1000, reportPeriod:asOf-86400000*30, filedAt:asOf-86400000, source:'sec.13f', retrievedTs:asOf }, asOf);
  assert.equal(filing.observations[0]!.value.source,'institutional-13f');
  const cot = normalizeCftcPositioning({ market:'BTC', reportDate:asOf-86400000, publishedTs:asOf-86400000+1000, availableTs:asOf-86400000+2000, long:80, short:20, category:'leveraged', source:'cftc.cot', retrievedTs:asOf }, asOf);
  assert.equal(cot.observations[0]!.value.direction,'long');
});

test('future smart-money observations are rejected and context never emits a trade signal', () => {
  const asOf = 1000;
  const future = normalizeOnChainTransfers({ txHash:'future', asset:'ETH', amount:1, from:'a', to:'b', blockTs:2000, source:'test', retrievedTs:2000 }, asOf);
  assert.equal(future.observations.length,0);
  assert.ok(future.rejected[0]!.reasons.length > 0);
  const context = buildSmartMoneyContext('ETH', []);
  assert.equal(context.tradeSignal,'none');
});
