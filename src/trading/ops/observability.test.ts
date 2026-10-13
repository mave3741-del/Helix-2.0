import test from 'node:test';
import assert from 'node:assert/strict';
import { ObservabilityBus } from './observability.ts';

test('observability tracks error rate, latency and critical alerts', () => {
  const bus = new ObservabilityBus();
  bus.recordRequest(10, true); bus.recordRequest(300, false); bus.recordRequest(200, false);
  bus.emit({ severity:'critical', name:'data-halt', message:'feed halted', attributes:{ source:'x' } });
  bus.emit({ severity:'critical', name:'risk-veto', message:'order vetoed', attributes:{ symbol:'BTC/USD' } });
  const snapshot = bus.snapshot({ maxCriticalEvents:1, maxErrorRate:.5, maxLatencyMs:250 });
  assert.equal(snapshot.errorRate, 2/3);
  assert.ok(snapshot.alerts.includes('error_rate_threshold'));
  assert.ok(snapshot.alerts.includes('critical_event_threshold'));
});
