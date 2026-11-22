import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Play,
  Trash2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Upload,
  Search,
  Sparkles,
  Link2,
  FolderPlus,
  Clock,
  Layers,
  X,
  Sliders,
  Eye,
  AlertCircle,
  ExternalLink,
  History,
  Check,
  CheckSquare,
  FileText,
  List,
  Code2,
  Network,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn, methodColor, normalizeAuth, statusClass } from "../../lib/cn";
import { formatLatency, formatRelativeTime } from "../../lib/format";
import { useToast } from "../ui/Toast";
import { ContextMenu } from "../ui/ContextMenu";
import { WorkflowFlowGraph } from "./WorkflowFlowGraph";

interface Props {
  sidebar?: boolean;
}

export interface StepAssertion {
  id?: string;
  type: "status_code" | "response_time" | "json_path" | "header";
  operator: "equals" | "not_equals" | "less_than" | "contains" | "exists" | "is_not_empty";
  target?: string;
  value: string;
}

export interface AssertionResult {
  type: string;
  target?: string;
  operator: string;
  expected: string;
  actual: string;
  passed: boolean;
}

interface ExtractRule {
  var_name: string;
  json_path: string;
}

interface WorkflowStep {
  id?: string;
  name: string;
  method: string;
  url: string;
  order_index?: number;
  configuration?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: any;
    auth?: any;
    enabled?: boolean;
    is_enabled?: boolean;
    wait_seconds?: number;
    assertions?: StepAssertion[];
    execution_mode?: "sequential" | "parallel";
  };
  extract_vars?: ExtractRule[];
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  workspace_id?: string;
  steps?: WorkflowStep[];
  step_count?: number;
  created_at?: string;
}

interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  workspace_id: string;
  status: "completed" | "failed" | "partial";
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  duration_ms: number;
  results: StepResult[];
  created_at: string;
}

interface StepResult {
  step_id?: string;
  step_name: string;
  order_index?: number;
  status: "completed" | "failed" | "skipped";
  duration_ms?: number;
  response?: {
    status_code?: number;
    status_text?: string;
    duration_ms?: number;
    size_bytes?: number;
    headers?: Record<string, string>;
    body?: any;
  } | null;
  error?: string | null;
  extracted_vars?: Record<string, string>;
  assertion_results?: AssertionResult[];
}

interface WorkflowContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  workflow: Workflow | null;
}

function downloadJson(data: any, filename: string) {
  const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text: string, filename: string, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateMarkdownReport(workflow: Workflow, results: StepResult[]): string {
  const passed = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  const dateStr = new Date().toISOString();

  let md = `# Workflow Run Report: ${workflow.name}\n\n`;
  md += `**Date:** ${dateStr}  \n`;
  md += `**Status:** ${failed === 0 ? "PASSED" : "FAILED"} (${passed}/${results.length} passed)  \n`;
  md += `**Total Duration:** ${formatLatency(totalDuration)}  \n\n`;

  md += `## Steps Summary\n\n`;
  md += `| # | Step Name | Status | Latency | Response | Assertions |\n`;
  md += `|---|-----------|--------|---------|----------|------------|\n`;

  results.forEach((r, idx) => {
    const statusMark = r.status === "completed" ? "PASS" : r.status === "skipped" ? "SKIP" : "FAIL";
    const statusCode = r.response?.status_code ? `${r.response.status_code}` : "-";
    const passAsserts = (r.assertion_results || []).filter((a) => a.passed).length;
    const totalAsserts = (r.assertion_results || []).length;
    const assertStr = totalAsserts > 0 ? `${passAsserts}/${totalAsserts}` : "-";
    md += `| ${idx + 1} | ${r.step_name} | ${statusMark} | ${Math.round(r.duration_ms || 0)}ms | ${statusCode} | ${assertStr} |\n`;
  });

  md += `\n## Detailed Execution Logs\n\n`;
  results.forEach((r, idx) => {
    md += `### Step ${idx + 1}: ${r.step_name}\n`;
    md += `- **Status:** ${r.status}\n`;
    md += `- **Duration:** ${Math.round(r.duration_ms || 0)}ms\n`;
    if (r.error) {
      md += `- **Error:** \`${r.error}\`\n`;
    }
    if (r.extracted_vars && Object.keys(r.extracted_vars).length > 0) {
      md += `- **Extracted Variables:**\n`;
      Object.entries(r.extracted_vars).forEach(([k, v]) => {
        md += `  - \`{{${k}}}\` = \`${v}\`\n`;
      });
    }
    if (r.assertion_results && r.assertion_results.length > 0) {
      md += `- **Assertions:**\n`;
      r.assertion_results.forEach((a) => {
        md += `  - [${a.passed ? "x" : " "}] ${a.type} ${a.operator} \`${a.expected}\` (Actual: \`${a.actual}\`)\n`;
      });
    }
    md += `\n`;
  });

  return md;
}

function generateHtmlReport(workflow: Workflow, results: StepResult[]): string {
  const passed = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  const isAllPassed = failed === 0;

  const rowsHtml = results.map((r, i) => {
    const passColor = r.status === "completed" ? "#10b981" : r.status === "skipped" ? "#6b7280" : "#ef4444";
    const statusBadge = `<span style="background:${passColor}20;color:${passColor};padding:3px 8px;border-radius:4px;font-weight:bold;font-size:11px;">${r.status.toUpperCase()}</span>`;
    const asserts = (r.assertion_results || []).map(a => `<div style="font-size:11px;color:${a.passed ? '#10b981' : '#ef4444'};margin-top:2px;">${a.passed ? '✓' : '✗'} ${a.type} ${a.operator} ${a.expected} (${a.actual})</div>`).join("");
    return `
      <tr style="border-bottom:1px solid #27272a;">
        <td style="padding:10px;font-family:monospace;color:#71717a;">${i + 1}</td>
        <td style="padding:10px;font-weight:600;">${r.step_name}</td>
        <td style="padding:10px;">${statusBadge}</td>
        <td style="padding:10px;font-family:monospace;color:#94a3b8;">${Math.round(r.duration_ms || 0)}ms</td>
        <td style="padding:10px;font-family:monospace;">${r.response?.status_code || "—"}</td>
        <td style="padding:10px;">${asserts || '<span style="color:#52525b;">—</span>'}</td>
      </tr>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Workflow Report - ${workflow.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 35px; }
    .container { max-width: 950px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 25px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .header { border-bottom: 1px solid #27272a; padding-bottom: 20px; margin-bottom: 20px; }
    .title { font-size: 22px; font-weight: bold; margin: 0 0 12px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; background: ${isAllPassed ? '#10b98125' : '#ef444425'}; color: ${isAllPassed ? '#10b981' : '#ef4444'}; border: 1px solid ${isAllPassed ? '#10b98140' : '#ef444440'}; }
    .stats { display: flex; gap: 20px; margin-top: 15px; font-size: 13px; color: #a1a1aa; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { text-align: left; padding: 10px; border-bottom: 2px solid #3f3f46; color: #71717a; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
    .footer { margin-top: 30px; font-size: 11px; color: #52525b; text-align: center; border-top: 1px solid #27272a; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">${workflow.name}</h1>
      <span class="badge">${isAllPassed ? "✓ ALL STEPS PASSED" : "⚠ SOME STEPS FAILED"}</span>
      <div class="stats">
        <span>Passed: <b>${passed}/${results.length}</b></span>
        <span>Duration: <b>${Math.round(totalDuration)}ms</b></span>
        <span>Executed at: <b>${new Date().toLocaleString()}</b></span>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>Step</th><th>Status</th><th>Latency</th><th>Code</th><th>Assertions</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <div class="footer">Generated by KuroRelay Workflow Studio</div>
  </div>
</body>
</html>`;
}

function getUniqueEntryKey(entries: Record<string, string>, base: string): string {
  let key = base;
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(entries, key)) {
    key = `${base} ${suffix}`;
    suffix += 1;
  }
  return key;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((record, item) => {
      if (item && typeof item === "object" && "key" in item) {
        const pair = item as { key?: unknown; value?: unknown; enabled?: unknown };
        if (pair.key && pair.enabled !== false) {
          record[String(pair.key)] = String(pair.value ?? "");
        }
      }
      return record;
    }, {});
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, String(entry ?? "")]),
    );
  }
  return {};
}

function toWorkflowBody(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const body = value as Record<string, unknown>;
    if (body.type === "json" && typeof body.content === "string") {
      try {
        return { ...body, content: JSON.parse(body.content) };
      } catch {
        return { type: "raw", content: body.content };
      }
    }
    return body;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return { type: "json", content: JSON.parse(value) };
    } catch {
      return { type: "raw", content: value };
    }
  }
  return { type: "none" };
}

function toWorkflowAuth(value: unknown): Record<string, unknown> | undefined {
  const auth = normalizeAuth(value);
  if (auth.type === "none") return undefined;
  if (auth.configuration && Object.keys(auth.configuration).length > 0) {
    return { type: auth.type, configuration: auth.configuration };
  }
  if (auth.type === "bearer") {
    return { type: auth.type, configuration: { token: auth.token || "" } };
  }
  if (auth.type === "basic") {
    return {
      type: auth.type,
      configuration: { username: auth.username || "", password: auth.password || "" },
    };
  }
  return {
    type: auth.type,
    configuration: { key: auth.key || "", value: auth.value || "" },
  };
}

function toTabAuth(value: unknown) {
  const auth = normalizeAuth(value);
  const configuration = auth.configuration || {};
  return {
    ...auth,
    token: auth.token ?? configuration.token,
    username: auth.username ?? configuration.username,
    password: auth.password ?? configuration.password,
    key: auth.key ?? configuration.key,
    value: auth.value ?? configuration.value,
  };
}

export function WorkflowStudioView({ sidebar = false }: Props) {
  const {
    activeWorkspaceId,
    activeEnvironmentId,
    environments,
    setEnvironments,
    setActiveEnvironment,
    globalVariables,
    setGlobalVariables,
    workflows,
    setWorkflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    openTab,
  } = useAppStore();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);

  // Workflow filter (sidebar)
  const [workflowSearch, setWorkflowSearch] = useState("");

  // View Mode: List vs Node Visual Flowchart
  const [viewMode, setViewMode] = useState<"list" | "nodes">("list");

  // Runner options
  const [selectedEnvId, setSelectedEnvId] = useState<string>(activeEnvironmentId || "");
  const [delayMs, setDelayMs] = useState<number>(0);
  const [stopOnFailure, setStopOnFailure] = useState<boolean>(true);

  // Step editing / expansion
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);
  const [expandedSubTab, setExpandedSubTab] = useState<"headers" | "params" | "body" | "extract" | "assertions">("headers");
  const [expandedResults, setExpandedResults] = useState<Record<number, boolean>>({});

  // History & Run Logs
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<WorkflowRunRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Live Variables Watcher
  const [variablesWatcherOpen, setVariablesWatcherOpen] = useState(false);
  const [activeVariables, setActiveVariables] = useState<Record<string, string>>({});

  // Single step run state
  const [runningStepIdx, setRunningStepIdx] = useState<number | null>(null);

  // Export report dropdown
  const [reportExportOpen, setReportExportOpen] = useState(false);

  // Import Modal (from Collection or History)
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSource, setImportSource] = useState<"collections" | "history">("collections");
  const [collectionsList, setCollectionsList] = useState<any[]>([]);
  const [selectedColForImport, setSelectedColForImport] = useState<string>("");
  const [collectionRequests, setCollectionRequests] = useState<any[]>([]);
  const [recentHistory, setRecentHistory] = useState<any[]>([]);

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<WorkflowContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    workflow: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingWorkflowSavesRef = useRef(0);

  // Inline rename
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  // Sync activeEnvId to runner
  useEffect(() => {
    if (
      activeEnvironmentId &&
      (environments as any[]).some(
        (environment) =>
          environment.id === activeEnvironmentId &&
          environment.name.toLowerCase() !== "globals",
      )
    ) {
      setSelectedEnvId(activeEnvironmentId);
    }
  }, [activeEnvironmentId, environments]);

  useEffect(() => {
    if (sidebar) return;
    if (!activeWorkspaceId) {
      setEnvironments([]);
      setGlobalVariables([]);
      setSelectedEnvId("");
      return;
    }

    let cancelled = false;
    setEnvironmentLoading(true);
    bridge
      .getEnvironments(activeWorkspaceId)
      .then((res: any) => {
        if (res?.status !== "ok" || !Array.isArray(res.environments)) {
          throw new Error(res?.error?.message || "Could not load workspace environments");
        }
        if (cancelled) return;

        const list = res.environments;
        setEnvironments(list);
        const globalsEnv = list.find(
          (environment: any) => environment.name?.toLowerCase() === "globals",
        );
        setGlobalVariables(globalsEnv?.variables || []);

        const selectable = list.filter(
          (environment: any) => environment.name?.toLowerCase() !== "globals",
        );
        const active =
          selectable.find((environment: any) => environment.id === activeEnvironmentId) ||
          selectable.find((environment: any) => environment.is_active);
        setSelectedEnvId(active?.id || "");
        if (active && active.id !== activeEnvironmentId) {
          setActiveEnvironment(active.id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast(err instanceof Error ? err.message : "Could not load workspace environments", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setEnvironmentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    sidebar,
    activeWorkspaceId,
    activeEnvironmentId,
    setEnvironments,
    setActiveEnvironment,
    setGlobalVariables,
    toast,
  ]);

  // Load workflows list
  const load = useCallback(() => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    bridge
      .getWorkflows(activeWorkspaceId)
      .then((r: any) => {
        const list: Workflow[] = r?.workflows ?? [];
        setWorkflows(list);
        if (list.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(list[0].id);
        }
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [activeWorkspaceId, selectedWorkflowId, setWorkflows, setSelectedWorkflowId]);

  useEffect(() => {
    load();
  }, [load]);

  // Load selected workflow details whenever selectedWorkflowId changes
  useEffect(() => {
    if (selectedWorkflowId) {
      bridge
        .getWorkflow(selectedWorkflowId)
        .then((res: any) => {
          if (res?.workflow) {
            setSelected(res.workflow);
            setResults([]);
            setOverallStatus(null);
            setExpandedStepIndex(null);
            setIsRenaming(false);
          }
        })
        .catch(console.error);
    } else {
      setSelected(null);
    }
  }, [selectedWorkflowId]);

  // Create new workflow
  const createWorkflow = async (name?: string) => {
    if (!activeWorkspaceId) return;
    try {
      const newName = name || `Workflow ${workflows.length + 1}`;
      const res = (await bridge.createWorkflow({
        workspace_id: activeWorkspaceId,
        name: newName,
        description: "Automated sequence of chained requests",
      })) as any;
      if (res?.workflow) {
        toast(`Created "${newName}"`, "success");
        await load();
        setSelectedWorkflowId(res.workflow.id);
      }
    } catch (e: any) {
      toast(e?.message || "Failed to create workflow", "error");
    }
  };

  // Duplicate workflow
  const duplicateWorkflow = async (wf: Workflow) => {
    if (!activeWorkspaceId) return;
    try {
      const full = ((await bridge.getWorkflow(wf.id)) as any)?.workflow || wf;
      const res = (await bridge.createWorkflow({
        workspace_id: activeWorkspaceId,
        name: `${full.name} (Copy)`,
        description: full.description || "",
      })) as any;
      const created = res?.workflow;
      if (created && full.steps && full.steps.length > 0) {
        await bridge.updateWorkflow({
          workflow_id: created.id,
          steps: full.steps,
        });
      }
      toast(`Duplicated "${full.name}"`, "success");
      load();
    } catch (e: any) {
      toast(e?.message || "Failed to duplicate workflow", "error");
    }
  };

  // Delete workflow
  const deleteWorkflow = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      await bridge.deleteWorkflow(id);
      toast("Workflow deleted", "success");
      if (selectedWorkflowId === id) {
        const remaining = (workflows as Workflow[]).filter((w) => w.id !== id);
        setSelectedWorkflowId(remaining.length > 0 ? remaining[0].id : null);
      }
      load();
    } catch (e: any) {
      toast(e?.message || "Failed to delete workflow", "error");
    }
  };

  // Commit steps update to backend
  const commitWorkflowSteps = async (nextSteps: WorkflowStep[]): Promise<boolean> => {
    if (!selected) return false;
    const reindexed = nextSteps.map((s, idx) => ({ ...s, order_index: idx }));
    pendingWorkflowSavesRef.current += 1;
    setSavingWorkflow(true);
    try {
      const res = (await bridge.updateWorkflow({
        workflow_id: selected.id,
        name: selected.name,
        description: selected.description,
        steps: reindexed,
      })) as any;
      if (res?.status !== "ok" || !res.workflow) {
        throw new Error(res?.error?.message || "Workflow update returned no saved workflow");
      }
      setSelected(res.workflow);
      setWorkflows(
        (workflows as Workflow[]).map((workflow) =>
          workflow.id === selected.id
            ? { ...workflow, step_count: reindexed.length }
            : workflow,
        ),
      );
      return true;
    } catch (e: any) {
      toast(e?.message || "Failed to update workflow steps", "error");
      return false;
    } finally {
      pendingWorkflowSavesRef.current -= 1;
      if (pendingWorkflowSavesRef.current === 0) setSavingWorkflow(false);
    }
  };

  // Rename workflow
  const handleCommitRename = async () => {
    if (!selected || !renameDraft.trim()) {
      setIsRenaming(false);
      return;
    }
    try {
      const res = (await bridge.updateWorkflow({
        workflow_id: selected.id,
        name: renameDraft.trim(),
        description: selected.description,
      })) as any;
      if (res?.workflow) {
        setSelected(res.workflow);
        setWorkflows(
          (workflows as Workflow[]).map((w) =>
            w.id === selected.id ? { ...w, name: renameDraft.trim() } : w,
          ),
        );
        toast("Workflow renamed", "success");
      }
    } catch (e: any) {
      toast(e?.message || "Failed to rename", "error");
    } finally {
      setIsRenaming(false);
    }
  };

  // Run workflow execution
  const runWorkflow = async () => {
    if (!selected || steps.length === 0) return;
    if (pendingWorkflowSavesRef.current > 0) {
      toast("Wait for workflow changes to save before running", "info");
      return;
    }
    setRunning(true);
    setResults([]);
    setOverallStatus(null);
    setExpandedResults({});

    try {
      const scopes: Record<string, Record<string, string>> = {};

      if (globalVariables.length > 0) {
        scopes["global"] = Object.fromEntries(
          globalVariables
            .filter((v: any) => v.is_enabled !== false)
            .map((v: any) => [v.key, v.value]),
        );
      }

      toast(`Running "${selected.name}"...`, "info");

      const res = (await bridge.runWorkflow({
        workflow_id: selected.id,
        workspace_id: activeWorkspaceId,
        environment_id: selectedEnvId || undefined,
        variable_scopes: scopes,
        options: {
          delay_ms: delayMs,
          stop_on_failure: stopOnFailure,
        },
      })) as any;

      const runRes = res?.run_result || res;
      const resList = runRes?.results || [];
      const status = runRes?.status || "completed";

      setResults(resList);
      setOverallStatus(status);

      const allExtracted: Record<string, string> = {};
      for (const r of resList) {
        if (r.extracted_vars) {
          Object.assign(allExtracted, r.extracted_vars);
        }
      }
      setActiveVariables(allExtracted);
      if (selected?.id) {
        loadWorkflowRuns(selected.id);
      }

      if (status === "completed") {
        toast(`Workflow "${selected.name}" completed successfully!`, "success");
      } else if (status === "partial") {
        toast(`Workflow completed with some failed steps.`, "error");
      } else {
        toast(`Workflow execution failed.`, "error");
      }
    } catch (e: any) {
      toast(e?.message || "Workflow execution encountered an error", "error");
    } finally {
      setRunning(false);
    }
  };

  // Add blank step
  const handleAddBlankStep = async () => {
    if (!selected) return;
    const currentSteps = selected.steps || [];
    const newStep: WorkflowStep = {
      name: `Step ${currentSteps.length + 1}`,
      method: "GET",
      url: "https://httpbin.org/get",
      order_index: currentSteps.length,
      configuration: {
        headers: {},
        params: {},
        body: { type: "none" },
        enabled: true,
      },
      extract_vars: [],
    };
    const next = [...currentSteps, newStep];
    if (!(await commitWorkflowSteps(next))) return;
    setExpandedStepIndex(next.length - 1);
    toast("Added new step", "success");
  };

  // Step controls
  const handleMoveStep = async (index: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentSteps.length) return;

    const temp = currentSteps[index];
    currentSteps[index] = currentSteps[targetIndex];
    currentSteps[targetIndex] = temp;

    if (!(await commitWorkflowSteps(currentSteps))) return;
    if (expandedStepIndex === index) setExpandedStepIndex(targetIndex);
  };

  const handleToggleStepEnabled = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const s = { ...currentSteps[index] };
    const cfg = { ...(s.configuration || {}) };
    const curr = cfg.enabled !== false && cfg.is_enabled !== false;
    cfg.enabled = !curr;
    cfg.is_enabled = !curr;
    s.configuration = cfg;
    currentSteps[index] = s;
    if (!(await commitWorkflowSteps(currentSteps))) return;
    toast(cfg.enabled ? `Enabled "${s.name}"` : `Skipped "${s.name}"`, "info");
  };

  const handleDuplicateStep = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const original = currentSteps[index];
    const duplicate: WorkflowStep = {
      ...original,
      name: `${original.name} (Copy)`,
      order_index: index + 1,
    };
    currentSteps.splice(index + 1, 0, duplicate);
    if (!(await commitWorkflowSteps(currentSteps))) return;
    toast(`Duplicated "${original.name}"`, "success");
  };

  const handleDeleteStep = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    currentSteps.splice(index, 1);
    if (!(await commitWorkflowSteps(currentSteps))) return;
    if (expandedStepIndex === index) setExpandedStepIndex(null);
    toast("Step deleted", "success");
  };

  const handleUpdateStepField = (index: number, patch: Partial<WorkflowStep>) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    currentSteps[index] = { ...currentSteps[index], ...patch };
    commitWorkflowSteps(currentSteps);
  };

  const handleUpdateStepConfig = (index: number, patch: Partial<WorkflowStep["configuration"]>) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[index];
    currentSteps[index] = {
      ...current,
      configuration: { ...(current.configuration || {}), ...patch },
    };
    commitWorkflowSteps(currentSteps);
  };

  // Variable Extraction Rules
  const handleAddExtractRule = (index: number) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[index];
    const rules = [...(current.extract_vars || [])];
    rules.push({ var_name: `var_${rules.length + 1}`, json_path: "data.id" });
    currentSteps[index] = { ...current, extract_vars: rules };
    commitWorkflowSteps(currentSteps);
  };

  const handleUpdateExtractRule = (
    stepIndex: number,
    ruleIndex: number,
    field: "var_name" | "json_path",
    val: string,
  ) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const rules = [...(current.extract_vars || [])];
    rules[ruleIndex] = { ...rules[ruleIndex], [field]: val };
    currentSteps[stepIndex] = { ...current, extract_vars: rules };
    commitWorkflowSteps(currentSteps);
  };

  const handleDeleteExtractRule = (stepIndex: number, ruleIndex: number) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const rules = [...(current.extract_vars || [])];
    rules.splice(ruleIndex, 1);
    currentSteps[stepIndex] = { ...current, extract_vars: rules };
    commitWorkflowSteps(currentSteps);
  };

  // Add Wait / Delay step
  const handleAddWaitStep = async () => {
    if (!selected) return;
    const currentSteps = selected.steps || [];
    const newStep: WorkflowStep = {
      name: `Delay (1s)`,
      method: "WAIT",
      url: "",
      order_index: currentSteps.length,
      configuration: {
        wait_seconds: 1.0,
        enabled: true,
      },
      extract_vars: [],
    };
    const next = [...currentSteps, newStep];
    if (!(await commitWorkflowSteps(next))) return;
    setExpandedStepIndex(next.length - 1);
    toast("Added delay step", "info");
  };

  // Assertions Handlers
  const handleAddAssertion = (stepIndex: number, assertion: StepAssertion) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const cfg = current.configuration || {};
    const existing = cfg.assertions || [];
    const updated = [...existing, { ...assertion, id: crypto.randomUUID() }];
    currentSteps[stepIndex] = { ...current, configuration: { ...cfg, assertions: updated } };
    commitWorkflowSteps(currentSteps);
    toast("Assertion added", "success");
  };

  const handleUpdateAssertion = (
    stepIndex: number,
    assertIdx: number,
    patch: Partial<StepAssertion>,
  ) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const cfg = current.configuration || {};
    const existing = [...(cfg.assertions || [])];
    existing[assertIdx] = { ...existing[assertIdx], ...patch };
    currentSteps[stepIndex] = { ...current, configuration: { ...cfg, assertions: existing } };
    commitWorkflowSteps(currentSteps);
  };

  const handleRemoveAssertion = (stepIndex: number, assertIdx: number) => {
    if (!selected) return;
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const cfg = current.configuration || {};
    const existing = (cfg.assertions || []).filter((_, i) => i !== assertIdx);
    currentSteps[stepIndex] = { ...current, configuration: { ...cfg, assertions: existing } };
    commitWorkflowSteps(currentSteps);
  };

  // Quick Extract Helper from Response Body
  const handleQuickExtract = (stepIndex: number, jsonPath: string, suggestedName?: string) => {
    if (!selected) return;
    const varName = (suggestedName || jsonPath.split(".").pop() || "extracted_var").replace(/[^a-zA-Z0-9_]/g, "_");
    const currentSteps = [...(selected.steps || [])];
    const current = currentSteps[stepIndex];
    const existing = [...(current.extract_vars || [])];
    existing.push({ var_name: varName, json_path: jsonPath });
    currentSteps[stepIndex] = { ...current, extract_vars: existing };
    commitWorkflowSteps(currentSteps);
    toast(`Added extraction: {{${varName}}} from ${jsonPath}`, "success");
  };

  // Run Single Step
  const handleRunSingleStep = async (stepIndex: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selected || runningStepIdx !== null) return;
    const step = steps[stepIndex];
    if (!step) return;

    setRunningStepIdx(stepIndex);
    try {
      const res: any = await bridge.runWorkflowStep({
        step_data: step,
        workspace_id: activeWorkspaceId,
        variable_scopes: { workflow: activeVariables },
        environment_id: selectedEnvId || undefined,
      });

      if (res?.status === "ok" && res.step_result) {
        const stepRes: StepResult = res.step_result;
        if (stepRes.extracted_vars && Object.keys(stepRes.extracted_vars).length > 0) {
          setActiveVariables((prev) => ({ ...prev, ...stepRes.extracted_vars }));
        }
        setResults((prev) => {
          const next = [...prev];
          next[stepIndex] = stepRes;
          return next;
        });
        toast(
          `Executed: ${step.name} (${stepRes.status})`,
          stepRes.status === "completed" ? "success" : "error"
        );
      } else {
        toast(res?.error?.message || "Step execution failed", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Execution error", "error");
    } finally {
      setRunningStepIdx(null);
    }
  };

  // History Runs Loader
  const loadWorkflowRuns = useCallback(async (workflowId: string) => {
    setHistoryLoading(true);
    try {
      const res: any = await bridge.getWorkflowRuns(workflowId, 30);
      if (res?.status === "ok") {
        setHistoryRuns(res.runs || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const clearWorkflowHistory = async () => {
    if (!selected) return;
    try {
      await bridge.clearWorkflowRuns(selected.id);
      setHistoryRuns([]);
      toast("Run history cleared.", "info");
    } catch {
      toast("Could not clear history.", "error");
    }
  };

  // Open Step in Request Tab
  const handleOpenStepInTab = (step: WorkflowStep, e: React.MouseEvent) => {
    e.stopPropagation();
    const cfg = step.configuration || {};
    const headersList = Object.entries(toStringRecord(cfg.headers)).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
    const paramsList = Object.entries(toStringRecord(cfg.params)).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
    openTab({
      method: step.method,
      url: step.url,
      name: step.name,
      headers: headersList,
      params: paramsList,
      body: cfg.body || { type: "none" },
      auth: toTabAuth(cfg.auth),
    });
    toast(`Opened "${step.name}" in Workbench Tab`, "info");
  };

  // Export Workflow as JSON
  const handleExportWorkflow = async (wf: Workflow) => {
    const filename = `workflow_${wf.name.toLowerCase().replace(/\s+/g, "_")}.json`;
    try {
      const result = await bridge.saveFile(JSON.stringify(wf, null, 2), filename, ["json"]);
      if (result?.status === "cancelled") return;
      if (result?.status === "ok" && result.path) {
        toast(`Exported "${wf.name}" as JSON`, "success");
        return;
      }
      if (result?.status === "unavailable" || (result?.status === "ok" && !result.path)) {
        downloadJson(wf, filename);
        toast(`Exported "${wf.name}" as JSON`, "success");
        return;
      }
      throw new Error(result?.error || "Could not save workflow export");
    } catch (e: any) {
      toast(e?.message || "Failed to export workflow", "error");
    }
  };

  // Import Workflow from JSON file
  const handleImportWorkflowFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!activeWorkspaceId) {
      toast("Select a workspace before importing a workflow", "error");
      input.value = "";
      return;
    }

    let createdId: string | null = null;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("The selected file must contain a workflow object");
      }
      if (parsed.steps !== undefined && !Array.isArray(parsed.steps)) {
        throw new Error("Workflow steps must be an array");
      }

      const name = typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : "Imported Workflow";
      const importedSteps = parsed.steps || [];
      const res = (await bridge.createWorkflow({
        workspace_id: activeWorkspaceId,
        name: `${name} (Imported)`,
        description: typeof parsed.description === "string"
          ? parsed.description
          : "Imported from JSON",
      })) as any;
      if (res?.status !== "ok" || !res.workflow?.id) {
        throw new Error(res?.error?.message || "Could not create the imported workflow");
      }

      createdId = res.workflow.id;
      if (importedSteps.length > 0) {
        const updateRes = (await bridge.updateWorkflow({
          workflow_id: createdId,
          steps: importedSteps,
        })) as any;
        if (updateRes?.status !== "ok" || !updateRes.workflow) {
          throw new Error(updateRes?.error?.message || "Could not import workflow steps");
        }
      }

      toast(`Imported workflow "${name}" successfully`, "success");
      load();
      setSelectedWorkflowId(createdId);
    } catch (err) {
      if (createdId) {
        try {
          await bridge.deleteWorkflow(createdId);
        } catch (cleanupError) {
          console.error("Could not remove incomplete imported workflow", cleanupError);
        }
      }
      toast(err instanceof Error ? err.message : "Failed to import workflow", "error");
    } finally {
      input.value = "";
    }
  };

  // Open Import Steps Modal
  const handleOpenImportModal = async () => {
    setImportModalOpen(true);
    setImportError("");
    setCollectionsList([]);
    setCollectionRequests([]);
    setRecentHistory([]);
    if (!activeWorkspaceId) {
      setImportError("Select a workspace before importing a request.");
      return;
    }

    setImportLoading(true);
    const errors: string[] = [];
    try {
      const res: any = await bridge.getCollections(activeWorkspaceId);
      if (res?.status !== "ok") {
        throw new Error(res?.error?.message || "Could not load collections");
      }
      const cols = res?.collections || [];
      setCollectionsList(cols);
      if (cols.length > 0) {
        setSelectedColForImport(cols[0].id);
        const reqRes: any = await bridge.getCollectionRequests(cols[0].id);
        if (reqRes?.status !== "ok") {
          throw new Error(reqRes?.error?.message || "Could not load collection requests");
        }
        setCollectionRequests(reqRes?.requests || []);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Could not load collections");
    }

    try {
      const histRes: any = await bridge.getRequestHistory(activeWorkspaceId, 1, 20);
      if (histRes?.status !== "ok") {
        throw new Error(histRes?.error?.message || "Could not load request history");
      }
      setRecentHistory(histRes?.items || []);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Could not load request history");
    } finally {
      setImportLoading(false);
    }
    setImportError(errors.join(". "));
  };

  const handleSelectCollectionForImport = async (colId: string) => {
    setSelectedColForImport(colId);
    setCollectionRequests([]);
    setImportError("");
    try {
      const reqRes: any = await bridge.getCollectionRequests(colId);
      if (reqRes?.status !== "ok") {
        throw new Error(reqRes?.error?.message || "Could not load collection requests");
      }
      setCollectionRequests(reqRes?.requests || []);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not load collection requests");
    }
  };

  const handleImportRequestAsStep = async (reqItem: any) => {
    if (!selected) return;
    const currentSteps = selected.steps || [];
    const cfg = reqItem.configuration || {};
    const newStep: WorkflowStep = {
      name: reqItem.name || `${reqItem.method} ${reqItem.url}`,
      method: reqItem.method || "GET",
      url: reqItem.url || "",
      order_index: currentSteps.length,
      configuration: {
        headers: toStringRecord(cfg.headers),
        params: toStringRecord(cfg.params),
        body: toWorkflowBody(cfg.body),
        auth: toWorkflowAuth(cfg.auth),
        enabled: true,
      },
      extract_vars: [],
    };
    const next = [...currentSteps, newStep];
    if (!(await commitWorkflowSteps(next))) return;
    toast(`Imported step "${newStep.name}" into workflow`, "success");
    setImportModalOpen(false);
  };

  // Filtered workflows for sidebar list
  const filteredWorkflows = useMemo(() => {
    const list = workflows as Workflow[];
    if (!workflowSearch.trim()) return list;
    const q = workflowSearch.toLowerCase();
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q)),
    );
  }, [workflows, workflowSearch]);

  const steps = selected?.steps || [];

  // Summary statistics for execution
  const executionStats = useMemo(() => {
    if (results.length === 0) return null;
    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const totalDuration = results.reduce((acc, r) => acc + (r.duration_ms || 0), 0);
    const extractedList: Array<{ step: string; key: string; val: string }> = [];

    for (const r of results) {
      if (r.extracted_vars) {
        for (const [k, v] of Object.entries(r.extracted_vars)) {
          extractedList.push({ step: r.step_name, key: k, val: v });
        }
      }
    }

    return {
      completed,
      failed,
      skipped,
      totalDuration: Math.round(totalDuration),
      extractedList,
    };
  }, [results]);

  // ── 1. SIDEBAR VIEW (Left Panel rendered inside Sidebar.tsx) ───────────────
  if (sidebar) {
    return (
      <div className="flex flex-col h-full overflow-hidden select-none bg-[var(--bg-base)]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportWorkflowFile}
        />

        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-dim)] shrink-0 bg-[var(--bg-s1)]">
          <div className="flex items-center gap-1.5">
            <Sliders size={13} className="text-[var(--lime)]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx-2)]">
              Workflows
            </span>
            <span className="text-[10px] text-[var(--tx-3)] font-mono">({workflows.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import Workflow (.json)"
              className="p-1 text-[var(--tx-3)] hover:text-cyan-400 rounded hover:bg-[var(--bg-s3)] transition-colors"
            >
              <Upload size={13} />
            </button>
            <button
              onClick={() => createWorkflow()}
              className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] rounded hover:bg-[var(--bg-s3)] transition-colors"
              title="Create New Workflow"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-2 border-b border-[var(--border-dim)] bg-[var(--bg-s1)]">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-s2)] rounded-[var(--r-sm)] border border-[var(--border)] text-xs text-[var(--tx-2)] focus-within:border-[var(--lime)]">
            <Search size={11} className="text-[var(--tx-3)] shrink-0" />
            <input
              type="text"
              value={workflowSearch}
              onChange={(e) => setWorkflowSearch(e.target.value)}
              placeholder="Search workflows..."
              className="bg-transparent outline-none flex-1 text-xs text-[var(--tx-1)]"
            />
            {workflowSearch && (
              <button
                onClick={() => setWorkflowSearch("")}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Workflows List */}
        <div className="flex-1 overflow-auto py-1">
          {loading && workflows.length === 0 ? (
            <div className="text-xs text-[var(--tx-3)] px-3 py-6 text-center">Loading workflows…</div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--tx-3)] flex flex-col items-center gap-2">
              <Sliders size={24} strokeWidth={1.5} className="text-[var(--tx-3)]" />
              <p>{workflowSearch ? "No matching workflows" : "No workflows yet"}</p>
              <button
                onClick={() => createWorkflow()}
                className="mt-1 text-xs text-[var(--lime)] font-medium hover:underline"
              >
                + Create First Workflow
              </button>
            </div>
          ) : (
            filteredWorkflows.map((wf) => {
              const isSel = selectedWorkflowId === wf.id;
              return (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({
                      visible: true,
                      x: Math.min(e.clientX, window.innerWidth - 200),
                      y: Math.min(e.clientY, window.innerHeight - 240),
                      workflow: wf,
                    });
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-l-2",
                    isSel
                      ? "bg-[var(--bg-s3)] text-[var(--tx-1)] border-[var(--lime)] font-semibold shadow-xs"
                      : "text-[var(--tx-2)] hover:bg-[var(--bg-hover)] border-transparent",
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs truncate">{wf.name}</span>
                    <span className="text-[10px] text-[var(--tx-3)] font-mono">
                      {wf.step_count ?? wf.steps?.length ?? 0} steps
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorkflowId(wf.id);
                        setTimeout(runWorkflow, 100);
                      }}
                      title="Run Workflow"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] rounded"
                    >
                      <Play size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkflow(wf.id);
                      }}
                      title="Delete"
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Context Menu */}
        {ctxMenu.visible && ctxMenu.workflow && (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            header={ctxMenu.workflow.name}
            onClose={() => setCtxMenu((current) => ({ ...current, visible: false }))}
            items={[
              {
                label: "Run Workflow",
                icon: <Play size={12} />,
                tone: "lime",
                onSelect: () => {
                  const workflow = ctxMenu.workflow!;
                  setSelectedWorkflowId(workflow.id);
                  setTimeout(runWorkflow, 100);
                },
              },
              {
                label: "Duplicate Workflow",
                icon: <Copy size={12} />,
                onSelect: () => duplicateWorkflow(ctxMenu.workflow!),
              },
              {
                label: "Export as JSON",
                icon: <Download size={12} />,
                onSelect: () => handleExportWorkflow(ctxMenu.workflow!),
              },
              {
                label: "Rename Workflow",
                icon: <Sliders size={12} />,
                onSelect: () => {
                  const workflow = ctxMenu.workflow!;
                  setSelectedWorkflowId(workflow.id);
                  setIsRenaming(true);
                  setRenameDraft(workflow.name);
                },
              },
              { label: "", separator: true },
              {
                label: "Delete Workflow",
                icon: <Trash2 size={12} />,
                danger: true,
                onSelect: () => deleteWorkflow(ctxMenu.workflow!.id),
              },
            ]}
          />
        )}
      </div>
    );
  }

  // ── Step Configuration Editor Sub-Component (Shared by List View & ReactFlow Node View) ──
  const renderStepConfig = (idx: number) => {
    const step = steps[idx];
    if (!step) return null;
    const cfg = step.configuration || {};
    const extractCount = (step.extract_vars || []).length;
    const headerCount = Object.keys(cfg.headers || {}).length;
    const paramCount = Object.keys(cfg.params || {}).length;
    const hasBody = Boolean(cfg.body && cfg.body.type !== "none");

    return (
      <div className="p-3 border-t border-[var(--border-dim)] bg-[var(--bg-s3)] flex flex-col gap-3 animate-in fade-in duration-100">
        {/* Step Name & URL inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-4 flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase text-[var(--tx-3)]">
              Step Name
            </label>
            <input
              type="text"
              defaultValue={step.name}
              onBlur={(e) => {
                if (e.target.value !== step.name) {
                  handleUpdateStepField(idx, { name: e.target.value });
                }
              }}
              className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
            />
          </div>

          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase text-[var(--tx-3)]">
              Method
            </label>
            <select
              value={step.method}
              onChange={(e) => handleUpdateStepField(idx, { method: e.target.value })}
              className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "WAIT"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-6 flex flex-col gap-1">
            {step.method === "WAIT" ? (
              <>
                <label className="text-[10px] font-semibold uppercase text-amber-400">
                  Wait Duration (Seconds)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="60"
                  defaultValue={cfg.wait_seconds || 1.0}
                  onBlur={(e) => {
                    const secs = parseFloat(e.target.value) || 1.0;
                    handleUpdateStepConfig(idx, { wait_seconds: secs });
                  }}
                  className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none focus:border-amber-400"
                />
              </>
            ) : (
              <>
                <label className="text-[10px] font-semibold uppercase text-[var(--tx-3)]">
                  URL (Supports {"{{variables}}"})
                </label>
                <input
                  type="text"
                  defaultValue={step.url}
                  onBlur={(e) => {
                    if (e.target.value !== step.url) {
                      handleUpdateStepField(idx, { url: e.target.value });
                    }
                  }}
                  placeholder="https://api.example.com/users/{{userId}}"
                  className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
                />
              </>
            )}
          </div>
        </div>

        {/* Execution Mode Row */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-s2)] border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--tx-1)]">Execution Mode:</span>
            <span className="text-[10px] text-[var(--tx-3)]">
              {cfg.execution_mode === "parallel"
                ? "⚡ Runs concurrently in parallel with adjacent parallel steps"
                : "⬇ Runs sequentially in step order"}
            </span>
          </div>
          <div className="flex items-center gap-1 bg-[var(--bg-s3)] p-0.5 rounded-md border border-[var(--border)]">
            <button
              type="button"
              onClick={() => handleUpdateStepConfig(idx, { execution_mode: "sequential" })}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1",
                cfg.execution_mode !== "parallel"
                  ? "bg-[var(--bg-s1)] text-[var(--tx-1)] shadow-xs border border-[var(--border)] font-semibold"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              <span>⬇ Sequential</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdateStepConfig(idx, { execution_mode: "parallel" })}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1",
                cfg.execution_mode === "parallel"
                  ? "bg-amber-500/20 text-amber-300 shadow-xs border border-amber-500/40 font-semibold"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              <Zap size={11} className={cfg.execution_mode === "parallel" ? "text-amber-400 fill-amber-400" : ""} />
              <span>⚡ Parallel</span>
            </button>
          </div>
        </div>

        {/* Sub-tabs: Headers, Params, Body, Extract Variables, Assertions */}
        <div className="flex items-center gap-1 border-b border-[var(--border-dim)] pt-1 text-xs">
          <button
            onClick={() => setExpandedSubTab("headers")}
            className={cn(
              "px-3 py-1 font-semibold border-b-2 transition-colors",
              expandedSubTab === "headers"
                ? "border-[var(--lime)] text-[var(--lime)]"
                : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            Headers ({headerCount})
          </button>
          <button
            onClick={() => setExpandedSubTab("params")}
            className={cn(
              "px-3 py-1 font-semibold border-b-2 transition-colors",
              expandedSubTab === "params"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            Query Params ({paramCount})
          </button>
          <button
            onClick={() => setExpandedSubTab("body")}
            className={cn(
              "px-3 py-1 font-semibold border-b-2 transition-colors",
              expandedSubTab === "body"
                ? "border-[var(--amber)] text-[var(--amber)]"
                : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            Body {hasBody ? "•" : ""}
          </button>
          <button
            onClick={() => setExpandedSubTab("extract")}
            className={cn(
              "px-3 py-1 font-semibold border-b-2 transition-colors flex items-center gap-1",
              expandedSubTab === "extract"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            <Link2 size={11} />
            <span>Extract Variables ({extractCount})</span>
          </button>
          <button
            onClick={() => setExpandedSubTab("assertions")}
            className={cn(
              "px-3 py-1 font-semibold border-b-2 transition-colors flex items-center gap-1",
              expandedSubTab === "assertions"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
            )}
          >
            <CheckSquare size={11} />
            <span>Assertions ({(cfg.assertions || []).length})</span>
          </button>
        </div>

        {/* Headers Editor */}
        {expandedSubTab === "headers" && (
          <div className="flex flex-col gap-2">
            {headerCount === 0 && (
              <p className="text-[11px] text-[var(--tx-3)] italic">
                No headers specified. Click below to add.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {Object.entries(cfg.headers || {}).map(([hk, hv], hIdx) => (
                <div key={hIdx} className="flex items-center gap-2">
                  <input
                    type="text"
                    defaultValue={hk}
                    placeholder="Header Key"
                    onBlur={(e) => {
                      const newK = e.target.value.trim();
                      if (newK !== hk) {
                        const next = { ...(cfg.headers || {}) };
                        delete next[hk];
                        if (newK) next[newK] = hv;
                        handleUpdateStepConfig(idx, { headers: next });
                      }
                    }}
                    className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--lime)] outline-none w-1/3"
                  />
                  <input
                    type="text"
                    defaultValue={hv}
                    placeholder="Header Value"
                    onBlur={(e) => {
                      const next = { ...(cfg.headers || {}), [hk]: e.target.value };
                      handleUpdateStepConfig(idx, { headers: next });
                    }}
                    className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none flex-1"
                  />
                  <button
                    onClick={() => {
                      const next = { ...(cfg.headers || {}) };
                      delete next[hk];
                      handleUpdateStepConfig(idx, { headers: next });
                    }}
                    className="p-1 text-[var(--tx-3)] hover:text-[var(--err)]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const headers = { ...(cfg.headers || {}) };
                headers[getUniqueEntryKey(headers, "New Header")] = "";
                const next = headers;
                handleUpdateStepConfig(idx, { headers: next });
              }}
              className="self-start text-[11px] text-[var(--lime)] hover:underline flex items-center gap-1 font-semibold mt-1"
            >
              <Plus size={11} /> Add Header
            </button>
          </div>
        )}

        {/* Params Editor */}
        {expandedSubTab === "params" && (
          <div className="flex flex-col gap-2">
            {paramCount === 0 && (
              <p className="text-[11px] text-[var(--tx-3)] italic">
                No query parameters specified.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {Object.entries(cfg.params || {}).map(([pk, pv], pIdx) => (
                <div key={pIdx} className="flex items-center gap-2">
                  <input
                    type="text"
                    defaultValue={pk}
                    placeholder="Param Key"
                    onBlur={(e) => {
                      const newK = e.target.value.trim();
                      if (newK !== pk) {
                        const next = { ...(cfg.params || {}) };
                        delete next[pk];
                        if (newK) next[newK] = pv;
                        handleUpdateStepConfig(idx, { params: next });
                      }
                    }}
                    className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-cyan-400 outline-none w-1/3"
                  />
                  <input
                    type="text"
                    defaultValue={pv}
                    placeholder="Param Value"
                    onBlur={(e) => {
                      const next = { ...(cfg.params || {}), [pk]: e.target.value };
                      handleUpdateStepConfig(idx, { params: next });
                    }}
                    className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none flex-1"
                  />
                  <button
                    onClick={() => {
                      const next = { ...(cfg.params || {}) };
                      delete next[pk];
                      handleUpdateStepConfig(idx, { params: next });
                    }}
                    className="p-1 text-[var(--tx-3)] hover:text-[var(--err)]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const params = { ...(cfg.params || {}) };
                params[getUniqueEntryKey(params, "New Param")] = "";
                const next = params;
                handleUpdateStepConfig(idx, { params: next });
              }}
              className="self-start text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold mt-1"
            >
              <Plus size={11} /> Add Query Param
            </button>
          </div>
        )}

        {/* Body Editor */}
        {expandedSubTab === "body" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--tx-3)]">Body Type:</span>
              {["none", "json", "raw"].map((bType) => (
                <label key={bType} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name={`body-type-${idx}`}
                    checked={(cfg.body?.type || "none") === bType}
                    onChange={() => {
                      handleUpdateStepConfig(idx, {
                        body: { type: bType, content: cfg.body?.content || "" },
                      });
                    }}
                    className="accent-[var(--lime)]"
                  />
                  <span className="capitalize text-[var(--tx-2)]">{bType}</span>
                </label>
              ))}
            </div>

            {cfg.body?.type && cfg.body.type !== "none" && (
              <textarea
                defaultValue={
                  typeof cfg.body.content === "string"
                    ? cfg.body.content
                    : JSON.stringify(cfg.body.content || {}, null, 2)
                }
                onBlur={(e) => {
                  let content = e.target.value;
                  if (cfg.body.type === "json") {
                    try {
                      content = JSON.parse(content);
                    } catch {
                      // leave as string if invalid JSON
                    }
                  }
                  handleUpdateStepConfig(idx, {
                    body: { type: cfg.body.type, content },
                  });
                }}
                rows={5}
                placeholder={
                  cfg.body.type === "json"
                    ? '{\n  "key": "value",\n  "userId": "{{prev_user_id}}"\n}'
                    : "raw payload string..."
                }
                className="w-full p-2 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none focus:border-[var(--lime)] resize-y"
              />
            )}
          </div>
        )}

        {/* Variable Extraction Rules Editor */}
        {expandedSubTab === "extract" && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-[var(--tx-3)]">
              Extract JSON fields from this step's response to pass to subsequent steps as variables (e.g. <code className="text-purple-300 font-mono">{"{{token}}"}</code>).
            </p>
            {(step.extract_vars || []).length === 0 && (
              <p className="text-[11px] text-[var(--tx-3)] italic">
                No variables extracted from this step.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {(step.extract_vars || []).map((rule, rIdx) => (
                <div key={rIdx} className="flex items-center gap-2">
                  <div className="flex items-center gap-1 w-1/3">
                    <span className="text-purple-400 font-mono text-xs">{"{{"}</span>
                    <input
                      type="text"
                      defaultValue={rule.var_name}
                      placeholder="var_name"
                      onBlur={(e) =>
                        handleUpdateExtractRule(idx, rIdx, "var_name", e.target.value.trim())
                      }
                      className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-purple-300 outline-none flex-1"
                    />
                    <span className="text-purple-400 font-mono text-xs">{"}}"}</span>
                  </div>
                  <span className="text-xs text-[var(--tx-3)]">← JSON Path:</span>
                  <input
                    type="text"
                    defaultValue={rule.json_path}
                    placeholder="e.g. data.token or items[0].id"
                    onBlur={(e) =>
                      handleUpdateExtractRule(idx, rIdx, "json_path", e.target.value.trim())
                    }
                    className="px-2 py-1 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none flex-1"
                  />
                  <button
                    onClick={() => handleDeleteExtractRule(idx, rIdx)}
                    className="p-1 text-[var(--tx-3)] hover:text-[var(--err)]"
                    title="Remove Extraction Rule"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => handleAddExtractRule(idx)}
              className="self-start text-[11px] text-purple-400 hover:underline flex items-center gap-1 font-semibold mt-1"
            >
              <Plus size={11} /> Add Variable Extraction
            </button>
          </div>
        )}

        {/* Assertions Editor */}
        {expandedSubTab === "assertions" && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--tx-3)]">
                Automated validations for status code, latency, headers, or JSON response paths.
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAddAssertion(idx, { type: "status_code", operator: "equals", value: "200" })}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                >
                  + Status 200
                </button>
                <button
                  type="button"
                  onClick={() => handleAddAssertion(idx, { type: "response_time", operator: "less_than", value: "500" })}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
                >
                  + Latency &lt; 500ms
                </button>
              </div>
            </div>

            {(cfg.assertions || []).length === 0 ? (
              <p className="text-[11px] text-[var(--tx-3)] italic py-1">
                No assertions configured. Click a preset above or add a custom assertion.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(cfg.assertions || []).map((ast, aIdx) => (
                  <div key={ast.id || aIdx} className="flex items-center gap-2 text-xs bg-[var(--bg-s2)] p-2 rounded border border-[var(--border)]">
                    <select
                      value={ast.type}
                      onChange={(e) => handleUpdateAssertion(idx, aIdx, { type: e.target.value as any })}
                      className="px-2 py-1 bg-[var(--bg-s3)] border border-[var(--border)] rounded text-xs font-mono text-[var(--lime)] outline-none"
                    >
                      <option value="status_code">Status Code</option>
                      <option value="response_time">Response Time (ms)</option>
                      <option value="json_path">JSON Path</option>
                      <option value="header">Header</option>
                    </select>

                    {(ast.type === "json_path" || ast.type === "header") && (
                      <input
                        type="text"
                        defaultValue={ast.target || ""}
                        placeholder={ast.type === "json_path" ? "data.id" : "Content-Type"}
                        onBlur={(e) => handleUpdateAssertion(idx, aIdx, { target: e.target.value.trim() })}
                        className="px-2 py-1 bg-[var(--bg-s3)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none w-36"
                      />
                    )}

                    <select
                      value={ast.operator}
                      onChange={(e) => handleUpdateAssertion(idx, aIdx, { operator: e.target.value as any })}
                      className="px-2 py-1 bg-[var(--bg-s3)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-2)] outline-none"
                    >
                      <option value="equals">equals</option>
                      <option value="not_equals">not equals</option>
                      <option value="less_than">less than</option>
                      <option value="contains">contains</option>
                      <option value="exists">exists</option>
                      <option value="is_not_empty">is not empty</option>
                    </select>

                    {ast.operator !== "exists" && ast.operator !== "is_not_empty" && (
                      <input
                        type="text"
                        defaultValue={ast.value}
                        placeholder="Expected value"
                        onBlur={(e) => handleUpdateAssertion(idx, aIdx, { value: e.target.value.trim() })}
                        className="px-2 py-1 bg-[var(--bg-s3)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] outline-none flex-1"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveAssertion(idx, aIdx)}
                      className="p-1 text-[var(--tx-3)] hover:text-[var(--err)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleAddAssertion(idx, { type: "status_code", operator: "equals", value: "200" })}
              className="self-start text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
            >
              <Plus size={12} /> Add Custom Assertion
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── 2. FULL WORKBENCH VIEW (Rendered in App.tsx main area) ─────────────────
  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden select-none bg-[var(--bg-base)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportWorkflowFile}
      />

      {selected ? (
        <>
          {/* Top Toolbar */}
          <div className="flex flex-col border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
            <div className="flex items-center justify-between px-4 py-2.5">
              {/* Title & Rename */}
              <div className="flex items-center gap-3">
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={handleCommitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitRename();
                        if (e.key === "Escape") setIsRenaming(false);
                      }}
                      className="px-2 py-0.5 rounded text-sm font-semibold bg-[var(--bg-s3)] border border-[var(--lime)] text-[var(--tx-1)] outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2
                      onDoubleClick={() => {
                        setIsRenaming(true);
                        setRenameDraft(selected.name);
                      }}
                      title="Double-click to rename"
                      className="text-sm font-semibold text-[var(--tx-1)] hover:text-[var(--lime)] cursor-pointer"
                    >
                      {selected.name}
                    </h2>
                    <span className="text-xs text-[var(--tx-3)] font-mono">
                      ({steps.length} {steps.length === 1 ? "step" : "steps"})
                    </span>
                  </div>
                )}
              </div>

              {/* Main Action Buttons */}
              <div className="flex items-center gap-2">
                {/* View Mode Switcher (List vs Nodes) */}
                <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-s3)] p-0.5 mr-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                      viewMode === "list"
                        ? "bg-[var(--bg-s1)] text-[var(--tx-1)] shadow-sm font-semibold"
                        : "text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                    )}
                    title="List sequence view"
                  >
                    <List size={12} />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("nodes")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                      viewMode === "nodes"
                        ? "bg-[var(--lime-soft)] text-[var(--lime)] font-semibold shadow-sm"
                        : "text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                    )}
                    title="Interactive visual flowchart node graph view"
                  >
                    <Network size={12} />
                    <span>Node View</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handleAddBlankStep}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors"
                    title="Add empty step"
                  >
                    <Plus size={12} />
                    <span>Step</span>
                  </button>
                  <button
                    onClick={handleAddWaitStep}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Add delay / wait node"
                  >
                    <Clock size={12} />
                    <span>Wait</span>
                  </button>
                  <button
                    onClick={handleOpenImportModal}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                    title="Import step from Collections or History"
                  >
                    <Download size={12} />
                    <span>Import…</span>
                  </button>
                </div>

                {/* Variables Watcher */}
                <button
                  type="button"
                  onClick={() => setVariablesWatcherOpen(!variablesWatcherOpen)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors",
                    variablesWatcherOpen
                      ? "border-purple-500 text-purple-400 bg-purple-500/10"
                      : "border-[var(--border)] text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)]"
                  )}
                  title="Inspect active extracted variables"
                >
                  <Sparkles size={12} className="text-purple-400" />
                  <span>Vars ({Object.keys(activeVariables).length})</span>
                </button>

                {/* History Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen(true);
                    if (selected?.id) loadWorkflowRuns(selected.id);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--tx-3)] hover:text-cyan-400 hover:bg-[var(--bg-s3)] transition-colors"
                  title="View past execution history & run logs"
                >
                  <History size={12} />
                  <span>History</span>
                </button>

                <button
                  onClick={() => handleExportWorkflow(selected)}
                  className="p-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                  title="Export Workflow as JSON"
                >
                  <Download size={13} />
                </button>

                <button
                  onClick={() => duplicateWorkflow(selected)}
                  className="p-1.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                  title="Duplicate Workflow"
                >
                  <Copy size={13} />
                </button>

                {/* Run Workflow Main Button */}
                <button
                  onClick={runWorkflow}
                  disabled={running || savingWorkflow || steps.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                >
                  {running || savingWorkflow ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} />
                  )}
                  <span>
                    {savingWorkflow
                      ? "Saving Workflow…"
                      : running
                        ? "Running Workflow…"
                        : "Run Workflow"}
                  </span>
                </button>
              </div>
            </div>

            {/* Execution Options Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-[var(--border-dim)] bg-[var(--bg-s2)] text-xs">
              {/* Environment Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[var(--tx-3)] flex items-center gap-1">
                  <Layers size={11} className="text-cyan-400" />
                  <span>Environment:</span>
                </span>
                <select
                  value={selectedEnvId}
                  onChange={(e) => setSelectedEnvId(e.target.value)}
                  disabled={environmentLoading}
                  className="bg-[var(--bg-s3)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--tx-1)] font-mono outline-none focus:border-[var(--lime)]"
                >
                  <option value="">
                    {environmentLoading ? "Loading environments…" : "No Environment (Globals only)"}
                  </option>
                  {(environments as any[])
                    .filter((e) => e.name.toLowerCase() !== "globals")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Delay between steps */}
              <div className="flex items-center gap-2">
                <span className="text-[var(--tx-3)] flex items-center gap-1">
                  <Clock size={11} />
                  <span>Delay:</span>
                </span>
                <select
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="bg-[var(--bg-s3)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
                >
                  <option value={0}>No Delay (0ms)</option>
                  <option value={250}>250ms</option>
                  <option value={500}>500ms</option>
                  <option value={1000}>1,000ms (1s)</option>
                  <option value={2000}>2,000ms (2s)</option>
                </select>
              </div>

              {/* Stop on Failure toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--tx-2)] hover:text-[var(--tx-1)]">
                <input
                  type="checkbox"
                  checked={stopOnFailure}
                  onChange={(e) => setStopOnFailure(e.target.checked)}
                  className="cursor-pointer accent-[var(--lime)]"
                />
                <span>Stop on first failure</span>
              </label>
            </div>
          </div>

          {/* Content: Steps Builder & Live Results */}
          <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
            {/* ── Steps Sequence List ───────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[var(--tx-1)] uppercase tracking-wider flex items-center gap-1.5">
                  <span>Steps Sequence</span>
                  <span className="text-[10px] text-[var(--tx-3)] font-mono">({steps.length})</span>
                </span>
                <span className="text-[11px] text-[var(--tx-3)]">
                  Steps execute in top-to-bottom sequence. Variables extracted flow to next steps.
                </span>
              </div>

              {steps.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[var(--border)] rounded-[var(--r-md)] text-[var(--tx-3)] flex flex-col items-center gap-2">
                  <Sliders size={32} strokeWidth={1} />
                  <p className="text-xs">This workflow has no steps yet.</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={handleAddBlankStep}
                      className="px-3 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      + Add Blank Step
                    </button>
                    <button
                      onClick={handleOpenImportModal}
                      className="px-3 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-s3)] text-[var(--tx-1)] border border-[var(--border)] text-xs font-medium hover:bg-[var(--bg-s4)] transition-colors"
                    >
                      Import from Collection…
                    </button>
                  </div>
                </div>
              ) : viewMode === "nodes" ? (
                <div className="flex flex-col gap-4">
                  <WorkflowFlowGraph
                    workflow={selected}
                    steps={steps}
                    results={results}
                    running={running}
                    runningStepIdx={runningStepIdx}
                    activeVariables={activeVariables}
                    onUpdateSteps={async (newSteps) => {
                      await commitWorkflowSteps(newSteps);
                    }}
                    onRunWorkflow={runWorkflow}
                    onRunStep={(idx, e) => handleRunSingleStep(idx, e)}
                    onOpenStepInTab={(step, e) => handleOpenStepInTab(step, e)}
                    onConfigureStep={(idx) => {
                      setExpandedStepIndex(idx);
                    }}
                    onAddBlankStep={handleAddBlankStep}
                    onAddWaitStep={handleAddWaitStep}
                    onImportStep={handleOpenImportModal}
                  />

                  {/* Popup Modal for Step Configuration in Node View */}
                  {expandedStepIndex !== null && steps[expandedStepIndex] && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
                      onClick={() => setExpandedStepIndex(null)}
                    >
                      <div
                        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[var(--bg-s1)] border border-[var(--border-mid)] shadow-2xl rounded-xl overflow-hidden animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-[var(--lime)]/10 text-[var(--lime)] border border-[var(--lime)]/30">
                              <Sliders size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-[var(--tx-3)]">
                                  Step #{expandedStepIndex + 1}
                                </span>
                                <h3 className="text-sm font-semibold text-[var(--tx-1)]">
                                  {steps[expandedStepIndex].name}
                                </h3>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                                    methodColor(steps[expandedStepIndex].method),
                                    "bg-[var(--bg-s3)] border border-[var(--border)]",
                                  )}
                                >
                                  {steps[expandedStepIndex].method}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-[var(--tx-3)] truncate max-w-md">
                                {steps[expandedStepIndex].url || "No URL configured"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRunSingleStep(expandedStepIndex)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-s3)] hover:bg-[var(--bg-hover)] text-[var(--tx-1)] border border-[var(--border)] transition-colors cursor-pointer"
                              title="Test run this step only"
                            >
                              <Play size={12} className="text-[var(--lime)]" />
                              <span>Test Step</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedStepIndex(null)}
                              className="p-1.5 rounded-lg text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors cursor-pointer"
                              title="Close"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          {renderStepConfig(expandedStepIndex)}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-dim)] bg-[var(--bg-s2)]">
                          <div className="text-[11px] text-[var(--tx-3)]">
                            Changes are auto-saved to workflow draft.
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedStepIndex(null)}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lime)] hover:bg-[var(--lime-hover)] text-black cursor-pointer transition-colors shadow-xs"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {steps.map((step, idx) => {
                    const isExpanded = expandedStepIndex === idx;
                    const cfg = step.configuration || {};
                    const isEnabled = cfg.enabled !== false && cfg.is_enabled !== false;
                    const extractCount = (step.extract_vars || []).length;
                    const headerCount = Object.keys(cfg.headers || {}).length;
                    const paramCount = Object.keys(cfg.params || {}).length;
                    const hasBody = Boolean(cfg.body && cfg.body.type !== "none");

                    return (
                      <div
                        key={step.id || idx}
                        className={cn(
                          "rounded-[var(--r-md)] border transition-all overflow-hidden bg-[var(--bg-s2)]",
                          isExpanded
                            ? "border-[var(--lime)] shadow-md ring-1 ring-[var(--lime)]/20"
                            : "border-[var(--border)] hover:border-[var(--border-mid)]",
                          !isEnabled && "opacity-55",
                        )}
                      >
                        {/* Step Header Row */}
                        <div
                          onClick={() => setExpandedStepIndex(isExpanded ? null : idx)}
                          className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-[var(--bg-hover)]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Order & Move buttons */}
                            <div
                              className="flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="font-mono text-xs font-bold text-[var(--tx-3)] w-5 text-center">
                                {idx + 1}
                              </span>
                              <div className="flex flex-col">
                                <button
                                    disabled={idx === 0}
                                    onClick={(e) => handleMoveStep(idx, "up", e)}
                                    title="Move Step Up"
                                    className="p-0.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] disabled:opacity-20"
                                >
                                  <ArrowUp size={10} />
                                </button>
                                <button
                                    disabled={idx === steps.length - 1}
                                    onClick={(e) => handleMoveStep(idx, "down", e)}
                                    title="Move Step Down"
                                    className="p-0.5 text-[var(--tx-3)] hover:text-[var(--tx-1)] disabled:opacity-20"
                                >
                                  <ArrowDown size={10} />
                                </button>
                              </div>
                            </div>

                            {/* Enable / Disable Checkbox */}
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={(e) => handleToggleStepEnabled(idx, e as any)}
                              title={isEnabled ? "Step is active" : "Step will be skipped"}
                              className="cursor-pointer accent-[var(--lime)] shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />

                            {/* Method */}
                            <span
                              className={cn(
                                "font-mono text-xs font-bold w-12 text-center py-0.5 rounded shrink-0",
                                methodColor(step.method),
                                "bg-[var(--bg-s3)] border border-[var(--border)]",
                              )}
                            >
                              {step.method}
                            </span>

                            {/* Step Name & URL */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs font-semibold text-[var(--tx-1)] truncate">
                                {step.name}
                              </span>
                              <span className="font-mono text-[11px] text-[var(--tx-3)] truncate">
                                {step.url}
                              </span>
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Parallel vs Sequential toggle pill */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextMode = cfg.execution_mode === "parallel" ? "sequential" : "parallel";
                                  handleUpdateStepConfig(idx, { execution_mode: nextMode });
                                }}
                                title={`Click to switch to ${cfg.execution_mode === "parallel" ? "Sequential" : "Parallel"}`}
                                className={cn(
                                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors border",
                                  cfg.execution_mode === "parallel"
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 font-semibold"
                                    : "bg-[var(--bg-s3)] text-[var(--tx-3)] border-[var(--border)] hover:text-[var(--tx-1)]",
                                )}
                              >
                                {cfg.execution_mode === "parallel" ? (
                                  <>
                                    <Zap size={9} className="text-amber-400 fill-amber-400" />
                                    <span>Parallel</span>
                                  </>
                                ) : (
                                  <span>Seq</span>
                                )}
                              </button>

                              {(cfg.assertions || []).length > 0 && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <CheckSquare size={9} />
                                  <span>{(cfg.assertions || []).length} assert{(cfg.assertions || []).length > 1 ? "s" : ""}</span>
                                </span>
                              )}
                              {extractCount > 0 && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                  <Link2 size={9} />
                                  <span>{extractCount} var{extractCount > 1 ? "s" : ""}</span>
                                </span>
                              )}
                              {(headerCount > 0 || paramCount > 0 || hasBody) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--tx-3)] bg-[var(--bg-s3)]">
                                  {headerCount}H • {paramCount}P {hasBody ? "• Body" : ""}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions Right */}
                          <div
                            className="flex items-center gap-1 shrink-0 ml-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={runningStepIdx === idx}
                              onClick={(e) => handleRunSingleStep(idx, e)}
                              title="Run just this step"
                              className="flex items-center gap-1 rounded bg-[var(--lime-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--lime)] hover:bg-[var(--lime)] hover:text-black transition-colors disabled:opacity-50 mr-1"
                            >
                              {runningStepIdx === idx ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <Play size={10} className="fill-current" />
                              )}
                              <span>Run</span>
                            </button>
                            <button
                              onClick={(e) => handleOpenStepInTab(step, e)}
                              title="Open in Request Tab"
                              className="p-1 text-[var(--tx-3)] hover:text-cyan-400 rounded hover:bg-[var(--bg-s3)] transition-colors"
                            >
                              <ExternalLink size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDuplicateStep(idx, e)}
                              title="Duplicate Step"
                              className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s3)] transition-colors"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteStep(idx, e)}
                              title="Delete Step"
                              className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded hover:bg-[var(--bg-s3)] transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                            <div className="p-1 text-[var(--tx-3)]">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                          </div>
                        </div>

                        {/* ── Expanded Step Configuration Accordion ── */}
                        {isExpanded && renderStepConfig(idx)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Live Execution Results / Output Panel ────────────── */}
            {results.length > 0 && executionStats && (
              <div className="flex flex-col gap-3 pt-3 border-t border-[var(--border-dim)] animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tx-1)]">
                      Execution Results
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase",
                        overallStatus === "completed"
                          ? "bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/30"
                          : overallStatus === "partial"
                          ? "bg-[var(--amber)]/15 text-[var(--amber)] border border-[var(--amber)]/30"
                          : "bg-[var(--err)]/15 text-[var(--err)] border border-[var(--err)]/30",
                      )}
                    >
                      {overallStatus}
                    </span>
                    <span className="text-xs font-mono text-[var(--tx-3)]">
                      in {executionStats.totalDuration}ms
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--ok)] font-mono">{executionStats.completed} Passed</span>
                    {executionStats.failed > 0 && (
                      <span className="text-[var(--err)] font-mono">{executionStats.failed} Failed</span>
                    )}
                    {executionStats.skipped > 0 && (
                      <span className="text-[var(--tx-3)] font-mono">{executionStats.skipped} Skipped</span>
                    )}

                    {/* Export Report Dropdown */}
                    <div className="relative ml-2">
                      <button
                        type="button"
                        onClick={() => setReportExportOpen(!reportExportOpen)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] bg-[var(--bg-s3)] transition-colors"
                        title="Export execution test report"
                      >
                        <FileText size={12} className="text-[var(--lime)]" />
                        <span>Export Report</span>
                        <ChevronDown size={11} />
                      </button>
                      {reportExportOpen && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-s1)] p-1 shadow-2xl animate-fadeIn">
                          <button
                            type="button"
                            onClick={() => {
                              downloadText(generateMarkdownReport(selected, results), `${selected.name.replace(/[^a-z0-9]/gi, "_")}-report.md`, "text/markdown");
                              setReportExportOpen(false);
                              toast("Exported Markdown report", "success");
                            }}
                            className="w-full text-left rounded px-2.5 py-1.5 text-xs text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] flex items-center gap-2"
                          >
                            <FileText size={12} className="text-cyan-400" />
                            <span>Markdown (.md)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              downloadText(generateHtmlReport(selected, results), `${selected.name.replace(/[^a-z0-9]/gi, "_")}-report.html`, "text/html");
                              setReportExportOpen(false);
                              toast("Exported standalone HTML report", "success");
                            }}
                            className="w-full text-left rounded px-2.5 py-1.5 text-xs text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] flex items-center gap-2"
                          >
                            <Code2 size={12} className="text-amber-400" />
                            <span>HTML Report (.html)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              downloadJson({ workflow: selected, results }, `${selected.name.replace(/[^a-z0-9]/gi, "_")}-report.json`);
                              setReportExportOpen(false);
                              toast("Exported JSON artifact", "success");
                            }}
                            className="w-full text-left rounded px-2.5 py-1.5 text-xs text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] flex items-center gap-2"
                          >
                            <Download size={12} className="text-emerald-400" />
                            <span>JSON Artifact (.json)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Extracted Variables Flow Summary Box */}
                {executionStats.extractedList.length > 0 && (
                  <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-purple-500/30 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                      <Sparkles size={13} />
                      <span>Extracted Variables from this Run:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {executionStats.extractedList.map((ext, eIdx) => (
                        <div
                          key={eIdx}
                          onClick={() => {
                            navigator.clipboard.writeText(ext.val);
                            toast(`Copied "${ext.key}" value`, "success");
                          }}
                          className="p-2 rounded bg-[var(--bg-s3)] border border-[var(--border)] cursor-pointer hover:border-purple-400/50 transition-colors flex flex-col gap-0.5 text-xs"
                        >
                          <span className="font-mono text-purple-300 font-bold">{`{{${ext.key}}}`}</span>
                          <span className="font-mono text-[11px] text-[var(--tx-2)] truncate select-all">
                            {ext.val}
                          </span>
                          <span className="text-[9px] text-[var(--tx-3)] truncate">from {ext.step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step Result Cards */}
                <div className="flex flex-col gap-2">
                  {results.map((r, i) => {
                    const isResultExpanded = Boolean(expandedResults[i]);
                    const hasBody = Boolean(r.response?.body);
                    let bodyText = "";
                    if (hasBody) {
                      try {
                        bodyText =
                          typeof r.response!.body === "string"
                            ? r.response!.body
                            : JSON.stringify(r.response!.body, null, 2);
                      } catch {
                        bodyText = String(r.response?.body);
                      }
                    }

                    return (
                      <div
                        key={i}
                        className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-s2)] overflow-hidden"
                      >
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {r.status === "completed" ? (
                              <CheckCircle2 size={14} className="text-[var(--ok)] shrink-0" />
                            ) : r.status === "skipped" ? (
                              <AlertCircle size={14} className="text-[var(--tx-3)] shrink-0" />
                            ) : (
                              <XCircle size={14} className="text-[var(--err)] shrink-0" />
                            )}

                            <span className="text-xs font-semibold text-[var(--tx-1)] truncate">
                              {r.step_name}
                            </span>

                            {r.response?.status_code && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[10px] font-mono",
                                  statusClass(r.response.status_code),
                                )}
                              >
                                {r.response.status_code}
                              </span>
                            )}

                            {r.duration_ms !== undefined && (
                              <span className="text-[11px] text-[var(--tx-3)] font-mono">
                                {Math.round(r.duration_ms)}ms
                              </span>
                            )}

                            {r.extracted_vars && Object.keys(r.extracted_vars).length > 0 && (
                              <div className="flex items-center gap-1 ml-2">
                                {Object.entries(r.extracted_vars).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                    title={`${k} = ${v}`}
                                  >
                                    {`{{${k}}}`}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Assertion results chips */}
                            {r.assertion_results && r.assertion_results.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap ml-2">
                                {r.assertion_results.map((ast, aIdx) => (
                                  <span
                                    key={aIdx}
                                    className={cn(
                                      "flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono border",
                                      ast.passed
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                        : "bg-red-500/10 text-red-400 border-red-500/30",
                                    )}
                                    title={`Expected ${ast.expected}, got: ${ast.actual}`}
                                  >
                                    {ast.passed ? <Check size={9} /> : <X size={9} />}
                                    <span>{ast.type} {ast.operator} {ast.expected}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {hasBody && (
                              <button
                                onClick={() =>
                                  setExpandedResults((prev) => ({ ...prev, [i]: !prev[i] }))
                                }
                                className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                              >
                                <Eye size={12} />
                                <span>{isResultExpanded ? "Hide Body" : "View Body"}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Error Message */}
                        {r.error && (
                          <div className="px-3 pb-2.5 text-xs text-[var(--err)] font-mono">
                            Error: {r.error}
                          </div>
                        )}

                        {/* Expanded Response Body View */}
                        {isResultExpanded && hasBody && (
                          <div className="p-3 border-t border-[var(--border-dim)] bg-[var(--bg-s3)] flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-[var(--tx-3)]">
                              <span className="font-mono text-[11px]">Response Output</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(bodyText);
                                  toast("Copied response body", "success");
                                }}
                                className="flex items-center gap-1 text-[var(--tx-2)] hover:text-[var(--tx-1)]"
                              >
                                <Copy size={11} /> Copy JSON
                              </button>
                            </div>
                            <pre className="p-2.5 bg-[var(--bg-s2)] border border-[var(--border)] rounded text-xs font-mono text-[var(--tx-1)] overflow-auto max-h-60 whitespace-pre-wrap select-all">
                              {bodyText}
                            </pre>

                            {/* Quick Extract from Body */}
                            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-dim)] text-[11px]">
                              <Sparkles size={12} className="text-purple-400 shrink-0" />
                              <span className="text-[var(--tx-3)]">Extract JSON path into variable:</span>
                              <input
                                type="text"
                                placeholder="e.g. data.token or id"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                    handleQuickExtract(i, (e.target as HTMLInputElement).value.trim());
                                    (e.target as HTMLInputElement).value = "";
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-[var(--bg-s2)] border border-[var(--border)] text-xs font-mono text-[var(--tx-1)] outline-none w-52 focus:border-purple-400"
                              />
                              <span className="text-[10px] text-[var(--tx-3)] font-mono">(Enter to save)</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--tx-3)]">
          <Sliders size={40} strokeWidth={1} />
          <p className="text-sm font-semibold text-[var(--tx-2)]">No Workflow Selected</p>
          <p className="text-xs max-w-sm text-center">
            Select a workflow from the sidebar or create a new automated sequence of chained requests.
          </p>
          <button
            onClick={() => createWorkflow()}
            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold hover:opacity-90"
          >
            <Plus size={13} /> New Workflow
          </button>
        </div>
      )}

      {/* ── Import Steps from Collections / History Modal ────────────── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-lg bg-[var(--bg-s1)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
              <div className="flex items-center gap-2">
                <Download size={16} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">
                  Import Step into Workflow
                </h3>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={14} />
              </button>
            </div>

            {/* Source Tabs */}
            <div className="flex items-center gap-2 border-b border-[var(--border-dim)] text-xs">
              <button
                onClick={() => setImportSource("collections")}
                className={cn(
                  "px-3 py-1.5 font-semibold border-b-2 transition-colors flex items-center gap-1",
                  importSource === "collections"
                    ? "border-cyan-400 text-cyan-400"
                    : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                )}
              >
                <FolderPlus size={12} />
                <span>From Collections</span>
              </button>
              <button
                onClick={() => setImportSource("history")}
                className={cn(
                  "px-3 py-1.5 font-semibold border-b-2 transition-colors flex items-center gap-1",
                  importSource === "history"
                    ? "border-[var(--lime)] text-[var(--lime)]"
                    : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                )}
              >
                <Clock size={12} />
                <span>From Recent History</span>
              </button>
            </div>

            {/* Modal Body */}
            {importError && (
              <p className="text-xs text-[var(--err)]" role="alert">
                {importError}
              </p>
            )}
            {importLoading ? (
              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                Loading collections and recent history…
              </p>
            ) : importSource === "collections" ? (
              <div className="flex flex-col gap-2.5">
                {collectionsList.length === 0 ? (
                  <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                    No collections found in this workspace.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-[var(--tx-3)]">Select Collection:</label>
                      <select
                        value={selectedColForImport}
                        onChange={(e) => handleSelectCollectionForImport(e.target.value)}
                        className="bg-[var(--bg-s2)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--tx-1)] outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        {collectionsList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 max-h-60 overflow-auto border border-[var(--border)] rounded p-1">
                      {collectionRequests.length === 0 ? (
                        <p className="text-xs text-[var(--tx-3)] p-4 text-center">
                          No requests inside this collection.
                        </p>
                      ) : (
                        collectionRequests.map((req) => (
                          <div
                            key={req.id}
                            onClick={() => handleImportRequestAsStep(req)}
                            className="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-hover)] cursor-pointer transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "font-mono text-[10px] font-bold w-10 text-center py-0.5 rounded",
                                  methodColor(req.method),
                                  "bg-[var(--bg-s3)] border border-[var(--border)]",
                                )}
                              >
                                {req.method}
                              </span>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-semibold text-[var(--tx-1)] truncate">
                                  {req.name}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--tx-3)] truncate">
                                  {req.url}
                                </span>
                              </div>
                            </div>
                            <button className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 font-semibold px-2 py-1 rounded hover:bg-cyan-500/10 transition-all">
                              + Add
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-72 overflow-auto border border-[var(--border)] rounded p-1">
                {recentHistory.length === 0 ? (
                  <p className="text-xs text-[var(--tx-3)] p-4 text-center">
                    No recent history records available.
                  </p>
                ) : (
                  recentHistory.map((hist) => {
                    const snap = hist.request_snapshot || {};
                    const method = hist.method || snap.method || "GET";
                    const url = hist.url || snap.url || "";
                    return (
                      <div
                        key={hist.id}
                        onClick={() =>
                          handleImportRequestAsStep({
                            name: `${method} ${url}`,
                            method,
                            url,
                            configuration: snap,
                          })
                        }
                        className="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-hover)] cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={cn(
                              "font-mono text-[10px] font-bold w-10 text-center py-0.5 rounded",
                              methodColor(method),
                              "bg-[var(--bg-s3)] border border-[var(--border)]",
                            )}
                          >
                            {method}
                          </span>
                          <span className="font-mono text-xs text-[var(--tx-2)] truncate flex-1">
                            {url}
                          </span>
                        </div>
                        <button className="text-xs text-[var(--lime)] opacity-0 group-hover:opacity-100 font-semibold px-2 py-1 rounded hover:bg-[var(--lime)]/10 transition-all">
                          + Add
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[var(--border-dim)]">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Workflow Run History Slide-Over Drawer ─────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-100">
          <div className="w-full max-w-md h-full bg-[var(--bg-s1)] border-l border-[var(--border)] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-dim)] bg-[var(--bg-s2)]">
              <div className="flex items-center gap-2">
                <History size={16} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">Execution History</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-s3)] text-[var(--tx-3)] border border-[var(--border)]">
                  {historyRuns.length} runs
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {historyRuns.length > 0 && (
                  <button
                    onClick={clearWorkflowHistory}
                    className="text-xs text-[var(--err)] hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    title="Clear all execution history"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => selected?.id && loadWorkflowRuns(selected.id)}
                  className="p-1.5 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)]"
                  title="Refresh runs"
                >
                  <RefreshCw size={13} className={historyLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)]"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* History Runs List */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
              {historyLoading ? (
                <div className="flex items-center justify-center p-8 text-xs text-[var(--tx-3)] gap-2">
                  <Loader2 size={14} className="animate-spin text-cyan-400" />
                  <span>Loading history from database…</span>
                </div>
              ) : historyRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--tx-3)] gap-2">
                  <History size={32} strokeWidth={1} />
                  <p className="text-xs font-medium text-[var(--tx-2)]">No Run Records Found</p>
                  <p className="text-[11px] max-w-xs">
                    Execution runs will automatically be persisted into the database whenever this workflow executes.
                  </p>
                </div>
              ) : (
                historyRuns.map((run) => (
                  <div
                    key={run.id}
                    className="p-3 rounded-[var(--r-md)] bg-[var(--bg-s2)] border border-[var(--border)] hover:border-[var(--border-mid)] transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                          run.status === "completed"
                            ? "bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/30"
                            : "bg-[var(--err)]/15 text-[var(--err)] border border-[var(--err)]/30",
                        )}
                      >
                        {run.status}
                      </span>
                      <span className="text-[11px] text-[var(--tx-3)] font-mono">
                        {formatRelativeTime(run.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-[var(--tx-2)] pt-1 border-t border-[var(--border-dim)]">
                      <span>
                        {run.passed_steps}/{run.total_steps} passed{" "}
                        {run.failed_steps > 0 && `(${run.failed_steps} failed)`}
                      </span>
                      <span className="text-[var(--tx-3)]">{formatLatency(run.duration_ms)}</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          if (run.results && Array.isArray(run.results)) {
                            setResults(run.results);
                            setHistoryOpen(false);
                            toast("Loaded historical results into viewer", "success");
                          }
                        }}
                        className="text-xs text-cyan-400 hover:underline font-mono flex items-center gap-1"
                      >
                        <Eye size={11} /> Load Results
                      </button>
                      <button
                        onClick={async () => {
                          await bridge.deleteWorkflowRun(run.id);
                          setHistoryRuns((prev) => prev.filter((r) => r.id !== run.id));
                          toast("Deleted run record", "info");
                        }}
                        className="p-1 text-[var(--tx-3)] hover:text-[var(--err)]"
                        title="Delete record"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Workflow Variables Watcher Modal ──────────────────────────── */}
      {variablesWatcherOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-lg bg-[var(--bg-s1)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">
                  Live Workflow Variables Watcher
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {Object.keys(activeVariables).length} in scope
                </span>
              </div>
              <button
                onClick={() => setVariablesWatcherOpen(false)}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-[var(--tx-3)]">
              Variables extracted during workflow runs or step executions are stored in-memory and injected into subsequent steps using{" "}
              <code className="text-purple-300 font-mono">{"{{variable_name}}"}</code>.
            </p>

            {/* Variables List */}
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto border border-[var(--border)] rounded p-2 bg-[var(--bg-s2)]">
              {Object.keys(activeVariables).length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--tx-3)]">
                  No active variables in memory. Execute steps with extraction rules or add variables manually below.
                </div>
              ) : (
                Object.entries(activeVariables).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between p-2 rounded bg-[var(--bg-s3)] border border-[var(--border)] text-xs"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-mono text-purple-300 font-bold">{`{{${k}}}`}</span>
                      <span className="font-mono text-[11px] text-[var(--tx-2)] truncate select-all">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(typeof v === "object" ? JSON.stringify(v) : String(v));
                          toast(`Copied {{${k}}}`, "success");
                        }}
                        className="p-1 text-[var(--tx-3)] hover:text-[var(--tx-1)] rounded hover:bg-[var(--bg-s2)]"
                        title="Copy value"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => {
                          setActiveVariables((prev) => {
                            const copy = { ...prev };
                            delete copy[k];
                            return copy;
                          });
                          toast(`Removed variable {{${k}}}`, "info");
                        }}
                        className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] rounded hover:bg-[var(--bg-s2)]"
                        title="Delete variable"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Manual Add Variable Input */}
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-dim)]">
              <input
                id="new-var-key"
                type="text"
                placeholder="Variable name (e.g. auth_token)"
                className="flex-1 px-2.5 py-1.5 rounded bg-[var(--bg-s2)] border border-[var(--border)] text-xs font-mono text-[var(--tx-1)] outline-none focus:border-purple-400"
              />
              <input
                id="new-var-val"
                type="text"
                placeholder="Value"
                className="flex-1 px-2.5 py-1.5 rounded bg-[var(--bg-s2)] border border-[var(--border)] text-xs font-mono text-[var(--tx-1)] outline-none focus:border-purple-400"
              />
              <button
                type="button"
                onClick={() => {
                  const kInput = document.getElementById("new-var-key") as HTMLInputElement;
                  const vInput = document.getElementById("new-var-val") as HTMLInputElement;
                  if (kInput && vInput && kInput.value.trim()) {
                    const k = kInput.value.trim().replace(/[^a-zA-Z0-9_]/g, "_");
                    const v = vInput.value.trim();
                    setActiveVariables((prev) => ({ ...prev, [k]: v }));
                    kInput.value = "";
                    vInput.value = "";
                    toast(`Added variable {{${k}}}`, "success");
                  }
                }}
                className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                Add Var
              </button>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-[var(--border-dim)]">
              {Object.keys(activeVariables).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveVariables({});
                    toast("Cleared in-memory variables", "info");
                  }}
                  className="text-xs text-[var(--err)] hover:underline"
                >
                  Clear All Variables
                </button>
              )}
              <button
                type="button"
                onClick={() => setVariablesWatcherOpen(false)}
                className="ml-auto px-3 py-1.5 rounded text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
