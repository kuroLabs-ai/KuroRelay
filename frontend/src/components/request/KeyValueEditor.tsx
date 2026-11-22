import { useCallback, useId, useState } from "react";
import { Plus, X, List, AlignLeft } from "lucide-react";
import type { KVPair } from "../../bridge/client";
import { cn } from "../../lib/cn";
import { VariableInput } from "../ui/VariableInput";

export const COMMON_HTTP_HEADERS = [
  "Accept",
  "Accept-Charset",
  "Accept-Encoding",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Connection",
  "Content-Disposition",
  "Content-Encoding",
  "Content-Language",
  "Content-Length",
  "Content-Type",
  "Cookie",
  "Date",
  "ETag",
  "Expect",
  "Forwarded",
  "Host",
  "If-Match",
  "If-Modified-Since",
  "If-None-Match",
  "If-Range",
  "If-Unmodified-Since",
  "Origin",
  "Pragma",
  "Proxy-Authorization",
  "Range",
  "Referer",
  "Server",
  "Set-Cookie",
  "Strict-Transport-Security",
  "Transfer-Encoding",
  "Upgrade",
  "User-Agent",
  "Via",
  "Warning",
  "X-API-Key",
  "X-Forwarded-For",
  "X-Forwarded-Host",
  "X-Forwarded-Proto",
  "X-Real-IP",
  "X-Request-ID",
  "X-Requested-With",
];

function pairsToBulk(pairs: KVPair[]): string {
  return pairs
    .filter((p) => p.key || p.value)
    .map((p) => `${p.enabled ? "" : "//"}${p.key}: ${p.value}`)
    .join("\n");
}

function bulkToPairs(text: string): KVPair[] {
  const lines = text.split(/\r?\n/);
  const pairs: KVPair[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let enabled = true;
    let content = trimmed;
    if (content.startsWith("//") || content.startsWith("#")) {
      enabled = false;
      content = content.replace(/^(\/\/|#)+/, "").trim();
    }
    const colonIdx = content.indexOf(":");
    if (colonIdx !== -1) {
      const key = content.slice(0, colonIdx).trim();
      const value = content.slice(colonIdx + 1).trim();
      pairs.push({ key, value, enabled });
    } else {
      pairs.push({ key: content, value: "", enabled });
    }
  }
  return pairs.length > 0 ? pairs : [{ key: "", value: "", enabled: true }];
}

interface KeyValueEditorProps {
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
  keySuggestions?: string[];
}

export function KeyValueEditor({
  pairs = [],
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  disabled = false,
  keySuggestions,
}: KeyValueEditorProps) {
  const safePairs = Array.isArray(pairs) ? pairs : [];
  const datalistId = useId();
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const isHeaderEditor =
    keyPlaceholder.toLowerCase().includes("header") || (keySuggestions && keySuggestions.length > 0);
  const suggestions = keySuggestions || (isHeaderEditor ? COMMON_HTTP_HEADERS : []);

  const update = useCallback(
    (index: number, patch: Partial<KVPair>) => {
      const next = safePairs.map((p, i) => (i === index ? { ...p, ...patch } : p));
      onChange(next);
    },
    [safePairs, onChange],
  );

  const remove = useCallback(
    (index: number) => {
      onChange(safePairs.filter((_, i) => i !== index));
    },
    [safePairs, onChange],
  );

  const add = useCallback(() => {
    onChange([...safePairs, { key: "", value: "", enabled: true }]);
  }, [safePairs, onChange]);

  const cellCls =
    "flex-1 min-w-0 bg-transparent px-2 py-1.5 text-xs text-[var(--tx-1)] placeholder:text-[var(--tx-3)] outline-none";

  return (
    <div className="flex flex-col text-xs">
      {suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      {/* Mode Switcher Bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)] font-semibold">
          {isBulk ? "Raw Text (Bulk Edit)" : "Table"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (!isBulk) {
              setBulkText(pairsToBulk(safePairs));
              setIsBulk(true);
            } else {
              onChange(bulkToPairs(bulkText));
              setIsBulk(false);
            }
          }}
          className="flex items-center gap-1 text-[11px] text-[var(--tx-3)] hover:text-[var(--lime)] font-mono transition-colors cursor-pointer"
          title={isBulk ? "Switch back to key-value table" : "Paste or edit multiple rows as text"}
        >
          {isBulk ? (
            <>
              <List size={11} />
              <span>Key-Value Edit</span>
            </>
          ) : (
            <>
              <AlignLeft size={11} />
              <span>Bulk Edit</span>
            </>
          )}
        </button>
      </div>

      {isBulk ? (
        <div className="p-2 flex-1">
          <textarea
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              const next = bulkToPairs(e.target.value);
              onChange(next);
            }}
            placeholder={`key: value\n//disabled_key: value\nX-Custom-Header: 123`}
            rows={Math.max(6, safePairs.length + 2)}
            className="w-full bg-[var(--bg-s3)] text-xs font-mono text-[var(--tx-1)] p-2.5 rounded border border-[var(--border-dim)] outline-none focus:border-[var(--color-border-focus)] resize-y placeholder:text-[var(--tx-3)]"
          />
          <p className="text-[10px] text-[var(--tx-3)] mt-1 font-mono">
            Prefix a line with <span className="text-[var(--amber)]">//</span> to disable it.
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className="grid text-[10px] uppercase tracking-widest text-[var(--tx-3)] px-2 py-1 border-b border-[var(--border-dim)]"
            style={{ gridTemplateColumns: "24px 1fr 1fr 24px" }}
          >
            <span />
            <span>Key</span>
            <span>Value</span>
            <span />
          </div>

          {/* Rows */}
          {safePairs.map((pair, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)] group",
                !pair.enabled && "opacity-50",
              )}
              style={{ gridTemplateColumns: "24px 1fr 1fr 24px" }}
            >
              {/* Enabled checkbox */}
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={pair.enabled}
                  disabled={disabled}
                  onChange={(e) => update(i, { enabled: e.target.checked })}
                  className="accent-[var(--lime)] w-3 h-3 cursor-pointer"
                />
              </div>

              {/* Key with suggestions */}
              <input
                className={cellCls}
                placeholder={keyPlaceholder}
                value={pair.key}
                disabled={disabled}
                list={suggestions.length > 0 ? datalistId : undefined}
                onChange={(e) => update(i, { key: e.target.value })}
              />

              {/* Value with autocomplete */}
              <div className="flex-1 min-w-0 pr-1">
                <VariableInput
                  value={pair.value}
                  disabled={disabled}
                  onChange={(val) => update(i, { value: val })}
                  placeholder={valuePlaceholder}
                  className="bg-transparent border-0 hover:bg-[var(--bg-s3)] focus:bg-[var(--bg-s3)] rounded-none"
                />
              </div>

              {/* Delete */}
              <button
                className="flex items-center justify-center text-[var(--tx-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--err)] transition-all"
                onClick={() => remove(i)}
                disabled={disabled}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Add row */}
          <button
            onClick={add}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] transition-colors text-xs"
          >
            <Plus size={12} />
            Add
          </button>
        </>
      )}
    </div>
  );
}
