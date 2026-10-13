import type { CommandRoomConversationEngine, CommandRoomSession, CommandRoomTurn, SpeechRecognizer, SpeechSynthesizer, VoiceProfile } from '../command-room.ts';
import { buildVoiceProfile } from '../command-room.ts';
import type { CommandRoomRouter } from '../command-room.ts';

export interface VoiceTurnResult {
  transcript: string;
  response: CommandRoomTurn;
  audio: Uint8Array;
}

export interface MultiAgentRoundResult {
  turns: CommandRoomTurn[];
  audio: Array<{ speakerId: string; turnId: string; audio: Uint8Array; voice: VoiceProfile }>;
}

export class CommandRoomVoiceRuntime {
  private readonly engine: CommandRoomConversationEngine;
  private readonly recognizer: SpeechRecognizer;
  private readonly synthesizer: SpeechSynthesizer;
  private readonly router: CommandRoomRouter;

  constructor(engine: CommandRoomConversationEngine, recognizer: SpeechRecognizer, synthesizer: SpeechSynthesizer, router: CommandRoomRouter) {
    this.engine = engine;
    this.recognizer = recognizer;
    this.synthesizer = synthesizer;
    this.router = router;
  }

  async processVoiceTurn(sessionId: string, audioInput: Uint8Array, now = Date.now()): Promise<VoiceTurnResult> {
    if (audioInput.byteLength === 0) throw new Error('voice_input_empty');
    const transcript = await this.recognizer.transcribe(audioInput);
    if (!transcript.text.trim()) throw new Error('voice_transcript_empty');
    const result = await this.engine.reply(sessionId, transcript.text, 'voice', now);
    const voice = buildVoiceProfile(result.turn.speakerId);
    const audio = await this.synthesizer.synthesize({ text: result.turn.text, voice });
    return { transcript: transcript.text, response: result.turn, audio };
  }

  async runMultiAgentRound(sessionId: string, ownerPrompt: string, speakerIds?: string[], now = Date.now()): Promise<MultiAgentRoundResult> {
    const routed = this.router.routeOwnerMessage(ownerPrompt);
    const ids = [...new Set(speakerIds?.length ? speakerIds : [routed.primarySpeakerId, ...routed.invitedSpeakerIds])].slice(0, 8);
    const turns: CommandRoomTurn[] = [];
    for (const speakerId of ids) {
      const worker = this.router.getRoster().find((candidate) => candidate.workerId === speakerId);
      const speakerReference = worker?.displayName ?? speakerId;
      const prompt = `${speakerReference}, respond to this Command Room topic. Your response is part of a multi-agent discussion. Topic: ${ownerPrompt}`;
      const result = await this.engine.reply(sessionId, prompt, 'voice', now + turns.length);
      turns.push(result.turn);
    }
    const audio: MultiAgentRoundResult['audio'] = [];
    for (const turn of turns) {
      const voice = buildVoiceProfile(turn.speakerId);
      const rendered = await this.synthesizer.synthesize({ text: turn.text, voice });
      audio.push({ speakerId: turn.speakerId, turnId: turn.turnId, audio: rendered, voice });
    }
    return { turns, audio };
  }

  session(session: CommandRoomSession): CommandRoomSession { return structuredClone(session); }
}
