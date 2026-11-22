import React, { useState } from "react";
import { X, Copy, Check, Code2 } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import type { Tab } from "../../stores/appStore";
import { generateSnippet, type CodeSnippetLang } from "../../lib/codeSnippetGenerator";
import { cn } from "../../lib/cn";

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tab: Tab | undefined;
}

const LANGUAGES: Array<{ id: CodeSnippetLang; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "fetch", label: "JavaScript (Fetch)" },
  { id: "python", label: "Python (Requests)" },
  { id: "axios", label: "Node.js (Axios)" },
];

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  tab,
}) => {
  const [selectedLang, setSelectedLang] = useState<CodeSnippetLang>("curl");
  const [copied, setCopied] = useState(false);

  if (!isOpen || !tab) return null;

  const code = generateSnippet(tab, selectedLang);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getExtension = () => {
    if (selectedLang === "fetch" || selectedLang === "axios") return [javascript()];
    return [];
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
            <Code2 size={16} className="text-[var(--lime)]" />
            <h3 className="text-xs font-semibold text-[var(--tx-1)]">Code Snippet</h3>
            <span className="text-[11px] text-[var(--tx-3)] font-mono truncate max-w-[200px]">
              {tab.method} {tab.name || tab.url}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0">
          {/* Language Tabs */}
          <div className="flex gap-1 p-0.5 bg-[var(--bg-s3)] rounded-[var(--r-sm)] border border-[var(--border-dim)]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => setSelectedLang(lang.id)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-[var(--r-sm)] transition-colors font-medium",
                  selectedLang === lang.id
                    ? "bg-[var(--bg-s5)] text-[var(--lime)] shadow-xs"
                    : "text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-[var(--r-sm)] bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--tx-1)] hover:text-[var(--lime)] hover:border-[var(--lime)] transition-colors"
          >
            {copied ? <Check size={12} className="text-[var(--ok)]" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        {/* Code View */}
        <div className="flex-1 overflow-auto min-h-[240px] text-xs">
          <CodeMirror
            value={code}
            readOnly
            theme={oneDark}
            extensions={getExtension()}
            style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
};
