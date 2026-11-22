import React from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, Play, Link, Sparkles } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { type ExtractionRule, extractValueFromResponse } from "../../lib/variableChaining";
import { cn } from "../../lib/cn";
import { useToast } from "../ui/Toast";
import { bridge } from "../../bridge/client";

export const VariableChainingEditor: React.FC = () => {
  const {
    tabs,
    activeTabId,
    updateTab,
    activeEnvironmentId,
    activeWorkspaceId,
    setEnvironmentVariables,
    setGlobalVariables,
  } = useAppStore();
  const { toast } = useToast();

  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return null;

  const rules: ExtractionRule[] = tab.extractions || [];

  const handleAddRule = () => {
    const newRule: ExtractionRule = {
      id: crypto.randomUUID(),
      enabled: true,
      source: "body_json",
      path: "",
      variableName: "",
      targetScope: "environment",
    };
    updateTab(tab.id, {
      extractions: [...rules, newRule],
      isDirty: true,
    });
  };

  const handleUpdateRule = (ruleId: string, updates: Partial<ExtractionRule>) => {
    const nextRules = rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r));
    updateTab(tab.id, { extractions: nextRules, isDirty: true });
  };

  const handleDeleteRule = (ruleId: string) => {
    const nextRules = rules.filter((r) => r.id !== ruleId);
    updateTab(tab.id, { extractions: nextRules, isDirty: true });
  };

  const handleTestRun = async () => {
    if (!tab.response) {
      toast("No response available to test extraction against. Send request first.", "warning");
      return;
    }
    if (rules.length === 0) {
      toast("No extraction rules configured.", "warning");
      return;
    }

    let successCount = 0;
    for (const rule of rules) {
      if (!rule.enabled || !rule.variableName.trim()) continue;
      const val = extractValueFromResponse(rule, tab.response);
      if (val !== null && activeEnvironmentId) {
        try {
          await bridge.setEnvironmentVariable({
            environment_id: activeEnvironmentId,
            key: rule.variableName.trim(),
            value: val,
            is_enabled: true,
          });
          successCount++;
        } catch {}
      }
    }

    if (activeWorkspaceId) {
      bridge.getEnvironments(activeWorkspaceId).then((res: any) => {
        const envs = res?.environments || [];
        const activeEnv = envs.find((e: any) => e.id === activeEnvironmentId);
        if (activeEnv?.variables) setEnvironmentVariables(activeEnv.variables);
        const globalsEnv = envs.find((e: any) => e.name.toLowerCase() === "globals");
        if (globalsEnv?.variables) setGlobalVariables(globalsEnv.variables);
      }).catch(() => {});
    }

    if (successCount > 0) {
      toast(`Extracted and updated ${successCount} variable(s)!`, "success");
    } else {
      toast("No variables could be extracted from current response.", "warning");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-s1)] overflow-auto select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-s2)] border-b border-[var(--border-dim)] shrink-0">
        <div className="flex items-center gap-2">
          <Link size={14} className="text-[var(--lime)]" />
          <span className="text-xs font-semibold text-[var(--tx-1)]">
            Auto Variable Chaining
          </span>
          <span className="text-[10px] text-[var(--tx-3)] font-mono">
            Automatically extract response values into environment variables
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {Boolean(tab.response) && rules.length > 0 && (
            <button
              type="button"
              onClick={handleTestRun}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--r-sm)] text-[11px] font-medium bg-[var(--bg-s3)] hover:bg-[var(--bg-s4)] text-[var(--tx-2)] hover:text-[var(--tx-1)] border border-[var(--border-dim)] transition-colors cursor-pointer"
              title="Test run extraction rules against last response"
            >
              <Play size={10} className="text-[var(--lime)] fill-[var(--lime)]" />
              <span>Test Extract</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAddRule}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--r-sm)] text-[11px] font-semibold bg-[var(--lime)] text-[var(--bg-base)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus size={12} />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Rules List or Empty State */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center text-[var(--tx-3)]">
          <div className="w-10 h-10 rounded-full bg-[var(--bg-s2)] border border-[var(--border-dim)] flex items-center justify-center mb-3 text-[var(--lime)]">
            <Sparkles size={20} />
          </div>
          <p className="text-xs font-medium text-[var(--tx-2)]">No Variable Extraction Rules</p>
          <p className="text-[11px] max-w-sm mt-1 text-[var(--tx-3)]">
            Extract authentication tokens, session IDs, or response fields into environment variables so subsequent requests can use them automatically via <code className="text-[var(--amber)]">{"{{VARIABLE_NAME}}"}</code>.
          </p>
          <button
            type="button"
            onClick={handleAddRule}
            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] text-xs font-medium border border-[var(--border-dim)] hover:border-[var(--lime)] hover:text-[var(--lime)] bg-[var(--bg-s2)] transition-colors cursor-pointer"
          >
            <Plus size={12} />
            <span>Create First Extraction Rule</span>
          </button>
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-2.5">
          {rules.map((rule, idx) => {
            const previewVal = tab.response ? extractValueFromResponse(rule, tab.response) : null;

            return (
              <div
                key={rule.id}
                className={cn(
                  "p-3 rounded-[var(--r-md)] border bg-[var(--bg-s2)] flex flex-col gap-2 transition-colors",
                  rule.enabled ? "border-[var(--border-dim)]" : "border-[var(--border-dim)]/50 opacity-60"
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => handleUpdateRule(rule.id, { enabled: e.target.checked })}
                    className="accent-[var(--lime)] cursor-pointer"
                    title={rule.enabled ? "Disable rule" : "Enable rule"}
                  />

                  <span className="text-[10px] font-mono text-[var(--tx-3)] font-bold">
                    #{idx + 1}
                  </span>

                  {/* Source selector */}
                  <select
                    value={rule.source}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, {
                        source: e.target.value as ExtractionRule["source"],
                      })
                    }
                    className="bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-2 py-1 text-xs text-[var(--tx-1)] font-mono outline-none"
                  >
                    <option value="body_json">JSON Body</option>
                    <option value="header">Header</option>
                    <option value="status">Status Code</option>
                  </select>

                  {/* Source Path Input */}
                  {rule.source !== "status" && (
                    <input
                      type="text"
                      value={rule.path}
                      onChange={(e) => handleUpdateRule(rule.id, { path: e.target.value })}
                      placeholder={
                        rule.source === "body_json"
                          ? "JSON Path: data.token or user.id"
                          : "Header: Authorization or set-cookie"
                      }
                      className="flex-1 bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-2 py-1 text-xs text-[var(--tx-1)] font-mono outline-none focus:border-[var(--lime)] placeholder:text-[var(--tx-3)]"
                    />
                  )}

                  <span className="text-xs text-[var(--tx-3)] font-mono">→ Save to:</span>

                  {/* Target Variable Name */}
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--amber)] text-xs font-mono">{"{{"}</span>
                    <input
                      type="text"
                      value={rule.variableName}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, {
                          variableName: e.target.value.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase(),
                        })
                      }
                      placeholder="VARIABLE_NAME"
                      className="w-36 bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-2 py-1 text-xs text-[var(--lime)] font-mono font-bold outline-none focus:border-[var(--lime)] uppercase placeholder:text-[var(--tx-3)]"
                    />
                    <span className="text-[var(--amber)] text-xs font-mono">{"}}"}</span>
                  </div>

                  {/* Scope */}
                  <select
                    value={rule.targetScope}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, {
                        targetScope: e.target.value as "environment" | "global",
                      })
                    }
                    className="bg-[var(--bg-s3)] border border-[var(--border-dim)] rounded px-2 py-1 text-xs text-[var(--tx-2)] font-mono outline-none"
                  >
                    <option value="environment">Env</option>
                    <option value="global">Global</option>
                  </select>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
                    title="Delete rule"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Live Preview from last response if available */}
                {Boolean(tab.response) && rule.enabled && (
                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-dim)] text-[11px] font-mono">
                    {previewVal !== null ? (
                      <>
                        <CheckCircle2 size={12} className="text-[var(--lime)] shrink-0" />
                        <span className="text-[var(--tx-3)]">Extracted Value:</span>
                        <span className="text-[var(--tx-1)] font-semibold truncate max-w-[400px]">
                          {previewVal}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={12} className="text-[var(--amber)] shrink-0" />
                        <span className="text-[var(--amber)]">
                          Path not matched in current response
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
