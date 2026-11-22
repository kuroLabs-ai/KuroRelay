import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Draft } from "immer";
import type { KVPair, RequestBody, RequestAuth } from "../bridge/client";
import type { ExtractionRule } from "../lib/variableChaining";
import { normalizeKVPairs, normalizeBody, normalizeAuth } from "../lib/cn";
import type { SettingsTabId } from "../components/views/settings/types";

export interface RequestOptions {
  verify_ssl?: boolean;
  follow_redirects?: boolean;
  timeout_ms?: number;
  allow_private_network?: boolean;
}

// ── Tab ───────────────────────────────────────────
export interface Tab {
  id: string;
  name: string;
  method: string;
  url: string;
  params: KVPair[];
  headers: KVPair[];
  body: RequestBody;
  auth: RequestAuth;
  options: RequestOptions;
  pathVariables?: KVPair[];
  isDirty: boolean;
  isLoading: boolean;
  response?: unknown;
  savedRequestId?: string;
  collectionId?: string;
  protocol: "http" | "websocket" | "graphql" | "sse";
  extractions?: ExtractionRule[];
}

// ── Collection ────────────────────────────────────
export interface CollectionItem {
  id: string;
  workspaceId?: string;
  workspace_id?: string;
  name: string;
  description?: string;
  requests?: RequestItem[];
  folders?: FolderItem[];
}

export interface FolderItem {
  id: string;
  collectionId?: string;
  collection_id?: string;
  parent_id?: string | null;
  parent_folder_id?: string | null;
  name: string;
  requests?: RequestItem[];
}

export interface RequestItem {
  id: string;
  collectionId?: string;
  collection_id?: string;
  folderId?: string;
  folder_id?: string;
  name: string;
  method: string;
  url: string;
  configuration?: any;
}

// ── History ───────────────────────────────────────
export interface HistoryItem {
  id: string;
  method: string;
  url: string;
  statusCode?: number;
  durationMs?: number;
  executedAt: string;
  request_snapshot?: any;
  response_metadata?: any;
}

export interface MockScenario {
  id: string;
  name: string;
  status_code: number;
  headers_json: string;
  body: string;
}

export interface MockRouteDraft {
  id: string;
  protocol: "rest" | "graphql" | "sse" | "websocket";
  method: string;
  path: string;
  status_code: number;
  headers_json: string;
  body: string;
  events_json: string;
  messages_json: string;
  echo_messages: boolean;
  delay_ms: number;
  enabled: boolean;
  scenarios?: MockScenario[];
  active_scenario_id?: string;
}

// ── Module names ──────────────────────────────────
export type Module =
  | "request"
  | "collections"
  | "environments"
  | "history"
  | "workflows"
  | "mock"
  | "settings";
// ── Store ─────────────────────────────────────────
interface AppState {
  // layout
  activeModule: Module;
  sidebarOpen: boolean;
  sidebarWidth: number;
  requestSplitPct: number;
  requestSplitOrientation: "vertical" | "horizontal";

  // workspace
  activeWorkspaceId: string | null;

  // tabs
  tabs: Tab[];
  activeTabId: string | null;

  // collections
  collections: CollectionItem[];
  collectionsLoadedWorkspaceId: string | null;
  selectedCollectionId: string | null;

  // history
  history: HistoryItem[];

  // environment
  activeEnvironmentId: string | null;
  selectedEnvironmentId: string | null;
  environments: any[];
  environmentVariables: Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>;
  globalVariables: Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>;
  envColors: Record<string, string>;

  // workflows
  workflows: any[];
  selectedWorkflowId: string | null;

  // mock server
  mockRoutes: MockRouteDraft[];
  mockRoutesByCollection: Record<string, MockRouteDraft[]>;
  savedMockRoutesByCollection: Record<string, MockRouteDraft[]>;
  mockRoutesConfigured: boolean;

  // settings
  activeSettingsTab: SettingsTabId;
  setActiveSettingsTab: (tab: SettingsTabId) => void;
  appSettings: Record<string, string>;
  setAppSettings: (settings: Record<string, string>) => void;
  updateAppSetting: (key: string, value: string) => void;

  // actions
  setActiveModule: (m: Module) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setSidebarOpen: (v: boolean) => void;
  setRequestSplitPct: (pct: number) => void;
  setRequestSplitOrientation: (orientation: "vertical" | "horizontal") => void;

  openTab: (partial?: Partial<Tab>, allowDuplicate?: boolean) => string;
  closeTab: (id: string) => void;
  reorderTabs: (sourceId: string, targetId: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;

  setCollections: (cols: CollectionItem[]) => void;
  setCollectionsForWorkspace: (workspaceId: string, cols: CollectionItem[]) => void;
  setSelectedCollectionId: (id: string | null) => void;
  setHistory: (h: HistoryItem[]) => void;
  setActiveWorkspace: (id: string) => void;
  setEnvironments: (envs: any[]) => void;
  setActiveEnvironment: (id: string | null) => void;
  setSelectedEnvironmentId: (id: string | null) => void;
  setEnvironmentVariables: (vars: Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>) => void;
  setGlobalVariables: (vars: Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>) => void;
  setEnvColor: (envId: string, color: string) => void;
  setWorkflows: (wfs: any[]) => void;
  setSelectedWorkflowId: (id: string | null) => void;
  setMockRoutes: (routes: MockRouteDraft[]) => void;
  saveMockRoutes: () => void;
}

const UNASSIGNED_MOCK_COLLECTION = "__unassigned__";

function selectMockCollection(state: Draft<AppState>, collectionId: string | null): void {
  const collectionKey = collectionId ?? UNASSIGNED_MOCK_COLLECTION;
  if (
    collectionId
    && !Object.prototype.hasOwnProperty.call(state.mockRoutesByCollection, collectionKey)
    && Object.prototype.hasOwnProperty.call(state.mockRoutesByCollection, UNASSIGNED_MOCK_COLLECTION)
  ) {
    state.mockRoutesByCollection[collectionKey] = state.mockRoutesByCollection[UNASSIGNED_MOCK_COLLECTION];
    delete state.mockRoutesByCollection[UNASSIGNED_MOCK_COLLECTION];
  }
  if (
    collectionId
    && !Object.prototype.hasOwnProperty.call(state.savedMockRoutesByCollection, collectionKey)
    && Object.prototype.hasOwnProperty.call(state.savedMockRoutesByCollection, UNASSIGNED_MOCK_COLLECTION)
  ) {
    state.savedMockRoutesByCollection[collectionKey] = state.savedMockRoutesByCollection[UNASSIGNED_MOCK_COLLECTION];
    delete state.savedMockRoutesByCollection[UNASSIGNED_MOCK_COLLECTION];
  }
  state.selectedCollectionId = collectionId;
  state.mockRoutes = state.mockRoutesByCollection[collectionKey] ?? [];
  state.mockRoutesConfigured = Object.prototype.hasOwnProperty.call(state.mockRoutesByCollection, collectionKey);
}

function newTab(partial?: Partial<Tab>, defaultSettings?: Record<string, string>): Tab {
  const p = partial || {};
  const timeoutMs = defaultSettings?.default_timeout_ms ? parseInt(defaultSettings.default_timeout_ms, 10) : 30000;
  const verifyTls = defaultSettings?.verify_tls !== undefined ? defaultSettings.verify_tls === "true" : true;
  const followRedirects = defaultSettings?.follow_redirects !== undefined ? defaultSettings.follow_redirects === "true" : true;
  const allowPrivate = defaultSettings?.allow_private_network_default !== undefined ? defaultSettings.allow_private_network_default === "true" : false;

  return {
    id: p.id || crypto.randomUUID(),
    name: p.name || "New Request",
    method: (p.method || "GET").toUpperCase(),
    url: p.url || "",
    params: normalizeKVPairs(p.params),
    headers: normalizeKVPairs(p.headers),
    body: normalizeBody(p.body),
    auth: normalizeAuth(p.auth),
    options: {
      verify_ssl: p.options?.verify_ssl ?? verifyTls,
      follow_redirects: p.options?.follow_redirects ?? followRedirects,
      timeout_ms: p.options?.timeout_ms ?? (isNaN(timeoutMs) ? 30000 : timeoutMs),
      allow_private_network: p.options?.allow_private_network ?? allowPrivate,
    },
    isDirty: !!p.isDirty,
    isLoading: !!p.isLoading,
    response: p.response,
    savedRequestId: p.savedRequestId,
    collectionId: p.collectionId,
    protocol: p.protocol || "http",
    extractions: p.extractions || [],
  };
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set) => ({
      activeModule: "collections",
      sidebarOpen: true,
      sidebarWidth: 260,
      requestSplitPct: 45,
      requestSplitOrientation: "vertical",
      activeWorkspaceId: null,
      tabs: [newTab()],
      activeTabId: null,
      collections: [],
      collectionsLoadedWorkspaceId: null,
      selectedCollectionId: null,
      history: [],
      activeEnvironmentId: null,
      selectedEnvironmentId: null,
      environments: [] as any[],
      environmentVariables: [] as Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>,
      globalVariables: [] as Array<{ key: string; value: string; is_secret?: boolean; is_enabled?: boolean }>,
      envColors: (() => {
        try {
          return JSON.parse(localStorage.getItem("kuro_env_colors") || "{}");
        } catch {
          return {};
        }
      })(),
      workflows: [] as any[],
      selectedWorkflowId: null,
      mockRoutes: [] as MockRouteDraft[],
      mockRoutesByCollection: {} as Record<string, MockRouteDraft[]>,
      savedMockRoutesByCollection: {} as Record<string, MockRouteDraft[]>,
      mockRoutesConfigured: false,
      activeSettingsTab: "network",
      setActiveSettingsTab: (tab) => set((s) => { s.activeSettingsTab = tab; }),
      appSettings: {},
      setAppSettings: (settings) => set((s) => { s.appSettings = settings; }),
      updateAppSetting: (key, value) => set((s) => { s.appSettings[key] = value; }),

      setActiveModule: (m) => set((s) => { s.activeModule = m; }),
      toggleSidebar: () => set((s) => { s.sidebarOpen = !s.sidebarOpen; }),
      setSidebarOpen: (v) => set((s) => { s.sidebarOpen = v; }),
      setSidebarWidth: (w) => set((s) => { s.sidebarWidth = w; }),
      setRequestSplitPct: (pct) => set((s) => {
        s.requestSplitPct = Math.min(80, Math.max(20, pct));
      }),
      setRequestSplitOrientation: (orientation) => set((s) => {
        s.requestSplitOrientation = orientation;
      }),

      openTab: (partial, allowDuplicate = false) => {
        const p = partial || {};
        let tabId = "";
        set((s) => {
          // If a request with the same savedRequestId is already open, activate it instead of duplicating!
          if (p.savedRequestId && !allowDuplicate) {
            const existing = s.tabs.find((t) => t.savedRequestId === p.savedRequestId);
            if (existing) {
              s.activeTabId = existing.id;
              tabId = existing.id;
              return;
            }
          }
          const tab = newTab(partial, s.appSettings);
          s.tabs.push(tab);
          s.activeTabId = tab.id;
          tabId = tab.id;
        });
        return tabId;
      },

      closeTab: (id) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx !== -1) {
            s.tabs.splice(idx, 1);
            if (s.activeTabId === id) {
              s.activeTabId = s.tabs.length > 0 ? s.tabs[Math.max(0, idx - 1)].id : null;
            }
          }
        }),

      reorderTabs: (sourceId, targetId) =>
        set((s) => {
          const sourceIndex = s.tabs.findIndex((tab) => tab.id === sourceId);
          const targetIndex = s.tabs.findIndex((tab) => tab.id === targetId);
          if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
          const [tab] = s.tabs.splice(sourceIndex, 1);
          s.tabs.splice(targetIndex, 0, tab);
        }),

      setActiveTab: (id) => set((s) => { s.activeTabId = id; }),

      updateTab: (id, patch) =>
        set((s) => {
          const t = s.tabs.find((t) => t.id === id);
          if (t) {
            if (patch.params !== undefined) patch.params = normalizeKVPairs(patch.params);
            if (patch.headers !== undefined) patch.headers = normalizeKVPairs(patch.headers);
            if (patch.body !== undefined) patch.body = normalizeBody(patch.body);
            if (patch.auth !== undefined) patch.auth = normalizeAuth(patch.auth);
            if (patch.options !== undefined) patch.options = { ...t.options, ...patch.options };
            Object.assign(t, patch);
          }
        }),

      setCollections: (cols) => set((s) => {
        s.collections = cols;
        s.collectionsLoadedWorkspaceId = s.activeWorkspaceId;
        if (!cols.some((collection) => collection.id === s.selectedCollectionId)) {
          selectMockCollection(s, cols[0]?.id ?? null);
        }
      }),
      setCollectionsForWorkspace: (workspaceId, cols) => set((s) => {
        if (s.activeWorkspaceId !== workspaceId) return;
        s.collections = cols;
        s.collectionsLoadedWorkspaceId = workspaceId;
        if (!cols.some((collection) => collection.id === s.selectedCollectionId)) {
          selectMockCollection(s, cols[0]?.id ?? null);
        }
      }),
      setSelectedCollectionId: (id) => set((s) => {
        if (s.selectedCollectionId !== id) selectMockCollection(s, id);
      }),
      setHistory: (h) => set((s) => { s.history = h; }),
      setActiveWorkspace: (id) => set((s) => {
        if (s.activeWorkspaceId === id) return;
        s.activeWorkspaceId = id;
        s.collections = [];
        s.collectionsLoadedWorkspaceId = null;
        selectMockCollection(s, null);
        s.activeEnvironmentId = null;
        s.selectedEnvironmentId = null;
        s.environments = [];
        s.environmentVariables = [];
        s.globalVariables = [];
      }),
      setEnvironments: (envs) => set((s) => { s.environments = envs; }),
      setActiveEnvironment: (id) => set((s) => { s.activeEnvironmentId = id; }),
      setSelectedEnvironmentId: (id) => set((s) => { s.selectedEnvironmentId = id; }),
      setEnvironmentVariables: (vars) => set((s) => { s.environmentVariables = vars; }),
      setGlobalVariables: (vars) => set((s) => { s.globalVariables = vars; }),
      setEnvColor: (envId, color) =>
        set((s) => {
          s.envColors[envId] = color;
          try {
            localStorage.setItem("kuro_env_colors", JSON.stringify(s.envColors));
          } catch {}
        }),
      setWorkflows: (wfs) => set((s) => { s.workflows = wfs; }),
      setSelectedWorkflowId: (id) => set((s) => { s.selectedWorkflowId = id; }),
      setMockRoutes: (routes) => set((s) => {
        s.mockRoutes = routes;
        const collectionKey = s.selectedCollectionId ?? UNASSIGNED_MOCK_COLLECTION;
        s.mockRoutesByCollection[collectionKey] = routes;
        s.mockRoutesConfigured = true;
      }),
      saveMockRoutes: () => set((s) => {
        const collectionKey = s.selectedCollectionId ?? UNASSIGNED_MOCK_COLLECTION;
        s.savedMockRoutesByCollection[collectionKey] = s.mockRoutes.map((route) => ({ ...route }));
        s.mockRoutesConfigured = true;
      }),
    })),
    {
      name: "kurorelay-app",
      version: 7,
      migrate(persisted: any, fromVersion: number) {
        persisted = persisted && typeof persisted === "object" ? persisted : {};
        if (fromVersion < 2) {
          // Migrate old tabs that may be missing 'options' or 'protocol'
          const tabs = persisted?.tabs ?? [];
          persisted.tabs = tabs.map((t: any) => ({
            ...t,
            protocol: t.protocol || "http",
            options: {
              verify_ssl: t.options?.verify_ssl ?? true,
              follow_redirects: t.options?.follow_redirects ?? true,
              timeout_ms: t.options?.timeout_ms ?? 30000,
              allow_private_network: t.options?.allow_private_network ?? false,
            },
          }));
        }
        if (fromVersion < 3) {
          const hasMockRoutes = Array.isArray(persisted.mockRoutes);
          persisted.mockRoutes = Array.isArray(persisted.mockRoutes) ? persisted.mockRoutes : [];
          persisted.mockRoutesConfigured =
            typeof persisted.mockRoutesConfigured === "boolean"
              ? persisted.mockRoutesConfigured
              : hasMockRoutes;
        }
        if (fromVersion < 4) {
          persisted.mockRoutes = (Array.isArray(persisted.mockRoutes) ? persisted.mockRoutes : []).map(
            (route: any) => ({
              ...route,
              protocol: route.protocol || "rest",
              events_json: route.events_json || JSON.stringify(route.events || [], null, 2),
              messages_json: route.messages_json || JSON.stringify(route.messages || [], null, 2),
              echo_messages: route.echo_messages === true,
            }),
          );
        }
        if (fromVersion < 6) {
          const routes = Array.isArray(persisted.mockRoutes) ? persisted.mockRoutes : [];
          const selectedCollectionId = typeof persisted.selectedCollectionId === "string"
            ? persisted.selectedCollectionId
            : null;
          const collectionKey = selectedCollectionId ?? UNASSIGNED_MOCK_COLLECTION;
          const routesByCollection = persisted.mockRoutesByCollection
            && typeof persisted.mockRoutesByCollection === "object"
            && !Array.isArray(persisted.mockRoutesByCollection)
            ? persisted.mockRoutesByCollection
            : {};
          if (
            !Object.prototype.hasOwnProperty.call(routesByCollection, collectionKey)
            && (routes.length > 0 || persisted.mockRoutesConfigured === true)
          ) {
            routesByCollection[collectionKey] = routes;
          }
          persisted.selectedCollectionId = selectedCollectionId;
          persisted.mockRoutesByCollection = routesByCollection;
          persisted.mockRoutes = routesByCollection[collectionKey] ?? [];
          persisted.mockRoutesConfigured = Object.prototype.hasOwnProperty.call(routesByCollection, collectionKey);
        }
        if (fromVersion < 6 && ["explorer", "testing", "performance"].includes(persisted.activeModule)) {
          persisted.activeModule = "collections";
        }
        if (fromVersion < 7) {
          const routesByCollection = persisted.mockRoutesByCollection
            && typeof persisted.mockRoutesByCollection === "object"
            && !Array.isArray(persisted.mockRoutesByCollection)
            ? persisted.mockRoutesByCollection
            : {};
          persisted.savedMockRoutesByCollection = Object.fromEntries(
            Object.entries(routesByCollection).map(([collectionId, routes]) => [
              collectionId,
              Array.isArray(routes) ? routes.map((route: any) => ({ ...route })) : [],
            ]),
          );
        }
        return persisted;
      },
      partialize: (s) => ({
        sidebarWidth: s.sidebarWidth,
        sidebarOpen: s.sidebarOpen,
        requestSplitPct: s.requestSplitPct,
        requestSplitOrientation: s.requestSplitOrientation,
        activeModule: s.activeModule,
        activeWorkspaceId: s.activeWorkspaceId,
        selectedCollectionId: s.selectedCollectionId,
        activeEnvironmentId: s.activeEnvironmentId,
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        mockRoutes: s.mockRoutes,
        mockRoutesByCollection: s.mockRoutesByCollection,
        savedMockRoutesByCollection: s.savedMockRoutesByCollection,
        mockRoutesConfigured: s.mockRoutesConfigured,
      }),
    }
  )
);

// initialise activeTabId after hydration
const store = useAppStore.getState();
if (!store.activeTabId && store.tabs.length > 0) {
  useAppStore.setState({ activeTabId: store.tabs[0].id });
}
