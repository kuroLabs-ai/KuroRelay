import { useState, useRef, useEffect } from "react";
import {
  Radio,
  Send,
  Square,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { bridge } from "../../bridge/client";
import { useAppStore } from "../../stores/appStore";
import { cn } from "../../lib/cn";

interface WSMessage {
  id: string;
  type: "sent" | "received" | "status";
  data: string;
  time: string;
}

const WS_PRESETS = [
  { label: "Ping", text: '{"type": "ping"}' },
  { label: "Subscribe", text: '{"action": "subscribe", "channel": "events"}' },
  { label: "Echo Hello", text: '{"message": "hello world"}' },
];

export function WebSocketPanel() {
  const { tabs, activeTabId, activeWorkspaceId } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [filterType, setFilterType] = useState<"all" | "sent" | "received">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const targetUrl = tab?.url || "wss://echo.websocket.events";

  const addMsg = (type: WSMessage["type"], data: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type,
        data,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connect = async () => {
    if (!targetUrl || connecting) return;
    setConnecting(true);
    const connectStart = performance.now();
    try {
      const res = (await bridge.websocketConnect({ url: targetUrl })) as {
        connection_id?: string;
        session_id?: string;
      };
      const sId = res.session_id || res.connection_id;
      if (sId) {
        setConnectionId(sId);
        setConnected(true);
        addMsg("status", `Connected to ${targetUrl}`);
        bridge.recordHistory({
          request_snapshot: {
            method: "WS",
            url: targetUrl,
            headers: { Upgrade: "websocket", Connection: "Upgrade" },
          },
          response_metadata: {
            status: "completed",
            status_code: 101,
            status_text: "Switching Protocols",
            body: `Connected to WebSocket: ${targetUrl}`,
          },
          duration_ms: Math.round(performance.now() - connectStart),
          workspace_id: activeWorkspaceId || undefined,
        }).catch(() => {});
      } else {
        addMsg("status", `Connection failed: ${JSON.stringify(res)}`);
      }
    } catch (err: unknown) {
      addMsg("status", `Connection error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (connectionId) {
      try {
        await bridge.websocketDisconnect(connectionId);
      } catch {
        /* ignore */
      }
    }
    setConnected(false);
    setConnectionId(null);
    addMsg("status", "Disconnected from server");
  };

  const send = async () => {
    if (!message.trim() || !connectionId) return;
    const sentMsg = message;
    const sendStart = performance.now();
    try {
      await bridge.websocketSend({ connection_id: connectionId, message: sentMsg });
      addMsg("sent", sentMsg);
      setMessage("");
      bridge.recordHistory({
        request_snapshot: {
          method: "WS",
          url: targetUrl,
          body: sentMsg,
        },
        response_metadata: {
          status: "completed",
          status_code: 200,
          status_text: "Frame Sent",
          body: sentMsg,
        },
        duration_ms: Math.round(performance.now() - sendStart),
        workspace_id: activeWorkspaceId || undefined,
      }).catch(() => {});
    } catch (err: unknown) {
      addMsg("status", `Send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopyMsg = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  useEffect(() => {
    if (connected && connectionId) {
      pollRef.current = setInterval(async () => {
        try {
          const res = (await bridge.websocketPoll(connectionId)) as {
            messages?: Array<{ data?: string; direction?: string } | string>;
          };
          if (res?.messages && res.messages.length > 0) {
            res.messages.forEach((m) => {
              const text = typeof m === "string" ? m : m.data || "";
              const dir = typeof m === "object" && m.direction === "sent" ? "sent" : "received";
              if (text && dir === "received") {
                addMsg("received", text);
              }
            });
          }
        } catch {
          /* ignore */
        }
      }, 800);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connected, connectionId]);

  const filteredMessages = messages.filter((m) => {
    if (filterType !== "all" && m.type !== filterType && m.type !== "status") return false;
    if (searchQuery.trim()) {
      return m.data.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const sentCount = messages.filter((m) => m.type === "sent").length;
  const receivedCount = messages.filter((m) => m.type === "received").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Connection Bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold text-[var(--amber)] px-2 py-0.5 rounded bg-[var(--bg-s3)] border border-[var(--border)]">
            WS Target: {targetUrl}
          </span>
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              connected
                ? "bg-[var(--ok)] animate-pulse"
                : connecting
                ? "bg-[var(--warn)]"
                : "bg-[var(--tx-3)]"
            )}
          />
          <span className="text-xs text-[var(--tx-2)]">
            {connected ? "Connected" : connecting ? "Connecting…" : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-sm)] bg-[var(--err)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Square size={11} /> Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connecting || !targetUrl}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-[var(--r-sm)] bg-[var(--amber)] text-black text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Radio size={12} /> Connect
            </button>
          )}

          <button
            onClick={() => setMessages([])}
            title="Clear message logs"
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors rounded hover:bg-[var(--bg-s3)] cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-1 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] text-xs shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-s3)] rounded border border-[var(--border-dim)]">
          {(["all", "sent", "received"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterType(mode)}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded capitalize transition-colors cursor-pointer",
                filterType === mode
                  ? "bg-[var(--bg-s1)] text-[var(--lime)] font-semibold shadow-sm"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              )}
            >
              {mode === "all"
                ? `All (${messages.length})`
                : mode === "sent"
                ? `Sent (${sentCount})`
                : `Received (${receivedCount})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-[var(--bg-s2)] border border-[var(--border-dim)] rounded px-2 py-0.5">
          <Search size={11} className="text-[var(--tx-3)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search frames…"
            className="bg-transparent border-0 text-[11px] text-[var(--tx-1)] outline-none w-28 md:w-40 font-mono"
          />
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 font-mono text-xs bg-[var(--bg-base)]">
        {filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--tx-3)]">
            <Radio size={28} strokeWidth={1.5} />
            <p className="text-xs">
              {messages.length === 0
                ? "No WebSocket frames yet. Connect and send a message."
                : "No frames match the active filter or search."}
            </p>
          </div>
        )}

        {filteredMessages.map((m) => {
          let prettyData = m.data;
          let isJson = false;
          try {
            const parsed = JSON.parse(m.data);
            prettyData = JSON.stringify(parsed, null, 2);
            isJson = true;
          } catch {}

          return (
            <div
              key={m.id}
              className={cn(
                "group relative flex flex-col rounded p-2.5 border text-xs max-w-xl transition-all",
                m.type === "sent"
                  ? "ml-auto bg-[var(--bg-s3)] border-[var(--border)] text-[var(--tx-1)]"
                  : m.type === "received"
                  ? "mr-auto bg-[var(--bg-s2)] border-[var(--lime-mid)] text-[var(--lime)]"
                  : "mx-auto bg-[var(--bg-s1)] border-[var(--border-dim)] text-[var(--tx-3)] text-center text-[11px]"
              )}
            >
              <div className="flex items-center justify-between gap-4 text-[10px] text-[var(--tx-3)] mb-1">
                <span className="flex items-center gap-1 uppercase font-bold">
                  {m.type === "sent" && <ArrowUpRight size={10} className="text-[var(--amber)]" />}
                  {m.type === "received" && <ArrowDownLeft size={10} className="text-[var(--lime)]" />}
                  {m.type}
                </span>
                <div className="flex items-center gap-2">
                  <span>{m.time}</span>
                  {m.type !== "status" && (
                    <button
                      type="button"
                      onClick={() => handleCopyMsg(m.id, m.data)}
                      title="Copy frame data"
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[var(--tx-1)] cursor-pointer transition-opacity"
                    >
                      {copiedId === m.id ? (
                        <Check size={11} className="text-[var(--ok)]" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono leading-relaxed select-text">
                {isJson ? prettyData : m.data}
              </pre>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Presets Bar */}
      <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-s2)] border-t border-[var(--border-dim)] text-[11px] overflow-x-auto shrink-0">
        <span className="text-[10px] text-[var(--tx-3)] uppercase font-semibold flex items-center gap-1 shrink-0">
          <Sparkles size={11} className="text-[var(--amber)]" />
          Presets:
        </span>
        {WS_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setMessage(p.text)}
            className="px-2 py-0.5 rounded bg-[var(--bg-s3)] hover:bg-[var(--bg-s1)] text-[var(--tx-2)] hover:text-[var(--tx-1)] border border-[var(--border-dim)] transition-colors shrink-0 cursor-pointer font-mono text-[10px]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Message Input */}
      <div className="flex items-center gap-2 p-2.5 border-t border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
        <input
          disabled={!connected}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={connected ? "Type message to send over WebSocket (↵ to send)..." : "Connect to WebSocket server first"}
          className="flex-1 bg-[var(--bg-s3)] border border-[var(--border)] rounded px-3 py-1.5 text-xs text-[var(--tx-1)] font-mono outline-none focus:border-[var(--lime)] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!connected || !message.trim()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[var(--lime)] text-black text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shrink-0 cursor-pointer"
        >
          <Send size={12} />
          Send
        </button>
      </div>
    </div>
  );
}
