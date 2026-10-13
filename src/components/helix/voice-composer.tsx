import { useEffect, useMemo, useRef, useState } from "react";
import { Ear, Mic, Plus, Send, Sparkles, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };

type SpeechRecognitionErrorEventLike = { error?: string };

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type VoiceWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const WAKE_WORDS = ["orion", "hey orion", "ok orion"];

function stripWakeWord(raw: string): string {
  let text = raw.trim();
  const lower = text.toLowerCase();
  for (const phrase of WAKE_WORDS.sort((a, b) => b.length - a.length)) {
    const index = lower.indexOf(phrase);
    if (index !== -1) {
      text = (text.slice(0, index) + " " + text.slice(index + phrase.length)).trim();
      break;
    }
  }
  return text.trim();
}

export function VoiceComposer({
  value,
  onChange,
  onSubmit,
  onSpeak,
  onVoiceSubmit,
  busy = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSpeak?: () => void;
  onVoiceSubmit?: (value: string) => void;
  busy?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeHeard, setWakeHeard] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeOnRef = useRef(false);
  const voiceFinalRef = useRef("");
  const voiceSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as VoiceWindow;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      wakeOnRef.current = false;
      wakeRecognitionRef.current?.stop();
    };
  }, []);

  function toggleListening() {
    if (!voiceSupported) return;
    stopWake();
    const w = window as VoiceWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    voiceFinalRef.current = "";
    recognition.onresult = (event) => {
      let transcript = "";
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      if (transcript.trim()) onChange(transcript.trim());
      if (finalTranscript.trim()) voiceFinalRef.current = finalTranscript.trim();
    };
    recognition.onend = () => {
      const finalTranscript = voiceFinalRef.current.trim();
      recognitionRef.current = null;
      setListening(false);
      if (finalTranscript) onVoiceSubmit?.(finalTranscript);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopWake() {
    wakeOnRef.current = false;
    wakeRecognitionRef.current?.stop();
    wakeRecognitionRef.current = null;
    setWakeOn(false);
    setWakeHeard(false);
  }

  function startWakeRecognition() {
    const w = window as VoiceWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor || !wakeOnRef.current) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const heard = result[0].transcript ?? "";
        const lower = heard.toLowerCase();
        if (WAKE_WORDS.some((phrase) => lower.includes(phrase))) {
          setWakeHeard(true);
          window.setTimeout(() => setWakeHeard(false), 1400);
          const command = stripWakeWord(heard);
          if (command) onVoiceSubmit?.(command);
        }
      }
    };
    recognition.onend = () => {
      wakeRecognitionRef.current = null;
      // Browsers auto-stop continuous recognition after periods of silence —
      // restart it automatically while wake mode is still enabled.
      if (wakeOnRef.current) window.setTimeout(startWakeRecognition, 300);
    };
    recognition.onerror = (event) => {
      wakeRecognitionRef.current = null;
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        // Mic permission denied — retrying can never succeed, so stop cleanly
        // instead of looping forever in the background.
        wakeOnRef.current = false;
        setWakeOn(false);
        setWakeHeard(false);
        return;
      }
      if (wakeOnRef.current) window.setTimeout(startWakeRecognition, 800);
    };
    wakeRecognitionRef.current = recognition;
    recognition.start();
  }

  function toggleWake() {
    if (!voiceSupported) return;
    if (wakeOnRef.current) {
      stopWake();
      return;
    }
    recognitionRef.current?.stop();
    setListening(false);
    wakeOnRef.current = true;
    setWakeOn(true);
    startWakeRecognition();
  }

  return (
    <div className="helix-composer-shell">
      {toolsOpen ? (
        <div className="absolute bottom-[calc(100%+0.65rem)] left-0 flex w-[min(20rem,84vw)] gap-2 rounded-2xl border border-white/10 bg-black/75 p-2 shadow-2xl backdrop-blur-2xl">
          {["Market scan", "Risk status", "News + sentiment", "Portfolio summary"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onChange(item);
                setToolsOpen(false);
              }}
              className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-left text-xs text-white/60 hover:bg-white/[0.08] hover:text-white"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {wakeOn ? (
        <div className="absolute bottom-[calc(100%+0.65rem)] right-0 flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/75 px-3 py-1.5 shadow-2xl backdrop-blur-2xl">
          <span className={cn("size-1.5 rounded-full bg-cyan-300", wakeHeard ? "animate-ping" : "animate-pulse")} />
          <span className="font-mono text-[9px] tracking-[0.14em] text-cyan-100/70 uppercase">{wakeHeard ? "Heard you" : 'Listening for "Orion"'}</span>
        </div>
      ) : null}
      <div className="flex items-end gap-2 rounded-[1.65rem] border border-white/12 bg-white/[0.06] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <button
          type="button"
          aria-label="Open quick actions"
          onClick={() => setToolsOpen((v) => !v)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
        >
          {toolsOpen ? <X className="size-4" /> : <Plus className="size-4" />}
        </button>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder="Ask HELIX anything… or say “Orion”"
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white outline-none placeholder:text-white/28"
          aria-label="Ask HELIX"
        />
        <button
          type="button"
          aria-label={wakeOn ? "Turn off wake word" : 'Turn on "Orion" wake word'}
          onClick={toggleWake}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-white/65 transition",
            wakeOn ? "bg-violet-300/18 text-violet-100" : "bg-white/[0.05] hover:bg-white/[0.1] hover:text-white",
            !voiceSupported && "opacity-40",
          )}
          title={voiceSupported ? 'Say "Orion" to talk hands-free' : "Voice input unavailable in this browser"}
        >
          <Ear className={cn("size-4", wakeOn && "animate-pulse")} />
        </button>
        <button
          type="button"
          aria-label={listening ? "Stop listening" : "Voice input"}
          onClick={toggleListening}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-white/65 transition",
            listening ? "bg-cyan-300/18 text-cyan-100" : "bg-white/[0.05] hover:bg-white/[0.1] hover:text-white",
            !voiceSupported && "opacity-40",
          )}
          title={voiceSupported ? "Voice input" : "Voice input unavailable in this browser"}
        >
          <Mic className={cn("size-4", listening && "animate-pulse")} />
        </button>
        <button
          type="button"
          onClick={onSpeak}
          disabled={!onSpeak || busy}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {onSpeak ? <Volume2 className="size-4" /> : <Sparkles className="size-4" />}
          <span className="hidden sm:inline">Speak</span>
        </button>
        <button
          type="button"
          aria-label="Send"
          onClick={onSubmit}
          disabled={!value.trim() || busy}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cyan-200/80 text-black transition hover:bg-cyan-100 disabled:opacity-35"
        >
          <Send className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between px-2 font-mono text-[9px] tracking-[0.14em] text-white/28 uppercase">
        <span>{wakeOn ? 'Hands-free · say "Orion" + your request' : "Voice · tools · governed actions"}</span>
        <span>Enter to dispatch</span>
      </div>
    </div>
  );
}
