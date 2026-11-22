// ─────────────────────────────────────────────────────────────
// Settings — Keyboard Shortcuts Reference Tab
// ─────────────────────────────────────────────────────────────

import React from "react";
import {
  Keyboard,
  MousePointer2,
  LayoutDashboard,
  FolderOpen,
  Bot,
  Terminal,
  Globe,
  Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortcuts: ShortcutEntry[];
}

// ── Data ───────────────────────────────────────────────────────
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "global",
    title: "Global",
    icon: <Globe size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open / Close Kuro AI Copilot" },
      { keys: ["Ctrl", "Shift", "P"], description: "Open Command Palette" },
      { keys: ["Ctrl", "N"], description: "Open a new request tab" },
      { keys: ["Ctrl", "W"], description: "Close the active tab" },
      { keys: ["Ctrl", "D"], description: "Duplicate the active tab" },
      { keys: ["Ctrl", "S"], description: "Save the active request" },
      { keys: ["Ctrl", "L"], description: "Focus & select the URL bar" },
      { keys: ["Ctrl", "\\"], description: "Toggle the sidebar" },
      { keys: ["Escape"], description: "Close any open modal or dialog" },
    ],
  },
  {
    id: "request",
    title: "Request Builder",
    icon: <Terminal size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "Enter"], description: "Send the active HTTP request" },
      { keys: ["Ctrl", "L"], description: "Focus URL bar and select all text" },
    ],
  },
  {
    id: "tabs",
    title: "Tab Navigation",
    icon: <Layers size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "Tab"], description: "Switch to the next tab →" },
      { keys: ["Ctrl", "Shift", "Tab"], description: "Switch to the previous tab ←" },
      { keys: ["Ctrl", "1"], description: "Jump to tab 1" },
      { keys: ["Ctrl", "2"], description: "Jump to tab 2" },
      { keys: ["Ctrl", "3–9"], description: "Jump to tab 3 through 9" },
    ],
  },
  {
    id: "modules",
    title: "Page Navigation",
    icon: <LayoutDashboard size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "Alt", "1"], description: "Go to Request Builder" },
      { keys: ["Ctrl", "Alt", "2"], description: "Go to Collections" },
      { keys: ["Ctrl", "Alt", "3"], description: "Go to Environments" },
      { keys: ["Ctrl", "Alt", "4"], description: "Go to History" },
      { keys: ["Ctrl", "Alt", "5"], description: "Go to Workflows" },
      { keys: ["Ctrl", "Alt", "6"], description: "Go to Mock Server" },
      { keys: ["Ctrl", "Alt", "7"], description: "Go to Settings" },
      { keys: ["Ctrl", "Alt", "→"], description: "Cycle to the next page" },
      { keys: ["Ctrl", "Alt", "←"], description: "Cycle to the previous page" },
    ],
  },
  {
    id: "kuro",
    title: "Kuro AI Copilot",
    icon: <Bot size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open / Close the Kuro drawer" },
      { keys: ["Enter"], description: "Send message to Kuro" },
      { keys: ["Shift", "Enter"], description: "New line in Kuro input (no send)" },
      { keys: ["Escape"], description: "Close the Kuro drawer" },
    ],
  },
  {
    id: "collections",
    title: "Collections & Sidebar",
    icon: <FolderOpen size={14} />,
    shortcuts: [
      { keys: ["Enter"], description: "Confirm rename of collection / folder" },
      { keys: ["Escape"], description: "Cancel rename" },
    ],
  },
  {
    id: "palette",
    title: "Command Palette",
    icon: <MousePointer2 size={14} />,
    shortcuts: [
      { keys: ["Ctrl", "Shift", "P"], description: "Open / Close palette" },
      { keys: ["↑ / ↓"], description: "Navigate between results" },
      { keys: ["Enter"], description: "Execute the selected command" },
      { keys: ["Escape"], description: "Close the palette" },
    ],
  },
];

// ── Sub-components ─────────────────────────────────────────────
function KbdKey({ label }: { label: string }) {
  return (
    <kbd
      className="inline-flex items-center justify-center px-2 py-0.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s3)] text-[11px] font-mono font-semibold text-[var(--tx-1)] shadow-sm leading-5 select-none"
      style={{ minWidth: "1.5rem" }}
    >
      {label}
    </kbd>
  );
}

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-s2)] transition-colors group">
      <span className="text-xs text-[var(--tx-2)] group-hover:text-[var(--tx-1)] transition-colors">
        {entry.description}
      </span>
      <div className="flex items-center gap-1 ml-4 shrink-0">
        {entry.keys.map((key, i) => (
          <React.Fragment key={i}>
            <KbdKey label={key} />
            {i < entry.keys.length - 1 && (
              <span className="text-[10px] text-[var(--tx-3)] font-mono">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ShortcutGroupCard({ group }: { group: ShortcutGroup }) {
  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s1)] overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]/60">
        <span className="text-[var(--lime)]">{group.icon}</span>
        <span className="text-xs font-semibold text-[var(--tx-1)] tracking-wide">
          {group.title}
        </span>
      </div>

      {/* Shortcuts List */}
      <div className="p-1.5 space-y-0.5">
        {group.shortcuts.map((entry, i) => (
          <ShortcutRow key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function KeyboardShortcutsTab() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Keyboard size={18} className="text-[var(--lime)]" />
          <h3 className="text-sm font-bold text-[var(--tx-1)]">Keyboard Shortcuts</h3>
        </div>
        <p className="text-xs text-[var(--tx-3)] leading-relaxed">
          All keyboard shortcuts available in KuroRelay. On macOS, replace{" "}
          <KbdKey label="Ctrl" /> with{" "}
          <KbdKey label="⌘" />.
        </p>
      </div>

      {/* Platform Note */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--lime)]/20 bg-[var(--lime)]/5">
        <Keyboard size={14} className="text-[var(--lime)] mt-0.5 shrink-0" />
        <div className="text-[11px] text-[var(--tx-2)] leading-relaxed">
          Shortcuts marked with <span className="text-[var(--tx-1)] font-semibold">Ctrl+Enter</span> and{" "}
          <span className="text-[var(--tx-1)] font-semibold">Ctrl+S</span> work even when the cursor is inside
          a text input. All other shortcuts are ignored while typing in a field.
        </div>
      </div>

      {/* Groups Grid — 2 columns on wide, 1 on narrow */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {SHORTCUT_GROUPS.map((group) => (
          <ShortcutGroupCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
}
