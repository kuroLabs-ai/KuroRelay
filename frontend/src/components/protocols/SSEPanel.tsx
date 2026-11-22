import { useState, useRef, useEffect } from "react";
import {
  Radio,
  Square,
  Trash2,
  Globe,
  Search,
  Copy,
  Check,
  Pause,
  Play,
} from "lucide-react";
import { bridge } from "../../bridge/client";
import { useAppStore } from "../../stores/appStore";
import { cn } from "../../lib/cn";

interface SSEEvent {
  id: string;
  data: string;
  event?: string;
  time: string;
}

export function SSEPanel() {
  const { tabs, activeTabId, activeWorkspaceId } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const targetUrl = tab?.url || "https://express-eventsource.herokuapp.com/events";

  useEffect(() => {
    if (autoScroll) {
      eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll]);

  const connect = async () => {
    if (!targetUrl || connecting) return;
    setConnecting(true);
    const connectStart = performance.now();
    try {
      const res = (await bridge.sseConnect({ url: targetUrl })) as {
        connection_id?: string;
        session_id?: string;
      };
      const sId = res.session_id || res.connection_id;
      if (sId) {
        setConnectionId(sId);
        setConnected(true);
        bridge.recordHistory({
          request_snapshot: {
            method: "SSE",
            url: targetUrl,
            headers: { Accept: "text/event-stream" },
          },
          response_metadata: {
            status: "completed",
            status_code: 200,
            status_text: "OK",
            headers: { "content-type": "text/event-stream" },
            body: `Subscribed to SSE stream: ${targetUrl}`,
          },
          duration_ms: Math.round(performance.now() - connectStart),
          workspace_id: activeWorkspaceId || undefined,
        }).catch(() => {});
      }
    } catch (err: unknown) {
      console.error("SSE connection error", err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (connectionId) {
      try {
        await bridge.sseDisconnect(connectionId);
      } catch {
        /* ignore */
      }
    }
    setConnected(false);
    setConnectionId(null);
  };

  const handleCopyEvent = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  useEffect(() => {
    if (connected && connectionId) {
      pollRef.current = setInterval(async () => {
        try {
          const res = (await bridge.ssePoll(connectionId)) as {
            events?: { data: string; event?: string }[];
          };
          if (res?.events && res.events.length > 0) {
            const mapped = res.events.map((e) => ({
              id: crypto.randomUUID(),
              data: e.data,
              event: e.event,
              time: new Date().toLocaleTimeString(),
            }));
            setEvents((prev) => [...prev, ...mapped]);
          }
        } catch {
          /* ignore */
        }
      }, 1000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connected, connectionId]);

  // Unique event types
  const eventTypes = ["all", ...new Set(events.map((e) => e.event || "message"))];

  const filteredEvents = events.filter((e) => {
    const eType = e.event || "message";
    if (selectedEventType !== "all" && eType !== selectedEventType) return false;
    if (searchFilter.trim()) {
      return (
        e.data.toLowerCase().includes(searchFilter.toLowerCase()) ||
        eType.toLowerCase().includes(searchFilter.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top connect bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold text-[var(--info)] px-2 py-0.5 rounded bg-[var(--bg-s3)] border border-[var(--border)]">
            SSE Stream: {targetUrl}
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
            {connected ? "Listening to events" : connecting ? "Connecting…" : "Disconnected"}
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
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-[var(--r-sm)] bg-[var(--info)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Radio size={12} /> Listen
            </button>
          )}

          <button
            onClick={() => setAutoScroll((v) => !v)}
            title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            className={cn(
              "p-1 rounded transition-colors cursor-pointer",
              autoScroll ? "text-[var(--lime)]" : "text-[var(--tx-3)]"
            )}
          >
            {autoScroll ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <button
            onClick={() => setEvents([])}
            title="Clear events"
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors rounded hover:bg-[var(--bg-s3)] cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Filter and Event Type Toolbar */}
      <div className="flex items-center justify-between gap-3 px-3 py-1 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] text-xs shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {eventTypes.slice(0, 5).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedEventType(t)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0",
                selectedEventType === t
                  ? "bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30 font-semibold"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              )}
            >
              {t} {t === "all" ? `(${events.length})` : ""}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-[var(--bg-s2)] border border-[var(--border-dim)] rounded px-2 py-0.5">
          <Search size={11} className="text-[var(--tx-3)]" />
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search event data…"
            className="bg-transparent border-0 text-[11px] text-[var(--tx-1)] outline-none w-28 md:w-36 font-mono"
          />
        </div>
      </div>

      {/* Events stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 font-mono text-xs bg-[var(--bg-base)]">
        {filteredEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--tx-3)]">
            <Globe size={28} strokeWidth={1.5} />
            <p className="text-xs">
              {events.length === 0
                ? "No Server-Sent Events received yet."
                : "No events match current filter or search."}
            </p>
          </div>
        )}

        {filteredEvents.map((e) => {
          let prettyData = e.data;
          let isJson = false;
          try {
            const parsed = JSON.parse(e.data);
            prettyData = JSON.stringify(parsed, null, 2);
            isJson = true;
          } catch {}

          const eventName = e.event || "message";

          return (
            <div
              key={e.id}
              className="group p-2.5 rounded bg-[var(--bg-s2)] border border-[var(--border)] flex flex-col gap-1 hover:border-[var(--info)] transition-colors select-text"
            >
              <div className="flex items-center justify-between text-[10px] text-[var(--tx-3)]">
                <span className="text-[var(--info)] font-bold uppercase">{eventName}</span>
                <div className="flex items-center gap-2">
                  <span>{e.time}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyEvent(e.id, e.data)}
                    title="Copy payload"
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[var(--tx-1)] cursor-pointer transition-opacity"
                  >
                    {copiedId === e.id ? (
                      <Check size={11} className="text-[var(--ok)]" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>
              </div>
              <pre className="text-xs text-[var(--tx-1)] whitespace-pre-wrap break-all leading-relaxed font-mono">
                {isJson ? prettyData : e.data}
              </pre>
            </div>
          );
        })}
        <div ref={eventsEndRef} />
      </div>
    </div>
  );
}
