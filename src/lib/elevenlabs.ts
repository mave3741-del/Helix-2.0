import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

// Dynamic (not static top-level) import — credentials.server touches
// node:crypto/node:fs directly, and this module is reachable from client
// code via the createServerFn export below (through src/lib/agent-voices.ts).
// Same pattern as src/runtime/brain/server.ts.
let credsPromise: ReturnType<typeof loadCreds> | null = null;
function loadCreds() {
  return import("@/runtime/brain/credentials.server");
}
function creds() {
  credsPromise ??= loadCreds();
  return credsPromise;
}

// A single council line is always short — this caps both cost and abuse
// surface on an endpoint that spends real ElevenLabs credits.
const MAX_CHARS = 400;

export interface SynthesizeAgentSpeechInput {
  text: string;
  voiceId: string;
}

export type SynthesizeAgentSpeechResult =
  | { ok: true; audioBase64: string; mimeType: "audio/mpeg" }
  | { ok: false; reason: "not_configured" | "empty_text" | "provider_error" };

/**
 * Text-to-speech for one council line via ElevenLabs, using whatever key is
 * on file in HELIX's existing provider vault (Settings → Brains → Providers)
 * or the ELEVENLABS_API_KEY env var — same resolution order as every other
 * brain provider. Returns `not_configured` (never throws) when no key is
 * set, so the client can fall back to the browser's built-in voice.
 */
export const synthesizeAgentSpeech = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SynthesizeAgentSpeechInput) => input)
  .handler(async ({ data }): Promise<SynthesizeAgentSpeechResult> => {
    const text = data.text.trim().slice(0, MAX_CHARS);
    if (!text) return { ok: false, reason: "empty_text" };

    const { resolveSecret } = await creds();
    const secret = resolveSecret("elevenlabs");
    if (!secret?.key) return { ok: false, reason: "not_configured" };

    try {
      const response = await fetch(`${secret.base}/text-to-speech/${encodeURIComponent(data.voiceId)}`, {
        method: "POST",
        headers: {
          "xi-api-key": secret.key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: secret.model || "eleven_flash_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
        }),
      });
      if (!response.ok) return { ok: false, reason: "provider_error" };
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      return { ok: true, audioBase64: btoa(binary), mimeType: "audio/mpeg" };
    } catch {
      return { ok: false, reason: "provider_error" };
    }
  });
