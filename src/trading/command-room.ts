import { TRADING_COUNCILS } from "./debate.ts";
import { buildDeterministicTradingWorkerRegistry, type TradingWorkerIdentity } from "./runtime/worker-registry.ts";
import type { ModelClient } from "./ai/model-reasoning.ts";

export interface CommandCouncil {
  id: string;
  name: string;
  callSign: string;
  family: string;
  workers: number;
  responsibility: string;
  personality: string;
  humor: string;
  voiceStyle: string;
}

export const COMMAND_COUNCILS: CommandCouncil[] = [
  { id: "macro", name: "Macro Council", callSign: "TITAN", family: "Macro", workers: 50, responsibility: "Rates, inflation, employment, liquidity, central banks, geopolitics and macro regimes", personality: "calm, strategic and economically minded", humor: "dry macro/economics humor", voiceStyle: "deep, measured, executive" },
  { id: "fundamental", name: "Fundamental Council", callSign: "ATLAS", family: "Fundamental", workers: 75, responsibility: "Company quality, filings, earnings, valuation, sectors and business fundamentals", personality: "patient, analytical and evidence-heavy", humor: "dry accounting and valuation humor", voiceStyle: "warm, precise, professional" },
  { id: "technical", name: "Technical Council", callSign: "VORTEX", family: "Technical", workers: 110, responsibility: "Price action, market structure, momentum, breakouts, volume and technical regimes", personality: "fast, observant and decisive without being reckless", humor: "trader-floor humor", voiceStyle: "energetic, concise, confident" },
  { id: "quant", name: "Quant Council", callSign: "QUANTUM", family: "Quant", workers: 130, responsibility: "Statistics, factors, machine learning, time series, regimes and probabilistic research", personality: "logical, skeptical and probability-driven", humor: "statistics and probability humor", voiceStyle: "clear, even, analytical" },
  { id: "derivatives", name: "Derivatives Council", callSign: "APEX", family: "Derivatives", workers: 70, responsibility: "Options, futures, Greeks, volatility, open interest and positioning", personality: "sharp, mathematical and payoff-conscious", humor: "options/Greeks humor", voiceStyle: "controlled, sharp, confident" },
  { id: "crypto", name: "Crypto Council", callSign: "NEXUS", family: "Crypto", workers: 115, responsibility: "Crypto markets, wallets, on-chain flows, whales, CEX/DEX and 24/7 regimes", personality: "fast, alert and market-native", humor: "crypto-native humor", voiceStyle: "fast, modern, conversational" },
  { id: "news", name: "News & Event Council", callSign: "PULSE", family: "News", workers: 75, responsibility: "News, filings, public events, sentiment and event-to-market impact", personality: "curious, fast and source-conscious", humor: "headline and newsroom humor", voiceStyle: "broadcast-style, crisp" },
  { id: "strategy", name: "Strategy Lab Council", callSign: "FORGE", family: "Strategy", workers: 95, responsibility: "Strategy invention, testing, OOS, walk-forward, evolution and retirement", personality: "creative, experimental and relentlessly test-oriented", humor: "lab/research humor", voiceStyle: "thoughtful, energetic" },
  { id: "risk", name: "Risk Council", callSign: "AEGIS", family: "Risk", workers: 95, responsibility: "Position sizing, drawdown, correlation, concentration, stress and veto decisions", personality: "calm, conservative and protective", humor: "dry risk and survival humor", voiceStyle: "low, calm, authoritative" },
  { id: "execution", name: "Execution Council", callSign: "VECTOR", family: "Execution", workers: 80, responsibility: "Order routing, liquidity, slippage, fills, latency and execution quality", personality: "practical, fast and execution-focused", humor: "microstructure and execution humor", voiceStyle: "direct, quick, technical" },
  { id: "adversarial", name: "Adversarial Council", callSign: "SENTINEL", family: "Adversarial", workers: 55, responsibility: "Red-team critique, falsification, contradictions, leakage and failure hunting", personality: "skeptical, sharp and deliberately challenging", humor: "dry sarcasm", voiceStyle: "measured, skeptical" },
  { id: "knowledge", name: "Evidence & Knowledge Council", callSign: "ARCHIVE", family: "Knowledge", workers: 50, responsibility: "Evidence provenance, credibility, source history, shared memory and knowledge synthesis", personality: "quiet, precise and deeply referential", humor: "historian/data-nerd humor", voiceStyle: "calm, warm, deliberate" },
];

export const ORION_PRIME = {
  id: "orion-prime",
  name: "Orion Prime",
  title: "Orion Command",
  personality: "calm, strategic, emotionally intelligent, decisive but willing to admit uncertainty",
  humor: "dry executive humor",
  voiceStyle: "warm authority; measured pace",
};

export const OWNER_IDENTITY = { id: "owner", name: "Owner", title: "Owner / Principal" } as const;

const FIRST_NAMES = [
  "Aiden", "Aisha", "Amir", "Arman", "Aria", "Avery", "Bilal", "Cameron", "Daniel", "Daria",
  "David", "Elena", "Elias", "Elif", "Emma", "Farah", "Fatima", "Faris", "Hana", "Haris",
  "Ibrahim", "Idris", "Iman", "Jamal", "Jasmine", "Junaid", "Kamil", "Kara", "Karim", "Layla",
  "Leah", "Liam", "Maya", "Mariam", "Mason", "Meera", "Mina", "Noah", "Nora", "Omar",
  "Priya", "Rayan", "Reem", "Ryan", "Sara", "Sofia", "Tariq", "Yara", "Zain", "Zoya",
];
const LAST_NAMES = [
  "Adler", "Bennett", "Carter", "Dalton", "Ellis", "Foster", "Grant", "Hayes", "Irwin", "Jensen",
  "Khan", "Lawson", "Morgan", "Nash", "Owens", "Parker", "Quinn", "Reed", "Stone", "Turner",
];
const COUNCIL_BY_INDEX = (() => {
  const result: CommandCouncil[] = [];
  for (const council of COMMAND_COUNCILS) for (let i = 0; i < council.workers; i += 1) result.push(council);
  if (result.length !== 1000) throw new Error("command_council_worker_total_must_be_1000");
  return result;
})();

export interface CommandWorkerIdentity extends TradingWorkerIdentity {
  displayName: string;
  title: string;
  councilId: string;
  councilName: string;
  councilCallSign: string;
  personality: string;
  humorStyle: string;
  voiceStyle: string;
  speakingRules: string[];
}

export function humanName(workerNumber: number): string {
  if (!Number.isInteger(workerNumber) || workerNumber < 1 || workerNumber > 1000) throw new Error("worker_number_out_of_range");
  const index = workerNumber - 1;
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length)]}`;
}

export function buildCommandWorkerRoster(now = Date.now()): CommandWorkerIdentity[] {
  return buildDeterministicTradingWorkerRegistry(now).map((worker, index) => {
    const council = COUNCIL_BY_INDEX[index];
    return {
      ...worker,
      displayName: humanName(worker.workerNumber),
      title: `${council.callSign} Specialist — ${worker.specializationName}`,
      councilId: council.id,
      councilName: council.name,
      councilCallSign: council.callSign,
      personality: council.personality,
      humorStyle: council.humor,
      voiceStyle: council.voiceStyle,
      speakingRules: [
        "Answer the owner's question directly when competent to do so.",
        "Say when evidence is insufficient instead of inventing facts.",
        "Disagree respectfully and explain why.",
        "Use field-specific humor sparingly and never during urgent risk or safety events.",
        "Never let personality override policy, evidence or risk controls.",
      ],
    };
  });
}

export interface CommandRoomTurn {
  turnId: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  speakerTitle: string;
  text: string;
  timestamp: number;
  mode: "text" | "voice";
  mentions: string[];
}

export interface CommandRoomSession {
  sessionId: string;
  ownerId: string;
  turns: CommandRoomTurn[];
  activeSpeakerIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationRouting {
  primarySpeakerId: string;
  invitedSpeakerIds: string[];
  reason: string;
}

export class InMemoryCommandRoomStore {
  private readonly sessions = new Map<string, CommandRoomSession>();

  create(sessionId: string, now = Date.now()): CommandRoomSession {
    const session: CommandRoomSession = { sessionId, ownerId: OWNER_IDENTITY.id, turns: [], activeSpeakerIds: [ORION_PRIME.id], createdAt: now, updatedAt: now };
    this.sessions.set(sessionId, structuredClone(session));
    return structuredClone(session);
  }

  get(sessionId: string): CommandRoomSession | null {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  append(turn: CommandRoomTurn): CommandRoomSession {
    const session = this.sessions.get(turn.sessionId);
    if (!session) throw new Error("command_room_session_not_found");
    session.turns.push(structuredClone(turn));
    session.updatedAt = turn.timestamp;
    return structuredClone(session);
  }

  setActive(sessionId: string, speakerIds: string[]): CommandRoomSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("command_room_session_not_found");
    session.activeSpeakerIds = [...new Set(speakerIds)];
    return structuredClone(session);
  }
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

export class CommandRoomRouter {
  private readonly roster: CommandWorkerIdentity[];
  private readonly byName = new Map<string, CommandWorkerIdentity>();
  private readonly byCallSign = new Map<string, string>();

  constructor(roster = buildCommandWorkerRoster()) {
    this.roster = roster;
    this.byName.set(normalize(ORION_PRIME.name), ORION_PRIME as never);
    for (const worker of roster) this.byName.set(normalize(worker.displayName), worker);
    for (const council of COMMAND_COUNCILS) this.byCallSign.set(council.callSign.toLowerCase(), `council:${council.id}`);
  }

  getRoster(): CommandWorkerIdentity[] { return this.roster.map((worker) => structuredClone(worker)); }

  resolveSpeaker(reference: string): { id: string; name: string; title: string } | CommandWorkerIdentity | null {
    const key = normalize(reference);
    if (key === normalize(ORION_PRIME.name) || key === "orion" || key === "orion prime") return ORION_PRIME;
    const worker = this.byName.get(key);
    if (worker) return worker;
    const councilId = this.byCallSign.get(key);
    if (councilId) return { id: councilId, name: reference.trim(), title: "Council" };
    return null;
  }

  routeOwnerMessage(text: string): ConversationRouting {
    const normalized = normalize(text);
    const explicitWorkers = this.roster.filter((worker) => normalized.includes(normalize(worker.displayName)));
    if (explicitWorkers.length) {
      return { primarySpeakerId: explicitWorkers[0].workerId, invitedSpeakerIds: explicitWorkers.slice(1, 8).map((worker) => worker.workerId), reason: "owner_named_team_member" };
    }
    if (normalized.includes("orion") || normalized.includes("ceo")) return { primarySpeakerId: ORION_PRIME.id, invitedSpeakerIds: [], reason: "owner_addressed_orion" };
    for (const council of COMMAND_COUNCILS) {
      if (normalized.includes(council.callSign.toLowerCase()) || normalized.includes(normalize(council.name))) {
        const leader = this.roster.find((worker) => worker.councilId === council.id);
        if (leader) return { primarySpeakerId: leader.workerId, invitedSpeakerIds: [], reason: `owner_addressed_${council.id}` };
      }
    }
    const keywords: Array<[string, string]> = [
      ["risk", "risk"], ["stop loss", "risk"], ["position", "risk"], ["btc", "crypto"], ["bitcoin", "crypto"], ["wallet", "crypto"],
      ["news", "news"], ["headline", "news"], ["fed", "macro"], ["inflation", "macro"], ["earnings", "fundamental"], ["valuation", "fundamental"],
      ["chart", "technical"], ["technical", "technical"], ["option", "derivatives"], ["future", "derivatives"], ["strategy", "strategy"],
      ["execute", "execution"], ["order", "execution"], ["evidence", "knowledge"], ["source", "knowledge"], ["prove me wrong", "adversarial"],
    ];
    for (const [keyword, councilId] of keywords) {
      if (normalized.includes(keyword)) {
        const leader = this.roster.find((worker) => worker.councilId === councilId);
        if (leader) return { primarySpeakerId: leader.workerId, invitedSpeakerIds: [], reason: `topic_routed_to_${councilId}` };
      }
    }
    return { primarySpeakerId: ORION_PRIME.id, invitedSpeakerIds: [], reason: "general_conversation_to_orion" };
  }
}

export interface CommandRoomModelReply {
  reply: string;
  mentions: string[];
  inviteDebate: boolean;
}

function parseReply(text: string): CommandRoomModelReply {
  const clean = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(clean) as Partial<CommandRoomModelReply>;
  if (typeof parsed.reply !== "string" || !parsed.reply.trim()) throw new Error("command_room_reply_required");
  return { reply: parsed.reply.trim(), mentions: Array.isArray(parsed.mentions) ? parsed.mentions.map(String).slice(0, 8) : [], inviteDebate: Boolean(parsed.inviteDebate) };
}

export class CommandRoomConversationEngine {
  private readonly modelClient: ModelClient;
  private readonly router: CommandRoomRouter;
  private readonly store: InMemoryCommandRoomStore;

  constructor(modelClient: ModelClient, router = new CommandRoomRouter(), store = new InMemoryCommandRoomStore()) {
    this.modelClient = modelClient;
    this.router = router;
    this.store = store;
  }

  start(sessionId: string, now = Date.now()): CommandRoomSession { return this.store.create(sessionId, now); }

  async reply(sessionId: string, ownerText: string, mode: "text" | "voice" = "text", now = Date.now()): Promise<{ routing: ConversationRouting; turn: CommandRoomTurn; session: CommandRoomSession }> {
    const session = this.store.get(sessionId) ?? this.store.create(sessionId, now);
    const routing = this.router.routeOwnerMessage(ownerText);
    const speaker = this.router.getRoster().find((worker) => worker.workerId === routing.primarySpeakerId);
    const history = session.turns.slice(-20).map((turn) => `${turn.speakerName}: ${turn.text}`).join("\n");
    const persona = speaker
      ? `You are ${speaker.displayName}, a member of ${speaker.councilName} (${speaker.councilCallSign}). Role: ${speaker.title}. Personality: ${speaker.personality}. Humor: ${speaker.humorStyle}. Voice style: ${speaker.voiceStyle}.`
      : `You are ${ORION_PRIME.name}, ${ORION_PRIME.title}. Personality: ${ORION_PRIME.personality}. Humor: ${ORION_PRIME.humor}. Voice style: ${ORION_PRIME.voiceStyle}.`;
    const system = [
      "You are a conversational member of HELIX Command Room.",
      persona,
      "Speak like an intelligent human teammate, not a generic assistant.",
      "Answer the owner directly. You may disagree, joke lightly, ask a useful follow-up, or invite another team member when it improves the answer.",
      "Never invent evidence, credentials, tool results or completed actions.",
      "Personality and humor must never override safety, risk controls or factual uncertainty.",
      "Return strict JSON: {reply:string,mentions:string[],inviteDebate:boolean}.",
    ].join("\n");
    const user = JSON.stringify({ ownerText, recentConversation: history || null, currentSpeaker: routing.primarySpeakerId, invited: routing.invitedSpeakerIds });
    const response = await this.modelClient.complete({ system, user });
    const parsed = parseReply(response.text);
    const speakerId = routing.primarySpeakerId;
    const speakerName = speaker?.displayName ?? ORION_PRIME.name;
    const speakerTitle = speaker?.title ?? ORION_PRIME.title;
    const turn: CommandRoomTurn = { turnId: `room:${sessionId}:${now}`, sessionId, speakerId, speakerName, speakerTitle, text: parsed.reply, timestamp: now, mode, mentions: parsed.mentions };
    const next = this.store.append(turn);
    return { routing, turn, session: next };
  }
}

export interface VoiceProfile { speakerId: string; voiceId: string; language: string; style: string; }
export interface SpeechRecognizer { transcribe(audio: Uint8Array): Promise<{ text: string; language?: string }>; }
export interface SpeechSynthesizer { synthesize(input: { text: string; voice: VoiceProfile }): Promise<Uint8Array>; }

export function buildVoiceProfile(speakerId: string, roster = buildCommandWorkerRoster()): VoiceProfile {
  if (speakerId === ORION_PRIME.id) return { speakerId, voiceId: "helix.orion.prime", language: "en-US", style: ORION_PRIME.voiceStyle };
  const worker = roster.find((candidate) => candidate.workerId === speakerId);
  if (!worker) throw new Error("voice_speaker_not_found");
  return { speakerId, voiceId: `helix.${worker.councilCallSign.toLowerCase()}.${String(worker.workerNumber).padStart(4, "0")}`, language: "en-US", style: worker.voiceStyle };
}

export function buildMultiSpeakerAudioQueue(session: CommandRoomSession, roster = buildCommandWorkerRoster()): Array<{ turnId: string; text: string; voice: VoiceProfile }> {
  return session.turns.map((turn) => ({ turnId: turn.turnId, text: turn.text, voice: buildVoiceProfile(turn.speakerId, roster) }));
}

export const COMMAND_ROOM_COUNCIL_COUNTS = Object.fromEntries(COMMAND_COUNCILS.map((c) => [c.id, c.workers])) as Record<string, number>;

export function validateCommandRoomInvariants(roster = buildCommandWorkerRoster()): void {
  if (roster.length !== 1000) throw new Error("command_room_roster_must_have_1000_workers");
  if (new Set(roster.map((worker) => worker.displayName)).size !== 1000) throw new Error("command_room_worker_names_must_be_unique");
  if (new Set(roster.map((worker) => worker.workerId)).size !== 1000) throw new Error("command_room_worker_ids_must_be_unique");
  for (const council of COMMAND_COUNCILS) {
    const count = roster.filter((worker) => worker.councilId === council.id).length;
    if (count !== council.workers) throw new Error(`command_room_${council.id}_worker_count_invalid`);
  }
  if (TRADING_COUNCILS.length !== 12) throw new Error("trading_councils_must_remain_12");
}
