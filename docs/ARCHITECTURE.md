# KuroRelay — Architecture Document

**Product:** KuroRelay  
**Organization:** Kuro-Labs  
**Version:** 0.1.0  
**Status:** MVP Implemented & Production Verified

---

## Overview

KuroRelay is a **Modular Monolith** desktop application designed for local-first, privacy-respecting, high-performance API engineering, automated testing, and autonomous AI copilot workflows.

The technology stack pairs **React 19 + TypeScript + Vite** for the frontend with **Python 3.11+ (HTTPX, SQLAlchemy, SQLite, Pydantic, structlog)** for the backend, bundled into a desktop application using **PyWebView** with a native high-DPI Python splash screen. Communication occurs through an asynchronous, strongly-typed **Bridge Contract**.

---

## High-Level Architecture Diagram

```
┌───────────────────────────────────────────────────────────┐
│                      KuroRelay UI                         │
│                                                           │
│            React 19 + TypeScript + Vite                   │
│                                                           │
│   Components / Request Builder / Tabs / Monaco Editor     │
│   Workflow Studio / Mock Server / Settings / Shortcuts    │
│   Autonomous Kuro AI Agent (LLM Client + Tools Registry)  │
└────────────────────────┬──────────────────────────────────┘
                         │  Type-safe Async Bridge (window.pywebview)
                         ▼
┌───────────────────────────────────────────────────────────┐
│                    Bridge Contract                        │
│                                                           │
│    Validation / Serialization / Task IDs / Safe Redaction │
│    Pydantic Schemas (Backend) + TypeScript Types (UI)     │
└────────────────────────┬──────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────┐
│                  PyWebView Runtime                        │
│                                                           │
│    Controlled Python API Exposure (KuroRelayAPI)          │
│    Local HTML Serving (Zero external network ports)       │
└────────────────────────┬──────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────┐
│              Python Application Core                      │
│                                                           │
│    Lifecycle Orchestrator + Native Tkinter/PIL Splash     │
│    TaskManager (Thread-safe cancellation & async loops)   │
└──────────────┬──────────────────────────┬─────────────────┘
               │                          │
     ┌─────────┴──────────┐    ┌──────────┴──────────┐
     ▼                    ▼    ▼                     ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│  HTTP    │  │ Testing  │  │ Workflow │  │ Mock Server  │
│  Engine  │  │  Engine  │  │  Engine  │  │    Engine    │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘
               │                          │
               ▼                          ▼
┌───────────────────────────────────────────────────────────┐
│              Shared Application Services                  │
│                                                           │
│  RequestService / Environment Engine / Workspace Manager  │
│  History Repository / Secret Redaction / System Settings  │
└───────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────┐
│              Data Layer                                   │
│                                                           │
│    SQLite (via SQLAlchemy ORM: kurorelay.db)              │
│    OS Keyring / Windows Credential Manager                │
└───────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities & Subsystems

### 1. Native Splash Screen Subsystem (`kurorelay.core.splash`)
- **Technology**: Tkinter + Pillow (PIL).
- **Execution Flow**: Spawns in an independent background daemon thread before PyWebView or the webview engine initializes.
- **Display Features**:
  - Exact geometric screen centering using Windows physical metrics (`user32.GetSystemMetrics`) and high-DPI scaling (`SetProcessDpiAwareness(1)`).
  - Pre-rendered Obsidian dark card (`520x350`, `#0c0e12`) with ambient radial neon lime glow (`#b8ff34`) behind the circular masked Kuro logo.
  - Prominent version badge: `v0.1.0`.
  - Smoothly animated capsule progress bar with real-time percentage (`0%` to `100%`) and status text reflecting database bootstrap and interface load.
  - Smooth alpha fade-out transition upon the main window's `shown` event.

### 2. Frontend — React 19 + TypeScript
**Owns:**
- UI rendering, navigation, and activity bar switching.
- Multi-tab request state management with dirty tracking (`isDirty`).
- Monaco code editor integration (JSON syntax validation, formatting).
- Autonomous Kuro AI Copilot Drawer, multi-turn agent execution loop, and live screen context injection.
- Visual Workflow Studio graph manipulation.
- Local Mock Server configuration UI.
- Comprehensive keyboard shortcut handling (`Ctrl+1-9`, `Ctrl+Tab`, `Ctrl+K`, `Ctrl+Enter`, etc.).
- Double-synced SQLite settings hydration on mount (`hydrateKuroStoreFromSqlite`).

**State Separation:**
- **Zustand (`appStore`)**: Tabs, active workspace, active module, layout, sidebar dimensions.
- **Zustand (`kuroStore`)**: Kuro AI Copilot configuration, selected provider/model, credentials, chat sessions (persisted both locally and in SQLite `app_settings`).
- **Component State**: Transient modal inputs, search queries, editor cursor states.

### 3. Autonomous Kuro AI Copilot Subsystem
- **Location**: `frontend/src/kuro/engine/`
- **Pattern**: Frontend-centric autonomous agent with zero backend bloat. Consumes all backend functionality directly through the existing `bridge` client.
- **Components**:
  - `kuroAgent.ts`: Multi-iteration autonomous execution loop.
  - `llmClient.ts`: Multi-provider API client supporting Google Gemini (with `thought_signature` preservation and `default_api` normalization), OpenAI, Anthropic, Groq, and Ollama.
  - `systemPrompt.ts`: Dynamic live screen context injector (active request details, open tabs, active workspace, environments, collections).
  - `toolsRegistry.ts`: 25+ tool dispatchers across UI control, HTTP execution, SQLite CRUD (requests, collections, folders, environments), Workflow management, and Mock Server operations.

### 4. Bridge Contract
- **Boundary**: Strict boundary between React and Python.
- **Validation**: All incoming arguments validated via Pydantic; all frontend payloads typed in TypeScript.
- **Security**: No arbitrary code execution; recursive redaction of sensitive credentials (`Authorization`, tokens, keys) in logs; private network security options.

### 5. Python Application Core & Engines
- **HTTP Engine (`engines/http/`)**: Async HTTPX client lifecycle, custom timeouts, redirects, TLS verification, proxy configuration, and recursive secret redaction.
- **Workflow Engine (`engines/workflows/`)**: Graph validation, dependency resolution, sequential and parallel step execution, variable extraction from JSON responses, automatic environment variable injection, and run logging.
- **Mock Server Engine (`engines/mock/`)**: High-performance local HTTP server, custom endpoint matching, delay simulation, custom status codes/headers, and real-time request logging.
- **Database Engine (`database/`)**: SQLite with SQLAlchemy ORM, managing workspaces, collections, folders, requests, environments, history, and application settings.

---

## Project Repository Structure

```text
KuroRelay/
├── src/kurorelay/                 # Python Package Core
│   ├── bridge/                    # PyWebView JS API & Pydantic Request Schemas
│   │   ├── api.py                 # KuroRelayAPI (Bridge methods dispatcher)
│   │   └── schemas.py             # Pydantic validation models
│   ├── core/                      # Application runtime & configuration
│   │   ├── config.py              # Environment & AppData path resolution
│   │   ├── exceptions.py          # Unified exception hierarchy
│   │   ├── lifecycle.py           # App startup, shutdown & PyWebView window management
│   │   ├── logging.py             # Structured logging & recursive secret redaction
│   │   └── splash.py              # High-DPI native Tkinter/PIL splash screen
│   ├── database/                  # SQLAlchemy ORM
│   │   ├── base.py                # Database initialization & session management
│   │   └── models.py              # Tables: Workspace, Collection, Request, History, etc.
│   ├── engines/                   # Specialized Async Execution Engines
│   │   ├── http/                  # HTTPX client & response normalizer
│   │   ├── mock/                  # Local Mock HTTP server engine
│   │   └── workflows/             # Workflow graph executor & variable injector
│   └── services/                  # Business logic services
│       ├── request_service.py     # Request orchestration & TaskManager
│       └── task_manager.py        # Asyncio task tracking & cooperative cancellation
├── frontend/                      # React 19 Frontend
│   ├── public/                    # Static brand assets (logo.png)
│   ├── src/
│   │   ├── bridge/                # Type-safe window.pywebview RPC client
│   │   ├── components/            # Layout, Modals, Views (RequestBuilder, Workflow, Mock, Settings)
│   │   ├── kuro/engine/           # Autonomous AI Agent, LLM client & Tools Registry
│   │   ├── stores/                # Zustand stores (appStore, kuroStore)
│   │   └── App.tsx                # App root, bootstrap & global keyboard shortcuts
│   ├── index.html                 # App shell
│   ├── package.json
│   └── vite.config.ts
├── scripts/                       # Packaging & Distribution Scripts
│   ├── build_exe.py               # Standalone PyInstaller build (onefile & onefolder)
│   ├── build_installer.py         # Automated Inno Setup compiler runner
│   ├── kurorelay.spec             # PyInstaller bundle specification
│   └── kurorelay_setup.iss        # Inno Setup dual-mode installer definition
├── tests/                         # Test suites
│   ├── unit/                      # Pytest backend unit tests (101 tests)
│   └── frontend/                  # Vitest frontend unit tests (13 tests)
├── docs/                          # Architecture, workflows & design documentation
└── pyproject.toml                 # Python packaging & console entry point
```

---

## Design System & Theme

KuroRelay uses the **Obsidian Protocol** theme:
- **Surface Base**: `#0c0e12` / `#111317`
- **Surface Panels**: `#1a1c20` / `#1e2024`
- **Brand Accent**: Neon Lime `#b8ff34` / Emerald `#6ee7b7`
- **Text Main**: `#e2e2e8`
- **Text Muted**: `#94a3b8` / `#64748b`
- **Typography**: Native system monospace & sans-serif fonts (`Segoe UI`, `Inter`, `Cascadia Code`, `Consolas`) — zero external web requests required at runtime.

---

## Key Architectural Decisions

| Decision | Implementation | Rationale |
|---|---|---|
| **Desktop Runtime** | PyWebView | Eliminates Electron overhead; keeps binary size small and uses native WebView2 on Windows. |
| **Splash Screen** | Native Python (Tkinter + PIL) | Instant display before PyWebView initialization; High-DPI centered; modern cyber aesthetic. |
| **AI Copilot** | Frontend-Centric Agent | Direct UI access, zero backend duplication, streaming support, multi-provider flexibility. |
| **Copilot Persistence** | Zustand + SQLite Double-Sync | Guarantees credentials and settings persist across window restarts and machine reboots. |
| **HTTP Engine** | HTTPX (Async) | Modern asynchronous HTTP client with HTTP/2 support and structured cancellation. |
| **Data Storage** | Local SQLite (`kurorelay.db`) | 100% offline-ready, local-first privacy, zero mandatory cloud accounts. |
| **Shortcuts Router** | Centralized `App.tsx` listener | Desktop-grade keyboard navigation across tabs, views, and actions. |
| **Packaging & Distribution** | PyInstaller + Inno Setup | Supports both portable single-file executable and fast-startup directory bundle with custom wizard artwork. |
