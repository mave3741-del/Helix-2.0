import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_COUNCILS,
  COMMAND_ROOM_COUNCIL_COUNTS,
  CommandRoomRouter,
  buildCommandWorkerRoster,
  buildMultiSpeakerAudioQueue,
  buildVoiceProfile,
  humanName,
  validateCommandRoomInvariants,
} from "./command-room.ts";

const roster = buildCommandWorkerRoster(1700000000000);

test("command room has 1000 uniquely named workers with assigned councils", () => {
  validateCommandRoomInvariants(roster);
  assert.equal(roster.length, 1000);
  assert.equal(new Set(roster.map((x) => x.displayName)).size, 1000);
  assert.equal(roster[0]?.displayName, humanName(1));
  assert.equal(roster[999]?.displayName, humanName(1000));
  for (const council of COMMAND_COUNCILS) assert.equal(COMMAND_ROOM_COUNCIL_COUNTS[council.id], council.workers);
});

test("command room router addresses CEO, councils and named workers", () => {
  const router = new CommandRoomRouter(roster);
  assert.equal(router.routeOwnerMessage("Orion Prime, what's the status?").primarySpeakerId, "orion-prime");
  const firstCrypto = roster.find((x) => x.councilId === "crypto")!;
  assert.equal(router.routeOwnerMessage(`Hi ${firstCrypto.displayName}, what do you see on BTC?`).primarySpeakerId, firstCrypto.workerId);
  assert.equal(router.routeOwnerMessage("AEGIS, check the risk.").primarySpeakerId, roster.find((x) => x.councilId === "risk")!.workerId);
  assert.equal(router.routeOwnerMessage("I need a normal answer, not a trading analysis.").primarySpeakerId, "orion-prime");
});

test("every worker has stable voice profile and audio queue preserves speaker order", () => {
  const first = roster[0]!;
  const second = roster[500]!;
  const session = { sessionId: "s1", ownerId: "owner", activeSpeakerIds: [first.workerId, second.workerId], createdAt: 1, updatedAt: 3, turns: [
    { turnId: "t1", sessionId: "s1", speakerId: first.workerId, speakerName: first.displayName, speakerTitle: first.title, text: "I have a view.", timestamp: 2, mode: "voice" as const, mentions: [] },
    { turnId: "t2", sessionId: "s1", speakerId: second.workerId, speakerName: second.displayName, speakerTitle: second.title, text: "I disagree.", timestamp: 3, mode: "voice" as const, mentions: [] },
  ] };
  const queue = buildMultiSpeakerAudioQueue(session, roster);
  assert.equal(queue.length, 2);
  assert.equal(queue[0]?.voice.voiceId, buildVoiceProfile(first.workerId, roster).voiceId);
  assert.equal(queue[1]?.voice.voiceId, buildVoiceProfile(second.workerId, roster).voiceId);
});
