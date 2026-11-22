import React, { useEffect, useState } from "react";
import { X, Eye, EyeOff, Plus, Trash2, KeyRound, ExternalLink } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { useToast } from "../ui/Toast";

interface VariableRow {
  id?: string;
  key: string;
  value: string;
  is_secret?: boolean;
  is_enabled?: boolean;
}

interface QuickEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  environment: {
    id: string;
    name: string;
    variables?: VariableRow[];
  };
  onRefresh: () => void;
}

function assertBridgeSuccess(result: { status?: string; error?: unknown }, fallback: string) {
  if (result?.status === "ok") return;
  const error = result?.error;
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : fallback;
  throw new Error(message);
}

export const QuickEnvironmentModal: React.FC<QuickEnvironmentModalProps> = ({
  isOpen,
  onClose,
  environment,
  onRefresh,
}) => {
  const { setActiveModule, setEnvironmentVariables } = useAppStore();
  const { toast } = useToast();
  const [variables, setVariables] = useState<VariableRow[]>(environment.variables || []);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    setVariables(environment.variables || []);
    setDraftValues({});
    setRevealedValues({});
    setShowSecrets({});
  }, [environment.id, environment.variables]);

  useEffect(() => {
    if (!savedKey) return;
    const timer = window.setTimeout(() => setSavedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [savedKey]);

  if (!isOpen) return null;

  const handleUpdateVar = async (index: number, val: string) => {
    const target = variables[index];
    if (!target) return;
    if (target.value === val) {
      setDraftValues((current) => {
        const next = { ...current };
        delete next[target.key];
        return next;
      });
      return;
    }

    setSavingKey(target.key);
    try {
      const result = await bridge.setEnvironmentVariable({
        environment_id: environment.id,
        key: target.key,
        value: val,
        is_secret: target.is_secret,
        is_enabled: target.is_enabled !== false,
      });
      assertBridgeSuccess(result, "Could not save variable");
      const next = variables.map((v, i) => (i === index ? { ...v, value: val } : v));
      setVariables(next);
      if (target.is_secret) {
        setRevealedValues((current) => ({ ...current, [target.key]: val }));
      }
      setDraftValues((current) => {
        const updated = { ...current };
        delete updated[target.key];
        return updated;
      });
      setEnvironmentVariables(next.map((variable) =>
        variable.is_secret ? { ...variable, value: "" } : variable,
      ));
      onRefresh();
      setSavedKey(target.key);
    } catch (e) {
      setDraftValues((current) => {
        const next = { ...current };
        delete next[target.key];
        return next;
      });
      toast(e instanceof Error ? e.message : "Could not save variable", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteVar = async (variable: VariableRow) => {
    const key = variable.key;
    setDeletingKey(key);
    try {
      const result = await bridge.deleteEnvironmentVariable(environment.id, variable.id || key);
      assertBridgeSuccess(result, "Could not delete variable");
      const next = variables.filter((v) => v.key !== key);
      setVariables(next);
      setEnvironmentVariables(next.map((variable) =>
        variable.is_secret ? { ...variable, value: "" } : variable,
      ));
      onRefresh();
      toast(`Deleted "${key}"`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete variable", "error");
    } finally {
      setDeletingKey(null);
    }
  };

  const handleAddVar = async () => {
    if (!newKey.trim()) return;
    const k = newKey.trim();
    const v = newVal;
    const item: VariableRow = { key: k, value: v, is_secret: newSecret, is_enabled: true };
    try {
      const result = await bridge.setEnvironmentVariable({
        environment_id: environment.id,
        key: k,
        value: v,
        is_secret: newSecret,
        is_enabled: true,
      });
      assertBridgeSuccess(result, "Could not add variable");
      const next = [...variables.filter((x) => x.key !== k), item];
      setVariables(next);
      setNewKey("");
      setNewVal("");
      setNewSecret(false);
      setEnvironmentVariables(next.map((variable) =>
        variable.is_secret ? { ...variable, value: "" } : variable,
      ));
      onRefresh();
      toast(`Added "${k}"`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add variable", "error");
    }
  };

  const handleToggleSecretVisibility = async (index: number, item: VariableRow) => {
    if (showSecrets[index]) {
      setShowSecrets((current) => ({ ...current, [index]: false }));
      return;
    }

    try {
      const result = await bridge.getEnvironmentVariableSecret(environment.id, item.id || item.key);
      assertBridgeSuccess(result, `Could not reveal "${item.key}"`);
      setRevealedValues((current) => ({ ...current, [item.key]: result.value }));
      setShowSecrets((current) => ({ ...current, [index]: true }));
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not reveal "${item.key}"`, "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-xl bg-[var(--bg-s2)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--lime)] shrink-0" />
            <h3 className="text-xs font-semibold text-[var(--tx-1)]">
              Quick Environment: <span className="text-[var(--lime)]">{environment.name}</span>
            </h3>
            <span className="text-[10px] text-[var(--tx-3)] font-mono">
              ({variables.length} variables)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Variables Table */}
        <div className="flex-1 overflow-auto">
          {variables.length === 0 ? (
            <div className="p-8 text-center text-[var(--tx-3)] text-xs font-mono">
              No variables defined in this environment yet.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[var(--tx-3)] border-b border-[var(--border-dim)] bg-[var(--bg-s3)]">
                  <th className="text-left px-3 py-1.5 font-normal w-1/3">Variable</th>
                  <th className="text-left px-3 py-1.5 font-normal">Current Value</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {variables.map((item, idx) => {
                  const isVisible = showSecrets[idx] || !item.is_secret;
                  const value = draftValues[item.key] ??
                    (item.is_secret ? (isVisible ? revealedValues[item.key] ?? item.value : "") : item.value);
                  return (
                    <tr
                      key={item.key}
                      className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)] group"
                    >
                      <td className="px-3 py-1.5 font-mono text-[var(--amber)] font-semibold truncate">
                        {`{{${item.key}}}`}
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        <div className="flex items-center gap-1.5">
                          <input
                            type={isVisible ? "text" : "password"}
                            value={value}
                            onChange={(e) =>
                              setDraftValues((current) => ({
                                ...current,
                                [item.key]: e.target.value,
                              }))
                            }
                            onBlur={(e) => void handleUpdateVar(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setDraftValues((current) => {
                                  const next = { ...current };
                                  delete next[item.key];
                                  return next;
                                });
                              }
                            }}
                            disabled={savingKey === item.key || deletingKey === item.key || (item.is_secret && !isVisible)}
                            placeholder={item.is_secret && !isVisible ? "••••••••" : "empty"}
                            className="w-full bg-[var(--bg-s3)] border border-[var(--border-dim)] focus:border-[var(--lime)] rounded px-2 py-1 text-xs text-[var(--tx-1)] outline-none font-mono"
                          />
                          {item.is_secret && (
                            <button
                              type="button"
                              onClick={() => void handleToggleSecretVisibility(idx, item)}
                              className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                              title={isVisible ? "Hide Secret" : "Show Secret"}
                            >
                              {isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                          {(savingKey === item.key || savedKey === item.key) && (
                            <span className="text-[10px] text-[var(--lime)] font-mono">
                              {savingKey === item.key ? "Saving…" : "Saved"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => void handleDeleteVar(item)}
                          disabled={deletingKey === item.key || savingKey === item.key}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded transition-all"
                          title="Delete Variable"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick Add Row */}
        <div className="p-3 bg-[var(--bg-s1)] border-t border-[var(--border-dim)] shrink-0 flex flex-col gap-2">
          <div className="text-[10px] uppercase font-bold text-[var(--tx-3)] tracking-wider">
            Add New Variable
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="VARIABLE_NAME"
              className="flex-1 bg-[var(--bg-s3)] border border-[var(--border-dim)] focus:border-[var(--lime)] rounded px-2 py-1 text-xs text-[var(--tx-1)] outline-none font-mono placeholder:text-[var(--tx-3)]"
            />
            <input
              type={newSecret ? "password" : "text"}
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              placeholder="Value"
              className="flex-1 bg-[var(--bg-s3)] border border-[var(--border-dim)] focus:border-[var(--lime)] rounded px-2 py-1 text-xs text-[var(--tx-1)] outline-none font-mono placeholder:text-[var(--tx-3)]"
            />
            <label className="flex items-center gap-1 text-[11px] text-[var(--tx-3)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newSecret}
                onChange={(e) => setNewSecret(e.target.checked)}
                className="accent-[var(--lime)] w-3 h-3"
              />
              <KeyRound size={11} />
              <span>Secret</span>
            </label>
            <button
              onClick={handleAddVar}
              disabled={!newKey.trim()}
              className="flex items-center gap-1 px-3 py-1 rounded bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
            >
              <Plus size={12} />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-dim)] bg-[var(--bg-s2)] shrink-0 text-xs">
          <button
            onClick={() => {
              setActiveModule("environments");
              onClose();
            }}
            className="flex items-center gap-1 text-[11px] text-[var(--tx-3)] hover:text-[var(--lime)] transition-colors"
          >
            <ExternalLink size={11} />
            <span>Open in Full Environments View</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
