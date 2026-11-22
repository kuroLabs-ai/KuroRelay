import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { useDropdown } from "../../lib/useDropdown";
import { cn } from "../../lib/cn";
import { Braces, KeyRound, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

interface VariableInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  containerClassName?: string;
  placeholder?: string;
}

export const DYNAMIC_VARIABLES = [
  { key: "$guid", desc: "Random UUID v4", example: "e.g. 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" },
  { key: "$uuid", desc: "Random UUID v4", example: "e.g. 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" },
  { key: "$timestamp", desc: "Current Unix epoch timestamp (seconds)", example: "e.g. 1763309400" },
  { key: "$isoTimestamp", desc: "Current ISO-8601 UTC timestamp", example: "e.g. 2026-11-16T18:00:00Z" },
  { key: "$randomInt", desc: "Random integer between 1 and 1000", example: "e.g. 482" },
  { key: "$randomEmail", desc: "Random fake email address", example: "e.g. user_x9f2a@example.com" },
  { key: "$randomFirstName", desc: "Random first name", example: "e.g. Alex, Jordan, Sam" },
  { key: "$randomAlphaNumeric", desc: "Random 12-char alphanumeric string", example: "e.g. K9aF8mQ2x1Z0" },
];

export const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  className,
  containerClassName,
  placeholder,
  ...props
}) => {
  const { environmentVariables, globalVariables } = useAppStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const suggestionsDropdown = useDropdown({
    isOpen: showDropdown,
    onClose: () => setShowDropdown(false),
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        previewRef.current &&
        !previewRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowPreview(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const checkTrigger = useCallback(
    (text: string, pos: number) => {
      const textBefore = text.slice(0, pos);
      const match = textBefore.match(/\{\{([^}]*)$/);
      if (match) {
        setFilter(match[1].toLowerCase());
        setCursorPos(pos);
        setShowDropdown(true);
        setSelectedIndex(0);
      } else {
        setShowDropdown(false);
      }
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    const pos = e.target.selectionStart ?? newVal.length;
    onChange(newVal);
    checkTrigger(newVal, pos);
  };

  const handleSelect = (varKey: string) => {
    const pos =
      cursorPos !== null
        ? cursorPos
        : inputRef.current?.selectionStart ?? value.length;
    const textBefore = value.slice(0, pos);
    const textAfter = value.slice(pos);

    const triggerMatch = textBefore.match(/\{\{([^}]*)$/);

    let finalVal = "";
    let newPos = pos;

    if (triggerMatch) {
      const triggerStart = textBefore.length - triggerMatch[0].length;
      const beforeTrigger = textBefore.slice(0, triggerStart);
      const afterMatch = textAfter.match(/^\s*\}\}/);
      const remainder = afterMatch ? textAfter.slice(afterMatch[0].length) : textAfter;

      const inserted = `{{${varKey}}}`;
      finalVal = beforeTrigger + inserted + remainder;
      newPos = beforeTrigger.length + inserted.length;
    } else {
      const inserted = `{{${varKey}}}`;
      finalVal = textBefore + inserted + textAfter;
      newPos = pos + inserted.length;
    }

    onChange(finalVal);
    setShowDropdown(false);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  // Combine environment, global & dynamic variables with precedence
  const allVars = useMemo(() => {
    const envList = (environmentVariables || []).map((v) => ({ ...v, scope: "env" as const }));
    const globList = (globalVariables || []).map((v) => ({ ...v, scope: "global" as const }));
    const map = new Map<string, typeof envList[number] | typeof globList[number]>();
    for (const g of globList) {
      if (g.key) map.set(g.key, g);
    }
    for (const e of envList) {
      if (e.key) map.set(e.key, e);
    }
    const userVars = Array.from(map.values());

    const dynList = DYNAMIC_VARIABLES.map((d) => ({
      key: d.key,
      value: d.desc,
      scope: "dynamic" as const,
      is_enabled: true,
      is_secret: false,
    }));

    return [...userVars, ...dynList];
  }, [environmentVariables, globalVariables]);

  const filteredVars = useMemo(() => {
    return allVars.filter(
      (v) =>
        v &&
        v.key &&
        v.is_enabled !== false &&
        (!filter || v.key.toLowerCase().includes(filter))
    );
  }, [allVars, filter]);

  // Detected variables inside value for hover preview
  const detectedVars = useMemo(() => {
    const matches = Array.from(value.matchAll(/\{\{\s*([\$A-Za-z0-9_.-]+)\s*\}\}/g));
    if (matches.length === 0) return [];
    return matches.map((m) => {
      const key = m[1];
      const dynMatch = DYNAMIC_VARIABLES.find((d) => d.key.toLowerCase() === key.toLowerCase());
      if (dynMatch) {
        return {
          key,
          raw: m[0],
          found: true,
          value: dynMatch.desc,
          isSecret: false,
          scope: "dynamic" as const,
        };
      }

      const match = allVars.find((v) => v.key === key && v.is_enabled !== false);
      return {
        key,
        raw: m[0],
        found: Boolean(match),
        value: match?.value ?? "",
        isSecret: Boolean(match?.is_secret),
        scope: (match?.scope ?? "unresolved") as "env" | "global" | "dynamic" | "unresolved",
      };
    });
  }, [value, allVars]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && filteredVars.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredVars.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredVars.length) % filteredVars.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelect(filteredVars[selectedIndex].key);
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }
  };

  const hasUnresolved = detectedVars.some((v) => !v.found);

  return (
    <div
      ref={suggestionsDropdown.ref}
      onMouseEnter={suggestionsDropdown.onMouseEnter}
      onMouseLeave={suggestionsDropdown.onMouseLeave}
      className={cn("relative flex items-center w-full", containerClassName)}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "w-full bg-[var(--bg-s3)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--tx-1)] font-mono outline-none focus:border-[var(--color-border-focus)] transition-colors pr-14",
          hasUnresolved && "border-[var(--amber)]/50",
          className
        )}
        {...props}
      />

      {/* Right icons: Hover Preview Trigger & Insert Trigger */}
      <div className="absolute right-1.5 flex items-center gap-0.5">
        {detectedVars.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPreview((p) => !p)}
            onMouseEnter={() => setShowPreview(true)}
            className={cn(
              "p-1 rounded text-[10px] font-mono transition-colors flex items-center gap-1",
              hasUnresolved
                ? "text-[var(--err)] hover:bg-[var(--err)]/10"
                : "text-[var(--lime)] hover:bg-[var(--lime)]/10"
            )}
            title="Inspect variables in input"
          >
            {hasUnresolved ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setFilter("");
            setShowDropdown((p) => !p);
            if (inputRef.current) {
              setCursorPos(inputRef.current.selectionStart);
              inputRef.current.focus();
            }
          }}
          className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] transition-colors rounded"
          title="Variables (type {{ to suggest)"
        >
          <Braces size={12} />
        </button>
      </div>

      {/* Hover Preview Popover */}
      {showPreview && detectedVars.length > 0 && (
        <div
          ref={previewRef}
          onMouseLeave={() => setShowPreview(false)}
          className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-2xl p-2 min-w-[250px] max-w-[340px] text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--tx-3)] border-b border-[var(--border-dim)] pb-1 mb-1.5 flex items-center justify-between">
            <span>Detected Variables</span>
            <span className="font-mono text-[9px]">{detectedVars.length} found</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {detectedVars.map((v) => (
              <div
                key={v.key}
                className={cn(
                  "p-1.5 rounded-[var(--r-sm)] border text-xs flex flex-col gap-0.5 font-mono",
                  v.found
                    ? "bg-[var(--bg-s3)] border-[var(--border-dim)]"
                    : "bg-[var(--err)]/10 border-[var(--err)]/30 text-[var(--err)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--lime)]">
                    {`{{${v.key}}}`}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] px-1 py-0.2 rounded uppercase font-sans font-medium",
                      v.scope === "env" && "bg-[var(--lime)]/15 text-[var(--lime)]",
                      v.scope === "global" && "bg-cyan-500/15 text-cyan-400",
                      v.scope === "dynamic" && "bg-purple-500/15 text-purple-400 font-semibold",
                      v.scope === "unresolved" && "bg-[var(--err)]/20 text-[var(--err)]"
                    )}
                  >
                    {v.scope}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--tx-2)] truncate">
                  {v.found ? (
                    v.scope === "dynamic" ? (
                      <span className="flex items-center gap-1 text-purple-300 font-sans text-[10px]">
                        <Sparkles size={10} /> {v.value}
                      </span>
                    ) : v.isSecret ? (
                      <span className="flex items-center gap-1 text-[var(--amber)]">
                        <KeyRound size={10} /> ••••••••
                      </span>
                    ) : (
                      v.value || <span className="text-[var(--tx-3)] italic">empty</span>
                    )
                  ) : (
                    <span className="text-[var(--err)] font-sans text-[10px]">
                      ⚠️ Variable is unresolved in active environment!
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Autocomplete Dropdown */}
      {showDropdown && filteredVars.length > 0 && (
        <div
          className="absolute left-0 top-full mt-1 w-full max-h-56 overflow-y-auto z-50 bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-2xl py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[var(--tx-3)] tracking-wider border-b border-[var(--border-dim)] flex items-center justify-between">
            <span>Variables</span>
            <span className="font-mono text-[9px] text-[var(--tx-3)]">Tab / ↵ to insert</span>
          </div>
          {filteredVars.map((item, idx) => (
            <div
              key={item.key}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item.key);
              }}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors",
                idx === selectedIndex
                  ? "bg-[var(--bg-s4)] text-[var(--lime)]"
                  : "text-[var(--tx-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--tx-1)]"
              )}
            >
              <div className="flex items-center gap-2 font-mono text-xs min-w-0">
                <span className="text-[var(--amber)] shrink-0">{"{{"}</span>
                <span className="font-semibold truncate">{item.key}</span>
                <span className="text-[var(--amber)] shrink-0">{"}}"}</span>
                <span
                  className={cn(
                    "text-[8px] font-sans px-1 py-0.2 rounded font-medium shrink-0",
                    item.scope === "env" && "bg-[var(--lime)]/15 text-[var(--lime)]",
                    item.scope === "global" && "bg-cyan-500/15 text-cyan-400",
                    item.scope === "dynamic" && "bg-purple-500/20 text-purple-300 font-semibold"
                  )}
                >
                  {item.scope === "env" ? "Env" : item.scope === "global" ? "Global" : "Dynamic 🎲"}
                </span>
              </div>
              <div className="flex items-center gap-1 font-mono text-[11px] text-[var(--tx-3)] max-w-[160px] truncate ml-2">
                {item.scope === "dynamic" ? (
                  <span className="text-purple-300/80 font-sans text-[10px] truncate">{item.value}</span>
                ) : item.is_secret ? (
                  <span className="flex items-center gap-1 text-[var(--amber)] text-[10px]">
                    <KeyRound size={10} /> ••••••
                  </span>
                ) : (
                  <span>{item.value || '""'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
