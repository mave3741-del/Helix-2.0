// Gives every HELIX council member — Orion plus the specialist constellation —
// a distinct, stable-sounding voice.
//
// Primary path: ElevenLabs (realistic per-agent voices), used automatically
// once a key is on file in Settings → Brains → Providers → "ElevenLabs
// (voice)" (or the ELEVENLABS_API_KEY env var) — free tier is ~10k
// credits/month, no code changes needed once the key is saved.
//
// Fallback path (always available, no key needed): the browser's own
// SpeechSynthesis, with each agent given a distinct pitch/rate fingerprint
// and, where the browser exposes more than one system voice, a different
// one of those too.
import { synthesizeAgentSpeech } from "@/lib/elevenlabs";

export type AgentVoiceProfile = {
  pitch: number;
  rate: number;
};

const COUNCIL_ORDER = [
  "Orion",
  "Lyra",
  "Nova",
  "Atlas",
  "Polaris",
  "Nebula",
  "Titan",
  "Cassini",
  "Astra",
  "Mira",
  "Selene",
  "Vega",
] as const;

export const COUNCIL_AGENTS: readonly string[] = COUNCIL_ORDER;

// Well-known ElevenLabs premade voice IDs (one per agent). If any of these
// have been retired on your account, that one agent silently falls back to
// the browser voice below — swap the ID from your ElevenLabs Voice Library
// (elevenlabs.io/app/voice-library) any time, nothing else needs to change.
const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  Orion: "pNInz6obpgDQGcFmaJgB", // Adam — deep, grounded lead voice
  Lyra: "EXAVITQu4vr4xnSDxMaL", // Bella
  Nova: "MF3mGyEYCl7XYWbV9V6O", // Elli
  Atlas: "VR6AewLTigWG4xSOukaG", // Arnold
  Polaris: "ErXwobaYiN019PkySvjV", // Antoni
  Nebula: "ThT5KcBeYPX3keUQqHPh", // Dorothy
  Titan: "TxGEqnHWrfWFTfGW9XjX", // Josh
  Cassini: "N2lVS1w4EtoT3dr4eOWO", // Callum
  Astra: "21m00Tcm4TlvDq8ikWAM", // Rachel
  Mira: "AZnzlk1XvdvUeBnXmlld", // Domi
  Selene: "yoZ06aMxZJJ28mfd3POQ", // Sam
  Vega: "Xb7hH8MSUJpSbSDYk0k2", // Alice
};

// Hand-tuned so Orion reads as a calm, grounded lead voice and every
// specialist is clearly differentiated from it and from each other — used
// for the browser-voice fallback path.
const VOICE_PROFILES: Record<string, AgentVoiceProfile> = {
  Orion: { pitch: 0.86, rate: 0.97 },
  Lyra: { pitch: 1.28, rate: 1.06 },
  Nova: { pitch: 1.16, rate: 1.13 },
  Atlas: { pitch: 0.72, rate: 0.9 },
  Polaris: { pitch: 1.04, rate: 1.0 },
  Nebula: { pitch: 1.32, rate: 0.94 },
  Titan: { pitch: 0.62, rate: 0.86 },
  Cassini: { pitch: 1.1, rate: 1.08 },
  Astra: { pitch: 1.22, rate: 1.03 },
  Mira: { pitch: 1.36, rate: 1.11 },
  Selene: { pitch: 0.95, rate: 0.9 },
  Vega: { pitch: 1.18, rate: 0.98 },
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getAgentVoiceProfile(agent: string): AgentVoiceProfile {
  if (VOICE_PROFILES[agent]) return VOICE_PROFILES[agent];
  const seed = hashString(agent);
  return {
    pitch: 0.8 + (seed % 50) / 100,
    rate: 0.88 + ((seed >> 3) % 30) / 100,
  };
}

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length > 0) {
      cachedVoices = existing;
      resolve(existing);
      return;
    }
    const handle = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        cachedVoices = voices;
        synth.removeEventListener("voiceschanged", handle);
        resolve(voices);
      }
    };
    synth.addEventListener("voiceschanged", handle);
    window.setTimeout(() => {
      const voices = synth.getVoices();
      cachedVoices = voices;
      resolve(voices);
    }, 700);
  });
  return voicesPromise;
}

export async function pickSystemVoiceForAgent(agent: string): Promise<SpeechSynthesisVoice | undefined> {
  const voices = await loadVoices();
  if (!voices.length) return undefined;
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const pool = englishVoices.length ? englishVoices : voices;
  const index = hashString(agent) % pool.length;
  return pool[index];
}

export type SpeakHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
};

let currentAudio: HTMLAudioElement | null = null;

function speakWithBrowserVoice(text: string, agent: string, handlers?: SpeakHandlers): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const profile = getAgentVoiceProfile(agent);
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;
  utterance.onstart = () => handlers?.onStart?.();
  utterance.onend = () => handlers?.onEnd?.();
  utterance.onerror = () => handlers?.onEnd?.();

  void pickSystemVoiceForAgent(agent).then((voice) => {
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  });
}

/**
 * Speaks `text` in the given agent's voice — ElevenLabs when configured,
 * the browser's own voice otherwise. Cancels any HELIX utterance already in
 * progress (either kind) so voices never overlap.
 */
export async function speakAsAgent(text: string, agent: string, handlers?: SpeakHandlers): Promise<void> {
  const value = text.trim();
  if (!value) return;

  stopSpeaking();

  const voiceId = ELEVENLABS_VOICE_IDS[agent];
  if (voiceId) {
    try {
      const result = await synthesizeAgentSpeech({ data: { text: value, voiceId } });
      if (result.ok) {
        const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
        currentAudio = audio;
        audio.onplay = () => handlers?.onStart?.();
        audio.onended = () => {
          if (currentAudio === audio) currentAudio = null;
          handlers?.onEnd?.();
        };
        audio.onerror = () => {
          if (currentAudio === audio) currentAudio = null;
          handlers?.onEnd?.();
        };
        await audio.play();
        return;
      }
    } catch {
      // Network/server hiccup — fall through to the browser voice below.
    }
  }

  speakWithBrowserVoice(value, agent, handlers);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
