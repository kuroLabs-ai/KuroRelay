// ─────────────────────────────────────────────────────────────
// Kuro Engine — Full Tools Registry & Execution Dispatcher
// Deep SQLite Database & UI Integration
// ─────────────────────────────────────────────────────────────

import { bridge, type KVPair } from "../../bridge/client";
import { useAppStore, type MockRouteDraft } from "../../stores/appStore";
import { invalidateCollectionLoads, loadCollectionsWithFolders } from "../../lib/collectionData";
import type { KuroToolDef, KuroToolResult } from "./types";

export const KURO_TOOLS: KuroToolDef[] = [
  // ── 1. UI Control Tools ───────────────────────────────────────
  {
    name: "ui_get_current_screen",
    description: "Inspect the current UI state, active tab, active module, open tabs, and recent response data.",
    category: "ui",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ui_update_active_request",
    description: "Update the fields of the active request in the editor (URL, HTTP method, headers, query parameters, auth, body). Automatically opens a tab if none is open and navigates to Request Builder.",
    category: "ui",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The new URL for the active request (e.g., https://httpbin.org/get)" },
        method: {
          type: "string",
          description: "HTTP Method",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        },
        params: {
          type: "string",
          description: "JSON array or object of query params. E.g. [{\"key\":\"q\", \"value\":\"search\", \"enabled\":true}] or {\"limit\": 10}",
        },
        headers: {
          type: "string",
          description: "JSON array or object of headers. E.g. [{\"key\":\"Content-Type\", \"value\":\"application/json\", \"enabled\":true}] or {\"Accept\": \"application/json\"}",
        },
        body_mode: {
          type: "string",
          description: "Body type/mode",
          enum: ["none", "json", "raw", "form", "multipart"],
        },
        body_content: {
          type: "string",
          description: "Request body content (stringified JSON or raw string)",
        },
        auth_type: {
          type: "string",
          description: "Auth type",
          enum: ["none", "bearer", "basic", "api_key"],
        },
        auth_bearer_token: {
          type: "string",
          description: "Bearer token string when auth_type is bearer",
        },
        name: {
          type: "string",
          description: "Tab title / request label",
        },
      },
    },
  },
  {
    name: "ui_open_new_tab",
    description: "Open a brand new request tab in the editor with given method, URL, and name, and switches to the Request Builder.",
    category: "ui",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tab title" },
        method: { type: "string", description: "HTTP method (GET, POST, etc.)" },
        url: { type: "string", description: "Initial URL" },
        protocol: {
          type: "string",
          description: "Protocol",
          enum: ["http", "websocket", "graphql", "sse"],
        },
      },
    },
  },
  {
    name: "ui_close_tab",
    description: "Close an open tab in the editor by tab ID or closes active tab if omitted.",
    category: "ui",
    parameters: {
      type: "object",
      properties: {
        tab_id: { type: "string", description: "Optional tab ID to close" },
      },
    },
  },
  {
    name: "ui_switch_module",
    description: "Switch the visible screen view (Request Builder, Collections, History, Workflows, Mock Server, Environments, Settings).",
    category: "ui",
    parameters: {
      type: "object",
      properties: {
        module: {
          type: "string",
          description: "Target module to navigate to",
          enum: ["request", "collections", "environments", "history", "workflows", "mock", "settings"],
        },
      },
      required: ["module"],
    },
  },
  {
    name: "ui_send_active_request",
    description: "Click 'Send' on the active request tab in the editor, execute it through Python bridge, display the response on screen, and return the execution result.",
    category: "ui",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ── 2. Request CRUD in SQLite (Bridge) ────────────────────────
  {
    name: "bridge_list_requests",
    description: "List all saved requests stored in SQLite across collections with their IDs, names, methods, and URLs.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        collection_id_or_name: { type: "string", description: "Optional collection filter by ID or name" },
      },
    },
  },
  {
    name: "bridge_save_request",
    description: "Save a new request to a collection or folder in the SQLite database and sync with UI.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Request name" },
        method: { type: "string", description: "HTTP method" },
        url: { type: "string", description: "Request URL" },
        collection_id_or_name: { type: "string", description: "Target collection ID or collection name" },
        folder_id: { type: "string", description: "Optional target folder ID" },
        configuration_json: { type: "string", description: "Optional full request configuration JSON string" },
      },
      required: ["name", "method", "url"],
    },
  },
  {
    name: "bridge_update_request",
    description: "Edit / update an existing saved request in the SQLite database (can match by request ID or request name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        request_id_or_name: { type: "string", description: "Request ID or exact name of the request to edit" },
        name: { type: "string", description: "New name for the request" },
        method: { type: "string", description: "New HTTP method" },
        url: { type: "string", description: "New URL" },
        configuration_json: { type: "string", description: "New configuration JSON string (headers, params, body, etc.)" },
      },
      required: ["request_id_or_name"],
    },
  },
  {
    name: "bridge_delete_request",
    description: "Delete a saved request permanently from SQLite database (can match by request ID or request name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        request_id_or_name: { type: "string", description: "Request ID or exact name of the request to delete" },
      },
      required: ["request_id_or_name"],
    },
  },

  // ── 3. Collection & Folder CRUD in SQLite ─────────────────────
  {
    name: "bridge_list_collections",
    description: "Get all collections, folders, and saved requests in the active workspace from SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bridge_create_collection",
    description: "Create a new collection in SQLite database and sync it immediately to the UI sidebar and Collections view.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Collection name" },
        description: { type: "string", description: "Optional collection description" },
      },
      required: ["name"],
    },
  },
  {
    name: "bridge_update_collection",
    description: "Edit / rename an existing collection in SQLite database (can match by ID or name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        collection_id_or_name: { type: "string", description: "Collection ID or exact collection name to update" },
        name: { type: "string", description: "New collection name" },
        description: { type: "string", description: "New description" },
      },
      required: ["collection_id_or_name"],
    },
  },
  {
    name: "bridge_delete_collection",
    description: "Delete a collection and all its requests permanently from SQLite database (can match by ID or name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        collection_id_or_name: { type: "string", description: "Collection ID or exact name to delete" },
      },
      required: ["collection_id_or_name"],
    },
  },
  {
    name: "bridge_create_folder",
    description: "Create a folder inside a collection in SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        collection_id_or_name: { type: "string", description: "Target collection ID or name" },
        name: { type: "string", description: "Folder name" },
        parent_folder_id: { type: "string", description: "Optional parent folder ID for nesting" },
      },
      required: ["collection_id_or_name", "name"],
    },
  },
  {
    name: "bridge_delete_folder",
    description: "Delete a folder from a collection in SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        folder_id: { type: "string", description: "Folder ID to delete" },
      },
      required: ["folder_id"],
    },
  },

  // ── 4. Environments & Variables CRUD in SQLite ───────────────
  {
    name: "bridge_list_environments",
    description: "List all environments and active variables in the workspace from SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bridge_create_environment",
    description: "Create a new environment in SQLite and sync it to the UI.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Environment name (e.g. Staging, Production, Local)" },
        is_active: { type: "boolean", description: "Whether to activate this environment immediately" },
      },
      required: ["name"],
    },
  },
  {
    name: "bridge_delete_environment",
    description: "Delete an environment from SQLite (can match by ID or name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        environment_id_or_name: { type: "string", description: "Environment ID or name to delete" },
      },
      required: ["environment_id_or_name"],
    },
  },
  {
    name: "bridge_set_environment_variable",
    description: "Set or update an environment variable in SQLite and sync with the active environment.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        environment_id_or_name: { type: "string", description: "Optional environment ID or name. If omitted, uses active environment." },
        key: { type: "string", description: "Variable key (e.g., API_URL, TOKEN, USER_ID)" },
        value: { type: "string", description: "Variable value" },
        is_secret: { type: "boolean", description: "Whether to mask as secret" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "bridge_delete_environment_variable",
    description: "Delete an environment variable from an environment in SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        environment_id: { type: "string", description: "Environment ID" },
        variable_id_or_key: { type: "string", description: "Variable ID or variable key name to remove" },
      },
      required: ["environment_id", "variable_id_or_key"],
    },
  },

  // ── 5. Mock Server Full Control Tools ─────────────────────────
  {
    name: "mock_list_routes",
    description: "List all mock routes currently configured in the Mock Server, plus server running state, port, and URL.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "mock_add_route",
    description: "Add a new mock endpoint in the Mock Server (e.g. POST /api/v1/users, status 201, custom body). Saves to store, syncs to Python, and navigates to Mock Server view.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Endpoint path (e.g. /api/users, /health, /graphql)" },
        method: {
          type: "string",
          description: "HTTP Method",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"],
        },
        protocol: {
          type: "string",
          description: "Protocol",
          enum: ["rest", "graphql", "sse", "websocket"],
        },
        status_code: { type: "number", description: "HTTP status code (default: 200)" },
        body: { type: "string", description: "Response body (JSON string or text)" },
        headers_json: { type: "string", description: "Response headers JSON string" },
        delay_ms: { type: "number", description: "Response delay in ms (default: 0)" },
        enabled: { type: "boolean", description: "Whether endpoint is enabled (default: true)" },
      },
      required: ["path"],
    },
  },
  {
    name: "mock_update_route",
    description: "Edit / update an existing mock endpoint (can match by route ID or path or method:path). Updates status code, response body, headers, or delay.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        route_id_or_path: { type: "string", description: "Route ID or endpoint path (e.g. '/api/users' or 'POST:/api/users')" },
        path: { type: "string", description: "New path" },
        method: { type: "string", description: "New HTTP method" },
        status_code: { type: "number", description: "New status code" },
        body: { type: "string", description: "New response body" },
        headers_json: { type: "string", description: "New headers JSON string" },
        delay_ms: { type: "number", description: "New delay in ms" },
        enabled: { type: "boolean", description: "Enable or disable route" },
      },
      required: ["route_id_or_path"],
    },
  },
  {
    name: "mock_delete_route",
    description: "Delete a mock endpoint from the Mock Server (can match by route ID or path).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        route_id_or_path: { type: "string", description: "Route ID or path to delete" },
      },
      required: ["route_id_or_path"],
    },
  },
  {
    name: "mock_start_server",
    description: "Start the local mock server on specified port (default: 4010) with all configured routes synced.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        port: { type: "number", description: "Port number (default: 4010)" },
      },
    },
  },
  {
    name: "mock_stop_server",
    description: "Stop the running local mock server.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "mock_get_logs",
    description: "Get the request logs captured by the mock server (incoming paths, methods, status codes, timestamps).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ── 6. Workflows & History Tools ──────────────────────────────
  {
    name: "bridge_list_workflows",
    description: "List all automated workflow chains in the active workspace.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bridge_create_workflow",
    description: "Create a new automated multi-step workflow in SQLite and view it in Workflow Studio.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Workflow name" },
        description: { type: "string", description: "Optional description" },
        steps_json: { type: "string", description: "Optional JSON array of workflow steps. Each step: { name, request_id?, url?, method?, headers?, body?, assertions? }" },
      },
      required: ["name"],
    },
  },
  {
    name: "bridge_update_workflow",
    description: "Edit / rename an existing workflow or update its steps in SQLite (can match by ID or name).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        workflow_id_or_name: { type: "string", description: "Workflow ID or exact name to update" },
        name: { type: "string", description: "New workflow name" },
        description: { type: "string", description: "New description" },
        steps_json: { type: "string", description: "New JSON array of workflow steps (replaces all existing steps)" },
      },
      required: ["workflow_id_or_name"],
    },
  },
  {
    name: "bridge_delete_workflow",
    description: "Delete a workflow permanently from SQLite (can match by ID or name). Also clears all its run history.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        workflow_id_or_name: { type: "string", description: "Workflow ID or exact name to delete" },
      },
      required: ["workflow_id_or_name"],
    },
  },
  {
    name: "bridge_run_workflow",
    description: "Run an automated multi-step workflow by its ID or name.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        workflow_id_or_name: { type: "string", description: "ID or name of the workflow to execute" },
      },
      required: ["workflow_id_or_name"],
    },
  },
  {
    name: "bridge_get_workflow_runs",
    description: "Get the execution history / run logs of a specific workflow. Returns each run's status, duration, step results, errors, and timestamps.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        workflow_id_or_name: { type: "string", description: "Workflow ID or name to get run history for" },
        limit: { type: "number", description: "Max number of runs to return (default: 20)" },
      },
      required: ["workflow_id_or_name"],
    },
  },
  {
    name: "bridge_delete_workflow_run",
    description: "Delete a single workflow run log entry by its run ID.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run ID to delete" },
      },
      required: ["run_id"],
    },
  },
  {
    name: "bridge_get_history",
    description: "Fetch recent execution history logs and past errors from SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default 1)" },
        page_size: { type: "number", description: "Items per page (default 20)" },
      },
    },
  },
  {
    name: "bridge_delete_history_item",
    description: "Delete a single history entry from SQLite by ID.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        history_id: { type: "string", description: "History entry ID to delete" },
      },
      required: ["history_id"],
    },
  },
  {
    name: "bridge_clear_history",
    description: "Clear past request execution history in SQLite.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // ── 7. Global Settings Control ────────────────────────────────
  {
    name: "bridge_update_app_setting",
    description: "Update an application setting in SQLite preferences (e.g. default_timeout_ms, follow_redirects, verify_tls, max_redirects, proxy_mode, user_agent).",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Setting key" },
        value: { type: "string", description: "Setting value" },
      },
      required: ["key", "value"],
    },
  },

  // ── 8. Direct HTTP Execution ──────────────────────────────────
  {
    name: "bridge_send_http",
    description: "Directly execute any HTTP request through KuroRelay's Python HTTP engine without changing the active UI tab.",
    category: "bridge",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", description: "HTTP Method (GET, POST, etc.)" },
        url: { type: "string", description: "Target URL" },
        headers: { type: "string", description: "JSON string of header key-value map or array" },
        params: { type: "string", description: "JSON string of query params key-value map or array" },
        body: { type: "string", description: "Optional raw body or JSON string" },
        timeout_ms: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
      },
      required: ["method", "url"],
    },
  },

  // ── 8. Code Snippet Generator ─────────────────────────────────
  {
    name: "code_generate_snippet",
    description: "Generate a production-ready code snippet (cURL, Python httpx, Node.js fetch, Go, Rust) for the active request or specified URL/headers/body.",
    category: "utility",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: "Target programming language",
          enum: ["curl", "python", "javascript", "go", "rust"],
        },
        url: { type: "string", description: "Optional URL override" },
        method: { type: "string", description: "Optional method override" },
      },
      required: ["language"],
    },
  },
];

// Helper to parse JSON safely
function safeJson(val: any, fallback: any = {}) {
  if (typeof val !== "string") return val ?? fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// Helper to resolve a valid SQLite workspace ID
async function resolveWorkspaceId(): Promise<string> {
  const store = useAppStore.getState();
  if (store.activeWorkspaceId) return store.activeWorkspaceId;

  try {
    const res = await bridge.getWorkspaces();
    if (res?.workspaces && res.workspaces.length > 0) {
      const id = res.workspaces[0].id;
      store.setActiveWorkspace(id);
      return id;
    }
    const created = await bridge.createWorkspace({ name: "Default Workspace" });
    if (created?.workspace?.id) {
      store.setActiveWorkspace(created.workspace.id);
      return created.workspace.id;
    }
  } catch (err) {
    console.error("Failed to resolve workspace id from bridge:", err);
  }
  return "default";
}

// Helper to convert object or array into KVPair[]
function normalizeToKVPairs(input: any, prefix = "kv"): KVPair[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((item, idx) => ({
      id: item.id || `${prefix}_${Date.now()}_${idx}`,
      key: item.key || "",
      value: item.value !== undefined ? String(item.value) : "",
      enabled: item.enabled !== false,
      description: item.description || "",
    }));
  }
  if (typeof input === "object") {
    return Object.entries(input).map(([k, v], idx) => ({
      id: `${prefix}_${Date.now()}_${idx}`,
      key: k,
      value: String(v),
      enabled: true,
      description: "",
    }));
  }
  return [];
}

// Convert MockRouteDraft array to payload expected by Python bridge
function toRoutePayload(routes: MockRouteDraft[]) {
  return routes.map((route) => {
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(route.headers_json || "{}");
    } catch {
      headers = { "Content-Type": "application/json" };
    }
    return {
      id: route.id,
      protocol: route.protocol,
      method: route.method,
      path: route.path,
      status_code: route.status_code || 200,
      headers,
      body: route.body || "",
      events: [],
      messages: [],
      echo_messages: route.echo_messages || false,
      delay_ms: route.delay_ms || 0,
      enabled: route.enabled !== false,
    };
  });
}

// ── Tool Execution Dispatcher ──────────────────────────────────
export async function executeKuroTool(
  callId: string,
  name: string,
  args: Record<string, any>
): Promise<KuroToolResult> {
  const startTime = performance.now();
  const store = useAppStore.getState();

  try {
    let resultData: any;

    switch (name) {
      // ── 1. UI TOOLS ───────────────────────────────────────────
      case "ui_get_current_screen": {
        const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
        resultData = {
          activeModule: store.activeModule,
          activeWorkspaceId: store.activeWorkspaceId,
          activeTab: activeTab
            ? {
                id: activeTab.id,
                name: activeTab.name,
                method: activeTab.method,
                url: activeTab.url,
                protocol: activeTab.protocol,
                params: activeTab.params,
                headers: activeTab.headers,
                auth: activeTab.auth,
                body: activeTab.body,
                hasResponse: !!activeTab.response,
              }
            : null,
          openTabsCount: store.tabs.length,
          collectionsCount: store.collections.length,
          activeEnvironmentId: store.activeEnvironmentId,
        };
        break;
      }

      case "ui_update_active_request": {
        let tabId = store.activeTabId;
        if (!tabId || store.tabs.length === 0) {
          tabId = store.openTab({
            name: args.name || "Kuro Request",
            method: (args.method || "GET").toUpperCase(),
            url: args.url || "",
            protocol: "http",
          });
        }

        store.setActiveModule("request");
        const activeTab = store.tabs.find((t) => t.id === tabId);
        const patch: any = { isDirty: true };
        if (args.name) patch.name = args.name;
        if (args.url !== undefined) patch.url = args.url;
        if (args.method) patch.method = args.method.toUpperCase();

        if (args.params !== undefined) {
          const parsedParams = safeJson(args.params, null);
          patch.params = normalizeToKVPairs(parsedParams, "param");
        }

        if (args.headers !== undefined) {
          const parsedHeaders = safeJson(args.headers, null);
          patch.headers = normalizeToKVPairs(parsedHeaders, "hdr");
        }

        if (args.body_mode || args.body_content !== undefined) {
          patch.body = {
            type: args.body_mode || activeTab?.body.type || "json",
            content: args.body_content !== undefined ? args.body_content : activeTab?.body.content || "",
          };
        }

        if (args.auth_type) {
          patch.auth = {
            ...activeTab?.auth,
            type: args.auth_type,
            token: args.auth_bearer_token !== undefined ? args.auth_bearer_token : activeTab?.auth.token,
          };
        }

        store.updateTab(tabId, patch);
        resultData = {
          status: "updated",
          tabId,
          updatedFields: Object.keys(patch),
          activeUrl: patch.url || activeTab?.url,
          activeMethod: patch.method || activeTab?.method,
        };
        break;
      }

      case "ui_open_new_tab": {
        const newId = store.openTab({
          name: args.name || "New Request",
          method: (args.method || "GET").toUpperCase(),
          url: args.url || "",
          protocol: args.protocol || "http",
        });
        store.setActiveModule("request");
        resultData = { message: "New tab opened in Request Builder", tabId: newId };
        break;
      }

      case "ui_close_tab": {
        const targetId = args.tab_id || store.activeTabId;
        if (targetId) {
          store.closeTab(targetId);
          resultData = { status: "closed", tabId: targetId };
        } else {
          resultData = { status: "no_tab_to_close" };
        }
        break;
      }

      case "ui_switch_module": {
        store.setActiveModule(args.module);
        resultData = { message: `Navigated to ${args.module} view` };
        break;
      }

      case "ui_send_active_request": {
        let tabId = store.activeTabId;
        if (!tabId && store.tabs.length > 0) {
          tabId = store.tabs[0].id;
          store.setActiveTab(tabId);
        }
        const activeTab = store.tabs.find((t) => t.id === tabId);
        if (!activeTab) throw new Error("No request tab found in editor to send.");
        if (!activeTab.url) throw new Error("Cannot send request with empty URL. Please specify a URL first.");

        store.setActiveModule("request");
        store.updateTab(activeTab.id, { isLoading: true });

        try {
          const headersMap: Record<string, string> = {};
          activeTab.headers
            .filter((h) => h.enabled && h.key)
            .forEach((h) => {
              headersMap[h.key] = h.value;
            });

          const paramsMap: Record<string, string> = {};
          activeTab.params
            .filter((p) => p.enabled && p.key)
            .forEach((p) => {
              paramsMap[p.key] = p.value;
            });

          const payload = {
            method: activeTab.method,
            url: activeTab.url,
            headers: headersMap,
            params: paramsMap,
            body: activeTab.body.type !== "none" ? activeTab.body.content : undefined,
            auth: activeTab.auth.type !== "none" ? activeTab.auth : undefined,
            timeout_ms: activeTab.options.timeout_ms || 30000,
            allow_private_network: true,
          };

          const res = await bridge.sendRequest(payload);
          store.updateTab(activeTab.id, {
            isLoading: false,
            response: res,
            isDirty: false,
          });

          resultData = {
            status: "success",
            statusCode: (res as any)?.response?.status_code || (res as any)?.status_code || (res as any)?.status,
            durationMs: (res as any)?.response?.duration_ms || (res as any)?.duration_ms,
            headers: (res as any)?.response?.headers || (res as any)?.headers,
            bodyPreview: typeof (res as any)?.response?.body?.data === "string"
              ? (res as any).response.body.data.slice(0, 500)
              : typeof (res as any)?.body === "string"
              ? (res as any).body.slice(0, 500)
              : (res as any)?.response?.body || (res as any)?.body,
          };
        } catch (err: any) {
          store.updateTab(activeTab.id, {
            isLoading: false,
            response: { error: err.message || "Request execution failed" },
          });
          throw err;
        }
        break;
      }

      // ── 2. REQUEST CRUD IN SQLITE ─────────────────────────────
      case "bridge_list_requests": {
        const wsId = await resolveWorkspaceId();
        const allCollections = await loadCollectionsWithFolders(wsId);
        let allRequests: any[] = [];
        for (const col of allCollections) {
          const colMatches = !args.collection_id_or_name ||
            col.id === args.collection_id_or_name ||
            col.name.toLowerCase() === args.collection_id_or_name.toLowerCase();

          if (colMatches) {
            const reqs = (col.requests || []).map((r) => ({
              ...r,
              collection_name: col.name,
              collection_id: col.id,
            }));
            allRequests = allRequests.concat(reqs);
          }
        }
        resultData = { count: allRequests.length, requests: allRequests };
        break;
      }

      case "bridge_save_request": {
        const wsId = await resolveWorkspaceId();
        let targetCollectionId: string | undefined;

        if (args.collection_id_or_name) {
          const match = store.collections.find(
            (c) =>
              c.id === args.collection_id_or_name ||
              c.name.toLowerCase() === args.collection_id_or_name.toLowerCase()
          );
          targetCollectionId = match?.id || args.collection_id_or_name;
        }

        if (!targetCollectionId) {
          if (store.collections.length > 0) {
            targetCollectionId = store.collections[0].id;
          } else {
            const newCol = await bridge.createCollection({
              workspace_id: wsId,
              name: "Default Collection",
              description: "Created automatically by Kuro",
            });
            targetCollectionId = newCol.collection?.id;
          }
        }

        let config = args.configuration_json ? safeJson(args.configuration_json, {}) : undefined;
        if (!config && store.activeTabId) {
          const tab = store.tabs.find((t) => t.id === store.activeTabId);
          if (tab) {
            config = {
              params: tab.params,
              headers: tab.headers,
              body: tab.body,
              auth: tab.auth,
              options: tab.options,
            };
          }
        }

        const res = await bridge.saveRequest({
          workspace_id: wsId,
          collection_id: targetCollectionId,
          folder_id: args.folder_id,
          name: args.name,
          method: args.method.toUpperCase(),
          url: args.url,
          configuration: config,
        });

        if (res.status === "ok" && res.request) {
          invalidateCollectionLoads(wsId);
          const fullCollections = await loadCollectionsWithFolders(wsId);
          store.setCollectionsForWorkspace(wsId, fullCollections);

          if (store.activeTabId) {
            store.updateTab(store.activeTabId, {
              savedRequestId: res.request.id,
              collectionId: targetCollectionId,
              name: res.request.name,
              isDirty: false,
            });
          }
        }

        resultData = {
          status: "saved",
          requestId: res.request?.id,
          name: res.request?.name,
          collectionId: targetCollectionId,
        };
        break;
      }

      case "bridge_update_request": {
        const wsId = await resolveWorkspaceId();
        // Find request by ID or Name across collections
        let targetId = args.request_id_or_name;
        for (const col of store.collections) {
          const found = col.requests?.find(
            (r) => r.id === targetId || r.name.toLowerCase() === targetId.toLowerCase()
          );
          if (found) {
            targetId = found.id;
            break;
          }
        }

        const payload: any = {};
        if (args.name) payload.name = args.name;
        if (args.method) payload.method = args.method.toUpperCase();
        if (args.url) payload.url = args.url;
        if (args.configuration_json) payload.configuration = safeJson(args.configuration_json);

        const res = await bridge.updateSavedRequest(targetId, payload);
        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);

        // Update tab if open
        const openTab = store.tabs.find((t) => t.savedRequestId === targetId);
        if (openTab) {
          store.updateTab(openTab.id, {
            name: payload.name || openTab.name,
            method: payload.method || openTab.method,
            url: payload.url !== undefined ? payload.url : openTab.url,
          });
        }

        resultData = { status: "updated", request: res.request || payload };
        break;
      }

      case "bridge_delete_request": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.request_id_or_name;
        let targetName = targetId;

        for (const col of store.collections) {
          const found = col.requests?.find(
            (r) => r.id === targetId || r.name.toLowerCase() === targetId.toLowerCase()
          );
          if (found) {
            targetId = found.id;
            targetName = found.name;
            break;
          }
        }

        await bridge.deleteSavedRequest(targetId);
        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);

        resultData = { status: "deleted", requestId: targetId, name: targetName };
        break;
      }

      // ── 3. COLLECTION & FOLDER CRUD IN SQLITE ─────────────────
      case "bridge_list_collections": {
        const wsId = await resolveWorkspaceId();
        const res = await loadCollectionsWithFolders(wsId);
        resultData = { count: res.length, collections: res };
        break;
      }

      case "bridge_create_collection": {
        const wsId = await resolveWorkspaceId();
        const res = await bridge.createCollection({
          workspace_id: wsId,
          name: args.name,
          description: args.description || "",
        });

        if (res.status === "ok" && res.collection) {
          invalidateCollectionLoads(wsId);
          const fullCollections = await loadCollectionsWithFolders(wsId);
          store.setCollectionsForWorkspace(wsId, fullCollections);
          store.setSelectedCollectionId(res.collection.id);
        }

        resultData = {
          status: "created",
          collectionId: res.collection?.id,
          name: res.collection?.name,
          workspaceId: wsId,
        };
        break;
      }

      case "bridge_update_collection": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.collection_id_or_name;
        const match = store.collections.find(
          (c) => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) targetId = match.id;

        const res = await bridge.updateCollection(targetId, {
          name: args.name,
          description: args.description,
        });

        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);

        resultData = { status: "updated", collection: res.collection };
        break;
      }

      case "bridge_delete_collection": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.collection_id_or_name;
        let targetName = targetId;
        const match = store.collections.find(
          (c) => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) {
          targetId = match.id;
          targetName = match.name;
        }

        await bridge.deleteCollection(targetId);
        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);

        resultData = { status: "deleted", collectionId: targetId, name: targetName };
        break;
      }

      case "bridge_create_folder": {
        const wsId = await resolveWorkspaceId();
        let targetColId = args.collection_id_or_name;
        const match = store.collections.find(
          (c) => c.id === targetColId || c.name.toLowerCase() === targetColId.toLowerCase()
        );
        if (match) targetColId = match.id;

        const res = await bridge.createCollectionFolder({
          collection_id: targetColId,
          name: args.name,
          parent_id: args.parent_folder_id,
        });

        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);

        resultData = { status: "folder_created", folder: res.folder };
        break;
      }

      case "bridge_delete_folder": {
        const wsId = await resolveWorkspaceId();
        await bridge.deleteCollectionFolder(args.folder_id);
        invalidateCollectionLoads(wsId);
        const fullCollections = await loadCollectionsWithFolders(wsId);
        store.setCollectionsForWorkspace(wsId, fullCollections);
        resultData = { status: "folder_deleted", folderId: args.folder_id };
        break;
      }

      // ── 4. ENVIRONMENTS & VARIABLES IN SQLITE ─────────────────
      case "bridge_list_environments": {
        const wsId = await resolveWorkspaceId();
        resultData = await bridge.getEnvironments(wsId);
        break;
      }

      case "bridge_create_environment": {
        const wsId = await resolveWorkspaceId();
        const res = await bridge.createEnvironment({
          workspace_id: wsId,
          name: args.name,
          is_active: args.is_active ?? true,
        });

        const envsRes = await bridge.getEnvironments(wsId);
        if (envsRes.environments) {
          store.setEnvironments(envsRes.environments);
          if (args.is_active || !store.activeEnvironmentId) {
            store.setActiveEnvironment(res.environment?.id || null);
          }
        }

        resultData = {
          status: "created",
          environmentId: res.environment?.id,
          name: res.environment?.name,
        };
        break;
      }

      case "bridge_delete_environment": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.environment_id_or_name;
        const match = store.environments.find(
          (e) => e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) targetId = match.id;

        await bridge.deleteEnvironment(targetId);
        const envsRes = await bridge.getEnvironments(wsId);
        if (envsRes.environments) {
          store.setEnvironments(envsRes.environments);
          if (store.activeEnvironmentId === targetId) {
            store.setActiveEnvironment(envsRes.environments[0]?.id || null);
          }
        }
        resultData = { status: "deleted", environmentId: targetId };
        break;
      }

      case "bridge_set_environment_variable": {
        const wsId = await resolveWorkspaceId();
        let envId = args.environment_id_or_name || store.activeEnvironmentId;

        if (envId) {
          const match = store.environments.find(
            (e) => e.id === envId || e.name.toLowerCase() === envId.toLowerCase()
          );
          if (match) envId = match.id;
        }

        if (!envId) {
          const newEnv = await bridge.createEnvironment({
            workspace_id: wsId,
            name: "Default Environment",
            is_active: true,
          });
          envId = newEnv.environment?.id;
          if (envId) store.setActiveEnvironment(envId);
        }

        if (!envId) throw new Error("Could not determine or create active environment.");

        const res = await bridge.setEnvironmentVariable({
          environment_id: envId,
          key: args.key,
          value: args.value,
          is_secret: !!args.is_secret,
        });

        const envsRes = await bridge.getEnvironments(wsId);
        if (envsRes.environments) {
          store.setEnvironments(envsRes.environments);
        }

        resultData = {
          status: "variable_set",
          environmentId: envId,
          key: args.key,
          value: args.is_secret ? "••••••••" : args.value,
          variableId: res.variable?.id,
        };
        break;
      }

      case "bridge_delete_environment_variable": {
        const wsId = await resolveWorkspaceId();
        await bridge.deleteEnvironmentVariable(args.environment_id, args.variable_id_or_key);
        const envsRes = await bridge.getEnvironments(wsId);
        if (envsRes.environments) store.setEnvironments(envsRes.environments);
        resultData = { status: "deleted", variable: args.variable_id_or_key };
        break;
      }

      // ── 5. MOCK SERVER FULL CONTROL ───────────────────────────
      case "mock_list_routes": {
        const serverStatus: any = await bridge.getMockServerStatus().catch(() => ({}));
        resultData = {
          configuredRoutesCount: store.mockRoutes.length,
          routes: store.mockRoutes.map((r) => ({
            id: r.id,
            protocol: r.protocol,
            method: r.method,
            path: r.path,
            status_code: r.status_code,
            delay_ms: r.delay_ms,
            enabled: r.enabled,
          })),
          serverStatus: {
            isRunning: Boolean(serverStatus?.is_running ?? serverStatus?.running),
            port: serverStatus?.port || 4010,
            baseUrl: `http://localhost:${serverStatus?.port || 4010}`,
          },
        };
        break;
      }

      case "mock_add_route": {
        const protocol = args.protocol || "rest";
        const newRoute: MockRouteDraft = {
          id: crypto.randomUUID(),
          protocol,
          method: (args.method || (protocol === "graphql" ? "POST" : "GET")).toUpperCase(),
          path: args.path.startsWith("/") ? args.path : `/${args.path}`,
          status_code: args.status_code || 200,
          headers_json: args.headers_json || '{\n  "Content-Type": "application/json"\n}',
          body: args.body || '{"status": "ok"}',
          events_json: '[\n  { "event": "message", "data": "hello" }\n]',
          messages_json: '[\n  "connected"\n]',
          echo_messages: false,
          delay_ms: args.delay_ms || 0,
          enabled: args.enabled !== false,
        };

        const updatedRoutes = [...store.mockRoutes, newRoute];
        store.setMockRoutes(updatedRoutes);
        store.saveMockRoutes();

        // Sync with running python mock server if active
        await bridge.updateMockRoutes({ routes: toRoutePayload(updatedRoutes) }).catch(() => {});

        // Switch user to mock view so they see the new endpoint immediately
        store.setActiveModule("mock");

        resultData = {
          status: "route_added",
          routeId: newRoute.id,
          method: newRoute.method,
          path: newRoute.path,
          statusCode: newRoute.status_code,
          totalRoutes: updatedRoutes.length,
        };
        break;
      }

      case "mock_update_route": {
        const target = args.route_id_or_path;
        const existing = store.mockRoutes.find(
          (r) =>
            r.id === target ||
            r.path === target ||
            `${r.method}:${r.path}` === target ||
            `${r.method} ${r.path}` === target
        );

        if (!existing) {
          throw new Error(`Mock route not found matching: "${target}". Check mock_list_routes.`);
        }

        const patch: Partial<MockRouteDraft> = {};
        if (args.path) patch.path = args.path.startsWith("/") ? args.path : `/${args.path}`;
        if (args.method) patch.method = args.method.toUpperCase();
        if (args.status_code !== undefined) patch.status_code = Number(args.status_code);
        if (args.body !== undefined) patch.body = args.body;
        if (args.headers_json !== undefined) patch.headers_json = args.headers_json;
        if (args.delay_ms !== undefined) patch.delay_ms = Number(args.delay_ms);
        if (args.enabled !== undefined) patch.enabled = Boolean(args.enabled);

        const updatedRoutes = store.mockRoutes.map((r) =>
          r.id === existing.id ? { ...r, ...patch } : r
        );
        store.setMockRoutes(updatedRoutes);
        store.saveMockRoutes();

        await bridge.updateMockRoutes({ routes: toRoutePayload(updatedRoutes) }).catch(() => {});
        store.setActiveModule("mock");

        resultData = { status: "route_updated", routeId: existing.id, updatedFields: Object.keys(patch) };
        break;
      }

      case "mock_delete_route": {
        const target = args.route_id_or_path;
        const existing = store.mockRoutes.find(
          (r) =>
            r.id === target ||
            r.path === target ||
            `${r.method}:${r.path}` === target ||
            `${r.method} ${r.path}` === target
        );

        if (!existing) {
          throw new Error(`Mock route not found matching: "${target}".`);
        }

        const updatedRoutes = store.mockRoutes.filter((r) => r.id !== existing.id);
        store.setMockRoutes(updatedRoutes);
        store.saveMockRoutes();

        await bridge.updateMockRoutes({ routes: toRoutePayload(updatedRoutes) }).catch(() => {});
        resultData = { status: "route_deleted", routeId: existing.id, path: existing.path };
        break;
      }

      case "mock_start_server": {
        const port = args.port || 4010;
        const payloadRoutes = toRoutePayload(store.mockRoutes);
        const res: any = await bridge.startMockServer({ port, routes: payloadRoutes });
        store.setActiveModule("mock");
        resultData = {
          status: "started",
          port,
          url: `http://localhost:${port}`,
          activeRoutesCount: payloadRoutes.length,
          bridgeResponse: res,
        };
        break;
      }

      case "mock_stop_server": {
        const res = await bridge.stopMockServer();
        resultData = { status: "stopped", bridgeResponse: res };
        break;
      }

      case "mock_get_logs": {
        const statusRes: any = await bridge.getMockServerStatus().catch(() => ({}));
        resultData = {
          logs: statusRes?.requests_log || [],
          isRunning: Boolean(statusRes?.is_running ?? statusRes?.running),
        };
        break;
      }

      // ── 6. WORKFLOWS & HISTORY TOOLS ──────────────────────────
      case "bridge_list_workflows": {
        const wsId = await resolveWorkspaceId();
        resultData = await bridge.listWorkflows(wsId);
        break;
      }

      case "bridge_create_workflow": {
        const wsId = await resolveWorkspaceId();
        const steps = args.steps_json ? safeJson(args.steps_json, []) : [];
        const res: any = await bridge.createWorkflow({
          workspace_id: wsId,
          name: args.name,
          description: args.description || "",
          steps: Array.isArray(steps) ? steps : [],
        });
        const wfsRes: any = await bridge.listWorkflows(wsId);
        if (wfsRes?.workflows) store.setWorkflows(wfsRes.workflows);
        store.setActiveModule("workflows");
        resultData = { status: "workflow_created", workflow: res?.workflow || { name: args.name } };
        break;
      }

      case "bridge_update_workflow": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.workflow_id_or_name;
        const wfsRes: any = await bridge.listWorkflows(wsId);
        const list: any[] = wfsRes?.workflows || [];
        const match = list.find(
          (w: any) => w.id === targetId || w.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) targetId = match.id;

        const payload: any = { workflow_id: targetId };
        if (args.name) payload.name = args.name;
        if (args.description !== undefined) payload.description = args.description;
        if (args.steps_json !== undefined) payload.steps = safeJson(args.steps_json, []);

        const res: any = await bridge.updateWorkflow(payload);
        const refreshed: any = await bridge.listWorkflows(wsId);
        if (refreshed?.workflows) store.setWorkflows(refreshed.workflows);
        store.setActiveModule("workflows");

        resultData = { status: "workflow_updated", workflow: res?.workflow || payload };
        break;
      }

      case "bridge_delete_workflow": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.workflow_id_or_name;
        let targetName = targetId;
        const wfsRes: any = await bridge.listWorkflows(wsId);
        const list: any[] = wfsRes?.workflows || [];
        const match = list.find(
          (w: any) => w.id === targetId || w.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) {
          targetId = match.id;
          targetName = match.name;
        }

        await bridge.deleteWorkflow(targetId);
        const refreshed: any = await bridge.listWorkflows(wsId);
        if (refreshed?.workflows) store.setWorkflows(refreshed.workflows);

        resultData = { status: "workflow_deleted", workflowId: targetId, name: targetName };
        break;
      }

      case "bridge_run_workflow": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.workflow_id_or_name;
        const wfsRes: any = await bridge.listWorkflows(wsId);
        const list: any[] = wfsRes?.workflows || [];
        const match = list.find(
          (w) => w.id === targetId || w.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) targetId = match.id;

        resultData = await bridge.runWorkflow({
          workflow_id: targetId,
          environment_id: store.activeEnvironmentId || undefined,
        });
        break;
      }

      case "bridge_get_workflow_runs": {
        const wsId = await resolveWorkspaceId();
        let targetId = args.workflow_id_or_name;
        const wfsRes: any = await bridge.listWorkflows(wsId);
        const list: any[] = wfsRes?.workflows || [];
        const match = list.find(
          (w: any) => w.id === targetId || w.name.toLowerCase() === targetId.toLowerCase()
        );
        if (match) targetId = match.id;

        resultData = await bridge.getWorkflowRuns(targetId, args.limit || 20);
        break;
      }

      case "bridge_delete_workflow_run": {
        resultData = await bridge.deleteWorkflowRun(args.run_id);
        break;
      }

      case "bridge_get_history": {
        const wsId = store.activeWorkspaceId || undefined;
        resultData = await bridge.getRequestHistory(wsId, args.page || 1, args.page_size || 20);
        break;
      }

      case "bridge_delete_history_item": {
        const wsId = store.activeWorkspaceId || undefined;
        resultData = await bridge.deleteHistoryItem(args.history_id, wsId);
        break;
      }

      case "bridge_clear_history": {
        const wsId = store.activeWorkspaceId || undefined;
        resultData = await bridge.clearRequestHistory(wsId);
        store.setHistory([]);
        break;
      }

      case "bridge_update_app_setting": {
        await bridge.updateSetting(args.key, String(args.value));
        store.updateAppSetting(args.key, String(args.value));
        resultData = { status: "setting_updated", key: args.key, value: String(args.value) };
        break;
      }

      // ── 7. DIRECT HTTP EXECUTION ──────────────────────────────
      case "bridge_send_http": {
        const headers = safeJson(args.headers, {});
        const params = safeJson(args.params, {});
        const payload = {
          method: args.method.toUpperCase(),
          url: args.url,
          headers,
          params,
          body: args.body,
          timeout_ms: args.timeout_ms || 30000,
          allow_private_network: true,
        };
        resultData = await bridge.sendRequest(payload);
        break;
      }

      // ── 8. CODE GENERATION ────────────────────────────────────
      case "code_generate_snippet": {
        const activeTab = store.tabs.find((t) => t.id === store.activeTabId);
        const url = args.url || activeTab?.url || "https://api.example.com/v1/data";
        const method = (args.method || activeTab?.method || "GET").toUpperCase();
        const lang = args.language.toLowerCase();

        let snippet = "";
        if (lang === "curl") {
          snippet = `curl -X ${method} "${url}" \\\n  -H "Accept: application/json"`;
        } else if (lang === "python") {
          snippet = `import httpx\n\nresponse = httpx.request("${method}", "${url}")\nprint(response.status_code)\nprint(response.json())`;
        } else if (lang === "javascript") {
          snippet = `const response = await fetch("${url}", {\n  method: "${method}",\n  headers: { "Accept": "application/json" }\n});\nconst data = await response.json();\nconsole.log(data);`;
        } else if (lang === "go") {
          snippet = `req, err := http.NewRequest("${method}", "${url}", nil)\nresp, err := http.DefaultClient.Do(req)`;
        } else if (lang === "rust") {
          snippet = `let resp = reqwest::Client::new()\n    .${method.toLowerCase()}("${url}")\n    .send()\n    .await?;`;
        }
        resultData = { language: lang, snippet };
        break;
      }

      default:
        throw new Error(`Unknown Kuro tool: ${name}`);
    }

    const durationMs = Math.round(performance.now() - startTime);
    return {
      callId,
      toolName: name,
      success: true,
      result: resultData,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      callId,
      toolName: name,
      success: false,
      result: null,
      error: err.message || String(err),
      durationMs,
    };
  }
}
