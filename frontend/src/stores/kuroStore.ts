// ─────────────────────────────────────────────────────────────
// Kuro Copilot — State Store (Zustand + Persist)
// ─────────────────────────────────────────────────────────────

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { bridge } from "../bridge/client";
import {
  KURO_PROVIDERS,
  type KuroConfig,
  type KuroMessage,
  type KuroPersonaMode,
  type KuroProviderId,
} from "../kuro/engine/types";
import { fetchProviderModels } from "../kuro/engine/llmClient";
import { runKuroAgent } from "../kuro/engine/kuroAgent";

interface KuroState {
  // Drawer visibility
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;

  // Agent execution state
  agentStatus: "idle" | "thinking" | "executing_tool";
  activeToolName: string | null;
  isFetchingModels: boolean;
  modelFetchError: string | null;

  // Configuration
  config: KuroConfig;
  setActiveProvider: (provider: KuroProviderId) => void;
  setApiKey: (provider: KuroProviderId, key: string) => void;
  setBaseUrl: (provider: KuroProviderId, url: string) => void;
  setSelectedModel: (provider: KuroProviderId, model: string) => void;
  setPersonaMode: (mode: KuroPersonaMode) => void;
  setTemperature: (temp: number) => void;
  fetchModelsForProvider: (provider?: KuroProviderId) => Promise<string[]>;

  // Chat conversation
  messages: KuroMessage[];
  sendMessage: (prompt: string) => Promise<void>;
  clearMessages: () => void;
}

const DEFAULT_CONFIG: KuroConfig = {
  activeProvider: "google",
  keys: {},
  baseUrls: {},
  selectedModels: {
    google: "gemini-2.5-flash",
    openai: "gpt-4o-mini",
    groq: "llama-3.3-70b-versatile",
    anthropic: "claude-3-5-sonnet-20241022",
    ollama: "llama3.1",
    openrouter: "meta-llama/llama-3.3-70b-instruct",
  },
  availableModels: {
    google: KURO_PROVIDERS.google.defaultModels,
    openai: KURO_PROVIDERS.openai.defaultModels,
    groq: KURO_PROVIDERS.groq.defaultModels,
    anthropic: KURO_PROVIDERS.anthropic.defaultModels,
    ollama: KURO_PROVIDERS.ollama.defaultModels,
    openrouter: KURO_PROVIDERS.openrouter.defaultModels,
  },
  temperature: 0.4,
  personaMode: "superhero",
};

function syncConfigToSqlite(cfg: KuroConfig) {
  try {
    bridge.updateSetting("kuro_copilot_config", JSON.stringify(cfg)).catch((err) => {
      console.warn("Failed to sync Kuro config to SQLite:", err);
    });
  } catch (err) {
    console.warn("Could not invoke bridge.updateSetting for Kuro config:", err);
  }
}

export const useKuroStore = create<KuroState>()(
  persist(
    (set, get) => ({
      isDrawerOpen: false,
      setDrawerOpen: (open) => set({ isDrawerOpen: open }),
      toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      agentStatus: "idle",
      activeToolName: null,
      isFetchingModels: false,
      modelFetchError: null,

      config: DEFAULT_CONFIG,

      setActiveProvider: (provider) =>
        set((state) => {
          const newConfig = { ...state.config, activeProvider: provider };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      setApiKey: (provider, key) =>
        set((state) => {
          const newConfig = {
            ...state.config,
            keys: { ...state.config.keys, [provider]: key },
          };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      setBaseUrl: (provider, url) =>
        set((state) => {
          const newConfig = {
            ...state.config,
            baseUrls: { ...state.config.baseUrls, [provider]: url },
          };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      setSelectedModel: (provider, model) =>
        set((state) => {
          const newConfig = {
            ...state.config,
            selectedModels: { ...state.config.selectedModels, [provider]: model },
          };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      setPersonaMode: (personaMode) =>
        set((state) => {
          const newConfig = { ...state.config, personaMode };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      setTemperature: (temperature) =>
        set((state) => {
          const newConfig = { ...state.config, temperature };
          syncConfigToSqlite(newConfig);
          return { config: newConfig };
        }),

      fetchModelsForProvider: async (targetProvider) => {
        const provider = targetProvider || get().config.activeProvider;
        const apiKey = get().config.keys[provider];
        const baseUrl = get().config.baseUrls[provider];

        set({ isFetchingModels: true, modelFetchError: null });

        try {
          const res = await fetchProviderModels(provider, apiKey, baseUrl);
          if (res.error) {
            set({
              isFetchingModels: false,
              modelFetchError: res.error,
            });
            return res.models;
          }

          set((state) => {
            const currentSelected = state.config.selectedModels[provider];
            const newSelected =
              res.models.includes(currentSelected || "")
                ? currentSelected
                : res.models[0] || currentSelected;

            return {
              isFetchingModels: false,
              modelFetchError: null,
              config: {
                ...state.config,
                availableModels: {
                  ...state.config.availableModels,
                  [provider]: res.models,
                },
                selectedModels: {
                  ...state.config.selectedModels,
                  [provider]: newSelected,
                },
              },
            };
          });

          return res.models;
        } catch (err: any) {
          set({
            isFetchingModels: false,
            modelFetchError: err.message || String(err),
          });
          return KURO_PROVIDERS[provider].defaultModels;
        }
      },

      messages: [
        {
          id: "welcome_init",
          role: "assistant",
          content: "⚡ Welcome! I'm Kuro, your autonomous AI Copilot in KuroRelay.\n\nI have full access to your SQLite database, Request editor, Mock Server, and Workflows. I can inspect, execute, and debug requests, manage collections, and run automated testing chains.\n\nHow can I help you today?",
          timestamp: Date.now(),
        },
      ],

      sendMessage: async (prompt) => {
        const trimmed = prompt.trim();
        if (!trimmed || get().agentStatus !== "idle") return;

        const currentMessages = get().messages;
        const config = get().config;

        await runKuroAgent({
          userPrompt: trimmed,
          history: currentMessages,
          config,
          onMessageUpdate: (updatedMessages) => {
            set({ messages: updatedMessages });
          },
          onStatusChange: (status, toolName) => {
            set({
              agentStatus: status,
              activeToolName: toolName || null,
            });
          },
        });
      },

      clearMessages: () =>
        set({
          messages: [
            {
              id: `welcome_${Date.now()}`,
              role: "assistant",
              content: "⚡ Memory cleared and ready fresh! What would you like to build or test next?",
              timestamp: Date.now(),
            },
          ],
        }),
    }),
    {
      name: "kuro_copilot_store_v1",
      partialize: (state) => ({
        config: state.config,
        messages: state.messages,
      }),
    }
  )
);

// ── SQLite Hydration Helper ────────────────────────────────────
export async function hydrateKuroStoreFromSqlite() {
  try {
    const res = await bridge.getSettings();
    const rawConfig = res?.settings?.kuro_copilot_config;
    if (rawConfig && rawConfig !== "{}") {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === "object") {
        const store = useKuroStore.getState();
        const mergedConfig: KuroConfig = {
          ...store.config,
          ...parsed,
          keys: { ...store.config.keys, ...parsed.keys },
          baseUrls: { ...store.config.baseUrls, ...parsed.baseUrls },
          selectedModels: { ...store.config.selectedModels, ...parsed.selectedModels },
          availableModels: { ...store.config.availableModels, ...parsed.availableModels },
        };
        useKuroStore.setState({ config: mergedConfig });
      }
    }
  } catch (err) {
    console.warn("Could not hydrate Kuro config from SQLite:", err);
  }
}
