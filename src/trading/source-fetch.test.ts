import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, parse13F } from './source-fetch.ts';
import { normalizeOnChainTransfers } from './smart-money.ts';

test('source fetcher fail-closes non-allowlisted hosts', async () => {
  await assert.rejects(() => fetchJson('https://evil.example/data', { allowedHosts:['sec.example'], timeoutMs:500, maxBytes:10_000 }), /source_host_not_allowlisted/);
});

test('source parser keeps SEC filing availability as the PIT boundary', () => {
  const batch = parse13F({ filerId:'0001', issuer:'ABC', shares:10, reportPeriod:1000, filedAt:2000, source:'sec', retrievedTs:2100 }, 2000);
  assert.equal(batch.observations.length, 1);
  assert.equal(batch.observations[0].value.availableTs, 2000);
});

test('smart-money HTTP adapters fetch and normalize on-chain, SEC 13F XML, and CFTC CSV feeds', async () => {
  const fakeFetch = async (input: string) => {
    if (input.includes('onchain')) {
      return new Response(JSON.stringify({ transfers: [{ txHash:'tx1', asset:'BTC', amount:2, from:'a', to:'b', blockTs:100, source:'onchain', retrievedTs:200 }] }), { status:200, headers:{'content-type':'application/json'} });
    }
    if (input.includes('13f')) {
      return new Response('<INFO_TABLE><NAMEOFISSUER>ABC CORP</NAMEOFISSUER><CUSIP>123456789</CUSIP><VALUE>100000</VALUE><SHRSORPRNAMT>500</SHRSORPRNAMT></INFO_TABLE>', { status:200, headers:{'content-type':'application/xml'} });
    }
    return new Response('Contract Market Name,Report Date,Market and Exchange Names,Long,Short,Release Date\nBTC,2026-01-09,Managed Money,80,20,2026-01-12\n', { status:200, headers:{'content-type':'text/csv'} });
  };
  const onchain = new (await import('./source-fetch.ts')).OnChainTransferHttpAdapter({ endpoint:'https://data.example.com/onchain', allowedHosts:['data.example.com'], fetchImpl:fakeFetch });
  const onBatch = await onchain.fetchTransfers({ asOfTs: 1000, retrievedTs: 200 });
  assert.equal(onBatch.observations.length, 1);

  const sec = new (await import('./source-fetch.ts')).Sec13FInformationTableHttpAdapter({ allowedHosts:['www.sec.gov'], fetchImpl:fakeFetch });
  const secBatch = await sec.fetchInformationTable({ url:'https://www.sec.gov/13f', filerId:'0001', reportPeriod:100, filedAt:200, asOfTs:1000 });
  assert.equal(secBatch.observations[0]?.value.source, 'institutional-13f');
  assert.equal(secBatch.observations[0]?.value.quantity, 500);

  const cot = new (await import('./source-fetch.ts')).CftcCotCsvHttpAdapter({ endpoint:'https://data.example.com/cot', allowedHosts:['data.example.com'], fetchImpl:fakeFetch });
  const cotBatch = await cot.fetchReport({ asOfTs: Date.parse('2026-01-12T20:30:00Z') });
  assert.equal(cotBatch.observations[0]?.value.source, 'futures-cot');
  assert.equal(cotBatch.observations[0]?.value.direction, 'long');
});


test('CFTC adapter uses explicit release date for PIT availability', async () => {
  const { CftcCotCsvHttpAdapter } = await import('./source-fetch.ts');
  const fetchImpl = async () => new Response('Contract Market Name,Report Date,Market and Exchange Names,Long,Short,Release Date\nBTC,2026-01-06,Managed Money,80,20,2026-01-09\n', { status:200, headers:{'content-type':'text/csv'} });
  const adapter = new CftcCotCsvHttpAdapter({ endpoint:'https://data.example.com/cot', allowedHosts:['data.example.com'], fetchImpl });
  const before = await adapter.fetchReport({ asOfTs: Date.parse('2026-01-08T23:59:59Z') });
  assert.equal(before.observations.length, 0);
  const atRelease = await adapter.fetchReport({ asOfTs: Date.parse('2026-01-09T20:30:00Z') });
  assert.equal(atRelease.observations.length, 1);
});


test('CFTC date-only release timestamp is not available before the official 3:30pm Eastern release time', async () => {
  const { CftcCotCsvHttpAdapter } = await import('./source-fetch.ts');
  const fetchImpl = async () => new Response('Contract Market Name,Report Date,Market and Exchange Names,Long,Short,Release Date\nBTC,2026-07-07,Managed Money,80,20,2026-07-10\n', { status:200, headers:{'content-type':'text/csv'} });
  const adapter = new CftcCotCsvHttpAdapter({ endpoint:'https://data.example.com/cot', allowedHosts:['data.example.com'], fetchImpl });
  const before = await adapter.fetchReport({ asOfTs: Date.parse('2026-07-10T19:29:59Z') });
  assert.equal(before.observations.length, 0);
  const after = await adapter.fetchReport({ asOfTs: Date.parse('2026-07-10T19:30:00Z') });
  assert.equal(after.observations.length, 1);
});

test('historical SEC 13F XML VALUE defaults to the pre-2023 thousands unit', async () => {
  const { Sec13FInformationTableHttpAdapter } = await import('./source-fetch.ts');
  const fetchImpl = async () => new Response('<INFO_TABLE><NAMEOFISSUER>OLD CORP</NAMEOFISSUER><VALUE>1234</VALUE><SHRSORPRNAMT>10</SHRSORPRNAMT></INFO_TABLE>', { status:200, headers:{'content-type':'application/xml'} });
  const adapter = new Sec13FInformationTableHttpAdapter({ allowedHosts:['www.sec.gov'], fetchImpl });
  const batch = await adapter.fetchInformationTable({ url:'https://www.sec.gov/old13f', filerId:'0001', reportPeriod:Date.parse('2022-09-30T00:00:00Z'), filedAt:Date.parse('2022-11-10T12:00:00Z'), asOfTs:Date.parse('2022-11-11T00:00:00Z') });
  assert.equal(batch.observations[0]?.value.notionalUsd, 1_234_000);
});

test('on-chain observations never become historically available before retrieval when no provider availability timestamp exists', () => {
  const batch = normalizeOnChainTransfers({ txHash:'tx-pit', asset:'BTC', amount:1, from:'a', to:'b', blockTs:100, source:'test.onchain', retrievedTs:500 }, 499);
  assert.equal(batch.observations.length, 0);
  assert.equal(batch.rejected[0]?.reasons.includes('not_available_at_asof'), true);
});
