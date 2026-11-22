import { bridge } from "../bridge/client";

export interface AccentPreset {
  id: string;
  name: string;
  nameAr: string;
  hex: string;
  hover: string;
  dim: string;
  soft: string;
}

export const ACCENT_PRESETS: Record<string, AccentPreset> = {
  lime: {
    id: "lime",
    name: "Kuro Lime",
    nameAr: "Signature Lime (Default)",
    hex: "#b8ff34",
    hover: "#c8ff5e",
    dim: "rgba(184, 255, 52, 0.12)",
    soft: "rgba(184, 255, 52, 0.22)",
  },
  cyan: {
    id: "cyan",
    name: "Cyber Cyan",
    nameAr: "Cyber Cyan",
    hex: "#06b6d4",
    hover: "#22d3ee",
    dim: "rgba(6, 182, 212, 0.12)",
    soft: "rgba(6, 182, 212, 0.22)",
  },
  purple: {
    id: "purple",
    name: "Neon Violet",
    nameAr: "Neon Violet",
    hex: "#a855f7",
    hover: "#c084fc",
    dim: "rgba(168, 85, 247, 0.12)",
    soft: "rgba(168, 85, 247, 0.22)",
  },
  amber: {
    id: "amber",
    name: "Amber Gold",
    nameAr: "Warm Amber",
    hex: "#f59e0b",
    hover: "#fbbf24",
    dim: "rgba(245, 158, 11, 0.12)",
    soft: "rgba(245, 158, 11, 0.22)",
  },
  red: {
    id: "red",
    name: "Crimson Red",
    nameAr: "Crimson Red",
    hex: "#f43f5e",
    hover: "#fb7185",
    dim: "rgba(244, 63, 94, 0.12)",
    soft: "rgba(244, 63, 94, 0.22)",
  },
  zinc: {
    id: "zinc",
    name: "Obsidian Mono",
    nameAr: "Obsidian Zinc (Monochrome)",
    hex: "#f4f4f5",
    hover: "#ffffff",
    dim: "rgba(244, 244, 245, 0.12)",
    soft: "rgba(244, 244, 245, 0.22)",
  },
};

const STORAGE_KEY = "kuro_app_accent_color";

export function getActiveAccentId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "lime";
  } catch {
    return "lime";
  }
}

export function applyAccentColor(presetId: string): void {
  const preset = ACCENT_PRESETS[presetId] || ACCENT_PRESETS.lime;
  const root = document.documentElement;

  root.style.setProperty("--color-accent-lime", preset.hex);
  root.style.setProperty("--color-accent-lime-hover", preset.hover);
  root.style.setProperty("--color-accent-lime-dim", preset.dim);
  root.style.setProperty("--color-border-focus", preset.hex);
  root.style.setProperty("--lime", preset.hex);
  root.style.setProperty("--lime-soft", preset.dim);
  root.style.setProperty("--lime-mid", preset.soft);
  root.style.setProperty("--info", preset.hex);

  try {
    localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    // Ignore storage quota or disabled errors
  }

  // Persist into AppData/window_state.json
  try {
    bridge.saveWindowState({ accent_color: preset.id }).catch(() => {});
  } catch {
    // Bridge may not be ready during initial mount
  }
}

export function initAccentColor(): void {
  const activeId = getActiveAccentId();
  applyAccentColor(activeId);

  // Sync with AppData window_state.json if available
  bridge.getWindowState()
    .then((res) => {
      if (res?.status === "ok" && res.state?.accent_color && res.state.accent_color !== activeId) {
        applyAccentColor(res.state.accent_color);
      }
    })
    .catch(() => {});
}
