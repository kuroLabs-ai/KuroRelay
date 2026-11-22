import { useState, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Sparkles,
  AlertCircle,
  Plus,
  Paperclip,
  X,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { KeyValueEditor } from "./KeyValueEditor";
import { useAppStore, type RequestOptions } from "../../stores/appStore";
import { cn, normalizeKVPairs, buildUrlWithParams } from "../../lib/cn";
import { extractPathVariables, syncPathVariables } from "../../lib/pathVariables";
import { VariableInput } from "../ui/VariableInput";
import { VariableChainingEditor } from "./VariableChainingEditor";
import { bridge, type RequestAuth, type RequestBody, type KVPair } from "../../bridge/client";
import { parseCollectionMetadata } from "../../lib/collectionMetadata";

const TAB_CLS =
  "px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent data-[state=active]:border-[var(--color-accent-lime)] data-[state=active]:text-[var(--color-text-primary)] transition-colors outline-none cursor-pointer";

const bodyTypes = ["none", "json", "raw", "form", "multipart"] as const;
const authTypes = ["inherit", "none", "bearer", "basic", "api_key"] as const;

export function RequestConfigTabs() {
  const { tabs, activeTabId, updateTab, collections, selectedCollectionId } = useAppStore();
  const tab = tabs.find((t) => t.id === activeTabId);
  const [showAutoHeaders, setShowAutoHeaders] = useState(false);

  if (!tab) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--tx-3)] text-xs">
        No active request
      </div>
    );
  }

  const params = Array.isArray(tab.params) ? tab.params : [];
  const headers = Array.isArray(tab.headers) ? tab.headers : [];
  const paramsCount  = params.filter((p)  => p && p.key).length;
  const headersCount = headers.filter((h) => h && h.key).length;
  const auth = tab.auth || { type: "inherit" as any };
  const body = tab.body || { type: "none" };

  const extractedPathKeys = extractPathVariables(tab.url);
  const currentPathVars = syncPathVariables(extractedPathKeys, tab.pathVariables || []);

  const parentCol = collections.find(
    (c) => c.id === tab.collectionId || c.id === selectedCollectionId
  );
  const colMeta = parentCol ? parseCollectionMetadata(parentCol.description) : null;

  const hostVal = (() => {
    try {
      const u = new URL(tab.url.startsWith("http") ? tab.url : `http://${tab.url}`);
      return u.host || "example.com";
    } catch {
      return "localhost";
    }
  })();

  const autoHeaders: Array<{ key: string; value: string; desc: string }> = [
    { key: "User-Agent", value: "KuroRelay/2.0", desc: "Default client identification" },
    { key: "Accept", value: "*/*", desc: "Accepts any response representation" },
    { key: "Host", value: hostVal, desc: "Derived automatically from destination URL" },
    ...(body.type === "json"
      ? [{ key: "Content-Type", value: "application/json", desc: "Automatically injected for JSON payload" }]
      : body.type === "form"
      ? [{ key: "Content-Type", value: "application/x-www-form-urlencoded", desc: "Automatically injected for URL-encoded form" }]
      : []),
  ];

  return (
    <Tabs.Root defaultValue="params" className="flex flex-col h-full">
      {/* Tab bar */}
      <Tabs.List
        className="flex border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0"
        style={{ paddingLeft: 8 }}
      >
        <Tabs.Trigger value="params" data-kuro-target="params-tab" className={TAB_CLS}>
          Params {(paramsCount > 0 || extractedPathKeys.length > 0) && (
            <sup className="text-[var(--lime)] ml-0.5">
              {paramsCount + extractedPathKeys.length}
            </sup>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger value="headers" data-kuro-target="headers-tab" className={TAB_CLS}>
          Headers {headersCount > 0 && <sup className="text-[var(--lime)] ml-0.5">{headersCount}</sup>}
        </Tabs.Trigger>
        <Tabs.Trigger value="auth" data-kuro-target="auth-tab" className={TAB_CLS}>Auth</Tabs.Trigger>
        <Tabs.Trigger value="body" data-kuro-target="body-tab" className={TAB_CLS}>Body</Tabs.Trigger>
        <Tabs.Trigger value="chaining" className={TAB_CLS}>
          Auto Chaining {tab.extractions && tab.extractions.length > 0 && (
            <sup className="text-[var(--lime)] ml-0.5">{tab.extractions.length}</sup>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger value="options" className={TAB_CLS}>Options</Tabs.Trigger>
      </Tabs.List>

      {/* Params */}
      <Tabs.Content value="params" className="flex-1 overflow-auto flex flex-col">
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] text-[11px] text-[var(--tx-3)] font-semibold shrink-0">
            <span className="text-[var(--tx-2)]">Query Parameters</span>
            {paramsCount > 0 && (
              <span className="font-mono text-[10px] text-[var(--lime)] bg-[var(--lime-soft)] px-1.5 py-0.5 rounded">
                {paramsCount} active
              </span>
            )}
          </div>
          <KeyValueEditor
            pairs={params}
            onChange={(pairs) => {
              const newUrl = buildUrlWithParams(tab.url, pairs);
              updateTab(tab.id, { params: pairs, url: newUrl, isDirty: true });
            }}
            keyPlaceholder="param"
            valuePlaceholder="value"
          />
        </div>

        {extractedPathKeys.length > 0 && (
          <div className="flex flex-col border-t border-[var(--border-dim)] mt-3">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] text-[11px] text-[var(--tx-3)] font-semibold shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--tx-2)]">Path Variables</span>
                <span className="font-mono text-[10px] text-[var(--amber)] bg-[var(--amber-soft)] px-1.5 py-0.5 rounded">
                  {extractedPathKeys.length} in URL
                </span>
              </div>
              <span className="text-[10px] text-[var(--tx-3)]">
                Auto-substituted on send
              </span>
            </div>
            <KeyValueEditor
              pairs={currentPathVars}
              onChange={(pairs) => {
                updateTab(tab.id, { pathVariables: pairs, isDirty: true });
              }}
              keyPlaceholder="variable"
              valuePlaceholder="value"
            />
          </div>
        )}
      </Tabs.Content>

      {/* Headers */}
      <Tabs.Content value="headers" className="flex-1 overflow-auto flex flex-col">
        <KeyValueEditor
          pairs={headers}
          onChange={(pairs) => updateTab(tab.id, { headers: pairs, isDirty: true })}
          keyPlaceholder="Header-Name"
          valuePlaceholder="value"
        />

        {/* Auto-generated / Calculated Headers section */}
        <div className="border-t border-[var(--border-dim)] bg-[var(--bg-s2)]/40 mt-auto">
          <button
            type="button"
            onClick={() => setShowAutoHeaders((v) => !v)}
            className="flex items-center justify-between w-full px-3 py-2 text-[11px] text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 font-medium">
              {showAutoHeaders ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Auto-Generated / Hidden Headers</span>
              <span className="font-mono text-[10px] px-1 rounded bg-[var(--bg-s3)] text-[var(--lime)] border border-[var(--border-dim)]">
                {autoHeaders.length}
              </span>
            </div>
            <span className="text-[10px] text-[var(--tx-3)]">Sent automatically by runtime</span>
          </button>

          {showAutoHeaders && (
            <div className="p-2 space-y-1 bg-[var(--bg-s1)] border-t border-[var(--border-dim)] text-xs">
              {autoHeaders.map((h) => (
                <div
                  key={h.key}
                  className="flex items-center justify-between px-2 py-1 rounded bg-[var(--bg-s2)] text-[11px] font-mono border border-[var(--border-dim)]/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--tx-2)] font-semibold">{h.key}:</span>
                    <span className="text-[var(--lime)] truncate max-w-[200px]">{h.value}</span>
                  </div>
                  <span className="text-[10px] text-[var(--tx-3)]">{h.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Tabs.Content>

      {/* Auth */}
      <Tabs.Content value="auth" className="flex-1 overflow-auto p-3">
        <AuthEditor
          auth={auth}
          onChange={(auth) => updateTab(tab.id, { auth, isDirty: true })}
          parentColName={parentCol?.name}
          colAuth={colMeta?.auth}
        />
      </Tabs.Content>

      {/* Body */}
      <Tabs.Content value="body" className="flex-1 overflow-auto flex flex-col">
        <BodyEditor
          body={body}
          onChange={(body) => updateTab(tab.id, { body, isDirty: true })}
        />
      </Tabs.Content>

      {/* Auto Chaining */}
      <Tabs.Content value="chaining" className="flex-1 overflow-auto flex flex-col">
        <VariableChainingEditor />
      </Tabs.Content>

      {/* Options */}
      <Tabs.Content value="options" className="flex-1 overflow-auto p-4">
        <OptionsEditor
          options={tab.options || {}}
          onChange={(options) => updateTab(tab.id, { options, isDirty: true })}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// ── Options editor ───────────────────────────────────────────────────────────
function OptionsEditor({
  options,
  onChange,
}: {
  options: RequestOptions;
  onChange: (opts: RequestOptions) => void;
}) {
  const verifySsl = options.verify_ssl ?? true;
  const followRedirects = options.follow_redirects ?? true;
  const timeoutMs = options.timeout_ms ?? 30000;
  const allowPrivate = options.allow_private_network ?? false;

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border-dim)]">
        <div>
          <div className="text-xs font-semibold text-[var(--tx-1)]">SSL / TLS Verification</div>
          <div className="text-[11px] text-[var(--tx-3)]">
            Verify certificates for HTTPS connections. Disable for self-signed certificates.
          </div>
        </div>
        <input
          type="checkbox"
          checked={verifySsl}
          onChange={(e) => onChange({ ...options, verify_ssl: e.target.checked })}
          className="accent-[var(--lime)] w-4 h-4 cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border-dim)]">
        <div>
          <div className="text-xs font-semibold text-[var(--tx-1)]">Follow Redirects</div>
          <div className="text-[11px] text-[var(--tx-3)]">
            Automatically follow HTTP 3xx redirects.
          </div>
        </div>
        <input
          type="checkbox"
          checked={followRedirects}
          onChange={(e) => onChange({ ...options, follow_redirects: e.target.checked })}
          className="accent-[var(--lime)] w-4 h-4 cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between gap-4 p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border-dim)]">
        <div>
          <div className="text-xs font-semibold text-[var(--tx-1)]">Allow Private Networks & Localhost</div>
          <div className="text-[11px] text-[var(--tx-3)]">
            Permit sending requests to loopback (127.0.0.1) and internal network IPs.
          </div>
        </div>
        <input
          type="checkbox"
          checked={allowPrivate}
          onChange={(e) => onChange({ ...options, allow_private_network: e.target.checked })}
          className="accent-[var(--lime)] w-4 h-4 cursor-pointer"
        />
      </div>

      <div className="flex flex-col gap-1.5 p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border-dim)]">
        <div className="text-xs font-semibold text-[var(--tx-1)]">Request Timeout</div>
        <div className="text-[11px] text-[var(--tx-3)]">
          Maximum milliseconds to wait for a response before timing out (1 – 300,000 ms).
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number"
            min={100}
            max={300000}
            step={1000}
            value={timeoutMs}
            onChange={(e) => onChange({ ...options, timeout_ms: Number(e.target.value) || 30000 })}
            className="w-36 bg-[var(--bg-s3)] border border-[var(--border)] rounded px-2.5 py-1 text-xs text-[var(--tx-1)] font-mono outline-none focus:border-[var(--color-border-focus)]"
          />
          <span className="text-xs text-[var(--tx-3)] font-mono">ms ({(timeoutMs / 1000).toFixed(1)}s)</span>
        </div>
      </div>
    </div>
  );
}

// ── Auth editor ──────────────────────────────────────────────────────────────
function AuthEditor({
  auth,
  onChange,
  parentColName,
  colAuth,
}: {
  auth: RequestAuth;
  onChange: (a: RequestAuth) => void;
  parentColName?: string;
  colAuth?: any;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const inputCls =
    "w-full bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-sm)] px-2 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--color-border-focus)] transition-colors";

  const isInherit = auth.type === ("inherit" as any);
  const hasParentAuth = colAuth && colAuth.type && colAuth.type !== "none";

  return (
    <div className="flex flex-col gap-3 max-w-md">
      {/* Type picker */}
      <div className="flex gap-1 p-0.5 bg-[var(--bg-s3)] rounded-[var(--r-sm)] w-fit border border-[var(--border-dim)]">
        {authTypes.map((t) => (
          <button
            key={t}
            onClick={() => onChange({ type: t } as RequestAuth)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-[var(--r-sm)] transition-colors capitalize",
              auth.type === t
                ? "bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)] font-semibold"
                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            {t === "inherit"
              ? "Inherit Parent"
              : t === "api_key"
              ? "API Key"
              : t === "bearer"
              ? "Bearer"
              : t}
          </button>
        ))}
      </div>

      {isInherit && (
        <div className="p-3.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-s2)] space-y-2">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[var(--lime)]" />
            <span className="text-xs font-semibold text-[var(--tx-1)]">
              Inheriting Auth from {parentColName || "Collection"}
            </span>
          </div>
          {hasParentAuth ? (
            <div className="flex items-center gap-2 text-xs text-[var(--tx-2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              <span>Parent specifies:</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-[var(--bg-s3)] text-[var(--lime)] border border-[var(--border-dim)]">
                {colAuth.type}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--tx-3)]">
              No authentication is currently configured at the collection level. This request will be sent without credentials.
            </p>
          )}
        </div>
      )}

      {auth.type === "bearer" && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Bearer Token</span>
          <div className="relative flex items-center">
            <input
              type={showSecret ? "text" : "password"}
              className={`${inputCls} pr-8 font-mono`}
              placeholder="e.g. eyJhbGciOi..."
              value={(auth as { type: "bearer"; token: string }).token ?? ""}
              onChange={(e) => onChange({ type: "bearer", token: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2 text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
            >
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </label>
      )}

      {auth.type === "basic" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Username</span>
            <input
              className={inputCls}
              placeholder="username"
              value={(auth as { type: "basic"; username: string; password: string }).username ?? ""}
              onChange={(e) =>
                onChange({
                  ...auth,
                  username: e.target.value,
                } as RequestAuth)
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Password</span>
            <div className="relative flex items-center">
              <input
                type={showSecret ? "text" : "password"}
                className={`${inputCls} pr-8`}
                placeholder="password"
                value={(auth as { type: "basic"; username: string; password: string }).password ?? ""}
                onChange={(e) =>
                  onChange({
                    ...auth,
                    password: e.target.value,
                  } as RequestAuth)
                }
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
              >
                {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        </>
      )}

      {auth.type === "api_key" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Header name</span>
            <input
              className={inputCls}
              placeholder="X-API-Key"
              value={(auth as { type: "api_key"; key: string; value: string }).key ?? ""}
              onChange={(e) =>
                onChange({ ...auth, key: e.target.value } as RequestAuth)
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Value</span>
            <div className="relative flex items-center">
              <input
                type={showSecret ? "text" : "password"}
                className={`${inputCls} pr-8 font-mono`}
                placeholder="api key secret"
                value={(auth as { type: "api_key"; key: string; value: string }).value ?? ""}
                onChange={(e) =>
                  onChange({ ...auth, value: e.target.value } as RequestAuth)
                }
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 text-[var(--tx-3)] hover:text-[var(--tx-1)] cursor-pointer"
              >
                {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </label>
        </>
      )}

      {auth.type === "none" && (
        <p className="text-xs text-[var(--tx-3)]">No authentication will be attached to outgoing requests.</p>
      )}
    </div>
  );
}

function parseFormPairs(content?: string): KVPair[] {
  if (!content) return [{ key: "", value: "", enabled: true }];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const normalized = normalizeKVPairs(parsed);
      return normalized.length > 0 ? normalized : [{ key: "", value: "", enabled: true }];
    }
    if (typeof parsed === "object" && parsed !== null) {
      const pairs = Object.entries(parsed).map(([key, value]) => ({
        key,
        value: String(value ?? ""),
        enabled: true,
      }));
      return pairs.length > 0 ? pairs : [{ key: "", value: "", enabled: true }];
    }
  } catch {
    try {
      const params = new URLSearchParams(content);
      const pairs: KVPair[] = [];
      params.forEach((value, key) => pairs.push({ key, value, enabled: true }));
      if (pairs.length > 0) return pairs;
    } catch {}
  }
  return [{ key: "", value: "", enabled: true }];
}

interface MultipartItem {
  key: string;
  value: string;
  type: "text" | "file";
  enabled: boolean;
  filename?: string;
  fileData?: string;
  mimeType?: string;
}

function parseMultipartItems(content?: string): MultipartItem[] {
  if (!content) return [{ key: "", value: "", type: "text", enabled: true }];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const items = parsed.map((item) => ({
        key: String(item.key ?? ""),
        value: String(item.value ?? ""),
        type: (item.type === "file" ? "file" : "text") as "text" | "file",
        enabled: item.enabled !== false,
        filename: item.filename,
        fileData: item.fileData,
        mimeType: item.mimeType,
      }));
      return items.length > 0 ? items : [{ key: "", value: "", type: "text", enabled: true }];
    }
  } catch {}
  return [{ key: "", value: "", type: "text", enabled: true }];
}

function MultipartEditor({
  content,
  onChange,
}: {
  content?: string;
  onChange: (content: string) => void;
}) {
  const items = parseMultipartItems(content);
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  const updateItem = (index: number, patch: Partial<MultipartItem>) => {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    onChange(JSON.stringify(next));
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(
      JSON.stringify(
        next.length ? next : [{ key: "", value: "", type: "text", enabled: true }]
      )
    );
  };

  const addItem = (type: "text" | "file" = "text") => {
    onChange(JSON.stringify([...items, { key: "", value: "", type, enabled: true }]));
  };

  const handleChooseClick = async (index: number) => {
    try {
      const res = await bridge.chooseFile();
      if (res && res.status === "ok" && res.file) {
        updateItem(index, {
          value: res.file.path,
          filename: res.file.name,
          mimeType: res.file.mime_type,
          fileData: res.file.fileData,
        });
        return;
      }
      if (res && res.status === "cancelled") {
        return;
      }
    } catch {}
    fileInputsRef.current[index]?.click();
  };

  const handleFileSelect = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      updateItem(index, {
        value: (file as any).path || file.name,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData: b64,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] text-[11px] text-[var(--tx-3)] shrink-0">
        <span className="font-semibold text-[var(--tx-2)]">Multipart Form (Uploads & Fields)</span>
        <span className="font-mono text-[10px] text-[var(--lime)] bg-[var(--lime-soft)] px-1.5 py-0.5 rounded">
          multipart/form-data
        </span>
      </div>

      <div
        className="grid text-[10px] uppercase tracking-widest text-[var(--tx-3)] px-2 py-1 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0"
        style={{ gridTemplateColumns: "24px 1.2fr 80px 1.8fr 24px" }}
      >
        <span />
        <span>Field Key</span>
        <span>Type</span>
        <span>Value / File</span>
        <span />
      </div>

      <div className="flex-1 overflow-auto">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              "grid items-center border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)] group py-0.5",
              !item.enabled && "opacity-50"
            )}
            style={{ gridTemplateColumns: "24px 1.2fr 80px 1.8fr 24px" }}
          >
            {/* Checkbox */}
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => updateItem(i, { enabled: e.target.checked })}
                className="accent-[var(--lime)] w-3 h-3 cursor-pointer"
              />
            </div>

            {/* Key */}
            <input
              className="bg-transparent px-2 py-1.5 text-xs text-[var(--tx-1)] placeholder:text-[var(--tx-3)] outline-none"
              placeholder="field_name"
              value={item.key}
              onChange={(e) => updateItem(i, { key: e.target.value })}
            />

            {/* Type selector */}
            <div className="px-1">
              <select
                value={item.type}
                onChange={(e) =>
                  updateItem(i, {
                    type: e.target.value as "text" | "file",
                    value: "",
                    fileData: undefined,
                    filename: undefined,
                  })
                }
                className="bg-[var(--bg-s3)] text-[11px] text-[var(--tx-2)] rounded px-1.5 py-1 border border-[var(--border-dim)] outline-none cursor-pointer"
              >
                <option value="text">Text</option>
                <option value="file">File</option>
              </select>
            </div>

            {/* Value or File Picker */}
            <div className="px-1 min-w-0">
              {item.type === "text" ? (
                <VariableInput
                  value={item.value}
                  onChange={(val) => updateItem(i, { value: val })}
                  placeholder="field value"
                  className="bg-transparent border-0 hover:bg-[var(--bg-s3)] focus:bg-[var(--bg-s3)] rounded-none"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleChooseClick(i)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-s3)] border border-[var(--border-dim)] hover:border-[var(--lime)] text-[11px] text-[var(--tx-2)] hover:text-[var(--lime)] cursor-pointer shrink-0 transition-colors"
                    title="Choose file from disk"
                  >
                    <Paperclip size={11} />
                    <span>Choose</span>
                  </button>
                  <input
                    type="file"
                    ref={(el) => {
                      fileInputsRef.current[i] = el;
                    }}
                    style={{ display: "none" }}
                    onChange={(e) => handleFileSelect(i, e)}
                  />
                  <input
                    value={item.value}
                    onChange={(e) =>
                      updateItem(i, {
                        value: e.target.value,
                        filename: e.target.value.split(/[\\/]/).pop(),
                      })
                    }
                    placeholder="Path or choose file"
                    className="flex-1 bg-transparent border-b border-dashed border-[var(--border-dim)] px-1 py-0.5 text-xs text-[var(--tx-1)] placeholder:text-[var(--tx-3)] outline-none font-mono truncate"
                    title={item.filename || item.value}
                  />
                  {item.filename && (
                    <span className="text-[10px] text-[var(--lime)] font-mono shrink-0 bg-[var(--lime-soft)] px-1 rounded">
                      ready
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Delete */}
            <button
              className="flex items-center justify-center text-[var(--tx-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--err)] transition-all"
              onClick={() => removeItem(i)}
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 p-2">
          <button
            onClick={() => addItem("text")}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] rounded transition-colors"
          >
            <Plus size={12} />
            Add Field
          </button>
          <button
            onClick={() => addItem("file")}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] rounded transition-colors"
          >
            <Paperclip size={12} />
            Add File
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Body editor ───────────────────────────────────────────────────────────────
function BodyEditor({
  body,
  onChange,
}: {
  body: RequestBody;
  onChange: (b: RequestBody) => void;
}) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handlePrettify = () => {
    if (!body.content || !body.content.trim()) return;
    try {
      const parsed = JSON.parse(body.content);
      const pretty = JSON.stringify(parsed, null, 2);
      onChange({ ...body, content: pretty });
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e?.message ? `Invalid JSON: ${e.message}` : "Invalid JSON syntax");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Type selector & Toolbar */}
      <div className="flex items-center justify-between p-2 shrink-0 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]">
        <div
          className="flex gap-1 p-0.5 bg-[var(--bg-s3)] rounded-[var(--r-sm)] w-fit"
          style={{ border: "1px solid var(--border-dim)" }}
        >
          {bodyTypes.map((t) => (
            <button
              key={t}
              onClick={() => {
                onChange({ type: t, content: body.content });
                setJsonError(null);
              }}
              className={cn(
                "px-2.5 py-1 text-xs rounded-[var(--r-sm)] transition-colors capitalize",
                body.type === t
                  ? "bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)] font-semibold"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              {t === "form"
                ? "Form (URL-Encoded)"
                : t === "multipart"
                ? "Multipart (Files)"
                : t}
            </button>
          ))}
        </div>

        {body.type === "json" && (
          <div className="flex items-center gap-2">
            {jsonError ? (
              <span className="flex items-center gap-1 text-[11px] text-[var(--err)] font-mono max-w-[260px] truncate" title={jsonError}>
                <AlertCircle size={12} className="shrink-0" />
                {jsonError}
              </span>
            ) : body.content && body.content.trim() ? (
              <span className="flex items-center gap-1 text-[11px] text-[var(--ok)] font-mono">
                <CheckCircle2 size={12} />
                Valid JSON
              </span>
            ) : null}
            <button
              type="button"
              onClick={handlePrettify}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-sm)] bg-[var(--bg-s3)] border border-[var(--border)] text-xs text-[var(--tx-2)] hover:text-[var(--lime)] hover:border-[var(--lime)] transition-colors cursor-pointer"
              title="Format JSON with 2 spaces"
            >
              <Sparkles size={12} className="text-[var(--lime)]" />
              <span>Prettify</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!body.content || !body.content.trim()) return;
                try {
                  const minified = JSON.stringify(JSON.parse(body.content));
                  onChange({ ...body, content: minified });
                  setJsonError(null);
                } catch {}
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--r-sm)] bg-[var(--bg-s3)] border border-[var(--border)] text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors cursor-pointer"
              title="Minify JSON"
            >
              <span>Minify</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor area */}
      {(body.type === "json" || body.type === "raw") && (
        <div className="flex-1 min-h-0 overflow-auto">
          <CodeMirror
            value={body.content ?? ""}
            height="100%"
            theme={oneDark}
            extensions={body.type === "json" ? [json()] : []}
            onChange={(val) => {
              onChange({ ...body, content: val });
              if (body.type === "json" && jsonError) {
                try {
                  JSON.parse(val);
                  setJsonError(null);
                } catch {}
              }
            }}
            style={{ fontSize: 12, fontFamily: "var(--font-mono)", height: "100%" }}
          />
        </div>
      )}

      {body.type === "form" && (
        <div className="flex-1 overflow-auto flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] text-[11px] text-[var(--tx-3)] shrink-0">
            <span className="font-semibold text-[var(--tx-2)]">Form Data (URL-Encoded)</span>
            <span className="font-mono text-[10px] text-[var(--lime)] bg-[var(--lime-soft)] px-1.5 py-0.5 rounded">
              application/x-www-form-urlencoded
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            <KeyValueEditor
              pairs={parseFormPairs(body.content)}
              onChange={(pairs) => {
                onChange({
                  type: "form",
                  content: JSON.stringify(pairs),
                });
              }}
              keyPlaceholder="field_name"
              valuePlaceholder="field_value"
            />
          </div>
        </div>
      )}

      {body.type === "multipart" && (
        <div className="flex-1 overflow-auto flex flex-col">
          <MultipartEditor
            content={body.content}
            onChange={(newContent) =>
              onChange({
                type: "multipart",
                content: newContent,
              })
            }
          />
        </div>
      )}

      {body.type === "none" && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-[var(--tx-3)]">This request has no body</p>
        </div>
      )}
    </div>
  );
}
