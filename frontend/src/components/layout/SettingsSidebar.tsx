import React from "react";
import {
  Globe,
  Sliders,
  Database,
  ShieldCheck,
  Info,
  Keyboard,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import type { SettingsTabId } from "../views/settings/types";

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
    desc: "Code editor, typography, tabs",
  },
  {
    id: "kuro",
    label: "Kuro AI Copilot",
    icon: <img src="/logo.png" alt="Kuro" className="w-4 h-4 rounded-full object-cover" />,
    desc: "LLM providers, API keys & persona",
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

export const SettingsSidebar: React.FC = () => {
  const { activeSettingsTab, setActiveSettingsTab } = useAppStore();

  return (
    <div className="flex flex-col h-full overflow-hidden select-none bg-[var(--bg-s1)]">
      {/* Sidebar Section Title */}
      <div className="px-3 py-2.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]/40 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-3)]">
          Preferences & Settings
        </span>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {TABS.map((tab) => {
          const isActive = activeSettingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`flex items-start gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                isActive
                  ? "bg-[var(--lime)]/10 text-[var(--lime)] border border-[var(--lime)]/30 shadow-sm"
                  : "text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s2)] border border-transparent"
              }`}
            >
              <div
                className={`mt-0.5 shrink-0 ${
                  isActive ? "text-[var(--lime)]" : "text-[var(--tx-3)]"
                }`}
              >
                {tab.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs font-semibold leading-tight ${
                    isActive ? "text-[var(--lime)]" : "text-[var(--tx-1)]"
                  }`}
                >
                  {tab.label}
                </div>
                <div className="text-[10px] text-[var(--tx-3)] truncate mt-1">
                  {tab.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
