# KuroRelay — User Workflow Guide

**Product:** KuroRelay  
**Organization:** Kuro-Labs  
**Version:** 0.1.0  
**Status:** MVP Implemented & Production Verified

---

## Overview

This document guides developers, QA engineers, and automated testing architects through working with **KuroRelay** — covering day-to-day user journeys, interface interactions, autonomous AI copilot operations, visual test pipelines, and keyboard navigation.

---

## 1. Application Launch & Native Splash Screen

When you launch KuroRelay from the desktop or terminal:

1. **Instant Feedback**: A native Python splash window appears in the exact center of your screen.
2. **Visual Verification**: Displays the Kuro logo with an ambient radial neon glow, the `v0.1.0` badge, and a smooth capsule progress bar.
3. **Initialization Stages**: You will see real-time progress as KuroRelay prepares directories, bootstraps the SQLite database (`kurorelay.db`), and prepares the interface.
4. **Seamless Transition**: Upon reaching 100%, the splash screen smoothly fades out, revealing the main desktop workbench with your active workspace and open tabs restored.

---

## 2. Request Builder & Execution Workflow

The core everyday workflow for sending and testing HTTP requests:

```
flowchart TD
    A[Open Request Tab: Ctrl+N or Activity Bar] --> B[Enter URL / Focus URL Bar: Ctrl+L]
    B --> C[Select HTTP Method: GET, POST, PUT, DELETE, PATCH]
    C --> D[Add Query Parameters in Params editor]
    D --> E[Configure Headers in Headers editor]
    E --> F[Configure Authentication in Auth tab: Bearer, Basic, or API Key]
    F --> G[Configure Body in Body tab: None, JSON with Monaco, or Raw]
    G --> H[Select Active Environment: e.g. Development or Local Mock Server]
    H --> I[Send Request: Click Send or press Ctrl+Enter]
    I --> J[Response Panel renders: Status Code, Duration, Size, Headers, Body]
    J --> K[Save Request: Ctrl+S to save to Collection]
```

### Tips & Shortcuts:
- `Ctrl + L`: Instantly focuses the URL bar.
- `Ctrl + D`: Clears the URL bar.
- `Ctrl + Enter`: Sends the request immediately.
- `Ctrl + S`: Opens the Save Request modal to persist it to a collection.

---

## 3. Working with Kuro AI Copilot

Kuro is an autonomous, in-editor AI testing partner that understands your active screen, editor tabs, collections, and backend capabilities:

### Triggering Kuro:
- Press **`Ctrl + K`** from anywhere in the application, or click the **Kuro AI Copilot** button in the Title Bar.

### Capabilities & Common Prompts:
1. **"Inspect my active request and explain why it's returning a 401 Unauthorized"**
   - Kuro reads the current tab's URL, headers, and last response snapshot, pinpoints the missing auth header, and offers to update it.
2. **"Create an E-Commerce API collection with login, get products, and checkout endpoints"**
   - Kuro invokes `bridge_create_collection` and `bridge_save_request` to create the collection and endpoints directly in your SQLite database.
3. **"Start a local mock server on port 4010 with 3 endpoints and test them"**
   - Kuro adds mock routes using `mock_add_route`, starts the mock server, and sends test HTTP requests to verify they work.
4. **"Build an End-to-End smoke test workflow chaining login to product creation"**
   - Kuro creates a workflow, links steps, configures variable extraction (`{{AUTH_TOKEN}} = res.body.token`), and executes the run.

### Configuring Providers & Persistence:
- Open **Settings (`Ctrl+,`) → Kuro AI Copilot**.
- Choose your LLM provider (Google Gemini, OpenAI, Groq, Anthropic, Ollama, OpenRouter).
- Enter your API Key and click **Fetch Available Models** to populate live models.
- All configurations are automatically synchronized to SQLite and remain persistent across app restarts.

---

## 4. Visual Workflow Studio

Build, orchestrate, and execute complex multi-step API integration tests:

1. **Open Studio**: Press `Ctrl + Alt + 5` or click **Workflow Studio** in the Activity Bar.
2. **Create Workflow**: Click `+ New Workflow` and specify a name.
3. **Add Steps**: Add HTTP request steps to the flow graph.
4. **Configure Dependencies**: Connect steps sequentially or set branches to run in parallel.
5. **Extract Variables**:
   - In step configurations, define extraction rules:
     `TOKEN = body.access_token`
   - In subsequent steps, reference the extracted variable as `{{TOKEN}}`.
6. **Execute & Monitor**:
   - Press **`Ctrl + Enter`** to run the workflow.
   - Watch step cards update in real-time with green (success) or red (failure) indicators and duration metrics.
   - Inspect step-by-step logs and execution history.

---

## 5. Local Mock Server

Simulate backend APIs before they are built:

1. **Open Mock Server**: Press `Ctrl + Alt + 6` or click **Mock Servers** in the Activity Bar.
2. **Configure Port**: Set your desired port (default: `4010`).
3. **Define Routes**:
   - Path (e.g. `/api/v1/users`)
   - HTTP Method (`GET`, `POST`, etc.)
   - Status Code (`200 OK`, `201 Created`, `400 Bad Request`)
   - Simulated Delay (e.g. `200ms`)
   - Response Headers and JSON Body
4. **Start Server**: Click **Start Server** (or ask Kuro to start it).
5. **Inspect Live Logs**: See incoming requests, headers, and response statuses in real time.

---

## 6. Global Keyboard Shortcuts Reference

Access the full interactive list at any time in **Settings (`Ctrl+,`) → Keyboard Shortcuts**:

| Category | Shortcut | Description |
|---|---|---|
| **Tabs** | `Ctrl + 1` .. `Ctrl + 9` | Switch directly to open tab 1 through 9 |
| **Tabs** | `Ctrl + Tab` | Cycle to the next open tab |
| **Tabs** | `Ctrl + W` | Close the active tab |
| **Tabs** | `Ctrl + N` | Open a new blank request tab |
| **Navigation** | `Ctrl + Alt + 1` | Switch to Collections View |
| **Navigation** | `Ctrl + Alt + 2` | Switch to Request Builder View |
| **Navigation** | `Ctrl + Alt + 3` | Switch to Environments View |
| **Navigation** | `Ctrl + Alt + 4` | Switch to History View |
| **Navigation** | `Ctrl + Alt + 5` | Switch to Workflow Studio |
| **Navigation** | `Ctrl + Alt + 6` | Switch to Mock Server View |
| **Navigation** | `Ctrl + Alt + 7` | Switch to Settings View |
| **Navigation** | `Ctrl + Alt + →` / `←` | Cycle active modules forward / backward |
| **Actions** | `Ctrl + Enter` | Send active request / Run active workflow |
| **Actions** | `Ctrl + S` | Save current request to collection |
| **Actions** | `Ctrl + L` | Focus the URL address bar |
| **Actions** | `Ctrl + D` | Clear URL bar content |
| **Actions** | `Ctrl + K` | Toggle Kuro AI Copilot Drawer |
| **Actions** | `Ctrl + B` | Toggle Left Navigation Sidebar |
| **Actions** | `Ctrl + ,` | Open Application Settings |
