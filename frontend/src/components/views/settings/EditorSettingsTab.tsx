import { Check } from "lucide-react";
import type { SettingsState } from "./types";
import {
  SettingSection,
  SettingRow,
  SettingToggle,
  SettingSelect,
} from "./SettingControls";
import { ACCENT_PRESETS, applyAccentColor, getActiveAccentId } from "../../../lib/accentTheme";

interface Props {
  settings: SettingsState;
  onUpdate: (key: string, value: string) => void;
}

export function EditorSettingsTab({ settings, onUpdate }: Props) {
  const wordWrap = (settings.monaco_word_wrap || "on") === "on";
  const minimap = settings.monaco_minimap === "true";
  const formatOnPaste = settings.monaco_format_on_paste === "true";
  const confirmCloseDirty = (settings.confirm_close_dirty || "true") === "true";
  const activeAccent = settings.app_accent_color || getActiveAccentId();

  const handleSelectAccent = (id: string) => {
    applyAccentColor(id);
    onUpdate("app_accent_color", id);
  };

  return (
    <div className="space-y-6">
      {/* Accent Color & Appearance */}
      <SettingSection
        title="Appearance & Accent Color"
        description="Choose the primary accent tint used across buttons, indicators, active tabs, and focus rings."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          {Object.values(ACCENT_PRESETS).map((preset) => {
            const isSelected = activeAccent === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectAccent(preset.id)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                  isSelected
                    ? "bg-[var(--bg-s3)] border-[var(--color-border-focus)] shadow-sm"
                    : "bg-[var(--bg-s2)] border-[var(--border-dim)] hover:border-[var(--border)] hover:bg-[var(--bg-s3)]"
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && <Check size={10} className="text-black font-bold" strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--tx-1)] truncate flex items-center justify-between">
                    <span>{preset.name}</span>
                    <span className="text-[10px] font-mono text-[var(--tx-3)] font-normal">{preset.hex}</span>
                  </div>
                  <div className="text-[10px] text-[var(--tx-3)] truncate mt-0.5">
                    {preset.nameAr}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </SettingSection>

      {/* Code Editor Configuration */}
      <SettingSection
        title="Monaco Code Editor"
        description="Configure appearance, typography, and editing preferences for JSON, raw payloads, and scripts."
      >
        <SettingRow
          label="Font Size"
          description="Editor font size in pixels for request bodies, response viewer, and script editors."
        >
          <SettingSelect
            value={settings.monaco_font_size || "13"}
            onChange={(val) => onUpdate("monaco_font_size", val)}
            options={[
              { label: "12 px", value: "12" },
              { label: "13 px (Default)", value: "13" },
              { label: "14 px", value: "14" },
              { label: "15 px", value: "15" },
              { label: "16 px", value: "16" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Line Wrapping (Word Wrap)"
          description="Soft-wrap long lines of text to fit the viewport width without horizontal scrolling."
        >
          <SettingToggle
            checked={wordWrap}
            onChange={(checked) => onUpdate("monaco_word_wrap", checked ? "on" : "off")}
          />
        </SettingRow>

        <SettingRow
          label="Tab Indentation Size"
          description="Number of spaces inserted for each indentation level in JSON and code."
        >
          <SettingSelect
            value={settings.monaco_tab_size || "2"}
            onChange={(val) => onUpdate("monaco_tab_size", val)}
            options={[
              { label: "2 Spaces", value: "2" },
              { label: "4 Spaces", value: "4" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Code Minimap"
          description="Display a miniature outline overview along the right margin of the editor."
        >
          <SettingToggle
            checked={minimap}
            onChange={(checked) => onUpdate("monaco_minimap", String(checked))}
          />
        </SettingRow>

        <SettingRow
          label="Format JSON on Paste"
          description="Automatically prettify and format valid JSON when pasted into the request body editor."
        >
          <SettingToggle
            checked={formatOnPaste}
            onChange={(checked) => onUpdate("monaco_format_on_paste", String(checked))}
          />
        </SettingRow>
      </SettingSection>

      {/* Workspace & Tabs Behavior */}
      <SettingSection
        title="Workbench & Tabs Behavior"
        description="Customize the layout arrangement and tab lifecycle safety rules."
      >
        <SettingRow
          label="Request / Response Split Layout"
          description="Arrange request configuration and response inspector side-by-side or stacked vertically."
        >
          <SettingSelect
            value={settings.split_layout || "vertical"}
            onChange={(val) => onUpdate("split_layout", val)}
            options={[
              { label: "Stacked (Top / Bottom)", value: "vertical" },
              { label: "Side-by-Side (Left / Right)", value: "horizontal" },
            ]}
          />
        </SettingRow>

        <SettingRow
          label="Confirm Closing Unsaved Tabs"
          description="Prompt for confirmation before discarding tabs with unsaved edits to prevent accidental loss."
        >
          <SettingToggle
            checked={confirmCloseDirty}
            onChange={(checked) => onUpdate("confirm_close_dirty", String(checked))}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
