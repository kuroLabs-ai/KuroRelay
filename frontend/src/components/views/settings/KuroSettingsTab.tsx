import React, { useState } from "react";
import {
  Key,
  Globe,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Sliders,
  Shield,
  Bot,
} from "lucide-react";
import { useKuroStore } from "../../../stores/kuroStore";
import { KURO_PROVIDERS, type KuroProviderId, type KuroPersonaMode } from "../../../kuro/engine/types";
import { cn } from "../../../lib/cn";

export const KuroSettingsTab: React.FC = () => {
  const {
    config,
    setActiveProvider,
    setApiKey,
    setBaseUrl,
    setSelectedModel,
    setPersonaMode,
    setTemperature,
    fetchModelsForProvider,
    isFetchingModels,
    modelFetchError,
  } = useKuroStore();

  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "idle" | "testing" | "success" | "error"; message?: string }>({
    status: "idle",
  });
  const [modelSearch, setModelSearch] = useState("");

  const activeMeta = KURO_PROVIDERS[config.activeProvider];
  const currentKey = config.keys[config.activeProvider] || "";
  const currentBaseUrl = config.baseUrls[config.activeProvider] || activeMeta.defaultBaseUrl;
  const currentModel = config.selectedModels[config.activeProvider] || activeMeta.defaultModels[0];
  const availableModels = config.availableModels[config.activeProvider] || activeMeta.defaultModels;

  const filteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleFetchModels = async () => {
    setTestResult({ status: "idle" });
    await fetchModelsForProvider();
  };

  const handleTestConnection = async () => {
    setTestResult({ status: "testing" });
    try {
      const models = await fetchModelsForProvider();
      if (models && models.length > 0) {
        setTestResult({
          status: "success",
          message: `Successfully connected to ${activeMeta.name}! Found ${models.length} available models.`,
        });
      } else {
        setTestResult({
          status: "error",
          message: "Could not retrieve models list. Please check your API key or network connection.",
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message: err.message || "Connection test failed",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl pb-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-lg border border-[var(--color-accent-lime)]/40"
            style={{
              boxShadow: "0 0 20px rgba(166, 226, 46, 0.4)",
            }}
          >
            <img src="/logo.png" alt="Kuro" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Kuro AI Copilot Settings
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                SQLite Synced
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              API keys and configuration are securely stored in your local SQLite database across restarts.
            </p>
          </div>
        </div>

        <button
          onClick={handleTestConnection}
          disabled={testResult.status === "testing" || isFetchingModels}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-surface-panel)] border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-lime)] text-[var(--color-text-primary)] transition-all cursor-pointer"
        >
          {testResult.status === "testing" ? (
            <RefreshCw size={13} className="animate-spin text-[var(--color-accent-lime)]" />
          ) : (
            <Shield size={13} className="text-[var(--color-accent-lime)]" />
          )}
          <span>Test Connection</span>
        </button>
      </div>

      {/* Test Status Banner */}
      {testResult.status === "success" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{testResult.message}</span>
        </div>
      )}
      {testResult.status === "error" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{testResult.message}</span>
        </div>
      )}
      {modelFetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>Error loading models: {modelFetchError}</span>
        </div>
      )}

      {/* ── 1. Provider Selection Grid ── */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider block">
          Select AI Provider
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {(Object.keys(KURO_PROVIDERS) as KuroProviderId[]).map((provId) => {
            const meta = KURO_PROVIDERS[provId];
            const isSelected = config.activeProvider === provId;
            return (
              <button
                key={provId}
                onClick={() => {
                  setActiveProvider(provId);
                  setTestResult({ status: "idle" });
                }}
                className={cn(
                  "p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer",
                  isSelected
                    ? "border-[var(--color-accent-lime)] bg-[var(--color-surface-panel)] shadow-md"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-activity)] hover:border-[var(--color-text-muted)]"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-xs text-[var(--color-text-primary)]">
                    {meta.name}
                  </span>
                  {isSelected && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: "var(--color-accent-lime)" }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                  {meta.defaultModels[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Credentials & Base URL ── */}
      <div className="space-y-4 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-[var(--color-accent-lime)]" />
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
              {activeMeta.name} API Key
            </span>
          </div>
          {activeMeta.keyUrl && (
            <a
              href={activeMeta.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-[var(--color-accent-lime)] hover:underline"
            >
              <span>Get API Key</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>

        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={currentKey}
            onChange={(e) => setApiKey(config.activeProvider, e.target.value)}
            placeholder={activeMeta.placeholderKey}
            className="w-full px-3 py-2 pr-10 rounded-lg text-xs bg-[var(--color-surface-activity)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:border-[var(--color-accent-lime)] outline-none font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {/* Base URL override */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <Globe size={13} />
            <span>Endpoint Base URL</span>
          </div>
          <input
            type="text"
            value={currentBaseUrl}
            onChange={(e) => setBaseUrl(config.activeProvider, e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--color-surface-activity)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:border-[var(--color-accent-lime)] outline-none font-mono"
          />
        </div>
      </div>

      {/* ── 3. Models Selector with Live Fetch ── */}
      <div className="space-y-4 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-[var(--color-accent-lime)]" />
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
              Model Selection
            </span>
          </div>

          <button
            onClick={handleFetchModels}
            disabled={isFetchingModels}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-surface-activity)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-lime)] transition-colors cursor-pointer"
          >
            <RefreshCw
              size={12}
              className={cn("text-[var(--color-accent-lime)]", isFetchingModels && "animate-spin")}
            />
            <span>{isFetchingModels ? "Fetching live models..." : "Fetch Available Models"}</span>
          </button>
        </div>

        {/* Filter input */}
        {availableModels.length > 5 && (
          <input
            type="text"
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            placeholder="Search available models..."
            className="w-full px-3 py-1.5 rounded-lg text-xs bg-[var(--color-surface-activity)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:border-[var(--color-accent-lime)] outline-none"
          />
        )}

        {/* Models list grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {filteredModels.map((m) => {
            const isSelected = currentModel === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedModel(config.activeProvider, m)}
                className={cn(
                  "px-3 py-2 rounded-lg border text-left text-xs font-mono transition-all flex items-center justify-between cursor-pointer",
                  isSelected
                    ? "border-[var(--color-accent-lime)] bg-[var(--color-surface-activity)] text-[var(--color-text-primary)]"
                    : "border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                )}
              >
                <span className="truncate">{m}</span>
                {isSelected && (
                  <CheckCircle2 size={13} className="text-[var(--color-accent-lime)] shrink-0 ml-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Manual Model Override */}
        <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">Custom Model ID:</span>
          <input
            type="text"
            value={currentModel}
            onChange={(e) => setSelectedModel(config.activeProvider, e.target.value)}
            placeholder="Type custom model name..."
            className="flex-1 px-3 py-1.5 rounded text-xs bg-[var(--color-surface-activity)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:border-[var(--color-accent-lime)] outline-none font-mono"
          />
        </div>
      </div>

      {/* ── 4. Persona & Temperature ── */}
      <div className="space-y-4 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-[var(--color-accent-lime)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">
            Persona & Agent Behavior
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {(["superhero", "technical", "concise"] as KuroPersonaMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setPersonaMode(mode)}
              className={cn(
                "p-2.5 rounded-lg border text-center transition-all cursor-pointer capitalize text-xs",
                config.personaMode === mode
                  ? "border-[var(--color-accent-lime)] bg-[var(--color-surface-activity)] text-[var(--color-text-primary)] font-semibold"
                  : "border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              {mode === "superhero" ? "⚡ Superhero Master" : mode === "technical" ? "🛠️ Principal Engineer" : "🎯 Concise Agent"}
            </button>
          ))}
        </div>

        {/* Temperature slider */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span className="flex items-center gap-1.5">
              <Sliders size={13} />
              <span>Creativity / Temperature</span>
            </span>
            <span className="font-mono text-[var(--color-accent-lime)]">{config.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-[var(--color-accent-lime)] cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
