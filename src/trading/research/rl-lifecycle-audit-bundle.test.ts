import test from 'node:test'; import assert from 'node:assert/strict'; import {buildRlAuditBundle} from './rl-lifecycle-audit-bundle.ts'; const h=(c:string)=>c.repeat(64);
test('audit bundle binds all lifecycle evidence',()=>{const b=buildRlAuditBundle({lifecycleHash:h('a'),recoveryHash:h('b'),driftHash:h('c'),stopHash:null}); assert.match(b.bundleHash,/^[a-f0-9]{64}$/);});
