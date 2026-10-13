import test from 'node:test'; import assert from 'node:assert/strict';
import { evaluateExecutionReadiness } from './execution-readiness.ts';
test('execution readiness blocks projected theme concentration',()=>{const r=evaluateExecutionReadiness({equity:100000,exposures:[{symbol:'A',notional:40000,side:'long',sector:'tech'}],symbol:'B',orderNotional:15000,sector:'tech'}); assert.equal(r.ok,false); assert.ok(r.reasons.includes('projected_theme_concentration_exceeded'));});
test('execution readiness blocks high correlation',()=>{const r=evaluateExecutionReadiness({equity:100000,exposures:[],symbol:'A',orderNotional:1000,correlationToPortfolio:.95}); assert.equal(r.ok,false);});
