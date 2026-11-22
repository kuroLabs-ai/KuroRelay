# KuroRelay — Comprehensive Global Design System & Implementation Specification
**Product:** KuroRelay (Local-First Desktop API Development Environment)  
**Organization:** Kuro-Labs  
**Design Paradigm:** Modern Minimalism + Data-Dense Utilitarian Design + Subtle Layered UI  
**Target Platform:** Windows 10/11 Desktop (React + TypeScript + PyWebView + SQLite + Monaco Editor)  
**Aspect Ratio Standard:** 16:9 Desktop (1920×1080 baseline, responsive down to 1280×720)  
**Version:** 2.0.0 (Global Production Blueprint)

---

## 1. DESIGN PHILOSOPHY & CORE PRINCIPLES

### 1.1 The Triad Architecture
1. **Modern Minimalism**:
   - Zero superfluous ornamentation, no decorative gradients, no unnecessary glassmorphism blur, no cartoonish illustrations.
   - Clean, razor-sharp structural dividers (1px solid borders) that guide the developer's eye effortlessly across dense datasets.
   - High information utility: every pixel serves a purpose (status, data, action, or context).

2. **Data-Dense Utilitarian Design**:
   - Inspired by Bloomberg Terminals, JetBrains IDEs, and VS Code: compact row heights (28px - 32px), readable typography scales, and tabular layouts.
   - Immediate feedback: explicit HTTP status codes, latency in ms, payload sizes, and variable token pills visible at a glance.
   - Keyboard-first interaction affordances: visible shortcut badges (`Ctrl+Enter`, `Ctrl+S`, `Ctrl+K`, `Ctrl+P`).

3. **Subtle Layered UI (Elevation via Luminance)**:
   - Elevation is communicated through **monochromatic surface luminance shifts** rather than heavy drop shadows:
     - `surface-canvas` (`#0c0e12`): Application background & Monaco backdrop.
     - `surface-base` (`#111317`): Main application container and tab rails.
     - `surface-sidebar` (`#16191f`): Activity bar and navigation sidebar.
     - `surface-panel` (`#1c2027`): Data tables, active editors, input fields.
     - `surface-overlay` (`#242933`): Popovers, tooltips, modals, command palette.
     - `border-subtle` (`rgba(255, 255, 255, 0.07)`): Crisp 1px structural framing.

4. **Local-First & Offline Neutrality**:
   - No user avatars, sign-in prompts, or cloud sync nag-screens.
   - System indicators reflect native SQLite storage, OS keyring encryption (DPAPI AES-256), and instant local response (0ms latency).

---

## 2. COLOR TOKEN SYSTEM & SEMANTICS

### 2.1 Surfaces & Neutrals
| Token Name | Hex Code | Purpose / Usage |
|---|---|---|
| `--color-surface-canvas` | `#0c0e12` | Bottom-most workspace layer, response canvas |
| `--color-surface-base` | `#111317` | Default workspace and tab header background |
| `--color-surface-sidebar` | `#16191f` | Navigation sidebar, tree view panels |
| `--color-surface-activity` | `#121418` | Narrow 48px activity icon bar |
| `--color-surface-panel` | `#1c2027` | Key/value tables, editor headers, card backgrounds |
| `--color-surface-elevated` | `#242933` | Hover states, active selection, floating dropdowns |
| `--color-surface-modal` | `#2a303c` | Dialogs, context menus, command palette modal |
| `--color-border-subtle` | `#222731` | Standard container borders (1px) |
| `--color-border-hover` | `#333b49` | Interactive element hover border |
| `--color-border-focus` | `#5b9bff` | Focused input or active split divider |

### 2.2 Typography Colors
| Token Name | Hex Code | Contrast / Usage |
|---|---|---|
| `--color-text-primary` | `#f0f3f8` | Headings, active values, response keys (High contrast) |
| `--color-text-secondary` | `#9ea7b4` | Labels, table headers, breadcrumbs, descriptions |
| `--color-text-muted` | `#5a6270` | Inactive checkboxes, line numbers, placeholders |
| `--color-text-inverse` | `#0c0e12` | Text inside solid bright badges/buttons |

### 2.3 Brand & Interactive Accents
| Token Name | Hex Code | Purpose / Usage |
|---|---|---|
| `--color-accent-blue` | `#5b9bff` | Primary action accent, tab active underline, focus rings |
| `--color-accent-blue-hover` | `#70aaff` | Hover state for interactive blue buttons |
| `--color-accent-blue-dim` | `rgba(91, 155, 255, 0.12)` | Active tab badge pill, token highlights |
| `--color-accent-lime` | `#b8ff34` | Send execution button, highlight for running tasks |
| `--color-accent-lime-hover` | `#c8ff5e` | Send button hover state |
| `--color-accent-lime-dim` | `rgba(184, 255, 52, 0.12)` | Variable preview pill, instant sync badge |

### 2.4 Semantic Status & HTTP Indicators
| Token Name | Hex Code | Meaning / Usage |
|---|---|---|
| `--color-status-success` | `#22c55e` | 2xx Status, Passed assertions, Online Ready |
| `--color-status-success-dim` | `rgba(34, 197, 94, 0.12)` | Background badge for `200 OK`, `201 Created` |
| `--color-status-warning` | `#f59e0b` | 3xx Redirects, Insecure TLS opt-in, Dirty tab indicator |
| `--color-status-error` | `#ef4444` | 4xx Client Errors, 5xx Server Errors, Failed tests |
| `--color-status-error-dim` | `rgba(239, 68, 68, 0.12)` | Background badge for failed execution |
| `--color-method-get` | `#22c55e` | `GET` HTTP Method badge & text |
| `--color-method-post` | `#eab308` | `POST` HTTP Method badge & text |
| `--color-method-put` | `#3b82f6` | `PUT` HTTP Method badge & text |
| `--color-method-patch` | `#a855f7` | `PATCH` HTTP Method badge & text |
| `--color-method-delete` | `#ef4444` | `DELETE` HTTP Method badge & text |
| `--color-method-ws` | `#06b6d4` | `WS` WebSocket Method badge & text |
| `--color-method-graphql` | `#ec4899` | `GRAPHQL` Method badge & text |

---

## 3. TYPOGRAPHY & TYPE SCALE

### 3.1 Font Families
- **UI Primary Font Family**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Engineered for maximum screen legibility at 11px - 14px sizes.
- **Code & Monospace Font Family**: `'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace`
  - Used for URLs, HTTP methods, headers, JSON keys, status codes, line numbers, and script editors.

### 3.2 Font Scale Matrix
| Role | Font Family | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| **App Title / Modal Header** | Inter | 14px | 600 (Semibold) | 20px | -0.01em |
| **Section Header** | Inter | 12px | 600 (Semibold) | 16px | 0.02em (Caps) |
| **Body Primary** | Inter | 13px | 400 (Regular) | 18px | 0 |
| **Body Medium (Buttons)** | Inter | 12px | 500 (Medium) | 16px | 0 |
| **Caption / Meta** | Inter | 11px | 400 (Regular) | 14px | 0.01em |
| **Code Editor / JSON** | JetBrains Mono | 12.5px | 400 (Regular) | 19px | 0 |
| **Method / Status Badges** | JetBrains Mono | 11px | 700 (Bold) | 14px | 0.04em |
| **URL / Input Code** | JetBrains Mono | 12.5px | 500 (Medium) | 18px | -0.01em |
| **Status Bar Footer** | JetBrains Mono | 10.5px | 500 (Medium) | 14px | 0.02em |

---

## 4. SPACING, SIZING & GRID STANDARDS

### 4.1 Spacing Scale
- `space-1`: `2px` (micro borders and dot gaps)
- `space-2`: `4px` (badge paddings, icon gap)
- `space-3`: `6px` (button vertical padding, compact row gap)
- `space-4`: `8px` (standard component gap, table cell vertical padding)
- `space-5`: `12px` (panel interior padding, table cell horizontal padding)
- `space-6`: `16px` (modal padding, major section divider)
- `space-8`: `24px` (empty state graphic padding)

### 4.2 Component Heights & Layout Geometry
- **Windows Title Bar**: `36px` height (Native look, window controls, brand logo)
- **Top Request/Workspace Bar**: `40px` height
- **Tab Header Bar**: `34px` height (active tab height `34px`, inactive `30px`)
- **Key/Value Table Row**: `30px` height (dense, compact spreadsheet feel)
- **Input Fields & Buttons**: `28px` - `30px` height
- **Activity Bar Width**: `48px` fixed width
- **Navigation Sidebar Width**: `240px` default (resizable between `180px` and `420px`, snaps closed below `110px`)
- **Status Bar Dock**: `24px` fixed height at bottom

### 4.3 Corner Radii (`roundness`)
- Standard Buttons & Inputs: `4px` (`rounded`)
- Method & Status Badges: `3px` (`rounded-sm`)
- Modal Dialogs & Menus: `6px` (`rounded-md`)
- Variable Token Pills: `3px` (`rounded-sm`)
- Absolute limit: Never exceed `6px` radius anywhere in the application to prevent consumer SaaS roundness.

---

## 5. COMPLETE COMPONENT SPECIFICATIONS

### 5.1 App Title Bar
```text
[ Mascot Logo + KuroRelay v1.4.2 ]  |  [ Workspace Selector ▾ ]  [ Env: KuroTree (Active) ▾ ]  |  [ 🔍 Ctrl+K ]  |  [ ⚡ SQLite: 0ms ]  [ — □ ✕ ]
```
- **Height**: 36px. Background: `#0f1115`. Border bottom: `1px solid #1f232b`.
- Window controls on far right: Minimize (`—`), Maximize (`□`), Close (`✕`).
- Workspace & Environment badges allow single-click switching with active indicators (`● #22c55e`).

### 5.2 Activity Bar (Left Rail)
- **Width**: 48px. Background: `#121418`. Border right: `1px solid #1c2027`.
- Icons (Lucide 18px stroke):
  - Collections (`Folders`)
  - Request Builder (`Send`)
  - Environments (`Layers`)
  - Workflow Studio (`GitBranch`)
  - History (`Clock`)
  - Mock Servers (`Server`)
  - Settings (`Settings`)
- API Explorer, Testing Center, and Performance pages are temporarily hidden from the current UI; their roadmap documentation remains.
- **Active State**: 2px solid `#5b9bff` left edge indicator, icon color `#f0f3f8`, background `#1c2027`.

### 5.3 Request URL Bar & Action Hub
- **Structure**:
  1. Method Dropdown (`GET`, `POST`, `PUT`, `DELETE`, `WS`, `GRAPHQL`): JetBrains Mono, colored font, compact padding.
  2. URL Input with Token Highlighting: Background `#16191f`, border `1px solid #232832`. Embedded syntax highlighting converts `{{BASE_URL}}` into an inline rounded badge (`bg-[#202736] text-[#5b9bff] px-1.5 py-0.5 rounded font-mono text-xs`).
  3. Private Network Switch (`🔒 Private Subnet`): Checkbox toggle for localhost & LAN RFC1918 traffic.
  4. Save Button (`Ctrl+S`): Dark gray surface with visual amber dot indicator when `isDirty`.
  5. Primary Send Button (`Ctrl+Enter`): Solid Electric Lime (`#b8ff34`) background, dark text (`#0c0e12`), bold font, play icon, with hover state (`#c8ff5e`).

### 5.4 Key/Value Data Grid (Params, Headers, Form Data)
- **Header Row**: 26px height, uppercase 10.5px Inter medium, `#9ea7b4`.
- **Columns**: `[Checkbox 16px]` | `KEY (JetBrains Mono)` | `VALUE (JetBrains Mono)` | `DESCRIPTION` | `ACTIONS [Trash]`.
- Empty bottom row features faint `+ Add parameter or header override...` placeholder for instantaneous typing.
- Variable syntax detection in Value column: highlights tokens immediately on keypress.

### 5.5 Monaco-Style Response Inspector
- **Header Bar**:
  - Status Code Badge: `● 200 OK` (Green badge: `bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30 px-2 py-0.5 rounded font-mono text-xs font-bold`).
  - Metrics Pills: `⏱ 42 ms` | `📦 1.84 KB` | `DNS: 0ms` | `TLS: 12ms`.
  - Format Tabs: `Pretty JSON` (active: `#1c2027`), `Raw`, `Headers (12)`, `Preview`, `Timing`.
  - Quick Actions: `Search (Ctrl+F)`, `Word Wrap Toggle`, `Copy Response`.
- **Editor Canvas**:
  - Dark canvas (`#0c0e12`).
  - Gutter with line numbers (`#434a57`, right-aligned).
  - Syntax Highlighting Palette:
    - Keys: `#5b9bff` (Sky Blue)
    - Strings: `#22c55e` (Emerald Green)
    - Numbers / Booleans: `#f59e0b` (Amber Orange)
    - Null / Punctuation: `#8b949e` (Cool Gray)

### 5.6 Bottom Status Dock
- **Height**: 24px. Background: `#0e1014`. Border top: `1px solid #1a1d24`.
- Left: `● SQLite Engine: Local First` | `Sync: 0ms (Instant)` | `Env: KuroTree (Active)` | `Memory: 38.4 MB`.
- Right: `UTF-8` | `JSON Schema Valid (v7)` | `100% OFFLINE` (Lime Green tag).

---

## 6. READY-TO-USE DESIGN.MD SPECIFICATION (FOR AI TOOLS)

```markdown
---
name: KuroRelay Utilitarian System
author: Kuro-Labs
theme:
  color_mode: DARK
  font_ui: Inter
  font_code: JetBrains Mono
  roundness: ROUND_FOUR (max 4px border-radius)
  primary_accent: '#5b9bff'
  action_accent: '#b8ff34'
colors:
  surface-canvas: '#0c0e12'
  surface-base: '#111317'
  surface-sidebar: '#16191f'
  surface-panel: '#1c2027'
  surface-elevated: '#242933'
  surface-overlay: '#2a303c'
  border-subtle: '#222731'
  border-hover: '#333b49'
  border-focus: '#5b9bff'
  text-primary: '#f0f3f8'
  text-secondary: '#9ea7b4'
  text-muted: '#5a6270'
  accent-blue: '#5b9bff'
  accent-lime: '#b8ff34'
  status-success: '#22c55e'
  status-warning: '#f59e0b'
  status-error: '#ef4444'
  method-get: '#22c55e'
  method-post: '#eab308'
  method-put: '#3b82f6'
  method-patch: '#a855f7'
  method-delete: '#ef4444'
  method-ws: '#06b6d4'
  method-graphql: '#ec4899'
rules:
  - 'Never use rounded cards > 6px or rounded-full buttons except for status dots.'
  - 'Never add decorative blurry gradients, avatars, or user sign-in links.'
  - 'Layout must always follow native Windows 16:9 desktop IDE structure.'
  - 'HTTP methods and status codes must strictly use designated semantic tokens.'
  - 'Monaco code editor gutter and line numbers must always be visible in response inspector.'
---
```

---

## 7. AI AGENT FIRST-ORDER EXECUTION DIRECTIVE

When this prompt or design guide is passed to any AI tool, frontend generator, or Figma assistant:

```text
EXECUTE IMMEDIATELY WITH FIRST ORDER:
1. Target: Windows 11 Desktop API Development Environment (KuroRelay by Kuro-Labs).
2. Aspect Ratio: Strict 16:9 widescreen desktop (1920x1080 canvas).
3. Theme: Dark Utilitarian (#0c0e12 canvas, #111317 base, #16191f sidebar, #1c2027 panels).
4. Accents: #5b9bff (Interactive Blue), #b8ff34 (Send Action Lime), #22c55e (Success).
5. Fonts: 'Inter' for UI labels and 'JetBrains Mono' for all methods, URLs, tokens, and code.
6. Boundaries: 1px subtle borders (#222731). NO oversized radius (strictly max 4px). NO user login/avatars (Local-First Offline only).
7. Regions: 36px Title Bar -> 48px Activity Rail -> Resizable Navigation Sidebar -> Central Tabbed Builder + Monaco Response Inspector -> 24px Status Footer.
```
