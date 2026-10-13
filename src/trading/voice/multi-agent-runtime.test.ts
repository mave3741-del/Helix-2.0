import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRoomConversationEngine, CommandRoomRouter, buildCommandWorkerRoster } from '../command-room.ts';
import { CommandRoomVoiceRuntime } from './multi-agent-runtime.ts';

const roster = buildCommandWorkerRoster(1_700_000_000_000);

const modelClient = {
  async complete(): Promise<{ text: string }> {
    return { text: JSON.stringify({ reply: 'Acknowledged. I will stay within the evidence and risk envelope.', mentions: [], inviteDebate: false }) };
  },
};

class FakeRecognizer { async transcribe(): Promise<{ text: string }> { return { text: 'Orion Prime, summarize the system.' }; } }
class FakeSynthesizer { async synthesize(input: { text: string; voice: { voiceId: string } }): Promise<Uint8Array> { return new TextEncoder().encode(`${input.voice.voiceId}:${input.text}`); } }

test('voice runtime performs STT -> Command Room -> TTS', async () => {
  const engine = new CommandRoomConversationEngine(modelClient as never, new CommandRoomRouter(roster));
  const runtime = new CommandRoomVoiceRuntime(engine, new FakeRecognizer(), new FakeSynthesizer(), new CommandRoomRouter(roster));
  const result = await runtime.processVoiceTurn('voice-1', new Uint8Array([1, 2, 3]), 1_700_000_000_001);
  assert.equal(result.transcript, 'Orion Prime, summarize the system.');
  assert.ok(result.audio.byteLength > 0);
});

test('multi-agent round preserves bounded speaker order and distinct voices', async () => {
  const engine = new CommandRoomConversationEngine(modelClient as never, new CommandRoomRouter(roster));
  const router = new CommandRoomRouter(roster);
  const runtime = new CommandRoomVoiceRuntime(engine, new FakeRecognizer(), new FakeSynthesizer(), router);
  const ids = [roster[0]!.workerId, roster[500]!.workerId, roster[999]!.workerId];
  const result = await runtime.runMultiAgentRound('voice-2', 'Discuss BTC risk', ids, 1_700_000_000_010);
  assert.equal(result.turns.length, 3);
  assert.deepEqual(result.turns.map((t) => t.speakerId), ids);
  assert.equal(new Set(result.audio.map((x) => x.voice.voiceId)).size, 3);
});
