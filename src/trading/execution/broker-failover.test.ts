import test from 'node:test';
import assert from 'node:assert/strict';
import { BrokerFailoverRouter } from './broker-failover.ts';
import type { BrokerConnector, BrokerOrder } from './broker-connectors.ts';

function connector(id: string, fail: boolean): BrokerConnector {
  return {
    id, mode:'paper',
    async account(){ if(fail) throw new Error('down'); return { id:'a',currency:'USD',status:'ACTIVE',buyingPower:100,cash:100,portfolioValue:100,equity:100 }; },
    async markets(){ return []; }, async positions(){ return []; }, async orders(){ return []; },
    async placeOrder(){ if(fail) throw new Error('down'); return { id:'o',clientOrderId:'c',symbol:'AAPL',side:'buy',type:'market',qty:1,filledQty:0,status:'new' }; },
    async cancelOrder(){ if(fail) throw new Error('down'); },
  };
}

test('broker failover selects healthy connector after primary failure', async () => {
  const router = new BrokerFailoverRouter([connector('primary', true), connector('secondary', false)], { failureThreshold: 1 });
  const result = await router.account();
  assert.equal(result.connectorId, 'secondary');
  assert.equal(router.status()[0].healthy, false);
});

test('live connector is rejected by failover router', () => {
  assert.throws(() => new BrokerFailoverRouter([{ ...connector('live', false), mode:'live' } as BrokerConnector]), /live_connector_disabled/);
});

test('broker order timeout is reconciled instead of submitted to a second connector', async () => {
  let primaryCalls = 0;
  let secondaryCalls = 0;
  let accepted: BrokerOrder | undefined;
  const primary: BrokerConnector = {
    ...connector('primary', false),
    async placeOrder(order) {
      primaryCalls += 1;
      accepted = { id:'p-1', clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type:'market', qty:1, filledQty:0, status:'accepted' };
      throw new Error('timeout-after-accept');
    },
    async orders() { return accepted ? [accepted] : []; },
  };
  const secondary: BrokerConnector = {
    ...connector('secondary', false),
    async placeOrder(order) { secondaryCalls += 1; return { id:'s-1', clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type:'market', qty:1, filledQty:0, status:'accepted' }; },
  };
  const router = new BrokerFailoverRouter([primary, secondary], { failureThreshold:1 });
  const result = await router.placeOrder({ clientOrderId:'helix-1', symbol:'AAPL', side:'buy', qty:1 });
  assert.equal(result.connectorId, 'primary');
  assert.equal(result.value.id, 'p-1');
  assert.equal(primaryCalls, 1);
  assert.equal(secondaryCalls, 0);
});

test('broker cancel routes to the original connector and never fails over blindly', async () => {
  const primary = connector('primary', false);
  let primaryCancel = 0;
  let secondaryCancel = 0;
  primary.placeOrder = async (order) => ({ id:'p-2', clientOrderId:order.clientOrderId, symbol:order.symbol, side:order.side, type:'market', qty:1, filledQty:0, status:'accepted' });
  primary.cancelOrder = async () => { primaryCancel += 1; };
  const secondary = connector('secondary', false);
  secondary.cancelOrder = async () => { secondaryCancel += 1; };
  const router = new BrokerFailoverRouter([primary, secondary]);
  await router.placeOrder({ clientOrderId:'helix-2', symbol:'AAPL', side:'buy', qty:1 });
  const result = await router.cancelOrder('p-2');
  assert.equal(result.connectorId, 'primary');
  assert.equal(primaryCancel, 1);
  assert.equal(secondaryCancel, 0);
});
