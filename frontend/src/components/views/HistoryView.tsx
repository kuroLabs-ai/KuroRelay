import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Clock,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Play,
  FolderPlus,
  Terminal,
  Download,
  X,
  Calendar,
  Eye,
  XCircle,
  ChevronLeft,
  MoreHorizontal,
  FilterX,
} from "lucide-react";
import { useAppStore, type HistoryItem } from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn, methodColor, normalizeAuth, normalizeBody, normalizeKVPairs, statusClass } from "../../lib/cn";
import { formatLatency, parseUtcDate, formatRelativeTime } from "../../lib/format";
import { useToast } from "../ui/Toast";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";

type MethodFilter = "ALL" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "WS" | "GQL" | "SSE";
type StatusFilter = "ALL" | "2xx" | "3xx" | "4xx" | "5xx" | "err";
type TimeFilter = "ALL" | "today" | "yesterday" | "week";
type DateGroup = "today" | "yesterday" | "this_week" | "older";
const HISTORY_PAGE_SIZE = 100;
const EMPTY_HISTORY: HistoryItem[] = [];

const GROUP_LABELS: Record<DateGroup, { title: string; subtitle: string }> = {
  today: { title: "Today", subtitle: "Requests executed today" },
  yesterday: { title: "Yesterday", subtitle: "Requests from yesterday" },
  this_week: { title: "Earlier This Week", subtitle: "Past 7 days" },
  older: { title: "Older", subtitle: "Earlier requests" },
};

// Re-export shared utilities for backward compatibility with any existing imports
export { formatLatency, parseUtcDate, formatRelativeTime } from "../../lib/format";

function normalizeHistory(raw: any) {
  const req = raw.request_snapshot || {};
  const res = raw.response_metadata || {};
  const method = (raw.method || req.method || "GET").toUpperCase();
  const url = raw.url || req.url || "";
  const statusCode = raw.statusCode ?? raw.status_code ?? res.status_code ?? 0;
  const rawDuration = raw.durationMs ?? raw.duration_ms ?? raw.duration ?? 0;
  const durationMs = typeof rawDuration === "number" && !Number.isNaN(rawDuration)
    ? Math.round(rawDuration)
    : 0;
  const executedAt = raw.executedAt || raw.executed_at || new Date().toISOString();
  return {
    id: raw.id,
    method,
    url,
    statusCode,
    durationMs,
    executedAt,
    request: req,
    response: res,
    raw,
  };
}

function getLocalDateKey(value: string): string {
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getSearchableHistoryText(raw: any): string {
  const item = normalizeHistory(raw);
  const resBody = item.response?.body;
  const resBodyStr = typeof resBody === "object" ? JSON.stringify(resBody) : String(resBody ?? "");
  return [
    item.method,
    item.url,
    item.statusCode,
    JSON.stringify(item.request.headers ?? {}),
    JSON.stringify(item.request.params ?? {}),
    JSON.stringify(item.request.body ?? ""),
    JSON.stringify(item.response.headers ?? {}),
    resBodyStr,
    item.response.status_text ?? "",
  ].join(" ").toLowerCase();
}

function assertHistorySuccess(result: any): void {
  if (result?.status !== "ok") {
    throw new Error(result?.error?.message || "History request failed");
  }
}

function containsRedactedValue(value: unknown): boolean {
  return JSON.stringify(value)?.includes("[REDACTED]") ?? false;
}

function clearRedactedValues(value: string): string {
  return value === "[REDACTED]" ? "" : value;
}

function getDateGroup(dateStr: string): DateGroup {
  try {
    const d = parseUtcDate(dateStr);
    const now = new Date();
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (dDate === todayDate) return "today";
    if (dDate === todayDate - oneDay) return "yesterday";
    if (dDate > todayDate - 7 * oneDay) return "this_week";
    return "older";
  } catch {
    return "older";
  }
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

function generateCurl(item: {
  method: string;
  url: string;
  headers?: any;
  params?: any;
  body?: any;
}): string {
  const method = (item.method || "GET").toUpperCase();
  let fullUrl = item.url;

  if (item.params && typeof item.params === "object" && Object.keys(item.params).length > 0) {
    try {
      const u = new URL(fullUrl);
      for (const [k, v] of Object.entries(item.params)) {
        if (k && !u.searchParams.has(k)) {
          u.searchParams.append(k, String(v));
        }
      }
      fullUrl = u.toString();
    } catch {
      // ignore
    }
  }

  let cmd = `curl -X ${method} "${fullUrl}"`;

  const hdrs = item.headers;
  if (Array.isArray(hdrs)) {
    for (const h of hdrs) {
      if (h.enabled !== false && h.key) {
        cmd += ` \\\n  -H "${h.key}: ${h.value}"`;
      }
    }
  } else if (hdrs && typeof hdrs === "object") {
    for (const [k, v] of Object.entries(hdrs)) {
      if (k) {
        cmd += ` \\\n  -H "${k}: ${v}"`;
      }
    }
  }

  if (item.body) {
    let bodyStr = "";
    if (typeof item.body === "string") {
      bodyStr = item.body;
    } else if (item.body.type === "json" && item.body.content) {
      bodyStr = typeof item.body.content === "string" ? item.body.content : JSON.stringify(item.body.content);
    } else if (typeof item.body === "object") {
      bodyStr = JSON.stringify(item.body);
    }
    if (bodyStr.trim() && method !== "GET" && method !== "HEAD") {
      const escaped = bodyStr.replace(/'/g, "'\\''");
      cmd += ` \\\n  --data '${escaped}'`;
    }
  }

  return cmd;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  item: any | null;
}

export function HistoryView() {
  const { history: storedHistory, setHistory, activeWorkspaceId, openTab } = useAppStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [bulkProgress, setBulkProgress] = useState<{ label: string; completed: number; total: number } | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyWorkspaceId, setHistoryWorkspaceId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [overflowMenu, setOverflowMenu] = useState<{ x: number; y: number } | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(460);
  const loadGenerationRef = useRef(0);
  const history = historyWorkspaceId === activeWorkspaceId ? storedHistory : EMPTY_HISTORY;

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Selection & Inspector
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectedItem, setInspectedItem] = useState<any | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"request" | "response">("request");
  const [reqSubTab, setReqSubTab] = useState<"headers" | "params" | "body" | "auth">("headers");
  const [resSubTab, setResSubTab] = useState<"body" | "headers" | "meta">("body");

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<DateGroup, boolean>>({
    today: false,
    yesterday: false,
    this_week: false,
    older: false,
  });

  // Context Menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    item: null,
  });
  // Save to Collection Modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTargetItem, setSaveTargetItem] = useState<any | null>(null);
  const [collectionsList, setCollectionsList] = useState<any[]>([]);
  const [selectedColId, setSelectedColId] = useState<string>("");
  const [newColName, setNewColName] = useState("");
  const [saveReqName, setSaveReqName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Load every history page so filters, metrics, and bulk actions operate on the full workspace history.
  const load = useCallback(async () => {
    const workspaceId = activeWorkspaceId;
    const generation = ++loadGenerationRef.current;
    if (!workspaceId) {
      setHistory([]);
      setHistoryWorkspaceId(null);
      setHistoryTotal(0);
      setLoadError(null);
      setLoadingProgress(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setLoadingProgress(0);
    try {
      const firstPage: any = await bridge.getRequestHistory(workspaceId, 1, HISTORY_PAGE_SIZE);
      assertHistorySuccess(firstPage);
      const total = Number.isFinite(firstPage.total) ? firstPage.total : (firstPage.items?.length ?? 0);
      const allItems: any[] = Array.isArray(firstPage.items) ? [...firstPage.items] : [];
      setLoadingProgress(allItems.length);

      const pageCount = Math.ceil(total / HISTORY_PAGE_SIZE);
      for (let page = 2; page <= pageCount; page += 1) {
        if (generation !== loadGenerationRef.current) return;
        const result: any = await bridge.getRequestHistory(workspaceId, page, HISTORY_PAGE_SIZE);
        assertHistorySuccess(result);
        const pageItems = Array.isArray(result.items) ? result.items : [];
        if (pageItems.length === 0) break;
        allItems.push(...pageItems);
        setLoadingProgress(allItems.length);
      }

      if (generation !== loadGenerationRef.current) return;
      const uniqueItems = Array.from(
        new Map(allItems.map((item) => [item.id, item])).values(),
      );
      setHistory(uniqueItems);
      setHistoryWorkspaceId(workspaceId);
      setHistoryTotal(uniqueItems.length);
      setHistoryPage(1);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load request history";
      setLoadError(message);
      toast(message, "error");
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [activeWorkspaceId, setHistory, toast]);

  useEffect(() => {
    setHistory([]);
    setHistoryWorkspaceId(null);
    setHistoryTotal(0);
    setLoadError(null);
    setLoadingProgress(0);
    setSelectedIds(new Set());
    setInspectedItem(null);
    setCtxMenu((current) => ({ ...current, visible: false, item: null }));
    setHistoryPage(1);
    setSearchQuery("");
    setMethodFilter("ALL");
    setStatusFilter("ALL");
    setTimeFilter("ALL");
    setStartDate("");
    setEndDate("");
    setOverflowMenu(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [activeWorkspaceId, load, setHistory]);

  // Open in Request Tab
  const openFromHistory = (item: any) => {
    const norm = normalizeHistory(item);
    const req = norm.request || {};
    const hadRedactedValues = containsRedactedValue({ url: norm.url, request: req });
    const body = normalizeBody(req.body);
    if (body.content) body.content = body.content.replace(/\[REDACTED\]/g, "");
    const auth = normalizeAuth(req.auth);
    if (auth.token === "[REDACTED]") auth.token = "";
    if (auth.password === "[REDACTED]") auth.password = "";
    if (auth.value === "[REDACTED]") auth.value = "";
    if (auth.configuration) {
      auth.configuration = Object.fromEntries(
        Object.entries(auth.configuration).map(([key, value]) => [key, clearRedactedValues(value)]),
      );
    }
    if (hadRedactedValues) {
      toast("Sensitive values were redacted from history; review this request before sending it.", "info");
    }
    let tabName = `${norm.method} Request`;
    try {
      if (norm.url) tabName = `${norm.method} ${new URL(norm.url).pathname}`;
    } catch {
      // ignore
    }

    openTab({
      method: norm.method,
      url: norm.url,
      name: tabName,
      headers: normalizeKVPairs(req.headers).map((pair) => ({ ...pair, value: clearRedactedValues(pair.value) })),
      params: normalizeKVPairs(req.params).map((pair) => ({ ...pair, value: clearRedactedValues(pair.value) })),
      pathVariables: normalizeKVPairs(req.path_variables ?? req.pathVariables),
      body,
      auth,
      options: req.options ?? {},
      protocol: ["http", "websocket", "graphql", "sse"].includes(req.protocol)
        ? req.protocol
        : norm.method === "WS"
        ? "websocket"
        : norm.method === "GQL"
        ? "graphql"
        : norm.method === "SSE"
        ? "sse"
        : "http",
    });
  };

  // Immediate Re-Run
  const handleReRun = async (rawItem: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const norm = normalizeHistory(rawItem);
    const req = norm.request || {};
    try {
      if (containsRedactedValue({ url: norm.url, request: req })) {
        toast("This history record contains redacted sensitive values. Open it in a tab and restore them before re-running.", "error");
        return;
      }
      toast(`Re-running ${norm.method} ${norm.url}…`, "info");
      if (norm.method === "GQL") {
        const query = typeof req.body === "object" ? req.body.query : req.body;
        const variables = typeof req.body === "object" ? req.body.variables : {};
        await bridge.graphqlExecute({
          url: norm.url,
          query,
          variables,
        });
        toast("GraphQL query executed successfully", "success");
        load();
        return;
      }
      const payload = {
        method: norm.method,
        url: norm.url,
        headers: req.headers || {},
        params: req.params || {},
        body: req.body,
        auth: req.auth,
        options: req.options || {},
        environment_id: req.environment_id,
        workspace_id: activeWorkspaceId ?? undefined,
      };
      const res: any = await bridge.sendRequest(payload);
      const status = res?.status_code ?? res?.statusCode ?? 200;
      const dur = res?.duration_ms ?? res?.durationMs ?? 0;
      toast(`Completed: ${status} (${Math.round(dur)}ms)`, status < 400 ? "success" : "error");
      load();
    } catch (err: any) {
      toast(err?.message || "Re-run failed", "error");
    }
  };

  // Delete single record
  const handleDeleteItem = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (bulkProgress) return;
    try {
      const result: any = await bridge.deleteHistoryItem(id, activeWorkspaceId ?? undefined);
      assertHistorySuccess(result);
      if (!result.deleted) throw new Error("History record was not found");
      if (inspectedItem?.id === id) setInspectedItem(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
      toast("History record deleted", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete record", "error");
    }
  };

  // Clear all records
  const handleClear = async () => {
    if (bulkProgress) return;
    if (!activeWorkspaceId) return;
    if (!confirm("Are you sure you want to clear all request history in this workspace?")) return;
    try {
      const result: any = await bridge.clearRequestHistory(activeWorkspaceId);
      assertHistorySuccess(result);
      setInspectedItem(null);
      setSelectedIds(new Set());
      await load();
      toast(`Cleared ${result.deleted_count ?? history.length} history records`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to clear history", "error");
    }
  };

  // Clear errors only (4xx & 5xx)
  const handleClearErrors = async () => {
    if (bulkProgress) return;
    const errorItems = history.filter((raw) => {
      const n = normalizeHistory(raw);
      return n.statusCode >= 400 || n.statusCode === 0;
    });
    if (errorItems.length === 0) {
      toast("No error records to clear", "info");
      return;
    }
    if (!confirm(`Delete ${errorItems.length} failed requests (4xx/5xx or no status)?`)) return;
    const deletedIds: string[] = [];
    let failed = 0;
    let firstFailure: string | null = null;
    setBulkProgress({ label: "Deleting error records", completed: 0, total: errorItems.length });
    try {
      for (let index = 0; index < errorItems.length; index += 1) {
        const item = errorItems[index];
        try {
          const result: any = await bridge.deleteHistoryItem(item.id, activeWorkspaceId ?? undefined);
          assertHistorySuccess(result);
          if (result.deleted) deletedIds.push(item.id);
          else {
            failed += 1;
            firstFailure ||= "A record was not found";
          }
        } catch (error) {
          failed += 1;
          firstFailure ||= error instanceof Error ? error.message : "A record could not be deleted";
        }
        setBulkProgress({ label: "Deleting error records", completed: index + 1, total: errorItems.length });
      }
      setSelectedIds((previous) => new Set([...previous].filter((id) => !deletedIds.includes(id))));
      if (inspectedItem && deletedIds.includes(inspectedItem.id)) setInspectedItem(null);
      await load();
      toast(
        failed === 0
          ? `Cleared ${deletedIds.length} error records`
          : `Deleted ${deletedIds.length} error records; ${failed} could not be deleted. ${firstFailure ?? ""}`,
        failed === 0 ? "success" : "error",
      );
    } finally {
      setBulkProgress(null);
    }
  };

  // Bulk delete selected
  const handleBulkDelete = async () => {
    if (bulkProgress) return;
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected history records?`)) return;
    const ids = [...selectedIds];
    const deletedIds: string[] = [];
    let failed = 0;
    let firstFailure: string | null = null;
    setBulkProgress({ label: "Deleting selected records", completed: 0, total: ids.length });
    try {
      for (let index = 0; index < ids.length; index += 1) {
        try {
          const result: any = await bridge.deleteHistoryItem(ids[index], activeWorkspaceId ?? undefined);
          assertHistorySuccess(result);
          if (result.deleted) deletedIds.push(ids[index]);
          else {
            failed += 1;
            firstFailure ||= "A record was not found";
          }
        } catch (error) {
          failed += 1;
          firstFailure ||= error instanceof Error ? error.message : "A record could not be deleted";
        }
        setBulkProgress({ label: "Deleting selected records", completed: index + 1, total: ids.length });
      }
      setSelectedIds((previous) => new Set([...previous].filter((id) => !deletedIds.includes(id))));
      if (inspectedItem && deletedIds.includes(inspectedItem.id)) {
        setInspectedItem(null);
      }
      await load();
      toast(
        failed === 0
          ? `Deleted ${deletedIds.length} records`
          : `Deleted ${deletedIds.length} records; ${failed} could not be deleted. ${firstFailure ?? ""}`,
        failed === 0 ? "success" : "error",
      );
    } finally {
      setBulkProgress(null);
    }
  };

  // Export history as JSON
  const handleExportHistory = (records: any[] = history, label = "history") => {
    if (records.length === 0) {
      toast("No history to export", "info");
      return;
    }
    const exportData = records.map((raw) => normalizeHistory(raw));
    const fileLabel = label.replace(/\s+/g, "_");
    downloadJson(exportData, `kurorelay_${fileLabel}_${new Date().toISOString().slice(0, 10)}.json`);
    toast(`Exported ${records.length} ${label} records`, "success");
  };

  // Open Save to Collection Modal
  const handleOpenSaveModal = async (rawItem: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const norm = normalizeHistory(rawItem);
    setSaveTargetItem(rawItem);
    let defaultName = `${norm.method} Request`;
    try {
      if (norm.url) defaultName = `${norm.method} ${new URL(norm.url).pathname}`;
    } catch {
      // ignore
    }
    setSaveReqName(defaultName);
    setSaveModalOpen(true);

    if (activeWorkspaceId) {
      try {
        const res: any = await bridge.getCollections(activeWorkspaceId);
        const cols = res?.collections ?? [];
        setCollectionsList(cols);
        if (cols.length > 0) {
          setSelectedColId(cols[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Submit Save to Collection
  const handleSaveToCollection = async () => {
    if (!saveTargetItem || !activeWorkspaceId) return;
    setSaveLoading(true);
    try {
      let targetColId = selectedColId;
      if (!targetColId && newColName.trim()) {
        const res: any = await bridge.createCollection({
          workspace_id: activeWorkspaceId,
          name: newColName.trim(),
        });
        targetColId = res?.collection?.id;
      }
      if (!targetColId && collectionsList.length > 0) {
        targetColId = collectionsList[0].id;
      }

      const norm = normalizeHistory(saveTargetItem);
      const req = norm.request || {};

      await bridge.saveRequest({
        workspace_id: activeWorkspaceId,
        collection_id: targetColId,
        collection_name: newColName.trim() || undefined,
        name: saveReqName.trim() || `${norm.method} ${norm.url}`,
        method: norm.method,
        url: norm.url,
        configuration: {
          headers: req.headers || {},
          params: req.params || {},
          body: req.body,
          auth: req.auth,
        },
      });

      toast(`Saved "${saveReqName}" to collection!`, "success");
      setSaveModalOpen(false);
      setSaveTargetItem(null);
      setNewColName("");
    } catch (err: any) {
      toast(err?.message || "Failed to save request", "error");
    } finally {
      setSaveLoading(false);
    }
  };

  // Copy cURL
  const handleCopyCurl = (rawItem: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const norm = normalizeHistory(rawItem);
    const req = norm.request || {};
    const curl = generateCurl({
      method: norm.method,
      url: norm.url,
      headers: req.headers,
      params: req.params,
      body: req.body,
    });
    navigator.clipboard.writeText(curl);
    toast("Copied cURL command to clipboard", "success");
  };

  // Copy URL
  const handleCopyUrl = (url: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(url);
    toast("Copied URL to clipboard", "success");
  };

  // Multi-select helpers
  const handleToggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allFilteredSelected) filteredHistory.forEach((item) => next.delete(item.id));
      else filteredHistory.forEach((item) => next.add(item.id));
      return next;
    });
  };

  // Open context menu
  const handleOpenContextMenu = (e: React.MouseEvent, rawItem: any) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 280),
      item: rawItem,
    });
  };

  // ── Metrics Calculation ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (history.length === 0) return null;
    let totalDur = 0;
    let successCount = 0;
    let errorCount = 0;
    let fastest = Infinity;
    let slowest = 0;

    for (const raw of history) {
      const n = normalizeHistory(raw);
      const d = n.durationMs || 0;
      totalDur += d;
      if (d > 0 && d < fastest) fastest = d;
      if (d > slowest) slowest = d;
      if (n.statusCode >= 200 && n.statusCode < 400) {
        successCount++;
      } else if (n.statusCode >= 400 || n.statusCode === 0) {
        errorCount++;
      }
    }

    const successRate = Math.round((successCount / history.length) * 100);
    const avgLatency = Math.round(totalDur / history.length);

    return {
      total: history.length,
      successRate,
      avgLatency,
      errorCount,
      fastest: fastest === Infinity ? 0 : Math.round(fastest),
      slowest: Math.round(slowest),
    };
  }, [history]);

  // ── Filtering & Grouping ─────────────────────────────────────────────────
  const filteredHistory = history.filter((raw) => {
      const n = normalizeHistory(raw);

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!getSearchableHistoryText(raw).includes(q)) return false;
      }

      // Method Filter
      if (methodFilter !== "ALL" && n.method !== methodFilter) {
        return false;
      }

      // Status Filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "2xx" && (n.statusCode < 200 || n.statusCode >= 300)) return false;
        if (statusFilter === "3xx" && (n.statusCode < 300 || n.statusCode >= 400)) return false;
        if (statusFilter === "4xx" && (n.statusCode < 400 || n.statusCode >= 500)) return false;
        if (statusFilter === "5xx" && (n.statusCode < 500 || n.statusCode >= 600)) return false;
        if (statusFilter === "err" && n.statusCode > 0 && n.statusCode < 400) return false;
      }

      // Time Filter
      if (timeFilter !== "ALL") {
        const g = getDateGroup(n.executedAt);
        if (timeFilter === "today" && g !== "today") return false;
        if (timeFilter === "yesterday" && g !== "yesterday") return false;
        if (timeFilter === "week" && g !== "today" && g !== "yesterday" && g !== "this_week") return false;
      }

      const dateKey = getLocalDateKey(n.executedAt);
      if (startDate && (!dateKey || dateKey < startDate)) return false;
      if (endDate && (!dateKey || dateKey > endDate)) return false;

      return true;
  });

  useEffect(() => {
    setHistoryPage(1);
  }, [searchQuery, methodFilter, statusFilter, timeFilter, startDate, endDate]);

  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = filteredHistory.slice(
    (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE,
  );
  const allFilteredSelected = filteredHistory.length > 0
    && filteredHistory.every((item) => selectedIds.has(item.id));

  const groupedHistory = useMemo(() => {
    const groups: Record<DateGroup, any[]> = {
      today: [],
      yesterday: [],
      this_week: [],
      older: [],
    };

    for (const raw of pagedHistory) {
      const n = normalizeHistory(raw);
      const g = getDateGroup(n.executedAt);
      groups[g].push(raw);
    }

    return groups;
  }, [pagedHistory]);

  const toggleGroupCollapse = (g: DateGroup) => {
    setCollapsedGroups((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  const hasActiveFilters = Boolean(
    searchQuery || methodFilter !== "ALL" || statusFilter !== "ALL" || timeFilter !== "ALL" || startDate || endDate,
  );
  const clearFilters = () => {
    setSearchQuery("");
    setMethodFilter("ALL");
    setStatusFilter("ALL");
    setTimeFilter("ALL");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none bg-[var(--bg-base)]">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--tx-3)]">Total Executions:</span>
            <span className="font-mono font-semibold text-[var(--tx-1)]">{historyTotal}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--tx-3)]">Success Rate:</span>
            <span
              className={cn(
                "font-mono font-semibold px-1.5 py-0.2 rounded text-[11px]",
                stats.successRate >= 90
                  ? "text-[var(--ok)] bg-[var(--ok)]/10"
                  : stats.successRate >= 70
                  ? "text-[var(--amber)] bg-[var(--amber)]/10"
                  : "text-[var(--err)] bg-[var(--err)]/10",
              )}
            >
              {stats.successRate}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--tx-3)]">Avg Latency:</span>
            <span className="font-mono font-semibold text-cyan-400">{formatLatency(stats.avgLatency)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--tx-3)]">Latency Range:</span>
            <span className="font-mono text-[11px] text-[var(--tx-2)]">
              {formatLatency(stats.fastest)} – {formatLatency(stats.slowest)}
            </span>
          </div>
        </div>
      )}

      {/* ── Filter & Search Toolbar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-s2)] rounded-[var(--r-md)] border border-[var(--border)] text-xs text-[var(--tx-2)] focus-within:border-[var(--lime)] w-full">
            <Search size={13} className="text-[var(--tx-3)] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search URL, method, status, headers, params, or request body..."
              className="bg-transparent outline-none flex-1 text-xs text-[var(--tx-1)] placeholder-[var(--tx-3)]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-[var(--tx-3)] hover:text-[var(--tx-1)]">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Method & Protocol Filter Pills */}
        <div className="flex items-center gap-1 bg-[var(--bg-s2)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)]">
          {(["ALL", "GET", "POST", "PUT", "DELETE", "PATCH", "WS", "GQL", "SSE"] as MethodFilter[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                methodFilter === m
                  ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-bold shadow-sm"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-[var(--bg-s2)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)]">
          {(
            [
              { id: "ALL", label: "All" },
              { id: "2xx", label: "2xx", color: "text-[var(--ok)]" },
              { id: "3xx", label: "3xx", color: "text-[var(--warn)]" },
              { id: "4xx", label: "4xx", color: "text-[var(--amber)]" },
              { id: "5xx", label: "5xx", color: "text-[var(--err)]" },
              { id: "err", label: "Err", color: "text-[var(--err)]" },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id as StatusFilter)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                statusFilter === s.id
                  ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-bold shadow-sm"
                  : cn("text-[var(--tx-3)] hover:text-[var(--tx-1)]", (s as any).color),
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Time Filter Pills */}
        <div className="flex items-center gap-1 bg-[var(--bg-s2)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)]">
          {(
            [
              { id: "ALL", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "7 Days" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTimeFilter(t.id as TimeFilter);
                setStartDate("");
                setEndDate("");
              }}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] transition-colors",
                timeFilter === t.id
                  ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                  : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s2)] px-2 py-1 text-[10px] text-[var(--tx-3)]">
          From
          <input
            type="date"
            aria-label="Filter from date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => {
              setStartDate(event.target.value);
              setTimeFilter("ALL");
            }}
            className="bg-transparent text-[10px] text-[var(--tx-1)] outline-none"
          />
        </label>
        <label className="flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s2)] px-2 py-1 text-[10px] text-[var(--tx-3)]">
          To
          <input
            type="date"
            aria-label="Filter through date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => {
              setEndDate(event.target.value);
              setTimeFilter("ALL");
            }}
            className="bg-transparent text-[10px] text-[var(--tx-1)] outline-none"
          />
        </label>

        {/* Master Select All Toggle */}
        {filteredHistory.length > 0 && (
          <button
            onClick={handleToggleSelectAll}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s2)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors text-[11px]"
            title="Toggle Select All"
          >
            <input
              type="checkbox"
              checked={allFilteredSelected}
              readOnly
              className="cursor-pointer accent-[var(--lime)]"
            />
            <span>{allFilteredSelected ? "Deselect All" : "Select All"}</span>
          </button>
        )}

        <button
          type="button"
          aria-label="History actions"
          title="History actions"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setOverflowMenu({ x: bounds.right, y: bounds.bottom });
          }}
          className="ml-auto rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s2)] p-1.5 text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)]"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {overflowMenu && (
        <ContextMenu
          x={overflowMenu.x}
          y={overflowMenu.y}
          header="History Actions"
          onClose={() => setOverflowMenu(null)}
          items={[
            {
              label: "Refresh",
              icon: <RefreshCw size={13} className={cn(loading && "animate-spin")} />,
              disabled: loading || !!bulkProgress,
              onSelect: () => void load(),
            },
            {
              label: "Export",
              icon: <Download size={13} />,
              disabled: history.length === 0,
              children: [
                {
                  label: `All history (${history.length})`,
                  onSelect: () => handleExportHistory(history, "history"),
                },
                {
                  label: `Filtered results (${filteredHistory.length})`,
                  disabled: filteredHistory.length === 0,
                  onSelect: () => handleExportHistory(filteredHistory, "filtered history"),
                },
              ],
            },
            { label: "", separator: true },
            {
              label: `Clear Errors (${stats?.errorCount ?? 0})`,
              icon: <XCircle size={13} />,
              danger: true,
              disabled: !stats?.errorCount || !!bulkProgress,
              onSelect: () => void handleClearErrors(),
            },
            {
              label: "Clear All History",
              icon: <Trash2 size={13} />,
              danger: true,
              disabled: history.length === 0 || !!bulkProgress,
              onSelect: () => void handleClear(),
            },
          ]}
        />
      )}

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-1.5 text-[10px]">
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              Search: <span className="max-w-40 truncate">{searchQuery}</span><X size={10} />
            </button>
          )}
          {methodFilter !== "ALL" && (
            <button onClick={() => setMethodFilter("ALL")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              Method: {methodFilter}<X size={10} />
            </button>
          )}
          {statusFilter !== "ALL" && (
            <button onClick={() => setStatusFilter("ALL")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              Status: {statusFilter}<X size={10} />
            </button>
          )}
          {timeFilter !== "ALL" && (
            <button onClick={() => setTimeFilter("ALL")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              Time: {timeFilter === "week" ? "7 days" : timeFilter}<X size={10} />
            </button>
          )}
          {startDate && (
            <button onClick={() => setStartDate("")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              From: {startDate}<X size={10} />
            </button>
          )}
          {endDate && (
            <button onClick={() => setEndDate("")} className="flex items-center gap-1 rounded-full bg-[var(--bg-s3)] px-2 py-0.5 text-[var(--tx-2)]">
              To: {endDate}<X size={10} />
            </button>
          )}
          <button
            onClick={clearFilters}
            className="ml-auto flex items-center gap-1 text-[var(--lime)] hover:opacity-80"
          >
            <FilterX size={11} /> Clear filters
          </button>
        </div>
      )}

      {loadError && history.length > 0 && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-[var(--err)]/30 bg-[var(--err)]/10 px-4 py-2 text-xs text-[var(--err)]">
          <span>{loadError}</span>
          <button onClick={() => void load()} className="shrink-0 underline underline-offset-2">Retry</button>
        </div>
      )}
      {bulkProgress && (
        <div role="status" className="flex items-center gap-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-1.5 text-[11px] text-[var(--tx-2)]">
          <span className="shrink-0">{bulkProgress.label} {bulkProgress.completed}/{bulkProgress.total}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-s3)]">
            <div
              className="h-full bg-[var(--lime)] transition-[width]"
              style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Main Workbench Split View ───────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Grouped Table/List */}
        <div className="flex-1 overflow-auto">
          {loading && history.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-[var(--tx-3)]">
              Loading history records… {loadingProgress > 0 ? `(${loadingProgress} loaded)` : ""}
            </div>
          ) : loadError && history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <p className="text-sm font-semibold text-[var(--err)]">Could not load history</p>
              <p className="max-w-md text-xs text-[var(--tx-3)]">{loadError}</p>
              <button onClick={() => void load()} className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--tx-1)] hover:bg-[var(--bg-hover)]">
                Retry
              </button>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--tx-3)] p-8 text-center">
              <Clock size={36} strokeWidth={1} />
              <p className="text-sm font-semibold text-[var(--tx-2)]">
                {hasActiveFilters
                  ? "No matching requests found"
                  : "No recorded requests in this workspace"}
              </p>
              <p className="text-xs max-w-sm">
                Requests you execute from the Request Builder or Runner are recorded here automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(["today", "yesterday", "this_week", "older"] as DateGroup[]).map((groupKey) => {
                const items = groupedHistory[groupKey];
                if (items.length === 0) return null;
                const isCollapsed = collapsedGroups[groupKey];

                return (
                  <div key={groupKey} className="border-b border-[var(--border-dim)]">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroupCollapse(groupKey)}
                      className="flex items-center justify-between w-full px-4 py-2 bg-[var(--bg-s2)] hover:bg-[var(--bg-hover)] text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight size={13} className="text-[var(--tx-3)]" />
                        ) : (
                          <ChevronDown size={13} className="text-[var(--tx-3)]" />
                        )}
                        <Calendar size={13} className="text-[var(--lime)]" />
                        <span className="text-xs font-semibold text-[var(--tx-1)]">
                          {GROUP_LABELS[groupKey].title}
                        </span>
                        <span className="text-[11px] text-[var(--tx-3)]">({items.length} requests)</span>
                      </div>
                      <span className="text-[10px] text-[var(--tx-3)]">{GROUP_LABELS[groupKey].subtitle}</span>
                    </button>

                    {/* Group Table */}
                    {!isCollapsed && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-[var(--tx-3)] bg-[var(--bg-s1)] border-b border-[var(--border-dim)]">
                            <th className="w-10 px-3 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  items.length > 0 && items.every((i) => selectedIds.has(i.id))
                                }
                                onChange={() => {
                                  const allInGroup = items.every((i) => selectedIds.has(i.id));
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (allInGroup) items.forEach((i) => next.delete(i.id));
                                    else items.forEach((i) => next.add(i.id));
                                    return next;
                                  });
                                }}
                                className="cursor-pointer accent-[var(--lime)]"
                              />
                            </th>
                            <th className="text-left px-3 py-1.5 font-normal w-20">Method</th>
                            <th className="text-left px-3 py-1.5 font-normal">URL</th>
                            <th className="text-left px-3 py-1.5 font-normal w-24">Status</th>
                            <th className="text-right px-3 py-1.5 font-normal w-20">Latency</th>
                            <th className="text-right px-3 py-1.5 font-normal w-32">Executed</th>
                            <th className="w-36 text-right px-3 py-1.5 font-normal">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((rawItem) => {
                            const item = normalizeHistory(rawItem);
                            const isSelected = selectedIds.has(item.id);
                            const isInspected = inspectedItem?.id === item.id;
                            const timeStr = formatRelativeTime(item.executedAt);

                            return (
                              <tr
                                key={item.id}
                                onClick={() => setInspectedItem(rawItem)}
                                onContextMenu={(e) => handleOpenContextMenu(e, rawItem)}
                                className={cn(
                                  "border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors group",
                                  isSelected && "bg-[var(--lime)]/5",
                                  isInspected && "bg-[var(--bg-s3)] border-l-2 border-l-[var(--lime)]",
                                )}
                              >
                                {/* Checkbox */}
                                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => handleToggleSelectRow(item.id, e as any)}
                                    className="cursor-pointer accent-[var(--lime)]"
                                  />
                                </td>

                                {/* Method */}
                                <td className="px-3 py-2">
                                  <span
                                    className={cn(
                                      "font-mono font-bold text-xs",
                                      methodColor(item.method),
                                    )}
                                  >
                                    {item.method}
                                  </span>
                                </td>

                                {/* URL */}
                                <td className="px-3 py-2 font-mono text-[var(--tx-2)] group-hover:text-[var(--tx-1)] truncate max-w-sm">
                                  {item.url}
                                </td>

                                {/* Status */}
                                <td className="px-3 py-2">
                                  {item.statusCode > 0 ? (
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-mono",
                                        statusClass(item.statusCode),
                                      )}
                                    >
                                      {item.statusCode}
                                    </span>
                                  ) : (
                                    <span className="text-[var(--tx-3)] font-mono text-[10px]">—</span>
                                  )}
                                </td>

                                {/* Latency */}
                                <td className="px-3 py-2 text-right font-mono text-[var(--tx-3)]">
                                  {item.durationMs > 0 ? formatLatency(item.durationMs) : "—"}
                                </td>

                                {/* Time */}
                                <td
                                  title={parseUtcDate(item.executedAt).toLocaleString()}
                                  className="px-3 py-2 text-right text-[var(--tx-3)] whitespace-nowrap text-[11px]"
                                >
                                  {timeStr}
                                </td>

                                {/* Actions */}
                                <td
                                  className="px-3 py-2 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => setInspectedItem(rawItem)}
                                      title="Inspect Details"
                                      className="p-1 text-[var(--tx-3)] hover:text-cyan-400 hover:bg-[var(--bg-s3)] rounded transition-colors"
                                    >
                                      <Eye size={12} />
                                    </button>
                                    <button
                                      onClick={() => openFromHistory(rawItem)}
                                      title="Open in Tab"
                                      className="p-1 text-[var(--tx-3)] hover:text-[var(--lime)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                                    >
                                      <ExternalLink size={12} />
                                    </button>
                                    <button
                                      onClick={(e) => handleReRun(rawItem, e)}
                                      title="Re-run Request"
                                      className="p-1 text-[var(--tx-3)] hover:text-[var(--ok)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                                    >
                                      <Play size={12} />
                                    </button>
                                    <button
                                      onClick={(e) => handleOpenSaveModal(rawItem, e)}
                                      title="Save to Collection"
                                      className="p-1 text-[var(--tx-3)] hover:text-[var(--amber)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                                    >
                                      <FolderPlus size={12} />
                                    </button>
                                    <button
                                      onClick={(e) => handleDeleteItem(item.id, e)}
                                      title="Delete Record"
                                      className="p-1 text-[var(--tx-3)] hover:text-[var(--err)] hover:bg-[var(--bg-s3)] rounded transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
              {historyPageCount > 1 && (
                <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[var(--border-dim)] bg-[var(--bg-s1)] px-4 py-2 text-[11px]">
                  <span className="text-[var(--tx-3)]">
                    Showing {(currentHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–
                    {Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length}
                    {hasActiveFilters ? ` filtered from ${historyTotal}` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={currentHistoryPage === 1}
                      aria-label="Previous history page"
                      className="rounded border border-[var(--border)] p-1 text-[var(--tx-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="min-w-16 text-center font-mono text-[var(--tx-2)]">
                      {currentHistoryPage} / {historyPageCount}
                    </span>
                    <button
                      onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                      disabled={currentHistoryPage === historyPageCount}
                      aria-label="Next history page"
                      className="rounded border border-[var(--border)] p-1 text-[var(--tx-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Side: Detail Inspector Panel ─────────────────────── */}
        {inspectedItem && (
          <>
            <div
              role="separator"
              aria-label="Resize history details panel"
              aria-orientation="vertical"
              aria-valuemin={320}
              aria-valuemax={720}
              aria-valuenow={inspectorWidth}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                setInspectorWidth(Math.max(320, Math.min(720, window.innerWidth - event.clientX)));
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setInspectorWidth((width) =>
                    Math.max(320, Math.min(720, width + (event.key === "ArrowLeft" ? 16 : -16))),
                  );
                }
              }}
              className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--lime)]/40 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
              style={{ touchAction: "none" }}
            />
            <div
              style={{ width: `${inspectorWidth}px`, maxWidth: "55vw" }}
              className="border-l border-[var(--border-dim)] bg-[var(--bg-s1)] flex flex-col h-full shrink-0 animate-in slide-in-from-right-4 duration-150"
            >
            {(() => {
              const norm = normalizeHistory(inspectedItem);
              const req = norm.request || {};
              const res = norm.response || {};
              const reqHeaderEntries = normalizeKVPairs(req.headers)
                .filter((pair) => pair.key)
                .map((pair) => [pair.key, pair.value] as [string, string]);
              const reqParamEntries = normalizeKVPairs(req.params)
                .filter((pair) => pair.key)
                .map((pair) => [pair.key, pair.value] as [string, string]);
              const resHeaderEntries = normalizeKVPairs(res.headers)
                .filter((pair) => pair.key)
                .map((pair) => [pair.key, pair.value] as [string, string]);

              let resBodyString = "";
              if (res.body !== undefined && res.body !== null) {
                const bodyContent =
                  typeof res.body === "object" && res.body !== null && "data" in res.body
                    ? res.body.data
                    : typeof res.body === "object" && res.body !== null && "raw" in res.body
                    ? res.body.raw
                    : res.body;

                if (typeof bodyContent === "object" && bodyContent !== null) {
                  try {
                    resBodyString = JSON.stringify(bodyContent, null, 2);
                  } catch {
                    resBodyString = String(bodyContent);
                  }
                } else {
                  resBodyString = String(bodyContent ?? "");
                  try {
                    resBodyString = JSON.stringify(JSON.parse(resBodyString), null, 2);
                  } catch {
                    // plain text
                  }
                }
              }

              let reqBodyString = "";
              if (req.body) {
                if (typeof req.body === "object") {
                  try {
                    reqBodyString = JSON.stringify(req.body, null, 2);
                  } catch {
                    reqBodyString = String(req.body);
                  }
                } else {
                  reqBodyString = String(req.body);
                }
              }

              return (
                <>
                  {/* Inspector Header */}
                  <div className="p-3 border-b border-[var(--border-dim)] bg-[var(--bg-s2)] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-mono font-bold",
                            methodColor(norm.method),
                            "bg-[var(--bg-s3)] border border-[var(--border)]",
                          )}
                        >
                          {norm.method}
                        </span>
                        {norm.statusCode > 0 && (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-mono",
                              statusClass(norm.statusCode),
                            )}
                          >
                            {norm.statusCode}
                          </span>
                        )}
                        {norm.durationMs > 0 && (
                          <span className="text-[11px] font-mono text-[var(--tx-3)]">
                            {formatLatency(norm.durationMs)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setInspectedItem(null)}
                        className="text-[var(--tx-3)] hover:text-[var(--tx-1)] p-1 rounded hover:bg-[var(--bg-s3)]"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* URL Row */}
                    <div className="flex items-center gap-1.5 p-1.5 bg-[var(--bg-s3)] rounded-[var(--r-sm)] border border-[var(--border)] text-xs font-mono text-[var(--tx-1)] break-all">
                      <span className="truncate flex-1 select-all">{norm.url}</span>
                      <button
                        onClick={() => handleCopyUrl(norm.url)}
                        title="Copy URL"
                        className="text-[var(--tx-3)] hover:text-[var(--tx-1)] shrink-0 p-1"
                      >
                        <Copy size={11} />
                      </button>
                    </div>

                    {/* Inspector Action Buttons */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openFromHistory(inspectedItem)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--lime)] text-[var(--tx-inv)] font-semibold hover:opacity-90 transition-opacity"
                        >
                          <ExternalLink size={12} />
                          <span>Open in Tab</span>
                        </button>
                        <button
                          onClick={(e) => handleReRun(inspectedItem, e)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--tx-1)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Play size={12} className="text-[var(--ok)]" />
                          <span>Re-Run</span>
                        </button>
                        <button
                          onClick={(e) => handleCopyCurl(inspectedItem, e)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Terminal size={12} />
                          <span>cURL</span>
                        </button>
                        <button
                          onClick={(e) => handleOpenSaveModal(inspectedItem, e)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--bg-s3)] border border-[var(--border)] text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <FolderPlus size={12} className="text-[var(--amber)]" />
                          <span>Save</span>
                        </button>
                      </div>

                      <button
                        onClick={(e) => handleDeleteItem(norm.id, e)}
                        title="Delete this record"
                        className="p-1.5 text-[var(--tx-3)] hover:text-[var(--err)] rounded hover:bg-[var(--bg-s3)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Main Tab Toggle: Request vs Response */}
                  <div className="flex items-center border-b border-[var(--border-dim)] bg-[var(--bg-s2)] px-3 text-xs">
                    <button
                      onClick={() => setInspectorTab("request")}
                      className={cn(
                        "px-4 py-2 font-semibold border-b-2 transition-colors",
                        inspectorTab === "request"
                          ? "border-[var(--lime)] text-[var(--lime)]"
                          : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                      )}
                    >
                      Request Details
                    </button>
                    <button
                      onClick={() => setInspectorTab("response")}
                      className={cn(
                        "px-4 py-2 font-semibold border-b-2 transition-colors",
                        inspectorTab === "response"
                          ? "border-cyan-400 text-cyan-400"
                          : "border-transparent text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                      )}
                    >
                      Response Details
                    </button>
                  </div>

                  {/* Inspector Body Content */}
                  <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
                    {inspectorTab === "request" ? (
                      <>
                        {/* Request Sub-tabs */}
                        <div className="flex items-center gap-1 bg-[var(--bg-s3)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)] text-xs">
                          <button
                            onClick={() => setReqSubTab("headers")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              reqSubTab === "headers"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Headers ({reqHeaderEntries.length})
                          </button>
                          <button
                            onClick={() => setReqSubTab("params")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              reqSubTab === "params"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Params ({reqParamEntries.length})
                          </button>
                          <button
                            onClick={() => setReqSubTab("body")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              reqSubTab === "body"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Body {reqBodyString ? "•" : ""}
                          </button>
                          <button
                            onClick={() => setReqSubTab("auth")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              reqSubTab === "auth"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Auth {req.auth ? "•" : ""}
                          </button>
                        </div>

                        {/* Request Headers */}
                        {reqSubTab === "headers" && (
                          <div className="flex flex-col gap-1">
                            {reqHeaderEntries.length === 0 ? (
                              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                                No custom request headers recorded.
                              </p>
                            ) : (
                              <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-[var(--bg-s3)] text-[10px] uppercase text-[var(--tx-3)] border-b border-[var(--border)]">
                                    <tr>
                                      <th className="text-left px-2.5 py-1 font-normal w-1/3">Key</th>
                                      <th className="text-left px-2.5 py-1 font-normal">Value</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {reqHeaderEntries.map(([k, v]) => (
                                      <tr
                                        key={k}
                                        className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)]"
                                      >
                                        <td className="px-2.5 py-1 font-mono text-[var(--lime)] font-semibold">
                                          {k}
                                        </td>
                                        <td className="px-2.5 py-1 font-mono text-[var(--tx-2)] break-all">
                                          {String(v)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Request Params */}
                        {reqSubTab === "params" && (
                          <div className="flex flex-col gap-1">
                            {reqParamEntries.length === 0 ? (
                              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                                No query parameters recorded.
                              </p>
                            ) : (
                              <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-[var(--bg-s3)] text-[10px] uppercase text-[var(--tx-3)] border-b border-[var(--border)]">
                                    <tr>
                                      <th className="text-left px-2.5 py-1 font-normal w-1/3">Key</th>
                                      <th className="text-left px-2.5 py-1 font-normal">Value</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {reqParamEntries.map(([k, v]) => (
                                      <tr
                                        key={k}
                                        className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)]"
                                      >
                                        <td className="px-2.5 py-1 font-mono text-cyan-400 font-semibold">
                                          {k}
                                        </td>
                                        <td className="px-2.5 py-1 font-mono text-[var(--tx-2)] break-all">
                                          {String(v)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Request Body */}
                        {reqSubTab === "body" && (
                          <div className="flex flex-col gap-2">
                            {!reqBodyString ? (
                              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                                No request body sent.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs text-[var(--tx-3)]">
                                  <span>Body Content</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(reqBodyString);
                                      toast("Copied request body", "success");
                                    }}
                                    className="flex items-center gap-1 text-[var(--tx-2)] hover:text-[var(--tx-1)]"
                                  >
                                    <Copy size={11} /> Copy
                                  </button>
                                </div>
                                <pre className="p-2.5 bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-md)] text-xs font-mono text-[var(--tx-1)] overflow-auto max-h-72 whitespace-pre-wrap">
                                  {reqBodyString}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Request Auth */}
                        {reqSubTab === "auth" && (
                          <div className="flex flex-col gap-2">
                            {!req.auth || req.auth.type === "none" ? (
                              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                                No authentication configured for this request.
                              </p>
                            ) : (
                              <div className="p-3 bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-md)] flex flex-col gap-1.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--tx-3)]">Auth Type:</span>
                                  <span className="font-mono font-semibold uppercase text-[var(--amber)]">
                                    {req.auth.type}
                                  </span>
                                </div>
                                <pre className="p-2 bg-[var(--bg-s2)] rounded text-[11px] font-mono text-[var(--tx-2)] overflow-auto">
                                  {JSON.stringify(req.auth, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Response Sub-tabs */}
                        <div className="flex items-center gap-1 bg-[var(--bg-s3)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)] text-xs">
                          <button
                            onClick={() => setResSubTab("body")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              resSubTab === "body"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Body {resBodyString ? "•" : ""}
                          </button>
                          <button
                            onClick={() => setResSubTab("headers")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              resSubTab === "headers"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Headers ({resHeaderEntries.length})
                          </button>
                          <button
                            onClick={() => setResSubTab("meta")}
                            className={cn(
                              "px-2.5 py-1 rounded text-[11px] transition-colors flex-1 text-center",
                              resSubTab === "meta"
                                ? "bg-[var(--bg-s4)] text-[var(--tx-1)] font-semibold shadow-sm"
                                : "text-[var(--tx-3)] hover:text-[var(--tx-1)]",
                            )}
                          >
                            Overview
                          </button>
                        </div>

                        {/* Response Body */}
                        {resSubTab === "body" && (
                          <div className="flex flex-col gap-2">
                            {!resBodyString ? (
                              <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-[var(--tx-3)]">
                                <p>No response body recorded for this execution.</p>
                                <span className="text-[10px] mt-1 text-[var(--tx-3)] opacity-75">
                                  Response payloads and protocol streams are saved automatically.
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs text-[var(--tx-3)]">
                                  <span className="font-mono text-[11px] text-cyan-400">
                                    {resBodyString.length} characters
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(resBodyString);
                                      toast("Copied response body", "success");
                                    }}
                                    className="flex items-center gap-1 text-[var(--tx-2)] hover:text-[var(--tx-1)] px-2 py-0.5 rounded bg-[var(--bg-s3)] hover:bg-[var(--bg-s4)] border border-[var(--border)] transition-colors"
                                  >
                                    <Copy size={11} /> Copy
                                  </button>
                                </div>
                                <pre className="p-2.5 bg-[var(--bg-s3)] border border-[var(--border)] rounded-[var(--r-md)] text-xs font-mono text-[var(--tx-1)] overflow-auto max-h-96 whitespace-pre-wrap select-all">
                                  {resBodyString}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Response Headers */}
                        {resSubTab === "headers" && (
                          <div className="flex flex-col gap-1">
                            {resHeaderEntries.length === 0 ? (
                              <p className="text-xs text-[var(--tx-3)] py-4 text-center">
                                No response headers captured.
                              </p>
                            ) : (
                              <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-[var(--bg-s3)] text-[10px] uppercase text-[var(--tx-3)] border-b border-[var(--border)]">
                                    <tr>
                                      <th className="text-left px-2.5 py-1 font-normal w-1/3">Header</th>
                                      <th className="text-left px-2.5 py-1 font-normal">Value</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {resHeaderEntries.map(([k, v]) => (
                                      <tr
                                        key={k}
                                        className="border-b border-[var(--border-dim)] hover:bg-[var(--bg-hover)]"
                                      >
                                        <td className="px-2.5 py-1 font-mono text-[var(--tx-2)] font-semibold">
                                          {k}
                                        </td>
                                        <td className="px-2.5 py-1 font-mono text-[var(--tx-3)] break-all">
                                          {String(v)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Response Meta */}
                        {resSubTab === "meta" && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase text-[var(--tx-3)]">Status</span>
                              <span className="font-mono font-bold text-[var(--tx-1)]">
                                {norm.statusCode > 0 ? `${norm.statusCode} ${res.status_text || ""}` : "Error / No Status"}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase text-[var(--tx-3)]">Duration</span>
                              <span className="font-mono font-bold text-cyan-400">
                                {formatLatency(norm.durationMs)}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase text-[var(--tx-3)]">Size</span>
                              <span className="font-mono font-bold text-[var(--tx-1)]">
                                {res.size_bytes ? `${res.size_bytes} bytes` : resBodyString ? `${new Blob([resBodyString]).size} bytes` : "—"}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] border border-[var(--border)] flex flex-col gap-0.5">
                              <span className="text-[10px] uppercase text-[var(--tx-3)]">Executed At</span>
                              <span className="font-mono text-[11px] text-[var(--tx-2)] truncate">
                                {parseUtcDate(norm.executedAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
          </>
        )}
      </div>

      {/* ── Floating Multi-select Action Bar ─────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-s1)] border border-[var(--lime)] rounded-[var(--r-lg)] shadow-2xl px-4 py-2 flex items-center gap-3 text-xs animate-in slide-in-from-bottom-3 duration-150">
          <span className="font-semibold text-[var(--lime)] font-mono">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-[var(--border)]" />
          <button
            onClick={() => {
              const selectedItems = history
                .filter((i) => selectedIds.has(i.id))
                .map((raw) => normalizeHistory(raw));
              downloadJson(
                selectedItems,
                `kurorelay_history_selection_${new Date().toISOString().slice(0, 10)}.json`,
              );
              toast(`Exported ${selectedIds.size} records`, "success");
            }}
            className="flex items-center gap-1 text-[var(--tx-2)] hover:text-cyan-400 transition-colors"
          >
            <Download size={12} /> Export JSON
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={!!bulkProgress}
            className="flex items-center gap-1 text-[var(--err)] font-semibold hover:opacity-85 transition-opacity disabled:opacity-40"
          >
            <Trash2 size={12} /> Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={!!bulkProgress}
            className="text-[var(--tx-3)] hover:text-[var(--tx-1)] ml-2 text-[11px] disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Context Menu (Right Click on History Row) ─────────────────── */}
      {ctxMenu.visible && ctxMenu.item && (() => {
        const item = ctxMenu.item;
        const normalized = normalizeHistory(item);
        const items: ContextMenuItem[] = [
          {
            label: "Open in Request Tab",
            icon: <ExternalLink size={12} className="text-[var(--lime)]" />,
            onSelect: () => openFromHistory(item),
          },
          {
            label: "Re-Run Immediately",
            icon: <Play size={12} className="text-[var(--ok)]" />,
            onSelect: () => handleReRun(item),
          },
          {
            label: "Inspect Details",
            icon: <Eye size={12} className="text-cyan-400" />,
            onSelect: () => setInspectedItem(item),
          },
          { label: "", separator: true },
          {
            label: "Copy URL",
            icon: <Copy size={12} />,
            onSelect: () => handleCopyUrl(normalized.url),
          },
          {
            label: "Copy as cURL",
            icon: <Terminal size={12} />,
            onSelect: () => handleCopyCurl(item),
          },
          {
            label: "Save to Collection",
            icon: <FolderPlus size={12} />,
            tone: "amber",
            onSelect: () => handleOpenSaveModal(item),
          },
          { label: "", separator: true },
          {
            label: "Delete Record",
            icon: <Trash2 size={12} />,
            danger: true,
            onSelect: () => handleDeleteItem(normalized.id),
          },
        ];
        return (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            header={`${normalized.method} ${normalized.url}`}
            items={items}
            onClose={() => setCtxMenu((current) => ({ ...current, visible: false }))}
          />
        );
      })()}

      {/* ── Save to Collection Modal ─────────────────────────────────── */}
      {saveModalOpen && saveTargetItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-[var(--bg-s1)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-dim)]">
              <div className="flex items-center gap-2">
                <FolderPlus size={16} className="text-[var(--amber)]" />
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">Save to Collection</h3>
              </div>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="text-[var(--tx-3)] hover:text-[var(--tx-1)]"
              >
                <X size={14} />
              </button>
            </div>

            {/* Target URL Preview */}
            {(() => {
              const norm = normalizeHistory(saveTargetItem);
              return (
                <div className="flex items-center gap-2 p-2 rounded-[var(--r-sm)] bg-[var(--bg-s2)] border border-[var(--border)] text-xs font-mono">
                  <span className={cn("font-bold text-[10px]", methodColor(norm.method))}>
                    {norm.method}
                  </span>
                  <span className="truncate text-[var(--tx-2)]">{norm.url}</span>
                </div>
              );
            })()}

            {/* Request Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--tx-2)]">Request Name</label>
              <input
                type="text"
                value={saveReqName}
                onChange={(e) => setSaveReqName(e.target.value)}
                placeholder="e.g. Get User Profile"
                className="px-2.5 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-s2)] border border-[var(--border)] text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)]"
              />
            </div>

            {/* Collection Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--tx-2)]">
                Choose Existing Collection
              </label>
              {collectionsList.length > 0 ? (
                <select
                  value={selectedColId}
                  onChange={(e) => {
                    setSelectedColId(e.target.value);
                    if (e.target.value) setNewColName("");
                  }}
                  className="px-2.5 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-s2)] border border-[var(--border)] text-xs text-[var(--tx-1)] outline-none focus:border-[var(--lime)] cursor-pointer"
                >
                  {collectionsList.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[var(--bg-s2)] text-[var(--tx-1)]">
                      {c.name}
                    </option>
                  ))}
                  <option value="" className="bg-[var(--bg-s2)] text-[var(--tx-3)]">
                    + Or Create a New Collection below...
                  </option>
                </select>
              ) : (
                <p className="text-xs text-[var(--tx-3)] italic">No existing collections found.</p>
              )}
            </div>

            {/* Or New Collection */}
            {(!selectedColId || collectionsList.length === 0) && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--tx-2)]">
                  New Collection Name
                </label>
                <input
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. Auth Service"
                  className="px-2.5 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-s2)] border border-[var(--border)] text-xs text-[var(--tx-1)] outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-dim)] mt-1">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="px-3 py-1.5 rounded-[var(--r-sm)] text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-s3)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToCollection}
                disabled={saveLoading || (!selectedColId && !newColName.trim())}
                className="flex items-center gap-1 px-4 py-1.5 rounded-[var(--r-sm)] bg-[var(--lime)] text-[var(--tx-inv)] font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <FolderPlus size={12} />
                <span>{saveLoading ? "Saving…" : "Save Request"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
