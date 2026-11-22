import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Braces,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  ExternalLink,
  FolderKanban,
  Layers,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  useAppStore,
  type MockRouteDraft,
  type MockScenario,
  type CollectionItem,
  type RequestItem,
} from "../../stores/appStore";
import { bridge } from "../../bridge/client";
import { cn, methodColor, statusClass } from "../../lib/cn";
import { formatLatency, parseUtcDate } from "../../lib/format";
import {
  getCollectionLoadVersion,
  loadCollectionsWithFolders,
} from "../../lib/collectionData";
import { useToast } from "../ui/Toast";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";

type MockProtocol = MockRouteDraft["protocol"];

interface MockRoutePayload {
  id: string;
  protocol: MockProtocol;
  method: string;
  path: string;
  status_code: number;
  headers: Record<string, string>;
  body: string;
  events: Array<{ id?: string; event?: string; data: string; retry?: number }>;
  messages: string[];
  echo_messages: boolean;
  delay_ms: number;
  enabled: boolean;
}

interface RequestLog {
  id: string;
  protocol?: MockProtocol;
  method: string;
  path: string;
  matched_route_id?: string | null;
  status_code: number;
  timestamp: string;
  duration_ms?: number;
}

const DEFAULT_PORT = 4010;
const MAX_DELAY_MS = 300_000;
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"];
const PROTOCOLS: Array<{ id: MockProtocol; label: string; note: string }> = [
  { id: "rest", label: "REST", note: "HTTP request → response" },
  { id: "graphql", label: "GraphQL", note: "POST JSON response" },
  { id: "sse", label: "SSE", note: "Server-sent events" },
  { id: "websocket", label: "WebSocket", note: "Two-way messages" },
];

function assertBridgeSuccess(result: any, fallback: string): void {
  if (result?.status !== "ok") {
    throw new Error(result?.error?.message || result?.error || fallback);
  }
}

function prettyJson(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback), null, 2);
  } catch {
    return fallback;
  }
}

/** Returns null if valid JSON, or an error message string if invalid. */
function validateJson(text: string): string | null {
  if (!text.trim()) return null; // empty is fine
  try { JSON.parse(text); return null; } catch (e: any) { return e.message || "Invalid JSON"; }
}

function normalizeRoutes(value: unknown): MockRouteDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw: any) => ({
    id: typeof raw?.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    protocol: PROTOCOLS.some((protocol) => protocol.id === raw?.protocol) ? raw.protocol : "rest",
    method: typeof raw?.method === "string" ? raw.method.toUpperCase() : "GET",
    path: typeof raw?.path === "string" ? raw.path : "/endpoint",
    status_code: Number.isInteger(Number(raw?.status_code)) ? Number(raw.status_code) : 200,
    headers_json: prettyJson(raw?.headers, "{}"),
    body: typeof raw?.body === "string" ? raw.body : JSON.stringify(raw?.body ?? ""),
    events_json: typeof raw?.events_json === "string"
      ? raw.events_json
      : prettyJson(raw?.events, '[{"event":"message","data":"hello"}]'),
    messages_json: typeof raw?.messages_json === "string"
      ? raw.messages_json
      : prettyJson(raw?.messages, '["connected"]'),
    echo_messages: raw?.echo_messages === true,
    delay_ms: Number.isInteger(Number(raw?.delay_ms)) ? Number(raw.delay_ms) : 0,
    enabled: raw?.enabled !== false && raw?.is_active !== false,
    scenarios: Array.isArray(raw?.scenarios) ? raw.scenarios : undefined,
    active_scenario_id: typeof raw?.active_scenario_id === "string" ? raw.active_scenario_id : undefined,
  }));
}

const DYNAMIC_TOKENS = [
  { token: "{{params.id}}", label: "Path parameter" },
  { token: "{{$guid}}", label: "UUID v4" },
  { token: "{{$timestamp}}", label: "Unix timestamp" },
  { token: "{{$isoTimestamp}}", label: "ISO UTC time" },
  { token: "{{$randomInt}}", label: "Random number" },
  { token: "{{$randomEmail}}", label: "Random email" },
];

const RESPONSE_PRESETS = [
  {
    name: "200 OK — Pagination List",
    status_code: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        { id: "1", name: "Alpha", status: "active" },
        { id: "2", name: "Beta", status: "pending" },
      ],
      total: 2,
      page: 1,
      limit: 10,
    }, null, 2),
  },
  {
    name: "201 Created — Resource",
    status_code: 201,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "{{$guid}}",
      name: "New Resource",
      created_at: "{{$isoTimestamp}}",
      status: "created",
    }, null, 2),
  },
  {
    name: "400 Bad Request — Validation",
    status_code: 400,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Bad Request",
      message: "Validation failed for request parameters",
      fields: [
        { field: "email", message: "Email is required and must be valid" },
      ],
    }, null, 2),
  },
  {
    name: "401 Unauthorized",
    status_code: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Unauthorized",
      message: "Authentication credentials missing or expired",
    }, null, 2),
  },
  {
    name: "404 Not Found",
    status_code: 404,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Not Found",
      message: "The requested resource does not exist",
    }, null, 2),
  },
  {
    name: "500 Internal Server Error",
    status_code: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Internal Server Error",
      message: "An unexpected error occurred while processing your request",
    }, null, 2),
  },
];

function extractRequestsFromCollection(collection: CollectionItem): RequestItem[] {
  const result: RequestItem[] = [...(collection.requests || [])];
  if (collection.folders) {
    for (const folder of collection.folders) {
      if (folder.requests) {
        result.push(...folder.requests);
      }
    }
  }
  return result;
}

function extractPathFromUrl(rawUrl: string): string {
  if (!rawUrl) return "/api/endpoint";
  try {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      const u = new URL(rawUrl);
      return u.pathname || "/api/endpoint";
    }
    const cleaned = rawUrl.replace(/^\{\{[^}]+\}\}/, "");
    const pathOnly = cleaned.split("?")[0].split("#")[0];
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly || "api/endpoint"}`;
  } catch {
    const split = rawUrl.split("?")[0];
    return split.startsWith("/") ? split : `/${split}`;
  }
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function toRoutePayload(routes: MockRouteDraft[]): MockRoutePayload[] {
  return routes.map((route, index) => {
    if (!PROTOCOLS.some((protocol) => protocol.id === route.protocol)) {
      throw new Error(`Endpoint ${index + 1}: choose a supported protocol.`);
    }
    const allowedMethods = route.protocol === "graphql"
      ? ["POST", "ANY"]
      : route.protocol === "sse" || route.protocol === "websocket"
        ? ["GET", "ANY"]
        : HTTP_METHODS;
    if (!allowedMethods.includes(route.method)) {
      throw new Error(`Endpoint ${index + 1}: ${route.protocol.toUpperCase()} does not support ${route.method}.`);
    }
    if (!route.path.trim() || route.path.includes("?") || route.path.includes("#")) {
      throw new Error(`Endpoint ${index + 1}: enter a path without a query or fragment.`);
    }
    if (!Number.isInteger(route.status_code) || route.status_code < 100 || route.status_code > 599) {
      throw new Error(`Endpoint ${index + 1}: status code must be between 100 and 599.`);
    }
    if (!Number.isInteger(route.delay_ms) || route.delay_ms < 0 || route.delay_ms > MAX_DELAY_MS) {
      throw new Error(`Endpoint ${index + 1}: delay must be between 0 and ${MAX_DELAY_MS} ms.`);
    }

    const headers = parseJson<unknown>(route.headers_json || "{}", `Endpoint ${index + 1} response headers`);
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
      throw new Error(`Endpoint ${index + 1}: response headers must be a JSON object.`);
    }
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (!name.trim() || typeof value !== "string") {
        throw new Error(`Endpoint ${index + 1}: response header names and values must be strings.`);
      }
      responseHeaders[name] = value;
    }

    const events = route.protocol === "sse"
      ? parseJson<Array<{ id?: string; event?: string; data: string; retry?: number }>>(
          route.events_json || "[]",
          `Endpoint ${index + 1} events`,
        )
      : [];
    if (!Array.isArray(events)) {
      throw new Error(`Endpoint ${index + 1}: SSE events must be a JSON array.`);
    }
    const messages = route.protocol === "websocket"
      ? parseJson<string[]>(route.messages_json || "[]", `Endpoint ${index + 1} WebSocket messages`)
      : [];
    if (!Array.isArray(messages) || messages.some((message) => typeof message !== "string")) {
      throw new Error(`Endpoint ${index + 1}: WebSocket messages must be an array of strings.`);
    }
    if (route.protocol === "graphql") {
      const body = parseJson<unknown>(route.body || "{}", `Endpoint ${index + 1} GraphQL response`);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error(`Endpoint ${index + 1}: GraphQL response must be a JSON object.`);
      }
    }

    return {
      id: route.id,
      protocol: route.protocol,
      method: route.protocol === "graphql" ? "POST" : route.protocol === "rest" ? route.method : "GET",
      path: route.path.trim(),
      status_code: route.protocol === "websocket" ? 101 : route.protocol === "sse" ? 200 : route.status_code,
      headers: responseHeaders,
      body: route.body,
      events,
      messages,
      echo_messages: route.protocol === "websocket" && route.echo_messages,
      delay_ms: route.delay_ms,
      enabled: route.enabled,
    };
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Mock server operation failed.";
}

function createRoute(protocol: MockProtocol = "rest"): MockRouteDraft {
  return {
    id: crypto.randomUUID(),
    protocol,
    method: protocol === "graphql" ? "POST" : protocol === "rest" ? "GET" : "GET",
    path: protocol === "graphql" ? "/graphql" : protocol === "sse" ? "/events" : protocol === "websocket" ? "/socket" : "/api/endpoint",
    status_code: 200,
    headers_json: '{\n  "Content-Type": "application/json"\n}',
    body: protocol === "graphql"
      ? '{"data":{"hello":"world"}}'
      : '{"ok": true}',
    events_json: '[\n  { "event": "message", "data": "hello" }\n]',
    messages_json: '[\n  "connected"\n]',
    echo_messages: false,
    delay_ms: 0,
    enabled: true,
  };
}

export function MockServerView() {
  const {
    activeWorkspaceId,
    collections,
    collectionsLoadedWorkspaceId,
    selectedCollectionId,
    setCollectionsForWorkspace,
    setSelectedCollectionId,
    setActiveModule,
    mockRoutes,
    mockRoutesConfigured,
    savedMockRoutesByCollection,
    setMockRoutes,
    saveMockRoutes,
  } = useAppStore();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [websocketPort, setWebsocketPort] = useState(DEFAULT_PORT + 1);
  const [serverRoutes, setServerRoutes] = useState<MockRouteDraft[]>([]);
  const [log, setLog] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [testResult, setTestResult] = useState<{ status: number; body: string; ms: number } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [selectedLogForInspect, setSelectedLogForInspect] = useState<RequestLog | null>(null);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [routeContextMenu, setRouteContextMenu] = useState<{
    x: number;
    y: number;
    routeId: string | null;
  } | null>(null);
  const portEditedRef = useRef(false);
  const synchronizedCollectionRef = useRef<string | null>(null);
  const routeSyncChainRef = useRef(Promise.resolve());
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null;
  const collectionsReady = !!activeWorkspaceId && collectionsLoadedWorkspaceId === activeWorkspaceId;

  useEffect(() => {
    if (!activeWorkspaceId || collectionsLoadedWorkspaceId === activeWorkspaceId) return;
    let cancelled = false;
    const workspaceId = activeWorkspaceId;
    const loadVersion = getCollectionLoadVersion(workspaceId);
    void loadCollectionsWithFolders(workspaceId)
      .then((loadedCollections) => {
        if (cancelled || loadVersion !== getCollectionLoadVersion(workspaceId)) return;
        setCollectionsForWorkspace(workspaceId, loadedCollections);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast(error instanceof Error ? error.message : "Could not load collections", "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, collectionsLoadedWorkspaceId, setCollectionsForWorkspace, toast]);

  const loadStatus = useCallback(async () => {
    try {
      const result: any = await bridge.getMockServerStatus();
      assertBridgeSuccess(result, "Could not read mock server status.");

      setRunning(Boolean(result.is_running ?? result.running));
      if ((result.is_running || !portEditedRef.current) && Number.isInteger(Number(result.port)) && Number(result.port) > 0) {
        setPort(Number(result.port));
      }
      if (Number.isInteger(Number(result.websocket_port)) && Number(result.websocket_port) > 0) {
        setWebsocketPort(Number(result.websocket_port));
      }
      setServerRoutes(normalizeRoutes(result.routes));
      setLog(Array.isArray(result.requests_log) ? result.requests_log : []);
      setStatusError(null);
    } catch (error) {
      setStatusError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadStatus(), 0);
    const interval = setInterval(() => void loadStatus(), 2000);
    return () => {
      window.clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadStatus]);

  const routePayload = useMemo(() => {
    try {
      return { value: toRoutePayload(mockRoutes), error: null as string | null };
    } catch (error) {
      return { value: null, error: getErrorMessage(error) };
    }
  }, [mockRoutes]);
  const serverPayload = useMemo(() => {
    try {
      return toRoutePayload(serverRoutes);
    } catch {
      return null;
    }
  }, [serverRoutes]);
  const routesDirty = !routePayload.value
    || !serverPayload
    || JSON.stringify(routePayload.value) !== JSON.stringify(serverPayload);
  const hasSavedRoutes = selectedCollectionId
    ? Object.prototype.hasOwnProperty.call(savedMockRoutesByCollection, selectedCollectionId)
    : false;
  const endpointDraftDirty = !!selectedCollectionId && (
    hasSavedRoutes
      ? JSON.stringify(mockRoutes) !== JSON.stringify(savedMockRoutesByCollection[selectedCollectionId])
      : mockRoutesConfigured
  );
  const selectedRoute = mockRoutes.find((route) => route.id === selectedRouteId) ?? mockRoutes[0] ?? null;

  const visibleRoutes = mockRoutes.filter((route) => {
    const term = search.trim().toLowerCase();
    return !term || route.path.toLowerCase().includes(term) || route.protocol.includes(term) || route.method.toLowerCase().includes(term);
  });
  const visibleLog = log.filter((entry) => {
    const term = logSearch.trim().toLowerCase();
    return !term || entry.path.toLowerCase().includes(term) || entry.method.toLowerCase().includes(term)
      || (entry.protocol || "").includes(term);
  });
  const reportFailure = useCallback((error: unknown) => {
    const message = getErrorMessage(error);
    setOperationError(message);
    toast(message, "error");
  }, [toast]);
  const saveEndpoints = useCallback(() => {
    if (!selectedCollectionId) {
      reportFailure(new Error("Select a collection before saving its endpoints."));
      return;
    }
    try {
      saveMockRoutes();
    } catch (error) {
      reportFailure(error);
      return;
    }
    setOperationError(null);
    toast(`Saved ${mockRoutes.length} endpoints to ${selectedCollection?.name ?? "the selected collection"}.`, "success");
  }, [mockRoutes.length, reportFailure, saveMockRoutes, selectedCollection?.name, selectedCollectionId, toast]);

  useEffect(() => {
    const handleSave = () => saveEndpoints();
    window.addEventListener("kurorelay:save-mock-routes", handleSave);
    return () => window.removeEventListener("kurorelay:save-mock-routes", handleSave);
  }, [saveEndpoints]);

  const startServer = async () => {
    if (!selectedCollectionId) {
      reportFailure(new Error("Select a collection before starting its mock endpoints."));
      return;
    }
    if (!routePayload.value) {
      reportFailure(new Error(routePayload.error || "Fix invalid endpoints before starting."));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65534) {
      reportFailure(new Error("HTTP port must be an integer between 1 and 65534; the WebSocket listener uses the next port."));
      return;
    }
    setLoading(true);
    try {
      const result: any = await bridge.startMockServer({ port, routes: routePayload.value });
      assertBridgeSuccess(result, "Could not start the mock server.");
      setServerRoutes(normalizeRoutes(routePayload.value));
      setRunning(true);
      synchronizedCollectionRef.current = selectedCollectionId;
      portEditedRef.current = false;
      if (Number.isInteger(Number(result.port)) && Number(result.port) > 0) setPort(Number(result.port));
      if (Number.isInteger(Number(result.websocket_port)) && Number(result.websocket_port) > 0) {
        setWebsocketPort(Number(result.websocket_port));
      }
      setStatusError(null);
      setOperationError(null);
      toast("Mock listeners are running.", "success");
      await loadStatus();
    } catch (error) {
      reportFailure(error);
    } finally {
      setLoading(false);
    }
  };

  const applyRoutes = async () => {
    if (!selectedCollectionId) {
      reportFailure(new Error("Select a collection before applying mock endpoints."));
      return;
    }
    if (!running || !routePayload.value) {
      if (!routePayload.value) reportFailure(new Error(routePayload.error || "Fix invalid endpoints before applying."));
      return;
    }
    setLoading(true);
    try {
      const result: any = await bridge.updateMockRoutes({ routes: routePayload.value });
      assertBridgeSuccess(result, "Could not apply mock endpoints.");
      setServerRoutes(normalizeRoutes(routePayload.value));
      setOperationError(null);
      toast("Endpoint changes are live.", "success");
      await loadStatus();
    } catch (error) {
      reportFailure(error);
    } finally {
      setLoading(false);
    }
  };

  const stopServer = async () => {
    setLoading(true);
    try {
      const result: any = await bridge.stopMockServer({});
      assertBridgeSuccess(result, "Could not stop the mock server.");
      setRunning(false);
      setStatusError(null);
      setOperationError(null);
      toast("Mock listeners stopped.", "success");
      await loadStatus();
    } catch (error) {
      reportFailure(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!running) {
      synchronizedCollectionRef.current = null;
      return;
    }

    const collectionKey = selectedCollectionId ?? "";
    if (synchronizedCollectionRef.current === collectionKey) return;
    synchronizedCollectionRef.current = collectionKey;
    const routes = selectedCollectionId && routePayload.value ? routePayload.value : [];

    routeSyncChainRef.current = routeSyncChainRef.current
      .then(async () => {
        const currentCollectionKey = useAppStore.getState().selectedCollectionId ?? "";
        if (currentCollectionKey !== collectionKey) return;
        const result: any = await bridge.updateMockRoutes({ routes });
        assertBridgeSuccess(result, "Could not switch mock endpoints to the selected collection.");
        if ((useAppStore.getState().selectedCollectionId ?? "") === collectionKey) {
          setServerRoutes(normalizeRoutes(routes));
        }
      })
      .catch((error: unknown) => {
        if ((useAppStore.getState().selectedCollectionId ?? "") === collectionKey) {
          reportFailure(error);
        }
      });
  }, [running, selectedCollectionId, routePayload.value, reportFailure]);

  const clearLog = async () => {
    try {
      const result: any = await bridge.clearMockRequestsLog();
      assertBridgeSuccess(result, "Could not clear the request log.");
      setLog([]);
      setOperationError(null);
    } catch (error) {
      reportFailure(error);
    }
  };

  const addRoute = (protocol: MockProtocol = "rest") => {
    if (!selectedCollectionId) {
      reportFailure(new Error("Select a collection before adding endpoints."));
      return;
    }
    const route = createRoute(protocol);
    setMockRoutes([...mockRoutes, route]);
    setSelectedRouteId(route.id);
  };

  const updateRoute = (id: string, patch: Partial<MockRouteDraft>) => {
    setMockRoutes(mockRoutes.map((route) => route.id === id ? { ...route, ...patch } : route));
  };

  const removeRoute = (id: string) => {
    setMockRoutes(mockRoutes.filter((route) => route.id !== id));
  };

  const duplicateRoute = (id: string) => {
    const route = mockRoutes.find((item) => item.id === id);
    if (!route) return;
    const copy = { ...route, id: crypto.randomUUID(), enabled: false };
    setMockRoutes([...mockRoutes, copy]);
    setSelectedRouteId(copy.id);
  };

  const applyPreset = (preset: typeof RESPONSE_PRESETS[0]) => {
    if (!selectedRoute) return;
    updateRoute(selectedRoute.id, {
      status_code: preset.status_code,
      headers_json: prettyJson(preset.headers, "{}"),
      body: preset.body,
    });
    setShowPresetsMenu(false);
    toast(`Applied preset: ${preset.name}`, "info");
  };

  const handleAddScenario = () => {
    if (!selectedRoute) return;
    const currentScenarios: MockScenario[] = selectedRoute.scenarios && selectedRoute.scenarios.length > 0
      ? [...selectedRoute.scenarios]
      : [
          {
            id: "default",
            name: `Default (${selectedRoute.status_code})`,
            status_code: selectedRoute.status_code,
            headers_json: selectedRoute.headers_json,
            body: selectedRoute.body,
          },
        ];
    const newScenarioId = crypto.randomUUID();
    const newScenario: MockScenario = {
      id: newScenarioId,
      name: `Scenario ${currentScenarios.length + 1} (404)`,
      status_code: 404,
      headers_json: '{\n  "Content-Type": "application/json"\n}',
      body: '{\n  "error": "Not Found",\n  "message": "Scenario response"\n}',
    };
    const updated = [...currentScenarios, newScenario];
    updateRoute(selectedRoute.id, {
      scenarios: updated,
      active_scenario_id: newScenarioId,
      status_code: newScenario.status_code,
      headers_json: newScenario.headers_json,
      body: newScenario.body,
    });
    toast("Added new response scenario", "success");
  };

  const handleSwitchScenario = (scenarioId: string) => {
    if (!selectedRoute || !selectedRoute.scenarios) return;
    const target = selectedRoute.scenarios.find((s) => s.id === scenarioId);
    if (!target) return;
    const updatedScenarios = selectedRoute.scenarios.map((s) =>
      s.id === selectedRoute.active_scenario_id
        ? {
            ...s,
            status_code: selectedRoute.status_code,
            headers_json: selectedRoute.headers_json,
            body: selectedRoute.body,
          }
        : s
    );
    updateRoute(selectedRoute.id, {
      scenarios: updatedScenarios,
      active_scenario_id: scenarioId,
      status_code: target.status_code,
      headers_json: target.headers_json,
      body: target.body,
    });
  };

  const handleDeleteScenario = (scenarioId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!selectedRoute || !selectedRoute.scenarios) return;
    const remaining = selectedRoute.scenarios.filter((s) => s.id !== scenarioId);
    const nextActive = remaining[0];
    if (!nextActive) {
      updateRoute(selectedRoute.id, { scenarios: undefined, active_scenario_id: undefined });
      return;
    }
    updateRoute(selectedRoute.id, {
      scenarios: remaining,
      active_scenario_id: nextActive.id,
      status_code: nextActive.status_code,
      headers_json: nextActive.headers_json,
      body: nextActive.body,
    });
  };

  const handleMockFromTraffic = (entry: RequestLog) => {
    const newRoute: MockRouteDraft = {
      id: crypto.randomUUID(),
      protocol: entry.protocol === "websocket" ? "websocket" : "rest",
      method: entry.method || "GET",
      path: entry.path || "/api/endpoint",
      status_code: 200,
      headers_json: '{\n  "Content-Type": "application/json"\n}',
      body: '{\n  "ok": true\n}',
      events_json: '[\n  { "event": "message", "data": "hello" }\n]',
      messages_json: '[\n  "connected"\n]',
      echo_messages: false,
      delay_ms: 0,
      enabled: true,
    };
    setMockRoutes([newRoute, ...mockRoutes]);
    setSelectedRouteId(newRoute.id);
    setSelectedLogForInspect(null);
    toast(`Created mock endpoint for ${entry.method} ${entry.path}`, "success");
  };

  const handleGenerateFromCollection = () => {
    if (!selectedCollection) {
      toast("Please select a collection first.", "warning");
      return;
    }
    const requests = extractRequestsFromCollection(selectedCollection);
    if (requests.length === 0) {
      toast("No requests found in this collection.", "warning");
      return;
    }

    const existingPaths = new Set(mockRoutes.map((r) => `${r.method}:${r.path}`));
    const created: MockRouteDraft[] = [];

    for (const req of requests) {
      const path = extractPathFromUrl(req.url);
      const method = (req.method || "GET").toUpperCase();
      const key = `${method}:${path}`;
      if (!existingPaths.has(key)) {
        existingPaths.add(key);
        created.push({
          id: crypto.randomUUID(),
          protocol: "rest",
          method,
          path,
          status_code: 200,
          headers_json: '{\n  "Content-Type": "application/json"\n}',
          body: JSON.stringify({ ok: true, name: req.name, path }, null, 2),
          events_json: '[\n  { "event": "message", "data": "hello" }\n]',
          messages_json: '[\n  "connected"\n]',
          echo_messages: false,
          delay_ms: 0,
          enabled: true,
        });
      }
    }

    if (created.length === 0) {
      toast("All requests in this collection already have mock endpoints.", "info");
      return;
    }

    setMockRoutes([...mockRoutes, ...created]);
    toast(`Generated ${created.length} mock endpoint${created.length > 1 ? "s" : ""} from collection!`, "success");
  };

  const handleExportMockRoutes = () => {
    const data = JSON.stringify(mockRoutes, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const colName = selectedCollection?.name ? selectedCollection.name.replace(/[^a-z0-9_-]/gi, "_") : "collection";
    a.download = `kuro-mock-routes-${colName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Mock routes exported to JSON.", "success");
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error("Invalid file format: expected a JSON array of mock routes.");
        }
        const normalized = normalizeRoutes(parsed);
        setMockRoutes([...mockRoutes, ...normalized]);
        toast(`Successfully imported ${normalized.length} mock endpoint(s).`, "success");
      } catch (err: any) {
        toast(err.message || "Failed to parse imported JSON file.", "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const openRouteContextMenu = (event: MouseEvent, routeId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setRouteContextMenu({ x: event.clientX, y: event.clientY, routeId });
  };

  const routeMenuItems = (route: MockRouteDraft | null): ContextMenuItem[] => route
    ? [
        {
          label: "Duplicate endpoint (disabled)",
          icon: <Copy size={12} />,
          onSelect: () => duplicateRoute(route.id),
        },
        {
          label: route.enabled ? "Disable endpoint" : "Enable endpoint",
          icon: <Check size={12} />,
          onSelect: () => updateRoute(route.id, { enabled: !route.enabled }),
        },
        { label: "", separator: true },
        {
          label: "Delete endpoint",
          icon: <Trash2 size={12} />,
          danger: true,
          onSelect: () => removeRoute(route.id),
        },
      ]
    : PROTOCOLS.map((protocol) => ({
        label: `Add ${protocol.label} endpoint`,
        icon: <Plus size={12} />,
        onSelect: () => addRoute(protocol.id),
      }));

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Endpoint URL copied.", "success");
    } catch {
      reportFailure(new Error("Could not access the clipboard. Copy the URL from the endpoint preview."));
    }
  };

  const inputCls = "w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-[var(--r-md)] px-3 py-2 text-xs text-[var(--tx-1)] outline-none focus:border-[var(--color-border-focus)] transition-colors";
  const codeCls = cn(inputCls, "min-h-44 resize-y font-mono leading-5");
  const baseUrl = `http://127.0.0.1:${port}`;
  const websocketUrl = `ws://127.0.0.1:${websocketPort}`;
  const selectedUrl = selectedRoute
    ? `${selectedRoute.protocol === "websocket" ? websocketUrl : baseUrl}${selectedRoute.path.startsWith("/") ? selectedRoute.path : `/${selectedRoute.path}`}`
    : "";

  const sendTestRequest = useCallback(async () => {
    if (!selectedRoute || !running || selectedRoute.protocol !== "rest") return;
    setTestLoading(true);
    setTestResult(null);
    const t0 = performance.now();
    try {
      const method = selectedRoute.method === "ANY" ? "GET" : selectedRoute.method;
      const res = await fetch(selectedUrl, { method });
      const ms = Math.round(performance.now() - t0);
      let body = "";
      try { body = await res.text(); } catch { body = "(unreadable)"; }
      setTestResult({ status: res.status, body, ms });
    } catch (err: any) {
      setTestResult({ status: 0, body: err?.message ?? "Network error", ms: Math.round(performance.now() - t0) });
    } finally {
      setTestLoading(false);
    }
  }, [selectedRoute, running, selectedUrl]);

  return (
    <div className="mock-server-root flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg-base)]">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[var(--border-dim)] bg-[var(--bg-s1)] shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-[var(--r-lg)] bg-[var(--lime-soft)] text-[var(--lime)]">
          <Activity size={18} />
        </div>
        <div className="min-w-[150px]">
          <h1 className="text-sm font-semibold text-[var(--tx-1)]">Mock Server</h1>
          <p className="text-[11px] text-[var(--tx-3)]">Build local REST, GraphQL, SSE and WebSocket endpoints</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-s2)] px-3 py-1.5">
          <Circle size={8} className={cn(running ? "fill-[var(--ok)] text-[var(--ok)]" : "fill-[var(--tx-3)] text-[var(--tx-3)]")} />
          <span className="text-xs font-medium text-[var(--tx-2)]">{running ? "Listening" : "Stopped"}</span>
          {running && <span className="text-[10px] text-[var(--tx-3)]">{mockRoutes.filter((route) => route.enabled).length} active</span>}
        </div>
        {selectedCollectionId && (
          <span className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium",
            endpointDraftDirty
              ? "bg-[var(--color-status-warning-dim)] text-[var(--warn)]"
              : "bg-[var(--color-status-success-dim)] text-[var(--ok)]",
          )}>
            {endpointDraftDirty ? "Unsaved endpoints" : "Endpoints saved"}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            title="Import mock routes from a JSON file"
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedCollectionId}
            className="flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] px-2.5 py-2 text-xs font-medium text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] disabled:opacity-40 transition-colors"
          >
            <Upload size={13} /> Import
          </button>
          <button
            type="button"
            title="Export current mock routes as a JSON file"
            onClick={handleExportMockRoutes}
            disabled={!selectedCollectionId || mockRoutes.length === 0}
            className="flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] px-2.5 py-2 text-xs font-medium text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] disabled:opacity-40 transition-colors"
          >
            <Download size={13} /> Export
          </button>
          <button
            type="button"
            title="Save endpoints (Ctrl+S)"
            onClick={saveEndpoints}
            disabled={!selectedCollectionId || !endpointDraftDirty || loading}
            className="flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--tx-1)] hover:border-[var(--lime)] disabled:opacity-45 transition-colors"
          >
            <Save size={13} /> Save endpoints
            <kbd className="ml-1 rounded border border-[var(--border-dim)] px-1 py-0.5 text-[9px] text-[var(--tx-3)]">Ctrl+S</kbd>
          </button>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-3)]">
            HTTP
            <input
              aria-label="HTTP mock server port"
              type="number"
              className={cn(inputCls, "w-24 px-2 py-1.5")}
              value={port}
              min={1}
              max={65534}
              disabled={running || loading}
              onChange={(event) => {
                portEditedRef.current = true;
                setPort(Number(event.target.value));
                setWebsocketPort(Number(event.target.value) + 1);
              }}
            />
          </label>
          {running && (
            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] text-[var(--tx-3)] font-mono">
              <Wifi size={12} /> WS :{websocketPort}
            </span>
          )}
          {running ? (
            <>
              {selectedCollectionId && (routesDirty || endpointDraftDirty) && (
                <button
                  type="button"
                  onClick={applyRoutes}
                  disabled={loading || !selectedCollectionId || !routePayload.value}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] text-[var(--tx-1)] text-xs font-semibold hover:border-[var(--lime)] disabled:opacity-50 transition-all"
                >
                  <RefreshCw size={13} /> Apply changes
                </button>
              )}
              <button
                type="button"
                onClick={stopServer}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-md)] bg-[var(--err)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <Square size={12} /> Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startServer}
              disabled={loading || !selectedCollectionId || !routePayload.value}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--r-md)] bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Zap size={13} /> Start server
            </button>
          )}
        </div>
      </header>

      {(statusError || operationError || routePayload.error) && (
        <div role="alert" className="shrink-0 flex items-start gap-2 px-5 py-2.5 text-xs text-[var(--err)] bg-[var(--color-status-error-dim)] border-b border-[var(--err)]">
          <X size={14} className="mt-0.5 shrink-0" />
          <span>{operationError || routePayload.error || statusError}</span>
        </div>
      )}
      {selectedCollectionId && routesDirty && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-2 text-[11px] text-[var(--tx-2)] bg-[var(--bg-s1)] border-b border-[var(--border-dim)]">
          <span>
            {endpointDraftDirty
              ? "Endpoint edits are not saved yet. Use Ctrl+S to save without starting the server."
              : running
                ? "Saved endpoint changes are waiting to be applied."
                : "Saved endpoints will be activated when the server starts."}
          </span>
          {running && routesDirty && <span>Live traffic still uses the last applied version.</span>}
        </div>
      )}

      <main className="mock-server-workspace min-h-0 flex-1 overflow-hidden">
        <aside className="mock-endpoint-menu flex min-h-0 min-w-0 flex-col border-r border-[var(--border-dim)] bg-[var(--bg-s1)]">
          <div className="shrink-0 space-y-3 border-b border-[var(--border-dim)] p-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">
                <FolderKanban size={13} className="text-[var(--lime)]" /> Collection
              </span>
              <select
                aria-label="Mock endpoints collection"
                className={cn(inputCls, "py-1.5")}
                value={collections.some((collection) => collection.id === selectedCollectionId) ? selectedCollectionId ?? "" : ""}
                disabled={!collectionsReady || collections.length === 0}
                onChange={(event) => {
                  setSelectedCollectionId(event.target.value || null);
                  setSelectedRouteId(null);
                  setRouteContextMenu(null);
                }}
              >
                <option value="">
                  {!activeWorkspaceId
                    ? "Select a workspace"
                    : !collectionsReady
                      ? "Loading collections…"
                      : collections.length === 0
                        ? "No collections"
                        : "Choose a collection"}
                </option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--tx-3)]">
                {selectedCollection ? `${mockRoutes.length} endpoints` : "Endpoints"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Generate mock endpoints from requests in this collection"
                  onClick={handleGenerateFromCollection}
                  disabled={!selectedCollectionId}
                  className="flex items-center gap-1 rounded-[var(--r-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] disabled:opacity-40 transition-colors"
                >
                  <Wand2 size={11} /> Generate
                </button>
                <button
                  type="button"
                  onClick={(event) => openRouteContextMenu(event, null)}
                  disabled={!selectedCollectionId}
                  className="flex items-center gap-1 rounded-[var(--r-md)] bg-[var(--lime)] px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-70 transition-colors"
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            </div>
            <label className="relative block">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tx-3)]" />
              <input
                aria-label="Search collection endpoints"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter endpoints"
                className={cn(inputCls, "py-1.5 pl-7")}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {selectedCollectionId && visibleRoutes.map((route) => (
              <div
                key={route.id}
                className={cn(
                  "mb-1 flex items-center rounded-[var(--r-md)] border transition-colors",
                  selectedRoute?.id === route.id
                    ? "border-[var(--lime)] bg-[var(--lime-soft)]"
                    : "border-transparent hover:border-[var(--border-dim)] hover:bg-[var(--bg-s2)]",
                  !route.enabled && "opacity-55",
                )}
                onContextMenu={(event) => openRouteContextMenu(event, route.id)}
              >
                <button
                  type="button"
                  aria-current={selectedRoute?.id === route.id ? "page" : undefined}
                  onClick={() => setSelectedRouteId(route.id)}
                  className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left"
                  title={`${route.protocol.toUpperCase()} ${route.method} ${route.path}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[9px] font-bold uppercase",
                      route.protocol === "websocket"
                        ? "text-cyan-400"
                        : route.protocol === "graphql"
                          ? "text-pink-400"
                          : route.protocol === "sse"
                            ? "text-amber-400"
                            : "text-[var(--tx-3)]",
                    )}>{route.protocol === "websocket" ? "WS" : route.protocol}</span>
                    <span className={cn("text-[9px] font-semibold", methodColor(route.method))}>{route.method}</span>
                    {!route.enabled && <span className="ml-auto text-[8px] uppercase text-[var(--tx-3)]">Off</span>}
                  </span>
                  <span className="truncate font-mono text-[10px] text-[var(--tx-1)]">{route.path}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Actions for ${route.method} ${route.path}`}
                  onClick={(event) => openRouteContextMenu(event, route.id)}
                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)]"
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            ))}
            {selectedCollectionId && visibleRoutes.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px] text-[var(--tx-3)]">
                {mockRoutes.length ? "No endpoints match this filter" : "No endpoints in this collection yet"}
              </p>
            )}
            {!selectedCollectionId && (
              <p className="px-2 py-3 text-center text-[10px] text-[var(--tx-3)]">
                Select a collection to view its endpoints.
              </p>
            )}
          </div>
          {routeContextMenu && selectedCollectionId && (
            <ContextMenu
              x={routeContextMenu.x}
              y={routeContextMenu.y}
              header={routeContextMenu.routeId
                ? mockRoutes.find((route) => route.id === routeContextMenu.routeId)?.path ?? "Endpoint"
                : "New endpoint"}
              items={routeMenuItems(mockRoutes.find((route) => route.id === routeContextMenu.routeId) ?? null)}
              onClose={() => setRouteContextMenu(null)}
            />
          )}
        </aside>

        <section className="mock-endpoint-editor flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!selectedCollectionId ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <FolderKanban size={28} className="text-[var(--tx-3)]" />
              <h2 className="mt-3 text-sm font-semibold text-[var(--tx-1)]">Choose a collection</h2>
              <p className="mt-1 max-w-sm text-xs text-[var(--tx-3)]">
                Mock endpoints are kept with the selected collection. Choose one above or create a collection first.
              </p>
              {collectionsReady && collections.length === 0 && (
                <button
                  type="button"
                  onClick={() => setActiveModule("collections")}
                  className="mt-4 rounded-[var(--r-md)] bg-[var(--lime)] px-3 py-2 text-xs font-semibold text-black hover:bg-[var(--lime-hover)]"
                >
                  Open Collections
                </button>
              )}
            </div>
          ) : !selectedRoute ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-s2)] text-[var(--lime)]">
                <Braces size={22} />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[var(--tx-1)]">No mock endpoints yet</h2>
              <p className="mt-1 max-w-sm text-xs text-[var(--tx-3)]">
                Add a REST, GraphQL, SSE or WebSocket endpoint to {selectedCollection?.name}.
              </p>
              <button
                type="button"
                onClick={(event) => openRouteContextMenu(event, null)}
                className="mt-4 rounded-[var(--r-md)] bg-[var(--lime)] px-3 py-2 text-xs font-semibold text-black hover:bg-[var(--lime-hover)]"
              >
                <Plus size={13} className="mr-1.5 inline" /> Add endpoint
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-dim)] px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-[var(--tx-3)]">Endpoint editor</span>
                    {routePayload.value?.some((route) => route.id === selectedRoute.id) && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-[var(--ok)]">
                        <Check size={11} /> Valid
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <h2 className="truncate font-mono text-sm font-semibold text-[var(--tx-1)]">{selectedRoute.path}</h2>
                    {!selectedRoute.enabled && <span className="rounded bg-[var(--bg-s3)] px-1.5 py-0.5 text-[9px] text-[var(--tx-3)]">Disabled</span>}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-[var(--tx-2)]">
                  <input
                    type="checkbox"
                    checked={selectedRoute.enabled}
                    onChange={(event) => updateRoute(selectedRoute.id, { enabled: event.target.checked })}
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  aria-label="Delete endpoint"
                  onClick={() => removeRoute(selectedRoute.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-[var(--tx-3)] hover:bg-[var(--color-status-error-dim)] hover:text-[var(--err)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                <div className="mx-auto max-w-4xl space-y-5">
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Protocol & route</label>
                      <span className="text-[10px] text-[var(--tx-3)]">Use <code className="text-[var(--lime)]">{"{id}"}</code> for path parameters</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PROTOCOLS.map((protocol) => (
                        <button
                          key={protocol.id}
                          type="button"
                          onClick={() => {
                            const method = protocol.id === selectedRoute.protocol
                              ? selectedRoute.method
                              : protocol.id === "graphql" ? "POST" : "GET";
                            const path = protocol.id === "graphql" && selectedRoute.path === "/api/endpoint"
                              ? "/graphql"
                              : protocol.id === "sse" && selectedRoute.path === "/api/endpoint"
                                ? "/events"
                                : protocol.id === "websocket" && selectedRoute.path === "/api/endpoint"
                                  ? "/socket"
                                  : selectedRoute.path;
                            updateRoute(selectedRoute.id, { protocol: protocol.id, method, path });
                          }}
                          className={cn(
                            "rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors",
                            selectedRoute.protocol === protocol.id
                              ? "border-[var(--lime)] bg-[var(--lime-soft)]"
                              : "border-[var(--border)] hover:border-[var(--border-mid)]",
                          )}
                        >
                          <span className="block text-[11px] font-semibold text-[var(--tx-1)]">{protocol.label}</span>
                          <span className="mt-0.5 block truncate text-[9px] text-[var(--tx-3)]">{protocol.note}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    {selectedRoute.protocol === "rest" ? (
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Method</span>
                        <select
                          aria-label="Endpoint method"
                          className={inputCls}
                          value={selectedRoute.method}
                          onChange={(event) => updateRoute(selectedRoute.id, { method: event.target.value })}
                        >
                          {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                        </select>
                      </label>
                    ) : (
                      <div>
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Method</span>
                        <div className={cn(inputCls, "font-mono font-semibold", selectedRoute.protocol === "websocket" ? "text-cyan-400" : "text-[var(--lime)]")}>
                          {selectedRoute.protocol === "graphql" ? "POST" : "GET"}
                        </div>
                      </div>
                    )}
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Path</span>
                      <input
                        aria-label="Endpoint path"
                        className={cn(inputCls, "font-mono")}
                        placeholder="/api/users/{id}"
                        value={selectedRoute.path}
                        onChange={(event) => updateRoute(selectedRoute.id, { path: event.target.value })}
                      />
                    </label>
                  </section>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s1)] px-3 py-2">
                    <div className="min-w-0">
                      <span className="mr-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Endpoint URL</span>
                      <code className="break-all font-mono text-[11px] text-[var(--tx-2)]">{selectedUrl}</code>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {running && selectedRoute.protocol === "rest" && (
                        <button
                          type="button"
                          disabled={testLoading}
                          onClick={() => void sendTestRequest()}
                          className="flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[10px] font-medium bg-[var(--lime-soft)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-black transition-colors disabled:opacity-50"
                          title="Send a quick test request to this mock endpoint"
                        >
                          <Play size={10} className="fill-current" /> {testLoading ? "Testing..." : "Test"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void copyText(selectedUrl)}
                        className="flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[10px] text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)]"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    </div>
                  </div>

                  {testResult && (
                    <div className="rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s2)] p-2.5 text-xs space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", statusClass(testResult.status))}>
                            {testResult.status || "ERR"}
                          </span>
                          <span className="text-[10px] text-[var(--tx-3)]">Latency: {formatLatency(testResult.ms)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTestResult(null)}
                          className="text-[10px] text-[var(--tx-3)] hover:text-[var(--tx-1)]"
                        >
                          Dismiss
                        </button>
                      </div>
                      {testResult.body && (
                        <pre className="max-h-24 overflow-auto rounded bg-[var(--bg-base)] p-1.5 font-mono text-[10px] text-[var(--tx-2)] whitespace-pre-wrap break-all">
                          {testResult.body}
                        </pre>
                      )}
                    </div>
                  )}

                  {selectedRoute.protocol === "rest" && (
                    <>
                      {/* Scenarios bar & Presets */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s2)] p-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-3)] mr-1">
                            <Layers size={11} /> Scenarios:
                          </span>
                          {(selectedRoute.scenarios && selectedRoute.scenarios.length > 0
                            ? selectedRoute.scenarios
                            : [{ id: "default", name: `Default (${selectedRoute.status_code})`, status_code: selectedRoute.status_code }]
                          ).map((sc) => {
                            const isActive = (selectedRoute.active_scenario_id || "default") === sc.id;
                            return (
                              <button
                                key={sc.id}
                                type="button"
                                onClick={() => handleSwitchScenario(sc.id)}
                                className={cn(
                                  "group flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-[10px] font-medium transition-colors",
                                  isActive
                                    ? "bg-[var(--lime-soft)] text-[var(--lime)] border border-[var(--lime)]"
                                    : "bg-[var(--bg-s3)] text-[var(--tx-2)] hover:text-[var(--tx-1)] border border-transparent"
                                )}
                              >
                                <span>{sc.name}</span>
                                {sc.id !== "default" && (
                                  <span
                                    role="button"
                                    onClick={(e) => handleDeleteScenario(sc.id, e)}
                                    className="opacity-60 hover:opacity-100 hover:text-red-400 font-bold ml-0.5"
                                    title="Delete scenario"
                                  >
                                    ×
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={handleAddScenario}
                            className="flex items-center gap-1 rounded-[var(--r-sm)] border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] transition-colors"
                            title="Add a new response scenario for this route"
                          >
                            <Plus size={10} /> Add Scenario
                          </button>
                        </div>

                        {/* Presets dropdown */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
                            className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg-s1)] px-2.5 py-1 text-[10px] font-medium text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] transition-colors"
                          >
                            <Sparkles size={11} className="text-amber-400" />
                            <span>Presets</span>
                            <ChevronDown size={11} />
                          </button>
                          {showPresetsMenu && (
                            <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-s1)] p-1 shadow-xl animate-fadeIn">
                              <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--tx-3)]">
                                Fill with Preset:
                              </p>
                              {RESPONSE_PRESETS.map((p) => (
                                <button
                                  key={p.name}
                                  type="button"
                                  onClick={() => applyPreset(p)}
                                  className="w-full text-left rounded-[var(--r-sm)] px-2 py-1.5 text-[10px] text-[var(--tx-2)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] flex items-center justify-between"
                                >
                                  <span>{p.name}</span>
                                  <span className={cn("text-[9px] font-mono", statusClass(p.status_code))}>{p.status_code}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <section className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Status</span>
                          <input
                            aria-label="Response status code"
                            className={inputCls}
                            type="number"
                            min={100}
                            max={599}
                            value={selectedRoute.status_code}
                            onChange={(event) => updateRoute(selectedRoute.id, { status_code: Number(event.target.value) })}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Response delay</span>
                          <div className="relative">
                            <input
                              aria-label="Response delay in milliseconds"
                              className={cn(inputCls, "pr-14")}
                              type="number"
                              min={0}
                              max={MAX_DELAY_MS}
                              value={selectedRoute.delay_ms}
                              onChange={(event) => updateRoute(selectedRoute.id, { delay_ms: Number(event.target.value) })}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--tx-3)]">ms</span>
                          </div>
                        </label>
                      </section>
                      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Response headers (JSON)</span>
                          <textarea
                            aria-label="Response headers JSON"
                            className={cn(codeCls, "min-h-32", validateJson(selectedRoute.headers_json) ? "ring-1 ring-red-500/50" : "")}
                            spellCheck={false}
                            value={selectedRoute.headers_json}
                            onChange={(event) => updateRoute(selectedRoute.id, { headers_json: event.target.value })}
                          />
                          {validateJson(selectedRoute.headers_json)
                            ? <p className="mt-1 text-[9px] text-red-400">⚠ {validateJson(selectedRoute.headers_json)}</p>
                            : selectedRoute.headers_json.trim() && <p className="mt-1 text-[9px] text-emerald-500">✓ Valid JSON</p>
                          }
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Response body</span>
                          <textarea
                            aria-label="Response body"
                            className={cn(codeCls, validateJson(selectedRoute.body) ? "ring-1 ring-red-500/50" : "")}
                            spellCheck={false}
                            placeholder={'{"ok": true}'}
                            value={selectedRoute.body}
                            onChange={(event) => updateRoute(selectedRoute.id, { body: event.target.value })}
                          />
                          {validateJson(selectedRoute.body)
                            ? <p className="mt-1 text-[9px] text-red-400">⚠ {validateJson(selectedRoute.body)}</p>
                            : selectedRoute.body.trim() && <p className="mt-1 text-[9px] text-emerald-500">✓ Valid JSON</p>
                          }
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="flex items-center gap-1 text-[9px] font-semibold text-[var(--lime)] mr-1">
                              <Sparkles size={10} /> Dynamic tokens:
                            </span>
                            {DYNAMIC_TOKENS.map((dt) => (
                              <button
                                key={dt.token}
                                type="button"
                                title={`Click to copy: ${dt.label}`}
                                onClick={() => void copyText(dt.token)}
                                className="rounded bg-[var(--bg-s3)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--tx-2)] hover:text-[var(--lime)] hover:bg-[var(--bg-s2)] transition-colors"
                              >
                                {dt.token}
                              </button>
                            ))}
                          </div>
                        </label>
                      </section>
                    </>
                  )}

                  {selectedRoute.protocol === "graphql" && (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">HTTP status</span>
                          <input
                            aria-label="GraphQL status code"
                            className={inputCls}
                            type="number"
                            min={100}
                            max={599}
                            value={selectedRoute.status_code}
                            onChange={(event) => updateRoute(selectedRoute.id, { status_code: Number(event.target.value) })}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Response delay</span>
                          <div className="relative">
                            <input
                              aria-label="GraphQL response delay"
                              className={cn(inputCls, "pr-14")}
                              type="number"
                              min={0}
                              max={MAX_DELAY_MS}
                              value={selectedRoute.delay_ms}
                              onChange={(event) => updateRoute(selectedRoute.id, { delay_ms: Number(event.target.value) })}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--tx-3)]">ms</span>
                          </div>
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">
                          <Braces size={12} /> GraphQL JSON response
                        </span>
                        <p className="mb-2 text-[10px] text-[var(--tx-3)]">Return a GraphQL response object with <code>data</code> and optional <code>errors</code>.</p>
                        <textarea
                          aria-label="GraphQL JSON response"
                          className={cn(codeCls, "min-h-56", validateJson(selectedRoute.body) ? "ring-1 ring-red-500/50" : "")}
                          spellCheck={false}
                          value={selectedRoute.body}
                          onChange={(event) => updateRoute(selectedRoute.id, { body: event.target.value })}
                        />
                        {validateJson(selectedRoute.body)
                          ? <p className="mt-1 text-[9px] text-red-400">⚠ {validateJson(selectedRoute.body)}</p>
                          : selectedRoute.body.trim() && <p className="mt-1 text-[9px] text-emerald-500">✓ Valid JSON</p>
                        }
                      </label>
                    </>
                  )}

                  {selectedRoute.protocol === "sse" && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Radio size={15} className="text-amber-400" />
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--tx-1)]">Finite event stream</p>
                            <p className="text-[10px] text-[var(--tx-3)]">Events are sent in order, then the connection closes.</p>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] text-[var(--tx-2)]">
                          Interval
                          <input
                            aria-label="SSE event interval in milliseconds"
                            className={cn(inputCls, "w-24 px-2 py-1.5")}
                            type="number"
                            min={0}
                            max={MAX_DELAY_MS}
                            value={selectedRoute.delay_ms}
                            onChange={(event) => updateRoute(selectedRoute.id, { delay_ms: Number(event.target.value) })}
                          />
                          ms
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">
                          <Radio size={12} /> Events (JSON array)
                        </span>
                        <p className="mb-2 text-[10px] text-[var(--tx-3)]">Each item supports <code>event</code>, <code>id</code>, <code>data</code>, and optional <code>retry</code>.</p>
                        <textarea
                          aria-label="SSE events JSON"
                          className={cn(codeCls, "min-h-56", validateJson(selectedRoute.events_json) ? "ring-1 ring-red-500/50" : "")}
                          spellCheck={false}
                          value={selectedRoute.events_json}
                          onChange={(event) => updateRoute(selectedRoute.id, { events_json: event.target.value })}
                        />
                        {validateJson(selectedRoute.events_json)
                          ? <p className="mt-1 text-[9px] text-red-400">⚠ {validateJson(selectedRoute.events_json)}</p>
                          : selectedRoute.events_json.trim() && <p className="mt-1 text-[9px] text-emerald-500">✓ Valid JSON</p>
                        }
                      </label>
                    </>
                  )}

                  {selectedRoute.protocol === "websocket" && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Wifi size={15} className="text-cyan-400" />
                          <div>
                            <p className="text-[11px] font-semibold text-[var(--tx-1)]">WebSocket listener</p>
                            <p className="text-[10px] text-[var(--tx-3)]">Uses the displayed WS port, next to the HTTP port.</p>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] text-[var(--tx-2)]">
                          <input
                            type="checkbox"
                            checked={selectedRoute.echo_messages}
                            onChange={(event) => updateRoute(selectedRoute.id, { echo_messages: event.target.checked })}
                          />
                          Echo incoming messages
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Initial server messages (JSON array)</span>
                          <textarea
                            aria-label="WebSocket initial messages JSON"
                            className={cn(codeCls, "min-h-44", validateJson(selectedRoute.messages_json) ? "ring-1 ring-red-500/50" : "")}
                            spellCheck={false}
                            value={selectedRoute.messages_json}
                            onChange={(event) => updateRoute(selectedRoute.id, { messages_json: event.target.value })}
                          />
                          {validateJson(selectedRoute.messages_json)
                            ? <p className="mt-1 text-[9px] text-red-400">⚠ {validateJson(selectedRoute.messages_json)}</p>
                            : selectedRoute.messages_json.trim() && <p className="mt-1 text-[9px] text-emerald-500">✓ Valid JSON</p>
                          }
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--tx-3)]">Connect delay</span>
                          <div className="relative">
                            <input
                              aria-label="WebSocket connection delay in milliseconds"
                              className={cn(inputCls, "pr-14")}
                              type="number"
                              min={0}
                              max={MAX_DELAY_MS}
                              value={selectedRoute.delay_ms}
                              onChange={(event) => updateRoute(selectedRoute.id, { delay_ms: Number(event.target.value) })}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--tx-3)]">ms</span>
                          </div>
                          <p className="mt-2 text-[10px] leading-relaxed text-[var(--tx-3)]">
                            Messages are sent after the client connects. Echo is useful for quick round-trip testing.
                          </p>
                        </label>
                      </div>
                    </>
                  )}

                </div>
              </div>
            </>
          )}
        </section>

        <section className="mock-request-log flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--border-dim)] bg-[var(--bg-s1)]">
          <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-dim)] px-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tx-1)]">
              <Activity size={13} className="text-[var(--ok)]" /> Live traffic
              <span className="font-normal text-[10px] text-[var(--tx-3)]">{log.length}</span>
            </h2>
            <button
              type="button"
              aria-label="Clear mock request log"
              onClick={clearLog}
              disabled={log.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)] disabled:opacity-40"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="shrink-0 p-2">
            <label className="relative block">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tx-3)]" />
              <input
                aria-label="Search request log"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Filter traffic"
                className={cn(inputCls, "py-1.5 pl-7 text-[10px]")}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleLog.length === 0 ? (
              <div className="flex h-24 flex-col items-center justify-center px-4 text-center">
                <Activity size={17} className="text-[var(--tx-3)]" />
                <p className="mt-1 text-[10px] text-[var(--tx-3)]">
                  {running ? "Waiting for traffic…" : "Start the server to receive traffic"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-dim)]">
                {visibleLog.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedLogForInspect(entry)}
                    className="group cursor-pointer space-y-1.5 px-3 py-2 transition-colors hover:bg-[var(--bg-s2)]"
                    title="Click to inspect this request"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[8px] font-bold uppercase",
                        entry.protocol === "websocket"
                          ? "bg-cyan-500/10 text-cyan-400"
                          : entry.protocol === "graphql"
                            ? "bg-pink-500/10 text-pink-400"
                            : entry.protocol === "sse"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-[var(--bg-s3)] text-[var(--tx-3)]",
                      )}>
                        {entry.protocol === "websocket" ? "WS" : entry.protocol || "REST"}
                      </span>
                      <span className="text-[9px] font-semibold text-[var(--tx-2)]">{entry.method}</span>
                      <span className={cn("rounded px-1 py-0.5 text-[9px]", statusClass(entry.status_code))}>{entry.status_code}</span>
                      {entry.status_code === 404 && (
                        <button
                          type="button"
                          title="Create mock route for this 404 request"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMockFromTraffic(entry);
                          }}
                          className="rounded bg-[var(--lime-soft)] px-1.5 py-0.2 text-[8px] font-semibold text-[var(--lime)] hover:bg-[var(--lime)] hover:text-black transition-colors"
                        >
                          + Mock
                        </button>
                      )}
                      <span className="ml-auto text-[9px] text-[var(--tx-3)]">{formatLatency(entry.duration_ms ?? 0)}</span>
                    </div>
                    <p className="truncate font-mono text-[10px] text-[var(--tx-1)] group-hover:text-[var(--lime)] transition-colors">
                      {entry.path}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-[var(--border-dim)] px-3 py-1.5 text-[9px] leading-relaxed text-[var(--tx-3)]">
            Logs store endpoint metadata only; query strings, headers and bodies are not retained.
          </div>
        </section>
      </main>

      {/* Traffic Inspector Drawer */}
      {selectedLogForInspect && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedLogForInspect(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg-s1)] shadow-2xl p-5 overflow-y-auto animate-slideLeft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-dim)] pb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-[var(--lime)]" />
                <h3 className="text-sm font-semibold text-[var(--tx-1)]">Traffic Inspector</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogForInspect(null)}
                className="rounded p-1 text-[var(--tx-3)] hover:bg-[var(--bg-s3)] hover:text-[var(--tx-1)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Request Banner */}
              <div className="rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s2)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold font-mono", methodColor(selectedLogForInspect.method))}>
                    {selectedLogForInspect.method}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", statusClass(selectedLogForInspect.status_code))}>
                    {selectedLogForInspect.status_code}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--tx-3)] font-mono">
                    {formatLatency(selectedLogForInspect.duration_ms ?? 0)}
                  </span>
                </div>
                <p className="font-mono text-xs text-[var(--tx-1)] break-all bg-[var(--bg-base)] p-2.5 rounded border border-[var(--border-dim)]">
                  {selectedLogForInspect.path}
                </p>
                <div className="flex items-center justify-between text-[10px] text-[var(--tx-3)] pt-1">
                  <span>Protocol: <b className="uppercase text-[var(--tx-2)]">{selectedLogForInspect.protocol}</b></span>
                  <span>{parseUtcDate(selectedLogForInspect.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Matched Route or 404 Action */}
              <div className="rounded-[var(--r-md)] border border-[var(--border-dim)] bg-[var(--bg-s2)] p-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-3)] mb-2">
                  Route Resolution
                </h4>
                {selectedLogForInspect.matched_route_id ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-emerald-400">✓ Matched configured mock endpoint</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRouteId(selectedLogForInspect.matched_route_id!);
                        setSelectedLogForInspect(null);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 rounded-[var(--r-md)] bg-[var(--bg-s3)] py-1.5 text-xs text-[var(--tx-1)] hover:bg-[var(--lime-soft)] hover:text-[var(--lime)] transition-colors"
                    >
                      <ExternalLink size={12} /> Open endpoint in editor
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-400">⚠ No mock route matched this request (404).</p>
                    <button
                      type="button"
                      onClick={() => handleMockFromTraffic(selectedLogForInspect)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-[var(--r-md)] bg-[var(--lime)] py-2 text-xs font-semibold text-black hover:bg-[var(--lime-hover)] transition-colors"
                    >
                      <Plus size={13} /> Create Mock Endpoint for this Path
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void copyText(`http://127.0.0.1:${port}${selectedLogForInspect.path}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] py-2 text-xs text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:border-[var(--lime)] transition-colors"
                >
                  <Copy size={12} /> Copy URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
