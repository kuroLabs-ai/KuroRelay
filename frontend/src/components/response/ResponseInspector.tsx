import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { JsonView, allExpanded, defaultStyles } from "react-json-view-lite";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Clock,
  FileText,
  List,
  AlertCircle,
  Cookie,
  Copy,
  Download,
  Check,
  Send,
  Search,
  X,
  RotateCcw,
  WrapText,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn, formatBytes, formatMs } from "../../lib/cn";
import { useToast } from "../ui/Toast";

const HTTP_STATUS_PHRASES: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const TAB_CLS =
  "flex items-center gap-1.5 px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent data-[state=active]:border-[var(--color-accent-lime)] data-[state=active]:text-[var(--color-text-primary)] transition-colors outline-none cursor-pointer";

interface ResponseWrapper {
  status?: string;
  response?: {
    status_code?: number;
    status_text?: string;
    duration_ms?: number;
    size_bytes?: number;
    headers?: Record<string, string>;
    cookies?: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
      expires?: string;
      secure?: boolean;
      httpOnly?: boolean;
    }>;
    body?: { type?: string; data?: unknown; raw?: string } | unknown;
  };
  error?: { code?: string; message?: string } | string;
  status_code?: number;
  duration_ms?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

function parseCookies(headers: Record<string, string>, responseCookies?: any[]): ParsedCookie[] {
  if (responseCookies && Array.isArray(responseCookies) && responseCookies.length > 0) {
    return responseCookies.map((c) => ({
      name: c.name || "",
      value: c.value || "",
      domain: c.domain || "",
      path: c.path || "/",
      expires: c.expires || "",
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
    }));
  }

  // Find set-cookie in headers (case-insensitive)
  const setCookieKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === "set-cookie" || k.toLowerCase() === "set_cookie"
  );
  if (!setCookieKey || !headers[setCookieKey]) return [];

  const rawVal = headers[setCookieKey];
  // May contain multiple cookies separated by commas or linebreaks (taking care of expires date comma)
  const cookieStrings: string[] = [];
  const lines = rawVal.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) cookieStrings.push(line.trim());
  }

  const result: ParsedCookie[] = [];
  for (const cookieStr of cookieStrings) {
    const parts = cookieStr.split(";").map((p) => p.trim());
    if (parts.length === 0 || !parts[0]) continue;

    const [first, ...attrs] = parts;
    const eqIdx = first.indexOf("=");
    if (eqIdx === -1) continue;

    const name = first.substring(0, eqIdx).trim();
    const value = first.substring(eqIdx + 1).trim();

    let domain = "";
    let path = "/";
    let expires = "";
    let httpOnly = false;
    let secure = false;
    let sameSite = "";

    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower === "httponly") {
        httpOnly = true;
      } else if (lower === "secure") {
        secure = true;
      } else if (lower.startsWith("domain=")) {
        domain = attr.substring(7).trim();
      } else if (lower.startsWith("path=")) {
        path = attr.substring(5).trim();
      } else if (lower.startsWith("expires=")) {
        expires = attr.substring(8).trim();
      } else if (lower.startsWith("max-age=")) {
        expires = `${attr.substring(8).trim()}s`;
      } else if (lower.startsWith("samesite=")) {
        sameSite = attr.substring(9).trim();
      }
    }

    result.push({ name, value, domain, path, expires, httpOnly, secure, sameSite });
  }

  return result;
}

export function ResponseInspector() {
  const { tabs, activeTabId, updateTab, requestSplitPct, setRequestSplitPct, setActiveModule } = useAppStore();
  const { toast } = useToast();
  const tab = tabs.find((t) => t.id === activeTabId);

  if (!tab) return null;

  if (tab.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2.5">
        <div className="w-5 h-5 border-2 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[var(--tx-3)] font-mono">Executing request…</span>
      </div>
    );
  }

  if (!tab.response) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2.5 text-[var(--tx-3)]">
        <FileText size={30} strokeWidth={1} />
        <div className="text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">No response yet</p>
          <p className="mt-1 text-[11px]">Send this request to inspect its status, body, and headers.</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("kurorelay:send-request"))}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-lime)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
        >
          <Send size={11} />
          <span>Send request</span>
          <kbd className="ml-1 font-mono text-[9px] text-[var(--color-text-muted)]">Ctrl+Enter</kbd>
        </button>
      </div>
    );
  }

  const r = tab.response as ResponseWrapper;

  // Error check
  const errorObj = r.error;
  if (errorObj) {
    const errorMsg =
      typeof errorObj === "object"
        ? errorObj.message || errorObj.code || JSON.stringify(errorObj)
        : String(errorObj);

    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
        <AlertCircle size={28} className="text-[var(--err)]" />
        <span className="text-[var(--err)] text-sm font-semibold">Request Failed</span>
        <p className="text-xs text-[var(--tx-2)] max-w-md font-mono bg-[var(--bg-s3)] border border-[var(--border)] p-3 rounded">
          {errorMsg}
        </p>
      </div>
    );
  }

  const statusCode = r.response?.status_code ?? r.status_code ?? 0;
  const statusText = r.response?.status_text ?? "";
  const displayStatusText = statusText || HTTP_STATUS_PHRASES[statusCode] || "";
  const duration = r.response?.duration_ms ?? r.duration_ms ?? 0;
  const size = r.response?.size_bytes ?? 0;
  const headers = r.response?.headers ?? r.headers ?? {};
  const cookies = parseCookies(headers, r.response?.cookies);

  // Extract body
  const rawBodyObj = r.response?.body ?? r.body;
  const body =
    rawBodyObj && typeof rawBodyObj === "object" && "data" in (rawBodyObj as Record<string, unknown>)
      ? (rawBodyObj as { data: unknown }).data
      : rawBodyObj;

  const isMaximizedResponse = requestSplitPct <= 25;

  const handleToggleMaximizeResponse = () => {
    setRequestSplitPct(isMaximizedResponse ? 50 : 20);
  };

  const handleCreateMockRoute = () => {
    try {
      let path = "/api/mock";
      try {
        const u = new URL(tab.url.startsWith("http") ? tab.url : `http://${tab.url}`);
        path = u.pathname || "/api/mock";
      } catch {}

      const stringifiedBody =
        typeof body === "string" ? body : JSON.stringify(body, null, 2);

      const state = useAppStore.getState();
      const currentRoutes = state.mockRoutes || [];
      const newRoute = {
        id: crypto.randomUUID(),
        protocol: "rest" as const,
        method: tab.method || "GET",
        path,
        status_code: statusCode || 200,
        headers_json: JSON.stringify({ "Content-Type": "application/json" }, null, 2),
        body: stringifiedBody || '{"status": "ok"}',
        events_json: "[]",
        messages_json: "[]",
        echo_messages: false,
        delay_ms: 0,
        enabled: true,
      };

      state.setMockRoutes([...currentRoutes, newRoute]);

      toast(`Mock route created for ${tab.method} ${path}`, "success");
      setActiveModule("mock");
    } catch {
      toast("Could not create mock route", "error");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status Bar */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-[var(--color-border-subtle)] shrink-0 bg-[var(--color-surface-base)]">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-bold font-mono px-2 py-0.5 rounded-[var(--r-sm)] border",
              statusCode >= 200 && statusCode < 300
                ? "bg-[var(--color-status-success-dim)] text-[var(--color-status-success)] border-[#22c55e]/30"
                : statusCode >= 300 && statusCode < 400
                ? "bg-[#f59e0b]/15 text-[var(--color-status-warning)] border-[#f59e0b]/30"
                : "bg-[var(--color-status-error-dim)] text-[var(--color-status-error)] border-[#ef4444]/30"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{statusCode}</span>
            {displayStatusText && <span className="font-semibold">{displayStatusText}</span>}
          </span>
        </div>

        <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)] font-mono bg-[var(--color-surface-panel)] border border-[var(--color-border-subtle)] px-2 py-0.5 rounded-[var(--r-sm)]">
          <Clock size={11} className="text-[var(--color-accent-lime)]" />
          {formatMs(duration)}
        </span>

        {size > 0 && (
          <span className="text-xs text-[var(--color-text-secondary)] font-mono bg-[var(--color-surface-panel)] border border-[var(--color-border-subtle)] px-2 py-0.5 rounded-[var(--r-sm)]">
            📦 {formatBytes(size)}
          </span>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={handleCreateMockRoute}
            className="flex items-center gap-1 text-[11px] text-[var(--tx-3)] hover:text-[var(--lime)] px-2 py-0.5 rounded-[var(--r-sm)] hover:bg-[var(--bg-s2)] border border-transparent hover:border-[var(--border-dim)] transition-colors cursor-pointer"
            title="Create mock endpoint from this response"
          >
            <Sparkles size={11} className="text-[var(--lime)]" />
            <span className="hidden sm:inline">Mock Route</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMaximizeResponse}
            className="p-1 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s2)] transition-colors cursor-pointer"
            title={isMaximizedResponse ? "Restore Height (50%)" : "Maximize Response Panel"}
          >
            {isMaximizedResponse ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          <button
            type="button"
            onClick={() => updateTab(tab.id, { response: undefined })}
            className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] px-2 py-0.5 rounded-[var(--r-sm)] hover:bg-[var(--color-surface-panel)] transition-colors cursor-pointer"
            title="Clear response"
          >
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="body" className="flex flex-col flex-1 min-h-0">
        <Tabs.List
          className="flex border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0"
          style={{ paddingLeft: 8 }}
        >
          <Tabs.Trigger value="body" className={TAB_CLS}>
            <FileText size={12} /> Body
          </Tabs.Trigger>
          <Tabs.Trigger value="headers" className={TAB_CLS}>
            <List size={12} /> Headers
            {Object.keys(headers).length > 0 && (
              <span className="text-[10px] text-[var(--tx-3)] ml-0.5">
                ({Object.keys(headers).length})
              </span>
            )}
          </Tabs.Trigger>
          <Tabs.Trigger value="cookies" className={TAB_CLS}>
            <Cookie size={12} /> Cookies
            {cookies.length > 0 && (
              <span className="text-[10px] text-[var(--lime)] font-mono font-semibold ml-0.5">
                ({cookies.length})
              </span>
            )}
          </Tabs.Trigger>
        </Tabs.List>

        {/* Body tab */}
        <Tabs.Content value="body" className="flex-1 overflow-auto">
          <BodyPanel body={body} rawBodyObj={rawBodyObj} />
        </Tabs.Content>

        {/* Headers tab */}
        <Tabs.Content value="headers" className="flex-1 overflow-auto">
          <HeadersPanel headers={headers} />
        </Tabs.Content>

        {/* Cookies tab */}
        <Tabs.Content value="cookies" className="flex-1 overflow-auto">
          <CookiesPanel cookies={cookies} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function BodyPanel({ body, rawBodyObj }: { body: unknown; rawBodyObj: unknown }) {
  // Detect image response from bridge (body wrapper has type="image")
  const imgBody = rawBodyObj && typeof rawBodyObj === "object" && (rawBodyObj as any).type === "image"
    ? (rawBodyObj as { type: "image"; data: string; mime_type?: string; size_bytes?: number; raw?: string })
    : null;

  const isImage = imgBody !== null;
  const imageDataUrl = imgBody?.data ?? null;
  const imageMime = imgBody?.mime_type ?? null;
  const imageSizeBytes = imgBody?.size_bytes ?? null;

  const [view, setView] = useState<"pretty" | "raw" | "preview">(isImage ? "preview" : "pretty");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isObj = typeof body === "object" && body !== null;
  const rawStr = isImage
    ? (imgBody?.raw ?? imageDataUrl ?? "")
    : typeof body === "string"
      ? body
      : JSON.stringify(body, null, 2) ?? "";

  const matchCount =
    searchQuery.trim() && rawStr
      ? (
          rawStr.match(
            new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
          ) || []
        ).length
      : 0;

  const handleCopy = () => {
    if (isImage && imageDataUrl) {
      navigator.clipboard.writeText(imageDataUrl);
    } else {
      if (!rawStr) return;
      navigator.clipboard.writeText(rawStr);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (isImage && imageDataUrl) {
      // Convert data URL to blob for download
      const ext = imageMime?.split("/")[1]?.split("+")[0] ?? "png";
      const filename = `response.${ext}`;
      try {
        // Try bridge save with data URL
        const res = await bridge.saveFile(imageDataUrl, filename, [
          `Image Files (*.${ext})`,
          "All Files (*.*)",
        ]);
        if (res && res.status === "ok") {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          return;
        }
        if (res && res.status === "cancelled") return;
      } catch {}
      // Fallback: download as data URL
      const a = document.createElement("a");
      a.href = imageDataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    if (!rawStr) return;
    const filename = isObj ? "response.json" : "response.txt";
    try {
      const res = await bridge.saveFile(rawStr, filename, [
        isObj ? "JSON Files (*.json)" : "Text Files (*.txt)",
        "All Files (*.*)",
      ]);
      if (res && res.status === "ok") {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return;
      }
      if (res && res.status === "cancelled") return;
    } catch {}

    const blob = new Blob([rawStr], {
      type: isObj ? "application/json" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* View switch & Action Toolbar */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-[var(--border-dim)] shrink-0 bg-[var(--bg-s2)]">
        <div className="flex items-center gap-1">
          {(["pretty", "raw", "preview"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 py-0.5 text-[10px] uppercase rounded-[var(--r-sm)] font-semibold tracking-wider transition-colors",
                view === v
                  ? "bg-[var(--color-surface-panel)] text-[var(--color-accent-lime)] border border-[var(--color-border-subtle)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {v === "preview" ? (isImage ? "Image Preview" : "Preview (HTML)") : v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {searchOpen ? (
            <div className="flex items-center gap-1 bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-1.5 py-0.5">
              <Search size={11} className="text-[var(--tx-3)] shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in body..."
                className="bg-transparent border-0 text-[11px] text-[var(--tx-1)] outline-none w-28 md:w-36 placeholder:text-[var(--tx-3)] font-mono"
              />
              {searchQuery && (
                <span className="text-[10px] text-[var(--tx-3)] font-mono px-1">
                  {matchCount} {matchCount === 1 ? "match" : "matches"}
                </span>
              )}
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchOpen(false);
                }}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s4)] transition-colors"
              title="Find in Response"
            >
              <Search size={11} />
              <span>Find</span>
            </button>
          )}

          {rawStr && (
            <>
              <button
                onClick={() => setWordWrap((p) => !p)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer",
                  wordWrap
                    ? "bg-[var(--bg-s4)] text-[var(--lime)] font-semibold"
                    : "text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s4)]"
                )}
                title="Toggle Word Wrap"
              >
                <WrapText size={11} />
                <span>Wrap</span>
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s4)] transition-colors"
                title="Copy Response Body"
              >
                {copied ? <Check size={11} className="text-[var(--ok)]" /> : <Copy size={11} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s4)] transition-colors"
                title="Download Response Body"
              >
                {saved ? <Check size={11} className="text-[var(--ok)]" /> : <Download size={11} />}
                <span>{saved ? "Saved" : "Save"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {view === "preview" ? (
        isImage ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-[var(--color-surface-base)] overflow-auto select-none">
            <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4 max-w-full max-h-[70vh] flex items-center justify-center shadow-lg">
              <img
                src={imageDataUrl || ""}
                alt="Response preview"
                className="max-w-full max-h-[60vh] object-contain rounded"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] font-mono bg-[var(--color-surface-panel)] px-3 py-1 rounded-[var(--r-sm)] border border-[var(--color-border-subtle)]">
              {imageMime && <span className="font-semibold text-[var(--color-accent-lime)]">{imageMime}</span>}
              {imageSizeBytes != null && imageSizeBytes > 0 && <span>• {formatBytes(imageSizeBytes)}</span>}
            </div>
          </div>
        ) : (
          <div className="flex-1 w-full h-full bg-white relative">
            <iframe
              title="HTML Response Preview"
              srcDoc={rawStr}
              sandbox="allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          </div>
        )
      ) : view === "pretty" && isObj ? (
        <div className={cn("flex-1 overflow-auto p-3 text-xs", wordWrap && "break-all")}>
          <JsonView
            data={body as object}
            shouldExpandNode={allExpanded}
            style={{
              ...defaultStyles,
              container: "font-mono text-xs",
            }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={rawStr}
            readOnly
            theme={oneDark}
            extensions={wordWrap ? [json(), EditorView.lineWrapping] : [json()]}
            style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

function HeadersPanel({ headers }: { headers: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");
  const entries = Object.entries(headers);

  const filteredEntries = filter.trim()
    ? entries.filter(
        ([k, v]) =>
          k.toLowerCase().includes(filter.toLowerCase()) ||
          v.toLowerCase().includes(filter.toLowerCase())
      )
    : entries;

  const handleCopyHeaders = () => {
    const text = entries.map(([k, v]) => `${k}: ${v}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-[var(--tx-3)]">
        No response headers
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--tx-3)] uppercase tracking-wider font-semibold">
            {filteredEntries.length}{" "}
            {filteredEntries.length === entries.length ? "Headers" : `of ${entries.length}`}
          </span>
          <div className="flex items-center gap-1 bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-1.5 py-0.5">
            <Search size={10} className="text-[var(--tx-3)] shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter headers..."
              className="bg-transparent border-0 text-[10px] text-[var(--tx-1)] outline-none w-24 md:w-36 placeholder:text-[var(--tx-3)] font-mono"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleCopyHeaders}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s4)] transition-colors shrink-0"
          title="Copy Headers"
        >
          {copied ? <Check size={11} className="text-[var(--ok)]" /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy Headers"}</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s3)]">
              <th className="text-left px-3 py-1.5 font-normal">Header</th>
              <th className="text-left px-3 py-1.5 font-normal">Value</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map(([k, v]) => (
              <tr key={k} className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)]">
                <td className="px-3 py-1.5 font-mono text-[var(--lime)] whitespace-nowrap">{k}</td>
                <td className="px-3 py-1.5 font-mono text-[var(--tx-2)] break-all">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CookiesPanel({ cookies }: { cookies: ParsedCookie[] }) {
  if (cookies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-36 gap-2 text-[var(--tx-3)] text-xs">
        <Cookie size={24} strokeWidth={1.5} />
        <span>No cookies returned by the server</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s2)]">
            <th className="text-left px-3 py-1.5 font-normal">Name</th>
            <th className="text-left px-3 py-1.5 font-normal">Value</th>
            <th className="text-left px-3 py-1.5 font-normal">Domain</th>
            <th className="text-left px-3 py-1.5 font-normal">Path</th>
            <th className="text-left px-3 py-1.5 font-normal">Expires / Max-Age</th>
            <th className="text-center px-3 py-1.5 font-normal">Flags</th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((c, idx) => (
            <tr
              key={`${c.name}-${idx}`}
              className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)]"
            >
              <td className="px-3 py-1.5 font-mono text-[var(--lime)] font-semibold whitespace-nowrap">
                {c.name}
              </td>
              <td className="px-3 py-1.5 font-mono text-[var(--tx-2)] max-w-xs truncate" title={c.value}>
                {c.value}
              </td>
              <td className="px-3 py-1.5 font-mono text-[var(--tx-3)] whitespace-nowrap">
                {c.domain || "—"}
              </td>
              <td className="px-3 py-1.5 font-mono text-[var(--tx-3)] whitespace-nowrap">
                {c.path || "/"}
              </td>
              <td className="px-3 py-1.5 font-mono text-[var(--tx-3)] whitespace-nowrap">
                {c.expires || "Session"}
              </td>
              <td className="px-3 py-1.5 text-center whitespace-nowrap">
                <div className="inline-flex items-center gap-1.5">
                  {c.httpOnly && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-[var(--amber-soft)] text-[var(--amber)] border border-[var(--amber)]"
                      title="HttpOnly: Not accessible via document.cookie"
                    >
                      HttpOnly
                    </span>
                  )}
                  {c.secure && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-[var(--lime-soft)] text-[var(--lime)] border border-[var(--lime)]"
                      title="Secure: HTTPS transmission only"
                    >
                      Secure
                    </span>
                  )}
                  {c.sameSite && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono text-[var(--tx-3)] border border-[var(--border)]"
                      title={`SameSite=${c.sameSite}`}
                    >
                      {c.sameSite}
                    </span>
                  )}
                  {!c.httpOnly && !c.secure && !c.sameSite && (
                    <span className="text-[10px] text-[var(--tx-3)]">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
