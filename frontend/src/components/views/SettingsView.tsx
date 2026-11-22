import { useEffect, useState, useCallback } from "react";
import {
  Globe,
  Sliders,
  Database,
  ShieldCheck,
  Info,
  CheckCircle2,
  RefreshCw,
  Keyboard,
} from "lucide-react";
import { bridge, type SystemInfo } from "../../bridge/client";
import { applyAccentColor } from "../../lib/accentTheme";
import { useToast } from "../ui/Toast";
import { useAppStore } from "../../stores/appStore";
import type { SettingsState, SettingsTabId } from "./settings/types";
import { NetworkSettingsTab } from "./settings/NetworkSettingsTab";
import { EditorSettingsTab } from "./settings/EditorSettingsTab";
import { StorageSettingsTab } from "./settings/StorageSettingsTab";
import { SecuritySettingsTab } from "./settings/SecuritySettingsTab";
import { AboutSettingsTab } from "./settings/AboutSettingsTab";
import { KuroSettingsTab } from "./settings/KuroSettingsTab";
import { KeyboardShortcutsTab } from "./settings/KeyboardShortcutsTab";

const TABS: { id: SettingsTabId; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "network",
    label: "General & Network",
    icon: <Globe size={15} />,
    desc: "Timeouts, redirects, TLS, and proxies",
  },
  {
    id: "editor",
    label: "Editor & Workbench",
    icon: <Sliders size={15} />,
    desc: "Monaco code editor, typography, tabs",
  },
  {
    id: "kuro",
    label: "Kuro AI Copilot",
    icon: <img src="/logo.png" alt="Kuro" className="w-4 h-4 rounded-full object-cover" />,
    desc: "LLM providers, API keys, models & persona",
  },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    icon: <Keyboard size={15} />,
    desc: "Keybindings, tab navigation, global hotkeys",
  },
  {
    id: "storage",
    label: "Data & Storage",
    icon: <Database size={15} />,
    desc: "History, SQLite database, cleanup",
  },
  {
    id: "security",
    label: "Security & Vault",
    icon: <ShieldCheck size={15} />,
    desc: "Keyring, secret protection, logs",
  },
  {
    id: "about",
    label: "About & KuroLabs",
    icon: <Info size={15} />,
    desc: "App identity, KuroLabs org, runtime",
  },
];

export function SettingsView() {
  const { toast } = useToast();
  const { activeSettingsTab } = useAppStore();
  const [settings, setSettings] = useState<SettingsState>({
    default_timeout_ms: "30000",
    max_history_records: "500",
    follow_redirects: "true",
    max_redirects: "5",
    verify_tls: "true",
    allow_private_network_default: "false",
    user_agent: "KuroRelay/1.0",
    max_response_size_mb: "50",
    proxy_mode: "system",
    proxy_url: "",
    proxy_bypass: "localhost,127.0.0.1",
    auto_save_history: "true",
    redact_sensitive_headers: "true",
    monaco_font_size: "13",
    monaco_word_wrap: "on",
    monaco_tab_size: "2",
    monaco_minimap: "false",
    monaco_format_on_paste: "true",
    split_layout: "vertical",
    confirm_close_dirty: "true",
    app_accent_color: "lime",
    log_level: "INFO",
  });
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, sysRes] = await Promise.allSettled([
        bridge.getSettings(),
        bridge.getSystemInfo(),
      ]);

      if (settingsRes.status === "fulfilled" && settingsRes.value?.status === "ok" && settingsRes.value?.settings) {
        setSettings((prev) => ({ ...prev, ...settingsRes.value.settings }));
        useAppStore.getState().setAppSettings(settingsRes.value.settings);
        if (settingsRes.value.settings.app_accent_color) {
          applyAccentColor(settingsRes.value.settings.app_accent_color);
        }
      }

      if (sysRes.status === "fulfilled" && sysRes.value?.status === "ok" && sysRes.value?.info) {
        setSystemInfo(sysRes.value.info);
      }
    } catch (err) {
      console.error("Failed to load settings data", err);
      toast("Could not load full settings from bridge", "warning");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdate = useCallback(
    async (key: string, value: string) => {
      // Optimistic state update
      setSettings((prev) => ({ ...prev, [key]: value }));
      useAppStore.getState().updateAppSetting(key, value);
      setSavingKey(key);

      try {
        const res = await bridge.updateSetting(key, value);
        if (res.status !== "ok") {
          toast(`Failed to save ${key}`, "error");
        }
      } catch (err) {
        console.error("Failed to update setting", key, err);
        toast(`Error saving ${key}`, "error");
      } finally {
        setTimeout(() => setSavingKey(null), 600);
      }
    },
    [toast]
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] select-none overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--tx-1)] font-mono tracking-tight">
            Settings
          </h2>
          <span className="text-[var(--border-dim)]">/</span>
          <span className="text-xs text-[var(--tx-3)] font-medium">
            {TABS.find((t) => t.id === activeSettingsTab)?.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {savingKey ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--lime)] font-medium">
              <RefreshCw size={11} className="animate-spin" />
              <span>Saving {savingKey}…</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ok)] opacity-75 font-medium">
              <CheckCircle2 size={11} />
              <span>Preferences Saved</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto pb-12">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <RefreshCw size={24} className="text-[var(--lime)] animate-spin" />
              <span className="text-xs text-[var(--tx-3)] font-mono">Loading preferences…</span>
            </div>
          ) : (
            <>
              {activeSettingsTab === "network" && (
                <NetworkSettingsTab settings={settings} onUpdate={handleUpdate} />
              )}
              {activeSettingsTab === "editor" && (
                <EditorSettingsTab settings={settings} onUpdate={handleUpdate} />
              )}
              {activeSettingsTab === "storage" && (
                <StorageSettingsTab
                  settings={settings}
                  onUpdate={handleUpdate}
                  systemInfo={systemInfo}
                />
              )}
              {activeSettingsTab === "security" && (
                <SecuritySettingsTab
                  settings={settings}
                  onUpdate={handleUpdate}
                  systemInfo={systemInfo}
                />
              )}
              {activeSettingsTab === "about" && (
                <AboutSettingsTab systemInfo={systemInfo} />
              )}
              {activeSettingsTab === "kuro" && (
                <KuroSettingsTab />
              )}
              {activeSettingsTab === "shortcuts" && (
                <KeyboardShortcutsTab />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
