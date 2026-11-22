import React, { useState } from "react";
import { Check, Key, Plus, Shield, Trash2, X } from "lucide-react";
import {
  parseCollectionMetadata,
  serializeCollectionMetadata,
  type CollectionMetadata,
} from "../../lib/collectionMetadata";
import { bridge, type KVPair } from "../../bridge/client";
import { useToast } from "../ui/Toast";

interface Props {
  collection: { id: string; name: string; description?: string };
  isOpen: boolean;
  onClose: () => void;
  onSaved: (newDescription: string) => void;
}

export const CollectionAuthModal: React.FC<Props> = ({
  collection,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"auth" | "headers" | "about">("auth");
  const [meta, setMeta] = useState<CollectionMetadata>(() =>
    parseCollectionMetadata(collection.description)
  );
  const [saving, setSaving] = useState(false);

  // Sync state if collection changes
  React.useEffect(() => {
    setMeta(parseCollectionMetadata(collection.description));
  }, [collection.id, collection.description]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const serialized = serializeCollectionMetadata(meta);
      const res = await bridge.updateCollection(collection.id, {
        name: collection.name,
        description: serialized,
      });
      if (res.status === "ok") {
        toast("Collection settings updated", "success");
        onSaved(serialized);
        onClose();
      } else {
        throw new Error((res as any).error || "Failed to update collection");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const addHeader = () => {
    setMeta((prev) => ({
      ...prev,
      headers: [...prev.headers, { key: "", value: "", enabled: true }],
    }));
  };

  const updateHeader = (index: number, patch: Partial<KVPair>) => {
    setMeta((prev) => {
      const next = [...prev.headers];
      next[index] = { ...next[index], ...patch };
      return { ...prev, headers: next };
    });
  };

  const removeHeader = (index: number) => {
    setMeta((prev) => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-accent-lime-dim)] text-[var(--color-accent-lime)]">
              <Shield size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Collection Settings & Auth
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                {collection.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0 gap-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab("auth")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "auth"
                ? "border-[var(--color-accent-lime)] text-[var(--color-accent-lime)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <Key size={13} />
            <span>Inherited Auth</span>
            {meta.auth.type !== "none" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-lime)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("headers")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "headers"
                ? "border-[var(--color-accent-lime)] text-[var(--color-accent-lime)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <span>Default Headers</span>
            {meta.headers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--color-surface-elevated)] text-[10px] font-mono">
                {meta.headers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "about"
                ? "border-[var(--color-accent-lime)] text-[var(--color-accent-lime)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <span>Overview & Notes</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "auth" && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-[var(--color-text-secondary)] block mb-1.5">
                  Authentication Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["none", "bearer", "api_key", "basic"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setMeta((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, type },
                        }))
                      }
                      className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all cursor-pointer ${
                        meta.auth.type === type
                          ? "bg-[var(--color-accent-lime-dim)] border-[var(--color-accent-lime)] text-[var(--color-accent-lime)] font-semibold"
                          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                      }`}
                    >
                      {type === "api_key" ? "API Key" : type}
                    </button>
                  ))}
                </div>
              </div>

              {meta.auth.type === "bearer" && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-medium text-[var(--color-text-primary)]">
                    Bearer Token
                  </label>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    This token will automatically be attached to requests in this collection as Authorization: Bearer &lt;token&gt;.
                  </p>
                  <input
                    type="text"
                    value={meta.auth.token || ""}
                    onChange={(e) =>
                      setMeta((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, token: e.target.value },
                      }))
                    }
                    placeholder="eyJh..."
                    className="w-full h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                  />
                </div>
              )}

              {meta.auth.type === "api_key" && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--color-text-primary)]">Key</label>
                    <input
                      type="text"
                      value={meta.auth.key || ""}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, key: e.target.value },
                        }))
                      }
                      placeholder="X-API-Key"
                      className="w-full h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--color-text-primary)]">Value</label>
                    <input
                      type="text"
                      value={meta.auth.value || ""}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, value: e.target.value },
                        }))
                      }
                      placeholder="secret-token-123"
                      className="w-full h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                    />
                  </div>
                </div>
              )}

              {meta.auth.type === "basic" && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--color-text-primary)]">Username</label>
                    <input
                      type="text"
                      value={meta.auth.username || ""}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, username: e.target.value },
                        }))
                      }
                      className="w-full h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--color-text-primary)]">Password</label>
                    <input
                      type="password"
                      value={meta.auth.password || ""}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          auth: { ...prev.auth, password: e.target.value },
                        }))
                      }
                      className="w-full h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "headers" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Headers configured here are inherited by all requests in this collection.
                </p>
                <button
                  type="button"
                  onClick={addHeader}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--color-border-subtle)] text-[11px] font-medium text-[var(--color-accent-lime)] hover:bg-[var(--color-surface-elevated)] transition-colors cursor-pointer"
                >
                  <Plus size={11} /> Add Header
                </button>
              </div>

              {meta.headers.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--color-text-muted)] border border-dashed border-[var(--color-border-subtle)] rounded-xl">
                  No default headers yet. Click "Add Header" to add headers like Accept or User-Agent.
                </div>
              ) : (
                <div className="space-y-2">
                  {meta.headers.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={header.enabled}
                        onChange={(e) => updateHeader(idx, { enabled: e.target.checked })}
                      />
                      <input
                        type="text"
                        placeholder="Header name"
                        value={header.key}
                        onChange={(e) => updateHeader(idx, { key: e.target.value })}
                        className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) => updateHeader(idx, { value: e.target.value })}
                        className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                      />
                      <button
                        type="button"
                        onClick={() => removeHeader(idx)}
                        className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--color-text-primary)]">
                Collection Description / Notes
              </label>
              <textarea
                rows={5}
                value={meta.about}
                onChange={(e) =>
                  setMeta((prev) => ({ ...prev, about: e.target.value }))
                }
                placeholder="Write documentation or notes about this API collection..."
                className="w-full p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] leading-relaxed resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--color-accent-lime)] text-black font-semibold text-xs hover:bg-[var(--color-accent-lime-hover)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check size={13} />
            <span>{saving ? "Saving…" : "Save Settings"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
