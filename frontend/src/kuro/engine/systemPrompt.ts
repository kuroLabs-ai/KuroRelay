// ─────────────────────────────────────────────────────────────
// Kuro Engine — System Prompt & Live UI Context Injector
// ─────────────────────────────────────────────────────────────

import { useAppStore } from "../../stores/appStore";
import type { KuroPersonaMode } from "./types";

export function buildSystemPrompt(persona: KuroPersonaMode = "superhero"): string {
  const store = useAppStore.getState();
  const activeTab = store.tabs.find((t) => t.id === store.activeTabId);

  // Snapshot active tab information
  let activeTabSummary = "None open";
  if (activeTab) {
    const responseSummary = activeTab.response
      ? JSON.stringify(activeTab.response, null, 2).slice(0, 500)
      : "No response yet";

    activeTabSummary = `
- Tab ID: "${activeTab.id}"
- Tab Name: "${activeTab.name}"
- Protocol: ${activeTab.protocol}
- Method: ${activeTab.method}
- URL: "${activeTab.url || "(empty)"}"
- Query Params: ${JSON.stringify(activeTab.params.filter((p) => p.enabled && p.key))}
- Headers: ${JSON.stringify(activeTab.headers.filter((h) => h.enabled && h.key))}
- Auth: Type=${activeTab.auth.type}
- Body Type: ${activeTab.body.type}
- Body Content: ${activeTab.body.content ? activeTab.body.content.slice(0, 300) : "(empty)"}
- Is Dirty: ${activeTab.isDirty}
- Is Loading: ${activeTab.isLoading}
- Last Response Preview: ${responseSummary}
`.trim();
  }

  // Snapshot open tabs list
  const tabsList = store.tabs.map((t) => `"${t.name}" [${t.method} ${t.url || "untitled"}] (id: ${t.id})`).join(", ") || "None";

  // Snapshot active workspace & collections
  const workspaceId = store.activeWorkspaceId || "default";
  const collectionsSummary = store.collections.length > 0
    ? store.collections.map((c) => {
        const reqNames = (c.requests || []).map((r) => `"${r.name}" (${r.method} ${r.url})`).join(", ");
        return `Collection "${c.name}" (id: "${c.id}", requests: [${reqNames || "empty"}])`;
      }).join("\n  ")
    : "No collections loaded";

  // Snapshot active environment
  const activeEnv = store.environments.find((e) => e.id === store.activeEnvironmentId);
  const envSummary = activeEnv
    ? `Active: "${activeEnv.name}" (id: ${activeEnv.id})`
    : "No environment active";

  // Snapshot mock server state
  const mockRoutesSummary = store.mockRoutes.length > 0
    ? store.mockRoutes.map((r) => `[${r.method} ${r.path} -> ${r.status_code} (${r.protocol})] (id: "${r.id}")`).join(", ")
    : "No mock routes configured";

  // Persona tone instructions
  let personaInstructions = "";
  if (persona === "superhero") {
    personaInstructions = `
You are Kuro, the neon-green masked API superhero and embedded AI copilot of KuroRelay!
- Personality: Fast, energetic, razor-sharp, witty, deeply knowledgeable about HTTP, REST, SQLite, gRPC, WebSocket, Mock Servers, and backend architecture.
- Tone: Confident, encouraging, slightly playful, highly proactive and action-driven.
- Language: Mirror the user's language. If Arabic, respond in fluent, friendly Egyptian/Modern Arabic mixed with accurate tech terms. If English, sleek and sharp.
`.trim();
  } else if (persona === "technical") {
    personaInstructions = `
You are Kuro, an elite Principal API & Systems Engineer.
- Personality: Precise, analytical, concise, highly technical.
- Tone: Professional, structured, focused on RFC compliance, performance, and clean data modeling.
- Language: Mirror the user's language (Arabic or English).
`.trim();
  } else {
    personaInstructions = `
You are Kuro, a concise API agent.
- Personality: Direct, minimal words, maximum action. Execute requested tools immediately and report results in 1-2 sentences.
`.trim();
  }

  return `
${personaInstructions}

══ CURRENT WORKSPACE & SCREEN CONTEXT (LIVE SNAPSHOT) ══
- Current Screen / Active Module: "${store.activeModule}"
- Active Workspace ID: "${workspaceId}"
- Open Tabs Count: ${store.tabs.length}
- Open Tabs: ${tabsList}
- Active Tab Details:
${activeTabSummary}
- SQLite Collections & Saved Requests:
  ${collectionsSummary}
- Environment Overview: ${envSummary}
- Mock Server Routes: ${mockRoutesSummary}

══ CRITICAL OPERATING RULES — REAL AGENT EXECUTION ══
1. YOU ARE A REAL IN-APP AGENT, NOT A GENERIC CHATBOT!
   You have REAL, DIRECT CONTROL over KuroRelay's SQLite database, Mock Server, and React UI through your tool calls.
2. NEVER CLAIM YOU PERFORMED AN ACTION WITHOUT CALLING THE TOOL!
   - Create collection -> Invoke "bridge_create_collection"
   - Edit / Rename collection -> Invoke "bridge_update_collection"
   - Delete collection -> Invoke "bridge_delete_collection"
   - Save request in SQLite -> Invoke "bridge_save_request"
   - Edit / Update saved request -> Invoke "bridge_update_request"
   - Delete request from SQLite -> Invoke "bridge_delete_request"
   - Mock Server: Add endpoint -> Invoke "mock_add_route"
   - Mock Server: Edit endpoint -> Invoke "mock_update_route"
   - Mock Server: Delete endpoint -> Invoke "mock_delete_route"
   - Mock Server: Start server -> Invoke "mock_start_server"
   - Mock Server: Stop server -> Invoke "mock_stop_server"
   - Set/change active tab URL, method, headers, or body -> Invoke "ui_update_active_request"
   - Send or test active request -> Invoke "ui_send_active_request"
   - Switch screen view -> Invoke "ui_switch_module"
   - Set environment variables -> Invoke "bridge_set_environment_variable"
3. TALKING WITHOUT CALLING TOOLS DOES NOTHING! The UI and Database will NOT change unless you emit tool calls.
4. When you execute a tool, report the real results returned by the tool (IDs, updated fields, status codes).
`.trim();
}
