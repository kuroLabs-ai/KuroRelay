# KuroRelay

<p align="center">
  <img src="assets/icons/kurorelay_combined_horizontal.png" alt="KuroRelay Brand Logo" />
</p>
<p align="center">
  <strong>Next-Generation Desktop API Development, Testing & Workflow Engine</strong><br>
  Local-first • High Performance • Autonomous AI Copilot • Visual Workflow Studio
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-0.1.0-lime?style=flat-square" alt="Version 0.1.0" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=flat-square" alt="License" />
</p>

---

## 🌟 Vision & Overview

**KuroRelay** is a high-performance, local-first API workbench designed for developers, QA engineers, and automated test architects. Built from the ground up to solve the latency, privacy, and bloat issues of legacy API clients, KuroRelay combines a fast Python HTTP core with an ultra-responsive React 19 interface.

### Key Pillars:
1. **Local-First & Offline-Ready**: All collections, requests, environments, history, and copilot settings are stored locally in an embedded SQLite database (`kurorelay.db`). Zero telemetry, zero mandatory cloud logins.
2. **Kuro AI Copilot**: A built-in, autonomous AI testing partner that can inspect active requests, run bridge commands, generate mock servers, build multi-step workflows, and debug API responses using multiple LLM providers (Google Gemini, OpenAI, Groq, Anthropic, Ollama, OpenRouter).
3. **Visual Workflow Studio**: Construct, execute, and monitor sequential or parallel API test pipelines with dynamic environment variable extraction, JSONPath validation, and step dependency chaining.
4. **Local Mock Server**: Spin up instant local HTTP mock servers with customizable routes, delays, response bodies, and real-time request logging.
5. **Native Desktop Runtime**: Powered by PyWebView with a dedicated native Python splash screen, hardware acceleration, frameless window controls, and keyboard navigation.

---

## 🏗️ Architecture & Stack

```text
KuroRelay/
├── src/kurorelay/             # Python Application Core
│   ├── bridge/                # Controlled PyWebView JS-Python Bridge (API dispatcher)
│   ├── core/                  # App config, lifecycle, native splash, logging, exceptions
│   ├── database/              # SQLite ORM models (SQLAlchemy), repositories & migrations
│   ├── engines/               # Async HTTPX execution, workflow runner, mock server engine
│   └── services/              # High-level business logic orchestrators
├── frontend/                  # React 19 + TypeScript + Vite UI
│   ├── src/
│   │   ├── bridge/            # Type-safe window.pywebview bridge client & schemas
│   │   ├── components/        # Layout, modals, view panels, Monaco editor integrations
│   │   │   ├── kuro/          # Kuro Copilot drawer, chat bubbles, tool status cards
│   │   │   └── views/         # RequestBuilder, Collections, Environments, History,
│   │   │                      # WorkflowStudio, MockServer, Settings
│   │   ├── kuro/engine/       # Autonomous AI agent engine, tool registry & LLM client
│   │   └── stores/            # Zustand state stores (appStore, kuroStore)
│   ├── public/                # Static assets & brand identity (logo.png)
│   └── dist/                  # Compiled production static bundle loaded by PyWebView
├── docs/                      # Architectural specs, user guides, implementation logs
└── tests/                     # Unit and integration test suites (Python pytest & Vitest)
```

---

## 🚀 Key Features

### 1. Request Builder & Execution
- Support for all standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`).
- Comprehensive query parameter, header, and auth managers (Bearer Token, Basic Auth, API Key).
- Monaco code editor for JSON and Raw request payloads with inline validation and formatting.
- Sub-millisecond response timing, size breakdown, header inspection, and formatted response viewing.

### 2. Autonomous Kuro AI Copilot
- Triggerable via `Ctrl+K` or the TitleBar pill.
- Direct read/write access to UI editor tabs and SQLite data layer.
- Comprehensive tool suite for collections, requests, environments, mock routes, and workflows.
- Multi-provider support (Gemini 2.5/Flash, GPT-4o, Claude 3.5, Llama 3 on Groq/Ollama).
- Persistent configuration synchronized double-way across Zustand and SQLite.

### 3. Visual Workflow Studio
- Visual graph construction of API pipelines.
- Supports sequential and parallel execution branches.
- Auto-extracts variables from step responses (`{{TOKEN}} = res.body.data.token`) and cascades them into subsequent steps.
- Detailed step-by-step execution metrics and run history.

### 4. Built-in Mock Server
- Instantly start a mock server on `http://localhost:4010` (or custom port).
- Configurable routes, status codes, headers, and simulated network delays.
- Full inspection of incoming request headers and payloads.

### 5. Native Splash Screen
- Starts immediately in the exact geometric center of the screen with High-DPI awareness.
- Deep obsidian dark theme (`#0c0e12`) with ambient neon radial glow around the Kuro logo.
- Animated capsule progress bar with real-time initialization tracking and `v0.1.0` badge.
- Smooth alpha fade-out transition into the main window.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl + Enter` | Send Active Request / Run Workflow | Request Builder / Studio |
| `Ctrl + S` | Save Current Request to Collection | Request Builder |
| `Ctrl + K` | Toggle Kuro AI Copilot Drawer | Global |
| `Ctrl + L` | Focus URL Input Bar | Global |
| `Ctrl + D` | Clear / Reset URL Bar | Global |
| `Ctrl + B` | Toggle Left Sidebar | Global |
| `Ctrl + ,` | Open Settings | Global |
| `Ctrl + 1` .. `Ctrl + 9` | Switch to Tab 1 through 9 | Global |
| `Ctrl + Tab` | Cycle to Next Open Tab | Global |
| `Ctrl + W` | Close Active Tab | Global |
| `Ctrl + N` | Open New Request Tab | Global |
| `Ctrl + Alt + 1` | Switch to Collections View | Global |
| `Ctrl + Alt + 2` | Switch to Request Builder | Global |
| `Ctrl + Alt + 3` | Switch to Environments View | Global |
| `Ctrl + Alt + 4` | Switch to History View | Global |
| `Ctrl + Alt + 5` | Switch to Workflow Studio | Global |
| `Ctrl + Alt + 6` | Switch to Mock Server View | Global |
| `Ctrl + Alt + 7` | Switch to Settings View | Global |
| `Ctrl + Alt + →` / `←` | Cycle Active Modules | Global |

---

## 💻 Getting Started

### Prerequisites
- **Python**: 3.11 or higher
- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Kuro-Labs/KuroRelay.git
   cd KuroRelay
   ```

2. **Setup Python Virtual Environment**:
   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   pip install -e .
   ```

3. **Install Frontend Dependencies & Build**:
   ```powershell
   cd frontend
   npm install
   npm run build
   cd ..
   ```

### Running the Application

Launch the desktop app with the native splash screen:
```powershell
python -m kurorelay
```
or using the installed CLI entry point:
```powershell
kurorelay
```

---

## 📦 Building Standalone Executables & Installer

### 1. Build Executable Packages (PyInstaller)
Compile standalone binaries for distribution:
```powershell
# Build both OneFile executable and OneFolder directory package
python scripts/build_exe.py

# Or build a specific target:
python scripts/build_exe.py --mode onefile   # dist/onefile/KuroRelay.exe
python scripts/build_exe.py --mode onefolder # dist/onefolder/KuroRelay.exe
```

### 2. Build Inno Setup Windows Installer
Create a professional Windows setup installer wizard with dual component choice (Standard Folder or Portable Executable):
```powershell
python scripts/build_installer.py
```
Outputs the installer directly to:
`dist/installer/KuroRelay-Setup-v0.1.0-x64.exe`

---

## 🧪 Testing

### Backend Unit Tests (Pytest)
```powershell
python -m pytest tests/unit/ -q
```
*Current test suite: **101/101 passed**.*

### Frontend Unit & Component Tests (Vitest)
```powershell
cd frontend
npm run test -- --run
```
*Current test suite: **13/13 passed**.*

### TypeScript Compilation Check
```powershell
cd frontend
npx tsc -b --noEmit
```

---

## 📄 Documentation

Comprehensive architecture, design, and workflow documentation is located in the `docs/` folder:
- [Architecture Guide](docs/ARCHITECTURE.md) — Modular monolith design, PyWebView bridge contract, layer boundaries.
- [Design System & UI](docs/DESIGN.md) — Obsidian Protocol, color palettes, typography, components.
- [User Workflow Guide](docs/USER_WORKFLOW.md) — Step-by-step user journeys and interaction patterns.
- [Application Workflow](docs/APP_WORKFLOW.md) — Internal execution pipelines and system lifecycles.
- [Development Work Log](docs/WORK_LOG.md) — Complete chronological history of implementations and architectural decisions.

---

## 🛡️ License

Copyright © 2026 KuroLabs. All rights reserved.
