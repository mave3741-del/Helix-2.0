import test from 'node:test';
import assert from 'node:assert/strict';
import { seedOrganization } from './seed.ts';
import { issueObjective } from './engine.ts';
import { reconcilePlan } from './engine.ts';

test('CEO reconciliation reshapes the existing execution graph instead of creating a duplicate project', () => {
  const state = seedOrganization();
  const objectiveId = issueObjective(state, 'Build trading alpha for crypto momentum', 3);
  const beforeProjects = state.projects.filter((p) => p.objectiveId === objectiveId).length;
  reconcilePlan(state, objectiveId, { strategy:'Authoritative crypto strategy', departments:['research','governance'], skillGaps:[], risk:'medium', tasks:[{ title:'Alpha research', department:'research', capability:'research', risk:'medium' }, { title:'Risk validation', department:'governance', capability:'risk', risk:'medium' }] });
  const afterProjects = state.projects.filter((p) => p.objectiveId === objectiveId);
  assert.equal(beforeProjects, 1);
  assert.equal(afterProjects.length, 1);
  assert.equal(afterProjects[0].departmentIds.includes('governance'), true);
  assert.equal(state.objectives.find((o)=>o.id===objectiveId)?.strategy, 'Authoritative crypto strategy');
  assert.ok(Object.values(state.tasks).some((t)=>t.title==='Risk validation' && t.projectId===afterProjects[0].id));
});


test('CEO reconciliation never wires dependencies through cancelled replacement tasks', () => {
  const state = seedOrganization();
  const objectiveId = issueObjective(state, 'Build a stable trading research pipeline', 3);
  const projectId = state.projects.find((p)=>p.objectiveId===objectiveId)!.id;
  const plan = { strategy:'Stable research', departments:['research','governance'], skillGaps:[], risk:'medium' as const, tasks:[
    { title:'Research stage', department:'research', capability:'research', risk:'medium' as const },
    { title:'Risk stage', department:'governance', capability:'risk', risk:'medium' as const },
  ]};
  reconcilePlan(state, objectiveId, plan);
  const oldResearch = Object.values(state.tasks).find((t)=>t.projectId===projectId && t.title==='Research stage' && t.requiredCapability==='research');
  assert.ok(oldResearch);
  oldResearch!.status = 'cancelled';
  reconcilePlan(state, objectiveId, plan);
  const activeResearch = Object.values(state.tasks).find((t)=>t.projectId===projectId && t.title==='Research stage' && t.requiredCapability==='research' && t.status!=='cancelled');
  const activeRisk = Object.values(state.tasks).find((t)=>t.projectId===projectId && t.title==='Risk stage' && t.requiredCapability==='risk' && t.status!=='cancelled');
  assert.ok(activeResearch && activeRisk);
  assert.deepEqual(activeRisk!.dependencies, [activeResearch!.id]);
});
