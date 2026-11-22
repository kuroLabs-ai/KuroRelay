// ─────────────────────────────────────────────
// KuroRelay Bridge Client — PyWebView JS API
// ─────────────────────────────────────────────

type PyAPI = Record<string, (...args: unknown[]) => Promise<unknown>>;
declare const window: Window & { pywebview?: { api: PyAPI } };

let pywebviewReady = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "pywebviewready",
    () => {
      pywebviewReady = true;
    },
    { once: true },
  );
}

function isBridgeAvailable(): boolean {
  return !!(window.pywebview?.api);
}

function hasBridgeMethod(method: string): boolean {
  return typeof window.pywebview?.api?.[method] === "function";
}

async function waitForBridge(method: string, timeoutMs = 5000): Promise<void> {
  if (hasBridgeMethod(method) || pywebviewReady) return;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      pywebviewReady = true;
      clearTimeout(timer);
      resolve();
    };
    window.addEventListener("pywebviewready", handler, { once: true });
    timer = setTimeout(() => {
      window.removeEventListener("pywebviewready", handler);
      resolve();
    }, timeoutMs);
  });
}

async function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  await waitForBridge(method);
  if (!isBridgeAvailable()) {
    console.warn(`[bridge] pywebview unavailable — ${method} → mock`);
    return { status: "ok" } as T;
  }
  const fn = window.pywebview!.api[method];
  if (typeof fn !== "function") throw new Error(`Bridge method not found: ${method}`);
  return fn(...args) as Promise<T>;
}

export const bridge = {
  // ── Core & Window Lifecycle ───────────────
  ping: () => call<{ status: string; version?: string }>("ping"),
  getSettings: () => call<{ status: string; settings: Record<string, string> }>("get_settings"),
  updateSetting: (keyOrPayload: string | { key: string; value: string }, value?: string) =>
    call<{ status: string; key?: string; value?: string }>(
      "update_setting",
      typeof keyOrPayload === "object" ? keyOrPayload : { key: keyOrPayload, value: value ?? "" }
    ),
  updateSettings: (settings: Record<string, string>) =>
    call<{ status: string; updated?: Record<string, string> }>("update_settings", { settings }),
  getSystemInfo: () => call<{ status: string; info: SystemInfo }>("get_system_info"),
  getStorageStats: () => call<{ status: string; stats: StorageStats }>("get_storage_stats"),
  vacuumDatabase: () => call<{ status: string; message?: string }>("vacuum_database"),
  createDatabaseBackup: (label?: string) =>
    call<{ status: string; backup?: BackupInfo; message?: string }>("create_database_backup", label),
  listDatabaseBackups: () =>
    call<{ status: string; backups: BackupInfo[]; count: number }>("list_database_backups"),
  restoreDatabaseBackup: (backupName: string) =>
    call<{ status: string; message?: string; restored_from?: string }>("restore_database_backup", backupName),
  openDataFolder: (subfolder?: string) =>
    call<{ status: string; path?: string; message?: string }>("open_data_folder", subfolder),

  // ── Window State & Layout Persistence ─────
  getWindowState: () => call<{ status: string; state: WindowState }>("get_window_state"),
  saveWindowState: (state: Partial<WindowState>) =>
    call<{ status: string; state?: WindowState }>("save_window_state", state),

  // ── Certificates Management ───────────────
  listCertificates: () =>
    call<{ status: string; certificates: CertificateInfo[] }>("list_certificates"),
  importCertificate: (payload?: string | { path: string }) =>
    call<{ status: string; filename?: string; path?: string; error?: string }>(
      "import_certificate",
      typeof payload === "string" ? { path: payload } : payload
    ),
  deleteCertificate: (filename: string) =>
    call<{ status: string; deleted?: string; error?: string }>("delete_certificate", { filename }),

  // ── Diagnostic Logs ───────────────────────
  getRecentLogs: (limit = 150) =>
    call<LogsResult>("get_recent_logs", { limit }),
  clearLogs: () => call<{ status: string }>("clear_logs"),

  openExternalUrl: (url: string) => call<{ status: string }>("open_external_url", url),
  openPathInExplorer: (path: string) => call<{ status: string }>("open_path_in_explorer", path),
  minimizeWindow: () => call<{ status: string }>("minimize_window"),
  maximizeWindow: () => call<{ status: string; maximized?: boolean }>("maximize_window"),
  closeWindow: () => call<{ status: string }>("close_window"),

  // ── Workspaces ────────────────────────────
  getWorkspaces: () => call<{ status: string; workspaces: Workspace[] }>("get_workspaces"),
  createWorkspace: (p: { name: string; description?: string }) => call<{ status: string; workspace: Workspace }>("create_workspace", p),
  getWorkspace: (id: string) => call<{ status: string; workspace: Workspace }>("get_workspace", id),

  // ── Collections ───────────────────────────
  getCollections: (workspaceId: string) => call<{ status: string; collections: Collection[] }>("get_collections", workspaceId),
  createCollection: (p: { workspace_id: string; name: string; description?: string }) => call<{ status: string; collection: Collection }>("create_collection", p),
  updateCollection: (collectionId: string, p: { name?: string; description?: string }) => call<{ status: string; collection: Collection }>("update_collection", collectionId, p),
  deleteCollection: (collectionId: string) => call<{ status: string }>("delete_collection", collectionId),
  getCollectionFolders: (collectionId: string) => call<{ status: string; folders: CollectionFolder[] }>("get_collection_folders", collectionId),
  createCollectionFolder: (p: { collection_id: string; name: string; parent_id?: string }) => call<{ status: string; folder: any }>("create_collection_folder", p),
  updateCollectionFolder: (folderId: string, p: { name: string }) => call<{ status: string; folder: any }>("update_collection_folder", folderId, p),
  deleteCollectionFolder: (folderId: string) => call<{ status: string }>("delete_collection_folder", folderId),
  getCollectionRequests: (collectionId: string) => call<{ status: string; requests: SavedRequest[] }>("get_collection_requests", collectionId),
  saveRequest: (p: { workspace_id?: string; collection_id?: string; collection_name?: string; folder_id?: string; name: string; method: string; url: string; configuration?: object }) => call<{ status: string; request: SavedRequest }>("save_request", p),
  getSavedRequest: (requestId: string) => call<{ status: string; request: SavedRequest }>("get_saved_request", requestId),
  updateSavedRequest: (requestId: string, p: object) => call<{ status: string; request: SavedRequest }>("update_saved_request", requestId, p),
  deleteSavedRequest: (requestId: string) => call<{ status: string }>("delete_saved_request", requestId),

  // ── Environments ──────────────────────────
  getEnvironments: (workspaceId: string) => call<{ status: string; environments: any[] }>("get_environments", workspaceId),
  createEnvironment: (p: { workspace_id: string; name: string; is_active?: boolean }) => call<{ status: string; environment: any }>("create_environment", p),
  updateEnvironment: (environmentId: string, p: { name?: string; is_active?: boolean }) => call<{ status: string; environment: any }>("update_environment", environmentId, p),
  deleteEnvironment: (environmentId: string) => call<{ status: string }>("delete_environment", environmentId),
  setEnvironmentVariable: (p: { environment_id: string; key: string; value: string; is_secret?: boolean; is_enabled?: boolean }) => call<{ status: string; variable: any }>("set_environment_variable", p),
  deleteEnvironmentVariable: (environmentId: string, variableId: string) => call<{ status: string }>("delete_environment_variable", environmentId, variableId),
  getEnvironmentVariableSecret: (environmentId: string, variableId: string) => call<{ status: string; value: string }>("get_environment_variable_secret", environmentId, variableId),
  duplicateEnvironment: (environmentId: string, name?: string) => call<{ status: string; environment: any }>("duplicate_environment", environmentId, name),

  // ── Requests ──────────────────────────────
  sendRequest: (p: object) => call<SendResult>("send_request", p),
  cancelTask: (taskId: string) => call("cancel_task", taskId),
  chooseFile: () =>
    call<{
      status: string;
      file?: {
        path: string;
        name: string;
        mime_type: string;
        fileData: string;
      };
    }>("choose_file"),
  saveFile: (content: string, defaultFilename = "download.txt", fileTypes?: string[]) =>
    call<{ status: string; path?: string; error?: string }>("save_file", content, defaultFilename, fileTypes),

  // ── History ───────────────────────────────
  getRequestHistory: (workspaceId?: string, page = 1, pageSize = 50) =>
    call<{ status: string; items: any[]; total: number }>("get_request_history", workspaceId, page, pageSize),
  clearRequestHistory: (workspaceId?: string) => call<{ status: string; deleted_count: number }>("clear_request_history", workspaceId),
  deleteHistoryItem: (id: string, workspaceId?: string) => call<{ status: string; deleted: boolean }>("delete_history_item", id, workspaceId),
  recordHistory: (payload: {
    request_snapshot: Record<string, unknown>;
    response_metadata: Record<string, unknown>;
    duration_ms: number;
    workspace_id?: string;
  }) => call<{ status: string }>("record_history", payload),

  // ── Workflows ─────────────────────────────
  listWorkflows: (workspaceId: string) => call("list_workflows", { workspace_id: workspaceId }),
  getWorkflows: (workspaceId: string) => call("list_workflows", { workspace_id: workspaceId }),
  createWorkflow: (p: object) => call("create_workflow", p),
  getWorkflow: (id: string) => call("get_workflow", { workflow_id: id }),
  updateWorkflow: (p: object) => call("update_workflow", p),
  deleteWorkflow: (p: object | string) => call("delete_workflow", typeof p === "string" ? { workflow_id: p } : p),
  runWorkflow: (p: object) => call("run_workflow", p),
  getWorkflowRuns: (workflowId: string, limit = 30) => call("get_workflow_runs", { workflow_id: workflowId, limit }),
  deleteWorkflowRun: (runId: string) => call("delete_workflow_run", { run_id: runId }),
  clearWorkflowRuns: (workflowId: string) => call("clear_workflow_runs", { workflow_id: workflowId }),
  runWorkflowStep: (p: object) => call("run_workflow_step", p),

  // ── Protocols ─────────────────────────────
  websocketConnect: (p: object) => call("websocket_connect", p),
  websocketSend: (p: object) => call("websocket_send", p),
  websocketPoll: (id: string, sinceIndex = 0) => call("websocket_poll", { session_id: id, connection_id: id, since_index: sinceIndex }),
  websocketDisconnect: (id: string) => call("websocket_disconnect", { session_id: id, connection_id: id }),
  graphqlExecute: (p: object) => call("execute_graphql", p),
  graphqlIntrospect: (url: string) => call("introspect_graphql", { url }),
  sseConnect: (p: object) => call("sse_connect", p),
  ssePoll: (id: string, sinceIndex = 0) => call("sse_poll", { session_id: id, connection_id: id, since_index: sinceIndex }),
  sseDisconnect: (id: string) => call("sse_disconnect", { session_id: id, connection_id: id }),

  // ── Mock Server ───────────────────────────
  startMockServer: (p: object) => call("start_mock_server", p),
  stopMockServer: (p?: object) => call("stop_mock_server", p ?? {}),
  getMockServerStatus: () => call("get_mock_server_status"),
  getMockServerLog: () => call("get_mock_server_log"),
  updateMockRoutes: (p: object) => call("update_mock_routes", p),
  clearMockRequestsLog: () => call("clear_mock_requests_log"),
};

// ── Types ──────────────────────────────────────
export interface SystemInfo {
  app_name: string;
  version: string;
  release_channel: string;
  build: string;
  tagline: string;
  organization: string;
  platform: string;
  os_release: string;
  architecture: string;
  python_version: string;
  data_dir: string;
  database_path: string;
  backups_dir?: string;
  logs_dir: string;
  certs_dir?: string;
  keyring_status: string;
  github_url: string;
  discord_url: string;
  docs_url: string;
  issues_url: string;
  org_url: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
}

export interface WindowState {
  width?: number;
  height?: number;
  x?: number | null;
  y?: number | null;
  is_maximized?: boolean;
  accent_color?: string;
  sidebar_width?: number;
  layout?: Record<string, unknown>;
}

export interface CertificateInfo {
  filename: string;
  path: string;
  extension: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
}

export interface LogsResult {
  status: string;
  logs?: string;
  lines?: number;
  total_lines?: number;
  path?: string;
  error?: string;
}

export interface StorageStats {
  database_path: string;
  size_bytes: number;
  size_formatted: string;
  workspace_count: number;
  collection_count: number;
  request_count: number;
  history_count: number;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Collection {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  requests?: SavedRequest[];
  folders?: CollectionFolder[];
}

export interface CollectionFolder {
  id: string;
  collection_id: string;
  parent_id?: string | null;
  parent_folder_id?: string | null;
  name: string;
  requests?: SavedRequest[];
}

export interface SavedRequest {
  id: string;
  collection_id: string;
  folder_id?: string;
  name: string;
  method: string;
  url: string;
  configuration: RequestConfig;
}

export interface RequestConfig {
  headers?: KVPair[];
  params?: KVPair[];
  body?: RequestBody;
  auth?: RequestAuth;
}

export interface KVPair {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface RequestBody {
  type: "none" | "json" | "raw" | "form" | "multipart";
  content?: string;
}

export interface RequestAuth {
  type: "none" | "bearer" | "basic" | "api_key";
  configuration?: Record<string, string>;
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
}

export interface SendResult {
  status: "completed" | "failed" | "cancelled";
  task_id: string;
  response?: {
    status_code: number;
    status_text: string;
    duration_ms: number;
    size_bytes: number;
    headers: Record<string, string>;
    body: { type: string; data: unknown; raw?: string };
  };
  error?: { code: string; message: string };
}

