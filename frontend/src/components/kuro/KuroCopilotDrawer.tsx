import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Trash2,
  Settings,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Code2,
  Layers,
  Play,
  Copy,
  Check,
} from "lucide-react";
import { useKuroStore } from "../../stores/kuroStore";
import { useAppStore } from "../../stores/appStore";
import { KURO_PROVIDERS, type KuroToolCall, type KuroToolResult } from "../../kuro/engine/types";
import { cn } from "../../lib/cn";

export const KuroCopilotDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    setDrawerOpen,
    messages,
    sendMessage,
    clearMessages,
    agentStatus,
    activeToolName,
    config,
  } = useKuroStore();

  const { setActiveModule, setActiveSettingsTab } = useAppStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeProviderMeta = KURO_PROVIDERS[config.activeProvider];
  const activeModel = config.selectedModels[config.activeProvider] || "Default";

  // Auto-scroll on new message
  useEffect(() => {
    if (isDrawerOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isDrawerOpen, agentStatus]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isDrawerOpen]);

  // Global keyboard shortcut Ctrl+K to toggle drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawerOpen(!isDrawerOpen);
      }
      if (e.key === "Escape" && isDrawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, setDrawerOpen]);

  const handleSend = async () => {
    if (!input.trim() || agentStatus !== "idle") return;
    const text = input;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openKuroSettings = () => {
    setActiveModule("settings");
    setActiveSettingsTab("kuro" as any);
    setDrawerOpen(false);
  };

  if (!isDrawerOpen) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex flex-col w-[420px] max-w-[90vw] shadow-2xl transition-transform duration-200 ease-out border-l select-text"
      style={{
        background: "var(--color-surface-sidebar, #121417)",
        borderColor: "var(--color-border-subtle, #272a30)",
      }}
    >
      {/* ── 1. Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b select-none"
        style={{
          background: "var(--color-surface-panel, #181b20)",
          borderColor: "var(--color-border-subtle, #272a30)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-black shadow-md transition-all"
            style={{
              background: "var(--color-accent-lime, #a6e22e)",
              boxShadow: "0 0 14px rgba(166, 226, 46, 0.35)",
            }}
          >
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--color-text-primary,#fff)]">
                Kuro Copilot
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase",
                  agentStatus === "idle"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse"
                )}
              >
                {agentStatus === "idle"
                  ? "Ready"
                  : agentStatus === "thinking"
                  ? "Thinking..."
                  : `Tool: ${activeToolName || "running"}`}
              </span>
            </div>
            <div className="text-[11px] text-[var(--color-text-muted,#8b949e)] flex items-center gap-1.5">
              <span>{activeProviderMeta?.name}</span>
              <span>•</span>
              <span className="truncate max-w-[130px]">{activeModel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={openKuroSettings}
            title="Configure Kuro AI (API Keys & Models)"
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated,#22262e)] transition-colors"
          >
            <Settings size={15} />
          </button>
          <button
            onClick={clearMessages}
            title="Clear Chat History"
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated,#22262e)] transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={() => setDrawerOpen(false)}
            title="Close Drawer (Esc)"
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated,#22262e)] transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── 2. Quick Action Chips ── */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 border-b overflow-x-auto no-scrollbar shrink-0 text-xs"
        style={{
          background: "var(--color-surface-activity, #0f1115)",
          borderColor: "var(--color-border-subtle, #272a30)",
        }}
      >
        <button
          onClick={() => sendMessage("Create a new collection in SQLite named 'Auth & Users API' with a description and show it in the sidebar")}
          disabled={agentStatus !== "idle"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-surface-panel,#181b20)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)] transition-all shrink-0 cursor-pointer text-[11px]"
        >
          <Layers size={11} className="text-blue-400" />
          <span>📁 Create Collection</span>
        </button>

        <button
          onClick={() => sendMessage("Open a new request tab, set URL: https://httpbin.org/get with header Accept: application/json, and send it directly")}
          disabled={agentStatus !== "idle"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-surface-panel,#181b20)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)] transition-all shrink-0 cursor-pointer text-[11px]"
        >
          <Code2 size={11} className="text-purple-400" />
          <span>📝 Fill & Test httpbin.org</span>
        </button>

        <button
          onClick={() => sendMessage("Click Send on the active request in the editor and show me a clear summary of the response")}
          disabled={agentStatus !== "idle"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-surface-panel,#181b20)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)] transition-all shrink-0 cursor-pointer text-[11px]"
        >
          <Play size={11} className="text-emerald-400" />
          <span>⚡ Send Active Request</span>
        </button>

        <button
          onClick={() => sendMessage("Inspect the active tab and diagnose the response or error, and suggest an actionable fix")}
          disabled={agentStatus !== "idle"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-surface-panel,#181b20)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)] transition-all shrink-0 cursor-pointer text-[11px]"
        >
          <Sparkles size={11} className="text-[var(--color-accent-lime)]" />
          <span>🔍 Diagnose Request</span>
        </button>
      </div>

      {/* ── 3. Chat Messages Feed ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages
          .filter((m) => m.role !== "system" && m.role !== "tool")
          .map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col gap-1.5 text-xs leading-relaxed max-w-[92%]",
                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              {msg.role === "user" ? (
                <div
                  className="px-3 py-2 rounded-2xl rounded-tr-sm text-[var(--color-text-primary,#fff)] font-medium"
                  style={{
                    background: "var(--color-surface-elevated, #2a2f38)",
                    border: "1px solid var(--color-border-subtle, #363c46)",
                  }}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 w-full">
                  {/* Tool execution cards if any */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="flex flex-col gap-1.5 w-full my-1">
                      {msg.toolCalls.map((tc) => {
                        const toolResult = msg.toolResults?.find(
                          (r) => r.callId === tc.id || r.toolName === tc.name
                        );
                        return (
                          <ToolExecutionCard
                            key={tc.id}
                            call={tc}
                            result={toolResult}
                            isRunning={
                              agentStatus === "executing_tool" &&
                              activeToolName === tc.name &&
                              !toolResult
                            }
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Assistant response text */}
                  {msg.content && (
                    <div className="flex items-start gap-2 w-full">
                      <img
                        src="/logo.png"
                        alt="Kuro"
                        className="w-5 h-5 rounded-full object-cover shrink-0 mt-1 shadow-sm border border-[var(--color-accent-lime)]/30"
                      />
                      <div
                        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-[var(--color-text-primary,#e6edf3)] border"
                        style={{
                          background: "var(--color-surface-panel, #181b20)",
                          borderColor: "var(--color-border-subtle, #272a30)",
                        }}
                      >
                        <RenderFormattedContent content={msg.content} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

        {/* Live typing / thinking indicator */}
        {agentStatus !== "idle" && (
          <div
            className={cn(
              "flex items-center gap-2.5 text-xs py-2 px-3 rounded-xl border transition-all select-none",
              agentStatus === "executing_tool"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-[var(--color-surface-panel)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]"
            )}
          >
            <Loader2 size={14} className="animate-spin text-[var(--color-accent-lime)] shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {agentStatus === "thinking"
                  ? "Kuro is analyzing..."
                  : `Executing Tool: ${activeToolName}`}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {agentStatus === "thinking"
                  ? "Reading live screen state & building plan..."
                  : "Updating SQLite database & syncing UI components..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 4. Chat Input Box ── */}
      <div
        className="p-3 border-t shrink-0"
        style={{
          background: "var(--color-surface-panel, #181b20)",
          borderColor: "var(--color-border-subtle, #272a30)",
        }}
      >
        <div
          className="flex items-end gap-2 p-1.5 rounded-xl border transition-all focus-within:border-[var(--color-accent-lime)] focus-within:ring-1 focus-within:ring-[var(--color-accent-lime)]"
          style={{
            background: "var(--color-surface-activity, #0f1115)",
            borderColor: "var(--color-border-subtle, #272a30)",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Kuro to test, fix, or automate anything... (Enter to send)"
            rows={1}
            disabled={agentStatus !== "idle"}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] min-h-[34px] max-h-[120px] py-1 px-1.5 leading-relaxed"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || agentStatus !== "idle"}
            className={cn(
              "p-2 rounded-lg transition-all cursor-pointer shrink-0",
              input.trim() && agentStatus === "idle"
                ? "bg-[var(--color-accent-lime)] text-black hover:opacity-90 shadow-md"
                : "text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
            )}
          >
            <Send size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-[var(--color-text-muted)]">
          <span>Kuro has full UI & Bridge access</span>
          <span>Press <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] font-mono">Ctrl+K</kbd> to toggle</span>
        </div>
      </div>
    </aside>
  );
};

// ── Tool Execution Card Component ──
const ToolExecutionCard: React.FC<{
  call: KuroToolCall;
  result?: KuroToolResult;
  isRunning?: boolean;
}> = ({ call, result, isRunning }) => {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = result?.success;
  const isError = result && !result.success;

  return (
    <div
      className={cn(
        "rounded-lg border text-[11px] overflow-hidden transition-all",
        isRunning
          ? "border-amber-500/40 bg-amber-500/5"
          : isSuccess
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isError
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)]"
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left font-mono hover:bg-black/10 transition-colors"
      >
        <div className="flex items-center gap-2 truncate">
          {isRunning ? (
            <Loader2 size={12} className="animate-spin text-amber-400" />
          ) : isSuccess ? (
            <CheckCircle2 size={12} className="text-emerald-400" />
          ) : isError ? (
            <AlertCircle size={12} className="text-rose-400" />
          ) : (
            <Code2 size={12} className="text-[var(--color-text-muted)]" />
          )}
          <span className="font-semibold text-[var(--color-text-primary)] truncate">
            {call.name}
          </span>
          {result && (
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {result.durationMs}ms
            </span>
          )}
        </div>
        <div className="text-[var(--color-text-muted)] ml-2">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </button>

      {expanded && (
        <div className="p-2 border-t border-[var(--color-border-subtle)] bg-black/20 space-y-1.5 font-mono text-[10px]">
          <div>
            <span className="text-[var(--color-text-muted)] uppercase tracking-wider block text-[9px]">
              Arguments:
            </span>
            <pre className="p-1.5 rounded bg-black/30 overflow-x-auto text-[var(--color-text-secondary)]">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-[var(--color-text-muted)] uppercase tracking-wider block text-[9px]">
                {result.success ? "Result:" : "Error:"}
              </span>
              <pre
                className={cn(
                  "p-1.5 rounded bg-black/30 overflow-x-auto",
                  result.success ? "text-emerald-300" : "text-rose-300"
                )}
              >
                {result.success
                  ? JSON.stringify(result.result, null, 2)
                  : result.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Lightweight Formatted Markdown Renderer ──
const RenderFormattedContent: React.FC<{ content: string }> = ({ content }) => {
  // Simple code block splitter
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const lang = lines[0].trim();
          const code = (lang ? lines.slice(1) : lines).join("\n");
          return <CodeSnippetBlock key={index} code={code} language={lang} />;
        }

        return (
          <p key={index} className="whitespace-pre-wrap leading-relaxed">
            {part}
          </p>
        );
      })}
    </div>
  );
};

const CodeSnippetBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-black/40 overflow-hidden my-2 font-mono text-[11px]">
      <div className="flex items-center justify-between px-3 py-1 bg-white/5 border-b border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-muted)]">
        <span>{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[var(--color-text-primary)] transition-colors"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[var(--color-text-secondary)] font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  );
};
