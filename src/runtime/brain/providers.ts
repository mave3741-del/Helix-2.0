export type RoutingMode = "auto" | "local-only" | "hybrid" | "cloud-first";

export type ProviderKind = "cloud" | "local" | "gateway" | "heuristic";

export type ConnectionState = "untested" | "connected" | "invalid" | "not_configured" | "offline";

export interface ProviderDef {
  id: string;
  name: string;
  kind: ProviderKind;
  defaultBase: string;
  defaultModel: string;
  envKey?: string;
  envBase?: string;
  envModel?: string;
  needsKey: boolean;
  capabilities: string[];
  notes: string;
}

export const PROVIDER_DEFS: ProviderDef[] = [
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    kind: "cloud",
    defaultBase: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    envKey: "NVIDIA_API_KEY",
    envModel: "NVIDIA_NIM_MODEL",
    needsKey: true,
    capabilities: ["reasoning", "planning", "coding", "research", "qc", "tools", "agentic"],
    notes: "NVIDIA hosted NIM OpenAI-compatible endpoint. Model is configurable."
  },
  {
    id: "xai",
    name: "xAI",
    kind: "cloud",
    defaultBase: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    envKey: "XAI_API_KEY",
    needsKey: true,
    capabilities: ["reasoning", "planning", "coding", "research", "qc", "tools"],
    notes: "Grok flagship and fast models",
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "cloud",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    envKey: "OPENAI_API_KEY",
    needsKey: true,
    capabilities: ["reasoning", "writing", "coding", "tools"],
    notes: "GPT family via OpenAI-compatible chat",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "cloud",
    defaultBase: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    envKey: "ANTHROPIC_API_KEY",
    needsKey: true,
    capabilities: ["reasoning", "writing", "qc", "coding"],
    notes: "Claude — OpenAI-compatible proxy if the base URL supports it",
  },
  {
    id: "google",
    name: "Google Gemini",
    kind: "cloud",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    envKey: "GOOGLE_API_KEY",
    needsKey: true,
    capabilities: ["research", "analysis", "writing"],
    notes: "Gemini OpenAI-compatible endpoint",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "gateway",
    defaultBase: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    envKey: "OPENROUTER_API_KEY",
    envModel: "OPENROUTER_MODEL",
    needsKey: true,
    capabilities: ["research", "writing", "analysis", "routing"],
    notes: "Multi-model gateway",
  },
  {
    id: "omniroute",
    name: "OmniRoute",
    kind: "gateway",
    defaultBase: "",
    defaultModel: "auto",
    envKey: "OMNIROUTE_API_KEY",
    envBase: "OMNIROUTE_BASE_URL",
    envModel: "OMNIROUTE_MODEL",
    needsKey: true,
    capabilities: ["routing", "reasoning", "planning"],
    notes: "Optional routing gateway — not required",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "cloud",
    defaultBase: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
    needsKey: true,
    capabilities: ["writing", "analysis", "coding"],
    notes: "Low-latency OpenAI-compatible",
  },
  {
    id: "mistral",
    name: "Mistral",
    kind: "cloud",
    defaultBase: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    envKey: "MISTRAL_API_KEY",
    needsKey: true,
    capabilities: ["writing", "coding", "analysis"],
    notes: "Mistral chat completions",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "cloud",
    defaultBase: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    needsKey: true,
    capabilities: ["coding", "reasoning"],
    notes: "DeepSeek OpenAI-compatible",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    kind: "cloud",
    defaultBase: "https://api.perplexity.ai",
    defaultModel: "sonar",
    envKey: "PERPLEXITY_API_KEY",
    needsKey: true,
    capabilities: ["research", "writing"],
    notes: "Search-grounded research",
  },
  {
    id: "qwen",
    name: "Qwen / DashScope",
    kind: "cloud",
    defaultBase: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    envKey: "DASHSCOPE_API_KEY",
    needsKey: true,
    capabilities: ["reasoning", "writing", "coding"],
    notes: "Alibaba-compatible Qwen endpoint",
  },
  {
    id: "ollama",
    name: "Ollama",
    kind: "local",
    defaultBase: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.1",
    envBase: "OLLAMA_BASE_URL",
    envModel: "OLLAMA_MODEL",
    needsKey: false,
    capabilities: ["writing", "analysis"],
    notes: "Local OpenAI-compatible server. Capability is whatever model you loaded.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    kind: "local",
    defaultBase: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    envBase: "LMSTUDIO_BASE_URL",
    needsKey: false,
    capabilities: ["writing", "analysis"],
    notes: "Local OpenAI-compatible server",
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    kind: "local",
    defaultBase: "http://127.0.0.1:8090/v1",
    defaultModel: "local-model",
    envBase: "LLAMACPP_BASE_URL",
    needsKey: false,
    capabilities: ["writing", "analysis"],
    notes: "llama.cpp server. Do not bind it to Helix's own preview port.",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    kind: "cloud",
    defaultBase: "",
    defaultModel: "",
    needsKey: true,
    capabilities: ["writing"],
    notes: "Any future provider: base URL + key + model",
  },
  {
    id: "local",
    name: "Local Heuristic",
    kind: "heuristic",
    defaultBase: "",
    defaultModel: "local-heuristic",
    needsKey: false,
    capabilities: ["ops", "routing", "classification", "qc"],
    notes: "Always-on deterministic kernel. Not an LLM.",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs (voice)",
    kind: "cloud",
    defaultBase: "https://api.elevenlabs.io/v1",
    defaultModel: "eleven_flash_v2_5",
    envKey: "ELEVENLABS_API_KEY",
    needsKey: true,
    capabilities: ["voice"],
    notes: "Realistic per-agent text-to-speech for Orion's council. Free tier ~10k credits/month. Falls back to the browser's built-in voice when not configured.",
  },
  {
    id: "resend",
    name: "Resend (email)",
    kind: "cloud",
    defaultBase: "https://api.resend.com",
    defaultModel: "",
    envKey: "RESEND_API_KEY",
    needsKey: true,
    capabilities: ["email"],
    notes: "Powers the email.send tool. Free tier ~3k emails/month, 100/day. Every send still needs your owner approval — this key doesn't bypass that.",
  },
  {
    id: "reddit",
    name: "Reddit (sentiment)",
    kind: "cloud",
    defaultBase: "https://oauth.reddit.com",
    defaultModel: "",
    envKey: "REDDIT_CLIENT_ID",
    needsKey: true,
    capabilities: ["sentiment"],
    notes: "Free tier (100 req/min, personal use). Register a 'script' app at reddit.com/prefs/apps, then paste ClientID:ClientSecret here. Also needs REDDIT_CLIENT_SECRET as an env var.",
  },
  {
    id: "x-twitter",
    name: "X / Twitter (sentiment)",
    kind: "cloud",
    defaultBase: "https://api.x.com/2",
    defaultModel: "",
    envKey: "X_BEARER_TOKEN",
    needsKey: true,
    capabilities: ["sentiment"],
    notes: "X closed its free read tier in Feb 2026 — this is pay-per-use (~$0.005/read) on X's side. Optional; everything else works without it.",
  },
  {
    id: "binance",
    name: "Binance (market data)",
    kind: "cloud",
    defaultBase: "https://api.binance.com",
    defaultModel: "",
    envKey: "BINANCE_API_KEY",
    needsKey: false,
    capabilities: ["market-data"],
    notes: "Public price/OHLCV data via CCXT needs no key at all. Only add a key here if you later want authenticated endpoints (e.g. your own account balances) — trading itself stays paper-only regardless.",
  },
  {
    id: "fred",
    name: "FRED (macro data)",
    kind: "cloud",
    defaultBase: "https://api.stlouisfed.org/fred",
    defaultModel: "",
    envKey: "FRED_API_KEY",
    needsKey: true,
    capabilities: ["market-data", "macro"],
    notes: "Free, instant signup at fredaccount.stlouisfed.org — rates, CPI, GDP, unemployment, and thousands of other series.",
  },
];

export const BRAIN_TO_PROVIDER: Record<string, string> = {
  "nvidia-nim": "nvidia-nim",
  "grok-4.5": "xai",
  "grok-fast": "xai",
  "open-reasoner": "openrouter",
  "cloud-coder": "openai",
  omniroute: "omniroute",
  "openai-gpt": "openai",
  "anthropic-claude": "anthropic",
  "google-gemini": "google",
  ollama: "ollama",
  lmstudio: "lmstudio",
  llamacpp: "llamacpp",
  groq: "groq",
  mistral: "mistral",
  deepseek: "deepseek",
  perplexity: "perplexity",
  qwen: "qwen",
  custom: "custom",
  "local-heuristic": "local",
};

export interface ProviderPublic {
  providerId: string;
  name: string;
  kind: string;
  configured: boolean;
  source: "owner" | "environment" | "none";
  last4: string;
  endpoint: string;
  model: string;
  needsKey: boolean;
  connection: ConnectionState;
  lastProbeAt: number | null;
  lastError: string | null;
  latencyMs: number | null;
  discoveredModels: string[];
  capabilities: string[];
  notes: string;
}

export function isLocalProvider(id: string) {
  const def = PROVIDER_DEFS.find((p) => p.id === id);
  return def?.kind === "local" || def?.kind === "heuristic";
}

export function capabilityChain(required: string): string[] {
  if (required === "coding") {
    return ["cloud-coder", "nvidia-nim", "deepseek", "grok-4.5", "openai-gpt", "ollama", "local-heuristic"];
  }
  if (required === "research") {
    return ["grok-4.5", "nvidia-nim", "perplexity", "open-reasoner", "google-gemini", "local-heuristic"];
  }
  if (required === "planning") {
    return ["grok-4.5", "nvidia-nim", "omniroute", "grok-fast", "local-heuristic"];
  }
  if (required === "qc") {
    return ["anthropic-claude", "nvidia-nim", "grok-fast", "open-reasoner", "local-heuristic"];
  }
  if (required === "writing") {
    return ["grok-fast", "nvidia-nim", "openai-gpt", "mistral", "ollama", "local-heuristic"];
  }
  return ["grok-fast", "open-reasoner", "ollama", "local-heuristic", "grok-4.5"];
}

export function redactSecret(value: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

export function last4(value: string) {
  const t = value.trim();
  if (!t) return "";
  return t.length <= 4 ? "••••" : t.slice(-4);
}
