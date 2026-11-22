import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Send, Bookmark, Check, Globe, Zap, Radio, X, Code2, Terminal } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn, methodColor, parseParamsFromUrl } from "../../lib/cn";
import { substitutePathVariables } from "../../lib/pathVariables";
import { VariableInput } from "../ui/VariableInput";
import { CodeSnippetModal } from "./CodeSnippetModal";
import { ImportCurlModal } from "./ImportCurlModal";
import { isCurlCommand, parseCurlCommand, type ParsedCurl } from "../../lib/curlParser";
import { extractValueFromResponse } from "../../lib/variableChaining";
import { useDropdown } from "../../lib/useDropdown";
import { useToast } from "../ui/Toast";
import {
  invalidateCollectionLoads,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";
import { parseCollectionMetadata } from "../../lib/collectionMetadata";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const PROTOCOLS = [
  { id: "http", label: "HTTP", icon: Globe, color: "var(--lime)" },
  { id: "graphql", label: "GraphQL", icon: Zap, color: "var(--ok)" },
  { id: "websocket", label: "WebSocket", icon: Radio, color: "var(--amber)" },
  { id: "sse", label: "SSE", icon: Globe, color: "var(--info)" },
] as const;

export const URLBar: React.FC<{ onOpenSaveModal?: () => void }> = ({ onOpenSaveModal }) => {
  const {
    tabs,
    activeTabId,
    updateTab,
    activeWorkspaceId,
    activeEnvironmentId,
    setEnvironmentVariables,
    globalVariables,
    setGlobalVariables,
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    setCollectionsForWorkspace,
    setHistory,
  } = useAppStore();
  const { toast } = useToast();

  const [methodOpen, setMethodOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [curlModalOpen, setCurlModalOpen] = useState(false);
  const activeTaskIdRef = useRef<string | null>(null);
  const sendRequestRef = useRef<(() => void) | null>(null);

  const methodDropdown = useDropdown({ isOpen: methodOpen, onClose: () => setMethodOpen(false) });
  const protocolDropdown = useDropdown({ isOpen: protocolOpen, onClose: () => setProtocolOpen(false) });

  const tab = tabs.find((t) => t.id === activeTabId);

  // Sync environment & global variables whenever activeWorkspace or activeEnvironment changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    bridge
      .getEnvironments(activeWorkspaceId)
      .then((res: any) => {
        const envs = res?.environments || [];
        const activeEnv = envs.find(
          (e: any) => e.id === activeEnvironmentId || (!activeEnvironmentId && e.is_active)
        );
        if (activeEnv?.variables) {
          setEnvironmentVariables(activeEnv.variables);
        } else {
          setEnvironmentVariables([]);
        }

        const globalsEnv = envs.find((e: any) => e.name.toLowerCase() === "globals");
        if (globalsEnv?.variables) {
          setGlobalVariables(globalsEnv.variables);
        } else {
          setGlobalVariables([]);
        }
      })
      .catch(() => {});
  }, [activeWorkspaceId, activeEnvironmentId, setEnvironmentVariables, setGlobalVariables]);

  useEffect(() => {
    const handleSendShortcut = () => sendRequestRef.current?.();
    window.addEventListener("kurorelay:send-request", handleSendShortcut);
    return () => window.removeEventListener("kurorelay:send-request", handleSendShortcut);
  }, []);

  if (!tab) return null;

  const currentProtocol = tab.protocol || "http";

  const applyParsedCurl = (parsed: ParsedCurl) => {
    if (!tab) return;
    updateTab(tab.id, {
      url: parsed.url,
      method: parsed.method,
      headers: parsed.headers,
      params: parsed.params,
      body: parsed.body as any,
      auth: parsed.auth as any,
      options: {
        ...tab.options,
        ...parsed.options,
      },
      isDirty: true,
    });
    toast("cURL command imported successfully", "success");
  };

  const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (isCurlCommand(pasted)) {
      e.preventDefault();
      try {
        const parsed = parseCurlCommand(pasted);
        if (parsed) {
          applyParsedCurl(parsed);
          return;
        }
      } catch {}
    }
  };

  const handleProtocolSwitch = (proto: "http" | "graphql" | "websocket" | "sse") => {
    setProtocolOpen(false);
    if (proto === "graphql") {
      updateTab(tab.id, {
        protocol: proto,
        method: "POST",
        isDirty: true,
      });
    } else if (proto === "websocket") {
      updateTab(tab.id, {
        protocol: proto,
        method: "WS",
        url: tab.url.startsWith("http") ? tab.url.replace(/^http/, "ws") : tab.url || "wss://echo.websocket.events",
        isDirty: true,
      });
    } else if (proto === "sse") {
      updateTab(tab.id, {
        protocol: proto,
        method: "SSE",
        isDirty: true,
      });
    } else {
      updateTab(tab.id, {
        protocol: "http",
        method: tab.method === "WS" || tab.method === "SSE" ? "GET" : tab.method,
        isDirty: true,
      });
    }
  };

  const handleSend = async () => {
    const effectiveUrl = substitutePathVariables(tab.url, tab.pathVariables);
    if (!effectiveUrl.trim() || tab.isLoading) return;
    const taskId = crypto.randomUUID();
    activeTaskIdRef.current = taskId;
    updateTab(tab.id, { isLoading: true, response: undefined });

    try {
      // Resolve parent collection for inherited auth & default headers
      const parentCol = collections.find(
        (c) => c.id === tab.collectionId || c.id === selectedCollectionId
      );
      const colMeta = parentCol ? parseCollectionMetadata(parentCol.description) : null;

      // Merge headers: collection default headers + request headers
      const mergedHeadersMap: Record<string, string> = {};
      if (colMeta?.headers && Array.isArray(colMeta.headers)) {
        colMeta.headers.forEach((h) => {
          if (h.enabled && h.key) mergedHeadersMap[h.key] = h.value;
        });
      }
      tab.headers.forEach((h) => {
        if (h.enabled && h.key) mergedHeadersMap[h.key] = h.value;
      });

      // Resolve Auth: direct or inherited
      let effectiveAuth: { type: string; configuration?: Record<string, string> } | undefined;
      const isInherit = !tab.auth || tab.auth.type === ("inherit" as any);
      if (isInherit && colMeta?.auth && colMeta.auth.type !== "none") {
        const ca = colMeta.auth;
        effectiveAuth = {
          type: ca.type,
          configuration:
            ca.type === "bearer"
              ? { token: ca.token ?? "" }
              : ca.type === "basic"
              ? { username: ca.username ?? "", password: ca.password ?? "" }
              : ca.type === "api_key"
              ? { key: ca.key ?? "", value: ca.value ?? "" }
              : {},
        };
      } else if (tab.auth && tab.auth.type !== "none" && tab.auth.type !== ("inherit" as any)) {
        effectiveAuth = {
          type: tab.auth.type,
          configuration:
            tab.auth.type === "bearer"
              ? { token: tab.auth.token ?? "" }
              : tab.auth.type === "basic"
              ? { username: tab.auth.username ?? "", password: tab.auth.password ?? "" }
              : tab.auth.type === "api_key"
              ? { key: tab.auth.key ?? "", value: tab.auth.value ?? "" }
              : (tab.auth.configuration ?? {}),
        };
      }

      const payload: Record<string, unknown> = {
        task_id: taskId,
        method: tab.method,
        url: effectiveUrl,
        headers: mergedHeadersMap,
        params: Object.fromEntries(
          tab.params.filter((p) => p.enabled && p.key).map((p) => [p.key, p.value])
        ),
        body:
          tab.body.type !== "none"
            ? {
                type: tab.body.type,
                content:
                  (tab.body.type === "form" || tab.body.type === "multipart") &&
                  typeof tab.body.content === "string"
                    ? (() => {
                        try {
                          return JSON.parse(tab.body.content);
                        } catch {
                          return tab.body.content;
                        }
                      })()
                    : tab.body.content,
              }
            : undefined,
        auth: effectiveAuth,
        workspace_id: activeWorkspaceId ?? undefined,
        environment_id: activeEnvironmentId || undefined,
        variable_scopes:
          globalVariables.length > 0
            ? {
                global: Object.fromEntries(
                  globalVariables
                    .filter((v) => v.is_enabled !== false)
                    .map((v) => [v.key, v.value])
                ),
              }
            : undefined,
        verify_tls: tab.options?.verify_ssl ?? true,
        follow_redirects: tab.options?.follow_redirects ?? true,
        timeout_ms: tab.options?.timeout_ms ?? 30000,
        allow_private_network: tab.options?.allow_private_network ?? true,
      };
      sendRequestRef.current = () => {
        void handleSend();
      };

      const result = await bridge.sendRequest(payload);
      updateTab(tab.id, { response: result, isLoading: false, isDirty: false });

      // Auto Variable Chaining: evaluate extraction rules and persist variables
      if (tab.extractions && tab.extractions.length > 0 && result) {
        const extractions = tab.extractions;
        const updatedVars: string[] = [];
        for (const rule of extractions) {
          if (!rule.enabled || !rule.variableName.trim()) continue;
          const extracted = extractValueFromResponse(rule, result);
          if (extracted !== null) {
            const targetEnvId = rule.targetScope === "environment" ? activeEnvironmentId : null;
            if (targetEnvId) {
              try {
                await bridge.setEnvironmentVariable({
                  environment_id: targetEnvId,
                  key: rule.variableName.trim(),
                  value: extracted,
                  is_enabled: true,
                });
                updatedVars.push(rule.variableName.trim());
              } catch {}
            }
          }
        }

        if (updatedVars.length > 0) {
          toast(
            `Auto-updated ${updatedVars.length} variable(s): ${updatedVars
              .map((v) => `{{${v}}}`)
              .join(", ")}`,
            "success"
          );
          if (activeWorkspaceId) {
            bridge
              .getEnvironments(activeWorkspaceId)
              .then((res: any) => {
                const envs = res?.environments || [];
                const activeEnv = envs.find((e: any) => e.id === activeEnvironmentId);
                if (activeEnv?.variables) setEnvironmentVariables(activeEnv.variables);
                const globalsEnv = envs.find((e: any) => e.name.toLowerCase() === "globals");
                if (globalsEnv?.variables) setGlobalVariables(globalsEnv.variables);
              })
              .catch(() => {});
          }
        }
      }

      // Automatically refresh history
      if (activeWorkspaceId) {
        bridge
          .getRequestHistory(activeWorkspaceId, 1, 50)
          .then((histRes: any) => {
            if (histRes?.items) {
              setHistory(histRes.items);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      updateTab(tab.id, {
        response: {
          status: "failed",
          error: { message: err instanceof Error ? err.message : String(err) },
        },
        isLoading: false,
      });
    }
  };

  const handleCancel = async () => {
    if (activeTaskIdRef.current) {
      bridge.cancelTask(activeTaskIdRef.current).catch(console.error);
    }
    updateTab(tab.id, {
      isLoading: false,
      response: {
        status: "cancelled",
        error: { message: "Request cancelled by user" },
      },
    });
  };

  const handleSave = async () => {
    if (!tab) return;
    if (!tab.savedRequestId && onOpenSaveModal) {
      onOpenSaveModal();
      return;
    }
    if (!activeWorkspaceId) {
      toast("Select a workspace before saving this request", "error");
      return;
    }

    const config = {
      protocol: tab.protocol,
      params: tab.params,
      headers: tab.headers,
      body: tab.body,
      auth: tab.auth,
      options: tab.options,
      extractions: tab.extractions,
    };

    try {
      if (tab.savedRequestId) {
        const result: any = await bridge.updateSavedRequest(tab.savedRequestId, {
          name: tab.name,
          method: tab.method,
          url: tab.url,
          configuration: config,
        });
        if (result?.status !== "ok") {
          throw new Error(result?.error?.message || "Could not update the saved request");
        }
      } else {
        const colId =
          tab.collectionId ||
          (collections.some((collection) => collection.id === selectedCollectionId)
            ? selectedCollectionId
            : collections[0]?.id);
        const res = await bridge.saveRequest({
          workspace_id: activeWorkspaceId,
          collection_id: colId ?? undefined,
          name:
            tab.name === "New Request" && tab.url
              ? `${tab.method} ${tab.url.slice(0, 30)}`
              : tab.name,
          method: tab.method,
          url: tab.url,
          configuration: config,
        });
        if (res?.status !== "ok" || !res.request) {
          throw new Error((res as any)?.error?.message || "Could not save the request");
        }
        updateTab(tab.id, {
          savedRequestId: res.request.id,
          collectionId: res.request.collection_id,
          name: res.request.name,
        });
        if (res.request.collection_id) setSelectedCollectionId(res.request.collection_id);
      }

      updateTab(tab.id, { isDirty: false });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);

      // Refresh collections in sidebar
      invalidateCollectionLoads(activeWorkspaceId);
      void loadCollectionsWithFolders(activeWorkspaceId)
        .then((loadedCollections) => setCollectionsForWorkspace(activeWorkspaceId, loadedCollections))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not refresh the collection";
          toast(`Request saved, but ${message.toLowerCase()}`, "warning");
        });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save request", "error");
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 select-none" style={{ height: 40, background: "var(--color-surface-base)" }}>
      {/* Protocol selector */}
      <div
        className="relative shrink-0"
        ref={protocolDropdown.ref}
        onMouseEnter={protocolDropdown.onMouseEnter}
        onMouseLeave={protocolDropdown.onMouseLeave}
      >
        <button
          onClick={() => setProtocolOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-[var(--r-sm)] transition-colors text-xs font-semibold"
          style={{
            height: 28,
            background: "var(--color-surface-panel)",
            border: "1px solid var(--color-border-subtle)",
            color:
              currentProtocol === "graphql"
                ? "var(--color-method-graphql)"
                : currentProtocol === "websocket"
                ? "var(--color-method-ws)"
                : currentProtocol === "sse"
                ? "var(--color-accent-lime)"
                : "var(--color-accent-lime)",
          }}
          title="Select Protocol"
        >
          <span className="uppercase text-[11px] font-mono">{currentProtocol}</span>
          <ChevronDown size={11} className="text-[var(--color-text-muted)]" />
        </button>

        {protocolOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-50 rounded-[var(--r-md)] py-1 shadow-2xl bg-[var(--color-surface-modal)] border border-[var(--color-border-subtle)] min-w-[130px] animate-in fade-in zoom-in-95 duration-100"
          >
            {PROTOCOLS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => handleProtocolSwitch(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-elevated)] text-xs text-left"
                  style={{ color: p.color }}
                >
                  <Icon size={12} />
                  <span className="font-medium text-[var(--color-text-primary)]">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* HTTP Method selector (only if protocol is HTTP) */}
      {currentProtocol === "http" && (
        <div
          className="relative shrink-0"
          ref={methodDropdown.ref}
          onMouseEnter={methodDropdown.onMouseEnter}
          onMouseLeave={methodDropdown.onMouseLeave}
        >
          <button
            data-kuro-target="method-select"
            onClick={() => setMethodOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--r-sm)] transition-colors"
            style={{
              height: 28,
              background: "var(--color-surface-panel)",
              border: "1px solid var(--color-border-subtle)",
              fontSize: 11.5,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              minWidth: 80,
            }}
          >
            <span className={cn(methodColor(tab.method))}>{tab.method}</span>
            <ChevronDown size={11} style={{ color: "var(--color-text-muted)", marginLeft: "auto" }} />
          </button>

          {methodOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-50 rounded-[var(--r-md)] py-1 shadow-xl bg-[var(--color-surface-modal)] border border-[var(--color-border-subtle)] min-w-[110px] animate-in fade-in zoom-in-95 duration-100"
            >
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    updateTab(tab.id, { method: m, isDirty: true });
                    setMethodOpen(false);
                  }}
                  className="w-full flex items-center px-3 py-1.5 transition-colors text-left"
                  style={{
                    fontSize: 11.5,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    background: tab.method === m ? "var(--color-surface-elevated)" : "transparent",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--color-surface-elevated)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      tab.method === m ? "var(--color-surface-elevated)" : "transparent")
                  }
                >
                  <span className={methodColor(m)}>{m}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* URL input with Environment Variable Autocomplete */}
      <div className="flex-1 min-w-0" data-kuro-target="url-input">
        <VariableInput
          value={tab.url}
          onChange={(val) => {
            const newParams = parseParamsFromUrl(val, tab.params);
            updateTab(tab.id, { url: val, params: newParams, isDirty: true });
          }}
          onPaste={handleUrlPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={
            currentProtocol === "websocket"
              ? "wss://echo.websocket.events"
              : currentProtocol === "graphql"
              ? "https://countries.trevorblades.com/"
              : currentProtocol === "sse"
              ? "https://express-eventsource.herokuapp.com/events"
              : "https://api.example.com/{{endpoint}}"
          }
        />
      </div>

      {/* Import cURL Button */}
      <button
        type="button"
        onClick={() => setCurlModalOpen(true)}
        title="Import cURL Command"
        className="flex items-center gap-1.5 px-2.5 rounded-[var(--r-md)] font-medium shrink-0 border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-lime)] hover:border-[var(--color-accent-lime)] transition-colors cursor-pointer"
        style={{ height: 28, fontSize: 12 }}
      >
        <Terminal size={13} />
        <span>cURL</span>
      </button>

      {/* Code Snippet Button */}
      <button
        type="button"
        onClick={() => setCodeModalOpen(true)}
        title="Generate Code Snippet (cURL, Python, JS, Axios)"
        className="flex items-center gap-1.5 px-2.5 rounded-[var(--r-md)] font-medium shrink-0 border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-lime)] hover:border-[var(--color-accent-lime)] transition-colors"
        style={{ height: 28, fontSize: 12 }}
      >
        <Code2 size={13} />
        <span>Code</span>
      </button>

      {/* Save button */}
      <button
        onClick={handleSave}
        title="Save request to collection (Ctrl+S)"
        className="relative flex items-center gap-1.5 px-3 rounded-[var(--r-md)] font-medium shrink-0 border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        style={{ height: 28, fontSize: 12 }}
      >
        {savedSuccess ? (
          <Check size={12} className="text-[var(--color-status-success)]" />
        ) : (
          <Bookmark size={12} />
        )}
        <span>{savedSuccess ? "Saved" : "Save"}</span>
        {tab.isDirty && !savedSuccess && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-warning)] shrink-0" title="Unsaved changes" />
        )}
      </button>

      {/* Send / Cancel button (only active for HTTP; protocols have execute in their panels) */}
      {currentProtocol === "http" &&
        (tab.isLoading ? (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-3.5 rounded-[var(--r-md)] font-semibold shrink-0 transition-opacity bg-[var(--color-status-error)] text-white hover:opacity-90 cursor-pointer"
            style={{ height: 28, fontSize: 12 }}
            title="Cancel running request"
          >
            <X size={13} />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!tab.url.trim()}
            className="flex items-center gap-1.5 px-4 rounded-[var(--r-md)] shrink-0 transition-all shadow-sm"
            style={{
              height: 28,
              background: "var(--color-accent-lime)",
              color: "var(--color-text-inverse)",
              fontSize: 12,
              fontWeight: 700,
              opacity: !tab.url.trim() ? 0.45 : 1,
              cursor: !tab.url.trim() ? "not-allowed" : "pointer",
            }}
            title="Execute Request (Ctrl+Enter)"
          >
            <Send size={12} className="fill-[var(--color-text-inverse)]" />
            <span>Send</span>
            <kbd className="hidden xl:inline-flex ml-1 px-1 py-0.5 border border-black/20 rounded-[2px] text-[9px] font-mono font-medium opacity-70">
              Ctrl+↵
            </kbd>
          </button>
        ))}

      {/* Code Snippet Modal */}
      <CodeSnippetModal
        isOpen={codeModalOpen}
        onClose={() => setCodeModalOpen(false)}
        tab={tab}
      />

      {/* Import cURL Modal */}
      <ImportCurlModal
        isOpen={curlModalOpen}
        onClose={() => setCurlModalOpen(false)}
        onImport={applyParsedCurl}
      />
    </div>
  );
};
