# KuroRelay Frontend Architecture

The **KuroRelay** user interface is built using **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**. It runs natively inside PyWebView via a local compiled bundle, communicating with the Python backend through a type-safe asynchronous bridge.

---

## 🏛️ Architecture Overview

The frontend follows a modern, modular architecture with state management provided by **Zustand** and local persistence backed by SQLite:

```text
frontend/src/
├── bridge/                # PyWebView IPC bridge client & type definitions
│   ├── client.ts          # Window.pywebview RPC client wrapper
│   └── types.ts           # Strongly-typed bridge payload & response schemas
├── components/            # React UI components
│   ├── kuro/              # Kuro AI Copilot UI (Drawer, tool executions, chat)
│   ├── layout/            # TitleBar, Sidebar, ActivityBar, StatusBar
│   ├── request/           # URL bar, method selector, params/headers/body editors
│   ├── response/          # Response status, headers, body viewer, timings
│   ├── ui/                # Toast notifications, modals, error boundaries, buttons
│   └── views/             # Main module views
│       ├── CollectionsView.tsx
│       ├── EnvironmentsView.tsx
│       ├── HistoryView.tsx
│       ├── MockServerView.tsx
│       ├── RequestBuilderView.tsx
│       ├── SettingsView.tsx
│       └── WorkflowStudioView.tsx
├── kuro/                  # Autonomous AI Copilot Engine
│   └── engine/
│       ├── kuroAgent.ts   # Multi-turn autonomous agent execution loop
│       ├── llmClient.ts   # Multi-provider LLM API client (Gemini, OpenAI, Anthropic, Groq, Ollama)
│       ├── systemPrompt.ts# Live screen & workspace context injector
│       ├── toolsRegistry.ts# 20+ tool definitions (UI, Bridge, Mock, Workflow)
│       └── types.ts       # Provider, tool, and chat message types
├── lib/                   # Utility helpers, collection tree transformers, theme tokens
├── stores/                # Zustand application stores
│   ├── appStore.ts        # Workspace, tabs, active module, layout state
│   └── kuroStore.ts       # Kuro Copilot credentials, chat history & SQLite sync
└── App.tsx                # Top-level application orchestrator & shortcut router
```

---

## ⚡ Key Modules

### 1. Request Builder (`components/views/RequestBuilderView.tsx`)
- Tabbed interface supporting concurrent HTTP requests with dirty-state tracking.
- Parameter editor supporting URL query strings, custom headers, and multi-mode authentication (Bearer, Basic, API Key).
- Monaco Editor integration for raw and JSON payloads with auto-formatting and linting.
- Live response visualization with duration, size, headers table, and formatted JSON viewer.

### 2. Kuro AI Copilot (`components/kuro/` & `kuro/engine/`)
- Autonomous assistant triggered via `Ctrl+K` or the TitleBar pill.
- Executes real-time tools via `toolsRegistry.ts`:
  - **UI Tools**: Read active tab state, switch views, modify request fields, open/close tabs.
  - **Bridge Tools**: Run requests, CRUD collections/requests, manage environments, execute workflows.
  - **Mock Server Tools**: Add/edit/delete mock routes, start/stop local server, query traffic logs.
- Dual-layer persistence: In-memory Zustand state synced with backend SQLite table (`kuro_copilot_config` key).

### 3. Visual Workflow Studio (`components/views/WorkflowStudioView.tsx`)
- Graph and node-based visual workflow editor.
- Connects requests in sequential or parallel branches.
- Dynamic environment variable extraction and propagation across steps.

### 4. Mock Server View (`components/views/MockServerView.tsx`)
- Configure local mock endpoints with custom HTTP status codes, headers, and bodies.
- Network latency simulation (custom delay in ms).
- Real-time live log stream of incoming requests.

### 5. Settings View & Keyboard Shortcuts (`components/views/SettingsView.tsx`)
- Categorized settings sidebar:
  1. General & Network
  2. Editor & Workbench
  3. Kuro AI Copilot
  4. Keyboard Shortcuts (`KeyboardShortcutsTab.tsx`)
  5. Data & Storage
  6. Security & Vault
  7. About & KuroLabs
- Fully documented hotkeys table with live search filtering.

---

## 🛠️ Development & Build Scripts

Run commands from the `frontend/` directory:

```powershell
# Install dependencies
npm install

# Start Vite development server (browser preview)
npm run dev

# Run TypeScript typecheck
npx tsc -b --noEmit

# Run unit & component tests (Vitest)
npm run test -- --run

# Build optimized production bundle for PyWebView
npm run build
```

---

## 🎨 Design System

KuroRelay follows the **Obsidian Protocol** design language:
- **Surface**: Deep charcoal `#0d0f11` and `#111317`
- **Accent**: Neon Lime `#b8ff34` and emerald `#6ee7b7`
- **Typography**: System font fallbacks (`Segoe UI`, `Inter`, `Cascadia Code`, `Consolas`) with zero external network requests on startup.
- **Brand Logo**: Served from `public/logo.png`.
