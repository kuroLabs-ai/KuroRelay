import React from "react";
import { Plus, Globe, Zap, Radio, Send, Sparkles, FolderKanban } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

export const WorkbenchEmptyState: React.FC = () => {
  const { openTab, toggleSidebar, sidebarOpen } = useAppStore();

  const handleOpenHttp = () => {
    openTab({ protocol: "http", method: "GET", name: "New Request", url: "https://httpbin.org/get" });
  };

  const handleOpenWs = () => {
    openTab({ protocol: "websocket", method: "WS", name: "WebSocket Echo", url: "wss://echo.websocket.events" });
  };

  const handleOpenGql = () => {
    openTab({ protocol: "graphql", method: "POST", name: "GraphQL Query", url: "https://countries.trevorblades.com/" });
  };

  const handleOpenSse = () => {
    openTab({ protocol: "sse", method: "SSE", name: "SSE Stream", url: "https://express-eventsource.herokuapp.com/events" });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[var(--bg-base)] p-6 select-none overflow-y-auto">
      <div className="max-w-lg w-full flex flex-col items-center text-center">
        {/* Glow Logo Badge */}
        <div className="relative mb-4 flex items-center justify-center">
          <div
            className="absolute -inset-2 rounded-full opacity-20 blur-lg"
            style={{ background: "var(--lime)" }}
          />
          <div
            className="relative w-14 h-14 rounded-2xl flex items-center justify-center border border-[var(--border)] shadow-xl"
            style={{ background: "var(--bg-s2)" }}
          >
            <Send size={24} className="text-[var(--lime)]" />
          </div>
        </div>

        {/* Title & Tagline */}
        <h2 className="text-base font-semibold text-[var(--tx-1)] tracking-tight mb-1">
          KuroRelay Workbench
        </h2>
        <p className="text-xs text-[var(--tx-3)] max-w-sm mb-6 leading-relaxed">
          No request is currently open. Select a saved request from Collections or start a new call below.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <button
            onClick={handleOpenHttp}
            className="flex items-center gap-2 px-3.5 py-2 rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus size={14} />
            <span>New HTTP Request</span>
          </button>

          <button
            onClick={handleOpenWs}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--amber)] hover:text-[var(--tx-1)] hover:border-[var(--amber)] text-xs font-medium transition-colors"
          >
            <Radio size={13} />
            <span>WebSocket</span>
          </button>

          <button
            onClick={handleOpenGql}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--ok)] hover:text-[var(--tx-1)] hover:border-[var(--ok)] text-xs font-medium transition-colors"
          >
            <Zap size={13} />
            <span>GraphQL</span>
          </button>

          <button
            onClick={handleOpenSse}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--info)] hover:text-[var(--tx-1)] hover:border-[var(--info)] text-xs font-medium transition-colors"
          >
            <Globe size={13} />
            <span>SSE Stream</span>
          </button>
        </div>

        {/* Shortcuts Cheat Sheet */}
        <div className="w-full bg-[var(--bg-s2)] border border-[var(--border-dim)] rounded-[var(--r-lg)] p-4 text-left shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-dim)]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--tx-2)]">
              <Sparkles size={12} className="text-[var(--lime)]" />
              <span>Keyboard Shortcuts</span>
            </div>
            {!sidebarOpen && (
              <button
                onClick={toggleSidebar}
                className="flex items-center gap-1 text-[10px] text-[var(--lime)] hover:underline"
              >
                <FolderKanban size={11} /> Open Sidebar
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center justify-between pr-2">
              <span className="text-[var(--tx-3)]">New Request</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-s4)] border border-[var(--border)] text-[10px] font-mono text-[var(--tx-2)]">
                Ctrl + N
              </kbd>
            </div>

            <div className="flex items-center justify-between pl-2">
              <span className="text-[var(--tx-3)]">Save Request</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-s4)] border border-[var(--border)] text-[10px] font-mono text-[var(--tx-2)]">
                Ctrl + S
              </kbd>
            </div>

            <div className="flex items-center justify-between pr-2">
              <span className="text-[var(--tx-3)]">Close Tab</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-s4)] border border-[var(--border)] text-[10px] font-mono text-[var(--tx-2)]">
                Ctrl + W
              </kbd>
            </div>

            <div className="flex items-center justify-between pl-2">
              <span className="text-[var(--tx-3)]">Send Request</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-s4)] border border-[var(--border)] text-[10px] font-mono text-[var(--tx-2)]">
                ↵ Enter
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
