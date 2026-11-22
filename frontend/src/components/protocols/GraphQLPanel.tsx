import { useState, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Play,
  Loader2,
  Database,
  Sparkles,
  Copy,
  Check,
  BookOpen,
  Search,
  X,
} from "lucide-react";
import { bridge } from "../../bridge/client";
import { useAppStore } from "../../stores/appStore";

export function GraphQLPanel() {
  const { tabs, activeTabId, activeWorkspaceId } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const [url, setUrl] = useState(tab?.url || "https://countries.trevorblades.com/");
  const [query, setQuery] = useState(
    "query {\n  countries {\n    code\n    name\n    emoji\n  }\n}"
  );
  const [variables, setVariables] = useState("{}");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [introspecting, setIntrospecting] = useState(false);
  const [schemaData, setSchemaData] = useState<any | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [docsSearch, setDocsSearch] = useState("");
  const [copiedResponse, setCopiedResponse] = useState(false);

  useEffect(() => {
    if (tab?.url && tab.url !== url) {
      setUrl(tab.url);
    }
  }, [tab?.url]);

  const execute = async () => {
    const endpoint = tab?.url || url;
    if (!endpoint) return;
    setLoading(true);
    const start = performance.now();
    try {
      let parsedVars: Record<string, unknown> = {};
      try {
        parsedVars = JSON.parse(variables);
      } catch {
        /* ignore */
      }
      const res = await bridge.graphqlExecute({
        url: endpoint,
        query,
        variables: parsedVars,
      });
      const durationMs = Math.round(performance.now() - start);
      setResponse(JSON.stringify(res, null, 2));

      bridge.recordHistory({
        request_snapshot: {
          method: "GQL",
          url: endpoint,
          body: { query, variables: parsedVars },
          headers: { "Content-Type": "application/json" },
        },
        response_metadata: {
          status: "completed",
          status_code: 200,
          status_text: "OK",
          headers: { "content-type": "application/json" },
          body: res,
        },
        duration_ms: durationMs,
        workspace_id: activeWorkspaceId || undefined,
      }).catch(() => {});
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const errMsg = err instanceof Error ? err.message : String(err);
      setResponse(errMsg);
      bridge.recordHistory({
        request_snapshot: {
          method: "GQL",
          url: endpoint,
          body: { query },
          headers: { "Content-Type": "application/json" },
        },
        response_metadata: {
          status: "failed",
          status_code: 500,
          status_text: "Error",
          body: errMsg,
        },
        duration_ms: durationMs,
        workspace_id: activeWorkspaceId || undefined,
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const introspect = async () => {
    const endpoint = tab?.url || url;
    if (!endpoint) return;
    setIntrospecting(true);
    try {
      const res = (await bridge.graphqlIntrospect(endpoint)) as any;
      setResponse(JSON.stringify(res, null, 2));
      if (res && (res.data || res.__schema)) {
        setSchemaData(res.data?.__schema || res.__schema);
        setShowDocs(true);
      }
    } catch (err: unknown) {
      setResponse(err instanceof Error ? err.message : String(err));
    } finally {
      setIntrospecting(false);
    }
  };

  const handlePrettifyQuery = () => {
    if (!query.trim()) return;
    // Simple indentation beautifier for GraphQL queries
    const lines = query.split("\n");
    let indent = 0;
    const formatted = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith("}") || trimmed.startsWith("]")) indent = Math.max(0, indent - 1);
        const res = "  ".repeat(indent) + trimmed;
        if (trimmed.endsWith("{") || trimmed.endsWith("[")) indent += 1;
        return res;
      })
      .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
      .join("\n");
    setQuery(formatted);
  };

  const handlePrettifyVars = () => {
    try {
      const parsed = JSON.parse(variables);
      setVariables(JSON.stringify(parsed, null, 2));
    } catch {}
  };

  const handleCopyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 1500);
  };

  const typesList = (schemaData?.types || []).filter((t: any) => {
    if (!t.name || t.name.startsWith("__")) return false;
    if (docsSearch.trim()) {
      return t.name.toLowerCase().includes(docsSearch.toLowerCase());
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Control Actions Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold text-[var(--ok)] px-2 py-0.5 rounded bg-[var(--bg-s3)] border border-[var(--border)]">
            GQL Endpoint: {tab?.url || url}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {schemaData && (
            <button
              onClick={() => setShowDocs((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-sm)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--lime)] text-xs transition-colors cursor-pointer"
              title="Toggle Schema Documentation"
            >
              <BookOpen size={12} className={showDocs ? "text-[var(--lime)]" : ""} />
              <span>Docs {showDocs ? "Hide" : "Show"}</span>
            </button>
          )}

          <button
            onClick={introspect}
            disabled={introspecting || !(tab?.url || url)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-sm)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] text-xs disabled:opacity-50 transition-colors cursor-pointer"
            title="Introspect Schema"
          >
            {introspecting ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
            <span>Introspect</span>
          </button>
          <button
            onClick={execute}
            disabled={loading || !(tab?.url || url)}
            className="flex items-center gap-1.5 px-4 py-1 rounded-[var(--r-sm)] bg-[var(--ok)] text-black text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            <span>Run Query</span>
          </button>
        </div>
      </div>

      {/* Main Grid + Optional Docs Drawer */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Query & Variables */}
        <div className="flex flex-col flex-1 border-r border-[var(--border-dim)] min-w-0">
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s2)] font-semibold shrink-0">
            <span>Query</span>
            <button
              type="button"
              onClick={handlePrettifyQuery}
              className="flex items-center gap-1 text-[10px] text-[var(--tx-3)] hover:text-[var(--lime)] cursor-pointer"
              title="Prettify Query"
            >
              <Sparkles size={11} />
              <span>Format</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <CodeMirror
              value={query}
              height="100%"
              theme={oneDark}
              onChange={(val) => setQuery(val)}
              style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
            />
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-t border-b border-[var(--border-dim)] bg-[var(--bg-s2)] font-semibold shrink-0">
            <span>Variables (JSON)</span>
            <button
              type="button"
              onClick={handlePrettifyVars}
              className="flex items-center gap-1 text-[10px] text-[var(--tx-3)] hover:text-[var(--lime)] cursor-pointer"
              title="Format Variables JSON"
            >
              <Sparkles size={11} />
              <span>Format</span>
            </button>
          </div>
          <div className="h-32 min-h-0 overflow-auto">
            <CodeMirror
              value={variables}
              height="100%"
              theme={oneDark}
              extensions={[json()]}
              onChange={(val) => setVariables(val)}
              style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
            />
          </div>
        </div>

        {/* Right: Response */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s2)] font-semibold shrink-0">
            <span>Response</span>
            {response && (
              <button
                type="button"
                onClick={handleCopyResponse}
                className="flex items-center gap-1 text-[10px] text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
              >
                {copiedResponse ? <Check size={11} className="text-[var(--ok)]" /> : <Copy size={11} />}
                <span>{copiedResponse ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <CodeMirror
              value={response ?? "{\n  // Click 'Run Query' or 'Introspect' to see results\n}"}
              readOnly
              height="100%"
              theme={oneDark}
              extensions={[json()]}
              style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
            />
          </div>
        </div>

        {/* Optional Schema Docs Drawer */}
        {showDocs && schemaData && (
          <div className="w-64 border-l border-[var(--border-dim)] bg-[var(--bg-s1)] flex flex-col shrink-0">
            <div className="flex items-center justify-between p-2.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]">
              <span className="text-xs font-semibold text-[var(--tx-1)] flex items-center gap-1.5">
                <BookOpen size={13} className="text-[var(--lime)]" />
                Schema Types
              </span>
              <button
                type="button"
                onClick={() => setShowDocs(false)}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-2 border-b border-[var(--border-dim)]">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-s2)] rounded border border-[var(--border-dim)]">
                <Search size={11} className="text-[var(--tx-3)]" />
                <input
                  value={docsSearch}
                  onChange={(e) => setDocsSearch(e.target.value)}
                  placeholder="Filter types..."
                  className="bg-transparent border-0 text-[11px] text-[var(--tx-1)] outline-none w-full font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs font-mono">
              {typesList.map((t: any) => (
                <div
                  key={t.name}
                  className="p-2 rounded bg-[var(--bg-s2)] border border-[var(--border-dim)] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--lime)]">{t.name}</span>
                    <span className="text-[10px] text-[var(--tx-3)] uppercase">{t.kind}</span>
                  </div>
                  {t.description && (
                    <p className="text-[10px] text-[var(--tx-3)] font-sans">{t.description}</p>
                  )}
                  {t.fields && t.fields.length > 0 && (
                    <div className="text-[10px] text-[var(--tx-2)] pt-1 border-t border-[var(--border-dim)]/40">
                      {t.fields.slice(0, 5).map((f: any) => (
                        <div key={f.name} className="truncate">
                          • {f.name}
                        </div>
                      ))}
                      {t.fields.length > 5 && (
                        <span className="text-[9px] text-[var(--tx-3)]">+{t.fields.length - 5} more fields</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
