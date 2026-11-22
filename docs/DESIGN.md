---
name: Obsidian Protocol
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#c2c6d4'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8c919e'
  outline-variant: '#424752'
  surface-tint: '#aac7ff'
  primary: '#aac7ff'
  on-primary: '#002f65'
  primary-container: '#5b9bff'
  on-primary-container: '#00326a'
  inverse-primary: '#005cb9'
  secondary: '#76daa8'
  on-secondary: '#003823'
  secondary-container: '#007d53'
  on-secondary-container: '#bcffd9'
  tertiary: '#cebdff'
  on-tertiary: '#381385'
  tertiary-container: '#a68af9'
  on-tertiary-container: '#3b1887'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d7e3ff'
  primary-fixed-dim: '#aac7ff'
  on-primary-fixed: '#001b3e'
  on-primary-fixed-variant: '#00458e'
  secondary-fixed: '#92f7c3'
  secondary-fixed-dim: '#76daa8'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005235'
  tertiary-fixed: '#e8ddff'
  tertiary-fixed-dim: '#cebdff'
  on-tertiary-fixed: '#21005e'
  on-tertiary-fixed-variant: '#4f319c'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '600'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  code-xs:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.5rem
  gutter-compact: 0.25rem
  margin: 0rem
  margin-panel: 0.5rem
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system powers a high-precision, local-first API development environment tailored for engineers, systems architects, and backend specialists. The ethos merges the surgical density of JetBrains and VS Code with the ergonomic clarity of specialized API tooling. The user interface prioritizes high information density, deep visual hierarchy through subdued surface nesting, and minimal distraction.

The aesthetic follows an **Engineered Technical Minimalism**:
- **High-density efficiency**: Every pixel row accounts for operational data; UI chrome yields to payloads, syntax, and wire traffic.
- **Deep nesting surfaces**: Depth is achieved via architectural dark-canvas tiering rather than loud drop-shadows.
- **Micro-tactile precision**: Feedback is instantaneous, characterized by hairline separators (1px), subtle tonal shifts on hover, and crisp status dots.
- **Monospace parity**: Monospaced typography is treated as a first-class citizen across URL bars, request payloads, response viewers, status badges, and key-value matrices.

## Colors

The chromatic structure relies on an ultra-disciplined dark spectrum engineered for long-session screen time, anchored by semantic HTTP token accents and IDE status indicators.

### Base Canvas & Surfaces
- **Canvas Base (`#17191D`)**: Main editor viewport, payload scratchpads, and root backdrop.
- **Sidebar Rail (`#1D2025`)**: Primary left explorer, file trees, collections tree, and environment scopes.
- **Panel Surface (`#23272E`)**: Secondary sidebars, response consoles, inspector panels, headers, and footer status bars.
- **Elevated / Hover Surface (`#292E36`)**: Active tabs, floating command palettes, context menus, and tooltips.
- **Precision Border (`#2D323B`)**: Universal 1px hairline boundary separating views, grid lines, and panel splits.

### Typography & Content
- **Text High-Contrast (`#E5E7EB`)**: Active values, payload text, primary labels, selected tab titles.
- **Text Muted (`#929AA6`)**: Secondary descriptions, inactive tabs, unselected tree nodes, gutter line numbers.
- **Text Disabled / Micro (`#636B78`)**: Placeholder text, shortcut glyphs, deactivated parameters.

### Protocol Accents (HTTP Verbs & Status)
- **GET / 2xx Success (`#55B98A`)**: Safe retrieval, 200 OK responses, healthy connection status.
- **POST / Interactive Accent (`#5B9BFF`)**: Creation endpoints, primary execute actions, send buttons, active focus rings.
- **PUT / 3xx Redirect / Warning (`#D9AA62`)**: Full replacement payloads, warnings, dirty buffer status dot.
- **PATCH (`#A78BFA`)**: Partial mutations, schema adjustments.
- **DELETE / 4xx-5xx Error (`#E47777`)**: Destructive endpoints, broken requests, socket disconnects, schema mismatches.
- **OPTIONS / Meta (`#94A3B8`)**: CORS exploration, informational handshakes.

## Typography

Typography balances structural clarity and raw data density. 

1. **System & Chrome (`Inter`)**: Deployed for window titles, primary view navigation, context actions, toolbars, and tabular property column headers. It renders neutral and transparent at sub-14px desktop sizes.
2. **Code & Protocols (`JetBrains Mono`)**: Deployed across code buffers, inline JSON/GraphQL nodes, HTTP address bars, parameter key-value pairs, response timing metrics, and status badges. Features like tabular figures, clear glyph discrimination (0 vs O, 1 vs l), and clean punctuation weights are required for parsing payloads.
3. **Sizing Guardrails**: Standard desktop viewport operations strictly live between `11px` (`0.6875rem`) and `13px` (`0.8125rem`) to maximize working canvas space.

## Layout & Spacing

The layout model is a strict **tiled dock / multi-pane layout** operating with zero outer canvas margins to behave like a native desktop application frame.

### Layout Topology
- **Activity Bar Rail (Leftmost)**: 44px fixed width. Contains vertical icon anchors for Collections, Environments, History, Extensions, and System Settings.
- **Primary Sidebar (Collapsible)**: Width variable from 220px to 380px, defaulting to 260px. Hosts tree-view hierarchical collections and project navigation.
- **Main Stage (Split View)**:
  - Top tab strip: 32px height.
  - Request Construction Workspace: Flexible 50% split (horizontal or vertical dock).
  - Response Telemetry Pane: Flexible 50% split with tabs (Body, Headers, Cookies, Timeline, Raw Socket).
- **Status Strip (Bottommost)**: Fixed 22px height. Displays proxy state, active environment badge, compute latency, and memory footprint.

### Tabular Grid & Rhythms
- **Data Matrix Height**: Table rows for Query Params, Headers, and Form-Data strictly clamp between 28px and 32px.
- **Panel Gaps**: Adjacent panes share a single collapsed `1px` border (`#2D323B`) to eliminate double-border artifacts.
- **Draggable Splitters**: Hit target of 6px overlaid on the 1px boundary line, maintaining a `col-resize` or `row-resize` cursor.

## Elevation & Depth

This design system avoids standard skeuomorphic shadows and dramatic blur radii. Depth is achieved via **tonal stacking** paired with **hairline structural borders**.

### Structural Stacking (Lowest to Highest)
1. **Level 0 (Floor Canvas - `#17191D`)**: Main editor buffer, payload JSON input, protocol script view.
2. **Level 1 (Side Docks & Bars - `#1D2025`)**: Collections file explorer, history logs, activity rail.
3. **Level 2 (In-Pane Panels & Section Headers - `#23272E`)**: Header strips, response inspect panels, URL bar container, key-value table headers.
4. **Level 3 (Interactive Controls & Tab Active - `#292E36`)**: Active selected tab, segmented control selection, hovered table row, active search input.
5. **Level 4 (Floating Overlays & Popovers - `#23272E` with 1px `#2D323B`)**: Quick-switcher modal (Command Palette), variable preview cards, auto-complete Intellisense popovers, context dropdowns. Rendered with an ambient, razor-sharp drop shadow: `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)`.

### Border Discipline
All panels, status bars, and segmented controls are delineated by a crisp `1px solid #2D323B`. Active focus states transition this border to `#5B9BFF` with an optional `0 0 0 1px #5B9BFF` inner ring, avoiding layout-shifting border expansions.

## Shapes

The environment employs a sharp, utilitarian radius language (`roundedness: 1` -> 0.25rem / 4px base):

- **Core Elements (4px - `rounded-sm`)**: Primary input fields, URL compound bars, dropdown trigger buttons, interactive icons, code block containers, and tooltips.
- **Micro Elements (2px - `rounded-xs`)**: Checkboxes, status pill badges, method tags (GET, POST), dirty indicators, and scrollbar thumbs.
- **Dock Tabs**: Flat bottom corners (`0px`) with subtly rounded top corners (`3px`) that anchor flush into the main panel edge.
- **Modals / Dialogs (6px - `rounded-md`)**: Command palettes and configuration prompts; corners remain compact to sustain a disciplined desktop aesthetic.

## Components

### 1. HTTP Request Address Bar
- Compound control consisting of:
  - **Method Selector**: Compact dropdown on the left. Background `#23272E`, text colored by active verb (e.g., `#55B98A` for GET, `#5B9BFF` for POST).
  - **URL Field**: Background `#1D2025`, border-top and border-bottom `#2D323B`, text `#E5E7EB`, font `JetBrains Mono` at `13px`. Environment variables embedded within the URL (e.g., `{{baseUrl}}`) render in a rounded capsule with text `#5B9BFF` and background `rgba(91, 155, 255, 0.12)`.
  - **Execute/Send Action Button**: Flush right, background `#5B9BFF`, text `#17191D` (or high-contrast white `#FFFFFF` depending on accessibility threshold, preferably bold `#17191D` for punchy IDE readability), 0-4px right radius, font `Inter` 600 weight.

### 2. Request & Response Tab Bar
- **Tab Dimensions**: Height 32px, horizontal padding 10px, border-right 1px `#2D323B`.
- **Inactive Tab**: Background `#1D2025`, text `#929AA6`.
- **Active Tab**: Background `#23272E`, text `#E5E7EB`, with a top 2px primary accent border (`#5B9BFF`).
- **Dirty Indicator**: A small 6px circular dot (`#D9AA62`) positioned next to the tab label, alerting unsaved modifications. Replaces the close icon on hover with a standard `12px` cross icon.

### 3. Key-Value Matrix Table (Params, Headers, Form Data)
- **Header Row**: Height 26px, background `#1D2025`, text `#929AA6`, uppercase 10px tracking.
- **Data Rows**: Height 30px, border-bottom 1px `#2D323B`. Alternating rows maintain subtle transparent state with hover transition to `#292E36`.
- **Cell Inputs**: Monospace `12px`, borderless inside the cell, zero outline until focused (focus triggers `#5B9BFF` internal outline).
- **Row Controls**: Left side holds custom 14px checkbox; right side exposes delete icon (`#E47777`) visible on row-hover.

### 4. Method Token Badges
- **Dimensions**: Line-height 1.1, padding 1px 5px, font `JetBrains Mono` 11px bold, border-radius 2px.
- **Palette Association**:
  - `GET`: Background `rgba(85, 185, 138, 0.12)`, text `#55B98A`.
  - `POST`: Background `rgba(91, 155, 255, 0.12)`, text `#5B9BFF`.
  - `PUT`: Background `rgba(217, 170, 98, 0.12)`, text `#D9AA62`.
  - `PATCH`: Background `rgba(167, 139, 250, 0.12)`, text `#A78BFA`.
  - `DELETE`: Background `rgba(228, 119, 119, 0.12)`, text `#E47777`.

### 5. Status Telemetry Pills
- Response status rendering (e.g., `200 OK`, `404 Not Found`):
  - Monospace font, 12px, tabular numbers.
  - Accompanied by latency chip (e.g., `124 ms`) and payload size chip (e.g., `1.84 KB`) styled in `#929AA6` on `#1D2025`.

### 6. Desktop Window Controls & Status Bar
- **Top Window Frame**: Height 36px, background `#1D2025`, drag-region enabled. Contains integrated window controls (minimize, maximize, close) with native hit-targets (`#E47777` hover for close).
- **Bottom Status Bar**: Height 22px, background `#1D2025`, border-top 1px `#2D323B`, text `#929AA6` at 11px. Houses connection status dot (`#55B98A`), active Git branch or sync state, and quick env switcher.