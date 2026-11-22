// ─────────────────────────────────────────────────────────────
// Kuro Engine — Core Types & Tool Definitions
// ─────────────────────────────────────────────────────────────

export type KuroProviderId =
  | "google"
  | "openai"
  | "groq"
  | "anthropic"
  | "ollama"
  | "openrouter"
  | "custom";

export interface KuroProviderMeta {
  id: KuroProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModels: string[];
  placeholderKey: string;
  keyUrl?: string;
}

export const KURO_PROVIDERS: Record<KuroProviderId, KuroProviderMeta> = {
  google: {
    id: "google",
    name: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModels: [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ],
    placeholderKey: "AIzaSy...",
    keyUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "gpt-4-turbo",
    ],
    placeholderKey: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  groq: {
    id: "groq",
    name: "Groq (Ultra-Fast)",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "deepseek-r1-distill-llama-70b",
    ],
    placeholderKey: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModels: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    placeholderKey: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    defaultBaseUrl: "http://localhost:11434",
    defaultModels: [
      "llama3.1",
      "mistral",
      "qwen2.5-coder",
      "deepseek-r1",
    ],
    placeholderKey: "None (Local)",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModels: [
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash-exp:free",
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-r1",
    ],
    placeholderKey: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
  },
  custom: {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    defaultBaseUrl: "http://localhost:8000/v1",
    defaultModels: ["default-model"],
    placeholderKey: "Optional API Key",
  },
};

export type KuroPersonaMode = "superhero" | "technical" | "concise";

export interface KuroConfig {
  activeProvider: KuroProviderId;
  keys: Partial<Record<KuroProviderId, string>>;
  baseUrls: Partial<Record<KuroProviderId, string>>;
  selectedModels: Partial<Record<KuroProviderId, string>>;
  availableModels: Partial<Record<KuroProviderId, string[]>>;
  temperature: number;
  personaMode: KuroPersonaMode;
}

export interface KuroToolParamProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: any;
}

export interface KuroToolDef {
  name: string;
  description: string;
  category: "ui" | "bridge" | "utility";
  parameters: {
    type: "object";
    properties: Record<string, KuroToolParamProperty>;
    required?: string[];
  };
}

export interface KuroToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface KuroToolResult {
  callId: string;
  toolName: string;
  success: boolean;
  result: any;
  durationMs: number;
  error?: string;
}

export interface KuroMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: KuroToolCall[];
  toolResults?: KuroToolResult[];
  rawParts?: any[];
  isStreaming?: boolean;
}
