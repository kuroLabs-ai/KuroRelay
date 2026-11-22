import React, { useState } from "react";
import { X, Terminal, ArrowDownToLine, AlertCircle, CheckCircle2 } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { isCurlCommand, parseCurlCommand, type ParsedCurl } from "../../lib/curlParser";
import { cn } from "../../lib/cn";

interface ImportCurlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (parsed: ParsedCurl) => void;
}

export const ImportCurlModal: React.FC<ImportCurlModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [curlText, setCurlText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTextChange = (val: string) => {
    setCurlText(val);
    setError(null);
  };

  const trimmed = curlText.trim();
  const looksLikeCurl = isCurlCommand(trimmed);
  let previewParsed: ParsedCurl | null = null;
  if (looksLikeCurl) {
    try {
      previewParsed = parseCurlCommand(trimmed);
    } catch {
      previewParsed = null;
    }
  }

  const handleExecuteImport = () => {
    if (!trimmed) {
      setError("Please paste a cURL command first.");
      return;
    }

    if (!looksLikeCurl) {
      setError("Input does not appear to start with 'curl'.");
      return;
    }

    const parsed = parseCurlCommand(trimmed);
    if (!parsed) {
      setError("Failed to parse cURL command. Check syntax and URL.");
      return;
    }

    onImport(parsed);
    setCurlText("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none p-4">
      <div
        className="w-full max-w-2xl bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-[var(--lime)]" />
            <h3 className="text-xs font-semibold text-[var(--tx-1)]">Import cURL Command</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tip / Notice */}
        <div className="px-4 py-2 bg-[var(--bg-s3)] border-b border-[var(--border-dim)] flex items-center justify-between text-[11px] text-[var(--tx-3)] shrink-0">
          <span>Paste a cURL command from Chrome DevTools, Postman, or terminal.</span>
          <span className="font-mono text-[10px] text-[var(--tx-3)]">
            Tip: You can also paste directly into the URL bar
          </span>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto min-h-[180px] max-h-[300px]">
          <CodeMirror
            value={curlText}
            onChange={handleTextChange}
            theme={oneDark}
            placeholder={`curl -X POST https://api.example.com/v1/auth \\
  -H "Content-Type: application/json" \\
  -d '{"username": "admin"}'`}
            style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
          />
        </div>

        {/* Parsed Preview or Error */}
        {error && (
          <div className="px-4 py-2 bg-[var(--err)]/10 border-t border-[var(--err)]/30 flex items-center gap-2 text-xs text-[var(--err)]">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {previewParsed && !error && (
          <div className="px-4 py-2 bg-[var(--bg-s3)] border-t border-[var(--border-dim)] flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-[var(--lime)]">
              <CheckCircle2 size={13} />
              <span className="font-bold">{previewParsed.method}</span>
            </div>
            <span className="text-[var(--tx-2)] truncate max-w-[280px]">
              {previewParsed.url}
            </span>
            <span className="text-[var(--tx-3)] text-[11px]">
              Headers: {previewParsed.headers.length}
            </span>
            {previewParsed.body.type !== "none" && (
              <span className="text-[var(--tx-3)] text-[11px]">
                Body: {previewParsed.body.type}
              </span>
            )}
            {previewParsed.auth.type !== "none" && (
              <span className="text-[var(--amber)] text-[11px]">
                Auth: {previewParsed.auth.type}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-[var(--r-sm)] text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={!trimmed}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--r-md)] text-xs font-semibold transition-all cursor-pointer",
              trimmed
                ? "bg-[var(--lime)] text-[var(--bg-base)] hover:opacity-90"
                : "bg-[var(--bg-s4)] text-[var(--tx-3)] cursor-not-allowed opacity-50"
            )}
          >
            <ArrowDownToLine size={13} />
            <span>Import Request</span>
          </button>
        </div>
      </div>
    </div>
  );
};
