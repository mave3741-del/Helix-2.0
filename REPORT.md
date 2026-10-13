> **Current identity notice (v0.99.25):** This package is the HELIX Trading Intelligence project. The historical “Helix 2.0 — AI Organization OS” report text below is retained as legacy project history and must not be interpreted as the current trading-system mission or certification state. Live execution remains disabled.

# Helix 2.0 — AI Organization OS

**Project report**  
**Version:** 1.0.0  
**Date:** 8 September 2026  
**Repository:** https://github.com/mave3741-del/helix (private)  
**Product:** Helix — 1,000-worker autonomous AI enterprise

---

## 1. Executive summary

Helix is a production-grade **organizational operating system**, not a chatbot and not a collection of independent agents. One human Owner directs one CEO. The CEO runs executive management, twelve departments, supervisors, and **exactly 1,000 persistent AI workers**, with independent QC, testing, security, skill creation, organizational memory, model routing, fallback, governance, audit, and recovery.

**Central principle:** the organization is the intelligence. Models are replaceable brains. The organization stays operational if a worker, model, provider, skill, or workflow fails.

This report describes what was built, how it is structured, how it behaves, and how to run and prove it.

---

## 2. What Helix is (and is not)

| Helix is | Helix is not |
|---|---|
| An Owner dashboard plus an autonomous operating layer | A chat UI wrapping one model |
| Persistent worker identities with history | 1,000 simultaneous LLM processes |
| Hierarchical coordination (CEO → exec → manager → supervisor → worker) | A swarm of peer agents |
| Independent QC / testing / security | A worker judging its own output |
| Memory owned by the organization | Session context that dies with a model |

The Owner talks to the organization. The Owner is not required to manage individual workers.

---

## 3. Architecture

```
OWNER (human)
  └── CEO  (Helix CEO, Grok 4.5 strategy brain)
        ├── 8 executives
        ├── 12 department managers
        ├── supervisors / 48 teams
        ├── 1,000 persistent workers (W-0001 … W-1000)
        ├── QC / testers / security / recovery
        └── OmniRoute  →  brains + fallback chain
```

### 3.1 Core loop

1. Owner issues an objective (or a scenario injects one).
2. Risk is classified: **low / medium / high**. High-risk work stops for Owner approval.
3. CEO sets strategy and selects departments.
4. Managers / supervisors assemble teams from the 1,000-worker registry.
5. Workers execute. Supervisors review. Independent QC checks. Testing validates.
6. Failures enter diagnosis → correction → retest. Repeated failure triggers training, reassignment, or disablement.
7. Verified lessons become organizational memory. Skills go through sandbox → test → approve → deploy.
8. A **420ms tick** advances queues, tasks, QC, training, fallback, succession, and KPIs.

Worker identity, worker state, worker process, model session, and task execution are separate. Workers activate according to workload. All 1,000 identities persist.

### 3.2 Persistence and recovery

Organizational state (workers, tasks, memory, skills, audit, brains) lives in **IndexedDB** via Zustand persist, throttled so a 1,000-worker snapshot does not block the UI. Restart restores the last checkpoint and unfinished work continues (acceptance test 10).

---

## 4. Organization design

### 4.1 Hierarchy

| Layer | Responsibility |
|---|---|
| Owner | Mission, objectives, policy, high-impact approval |
| CEO | Runs the organization, plans, reports |
| Executives (8) | Cross-department authority |
| Department managers (12) | Run a department |
| Supervisors | Run teams, review work, rebalance |
| Workers | Execute |
| QC / testers / security | Independently verify |

### 4.2 Departments

| Code | Department | Purpose |
|---|---|---|
| STR | Strategy | Objectives, planning, Owner alignment |
| ENG | Engineering | Build, integrate, ship |
| RSH | Research | Investigate, synthesize, evidence |
| QLY | Quality | Independent QC, testing, standards |
| SEC | Security | Permissions, red team, review |
| OPS | Operations | Queues, runtime, delivery |
| KNO | Knowledge | Organizational memory and retrieval |
| SKL | Skills Factory | Create, test, version skills |
| WRK | Workforce | Assignment, training, performance |
| GOV | Governance | Constitution, risk, approvals |
| RCV | Recovery | Fault handling and succession |
| RTG | Brain Routing | Model selection, fallback, benchmarks |

Workers can be reassigned. Team sizes are not permanently frozen. Supervisors that fail are succeeded automatically; team state, queues, and memory transfer.

### 4.3 Workforce registry

Every worker has: unique ID, name, role, department, supervisor, capabilities, permissions, status, current assignment, performance history, QC history, training history, task history, model assignment, tool permissions, memory scope.

Statuses: created, configured, tested, available, assigned, working, qc, training, recovery, reserved, disabled.

Ranks: junior, standard, senior, expert, lead. Promotion and demotion follow measured performance.

---

## 5. Quality, learning, and skills

### 5.1 Quality gates (every important result)

1. Requirement verification  
2. Worker self-check  
3. Supervisor review  
4. Independent QC (different brain from the author)  
5. Testing  
6. Security / risk review when required  
7. Final organizational verification  

Only then: delivery. A worker’s own model is never the sole judge of its work.

### 5.2 Training cycle

Worker fails → QC detects → root-cause → correction plan → coaching → repeat task → QC → test. Repeated failure: specialist intervention, reassignment, reduced complexity, or disablement.

### 5.3 Organizational memory

Layers: organization, department, team, worker, task, project.

Knowledge status: **verified / unverified / rejected / superseded / under review**.

Rejected information does not become trusted knowledge. Retrieval is hierarchical and task-specific — the entire memory is never dumped into a model context.

### 5.4 Skill factory

Skills are not a giant hardcoded list. Missing capability → CEO identifies gap → manager defines requirements → skill-building team → sandbox → test → security → QC → approve → deploy, with version, rollback, and change history. Untested skills stay in sandbox.

---

## 6. Brains (models)

Models are replaceable reasoning resources. The organization owns memory, goals, skills, workflows, task state, governance, and quality standards.

| Brain | Provider | Tier | Specialty | Seed status |
|---|---|---|---|---|
| Grok 4.5 | xAI | Flagship | Complex reasoning and CEO strategy | Up |
| Grok Fast | xAI | Fast | Low-latency structured work | Up |
| Cloud Coder | Cloud | Fast | Implementation and tests | Up |
| Open Reasoner | Open | Free | Research and drafting | Up |
| Local Heuristic | Local | Local | Deterministic always-on fallback | Up |

**OmniRoute** selects the smallest sufficient available brain for the task (capability, quality, latency, cost). On failure, timeout, rate limit, or disablement the chain is:

Grok 4.5 → Grok Fast → Cloud Coder → Open Reasoner → Local Heuristic

Switching brains does **not** reset the task. Objective, state, memory, progress, and outputs are preserved. Brain failure is not organizational failure.

---

## 7. Governance

Fifteen constitution rules are in force, including Owner authority, verified results, no unverified facts, correction cycles, replaceable brains, model-independent memory, tested skills, auditability, high-impact approval, controlled self-improvement, security boundaries, task continuity, and evidence over claims.

- High-risk / irreversible actions require explicit Owner approval.  
- Low-risk work completes autonomously.  
- Self-improvement is allowed only via observe → sandbox → test → approve → deploy.  
- Emergency halt pauses the organization. Recovery restores from checkpoint.  
- Audit records who, what, when, why, result, QC, and approval.

---

## 8. Owner interface

Desktop rail and mobile bottom navigation. Views:

| View | Purpose |
|---|---|
| Command | Dispatch objectives, CEO brief, department lattice, live events, KPIs |
| Organization | Hierarchy, succession, department structure |
| Workforce | Searchable 1,000-worker registry and worker detail |
| Work | Tasks, queues, projects |
| Quality | QC results, failures, gates |
| Brains | Routing, availability, fallback chain |
| Skills | Catalog, factory pipeline, versions |
| Memory | Layered knowledge with claim status |
| Governance | Constitution, approvals, audit |
| Improve | Controlled self-improvement proposals |
| Prove | 14 acceptance scenarios |

The Owner can pause, resume, recover, and emergency-halt.

---

## 9. Acceptance tests (Prove)

| # | Scenario | Expected behaviour |
|---|---|---|
| 1 | Simple task | Owner objective is delegated and completed |
| 2 | Complex task | Departments, supervisors, and teams form automatically |
| 3 | Missing skill | Gap identified; skill created, tested, deployed |
| 4 | Bad worker | Repeated failure → QC → diagnosis → training → retest |
| 5 | Model failure | Primary brain fails; fallback continues the task |
| 6 | Supervisor failure | Successor assigned; team state transfers; work continues |
| 7 | Bad output | Independent QC catches incorrect work before delivery |
| 8 | Cross-department | Multiple departments coordinate via dependencies |
| 9 | Organizational learning | Validated method becomes reusable knowledge |
| 10 | Restart | State restores; unfinished work continues |
| 11 | Self-improvement | Weakness observed; change gated before deploy |
| 12 | High-risk action | Organization stops and requests Owner approval |
| 13 | Low-risk action | Completes autonomously |
| 14 | Fault injection | Artificial failures; fallback and recovery respond |

Run them from **Prove → Run all fourteen**.

---

## 10. Source map

This zip contains the Helix source (no `node_modules`).

| Path | Role |
|---|---|
| `REPORT.md` / `REPORT.html` | This report |
| `README.md` | Short product readme |
| `src/org/types.ts` | Organizational types |
| `src/org/catalog.ts` | Departments, brains, skills, capabilities |
| `src/org/seed.ts` | Deterministic 1,000-worker generator |
| `src/org/engine.ts` | Tick, assignment, QC, fallback, succession, training |
| `src/org/constitution.ts` | Constitution, systems, quality gates |
| `src/org/scenarios.ts` | Fourteen acceptance tests |
| `src/org/run-scenario.ts` | Scenario runner |
| `src/org/persist.ts` | IndexedDB storage |
| `src/store/org-store.ts` | Zustand store, persist, Owner actions |
| `src/lib/ceo-plan.ts` | CEO strategy planning |
| `src/components/shell.tsx` | Command OS chrome, 420ms tick, halt |
| `src/components/views/` | Owner views |
| `src/routes/` | TanStack Start routes |
| `package.json` | Dependencies and scripts |

**Stack:** TanStack Start, React 19, Tailwind v4, Zustand, IndexedDB (`idb-keyval`). Auth and database are off. Local state is the system of record.

---

## 11. How to run

```bash
npm install
npm run dev
```

Then:

1. Open Command and dispatch an objective.  
2. Watch the department lattice, CEO brief, and events tape.  
3. Try a high-risk sample — it should stop for approval.  
4. Open Workforce and search the 1,000 identities.  
5. Open Brains — all five models start available.  
6. Open Prove and run all fourteen tests.

---

## 12. Delivery status

| Item | Status |
|---|---|
| Owner / CEO / 8 executives / 12 departments | Implemented |
| Exactly 1,000 persistent workers | Implemented |
| Independent QC, testing, security | Implemented |
| OmniRoute + fallback chain | Implemented (5 brains, all up at seed) |
| Hierarchical memory with claim status | Implemented |
| Skill factory with sandbox / test / deploy | Implemented |
| Constitution, risk gates, audit, halt | Implemented |
| Supervisor succession and recovery | Implemented |
| 14 acceptance scenarios | Implemented |
| Restart persistence (IndexedDB) | Implemented |
| GitHub source | https://github.com/mave3741-del/helix |

Helix is an operating layer for a coordinated organization. Models can be swapped. Memory, goals, and quality remain with Helix.

## v0.7 implementation notes
- Added `src/trading/runtime/event-bus.ts`: idempotent server-side trading event bus.
- Added `src/trading/runtime/paper-exchange.ts`: bid/ask paper fills, fees, positions and equity tracking.
- Added `src/trading/runtime/runtime.ts`: process-local server trading runtime with capital envelope, hard risk gate and kill switch.
- Added `src/trading/data/adapters.ts`: deterministic replay adapter plus WebSocket adapter boundary.
- Added `src/trading/data/registry.ts`: capability/latency-aware data-source registry and adapter registry.
- Added `src/trading/research/evolution.ts`: strategy candidate/challenger/champion/retired lifecycle with lineage.
- Focused trading runtime tests: 11/11 passing with Node's TypeScript strip-only runner.
- Full `npm ci` / application build remains unverified in this environment because dependency installation timed out.
