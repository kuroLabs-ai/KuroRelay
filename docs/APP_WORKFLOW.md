# KuroRelay — Application Workflow

**Product:** KuroRelay  
**Organization:** Kuro-Labs  
**Version:** 0.1.0  
**Status:** MVP Implemented & Production Verified

---

## Overview

This document describes the **internal application workflows** of KuroRelay — what occurs at the system, engine, and thread levels during startup, request execution, autonomous AI agent operations, workflow runs, and mock server serving.

---

## 1. Application Startup & Native Splash Screen Pipeline

```
flowchart TD
    A[User launches KuroRelay] --> B[lifecycle.py: AppLifecycle.start()]
    B --> C[SplashScreen initialized in background daemon thread]
    C --> D[DPI Awareness Set + Screen Center Calculated]
    D --> E[Splash Window reveals at exact screen center with 10% progress]
    E --> F[Ensure Local AppData Directories: 25% progress]
    F --> G[Initialize SQLite Database: init_db()]
    G --> H{Database OK?}
    H -- No --> ERR1[Log Fatal Error -> splash.close() -> Abort]
    H -- Yes --> I[Database ready: 55% progress]
    I --> J[Resolve Frontend Bundle: find_frontend_url()]
    J --> K[Interface loading: 75% progress]
    K --> L[Restore Window Geometry from window_state.json]
    L --> M[webview.create_window() with frameless dark theme: 90% progress]
    M --> N[webview.start(http_server=True, storage_path=...)]
    N --> O[Window shown event: _on_shown fires]
    O --> P[splash.set_progress(100) -> Ready!]
    P --> Q[Splash Window smooth alpha fade-out & destroy]
    Q --> R[React Frontend mounts -> hydrateKuroStoreFromSqlite() -> UI Active]
```

**Key Execution Rules:**
- The native splash screen runs via pure Tkinter + Pillow in a daemon thread, decoupling visual launch speed from web engine initialization.
- Window position uses Windows physical metrics (`GetSystemMetrics`) with DPI awareness (`SetProcessDpiAwareness(1)`), preventing offset bugs on scaled displays (125%, 150%).
- Database failures immediately destroy the splash screen to allow proper error reporting.
- Frontend double-syncs Copilot configuration from SQLite immediately upon mounting.

---

## 2. Request Execution Pipeline

The core HTTP pipeline coordinated by `RequestService` and `HTTPEngine`:

```
flowchart TD
    A[User clicks Send / Ctrl+Enter] --> B[Frontend collects active tab configuration]
    B --> C[Validate fields & parse JSON payload via Monaco editor]
    C --> D{Syntax Valid?}
    D -- No --> ERR1[Display inline JSON/field error]
    D -- Yes --> E[Submit payload via bridge.sendRequest()]
    E --> F[KuroRelayAPI receives payload & assigns Task ID]
    F --> G[TaskManager registers active asyncio Task]
    G --> H[Environment Engine injects active variables: {{BASE_URL}}, {{TOKEN}}]
    H --> I[Authentication Engine formats Bearer / Basic / API-Key headers]
    I --> J[Security Engine verifies private network & destination policies]
    J --> K[HTTPEngine executes async request via HTTPX AsyncClient]
    K --> L{Network Outcome?}
    L -- Transport Error --> ERR2[Map to NetworkError: DNS / Timeout / Connection Refused]
    L -- HTTP Response --> M[ResponseEngine normalizes status, headers, body, timings]
    M --> N[History Service records execution to SQLite history table]
    N --> O[Return structured response payload to bridge]
    O --> P[Frontend matches result to originating Tab ID]
    P --> Q[Render Response Inspector: status code badge, duration, size, JSON body]
```

**Critical Rules:**
- HTTP `4xx` and `5xx` status codes are treated as valid HTTP responses, not errors.
- Network transport errors (e.g. host unreachable, connection refused, DNS lookup failure) are explicitly categorized as `NetworkError`.
- Secrets and credentials in headers or auth models are recursively redacted in all structured logs.

---

## 3. Autonomous Kuro AI Copilot Execution Loop

The multi-turn autonomous reasoning and tool execution loop:

```
flowchart TD
    A[User prompts Kuro Copilot / Ctrl+K] --> B[kuroAgent.ts: startChatSession()]
    B --> C[systemPrompt.ts: Assemble live screen & workspace context]
    C --> D[Format conversation history & system prompt]
    D --> E[llmClient.ts: Send streaming request to configured provider]
    E --> F{Model returns output}
    F -- Text Response --> G[Stream message tokens to Copilot Drawer]
    F -- Tool Call Directive --> H[Identify tool name & parse JSON arguments]
    H --> I[toolsRegistry.ts: Dispatch tool execution]
    I --> J{Tool Target}
    J -- UI Tool --> K[Execute directly on Zustand appStore: updateTab, switchModule, openTab]
    J -- Bridge Tool --> L[Call window.pywebview: CRUD SQLite, run request, start mock server]
    K --> M[Record tool result card with execution duration & output]
    L --> M
    M --> N[Append tool result to conversation history as user/tool role]
    N --> E
    G --> O[Final synthesized answer delivered to user]
```

**Key Execution Rules:**
- The Copilot agent supports multiple consecutive tool calls in a single session.
- Tool cards animate live inside the drawer with status badges (`running`, `success`, `error`) and duration timers.
- Google Gemini tool calls preserve `thought_signature` and group tool responses correctly under `role: "user"`.
- Copilot settings (API key, model, persona) are saved to both local storage and the SQLite `app_settings` table.

---

## 4. Visual Workflow Studio Execution Engine

Execution flow for automated multi-step testing pipelines:

```
flowchart TD
    A[User clicks Run Workflow / Ctrl+Enter] --> B[Workflow Engine receives workflow definition]
    B --> C[Validate step dependency graph & order steps]
    C --> D[Auto-inject active environment variables into step payloads]
    D --> E[Execute Step 1 via HTTP Engine]
    E --> F{Step Succeeded?}
    F -- No & OnFailure=Stop --> ERR[Mark workflow run as Failed -> Save Run Log]
    F -- Yes --> G[Extract response variables: e.g. token = res.body.access_token]
    G --> H[Cascade extracted variables into context for Step 2+]
    H --> I{Sequential or Parallel branch?}
    I -- Sequential --> J[Execute next step in topological order]
    I -- Parallel --> K[Execute branch steps concurrently using asyncio.gather]
    J --> L{More Steps?}
    K --> L
    L -- Yes --> E
    L -- No --> M[Mark workflow run as Completed -> Save Run Metrics to SQLite]
    M --> N[Update UI Workflow Flow Graph with step status & durations]
```

---

## 5. Local Mock Server Lifecycle

How the built-in Mock Server serves simulated API endpoints:

```
flowchart TD
    A[User configures routes & clicks Start Mock Server] --> B[mock_server engine binds to configured port (default: 4010)]
    B --> C[Engine listens for incoming HTTP requests]
    C --> D[Incoming request arrives at /api/v1/...]
    D --> E[Match HTTP method and URL path against active route registry]
    E --> F{Match Found?}
    F -- No --> G[Return default 404 Route Not Configured JSON response]
    F -- Yes --> H[Simulate configured network latency delay (e.g. 150ms)]
    H --> I[Format configured response headers and body]
    I --> J[Return simulated response to client]
    J --> K[Append request log: timestamp, method, path, status, duration]
    K --> L[Stream logs to Mock Server View in frontend]
```
