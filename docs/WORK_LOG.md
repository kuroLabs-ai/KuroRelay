# KuroRelay Development Work Log

This file records the project review, implementation decisions, changes, and validation performed while continuing KuroRelay development. Keep subsequent work in this log so the implementation history stays in one document.

## 2026-11-15 — Request Builder Basics

### Project review

- Read the root and frontend READMEs and the Architecture, Application Workflow, Development Workflow, User Workflow, and UI/UX design documents.
- Reviewed the PRD sections for the request builder, MVP scope and acceptance criteria, phase roadmap, and first development milestone. Reviewed the implementation guide through the foundation, HTTP core, main UI, persistence, and testing plans.
- Inspected the current React app, request-tab store, bridge client and types, Python bridge API, application lifecycle, database setup, and workspace/request models.
- Confirmed the documented application includes a query-parameter editor, editable headers, JSON request body, HTTP execution, and visible response/error states. In the current UI, params and headers were explanatory placeholders and the body textarea was uncontrolled and never sent.
- Confirmed the Python bridge currently accepts request parameters and headers and supports JSON and raw request bodies. The broader persistence, auth, history, and testing features remain incomplete; this increment does not claim those milestones are finished.

### Implementation steps

1. Added a reusable key/value editor for adding, editing, and removing request headers and additional query parameters.
2. Connected those editor values to the active request tab's payload so the bridge receives the edited values.
3. Replaced the disconnected body placeholder with a controlled body editor and `None`, `JSON`, and `Raw` modes. JSON text is parsed before execution; invalid JSON is shown as an inline error and is not submitted.
4. Changed request failures from browser alerts to an inline response-panel error state.
5. Made asynchronous results and errors target the tab that started the request, even if the user switches tabs while it is running.
6. Corrected tab updates so explicitly clearing `isDirty` after a successful response is preserved. Ordinary user edits and in-progress updates still mark the tab dirty.
7. Added a focused Zustand regression test for updating the originating tab and preserving its clean state.
8. Kept the change within the existing request-builder and Zustand patterns; no dependencies or unrelated backend behavior were changed.

### Validation and evidence

- `npm.cmd run build` from `frontend/`: passed, including TypeScript project build and Vite production build.
- `npm.cmd run lint` from `frontend/`: passed.
- `npx.cmd vitest run src/stores/appStore.test.ts` from `frontend/`: passed (1 test).
- `python -m pytest -q` from the repository root: no tests were collected (pytest exit code 5); the repository currently has no discoverable Python test files.
- The first npm build/lint attempts were run from the repository root, where no `package.json` exists; rerunning from `frontend/` succeeded.
- No desktop/manual PyWebView QA was performed in this environment.

### Remaining work

- Implement API-key/advanced authentication, request saving/reopening, collections, environments, history, and broader network-error/cancellation behavior before marking the MVP acceptance criteria complete.
- Add focused automated tests for the request UI and core HTTP execution as the project test suites are established.

## 2026-11-15 — Basic and Bearer Authentication

### Implementation steps

1. Replaced the authentication placeholder with No Auth, Bearer Token, and Basic Auth options.
2. Added a masked Bearer token field and masked Basic password field; credentials remain in the active request tab's in-memory payload and are sent only when the user sends the request.
3. Updated the Python bridge to apply Bearer authorization headers or HTTPX Basic Auth, reject missing credentials, and reject unsupported auth types instead of silently ignoring them.
4. Added mocked bridge tests covering both Authorization formats and the missing-token validation path.

### Validation and evidence

- Frontend production build and Oxlint: passed.
- Frontend tests: passed (1 test).
- `python -m pytest -q`: passed (3 tests, including the new auth bridge cases).
- Ruff on the new backend test and bridge (excluding pre-existing findings): passed.
- Full Ruff check of the bridge still reports existing import ordering and broad-exception findings; these were not changed as they are outside this increment.
- Installed `respx`, which is already declared in the project's optional development dependencies but was absent from the environment.
- No manual PyWebView QA was performed.

## 2026-11-15 — Python Core and HTTP Engine Foundation

### Project review

- Confirmed the documented Phase 1 request pipeline was implemented inline in `bridge/api.py`; the HTTP, request, response, and authentication engine modules were empty.
- Reviewed the bridge contract, error hierarchy, runtime settings, database session helper, startup lifecycle, and Phase 1 implementation plan before changing the Python request path.

### Implementation steps

1. Added Pydantic bridge schemas for request bodies, Basic/Bearer auth, and HTTP request payloads. Validation failures expose field paths rather than raw invalid values.
2. Added `RequestEngine` to validate HTTP(S) URLs and request fields, serialize JSON/raw bodies, preserve explicit content types, and prepare auth and transport options.
3. Extracted Basic/Bearer handling into `AuthenticationEngine`; Authorization header replacement is case-insensitive.
4. Added `HTTPEngine` for HTTPX execution, timeout configuration, and safe structured mapping of timeout, DNS, TLS, connection, and transport failures.
5. Added `ResponseEngine` to normalize status, headers, body, duration, size, and redirects. HTTP 4xx/5xx remain completed HTTP responses; JSON media types with `+json` are decoded.
6. Reduced the bridge request handler to orchestration, ensured its event loop closes via `asyncio.run`, and stopped logging request URLs or raw exception text.
7. Made structured-log redaction recursive so credential fields nested in headers, contexts, lists, and auth objects are redacted before output.
8. Validated HTTP method token syntax and rejected non-standard NaN/Infinity values in JSON request bodies.
9. Added focused tests for bridge orchestration, request validation/body preparation, HTTP response and timeout handling, response normalization, and recursive secret redaction.

### Architecture decision and boundary

- `HTTPEngine` owns an `AsyncClient` per bridge request. The current PyWebView bridge runs each synchronous command in its own `asyncio.run` loop; reusing an async client across those loops would risk loop-affinity errors. A long-lived shared client should follow an app-owned event loop.
- This implements the HTTP request foundation, not the full planned engine roadmap. Environment-variable resolution, redirect destination policy, task progress, request history, collections, and persistence integration remain outstanding.

### Validation and evidence

- `python -m pytest -q`: passed (17 tests at this stage; see the task-manager entry below for the updated total).
- Ruff on changed Python source and tests: passed with `BLE001` excluded for pre-existing broad exception handlers in the bridge/database boundary.
- `respx` is already declared in optional dev dependencies and was installed in this environment for mocked HTTP tests.

### Recommended next work

1. Add an app-owned event loop if a long-lived shared HTTP client or background tasks are needed; per-request cooperative cancellation is now supported.
2. Implement environment-variable resolution and revalidate redirect destinations before enabling untrusted request configurations.
3. Connect the existing database models to request saving, collections, environments, and history repositories.

## 2026-11-15 — Request Service and Cooperative Cancellation

### Implementation steps

1. Added `RequestService` to coordinate request preparation, HTTP execution, timing, and response normalization outside the bridge layer.
2. Added a thread-safe `TaskManager` that tracks the active asyncio task and uses `loop.call_soon_threadsafe` to propagate cancellation from the PyWebView bridge thread.
3. Updated the bridge to accept an optional client task ID, run requests through the service/task manager, report cancellation, and return `not_found` when a task is no longer active.
4. Added a Cancel action to the frontend request bar. The UI sends a generated task ID, exposes cancellation state, and handles the final cancelled result.
5. Added regression coverage for cancellation from a second thread through the bridge and injected service.

### Validation and evidence

- `python -m pytest -q`: passed (18 tests).
- Ruff on changed Python source and tests: passed with `BLE001` excluded for pre-existing broad exception handlers in the bridge/database boundary.
- Frontend production build, Oxlint, and Vitest: passed (1 frontend test).

### Recommended next work

1. Implement redirect destination revalidation and environment-variable resolution before expanding request execution.
2. Add task progress/status queries and test cancellation against a real delayed HTTP transport.
3. Connect request services to SQLAlchemy repositories for request saving, collections, environments, and history.

## 2026-11-15 — Environment Resolution and Network Access Policy

### Implementation steps

1. Added `EnvironmentEngine` with request → collection → environment → global precedence, recursive resolution in strings and JSON-like values, and structured errors listing unresolved variable names.
2. Wired variable resolution into request URLs, headers, query parameters, bodies, and authentication configuration.
3. Added an explicit, strict `allow_private_network` request option. It defaults to false and is exposed as a clearly labeled local-network checkbox in the request bar.
4. Added destination validation for the initial URL and each redirect; non-public DNS results and local/private IPs are blocked unless that request opts in.
5. Disabled HTTPX automatic redirects and followed redirects manually so each next URL is checked before it is sent. Kept HTTPX redirect method/header behavior and response history.
6. Added environment precedence/unresolved-variable, private-network opt-in, mixed DNS result, redirect revalidation, and local redirect tests.

### Security boundary

- DNS is resolved for policy checks and all returned addresses are checked, but HTTPX performs its own connection-time resolution. IP pinning against DNS rebinding is not implemented; treat this as destination preflight policy, not a complete DNS-rebinding defense.
- Variable scopes can be supplied to the Python request contract, but persistent environment selection and secret references through keyring are not yet connected.

### Validation and evidence

- `python -m pytest -q`: passed (26 tests).
- Ruff on changed Python source and tests: passed.
- Frontend production build, Oxlint, and Vitest: passed after integrating the current request components and fixing their type-only imports and request-tab test fixture.
- A wider Ruff run also reports an existing import-order issue in `core/lifecycle.py`; Ruff passed when scoped to the changed Python files.
- No manual PyWebView QA was performed.

### Frontend integration follow-up

1. Read the current modular request UI, Zustand store, bridge contract, and response inspector; placed the private-network opt-in in the existing `URLBar` instead of adding a competing control to `App`.
2. Passed the explicit local-network flag and active environment scope through the bridge payload; the default request tab starts with private-network access disabled.
3. Passed Basic/Bearer credentials as structured bridge auth configuration so Python can resolve environment variables before creating auth headers.
4. Connected generated task IDs to the bridge, made request lifecycle updates target the originating tab, and kept cancellation pending until the bridge reports completion. Request-state changes no longer mark an unchanged request dirty.
5. Restored the documented invalid-JSON behavior: malformed JSON is not sent, and execution/cancellation errors appear in the response inspector rather than browser alerts.
6. Corrected React type-only imports and expanded the store regression test to cover execution-state dirty tracking.

### Follow-up validation

- Frontend production build: passed.
- Frontend Oxlint and Vitest: passed (2 tests).
- Python tests: passed (26 tests); Ruff on changed Python files: passed.
- The initial frontend validation command was run from the repository root and could not find `package.json`; rerunning from `frontend/` passed.

## 2026-11-15 — Persistence Repositories and Request History

### Implementation steps

1. Added SQLAlchemy repositories for workspaces, collections, saved requests, environments, and request history; connected the bridge to workspace, collection, saved-request, environment-variable, and history CRUD operations.
2. Added an initial Alembic schema migration, model lookup indexes, and a unique environment-variable key per environment. Updated `init_db()` to create its data directory and run migrations at application startup.
3. Stored environment secrets in the operating-system keyring instead of the database or bridge response. Persisted environment values are loaded by Python during request preparation and take precedence over frontend-provided values in the environment scope.
4. Added recursive redaction for sensitive saved-request fields and URL query values, and sanitized history snapshots. History excludes environment scopes and response bodies; successful, failed-transport, and cancelled executions record bounded metadata.
5. Added paginated history reads and per-record or full-history deletion. Missing workspaces are reported rather than silently returning empty collection/environment lists.
6. Kept a successful HTTP response available if history persistence fails, returning an explicit warning and logging the failure. Added a non-blocking response-inspector indicator for that warning.
7. Added tests for repository CRUD, secret storage and resolution, sanitization, pagination/deletion, transport failures, database reopen persistence, and history-write failure behavior.

### Validation and evidence

- `python -m pytest -q`: passed (36 tests).
- Frontend production build, Oxlint, and Vitest: passed (2 tests).
- Alembic upgrade and `alembic check` on a fresh isolated database: passed; no model drift detected.
- `init_db()` against a separate isolated data directory: passed and created the schema.
- Targeted Ruff: passed with pre-existing bridge `BLE001`, model formatting/import findings, and intentional model-registration `noqa` directives excluded.
- No manual PyWebView QA was performed.

### Remaining limitations

- History records request configuration and response metadata only; response bodies and variable scopes are intentionally excluded.
- The network-policy DNS preflight still does not pin the resolved IP to the HTTP connection; the rebinding limitation noted above remains.

## 2026-11-15 — Full Frontend Persistence & Bridge Sync Integration

### Implementation steps

1. Extended TypeScript bridge types in `frontend/src/bridge/types.ts` to cover complete backend bridge capabilities: `get_collections`, `create_collection`, `update_collection`, `delete_collection`, `save_request`, `update_saved_request`, `delete_saved_request`, `get_environments`, `create_environment`, `update_environment`, `delete_environment`, `set_environment_variable`, `delete_environment_variable`, and paginated `get_request_history`.
2. Updated mock fallback in `frontend/src/bridge/client.ts` with comprehensive development mock handlers for browser previewing without the native Python PyWebView process.
3. Connected initial application bootstrap in `App.tsx` on mount:
   - Queries `get_workspaces()` to obtain the default workspace ID.
   - Loads collections and nested requests via `get_collections()` and `get_collection_requests()`.
   - Synchronizes persistent environments via `get_environments()`.
   - Hydrates execution history via `get_request_history()`.
4. Connected UI actions to persistent bridge APIs in `appStore.ts`:
   - Adding a collection persists through `create_collection()` with active workspace context.
   - Adding an environment persists through `create_environment()` with active workspace context.
   - Clearing history invokes `clear_request_history()` in Python SQLite storage.
   - Added `saveRequestToCollection()` to persist requests via `save_request()`.
5. Connected Request Saving in `URLBar.tsx`:
   - Clicking the bookmark icon displays a focused popover to specify the request name and destination collection.
   - Saving persists the request in the local database and clears the dirty indicator.
6. Added inline collection creation UI to `NavigationSidebar.tsx`.

### Validation and evidence

- `npm.cmd run build` from `frontend/`: passed (TypeScript build and Vite production assets generated in `frontend/dist/`).
- `npx.cmd vitest run` from `frontend/`: passed (2 tests in `appStore.test.ts`).
- `python -m pytest -q` from root: passed (36 tests in 7.10s).
- All changes strictly maintained in the frontend layer without altering Python backend code.


## 2026-11-15 — Testing Center — Engine, Persistence, Bridge, and Live Frontend

### Implementation steps

#### Python — Testing Engine

1. Added `src/kurorelay/engines/testing/engine.py` — `TestingEngine` with `evaluate_one` and `evaluate_all`:
   - `status_eq` / `status_in`: compare HTTP status code against expected value or set.
   - `response_time_lt`: compare `duration_ms` against threshold.
   - `header_eq` / `header_exists`: case-insensitive header matching.
   - `json_exists` / `json_eq`: simplified JSONPath traversal supporting `$.field.nested[index]` without an external library dependency.
   - `cookie_exists` / `cookie_eq`: checked via `set-cookie` response header.
   - `json_schema`: full JSONSchema validation via the already-declared `jsonschema` dependency.
   - `evaluate_all` returns `{total, passed, failed, results[]}`.
   - `extract_json_path` tokenizer tested in isolation.

#### Python — Testing Models and Repositories

2. Added `src/kurorelay/database/models/testing.py` — `TestSuite` and `TestCase` SQLAlchemy models:
   - `TestSuite`: workspace-scoped suite with name, description, and cascaded child cases.
   - `TestCase`: suite-scoped assertion record with `assertion_type` and `assertion_config_json` (JSON blob).
   - Both models carry `__test__ = False` to prevent pytest collection warnings.

3. Updated `src/kurorelay/database/models/__init__.py` to register `TestSuite` and `TestCase`.

4. Added `src/kurorelay/database/repositories/testing.py` — `TestSuiteRepository` and `TestCaseRepository` with CRUD operations; both carry `__test__ = False`.

#### Python — Alembic Migration

5. Created `alembic/versions/5b9d70c06a42_add_test_suites_and_cases.py` migration:
   - `test_suites` table: `id`, `workspace_id` (FK→workspaces), `name`, `description`, `created_at`, `updated_at`.
   - `test_cases` table: `id`, `suite_id` (FK→test_suites), `request_id` (FK→requests, nullable SET NULL), `name`, `assertion_type`, `assertion_config_json`, `created_at`, `updated_at`.
   - Indices on `workspace_id`, `suite_id`, `request_id`.
   - Full `downgrade()` with index and table drops.
   - Idempotent: running `init_db()` twice after migration succeeds cleanly.

#### Python — Bridge API — Testing Commands

6. Added the following bridge methods to `src/kurorelay/bridge/api.py`:
   - `evaluate_assertions(payload)` — evaluates a list of assertions against a provided response dict.
   - `get_test_suites(workspace_id?)` — lists suites for workspace (defaults to system default).
   - `create_test_suite(payload)` — persists a new suite.
   - `delete_test_suite(suite_id)` — deletes a suite and cascades cases.
   - `get_test_cases(suite_id)` — lists assertion cases for a suite.
   - `create_test_case(payload)` — persists a new assertion case.
   - `delete_test_case(case_id)` — removes a single case.
   - `run_test_suite(suite_id)` — loads all cases for a suite, executes linked requests (if `request_id` set) via `RequestService`, falls back to a neutral mock response for unlinked cases, evaluates all assertions, and returns a full run report.
   - **Fix:** `run_test_suite` now collects serialized case data (id, type, name, request_id, config) while the SQLAlchemy session is still open, then processes each record after the session closes — preventing `DetachedInstanceError` on lazy attribute access.

#### Frontend — Bridge Types

7. Extended `frontend/src/bridge/types.ts` with:
   - `TestSuiteDto`, `TestCaseDto`, `AssertionResultDto`, `TestSuiteRunReportDto` interfaces.
   - All new bridge methods added to the `BridgeAPI` interface.

8. Updated `frontend/src/bridge/client.ts` mock fallback to implement all new bridge methods with realistic dev-mode data.

#### Frontend — TestingCenterView Rewrite

9. Replaced static placeholder `TestingCenterView.tsx` with a fully live component:
   - Loads test suites from bridge on mount; seeds an "API Regression Suite" with 3 default assertions if the workspace is empty.
   - Clicking a suite loads its assertion cases from the bridge.
   - **Run Suite** button calls `bridge.api.run_test_suite()`, receives the report, and updates each case row with live pass/fail results and expected/actual values.
   - **New Suite** modal: creates and persists a new suite to Python.
   - **Add Assertion** modal: supports `status_eq`, `response_time_lt`, `json_eq`, `json_exists`, `header_eq` types with contextual input fields; persists the case to Python.
   - Hover-reveal delete button on each suite row calls `delete_test_suite`.
   - Pending assertions show a neutral (dash) indicator before a suite run; passed/failed show green check / red X.

10. Widened `TestCaseItem.type` in `frontend/src/types/models.ts` to accept all assertion type strings from the backend.

### Validation and evidence

- `python -m pytest -q`: **48 passed** in 7.42s (up from 36 previously).
- `npm.cmd --prefix frontend run build`: TypeScript build + Vite production bundle — **passed** (306 kB JS).
- `npx.cmd --prefix frontend vitest run`: **2 frontend tests passed**.
- `python -c "from kurorelay.database.base import init_db; init_db(); ..."` — idempotent on first and second run.
- Alembic migration `5b9d70c06a42` applied cleanly on live database.
- Ruff auto-fixed import ordering and quote-style findings; `BLE001` suppressed with `# noqa` on broad catch in engine evaluation loop.

### Architecture decisions

- `run_test_suite` uses a session-scoped read phase (collect all case specs as plain dicts) followed by a session-free evaluation phase, avoiding SQLAlchemy `DetachedInstanceError` on lazy attribute access after session close.
- JSONPath navigation implemented without `jsonpath_ng` (not in `pyproject.toml` dependencies) using a minimal recursive token traversal that covers the patterns required by the PRD.
- Linked requests in test cases trigger real HTTP execution via `RequestService`; unlinked cases use a neutral `200 OK` mock response — allowing assertion-only tests without a bound request.

### Remaining work

1. `run_test_suite` for linked requests uses one `asyncio.run()` call per case — suitable for MVP; a shared event loop would be more efficient for large suites.
2. Frontend: `HistoryView` and `SettingsView` can consume real persistence data (environments, settings) from the bridge.
3. `alembic check` should be run to verify no model drift before packaging.
4. API Explorer (Phase 5) — OpenAPI import and endpoint list — not yet started.


---

## Session 6 — UI Wiring Sprint (2026-11-15)

### Goals
Wire all partially-stubbed views to real bridge data, add Toast notification system, improve empty states.

### Changes Made

#### New files
| File | Description |
|---|---|
| `frontend/src/stores/toastStore.ts` | Zustand store: `addToast(message, type)`, auto-dismiss after 4 s |
| `frontend/src/components/ui/Toast.tsx` | `<ToastContainer>` — fixed bottom-right, 2px left colored border per type |

#### Modified files
| File | What changed |
|---|---|
| `frontend/src/index.css` | Added `@keyframes fade-in` + `.animate-fade-in` utility |
| `frontend/src/App.tsx` | Mounted `<ToastContainer>`, wrapped root in `<>…</>` fragment, replaced empty-tab placeholder with Welcome screen (title + New Request button + keyboard shortcuts) |
| `frontend/src/components/views/HistoryView.tsx` | Full rewrite: loads fresh from `bridge.api.get_request_history()` on mount; groups entries by date (Today / Yesterday / DD MMM YYYY); per-row delete via `delete_history_item`; click row calls `openTab()` to restore; shows toast on clear/delete |
| `frontend/src/components/views/EnvironmentsView.tsx` | Full rewrite: loads from `bridge.api.get_environments()`; activate env via `update_environment({is_active: true})`; create/delete env from bridge; inline variable editing with 600 ms debounce save; masked secrets with reveal toggle; `●` active indicator in accent color; toasts on all mutations |
| `frontend/src/components/views/SettingsView.tsx` | Full rewrite: loads from `bridge.api.get_settings()` on mount; saves each field on blur/toggle via `bridge.api.update_setting()`; General / Requests / Security sections; toast on save success |
| `frontend/src/bridge/types.ts` | Added `get_settings` and `update_setting` to `BridgeAPI` interface |
| `frontend/src/bridge/client.ts` | Added mock fallbacks for `get_settings` and `update_setting` |
| `src/kurorelay/bridge/api.py` | Added `ApplicationSettings` import; added `get_settings()` and `update_setting()` bridge methods; `_SETTINGS_DEFAULTS` class var with 4 default keys; `update_setting` upserts the KV row via SQLAlchemy |

#### Python ruff
- Introduced `import typing` and `typing.ClassVar` annotation for `_SETTINGS_DEFAULTS` to satisfy `RUF012`
- All pre-existing `BLE001` warnings unchanged (pre-existing pattern throughout file)

### Test Results
```
python -m pytest -q          → 48 passed in 7.29s   ✓
npx vitest run               → 2 passed             ✓
npm run build                → clean, 315 kB JS     ✓
```

### Design compliance
- Toasts: `--color-surface-3` background, `--color-border` border, 2px left edge coloured per type (success/error/info/warning), 4 s auto-dismiss, `animate-fade-in`, close button
- History: grouped by date labels, per-row delete appears on group hover, click restores full tab
- Environments: `●` indicator using `--color-accent` for active env, secrets masked with `password` input type, reveal icon on hover, `Active` badge for active env
- Settings: loads from Python, persists on change — no more local-only state

### Open items / next phases
1. Phase 5 — API Explorer: OpenAPI / Swagger import, endpoint list auto-population
2. Phase 6 — Mock Server: define route → response rules
3. Settings keys could be extended (`ssl_client_cert_path`, `proxy_url`, etc.)
4. `alembic check` before packaging to catch model drift


---

## Session 7 — UI Bugfixes, Collection Management & Resizable Panels (2026-11-15)

### Issues Addressed
1. **Closing tabs bug**: Closing the last request tab created a fallback tab automatically without user request.
2. **Collection management missing**: Collections sidebar did not allow adding requests, folders, renaming, or deleting collections/requests.
3. **Fixed widget sizes**: User could not resize the Request Config and Response Inspector panels, or the Navigation Sidebar width.
4. **Response screen UI & empty states**: Response inspector was cramped/fixed `h-64`, showed empty tabs (like Cookies) when no response existed, and lacked cookie parsing.
5. **Request creation, saving & editing**: Request tabs did not preserve collection/request association, requiring re-selection on every save and preventing direct updates.

### Changes Made

#### Python Backend
| File | Changes |
|---|---|
| `src/kurorelay/database/repositories/collections.py` | Added folder persistence methods: `create_folder`, `list_folders`, `get_folder`, `update_folder`, `delete_folder` using `CollectionFolder`. |
| `src/kurorelay/bridge/api.py` | Added folder bridge endpoints: `create_collection_folder`, `get_collection_folders`, `update_collection_folder`, `delete_collection_folder`, and `_serialize_folder`. |

#### Frontend
| File | Changes |
|---|---|
| `frontend/src/bridge/types.ts` | Added `CollectionFolderPayload` interface and folder bridge method signatures to `BridgeAPI`. |
| `frontend/src/bridge/client.ts` | Added mock fallbacks for folder bridge methods for dev preview mode. |
| `frontend/src/types/models.ts` | Added `FolderItem` interface; added `folders?: FolderItem[]` to `CollectionItem`; added `folderId?: string \| null` to `SavedRequestItem`. |
| `frontend/src/stores/appStore.ts` | - Fixed `closeTab`: now leaves `tabs: []` and `activeTabId: ""` when all tabs close.<br>- Added `savedRequestId`, `collectionId`, `folderId` to `RequestTab`.<br>- Implemented `deleteCollection`, `renameCollection`, `addFolder`, `renameFolder`, `deleteFolder`, `updateSavedRequest`, `deleteSavedRequest` with bridge persistence. |
| `frontend/src/components/layout/NavigationSidebar.tsx` | - Full collection management: hover actions for `+ Add Request`, `📁+ Add Folder`, `✏️ Rename`, and `🗑 Delete`.<br>- Folders support: expand/collapse, add request inside folder, rename/delete folder.<br>- Requests in collection: click to open in tab with full association, inline rename, delete.<br>- Empty collection state with quick `+ Add Request` / `+ Add Folder` buttons.<br>- Search input now actively filters collections, folders, and requests. |
| `frontend/src/components/request/URLBar.tsx` | - Smart save logic: if tab has `savedRequestId`, clicking Save (or `Ctrl+S`) directly updates the saved request in the DB.<br>- If new request, opens Save modal with pre-selected collection/folder, attaching IDs upon save.<br>- Added `Ctrl+S` keyboard shortcut listener.<br>- Visual `isDirty` indicator on the Save button. |
| `frontend/src/components/response/ResponseInspector.tsx` | - Changed from fixed `h-64` to `flex-1 min-h-0` for fluid resizing.<br>- Clear "Ready for execution" placeholder when no response has run.<br>- Added cookie parser that extracts `Set-Cookie` headers into a structured Name/Value/Domain/Path/Flags table.<br>- Enhanced status badge styling (2xx green, 4xx amber, 5xx red).<br>- Auto-switches to Body tab when fresh response arrives. |
| `frontend/src/App.tsx` | - Added vertical resizable split divider between Request Config and Response Inspector (with smooth drag handle and min-bounds).<br>- Added horizontal resizable split handle for Navigation Sidebar width (180px - 480px).<br>- Updated bootstrap logic to load collections along with their folders and requests. |

### Verification
```
python -m pytest -q          → 48 passed
npx vitest run               → 2 passed
npm run build                → Clean build (0 errors)
```


---

## Session 8 — Resizable Sidebar Bugfix & Break-to-Hide (2026-11-15)

### Issues Addressed
1. **Collections Gap in Resize**: `NavigationSidebar` had a hardcoded `w-64` class, preventing it from expanding to fill the parent container when `sidebarWidth` was resized, leaving a dark empty gap.
2. **Break-to-Hide Behavior**: When resizing the sidebar below `min-w`, user requested it should automatically hide/collapse, and allow re-showing it easily.

### Changes Made
- `NavigationSidebar.tsx`: Changed root container from `w-64 border-r` to `w-full h-full overflow-hidden`, allowing all collection rows and titles to fluidly take the exact width of the resized sidebar without any gaps.
- `appStore.ts`: Added `setSidebarCollapsed: (collapsed: boolean) => void`.
- `App.tsx`:
  - Implemented `MIN_SIDEBAR_WIDTH = 180` and `COLLAPSE_THRESHOLD = 110`.
  - When dragging left below 110px, the sidebar automatically snaps shut and hides (`setSidebarCollapsed(true)`).
  - When dragging or clicking the collapsed edge strip beside `ActivityBar`, it smoothly re-expands to previous healthy width.
  - Added global `Ctrl+B` (and `Cmd+B`) keyboard shortcut to toggle sidebar.
  - Added visual collapsed trigger strip next to `ActivityBar` with indicator line.
  - Added `Ctrl+B` to the Welcome screen shortcuts guide.

### Verification
```
npm run build    → Clean production build (0 errors)
npx vitest run   → 2 passed
```


---

## Session 9 — Fix Request Creation & Instant Sidebar Card Update (2026-11-15)

### Problem Identified
1. Clicking `+` on a collection or folder only opened an empty tab in the workspace without actually creating or displaying a request card in the collection/folder hierarchy.
2. Saving a request did not attach the generated `savedRequestId` to the tab, and if the collection ID was temporary or unmapped, `save_request` failed with `Collection does not exist`, causing no card to appear in the UI while displaying a false success toast.

### Fixes Implemented
- **Python Bridge (`src/kurorelay/bridge/api.py`)**:
  - `create_collection`: Auto-resolves missing or `"default"` workspace IDs to the default workspace.
  - `save_request`: Resiliently resolves collections; if an unmapped collection ID is supplied, it gracefully attaches to an existing collection or creates one, preventing validation failure.
- **Store (`frontend/src/stores/appStore.ts`)**:
  - Implemented `createRequestInCollection(collectionId, folderId, name)` which immediately creates the request, saves it, and appends it to `col.requests`.
  - Updated `saveRequestToCollection` to always return the effective `SavedRequestItem` and ensure it is stored in state.
- **Sidebar (`frontend/src/components/layout/NavigationSidebar.tsx`)**:
  - `handleAddRequest` now calls `createRequestInCollection`, instantly rendering the request card under the collection/folder, expanding the hierarchy, and opening the tab linked to that request.
- **Request URLBar (`frontend/src/components/request/URLBar.tsx`)**:
  - Attaches `savedRequestId: saved.id` to the tab upon initial save, so subsequent saves update the exact card.

### Verification
```
python -m pytest -q    → 48 passed in 11.25s
npx vitest run         → 2 passed
npm run build          → Clean build (0 errors)
```

---

## Session 10 — UI Bug Fixes: Bridge Readiness Sync, Collection Title Truncation & Request Persistence (2026-11-15)

### Problems Addressed (from User Screenshots)
1. **Bridge Desync & Unsaved Cards in Hierarchy**: In the PyWebView app, initial `bootstrap()` was running before `window.pywebview` was fully injected, causing the app to read mock collections instead of real SQLite database records, leading to ID mismatches where requests saved to collections like "kuro" were written to SQLite but not displayed in the sidebar.
2. **Collection Title Truncation (`HTTPBin Test Su..`)**: Hover action buttons had `opacity-0 flex shrink-0`, occupying ~100px in the layout even when invisible, forcing long collection names to truncate prematurely.
3. **Vertical Split Imbalance**: The request/response split defaulted to 55% with occasional high drag percentages leaving empty space in the request builder.
4. **Collection & Folder Asynchronous Persistence**: `addCollection` and `addFolder` now wait for the bridge response to assign the exact database UUID to items before further requests are attached.

### Fixes Applied
- **Bridge Client (`frontend/src/bridge/client.ts`)**:
  - Enhanced `waitForReady` to listen to the `'pywebviewready'` window event alongside rapid interval polling.
- **Application Bootstrap (`frontend/src/App.tsx`)**:
  - Added `await bridge.waitForReady(3000)` at the beginning of `bootstrap()` so the frontend reliably connects to the active PyWebView backend and SQLite database before reading workspaces and collections.
  - Reset default `splitPercent` to 50% for balanced layout.
- **Store Updates (`frontend/src/stores/appStore.ts`)**:
  - `addCollection`: Awaits `bridge.api.create_collection` and stores the collection with its persistent ID immediately.
  - `addFolder`: Awaits `bridge.api.create_collection_folder` and stores the folder with its persistent ID.
  - `saveRequestToCollection`: Safely handles `folderId` and ensures `effectiveReq` is appended to the correct collection matching either `res.request.collection_id` or `collectionId`.
- **URL Bar (`frontend/src/components/request/URLBar.tsx`)**:
  - Updated save confirmation to correctly pass target collection name to the bridge and update the active tab with `saved.collectionId` and `saved.folderId`.
- **Sidebar Layout (`frontend/src/components/layout/NavigationSidebar.tsx`)**:
  - Replaced `opacity-0` with `hidden group-hover/col:flex`, `hidden group-hover/folder:flex`, and `hidden group-hover/req:flex` on action button clusters so collection names occupy the full width of the sidebar without clipping.
  - Added safe `(col.requests || [])` handling to prevent empty list exceptions.
- **Python Bridge (`src/kurorelay/bridge/api.py`)**:
  - Enhanced `save_request` collection resolution: looks up existing collections by name when temporary IDs are passed, preventing fallback to mismatched collections.

### Verification
```
python -m pytest -q    → 53 passed in 8.15s (100%)
npx vitest run         → 2 passed
npm run build          → Clean build (0 errors)
```

---

## Session 11 — Full Persistence on App Restart: Zustand Persist & Workspace Sync (2026-11-15)

### Problem Identified
- When closing and reopening the app (or refreshing), the application appeared to start from zero with no open tabs, collapsed collections, or default mock state, because:
  1. Zustand store had no `persist` middleware, so tabs, active tab, environments, and local collection states were not preserved across sessions.
  2. In `App.tsx`, if the SQLite bootstrap query returned 0 collections for the first workspace in list (e.g. from automated test runs), it was wiping out local collections with an empty list.
  3. `NavigationSidebar` defaulted `expandedCols` to only `{ "col-1": true }`, leaving all user collections collapsed by default on reload.

### Fixes Applied
- **Store Persistence (`frontend/src/stores/appStore.ts`)**:
  - Integrated Zustand's `persist` middleware with `safeStorage` (gracefully supporting browser `localStorage` and node/test environments).
  - Persists `collections`, `environments`, `activeEnvironmentId`, `activeWorkspaceId`, `tabs`, `activeTabId`, and `history` across restarts.
- **Smart Workspace & Collection Rehydration (`frontend/src/App.tsx`)**:
  - Added workspace discovery to identify which workspace contains collections rather than blindly defaulting to the first workspace in the database.
  - Ensures local collections are never overwritten by an empty query result from the backend.
- **Sidebar Auto-Expansion (`frontend/src/components/layout/NavigationSidebar.tsx`)**:
  - `isColExpanded` now defaults to `true` for all collections, so saved collections and requests are instantly visible upon opening the app without needing manual clicks to expand.

### Verification
```
python -m pytest -q    → 53 passed in 8.50s (100%)
npx vitest run         → 2 passed in 541ms
npm run build          → Clean production build in 2.18s (0 errors)
```

## Session 12 — Phase 5: API Explorer Wiring & NavigationSidebar Explorer Panel (2026-11-15)

### Goals
- Wire `APIExplorerView` into `App.tsx` module switch
- Upgrade `NavigationSidebar` explorer panel with real spec data from `useExplorerStore`
- Fix all TypeScript build errors in `APIExplorerView.tsx`
- Verify: `npm run build` clean, `python -m pytest -q` 56 passed, `npx vitest run` 2 passed

### Changes

#### `frontend/src/App.tsx`
- Added `import { APIExplorerView } from "./components/views/APIExplorerView";`
- Added `activeModule === "explorer" ? <APIExplorerView />` branch to module switch block (between `settings` and fallback collections/request builder)

#### `frontend/src/components/layout/NavigationSidebar.tsx`
- Added imports: `FileCode2`, `Tag` from lucide-react; `useExplorerStore` from `../../stores/explorerStore`
- Added `setActiveModule` to main `useAppStore()` destructure
- Added `useExplorerStore()` destructure: `explorerSpec`, `explorerSelectedTag`, `selectedEndpointId`, `explorerSearch`, `setSelectedTag`, `setSelectedEndpointId`, `setExplorerSearch`, `clearSpec`
- Replaced placeholder `explorer` panel with full interactive sidebar:
  - Empty state: FileCode2 icon + "No spec loaded" message + link to open API Explorer
  - Spec header: title, version badge, format badge (OpenAPI/Swagger), unload (×) button
  - Search input: filters endpoints by path/summary in real time
  - Tag filter pills: "All" + one pill per tag from spec; active pill uses Electric Lime accent
  - Endpoint list: scrollable, each row shows method (colored) + path; clicking selects endpoint and switches to explorer module

#### `frontend/src/components/views/APIExplorerView.tsx`
- Removed unused imports: `Download`, `ExternalLink`
- Removed unused destructured `selectedEndpointId` from `useExplorerStore()` (already derived via `getSelectedEndpoint()`)
- Fixed TS2322 on `sample_json`: changed JSX condition from `{activeResp.sample_json && ...}` to `{Boolean(activeResp.sample_json) && ...}` and added `as Record<string, unknown>` cast in `JSON.stringify`

### Verification
| Check | Result |
|---|---|
| `npm run build` | ✅ Clean, 0 errors |
| `python -m pytest -q` | ✅ 56 passed |
| `npx vitest run` | ✅ 2 passed |

### Phase 5 Status
All Phase 5 deliverables complete:
- ✅ Python bridge: `parse_openapi_spec` + `import_openapi_collection`
- ✅ OpenAPI bridge tests (3 tests)
- ✅ Frontend types + bridge mocks
- ✅ `explorerStore.ts` with persist middleware
- ✅ `APIExplorerView.tsx` — full import/explore/try UI
- ✅ Wired into `App.tsx`
- ✅ `NavigationSidebar` explorer panel with live spec data
- ✅ `ActivityBar` already had explorer (Compass icon) from prior session

## Session 13 — Phase 6: Workflow Studio (2026-11-15)

### Goals
- Build Workflow Studio for chaining sequential requests and extracting runtime variables across steps
- SQLAlchemy models: `Workflow` and `WorkflowStep`
- Engine: `WorkflowEngine` with CRUD, step execution, and JSON path variable extraction
- Bridge endpoints: `list_workflows`, `create_workflow`, `get_workflow`, `update_workflow`, `delete_workflow`, `run_workflow`
- Unit tests: 6 tests covering engine and bridge methods
- Frontend: DTO types, bridge mock implementations, `useWorkflowStore` Zustand store with `safeStorage`
- View: `WorkflowStudioView.tsx` with workflow list, step chain builder, variable extraction configuration, and live execution results runner
- Navigation: sidebar integration in `NavigationSidebar.tsx` and module route in `App.tsx`
- Verification: clean `npm run build`, all vitest tests pass, all 62 pytest tests pass

### Changes

#### `src/kurorelay/database/models/workflow.py`
- Created `Workflow` and `WorkflowStep` SQLAlchemy models with foreign keys, cascade deletes, and ordering by `order_index`.
- Registered models in `src/kurorelay/database/models/__init__.py`.

#### `src/kurorelay/engines/workflows/engine.py`
- Implemented `WorkflowEngine`:
  - `list_workflows(workspace_id)`
  - `create_workflow(workspace_id, name, description)`
  - `get_workflow(workflow_id)`
  - `update_workflow(workflow_id, name, description, steps)`
  - `delete_workflow(workflow_id)`
  - `run_workflow(workflow_id, variable_scopes)` with support for extracting variables using dot-notation JSON path into subsequent steps.

#### `src/kurorelay/bridge/api.py`
- Added bridge endpoints:
  - `list_workflows`
  - `create_workflow`
  - `get_workflow`
  - `update_workflow`
  - `delete_workflow`
  - `run_workflow`
- Wired `WorkflowEngine` into `KuroRelayAPI.__init__`.

#### `tests/unit/test_workflow_bridge.py`
- Added 6 unit tests covering workflow creation, listing, step updates, execution, deletion, and bridge validation. All 6 pass.

#### `frontend/src/bridge/types.ts` & `client.ts`
- Added `WorkflowStepDto`, `WorkflowDto`, `WorkflowStepResult`, `WorkflowRunResult` to types.
- Added mock handlers in `client.ts` for browser-only dev mode.

#### `frontend/src/stores/workflowStore.ts`
- Created `useWorkflowStore` with `persist` middleware and fallback `safeStorage` for test environments.
- Implemented actions for workflow CRUD, step mutations, and running workflows.

#### `frontend/src/components/views/WorkflowStudioView.tsx`
- Left panel: list of workflows in the workspace with step counts, inline creation, and deletion.
- Right canvas:
  - Step chain editor with method selector (GET/POST/PUT/PATCH/DELETE), URL input, step reordering/deletion.
  - Collapsible variable extraction section (variable name + JSON path).
  - Top action bar with inline rename and "Run Workflow" trigger.
  - Run results inspection panel showing step status, execution latency, response status, errors, and extracted variable values.

#### `frontend/src/App.tsx` & `NavigationSidebar.tsx`
- Added route for `activeModule === "workflows"` rendering `<WorkflowStudioView />`.
- Added interactive workflows list in `NavigationSidebar.tsx` with quick navigation and step counter.

### Verification
| Check | Result |
|---|---|
| `npm run build` | ✅ Clean (0 errors, 396 kB bundle) |
| `npx vitest run` | ✅ 2 passed |
| `python -m pytest -q` | ✅ 62 passed (including 6 new workflow tests) |

### Phase 6 Status
- ✅ All Phase 6 deliverables complete.

## Session 14 — Phase 7: Advanced Protocols (WebSocket, GraphQL, SSE) (2026-11-15)

### Goals
- Implement Phase 7: Advanced Protocols (WebSocket, GraphQL, Server-Sent Events)
- Backend:
  - `WebSocketManager`: Live connection lifecycle, message send/receive loops, message buffering and polling.
  - `GraphQLClient`: AST query validation via `graphql-core`, query/mutation execution, latency measurement, and full introspection (`__schema` queries, mutations, object types).
  - `SSEManager`: Streaming event receiver using `httpx-sse` with fallback line-by-line event parser, event buffering, and polling.
  - Bridge endpoints: `websocket_connect`, `websocket_send`, `websocket_poll`, `websocket_disconnect`, `execute_graphql`, `introspect_graphql`, `sse_connect`, `sse_poll`, `sse_disconnect`.
  - Unit tests: 6 new tests covering validation, execution, schema introspection, and bridge integration.
- Frontend:
  - Types in `bridge/types.ts` & mock handlers in `bridge/client.ts`.
  - Protocol support in `URLBar.tsx`: methods `GRAPHQL`, `WS`, and `SSE` with protocol-specific URL placeholders.
  - Protocol color accents in `formatting.ts`.
  - `GraphQLPanel.tsx`: Query editor, Variables editor, Schema Introspector with type/query/mutation explorer, and formatted GraphQL response inspector.
  - `WebSocketPanel.tsx`: Connect/Disconnect toggle with live connection indicator, message composer with Ctrl+Enter shortcut, and live message stream viewer with Sent/Received filters and timestamps.
  - `SSEPanel.tsx`: Listen/Disconnect toggle with pulsating stream indicator, event type filter, and real-time event feed with ID/timestamp/data inspection.
  - Routing in `App.tsx`: seamlessly renders the appropriate protocol panel when `tab.method` is `GRAPHQL`, `WS`, or `SSE`.
- Verification: clean `npm run build`, vitest pass, all 68 pytest tests pass.

### Changes

#### `src/kurorelay/engines/protocols/`
- `websocket_client.py`: Implemented `WebSocketSession` and `WebSocketManager` managing thread-safe async loops and message queues.
- `graphql_client.py`: Implemented `GraphQLClient` with `validate_query`, `execute`, and `introspect`.
- `sse_client.py`: Implemented `SSESession` and `SSEManager` reading and buffering SSE event streams.
- `__init__.py`: Exported protocol managers.

#### `src/kurorelay/bridge/api.py`
- Initialized `_ws_manager`, `_graphql_client`, and `_sse_manager` in `KuroRelayAPI`.
- Added bridge endpoints:
  - `websocket_connect`, `websocket_send`, `websocket_poll`, `websocket_disconnect`
  - `execute_graphql`, `introspect_graphql`
  - `sse_connect`, `sse_poll`, `sse_disconnect`

#### `tests/unit/test_protocols_bridge.py`
- Added 6 unit tests covering:
  - Query validation (`test_graphql_validation`)
  - Query execution with mocked HTTP response (`test_graphql_execute_mocked`)
  - Schema introspection parsing (`test_graphql_introspect_mocked`)
  - WebSocket URL validation (`test_websocket_manager_url_validation`)
  - SSE URL validation (`test_sse_manager_url_validation`)
  - Bridge endpoints error handling (`test_bridge_protocol_endpoints`)

#### `frontend/src/bridge/`
- Added DTO interfaces in `types.ts`: `WebSocketMessageItem`, `WebSocketPollResult`, `GraphQLResult`, `GraphQLIntrospectionResult`, `SSEEventItem`, `SSEPollResult`.
- Added mock implementations in `client.ts` for browser-only dev preview.

#### `frontend/src/components/protocols/`
- `GraphQLPanel.tsx`: Query & Variables editors, Schema Introspection browser, and live GraphQL response view.
- `WebSocketPanel.tsx`: Bidirectional messaging client, Connect/Disconnect controls, and live message log.
- `SSEPanel.tsx`: Server-Sent Events listener, event type filters, and real-time event cards.

#### `frontend/src/components/request/URLBar.tsx` & `App.tsx`
- Added `GRAPHQL`, `WS`, and `SSE` to method selector with custom placeholder guides.
- In `App.tsx`, routed active tab rendering to the protocol-specific inspector and client panel.

### Verification
| Check | Result |
|---|---|
| `npm run build` | ✅ Clean (0 errors, 420 kB bundle) |
| `npx vitest run` | ✅ 2 passed |
| `python -m pytest -q` | ✅ 68 passed (all 6 new protocol tests passed) |

### Phase 7 Status
- ✅ All Phase 7 deliverables complete.

## Session 15 — Phase 8: Mock Server & Performance Testing (2026-11-15)

### Goals
- Implement Phase 8: Mock Server & Performance/Stress Testing
- Backend:
  - `MockServerManager`: Local HTTP mock server using `ThreadingHTTPServer` bound explicitly to configured host/port (safe default `127.0.0.1:4010`, no silent `0.0.0.0` exposure). Route matching by method and path/wildcard, custom status code, custom response headers, delay/latency simulation, and real-time request logging.
  - `PerformanceEngine`: Concurrent load testing engine with configurable virtual users (1-50 concurrency) and duration (5-60s). Throughput calculation (req/s), latency metrics (min, max, mean, p50, p90, p95, p99), error rate percentage, and timeline tracking.
  - Bridge endpoints: `start_mock_server`, `stop_mock_server`, `get_mock_server_status`, `update_mock_routes`, `clear_mock_requests_log`, `start_performance_test`, `get_performance_test_status`, `stop_performance_test`.
  - Unit tests: 5 new tests in `tests/unit/test_phase8_mock_performance.py`.
- Frontend:
  - Types in `bridge/types.ts` & mock handlers in `bridge/client.ts`.
  - Stores: `mockServerStore.ts` and `performanceStore.ts`.
  - Views:
    - `MockServerView.tsx`: Server status card with Host/Port configuration and Start/Stop toggle, routes management with Add/Edit/Delete/Enable controls, and live request log inspector.
    - `PerformanceTestingPanel.tsx`: Target endpoint configurator, concurrency & duration sliders, live execution progress bar, 4-box metrics grid, latency percentiles card, status code breakdown, and timeline visualizer.
    - Sub-tab integration in `TestingCenterView.tsx`: switches between Functional Assertions and Performance & Load Testing.
    - Interactive Mock Server panel in `NavigationSidebar.tsx`: lists defined routes and server running indicator.
    - Routing in `App.tsx` for `activeModule === "mock"`.
- Verification: clean `npm run build`, vitest pass, all 73 pytest tests pass.

### Changes

#### `src/kurorelay/engines/mock_server/`
- `server.py`: Implemented `MockRoute` and `MockServerManager` with non-blocking lifecycle, route pattern matching, request logging (last 100 requests), and thread-safe operations.
- `__init__.py`: Exported mock server manager.

#### `src/kurorelay/engines/performance/`
- `engine.py`: Implemented `PerformanceEngine`, `PerformanceTestRun`, and `_percentile` calculation function. Supports concurrent thread execution, status breakdown, and per-second metrics timeline.
- `__init__.py`: Exported performance engine.

#### `src/kurorelay/bridge/api.py`
- Initialized `_mock_server` and `_performance_engine` in `KuroRelayAPI`.
- Added endpoints:
  - `start_mock_server`, `stop_mock_server`, `get_mock_server_status`, `update_mock_routes`, `clear_mock_requests_log`
  - `start_performance_test`, `get_performance_test_status`, `stop_performance_test`

#### `tests/unit/test_phase8_mock_performance.py`
- Added 5 unit tests covering:
  - `test_mock_route_matching` (exact, wildcard, method filter, disabled routes)
  - `test_percentile_calculation` (p50, p90, p99, empty array)
  - `test_mock_server_start_request_and_stop` (live HTTP request, response verification, request log)
  - `test_performance_engine_run` (concurrent test execution, metrics validation)
  - `test_bridge_mock_and_performance_endpoints` (bridge API contract)

#### `frontend/src/`
- `bridge/types.ts` & `bridge/client.ts`: DTO definitions and mock fallbacks for all Phase 8 methods.
- `stores/mockServerStore.ts`: Zustand store managing mock server lifecycle, routes, and requests log.
- `stores/performanceStore.ts`: Zustand store managing load test parameters and live metrics polling.
- `components/views/MockServerView.tsx`: Mock server dashboard with route editor and live request inspector.
- `components/performance/PerformanceTestingPanel.tsx`: Load testing runner and metrics visualizer.
- `components/views/TestingCenterView.tsx`: Integrated sub-tab navigation between functional assertions and performance testing.
- `components/layout/NavigationSidebar.tsx`: Active mock routes list and server running status pill.
- `App.tsx`: Module switch renders `<MockServerView />` when `activeModule === "mock"`.

### Verification
| Check | Result |
|---|---|
| `npm run build` | ✅ Clean (0 errors, 453 kB bundle) |
| `npx vitest run` | ✅ 2 passed |
| `python -m pytest -q` | ✅ 73 passed (all 5 new Phase 8 tests passed) |

### Phase 8 Status
- ✅ All Phase 8 deliverables complete.


---

## Session 16 — Local AppData Migration, Alembic Workflows Migration, and Workflow Engine Architecture Fixes (2026-11-15)

### Objectives & Summary
1. **AppData Path Standard Migration**: Migrated the default application and SQLite database directory to `%LOCALAPPDATA%\KuroLabs\KuroRelay\kurorelay.db` on Windows (and platform equivalents on Darwin/Linux). Automatically migrates legacy database files from `~/.kurorelay/kurorelay.db` without data loss.
2. **Alembic Database Migration (`7c8d9e0f1a2b`)**: Created explicit migration for `workflows` and `workflow_steps` tables, keeping Alembic head aligned with all SQLAlchemy metadata tables.
3. **Architecture & Scope Precedence Fixes in Python**:
   - Fixed `DetachedInstanceError` in `WorkflowEngine.run_workflow` caused by session closure before step iteration. Steps are now serialized in-session before execution.
   - Connected `_request_service` and `_history_engine` to `WorkflowEngine` in `KuroRelayAPI.__init__` (previously default-constructed without network/history dependencies).
   - Added `"workflow"` to `allowed_scopes` in `RequestPayload` validation schema and added `"workflow"` to `_SCOPE_PRECEDENCE` in `EnvironmentEngine` so workflow-extracted variables propagate into subsequent request steps.
   - Fixed `MockServerManager.start_mock_server` in bridge API to accept and register initial routes directly from the start payload.
   - Allowed flexible `body`/`response_body` and `enabled`/`is_active` aliases in `MockRoute`.
4. **End-to-End Workflow Demonstration**:
   - Authored and verified `scripts/demo_full_workflow.py` testing live MockServer on 127.0.0.1, 3-step variable chaining (token -> user ID -> item creation), Testing Engine assertions, and sanitized history persistence in SQLite.

### Verification
| Check | Result |
|---|---|
| `npm.cmd --prefix frontend run build` | ✅ Clean (0 errors, 453 kB bundle) |
| `python -m pytest -q` | ✅ 73 passed in 24.63s (100%) |
| `python scripts/demo_full_workflow.py` | ✅ 100% Pass (all 3 steps completed, 3/3 assertions passed, history recorded in LocalAppData SQLite) |


---

## Session 17 — Clean Frontend Rebuild (React 19 + TypeScript + Vite + Tailwind v4) (2026-11-15)

### Objectives & Summary
1. **Fresh Architecture & Scaffolding**:
   - Completely deleted legacy frontend files upon user request while preserving full workspace backup in artifacts.
   - Scaffolded fresh Vite + React 19 + TypeScript frontend with Tailwind v4 (`@tailwindcss/vite`).
   - Configured path aliases (`@/*`), Inter and JetBrains Mono typography, and dark-first high-contrast design token system (`--lime`: `#C8F135`, `--amber`: `#E8923A`, `--bg-base`: `#0C0D0F`, `--bg-s1` through `--bg-s5`).
2. **Reconstructed Layout & Navigation (Same Classic Structure, Modern Native Polish)**:
   - `ActivityBar`: 48px icon rail with Amber active status indicator, quick sidebar toggle, and pinned settings navigation.
   - `Sidebar`: Resizable panel with draggable boundary (min 180px, max 500px, auto-collapse threshold), dynamically hosting `CollectionsView`, `HistoryView`, or `EnvironmentsView`.
   - `TabBar`: Top tab management with method badges, active top-border Electric Lime indicator, dirty state tracking, and tab closing.
   - `URLBar`: Method selector dropdown with semantic badge colors, URL input with lime focus ring, live request execution with loading spinner, and Send button.
   - `Split Workbench`: Draggable vertical divider separating Request Config (top) and Response Inspector (bottom).
3. **Core Request & Response Components**:
   - `KeyValueEditor`: Interactive table for query parameters and headers with toggleable checkboxes, inline editing, and row deletion.
   - `RequestConfigTabs`: Tabbed configuration for Params, Headers, Auth (None, Bearer, Basic, API Key), and Body (None, JSON with CodeMirror, Raw, Form).
   - `ResponseInspector`: Response status pill, latency, payload size, sub-tabs for JSON Pretty View (`react-json-view-lite`), raw CodeMirror view, and response headers table.
4. **All Feature Views & Protocol Panels**:
   - `CollectionsView`: Tree-view hierarchy of collections, folders, and saved requests with direct opening into tabs.
   - `EnvironmentsView`: Dual mode (compact sidebar list + full-screen variable editor with active environment switcher).
   - `HistoryView`: Dual mode (compact recent list + full-screen paginated table with method filters and status indicators).
   - `WorkflowStudioView`: Step sequencer and execution runner with status feedback and assertion reporting.
   - `TestingCenterView`: Assertions engine and load performance testing runner with Recharts timeline graph.
   - `MockServerView`: Live mock server management, route configuration table, and real-time request log.
   - `APIExplorerView`: OpenAPI spec parser and explorer grouped by tags with "Try in Builder" action.
   - `SettingsView`: Application details, LocalAppData paths, database metrics, and configuration inspect.
   - `GraphQLPanel`: Query editor, variables editor, introspect schema tool, and response viewer.
   - `WebSocketPanel`: Live WebSocket echo/stream client with sent/received log and message sender.
   - `SSEPanel`: Server-Sent Events listener with auto-polling and event log.
   - `Toast`: Global notification system via React context.
5. **Bridge Integration & State Management**:
   - Fully-typed `bridge` client for PyWebView with automatic fallback and 50+ API endpoints.
   - Zustand store with Immer and persist middleware managing tabs, active views, collections, history, and workspace context.

### Verification
| Check | Result |
|---|---|
| `npm run build` | ✅ Clean (0 errors, `tsc -b && vite build` in 4.08s) |
| `python -m pytest -q` | ✅ 73 passed in 19.99s (100%) |

### PyWebView Local Asset Loading Fix (Addressing Blank Screen Issue)
- **Root Cause Analysis**:
  1. `find_frontend_url()` in `src/kurorelay/core/lifecycle.py` was returning `dist_path.resolve().as_uri()` (`file:///D:/.../frontend/dist/index.html`).
  2. Because the URL started with `file://`, `webview.util.is_local_url()` evaluated to `False`, preventing PyWebView from spawning its internal HTTP Bottle server.
  3. Under raw `file://` scheme in Windows WebView2 (Chromium), absolute `/assets/...` imports in Vite's generated `index.html` resolved to `file:///assets/...` on drive `D:\` (which does not exist), and ES module `<script type="module">` tags were blocked by CORS / scheme restrictions. This caused the window to remain completely blank/black (`#0D0E10`).
- **Fix Applied**:
  1. Configured `base: "./"` in `frontend/vite.config.ts` so all bundled assets and stylesheets use relative paths (`./assets/...`).
  2. Changed `find_frontend_url()` to return standard local filesystem path `str(dist_path.resolve())` instead of URI format.
  3. Enabled `http_server=True` in `webview.start(debug=settings.debug, http_server=True)` so PyWebView serves `dist/` over an internal loopback HTTP server (`http://127.0.0.1:<random_port>/`), ensuring full ES module, asset, and CORS compatibility in WebView2.
  4. Verified all 73 backend pytest tests and clean frontend build pass.

### Full End-to-End Bridge & UI Interactivity Integration
- **Workspace Bootstrapping**:
  - Automatically loads and sets active workspace on startup (`App.tsx` bootstrap effect).
  - Added interactive Workspace Selector and "+ New Workspace" modal/dropdown to top of Sidebar.
- **Collections Interactivity**:
  - Connected `createCollection` with inline name prompt and automatic reload.
  - Added delete collection (`deleteCollection`) and add request (`saveRequest`) buttons directly on each collection.
  - Implemented safe tree traversal (`col.requests || []`, `col.folders || []`) to prevent runtime render crashes.
  - Added delete request action per item.
- **Request Execution & Persistence**:
  - Added **Save Request** button in `URLBar` (persisting name, method, URL, params, headers, body, auth into collections).
  - Wired `handleSend` to update live Response Inspector and automatically refresh Request History in real-time.
- **Response Inspector Robust Parsing**:
  - Normalized response unwrap supporting both nested `result.response` (status_code, status_text, size_bytes, duration_ms, headers, body) and flat responses.
  - Robust error view surfacing error codes and network failure messages.
- **History Full Normalization & Re-execution**:
  - Normalized snapshot fields (`request_snapshot.method`, `request_snapshot.url`, `response_metadata.status_code`, `duration_ms`).
  - Clicking any history entry now re-opens the request with full method, url, params, headers, and body pre-populated.
  - Wired clear history (`clearRequestHistory`) and individual item deletion (`deleteHistoryItem`).
- **Workflow Studio Interactivity**:
  - Connected `listWorkflows` and `getWorkflow` to load full step arrays on workflow selection.
  - Added "+ Add Step" inline form to create and chain workflow steps.
  - Wired step execution logging and assertions status display.
- **Mock Server & Testing Interactivity**:
  - Fixed status polling to correctly track `is_running`, `port`, and live `requests_log`.
  - Wired clear log button to `clearMockRequestsLog`.

### Collections Request-Click Blackscreen Fix & Resilience Protection
- **Root Cause Analysis**:
  1. When clicking a saved request from a collection, `req.configuration` could contain `params` or `headers` stored as an Object/Record (`{"param": "val"}`) or null rather than an array of `KVPair[]`.
  2. In `RequestConfigTabs.tsx`, calling `tab.params.filter(...)` or in `KeyValueEditor.tsx` calling `pairs.map(...)` on a non-array caused an unhandled `TypeError: filter/map is not a function`.
  3. React 19 unmounts the entire root tree when an uncaught rendering error occurs, resulting in a black blank screen.
  4. In `TabBar.tsx`, `tab.method.length` threw if `method` was undefined.
- **Fix Applied**:
  1. Authored `normalizeKVPairs`, `normalizeBody`, and `normalizeAuth` in `src/lib/cn.ts` to convert any input format (arrays, key-value objects, raw strings, undefined/null) into strictly valid, type-safe structures.
  2. Integrated normalization directly into `newTab()` and `updateTab()` in `src/stores/appStore.ts` so `tab.params` and `tab.headers` are always valid `KVPair[]`.
  3. Added safe fallback `const safePairs = Array.isArray(pairs) ? pairs : []` in `KeyValueEditor.tsx` and `RequestConfigTabs.tsx`.
  4. Guarded `TabBar.tsx` with `(tab.method || "GET")` and `(tab.name || "Untitled")`.
  5. Implemented `ErrorBoundary.tsx` catching any component-level rendering issues gracefully with diagnostic information and a "Reload View" button, preventing blackscreen crashes globally.
  6. Verified `npm run build` (clean in 2.85s) and `pytest -q` (all 73 passed in 16.84s).

## 2026-11-16 — Tab Deduplication, Save Workflow (Ctrl+S & Modal), Collections Polish, and Empty State

### 1. Tab Deduplication & Switching
- Updated `openTab` in `src/stores/appStore.ts` and `openRequest` in `src/components/views/CollectionsView.tsx`:
  - When clicking on any saved request in a collection, the application checks if a tab with that `savedRequestId` is already open.
  - If open, it activates and switches to that existing tab immediately (`setActiveTab(existing.id)`), preserving any in-progress edits and preventing duplicate tabs from opening.
  - If not open, it loads the request into a new tab as before.
- Highlighted currently active open request in the Collections tree (`RequestRow`) with active lime border, bold text, and background indicator.

### 2. Save Workflow (`Ctrl+S` & Save Modal)
- Added global keyboard shortcut listener in `src/App.tsx`:
  - `Ctrl + S` / `Cmd + S`: Checks if current tab already has `savedRequestId`.
    - If yes: directly updates the saved request in the SQLite database via `bridge.updateSavedRequest(...)`, resets `isDirty: false`, updates the collection tree in real-time, and fires a success toast (`Saved "<name>"`).
    - If no (new request): opens `SaveRequestModal`.
  - `Ctrl + N` / `Cmd + N`: Opens a new request tab.
  - `Ctrl + W` / `Cmd + W`: Closes the current active tab.
  - `Ctrl + \`: Toggles the left sidebar.
- Created `src/components/request/SaveRequestModal.tsx`:
  - Clean modal dialog displaying Request Name input, Target Collection dropdown, inline "+ New Collection" creator, and Target Folder selector.
  - Submits via `bridge.saveRequest(...)`, sets `savedRequestId` and `collectionId` on the active tab, and updates the UI without requiring page reloads.
- Connected the "Save" button in `src/components/request/URLBar.tsx` to this exact workflow.

### 3. Collections View Polish & Cleanup
- Removed bulky, non-functional redundant protocol options from collection and folder context menus (which previously cluttered the right-click menu with 4 oversized buttons).
- Replaced with a unified, clean "New Request" action.
- Added real-time request filtering search bar (`Filter requests...`) at the top of Collections with quick-clear button (`X`).
- Added active request indicators and polished row hover states, icons, and counters.

### 4. Workbench Empty State
- Allowed closing all open tabs in `closeTab` (setting `activeTabId: null` when all tabs are closed instead of forcefully spawning a blank request).
- Created `src/components/layout/WorkbenchEmptyState.tsx`:
  - Displays a native, minimalist dark view with glowing Electric Lime branding icon.
  - Provides instant quick-action buttons: "New HTTP Request", "WebSocket", "GraphQL", and "SSE Stream".
  - Includes a keyboard shortcuts cheat sheet (`Ctrl+N`, `Ctrl+S`, `Ctrl+W`, `↵ Enter`, `Ctrl+\`).

### 5. Verification
- `npm run build`: Passed cleanly in 18.27s (0 errors).
- `python -m pytest -q`: 73/73 passed in 19.63s.

## 2026-11-16 — Form Data (`application/x-www-form-urlencoded`) Body Implementation

### 1. Frontend Form Editor
- Replaced the placeholder in `src/components/request/RequestConfigTabs.tsx` (`"Form data — use the key/value table (coming soon)"`) with a full interactive `KeyValueEditor`.
- Added `parseFormPairs` helper to parse form data from JSON strings, objects, or URL-encoded content safely.
- Form fields support:
  - Key input
  - Value input with autocomplete (`VariableInput`)
  - Enable / disable toggle checkbox
  - Delete row and Add Row
  - Clear header badge showing `application/x-www-form-urlencoded`.
- Updated `URLBar.tsx` to serialize form body data appropriately when sending requests.

### 2. Backend Form Body Engine
- Updated `src/kurorelay/bridge/schemas/request.py`:
  - Expanded `RequestBody.type` to `Literal["none", "json", "raw", "form"]`.
- Updated `src/kurorelay/engines/requests/engine.py`:
  - In `RequestEngine.prepare`: automatically injects `Content-Type: application/x-www-form-urlencoded` if not explicitly specified by user.
  - In `RequestEngine._build_content`: handles form data from dict, list of `KVPair` objects (filtering out disabled pairs), or strings, URL-encoding the content using standard `urllib.parse.urlencode`.
  - Supports environment variable resolution within form field values.

### 3. Verification
- Added unit test `test_prepare_form_body_encodes_and_sets_content_type` in `tests/unit/test_request_engine.py`.
- `npm run build`: Built cleanly in 2.06s with 0 errors.
- `python -m pytest -q`: All 74 tests passed in 16.19s.

## 2026-11-16 — Full Workbench & Collections Polish Suite

### 1. API Key Authentication (Frontend & Backend)
- Updated `src/kurorelay/bridge/schemas/request.py`: added `"api_key"` to `AuthConfig.type`.
- Updated `src/kurorelay/engines/authentication/engine.py`: added handling for `api_key` type, setting the custom header name and value into request headers.
- Updated `src/components/request/URLBar.tsx`: serialized `api_key` auth configuration appropriately (`{ key, value }`).
- Added unit test `test_prepare_api_key_auth_sets_custom_header` in `tests/unit/test_request_engine.py`.

### 2. Bidirectional URL ↔ Query Parameters Sync
- Added `buildUrlWithParams` and `parseParamsFromUrl` helpers in `src/lib/cn.ts`.
- In `RequestConfigTabs.tsx`: modifying params in the `KeyValueEditor` updates the URL query string in real-time while preserving the base path.
- In `URLBar.tsx`: typing query parameters in the URL extracts and populates the Params tab in real-time while preserving disabled params.

### 3. Cancel In-Flight Request
- In `src/components/request/URLBar.tsx`: attached a unique `task_id` (`crypto.randomUUID()`) to each request.
- While `tab.isLoading` is active, a red **Cancel** button is displayed. Clicking it calls `bridge.cancelTask(taskId)` and resets the tab state to cancelled.

### 4. Body Prettify JSON & Syntax Validation
- In `src/components/request/RequestConfigTabs.tsx`: added a **Prettify** button with `Sparkles` icon to format JSON with 2-space indentation.
- Added live syntax error validation displaying diagnostic errors when JSON syntax is invalid.

### 5. Response Inspector Copy Body & Save/Download
- In `src/components/response/ResponseInspector.tsx`:
  - Added "Copy" button with immediate clipboard feedback in `BodyPanel`.
  - Added "Save" / Download button allowing one-click download as `response.json` or `response.txt`.
  - Added "Copy Headers" button in `HeadersPanel` to copy all response headers to clipboard.

### 6. TabBar Context Menu
- In `src/components/layout/TabBar.tsx`: added right-click context menu supporting:
  - `Duplicate Tab`
  - `Close Tab`
  - `Close Other Tabs`
  - `Close Tabs to Right`

### 7. Collections Export & Import
- Created `src/lib/collectionImportExport.ts`:
  - `exportCollectionJson`: exports any collection with its folders and requests as clean JSON.
  - `importCollectionFromJson`: parses and imports KuroRelay exports as well as standard **Postman Collection v2.0 / v2.1** formats.
- In `src/components/views/CollectionsView.tsx`:
  - Added "Import Collection" toolbar button with file picker.
  - Added "Export Collection (JSON)" option in the collection right-click context menu.

### 8. Verification
- `npm run build`: Built cleanly in 2.02s with 0 errors.
- `python -m pytest -q`: All 75 tests passed in 15.81s.

## 2026-11-16 — Advanced Workbench Capabilities (All 6 Features Implemented)

### 1. Environment Selector Dropdown in Top Bar
- Created `frontend/src/components/layout/EnvironmentSelector.tsx`.
- Integrated directly into the top `TabBar.tsx` header on the right-hand side.
- Enables seamless switching between active environments (`Local`, `Staging`, `No Environment`) without leaving the active request workbench.
- Displays active environment badge and variable counter.

### 2. Code Snippets Generator (`</> Code`)
- Created `frontend/src/lib/codeSnippetGenerator.ts` and `frontend/src/components/request/CodeSnippetModal.tsx`.
- Added `</> Code` button in `URLBar.tsx`.
- Generates ready-to-copy code snippets for:
  - `cURL` (with formatted headers, path variables, form/multipart flags, and bodies)
  - `JavaScript (Fetch)`
  - `Python (Requests)`
  - `Node.js (Axios)`
- One-click copy with instant visual feedback and syntax-highlighted editor view.

### 3. Response Inspector HTML Preview & Body Search
- In `frontend/src/components/response/ResponseInspector.tsx`:
  - Added `Preview (HTML)` mode alongside `Pretty` and `Raw` in `BodyPanel`.
  - Sandboxed iframe view (`sandbox="allow-same-origin"`) for visual rendering of HTML responses.
  - Added inline body search bar with match counter (`X matches`) and fast text filtering.

### 4. Header Autocomplete in KeyValueEditor
- In `frontend/src/components/request/KeyValueEditor.tsx`:
  - Added `COMMON_HTTP_HEADERS` list containing standard HTTP headers (`Accept`, `Authorization`, `Content-Type`, `User-Agent`, `Cache-Control`, `X-API-Key`, `Origin`, `Referer`, etc.).
  - Added HTML5 `<datalist>` auto-suggestions for all header inputs with zero glitching or overflow clipping.

### 5. Path Variables Support (`:param` and `{param}`)
- Created `frontend/src/lib/pathVariables.ts` with `extractPathVariables`, `syncPathVariables`, and `substitutePathVariables`.
- Extended `Tab` in `frontend/src/stores/appStore.ts` with `pathVariables?: KVPair[]`.
- In `RequestConfigTabs.tsx`:
  - Automatically detects path variables in the URL (e.g. `/:id` or `/{userId}`).
  - Displays a dedicated "Path Variables" section in the `Params` tab.
- In `URLBar.tsx` and `codeSnippetGenerator.ts`:
  - Automatically substitutes path variable values into the URL before dispatching to `bridge.sendRequest` and code generators.

### 6. Multipart Form-Data (File & Field Uploads)
- In `src/kurorelay/bridge/schemas/request.py`:
  - Added `"multipart"` to `RequestBody.type`.
- In `src/kurorelay/engines/requests/engine.py`:
  - Added `_build_content_and_headers` and multipart form-data assembly via `httpx.Request`.
  - Supports text fields, file picking via base64 `fileData`, and direct local file paths from disk.
  - Automatically sets `Content-Type: multipart/form-data; boundary=...`.
- In `RequestConfigTabs.tsx`:
  - Added `Multipart (Files)` option to body type selector.
  - Built interactive `MultipartEditor` supporting row toggles (`Text` vs `File`), file picker button, path input, and delete.
- Added unit test `test_prepare_multipart_form_data` in `tests/unit/test_request_engine.py`.

### 7. Verification & Tests
- `cmd /c "cd /d d:\vscode\Kuro.worktrees\KuroRelay\frontend && npm run build 2>&1"`: Built cleanly with 0 errors.
- `python -m pytest -q`: All 76 tests passed in 19.83s with 100% pass rate.

## 2026-11-16 — Multi-Variable Concatenation & Native File Picker Integration

### 1. Multi-Variable Concatenation / Non-Destructive Insertion
- Fixed `frontend/src/components/ui/VariableInput.tsx`:
  - Previously, `handleSelect` used `lastIndexOf("{{")` which grabbed already-closed variables from the beginning of the string and overwrote them when inserting a second variable.
  - Rewrote trigger detection: checks specifically for an unclosed trigger `\{\{([^}]*)$` immediately before the cursor.
  - If typing an active trigger: replaces only that trigger's prefix.
  - If opening via the `{}` button or inserting within existing text: inserts/pushes `{{variable}}` directly at the caret position without erasing any existing text or previous variables.
  - Enables multiple variables in URL and headers (e.g. `{{PROTOCOL}}://{{BASE_URL}}:{{PORT}}/api/{{VERSION}}`).

### 2. File Upload & Native Desktop File Dialog
- In `src/kurorelay/bridge/api.py`:
  - Added `choose_file` bridge method using `webview.active_window().create_file_dialog(webview.OPEN_DIALOG)` to open the native Windows Open File Dialog directly from the desktop shell.
  - Automatically reads file metadata (`name`, `path`, `mime_type`, and base64 encoded `fileData`).
- In `frontend/src/bridge/client.ts`:
  - Added `bridge.chooseFile()` binding.
- In `frontend/src/components/request/RequestConfigTabs.tsx`:
  - Clicking "Choose" now calls `bridge.chooseFile()` for native OS file selection, with a reliable HTML file input fallback via ref clicks.
  - Resets input value on selection to allow re-selecting the same file.
  - In `src/kurorelay/engines/requests/engine.py`: strips wrapping quotes and whitespace from manual file paths to support direct Windows path pasting.

### 3. Verification & Tests
- `cmd /c "cd /d d:\vscode\Kuro.worktrees\KuroRelay\frontend && npm run build 2>&1"`: Built cleanly in 3.72s with 0 errors.
- `python -m pytest -q`: All 76 tests passed in 22.68s with 100% pass rate.

## 2026-11-16 — Multipart Tab Fallback Fix & Native Save/Export Bridge

### 1. Multipart Tab Fallback Bug Fix
- Identified bug in `frontend/src/lib/cn.ts` `normalizeBody`:
  - `allowedTypes` array was `["none", "json", "raw", "form"]` which omitted `"multipart"`.
  - When clicking `Multipart (Files)`, `updateTab` normalized the body, failed the inclusion check, and defaulted the type back to `"json"`.
  - Added `"multipart"` to `normalizeBody` type validation and return signature. Clicking `Multipart (Files)` now immediately and stably keeps the Multipart tab active.

### 2. Native Save / Export in PyWebView
- In Edge WebView2 inside PyWebView, standard `<a download href="blob:...">` clicks are suppressed or ignored without browser download manager infrastructure.
- Added native `save_file` method in `src/kurorelay/bridge/api.py` and `bridge.saveFile` in `frontend/src/bridge/client.ts`.
- Opens native Windows **Save As** file dialog via `window.create_file_dialog(webview.FileDialog.SAVE, save_filename=...)` and writes content to the selected path.
- Updated `exportCollectionJson` in `collectionImportExport.ts` and `CollectionsView.tsx`: right-clicking and exporting a collection opens the native Save As dialog with prefilled name, writing the `.kuro.json` file and displaying a success toast.
- Updated `handleDownload` in `ResponseInspector.tsx`: saving response payload opens the native Save As dialog, writing `response.json` or `response.txt` with immediate visual feedback (`Saved`).
- Updated Import Collection button to use `bridge.chooseFile` with native file chooser.

### 3. Verification & Tests
- `cmd /c "cd /d d:\vscode\Kuro.worktrees\KuroRelay\frontend && npm run build 2>&1"`: Built cleanly in 2.23s with 0 errors.
- `python -m pytest -q`: All 76 tests passed in 16.18s with 100% pass rate.

## 2026-11-16 — Bulk Edit, Response Enhancements, Quick Environment Eye, & Collection Hierarchy Tools

### 1. Bulk Edit Mode in KeyValueEditor
- Added a seamless `[Table | Bulk Edit]` mode toggle in `frontend/src/components/request/KeyValueEditor.tsx`.
- In Bulk Edit mode, users can view, type, or paste raw multi-line strings (`key: value`), with disabled lines prefixed by `//` or `#`.
- Synchronizes with table rows and updates URL/Headers state in real time.

### 2. Response Inspector Enhancements (Word Wrap, Clear Response, Header Filter)
- In `frontend/src/components/response/ResponseInspector.tsx`:
  - Added **Clear Response** button (`RotateCcw`) in the status bar to reset the response panel on demand.
  - Added **Wrap** toggle button in `BodyPanel` supporting CodeMirror `EditorView.lineWrapping` and JsonView breaking to eliminate horizontal scrolling.
  - Added real-time **Filter Headers** search bar in `HeadersPanel` with match count and clear button.

### 3. Quick Environment Eye / Edit Modal
- Created `frontend/src/components/layout/QuickEnvironmentModal.tsx`.
- Added an Eye icon button (`Eye`) in `EnvironmentSelector.tsx` alongside the active environment badge.
- Clicking the eye opens a sleek in-place modal to:
  - Inspect all variables in the active environment.
  - Edit any variable's value inline with immediate persistence via `bridge.setEnvironmentVariable`.
  - Toggle visibility for secret values (`Eye` / `EyeOff`).
  - Add or delete variables without leaving the request workbench.
  - Provides a one-click shortcut to the full Environments view.

### 4. Collection Hierarchy & Request Organization
- In `frontend/src/components/views/CollectionsView.tsx`:
  - Added **Duplicate Folder**: right-clicking any folder clones it and recursively duplicates all requests inside it.
  - Added **Move to Folder**: right-clicking a request allows moving it to any folder within the collection or back to root.
  - Added request tooltips showing full HTTP method, URL, and request name on hover.

### 5. Verification & Tests
- `cmd /c "cd /d d:\vscode\Kuro.worktrees\KuroRelay\frontend && npm run build 2>&1"`: Built cleanly in 1.94s with 0 errors.
- `python -m pytest -q`: All 76 tests passed in 15.93s with 100% pass rate.

## 2026-11-16 — Environments Page Full Overhaul (Advanced Grid, Bulk Edit, Secrets, Import/Export, Duplicate)

### 1. Environments Architecture & Unified UX
- Refactored `frontend/src/components/views/EnvironmentsView.tsx`:
  - **Sidebar Mode (`sidebar={true}`)**: Streamlined the sidebar list with environment search filter, total variable badges, active state indicators, hover actions (Set Active, Duplicate, Delete), plus New Environment and Import buttons.
  - **Main Workbench (`sidebar={false}`)**: Eliminated duplicate sidebar panes; focused on rich master-detail editing for the selected environment.
  - Added synchronized `selectedEnvironmentId` and `setSelectedEnvironmentId` in `frontend/src/stores/appStore.ts`.
  - Added inline rename with `Edit2`, Enter/blur commit, and immediate bridge update.
  - Added active environment toggle badge and live statistics (`N vars · N enabled · N secrets`).

### 2. Advanced Variable Table Grid
- **Enable / Disable Toggle**: Checkbox on every row allowing temporary deactivation of variables without deleting them (backed by `is_enabled`).
- **Secret Management**:
  - Direct toggle between `Default` (plain text) and `Secret` (stored in OS Keyring).
  - Masked values (`••••••••`) with `Eye` / `EyeOff` toggle.
  - Added `bridge.getEnvironmentVariableSecret(envId, varId)` on Python bridge and `EnvironmentRepository.get_secret_value` to fetch secret values on demand.
  - Fixed `EnvironmentRepository.set_variable` to safely preserve existing secret values when only modifying `is_enabled` flag.
- **Copy Variable Tag**: Quick copy button on each row copying `{{VARIABLE_NAME}}` to clipboard with toast notification.
- **Real-time Variable Search**: Instant filter bar by key or value with counter.
- **Quick Add Row**: Bottom input bar supporting key, value, and secret toggle.

### 3. Bulk Edit Mode (.env style)
- Added mode toggle `[ Table | Bulk Edit (.env) ]`.
- Developers can paste or edit entire `.env` files with `KEY=VALUE` pairs, supporting commented lines (`#` or `//`) to disable variables.
- Clean two-way parser and serializer via `frontend/src/lib/environmentImportExport.ts`.

### 4. Duplicate, Import & Export
- **Duplicate Environment**: Added `duplicate_environment` backend method in `src/kurorelay/bridge/api.py` and `frontend/src/bridge/client.ts` to clone an environment and all its variables (including keyring secrets).
- **Export**: Export as `.env` text file or Postman Environment JSON format via native desktop Save dialog (`bridge.saveFile`).
- **Import**: Import from `.env` or Postman Environment JSON files via native desktop file picker (`bridge.chooseFile`).

### 5. Verification & Tests
- `npm run build`: Succeeded in 2.36s with 0 errors.
- `python -m pytest tests/unit/test_persistence.py -q`: 11/11 passed including new test `test_duplicate_environment_and_secret_retrieval`.
- `python -m pytest -q`: All 77/77 tests passed in 16.15s.

## 2026-11-16 — Environments UX Polish (Context Menus, Global Scope, Color Tags, Multi-select Bulk Delete, Hover Tooltips)

### 1. Right-Click Context Menus (Mouse Right Click)
- **Environment Context Menu**: Right-clicking an environment in the sidebar opens a customized context menu offering:
  - `Set as Active`
  - `Duplicate Environment`
  - `Color Badge` (palette: Green, Amber, Red/Prod, Blue, Purple, Default)
  - `Copy as .env`
  - `Copy as JSON`
  - `Clear All Variables`
  - `Delete Environment`
- **Variable Context Menu**: Right-clicking a variable row in the table opens an action menu:
  - `Copy {{KEY}}`
  - `Copy Raw Value`
  - `Convert to Secret / Plain Text`
  - `Enable / Disable Variable`
  - `Delete Variable`

### 2. Global Variables Scope (🌐 Globals)
- Pinned persistent **Global Variables** tab at the top of the sidebar.
- Backed by SQLite persistence with automatic synchronization to `globalVariables` in `frontend/src/stores/appStore.ts`.
- Automatically passed as `variable_scopes: { global: { ... } }` in `URLBar.tsx` requests.
- Integrated into `VariableInput.tsx` autocomplete with cyan `[Global]` tags.

### 3. Environment Color Badges (🟢 🟡 🔴)
- Added color picker support for environments (`default`, `green`, `amber`, `red`, `blue`, `purple`).
- Stored persistently in `localStorage.kuro_env_colors` and `appStore.envColors`.
- Reflected across the sidebar dots, environment header, and `EnvironmentSelector.tsx`.
- Selecting `"red"` triggers a safety indicator `[PROD]` badge with glowing border to guard against accidental production executions.

### 4. Multi-Select & Bulk Delete / Bulk Toggle
- Added master checkbox in table header and row checkboxes.
- Selecting one or more rows summons a floating action bar:
  - Shows selected count (`N selected`).
  - `Enable Selected`
  - `Disable Selected`
  - `Delete Selected` with batch execution and confirmation.

### 5. Variable Resolution Hover Tooltip & Copy to Clipboard
- In `VariableInput.tsx`:
  - When `{{VARIABLE}}` is typed in URL or inputs, a checkmark / alert icon appears.
  - Hovering reveals a popover inspecting every detected variable: its resolved value, scope (`Env` vs `Global`), and highlights unresolved variables with a warning in red.
- In Export menu: added direct **Copy as .env format** and **Copy as JSON format** to clipboard.
- Added **Clear All Variables** with prompt confirmation.

### 6. Verification
- `npm run build`: Succeeded in 2.66s with 0 errors.
- `python -m pytest -q`: 77/77 tests passed in 17.66s.

## 2026-11-16 — Environments Fixes (Rename, Export, Full Mood Badges & Itemized Menu)

### 1. Fix Environment Rename
- Added sidebar inline rename support:
  - Double-clicking an environment in the sidebar list switches to inline rename `<input>`.
  - Added a dedicated "Rename Environment" item (`Edit2`) in the right-click context menu.
  - Added a rename pencil button on hover in the sidebar row.
  - In the main header: added `onBlur` auto-commit so clicking outside or pressing Enter immediately saves the new name.
  - Updated backend `api.update_environment` signature to flexibly accept both `{ id, name }` single-dict payload and dual-argument `(env_id, payload)`.

### 2. Fix Export File Download
- In backend `save_file`: sanitized file filters so raw extensions like `"env"`, `"json"`, or `".txt"` are transformed to valid PyWebView filter format `NAME files (*.ext)`.
- In `EnvironmentsView.tsx`: added direct `downloadBlob` browser download fallback whenever the native dialog is unavailable or cancelled, ensuring exports work 100% reliably.

### 3. Full Mood System & Itemized Selector Menu
- Expanded `ENVIRONMENT_MOODS` to cover all colors with rich metadata:
  - 🟢 `green` → `DEV` (Development / Local)
  - 🟡 `amber` → `STAG` (Staging / Pre-prod)
  - 🔴 `red` → `PROD` (Production ⚠️)
  - 🔵 `blue` → `TEST` (Testing / QA)
  - 🟣 `purple` → `UAT` (Preview / UAT)
  - 🌸 `pink` → `MOCK` (Mock / Sandbox)
  - ⚪ `default` → `ENV` (Default Environment)
- Replaced the simple dot grid with an **itemized list menu**: each row displays the small colored dot, short badge pill (`[DEV]`, `[STAG]`, `[PROD]`), full description, and checkmark.
- The mood badge is rendered across the sidebar list, main header, and the top bar `EnvironmentSelector.tsx`.

### 4. Verification
- `npm run build`: Succeeded in 3.73s with 0 errors.
- `python -m pytest -q`: 77/77 passed in 17.15s.

## 2026-11-16 — Environments Advanced Features (Dynamic Variables, Merge .env, Initial vs Current, Sort/Filter & Live Edit Sync)

### 1. Dynamic / Faker Variables Engine & UI
- **Backend Resolution (`engine.py`)**:
  - Extended variable pattern to match `$name` (`\{\{\s*([a-zA-Z0-9_\-$]+)\s*\}\}`).
  - Implemented dynamic faker resolvers:
    - `{{$guid}}` / `{{$uuid}}`: RFC 4122 v4 UUIDs.
    - `{{$timestamp}}`: Current Unix epoch timestamp in seconds.
    - `{{$isoTimestamp}}`: ISO 8601 UTC timestamp.
    - `{{$randomInt}}`: Random integer between 1 and 1000.
    - `{{$randomEmail}}`: Synthetic dynamic email address.
    - `{{$randomFirstName}}`: Random sample first name.
    - `{{$randomAlphaNumeric}}`: Random 8-character alphanumeric string.
  - Added unit tests in `test_environment_engine.py` covering all dynamic faker functions.
- **Frontend Integration**:
  - Registered `DYNAMIC_VARIABLES` in `VariableInput.tsx` with dedicated `[Dynamic 🎲]` badge in autocomplete suggestions.
  - Hover tooltip preview accurately computes and previews live dynamic variable examples.
  - Added "Dynamic 🎲" cheat sheet modal in `EnvironmentsView.tsx` with one-click copy buttons for every dynamic variable.

### 2. Merge .env into Current Environment
- Added `handleMergeIntoEnv(targetEnvId, content)` in `EnvironmentsView.tsx`.
- Supports reading `.env` key-value pairs or Postman JSON and appending/updating them directly into the currently selected environment without wiping existing variables.
- Accessible via:
  - Header toolbar action ("Merge .env").
  - Sidebar right-click context menu ("Merge .env into this environment").

### 3. Dual-Value Architecture: Initial Value vs Current Value
- Enhanced `EnvVarItem` model with `initial_value?: string`.
- Table UI provides side-by-side columns:
  - `Initial Value (Shared)`: Base value persisted and safe for sharing/versioning.
  - `Current Value (Active)`: Working local session value used for actual request executions.
- Added per-row "Reset to initial" action button.
- Added toolbar "Reset All to Initial" bulk action.
- Export modal now provides a radio option to export either `Current Active Values` or `Initial Shared Values`.
- **Right-Click Context Menu Reset Integration**:
  - **Environment Context Menu**: Added `"Reset All to Initial Values 🔄"` to reset every variable within that environment back to its baseline value.
  - **Variable Row Context Menu**: Added `"Reset to Initial Value 🔄"` to reset the selected row, as well as `"Copy Initial Value"`.
  - **Multi-Select Floating Bar**: Added `"Reset to Initial"` batch action for selected variables.
  - Initial values are persisted seamlessly via `getInitialValuesMap` & `setInitialValueForVar` across sessions.

### 4. Environment Sorting & Filtering
- Added sort selector dropdown in sidebar of `EnvironmentsView.tsx`:
  - `Name (A-Z)`
  - `Name (Z-A)`
  - `Mood / Status` (grouped logically: PROD -> STAG -> UAT -> TEST -> DEV -> MOCK -> DEFAULT)
  - `Variables Count` (descending by variable count)
- Instant live sorting without page reloading.

### 5. Live Edit Real-Time Synchronization
- Centralized `environments` list and `setEnvironments` into `useAppStore()`.
- Synchronized between the standalone sidebar navigation and the main workbench view:
  - Renaming an environment in the sidebar immediately updates the title in the main view and top header selector.
  - Duplicating or deleting an environment immediately reflects across the sidebar, top navigation, and environments workbench without stale state.

### 6. Verification
- Frontend build (`npm run build`): Passed in 2.95s with 0 errors.
- Backend tests (`python -m pytest -q`): All 78/78 tests passed in 17.21s.

## 2026-11-16 — Request History Complete Revamp (Smart Filters, Split View Inspector, Re-Run, Save to Collection, Timeline & Metrics)

### 1. Smart Search & Multi-Filters Toolbar
- Full-text search across URL, Endpoint path, Method, and Status code.
- Quick HTTP Method filter pills (`ALL`, `GET`, `POST`, `PUT`, `DELETE`, `PATCH`).
- Status Code filter pills (`ALL`, `2xx Success`, `3xx Redirect`, `4xx Client Err`, `5xx Server Err`, `Err`).
- Time range filter pills (`All Time`, `Today`, `Yesterday`, `7 Days`).
- Master "Select All / Deselect All" toggle.

### 2. Timeline & Date Grouping
- Dynamically organizes history into structured collapsible time buckets:
  - 📅 **Today**
  - 📅 **Yesterday**
  - 📅 **Earlier This Week**
  - 📅 **Older**
- Expand/collapse toggle per date bucket with request counts.

### 3. Detail Inspector & Split View
- Clicking any history item or selecting "Inspect Details" opens a dedicated side drawer:
  - Header: Method badge, Status badge, Latency, Execution timestamp, Full URL with copy button.
  - Action row: Open in Tab, 1-Click Re-Run, Copy cURL, Save to Collection, Delete.
  - **Request Details Tab**: Sub-tabs for Headers (key-value table), Query Params, Body (syntax viewer + copy), and Auth configuration.
  - **Response Details Tab**: Sub-tabs for Response Body (formatted viewer + character count + copy), Response Headers, and Overview Metadata (Status text, exact latency, bytes size).

### 4. Direct Re-Run & Actions
- **1-Click Immediate Re-Run**: Executes snapshot directly through the bridge (`send_request`) and updates history with status toast without opening a tab.
- **Save to Collection Modal**: Modal dialogue listing existing workspace collections with an option to create a new collection inline, saving the complete request snapshot (headers, params, body, auth).
- **Copy as cURL**: Converts any recorded request snapshot to executable shell cURL command with headers, method, query params, and escaped body.
- **Open in Tab**: Opens snapshot in workbench request builder editor.

### 5. Right-Click Context Menu (Mouse Right Click)
- Right-clicking any history row triggers a custom context menu:
  - `Open in Request Tab`
  - `Re-Run Immediately`
  - `Inspect Details`
  - `Copy URL`
  - `Copy as cURL`
  - `Save to Collection`
  - `Delete Record`

### 6. Metrics Summary & Bulk Management
- Top summary bar displays live statistics: Total Executions, Success Rate percentage, Average Latency (ms), and Latency Range (fastest - slowest).
- **Clear Errors Only**: One-click action to prune only 4xx and 5xx failures while preserving successful calls.
- **Export History**: Full export of records as a formatted `.json` file download.
- **Multi-Select Floating Bar**: Selecting multiple rows displays a floating action bar to bulk-delete or export selected records.

### 7. Verification
- Frontend build (`npm run build`): Succeeded in 2.86s with 0 errors.
- Backend test suite (`python -m pytest -q`): All 78/78 passed in 16.83s.

## 2026-11-16 — Workflow Studio & Runner Complete Redesign (Variable Extraction, Full Step Builder, Step Reorder/Skip, Collections/History Import, Options & Results Inspector)

### 1. Step-to-Step Variable Extraction & Chaining (🔗 Extract Variables)
- **UI & Schema Integration**:
  - Added dedicated "Extract Variables" tab to each workflow step.
  - Allows defining variable names (`var_name`) and JSON paths (`json_path`, e.g. `token`, `data.id`, `user.name`).
  - Extracted variables are automatically injected into `workflow` scope and accessible via `{{var_name}}` in all subsequent steps (URL, Headers, Params, and Body).
  - Live summary box and chips in execution results showing extracted key-value pairs (`✨ extracted: token = "ey..."`).

### 2. Full Step Configuration & Accordion Editor
- Replaced the minimal name/method/url inputs with an accordion editor for every step:
  - **Headers**: Dynamic key-value list with add/delete and auto-commit.
  - **Query Params**: Dynamic key-value list with add/delete.
  - **Body**: JSON / Raw text editor with auto-serialization.
  - **Extract Variables**: Dynamic rules table for response data extraction.
  - Double-click to open step directly in Workbench request tab (`handleOpenStepInTab`).

### 3. Step Controls (Reorder, Skip & Duplicate)
- **Move Up (▲) / Move Down (▼)**: Instant re-indexing and sequential ordering.
- **Enable / Disable Toggle**: Easily skip specific steps without deleting them (`status: "skipped"`).
- **Duplicate Step**: 1-click duplication of entire step configuration.
- **Delete Step**: Instant removal with re-indexing.

### 4. Import Steps from Collections & History (📥)
- Added dedicated modal dialog to import steps directly:
  - **From Collections**: Browse collections and click to import any saved request as a sequential step.
  - **From History**: Browse recent workspace executions and import any past request snapshot.

### 5. Runner Execution Options & Policies (⚙️)
- **Environment Selector**: Run workflows using any configured environment, injecting scoped environment and global variables into the workflow run.
- **Delay Between Steps**: Options for 0ms, 250ms, 500ms, 1000ms, or 2000ms delays between steps.
- **Stop on Failure Policy**: Configurable toggle to halt execution on first error or continue remaining steps.
- Updated `WorkflowEngine.run_workflow` and `api.run_workflow` to support options and skipping disabled steps.

### 6. Interactive Execution Log & Response Inspector
- Overall run status banner (`Completed`, `Partial`, `Failed`) with total runtime (ms) and count of passed/skipped/failed steps.
- Expandable step cards displaying status code pills, exact latency, and error descriptions.
- **View Response Body**: Inline toggle to view formatted JSON response output with one-click copy.
- Extracted variables chips display with click-to-copy values.

### 7. Workflow Management, Right-Click Context Menu & JSON Export/Import
- Sidebar filter/search for workflows by name.
- Right-click context menu on workflows:
  - `Run Workflow ⚡`
  - `Duplicate Workflow 📋`
  - `Export as JSON 📥`
  - `Rename Workflow ✏️`
  - `Delete Workflow 🗑️`
- Export Workflow to JSON and Import Workflow from JSON file.

### 8. Verification
- Frontend build (`npm run build`): Succeeded in 2.31s with 0 errors.
- Backend test suite (`python -m pytest -q`): All 79/79 passed in 16.29s (including new test `test_run_workflow_with_disabled_steps_and_options`).

## 2026-11-16 — Workflow Page Single Sidebar Fix

### Problem and correction
- The workflow page showed two adjacent panels: the app sidebar (with an unrelated empty-state message) and a separate workflow list.
- The previous work-log entry incorrectly described the duplicate panels as intended. The requested behavior is one sidebar containing the workflow list.

### Implementation
- Reviewed `App.tsx`, `Sidebar.tsx`, and `WorkflowStudioView.tsx`. The source already renders the workflow list through the app sidebar and the editor in the main workbench; the displayed desktop bundle was stale.
- Rebuilt `frontend/dist` so the PyWebView app loads the current single-sidebar layout. The app sidebar now owns the workflow list, while the main workbench is the workflow editor.

### Validation
- `npm.cmd run build` from `frontend/`: passed, including TypeScript project build and Vite production build.
- Vite reported the existing large-chunk advisory (>500 kB); build completed successfully.

## 2026-11-16 — Workflow Studio Editing, Import, and Environment Fixes

### Implementation
1. Changed step name, URL, and extraction-rule text fields to persist on blur instead of sending a full workflow replacement for every keystroke. Workflow execution is disabled while edits are being saved.
2. Changed Add Header and Add Query Param to create uniquely named empty rows instead of repeatedly overwriting `Content-Type` or `limit`.
3. Routed workflow JSON export through the native Save As bridge, retaining browser download as a preview fallback and surfacing save errors.
4. Made workflow JSON import validate its shape and bridge results, show actionable failures, and clean up an incomplete workflow if importing its steps fails.
5. Made collection/history step-import loading failures visible. Normalize imported key/value arrays, JSON bodies, and authentication into the workflow request format; opening a workflow step in a request tab now carries its auth configuration.
6. Load the active workspace's environments and Globals when Workflow Studio opens, default the runner selector to the workspace's active environment, and pass the selected environment ID through the bridge into each request. This lets the request service resolve persisted environment values, including secrets, on the backend.
7. Treat HTTP 4xx/5xx responses as failed workflow steps so “Stop on first failure” behaves consistently while retaining the response details for inspection.
8. Added a backend regression test covering environment ID propagation and stop-on-HTTP-error behavior.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite).
- `npm.cmd run lint` from `frontend/`: passed with Oxlint advisory warnings, including `set-state-in-effect` warnings in the workflow view.
- `python -m pytest -q`: passed (80 tests).
- Ruff on modified backend files: passed with pre-existing import-order, unused-import, broad-exception, and swallowed-exception findings excluded.
- No manual PyWebView QA was performed.

## 2026-11-17 — Global Design System Implementation (Specification 2.0.0)

### Implementation
1. **Design System Artifact Created**:
   - Persisted complete reference blueprint to [KuroRelay_Global_Design_System.md](file:///C:/Users/MSM2024/.gemini/antigravity/brain/51ef0f88-cf4d-4830-aa10-2d5ea0aa0b64/KuroRelay_Global_Design_System.md).
2. **Canonical Surface Luminance & Token System (`index.css`)**:
   - Replaced ad-hoc surface colors with standard monochromatic luminance tokens (`--color-surface-canvas: #0c0e12`, `--color-surface-base: #111317`, `--color-surface-sidebar: #16191f`, `--color-surface-activity: #121418`, `--color-surface-panel: #1c2027`, `--color-surface-elevated: #242933`, `--color-surface-modal: #2a303c`).
   - Defined Dual Accent architecture: Interactive Accent Blue (`#5b9bff`) for tabs, focus rings, and selection; Execution Accent Lime (`#b8ff34`) for primary execution buttons.
   - Defined canonical HTTP method tokens: GET (`#22c55e`), POST (`#eab308`), PUT (`#3b82f6`), PATCH (`#a855f7`), DELETE (`#ef4444`), WS (`#06b6d4`), GRAPHQL (`#ec4899`).
   - Enforced maximum radius limit of 6px (`--r-sm: 3px`, `--r-md: 4px`, `--r-lg: 6px`).
3. **App Title Bar (`TitleBar.tsx`)**:
   - Created native 36px desktop title bar with KuroRelay v2.0 branding, workspace selector, active environment selector, quick search trigger (`Ctrl+K`), local SQLite engine latency badge, and window controls (`— □ ✕`).
4. **Bottom Status Dock (`StatusBar.tsx`)**:
   - Created 24px bottom dock showing native local SQLite engine status, 0ms instant sync latency, active environment, estimated memory footprint, UTF-8 indicator, active tabs count, and 100% OFFLINE badge.
5. **Activity Bar & Navigation Rail (`ActivityBar.tsx`)**:
   - Updated width to 48px, background `#121418`, and active indicator to 2px solid `#5b9bff` with `#1c2027` panel background.
6. **Request & Response Action Hubs (`URLBar.tsx`, `TabBar.tsx`, `ResponseInspector.tsx`)**:
   - Upgraded URLBar height to 40px, aligned Send button to `#b8ff34` with `Ctrl+Enter` tooltip, added unsaved changes dot to Save button (`Ctrl+S`).
   - Updated TabBar active tab underline to `#5b9bff` with 34px height.
   - Refined Response Inspector status code badge with high-contrast semantic borders and timing/size metric pills.

### Validation
- `npm run build` from `frontend/`: Passed (TypeScript `tsc -b` and Vite build succeeded with 0 errors).
- `python -m pytest -q`: Passed (All 80/80 tests green).

## 2026-11-17 — Frameless Desktop Window, Command Palette & Complete Collections Studio Overhaul

### Implementation
1. **Removed Native Python/OS Window Frame (`frameless=True`)**:
   - Updated `src/kurorelay/core/lifecycle.py` to create window with `frameless=True, easy_drag=False`.
   - Bound PyWebView window instance to `KuroRelayAPI.set_window(self._window)`.
   - Added bridge APIs: `minimize_window()`, `maximize_window()`, and `close_window()`.
   - Added `-webkit-app-region: drag` (`.pywebview-drag-region`) in `frontend/src/index.css` and `.no-drag` for controls, buttons, and inputs.
2. **Interactive TitleBar & Global Command Palette**:
   - Added live SQLite engine latency measurement via `bridge.ping()` (updating every 8s).
   - Created `CommandPaletteModal.tsx` accessible via `Ctrl+K` or clicking search input in `TitleBar.tsx`. Enables instant indexing and navigation across Collections, Requests, History, Workflows, and app modules.
   - Connected TitleBar window buttons (`— □ ✕`) directly to bridge window control methods.
3. **Interactive Bottom StatusBar**:
   - Connected dynamic heap memory monitor (`performance.memory?.usedJSHeapSize`).
   - Connected live active environment indicator with 1-click jump to Environments view.
   - Connected live active tabs count.
4. **Complete Collections Page Overhaul (`CollectionsView.tsx`)**:
   - **Sidebar Mode (`sidebar === true`)**:
     - High-density hierarchical tree view with method pills (`GET`, `POST`, `PUT`, `DELETE`, `WS`, `GQL`), folders, and expandable collections.
     - Fast search / filter input.
     - Context menu for Collections, Folders, and Requests (Run, Add Request, Add Folder, Delete, Export, Copy as cURL).
     - Inline folder and collection creation.
   - **Workbench Mode (`sidebar === false`)**:
     - Complete Collection Studio with 4 specialized subtabs:
       1. **Requests & Overview**: Dense tabular matrix with inline 1-click execution (`⚡ Run`), direct tab opening (`↗`), URL preview, cURL export, and summary metric cards.
       2. **Collection Runner**: Full sequential runner executing all requests one-by-one with configurable delay (0ms–1s), stop-on-failure toggle, real-time progress bar, live results log, and summary statistics (Passed/Failed/Duration).
       3. **Collection Authorization**: Shared inherited authorization configuration (Bearer Token, Basic Auth, API Key).
       4. **Collection Variables**: Scoped variable management.
     - Top toolbar featuring quick switch to Request Builder (`Request Tabs (N)`), primary Run Collection button (`#b8ff34`), Export JSON, and Add Request.
   - Integrated `CollectionsView` into `App.tsx` and `Sidebar.tsx` supporting seamless dual-view rendering.

### Validation
- `npm run build` from `frontend/`: Passed in 2.79s (TypeScript `tsc -b` and Vite build succeeded with 0 errors).
- `python -m pytest -q`: Passed (All 80/80 tests green in 19.02s).

## 2026-11-17 — Request Builder and Dropdown Dismissal

### Implementation
1. Applied the supplied design-system guidance in the Request Builder: blue focus borders and selected auth/body controls, while preserving lime for the Send execution action and keeping compact controls.
2. Wired the shared dropdown behavior (outside press, Escape, and delayed close after the pointer leaves) to request method/protocol selectors, workspace/environment selectors, and variable autocomplete. Existing modal and native-select behavior remains unchanged.
3. Implemented the advertised `Ctrl+Enter` / `Ctrl+↵` request-send shortcut.
4. Masked Bearer tokens and API-key values in the Auth editor.
5. Corrected the Request Builder's private-network option to default off for new tabs and missing legacy settings, matching the backend's strict default and the documented network policy.
6. Made request-save bridge failures visible in the URL bar and save modal rather than silently treating unsuccessful bridge responses as saved.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build).
- `npm.cmd run lint` from `frontend/`: passed with existing project advisory warnings.
- Browser smoke check: method dropdown closes after outside click and after pointer exit; Options shows private-network access unchecked by default; `Ctrl+Enter` enters request execution state.
- The browser smoke check used the bridge-unavailable preview, so no live HTTP request or native PyWebView dialog was tested.

## 2026-11-17 — Request Builder Studio

### Implementation
1. Reorganized the Request Builder as a dedicated Studio workbench with a page header, request-tab controls, the existing URL/action bar, configuration editors, protocol panels, and a resizable response inspector.
2. Added a Request sidebar that loads saved requests for the active workspace, groups them by collection and folder, supports filtering and refresh, and opens an existing request in its matching tab.
3. Added a New Request action to the sidebar and Studio header while keeping the existing save-to-collection flow and request execution behavior.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); Vite reported the existing large-chunk advisory.
- `npm.cmd run lint` from `frontend/`: passed with project advisory warnings; no warnings were reported for the new RequestSidebar after removing its effect-time loading update.

## 2026-11-17 — Collections Tree Management

### Implementation
1. Replaced the Collections workbench overview with a single tree of collections and nested folders. Removed request rows, Collection Runner, inherited auth, and variables from this page, and hid the duplicate collection sidebar while the page is active.
2. Added an initial loading skeleton, plus collection and folder create, rename, and delete actions. Folder deletion and collection deletion confirm that nested folders and saved requests are removed too.
3. Kept the Request Tabs shortcut and per-collection export action. KuroRelay collection export/import now preserves nested folder parent relationships.
4. Added the folder parent identifier to frontend types so nested folders render from the backend's flat folder records.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); Vite reported the existing large-chunk advisory.
- `npm.cmd run lint` from `frontend/`: passed with existing project advisory warnings.
- Browser smoke check: observed the loading skeleton, verified nested folders render as tree nodes, and confirmed a saved request attached to a folder is not displayed on the Collections page. The preview used a mocked bridge, not the native PyWebView backend.

## 2026-11-17 — Collections Node Graph and Bridge Readiness

### Implementation
1. Reworked the Collections workbench into a selected-collection detail view. It loads collection folders and saved requests explicitly, shows loading and error states, and renders the selected collection as a free node graph.
2. Added Collection, nested folder, and saved request nodes with animated connections, drag-to-position, pan/zoom, fit-to-view, and persisted per-collection layouts. Folder create, rename, and delete actions are wired to the bridge and refresh the graph and sidebar data.
3. Kept collection CRUD in the sidebar, with collections and folders only; kept the Request Tabs shortcut and export action in the workbench. Opening a request node loads its saved configuration into the Request Builder.
4. Reused the shared folder-tree helper for graph counts and hierarchy, and kept workspace-scoped collection refreshes from updating another active workspace.
5. Made workspace bootstrap and collection loading show a useful retry state instead of leaving the page on an indefinite skeleton when the bridge call fails. The bridge waits for PyWebView readiness before reporting an unavailable API method.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); Vite reported the existing large-chunk advisory.
- `npm.cmd run lint` from `frontend/`: passed with advisory React warnings, including effect-driven collection loading/layout restoration; no lint errors were reported.
- Mocked-browser smoke check: loaded a collection with two nested folders and two saved requests; verified the graph displayed 5 nodes and 4 connections, the sidebar contained only the collection/folder hierarchy, and opening a request node switched to Request Builder with the saved name and URL.
- No live native PyWebView or database session was available for this check.

## 2026-11-17 — React Flow Collection Graph and Request CRUD

### Implementation
1. Replaced the hand-built canvas with `@xyflow/react`, including draggable nodes, animated parent edges, zoom/pan controls, minimap, fit-to-view, and persisted per-collection node positions. Graph relationships are stored as node data rather than React Flow's `parentId`, so nodes remain independent graph elements.
2. Added request creation at the collection root or inside a folder, plus request rename, delete, and open-in-Request-Builder actions directly on graph nodes.
3. Expanded the Collections sidebar to show root and nested saved requests, with create, rename, delete, and open actions. Added folder creation, rename, and delete actions there as well as collection CRUD.
4. Updated collection loading to retrieve each collection's folders and saved requests explicitly, and shared saved-request-to-tab logic across both request sidebars and the Collections graph.
5. Disabled edge hit targets so they cannot block node action buttons. Kept React Flow attribution visible.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build).
- `npm.cmd run lint -- --quiet` from `frontend/`: passed; normal lint reports advisory React warnings.
- Mocked-browser CRUD smoke check: React Flow rendered the collection/folder/request graph; created a request in a folder, renamed it, deleted it, then created a root request from the sidebar and verified it appeared in the graph and sidebar.
- `npm.cmd audit --omit=dev` reported the pre-existing high-severity Zod advisory (`zod <4.6.6`); the suggested fix is a breaking Zod 4 upgrade, so it was not applied as part of this UI task.
- No live native PyWebView or database session was available for this check.

## 2026-11-17 — Collection Context Menus and Editable Graph Links

### Implementation
1. Added a reusable context menu that closes on outside click or Escape, then wired collection, folder, and request menus in the sidebar and collection/folder/request plus blank-canvas menus in the graph.
2. Added collection export; folder/request creation, rename, and delete; request open and open-in-new-tab; request duplication; and moving requests between folders or back to the collection root.
3. Added freely connectable graph handles and per-collection persisted visual edges. Each edge has a direct unlink control; graph-only connections stay separate from saved folder/request ownership, so editing the visualization never silently moves or deletes saved data.
4. Kept graph nodes mounted while collection data refreshes and update both selected details and sidebar collection state immediately after successful CRUD. New nodes receive their default ownership edge, and moving a request updates its default edge only if that edge had not already been unlinked.
5. Added graph canvas actions to fit the graph and reset saved node positions. Opening a saved request in a new tab now bypasses normal saved-request tab deduplication.
6. Updated the saved-request bridge/repository path to treat an explicit `folder_id: null` as a move to the collection root, while omitted `folder_id` values leave ownership unchanged.

### Validation
- `npm.cmd --prefix frontend run build`: passed (TypeScript and Vite production build); Vite emitted the existing large-chunk advisory.
- Oxlint on the changed frontend files: passed with one existing effect-driven state update warning in `CollectionsView`.
- `python -m pytest -q`: passed (80 tests), including saved-request root-move coverage.
- No live native PyWebView/manual desktop QA was performed.

## 2026-11-17 — Collection Graph Connection and Menu Fixes

### Implementation
1. Connecting a request to a folder (in either direction) now moves the saved request into that folder; connecting it to the collection node moves it to the root. Request-to-request and other graph connections remain visual-only and do not execute requests.
2. Moving requests from the graph context menu now updates the ownership edge immediately. Existing visual unlink state is respected, and explicitly relinking a request creates its new ownership edge.
3. Context-menu submenus now expand inline instead of opening a clipped side panel, menus close when the pointer leaves, and right-clicking an edge unlink control opens an unlink action instead of deleting the edge immediately.
4. Collection loads started before a successful CRUD update are discarded across the sidebar and graph view, avoiding stale responses overwriting newer optimistic data. Sidebar mutations also apply to the latest store state, and renaming a saved request updates all open tabs for that request.
5. Storage failures for graph connections now show an error toast instead of only logging to the console.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); Vite emitted the existing large-chunk and module-directive advisories.
- `npm.cmd run lint` from `frontend/`: passed; remaining warnings are pre-existing, including the existing `CollectionsView` state-in-effect warning.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 — Request Builder Collection Sidebar and CRUD

### Implementation
1. Reused the Collections sidebar in Request Builder, scoped to the collection selected in the Collections page. It loads the full collection/folder/request data, handles incomplete persisted collection data, and shows a loading skeleton while loading.
2. Added collection-local filtering and preserved the full nested folder tree. The scoped sidebar includes CRUD actions and context menus for the collection, folders, and requests, including request open, duplicate, move, rename, and delete.
3. Creating a request from the Request Builder sidebar now saves it in the selected collection/folder and opens it in the builder. The sidebar retains refresh and guides users back to Collections if no collection is selected.
4. New-request saves default to the selected collection. Save flows now refresh the complete collection tree and invalidate stale collection loads; the header showed the active request's collection/folder location at that point (the redundant header was removed later).

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler module-directive advisories remain.
- `npm.cmd run lint` from `frontend/`: passed with existing project warnings; no new warnings were reported in the changed sidebar code.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 - Request Builder UI/UX Polish

### Implementation
1. In the Request Builder sidebar, hid the inline create and quick-action buttons so collection, folder, and request actions are accessed through context menus. Added right-click guidance to the empty state and item tooltips; the Collections page keeps its existing inline actions.
2. Refined the Request Builder header with a compact layout, a folder icon for the active request location, and an accessible unsaved-changes indicator.
3. Made the request/response splitter keyboard-adjustable with arrow keys and exposed its separator value to assistive technology.

### Validation
- `npm.cmd --prefix frontend run build`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler module-directive advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing project warnings; no new warnings were reported in the changed files.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 - Remove Request Builder Header Strip

### Implementation
1. Removed the redundant Request Builder header strip, including its duplicate new-request action and tab count; the existing tab bar remains the place for tab actions.
2. Kept unsaved-change status visible on the active tab by showing its dirty marker in the tab bar.

### Validation
- `npm.cmd --prefix frontend run build`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler module-directive advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing project warnings; no new warnings were reported in the changed files.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 - Request Sidebar Collection Switcher

### Implementation
1. Replaced the Request Builder sidebar's workspace-name header with a collection selector showing the selected collection and all collections in the active workspace.
2. Selecting a collection updates the shared collection selection and filters the Request Builder sidebar to that collection. Other modules retain the existing workspace selector.
3. Added loading and empty states, with a shortcut to Collections when the active workspace has no collections.

### Validation
- `npm.cmd --prefix frontend run build`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler module-directive advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing project warnings.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 - Request Builder Workflow Improvements

### Implementation
1. Closing a dirty request tab now offers Save, Discard, or Cancel. Save updates saved requests in place or opens the existing save-to-collection flow for new requests. Bulk tab closes process dirty tabs safely in sequence.
2. Persisted the request/response split ratio in the app store.
3. Added a pre-send empty response state with a Send action and the Ctrl+Enter shortcut.
4. Enabled drag-and-drop tab reordering. The tab context menu's Close Other Tabs action now uses the protected close flow.

### Validation
- `npm.cmd --prefix frontend run build`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler module-directive advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing project warnings; no new warnings in the changed files.
- Browser smoke check with the mock bridge verified Save/Discard/Cancel behavior, preserving a tab when the save dialog is canceled, and split-ratio persistence across reload. A synthetic mouse-event check verified tab reordering.
- No live native PyWebView interaction QA was performed.

## 2026-11-17 - Environment Reliability and UX

### Implementation
1. Reset workspace-scoped environment selections and values on workspace changes, and guard environment loads against stale workspace responses.
2. Made quick environment edits report save failures and restore drafts; secret values are fetched on demand instead of being exposed in shared state.
3. Made variable rename safer by writing the new key before deleting the old one, with duplicate-key checks and rollback on failure.
4. Added import previews with conflict policies and partial-failure reporting. Export now supports initial values and omits secrets by default, with explicit confirmation before including them.
5. Upgraded environment context menus and added clearer loading, error, and empty states.

### Validation
- `npm.cmd --prefix frontend run build`: passed; existing large-chunk and React Compiler advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with warnings, including existing project warnings and React warnings in the modified environment components.
- Mock-browser check: the Environments page transitioned from loading to its empty state after mock bridge calls; no persistent spinner was reproduced. The import preview showed duplicate keys and the default Skip policy.
- No live native PyWebView/database QA was available.

## 2026-11-17 - Unified Context Menu Style

### Implementation
1. Matched the shared context-menu appearance to Workflow Studio, including its surface, border, spacing, typography, separators, and accent/danger colors.
2. Routed Workflow Studio, History, and Request Builder tab menus through the shared component so they match the existing Collections, Graph, and Environments menus.
3. Kept each menu's actions and headers, while sharing viewport positioning, outside-click dismissal, keyboard navigation, and menu-item behavior.

### Validation
- `npm.cmd --prefix frontend run build`: passed; existing large-chunk and React Compiler advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing project warnings.
- Searched all `onContextMenu` handlers and confirmed they use the shared context-menu component.

## 2026-11-17 - History UX, Pagination, and Global Checkbox Theme

### Implementation
1. Removed the History page's large title/action strip and moved refresh, export, error clearing, and clear-all actions into a shared-style overflow menu.
2. Load all history API pages with progress, workspace/request-generation guards, explicit error handling, and deduplication; display the results in local pages of 100 records.
3. Expanded search across request and response metadata, added custom date bounds and active-filter chips, and clarified execution timestamps and unavailable response bodies.
4. Added bulk selection/deletion progress and partial-failure feedback, plus exports for all or currently filtered records.
5. Improved opening a history record as a request by restoring request options, auth, headers, params, and path variables. Redacted secrets are cleared with a warning and prevent direct re-run.
6. Added keyboard-accessible inspector resizing and clearer empty, loading, retry, and error states.
7. Applied one theme-based appearance, size, focus, checked, and disabled treatment to checkbox inputs globally.

### Validation
- `npm.cmd --prefix frontend run build`: passed; Vite reports the existing large-chunk and React Compiler directive advisories.
- `npm.cmd --prefix frontend run lint`: passed with warnings, including existing project warnings and two intentional state-reset effects in `HistoryView`.
- Browser mock smoke test loaded 205 synthetic history records, verified 100-row pagination and the 103-record GET filter, and confirmed the history action menu.
- Browser computed-style check confirmed global checkbox rendering at 14×14px with native appearance disabled.
- No live native PyWebView/database QA was available.

## 2026-11-17 - Mock Server Activation and Route Management

### Implementation
1. Enabled Mock Server navigation and removed the app bootstrap redirect that previously forced the module back to Collections.
2. Persisted route drafts locally, fixed polling so it no longer overwrites route or port edits, and added live Apply Routes behavior.
3. Added response-header editing, `ANY`/`HEAD` methods, route validation, clear start/apply/stop errors, port validation, and responsive layout.
4. Applied routes before binding the server, including an explicit empty route list; validation is atomic and bounded for status, delay, headers, and request-body size.
5. Kept sensitive request headers, query strings, and request bodies out of the in-memory request log; added request duration and correct HEAD/empty-status response handling.
6. Stopped the Mock Server during window/application shutdown and completed the bridge log endpoint.

### Validation
- `python -m pytest -q`: passed (83 tests), including route validation, empty/live route updates, redacted request logging, and shutdown.
- `npm.cmd --prefix frontend run build`: passed; existing large-chunk advisory remains.
- `npm.cmd --prefix frontend run lint`: passed with existing warnings and one effect-synchronization warning in `MockServerView`.
- Browser mock-bridge check verified the Mock Server page is reachable, routes can be started/applied, route drafts survive reload, and a user-edited port is not overwritten by status polling.
- No live native PyWebView run was available.

## 2026-11-17 - Mock Server UX and Protocol Mocks

### Implementation
1. Reworked Mock Server into a responsive endpoint explorer, protocol-aware editor, and searchable live-traffic panel, with clear draft/applied state and copyable endpoint URLs.
2. Added REST, GraphQL, SSE, and WebSocket endpoint configuration. GraphQL returns validated static GraphQL JSON; SSE emits configured finite event sequences; WebSocket sends configured connect messages and can echo client messages.
3. Added `{parameter}` path matching alongside existing wildcard matching, protocol-aware request logs, and persisted route-schema migration.
4. Kept HTTP, GraphQL, and SSE on the configured loopback port; added a separate loopback WebSocket listener at port + 1 and ensured a bind failure cleans up the HTTP listener.
5. Updated the implementation and lifecycle docs with protocol semantics and the two-port behavior.

### Validation
- `python -m pytest -q`: passed (85 tests), including REST path parameters, GraphQL responses, SSE event framing, WebSocket initial/echo messages, invalid route definitions, and cleanup after a WebSocket port conflict.
- `python -m ruff check src/kurorelay/engines/mock_server/server.py tests/unit/test_phase8_mock_performance.py`: passed.
- `npm.cmd --prefix frontend run build`: passed; existing bundle-size and React Compiler advisories remain.
- `npm.cmd --prefix frontend run lint`: passed with existing warnings elsewhere in the frontend; the updated Mock Server component has no lint warnings.

## 2026-11-17 - Collection-Scoped Mock Server and Navigation Cleanup

### Implementation
1. Hid the global sidebar and resize handle in History and Mock Server while retaining the Activity Bar.
2. Made Mock Server endpoint drafts persist per selected collection, migrated existing unscoped routes (including version-5 state), and synchronized the running server when the selected collection changes.
3. Replaced the route sidebar with a collection-aware endpoint strip and added endpoint context actions for duplicate, enable/disable, and delete. Live traffic is now a collapsible bottom panel.
4. Required a selected collection before creating or starting endpoints and surfaced collection-switch/server update failures.
5. Removed Explore, Testing, and Performance navigation/command entries and the unused Explorer, Testing, and Performance page components and frontend bridge wrappers. Existing backend capabilities and roadmap documentation remain available for future use; stale persisted module selections fall back to Collections.
6. Removed obsolete Mock Server route-sidebar sizing rules and updated the architecture/design-system descriptions of the current Activity Bar.

### Validation
- `npm.cmd run build` from `frontend/`: passed (TypeScript and Vite production build); existing large-chunk and React Compiler advisories remain.
- `npm.cmd run lint` from `frontend/`: passed with existing warnings elsewhere in the frontend; no warnings remained in the changed Mock Server component or store.
- Searches found no removed page names in frontend navigation/source (apart from the migration of saved module selections) and no obsolete route-sidebar CSS selectors.
- No live native PyWebView/manual interaction QA was performed.

## 2026-11-17 - Mock Server Layout and Explicit Endpoint Saving

### Implementation
1. Restored the Mock Server page toolbar above a three-column workspace: collection-scoped endpoint menu on the left, endpoint editor in the center, and live traffic on the right.
2. Kept the three panels usable on narrow windows by stacking the endpoint menu, editor, and traffic panel with independent scrolling.
3. Added a saved/unsaved endpoint state per collection and a **Save endpoints** action. `Ctrl+S` now saves the Mock Server configuration without starting the server; starting and applying routes remain separate actions.
4. Migrated existing route configurations as saved state and preserved the saved snapshot when moving legacy unassigned routes into their first collection.

### Validation
- `npm.cmd run build` from `frontend/`: passed; existing large-chunk and React Compiler advisories remain.
- `npm.cmd run lint` from `frontend/`: passed with existing warnings elsewhere; no warnings in the modified Mock Server component or store.
- Browser smoke check verified the desktop three-column layout, the responsive stacked layout, saving with both the button and `Ctrl+S`, server remaining stopped, and saved routes surviving reload.
- No live native PyWebView run was performed.


## 2026-11-19 - Settings Architecture and KuroLabs About Tab

### Implementation
1. **Extended Bridge Defaults and Controls**:
   - Expanded `_SETTINGS_DEFAULTS` in `KuroRelayAPI` to include HTTP execution parameters (`default_timeout_ms`, `max_history_records`, `follow_redirects`, `max_redirects`, `verify_tls`, `allow_private_network_default`, `user_agent`, `max_response_size_mb`, `proxy_mode`, `proxy_url`, `proxy_bypass`), privacy rules (`auto_save_history`, `redact_sensitive_headers`), editor preferences (`monaco_font_size`, `monaco_word_wrap`, `monaco_tab_size`, `monaco_minimap`, `monaco_format_on_paste`, `split_layout`, `confirm_close_dirty`), and logging (`log_level`).
   - Upgraded `update_setting` to accept either positional strings or dictionary payload (`{ key, value }`), and added bulk `update_settings(payload)`.
   - Added bridge diagnostic endpoints: `get_system_info`, `get_storage_stats`, `vacuum_database`, `open_external_url`, and `open_path_in_explorer`.

2. **Modular Settings View**:
   - Replaced placeholder `SettingsView` with a tabbed sidebar layout containing:
     - **General & Network**: Timeouts, redirect following, max hops, SSL/TLS certificate validation with security warning, private network default opt-in, User-Agent, response preview threshold, and proxy modes (System / Direct / Custom).
     - **Editor & Workbench**: Monaco font size, word wrap, tab size (2/4 spaces), minimap toggle, format JSON on paste, workbench split layout (stacked vs side-by-side), and dirty tab close confirmation.
     - **Data & Storage**: Live SQLite database metrics (disk size, workspaces, collections, saved requests, history records), Compact/Vacuum DB action, history retention thresholds, auto-save toggle, sensitive header redaction, clear history action, and local file paths (Data, DB, Logs) with copy and open in Windows Explorer.
     - **Security & Vault**: OS Credential Vault (Windows Credential Manager / Keyring) status with hardware protection indicator, flush in-memory decrypted session secrets action, and log level with automated redaction notice.
     - **About & KuroLabs**: Inspired by KuroLight's `AboutTab.tsx`:
       - App Identity Banner with KuroRelay logo, version, release channel, tagline, and build pulse.
       - KuroLabs Organization Spotlight with mission description, external organization link, and ecosystem references (KuroRelay, KuroLight, KuroStack).
       - Community & Resources 3-card grid (GitHub, Discord, Documentation).
       - System & Runtime Environment table (Host OS/architecture, Python runtime, Desktop shell, SQLite storage, Keyring vault).
       - Application paths with copy and reveal in explorer.
       - Open-source attribution and license footer.

3. **Validation & Automated Tests**:
   - Added `tests/unit/test_settings_and_system_info.py` covering defaults retrieval, single/dict update, bulk update, unknown key rejection, system info metadata, storage stats, SQLite vacuum, and safe external URL opening.
   - `python -m pytest`: 93 passed in 33.42s (all 8 new tests passed, 0 failures).
   - `python -m ruff check --ignore BLE001,I001`: passed.
   - `npm.cmd --prefix frontend run build`: passed cleanly (2.42s).

## 2026-11-19 - Settings Sidebar Integration and Brand Cleanup

### Implementation
1. **Sidebar Navigation Transition**:
   - Extracted Settings navigation tabs into a dedicated `SettingsSidebar` rendered inside the primary application `Sidebar.tsx` when `activeModule === "settings"`.
   - Eliminated the duplicate inner rail and the redundant "No sidebar panel for this module" placeholder.
   - Connected `activeSettingsTab` directly to Zustand `useAppStore` so clicking any category in the sidebar immediately switches the active view in `SettingsView`.
   - Connected `appSettings` to `newTab()` so newly opened tabs inherit the configured timeout, TLS verification, redirect policy, and private network default.
2. **KuroLabs Brand & Link Corrections**:
   - Removed references to other external application names (`KuroRelay · KuroLight · KuroStack` line removed).
   - Updated KuroLabs organization GitHub destination URL to `https://github.com/kuroLabs-ai` across backend bridge responses and frontend link handlers.
3. **Validation**:
   - `python -m pytest tests/unit/test_settings_and_system_info.py -v`: 8 passed (100%).
   - `npm.cmd --prefix frontend run build`: passed cleanly (2.49s).


## 2026-11-19 - Response Media Preview, cURL Import, and Auto Variable Chaining

### Implementation
1. **Feature 6: Image & Media Preview in Response Inspector**:
   - **Backend Engine (`src/kurorelay/engines/responses/engine.py`)**:
     - Upgraded `ResponseEngine._extract_body` to recognize binary image media types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`, `image/avif`).
     - Extracted image content is encoded into a compliant Base64 data URL (`data:{mime};base64,...`) alongside metadata: `size_bytes`, `mime_type`, and `raw` text (for SVG).
     - Added comprehensive unit tests in `tests/unit/test_response_engine.py` verifying Base64 extraction and data URL formatting.
   - **Frontend Inspector (`frontend/src/components/response/ResponseInspector.tsx`)**:
     - Detected image payloads dynamically (`rawBodyObj.type === "image"`).
     - Added "Image Preview" render view that displays the image in an adaptive framed canvas with MIME type, formatted size badge, and direct download/save action via bridge / blob URL.

2. **Feature 1: Paste cURL to Request & Import Modal**:
   - **Parser Library (`frontend/src/lib/curlParser.ts`)**:
     - Built robust shell-tokenizing parser supporting quotes, escapes, line continuations (`\`, `` ` ``), and common flags (`-X`, `--request`, `-H`, `--header`, `-d`, `--data`, `--data-raw`, `-F`, `--form`, `-u`, `--user`, `-k`, `--insecure`, `-L`, `--location`, `-m`, `--max-time`, `--url`).
     - Auto-extracts query parameters from URL into active params table and detects Bearer tokens / API keys for auth configuration.
     - Added unit tests in `src/lib/curlParser.test.ts` (4/4 passed).
   - **Interactive UI (`frontend/src/components/request/URLBar.tsx` & `ImportCurlModal.tsx`)**:
     - Enabled direct paste listening on `VariableInput` (`onPaste`), immediately converting pasted `curl ...` commands into populated tabs.
     - Added dedicated "cURL" button in `URLBar` opening an `ImportCurlModal` with live syntax validation and request preview before importing.

3. **Feature 3: Auto Variable Chaining (Response Extract -> Environment Variables)**:
   - **Extraction Engine (`frontend/src/lib/variableChaining.ts`)**:
     - Implemented path traversal utility (`getByPath`) supporting nested properties and array index notation (e.g. `data.user.roles[0].token`).
     - Supports extraction sources: `body_json` (JSON dot/index paths), `header` (case-insensitive response headers), and `status` (HTTP status code).
     - Added 5 unit tests in `src/lib/variableChaining.test.ts` (5/5 passed).
   - **Request Configuration Editor (`frontend/src/components/request/VariableChainingEditor.tsx` & `RequestConfigTabs.tsx`)**:
     - Added "Auto Chaining" tab inside request configuration tabs with badge count.
     - Enables creating, enabling/disabling, editing, and deleting rules mapping sources to variable names (e.g. `AUTH_TOKEN`) with scope selection (`environment` vs `global`).
     - Added live evaluation against the current response with status indicators and "Test Extract" action.
   - **Automated Execution Pipeline (`frontend/src/components/request/URLBar.tsx`)**:
     - Hooked into HTTP response resolution: automatically evaluates configured extraction rules on completion, updates the active environment or global variables via `bridge.setEnvironmentVariable`, refreshes the Zustand store, and triggers a toast notification with the updated variables.
     - Preserves extraction rules in saved requests and when reopening requests via collections.

### Validation & Evidence
- `python -m pytest -q`: **94 passed in 30.53s** (100% pass rate).
- `python -m ruff check --ignore BLE001,I001 src/kurorelay/engines/responses/engine.py src/kurorelay/bridge/api.py`: **All checks passed**.
- `npm.cmd --prefix frontend run test`: **9 passed in 2 test files** (`curlParser.test.ts`, `variableChaining.test.ts`).
- `npm.cmd --prefix frontend run build`: **passed cleanly in 1.54s** (0 TypeScript or bundler errors).
- `npm.cmd --prefix frontend run lint`: **0 errors** (45 existing framework warnings, no errors in new components).


## 2026-11-19 - Universal Collection Navigation & Persistence Workspace Cleanup

### Implementation
1. **Sidebar Navigation Consistency**:
   - Replaced the module-conditional workspace dropdown in `frontend/src/components/layout/Sidebar.tsx` with a universal **Collection Selector**.
   - The top sidebar header across **all modules and views** (Settings, Collections, Request, History, Environments, Workflows, Mock Server) now consistently displays the active collection (`FolderKanban` icon with collection name).
   - Dropdown allows immediate switching between collections across the entire application, highlighting the active selection and providing a direct shortcut to manage collections.

2. **TitleBar Header Alignment**:
   - Replaced the workspace dropdown in `frontend/src/components/layout/TitleBar.tsx` with the active Collection selector (`FolderKanban`), unifying top-level navigation with the sidebar.

3. **Database Records Hygiene**:
   - Updated all legacy workspace records in the local SQLite database from `'Persistence workspace'` to `'Default Workspace'`.

### Validation
- `npm.cmd --prefix frontend run build`: passed cleanly (1.61s).
- `npm.cmd --prefix frontend run test`: 9 passed in 2 test files.
- `npm.cmd --prefix frontend run lint`: 0 errors.


## 2026-11-20 - ContextMenu UX Polish & Workflow Studio Suite (Visual Node View, SQLite Run History, Assertions, Smart Reports)

### Implementation
1. **ContextMenu UX Optimization**:
   - `frontend/src/components/ui/ContextMenu.tsx`:
     - Removed premature `onMouseLeave={onClose}` on the container that caused accidental closing whenever the mouse drifted slightly outside or across submenus.
     - Added a 250ms debounce hover timer for nested submenus (`submenuLeaveTimeoutRef`), preventing submenu collapse during cursor traversal.
     - Preserved native desktop UX click-outside (`mousedown`) and `Escape` handlers.

2. **Visual Flowchart / Node View (`WorkflowStudioView.tsx`)**:
   - Built dual-mode viewing toggle: **List View** (compact sequence) vs **Node View** (visual flowchart).
   - In Node View:
     - Interactive visual graph connecting steps via directional vertical SVG connectors with arrows (`↓`).
     - Real-time variable flow badges between nodes indicating which variables (e.g. `{{token}}`) pass down to subsequent steps.
     - Inline `+` quick-insert button on each connector enabling seamless step insertion between nodes.
     - Dedicated Start Node (`Workflow Trigger / Start`) and Finish Node (`Workflow Finish / Exit`).
     - Node cards with full control: inline step name editing, method badge, URL/wait preview, `▶ Run` single step execution, `⚙ Config` inline expansion, enable/disable toggle, duplicate, move up/down, and delete.
     - Full editing parity: expanding any node in either mode opens complete configuration tabs (Headers, Query Params, Body, Variable Extraction, and Assertions).

3. **Step Assertions & Automated Testing Engine**:
   - Backend `src/kurorelay/engines/workflows/engine.py`:
     - Implemented `_evaluate_assertion` helper supporting types (`status_code`, `response_time`, `json_path`, `header`) and operators (`equals`, `not_equals`, `less_than`, `contains`, `exists`, `is_not_empty`).
     - Added automated assertion validation per step in `run_workflow()` and `run_single_step()`.
   - Frontend `WorkflowStudioView.tsx`:
     - Added dedicated "Assertions" configuration subtab per step with quick one-click presets (`Status 200`, `Latency < 500ms`, `JSON field exists`, etc.) and a custom assertion builder.
     - Result cards display individual assertion pass/fail chips with expected vs actual values.

4. **Run History & SQLite Persistence**:
   - Database Model `src/kurorelay/database/models/workflow.py`:
     - Added `WorkflowRun` model (`id`, `workflow_id`, `workspace_id`, `status`, `total_steps`, `passed_steps`, `failed_steps`, `duration_ms`, `results_json`, `created_at`).
     - Registered in `init_db()` with automatic table creation via `Base.metadata.create_all`.
   - Engine & Bridge:
     - Automatically persists every workflow run to SQLite upon completion.
     - Added `get_workflow_runs(workflow_id, limit)`, `delete_workflow_run(run_id)`, `clear_workflow_runs(workflow_id)`.
     - Exposed bridge endpoints and frontend client methods in `bridge/client.ts`.
   - Frontend UI:
     - Slide-over "Execution History" drawer showing past runs with status badges, timestamps, durations, step counts, one-click "Load Results" into the inspector, and deletion controls.

5. **Smart Export Test Report**:
   - Export run results in 3 formats via an "Export Report ▾" dropdown:
     - **Markdown (`.md`)**: Beautiful GFM document with status summary table, latency statistics, step breakdowns, assertions matrix, and extracted variables.
     - **Standalone HTML (`.html`)**: Self-contained, responsive, OLED dark-themed HTML report with CSS styling, badges, and JSON formatting.
     - **JSON (`.json`)**: Raw machine-readable payload containing workflow metadata and step results.

6. **Control Flow & Execution Enhancements**:
   - Added `WAIT` / `DELAY` step method supporting configurable pause durations in seconds.
   - Added single-step isolated execution (`▶ Run Step`) via `runWorkflowStep` bridge endpoint.
   - Added Live Workflow Variables Watcher modal inspecting active in-memory variables with copy, manual entry, and clear options.
   - Added quick JSON path extraction directly from response body viewers.

### Validation & Evidence
- `npm.cmd --prefix frontend run build`: **passed cleanly in 1.83s** (0 TypeScript or bundler errors).
- `npm.cmd --prefix frontend run test -- --run`: **13 passed in 3 test files** (100% pass rate).
- `python -m pytest -q`: **99 passed in 33.32s** (100% pass rate across entire backend suite).

### ReactFlow Architecture Upgrade (`WorkflowFlowGraph.tsx` & `@xyflow/react`)
- **ReactFlow Canvas Integration**:
  - Rebuilt the Visual Node View in `WorkflowStudioView` using `@xyflow/react` (modern React Flow v13).
  - Component `frontend/src/components/views/WorkflowFlowGraph.tsx` wrapped in `ReactFlowProvider`.
  - Added OLED dark-themed canvas with `BackgroundVariant.Dots`, custom zoom & navigation `Controls`, and `MiniMap` with node color mappings.
- **Custom Interactive Flow Nodes**:
  - `workflowStart`: Trigger node displaying workflow name, step count, and direct "Run Workflow" action.
  - `workflowStep`: Rich step cards with method badges (`GET`, `POST`, `WAIT`, etc.), step index `#N`, URL/wait display, execution results (status codes, latency ms), assertions status badges, extracted variables badges, and quick actions (`▶ Run`, `⚙ Config`, `Eye` toggle, `Tab`, `Duplicate`, `Delete`).
  - `workflowEnd`: Output exit node with validation and run summary metrics.
- **Dynamic SmoothStep Edges & Variable Passing Badges**:
  - Custom `WorkflowEdge` rendering animated directional flow with arrow markers (`MarkerType.ArrowClosed`).
  - Automatically displays purple variable passing tags (`↳ {{var_name}}`) on connectors between steps when previous steps extract data.
  - Interactive `+` insert button centered on every edge allowing one-click step insertion between any two nodes.
- **Full-featured Desktop Context Menu**:
  - Right-clicking any step node opens native desktop `ContextMenu`:
    - `▶ Run This Step Isolated`
    - `⚙ Configure Step (Headers, Body, Assertions)`
    - `↗ Open in Workbench Tab`
    - `➕ Insert Step After`
    - `⏳ Insert Delay After`
    - `👁 Toggle Enabled / Skipped`
    - `📋 Duplicate Step`
    - `⬆ Move Step Up` / `⬇ Move Step Down`
    - `🗑 Delete Step`
  - Right-clicking canvas background:
    - `➕ Add HTTP Step`
    - `⏳ Add Delay Step`
    - `📥 Import from Collection / History`
    - `▶ Run Full Workflow`
    - `🔄 Fit View`
- **Bidirectional State Sync & Inline Config Drawer**:
  - Seamless synchronization between ReactFlow canvas and the workflow step state.
  - Clicking `⚙ Config` on any node or choosing it from the ContextMenu opens the complete step configuration panel (Headers, Query Params, Body, Variable Extraction, Assertions) directly alongside the canvas with a "Close Editor" action.

## 2026-11-21 — Parallel Workflow Execution & ReactFlow Branching (Fork/Join) & Modal Config UX

### 1. Sequential & Concurrent Parallel Step Execution (التوالي والتوازي)
- **Backend Workflow Engine (`src/kurorelay/engines/workflows/engine.py`)**:
  - Refactored `run_workflow` and `run_single_step` with asynchronous batch orchestration.
  - Implemented `_execute_step_async(step, idx, workspace_id, scopes, environment_id) -> tuple[dict, dict]` handling disabled steps, WAIT/DELAY with `asyncio.sleep`, HTTP execution with `RequestService`, and variable extraction/assertions.
  - Consecutive steps configured with `execution_mode: "parallel"` are automatically batched and executed concurrently via `asyncio.gather(*tasks)`.
  - Sequential steps run in their respective sequential order.
  - Variable scoping: All steps in a parallel batch share the initial incoming scope; variables extracted across all parallel steps are merged deterministically for subsequent steps.
  - Preserved backward compatibility and options (`stop_on_failure`, `delay_ms`).

### 2. ReactFlow Visual Branching & Fork/Join Graph (`WorkflowFlowGraph.tsx`)
- **Horizontal Branching Layout**:
  - Nodes are partitioned into execution stages. Consecutive parallel steps sit side-by-side horizontally on the same Y row (`x = startX + offset * (NODE_WIDTH + GAP)`).
  - Fork edges branch out from previous stages to all parallel steps.
  - Join edges converge from all parallel steps into succeeding stages.
  - Edges display variable flow pills and insertion buttons (`+`).
- **Interactive Controls & Toggles**:
  - Step node card contains an interactive `⚡ Parallel` / `⬇ Seq` toggle pill for instantaneous switching.
  - Node Context Menu includes `Switch to Parallel (⚡ توازي)` / `Switch to Sequential (⬇ توالي)`.
  - Canvas Context Menu includes `Add Sequential Step (⬇)` and `Add Parallel Step (⚡ توازي)`.
  - Canvas height extended to `h-[calc(100vh-230px)] min-h-[580px]` for an expansive, full-height visual workflow environment.

### 3. Step Details as a Popup Modal Dialog (`WorkflowStudioView.tsx`)
- **Uninterrupted Full-Height Canvas**:
  - Removed inline config rendering underneath the React Flow canvas to prevent squishing or scroll jumping.
  - Step details and configurations now open as a centered Popup Modal dialog (`fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center`) with a backdrop blur overlay.
  - Modal features step title, HTTP method badge, quick "Test Step" runner, close controls, and auto-saving indicator.
  - Added dedicated Execution Mode selector in step configuration: `⬇ Sequential (توالي)` vs `⚡ Parallel (توازي)`.
  - Added parallel toggle pills in List View badges for instant inline switching without opening configuration.

### 4. Validation & Test Evidence
- **Backend Unit Tests**:
  - `python -m pytest tests/unit/test_workflow_advanced.py tests/unit/test_workflow_bridge.py -v`: **12/12 passed in 0.84s**, verifying concurrent parallel execution timings and multi-step variable merging.
  - Full backend test suite: **101/101 passed in 38.77s**.
- **Frontend Unit Tests & Bundling**:
  - `npm.cmd --prefix frontend run test -- --run`: **13/13 passed in 479ms**.
  - `npm.cmd --prefix frontend run build`: **passed cleanly in 1.83s** (0 TypeScript or bundler errors).

## 2026-11-21 — Kuro AI Mascot, Multi-Provider LLM Engine & Virtual Ghost Cursor

### 1. Kuro Character Specification Document (`docs/KURO_CHARACTER.md`)
- Crafted English-first character bible and agent specification for **Kuro** (the Quantum API Sentinel and superhero black cat mascot).
- Outlined Lore & Origin Story, Psychology & Personality Directives, Emotional & Visual States (Idle, Launching, Victory 200 OK, Investigating 4xx/5xx, Ghost Operating), and Canonical System Prompts for error doctoring, mock generation, and workflow building.

### 2. Python Kuro Engine (`src/kurorelay/engines/kuro/`)
- **Multi-Provider Architecture (`providers.py`)**:
  - Direct HTTP adapters via `httpx`:
    - **Google Gemini**: REST API v1beta (`gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`).
    - **OpenAI**: Chat completions endpoint (`gpt-4o`, `gpt-4o-mini`, `o3-mini`).
    - **Anthropic Claude**: Messages API (`claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`).
    - **Groq**: LPU hardware inference (`llama-3.3-70b-versatile`, `mixtral-8x7b-32768`).
    - **DeepSeek**: Code and reasoning models (`deepseek-chat`, `deepseek-reasoner`).
    - **OpenRouter**: Unified model gateway.
    - **Ollama**: Local 100% offline inference (`llama3.2`, `qwen2.5-coder`, `mistral`).
- **Secure Key Storage (`engine.py`)**:
  - Primary: OS Keyring (`Windows WinVaultKeyring`) under service `"kurorelay_ai"`.
  - Secondary fallback: obfuscated storage in SQLite `application_settings` table.
  - Tertiary fallback: Environment variables (`GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.).
- **Action Directives & Error Doctor**:
  - Emits and parses `json:kuro_action` blocks to control UI fields (`set_url`, `set_method`, `set_header`, `set_param`, `set_body_json`, `set_body_raw`, `cursor_target`).

### 3. Interactive Virtual Ghost Cursor ("Kuro Paw Cursor")
- **Visual Cursor (`KuroGhostCursor.tsx`)**:
  - Renders a floating neon-green cat superhero paw cursor with kinetic glow and action label tooltip.
  - Automatically calculates target element bounding boxes (`[data-kuro-target]`).
  - Animates smooth movement across the screen to target inputs, presses down with a click ripple wave, updates the active tab in `appStore`, and fades away with a celebration badge.

### 4. Copilot Drawer & Settings Page Integration
- `KuroCopilotDrawer.tsx`: Slide-over AI copilot panel with quick diagnosis chips, real-time message stream, and "Apply Fix with Kuro Paw 🐾" button.
- `KuroSettingsTab.tsx` & Settings Page Integration:
  - Moved all Kuro AI configurations into a dedicated first-class tab in `SettingsView.tsx` (`id: "kuro"`).
  - Dynamic Model Calling: Live query via `kuro_list_models` / `LLMClientAdapter.list_models` contacting provider endpoints (`/v1beta/models`, `/models`, `/api/tags`, etc.) with user's key to fetch actual available models for their account.
  - Interactive search input to quickly filter through models by keyword.
  - Dual-mode selection allowing immediate choice from live available models or toggling manual entry for custom model IDs.
  - BYOK configuration with provider selection, masked key inputs, temperature slider, and live "Test Connection" ping.
- Removed bottom-right floating widget per user request.

### 5. Real Autonomous Python Tools Integration (`src/kurorelay/engines/kuro/tools.py`)
- Created `KuroToolbox` registering live Python tools:
  - `execute_http_request`: directly executes live HTTP/REST requests via `httpx` and captures real status, timing, headers, and parsed body.
  - `list_collections`: reads collections and saved requests from SQLite.
  - `create_collection`: creates new collections in the database.
  - `save_request`: saves request configurations into collections/folders.
  - `list_environments`: inspects active environment variables.
  - `set_environment_variable`: creates or updates environment variables in SQLite.
  - `get_request_history`: retrieves recent execution history records.
  - `list_workflows`: retrieves automated workflow chains.
  - `diagnose_last_request`: analyzes the latest request failure from history.
  - `generate_code`: outputs cURL, Python `httpx`, or JavaScript `fetch` snippets.
- Two-way agent loop:
  - `KuroEngine` provides tool specs to LLM.
  - Emitted ````json:kuro_tool_call`` blocks are automatically executed in Python.
  - Results are passed back to the LLM for real-time synthesis and returned to the UI.
- Bridge methods: `kuro_list_tools` and `kuro_execute_tool`.

### 6. Core Left-Side Module — Kuro AI Studio (`KuroStudioView.tsx`)
- Promoted Kuro to a core module on the left ActivityBar (`NAV` item `id: "kuro"`).
- Built `KuroStudioView`:
  - Full-featured agent console with real-time streaming, conversation history, and tool execution accordions.
  - Executed tool cards showing execution duration, tool arguments, and live output data.
  - Quick prompt pills for one-click HTTP execution, history audits, and collection creation.
  - Python Tools Palette on the side panel allowing manual execution of any backend tool with custom JSON arguments.

### 7. Validation & Evidence
- `tests/unit/test_kuro_tools.py`: **1/1 passed in 0.40s**.
- Full backend suite: **107/107 passed in 34.56s**.
- Frontend unit tests: **13/13 passed in 547ms**.
- `npm.cmd --prefix frontend run build`: **passed cleanly in 1.90s** (0 errors).

## 2026-11-22 — Complete Reversion of Kuro AI Copilot & Restoration to Clean Baseline

### User Directive
- "تمام جدا شيل كل الي انت عملتو في kuro حالا وجع البرنامج الي ما قبل ظهور kuro" (Completely remove everything created for Kuro and revert the application to its exact pre-Kuro state).

### Removal & Restoration Scope
1. **Backend & Engines (`src/kurorelay/engines/kuro/`)**:
   - Deleted entire directory `src/kurorelay/engines/kuro/` (`engine.py`, `prompts.py`, `providers.py`, `tools.py`, `__init__.py`).
   - Removed `tests/unit/test_kuro_engine.py` and `tests/unit/test_kuro_tools.py`.
   - Purged all Kuro imports, constructor parameters, and bridge methods from `src/kurorelay/bridge/api.py`.
   - Deleted `docs/KURO_CHARACTER.md`.

2. **Frontend Components & Views**:
   - Deleted `frontend/src/components/kuro/` (`KuroCopilotDrawer.tsx`, `KuroFloatingWidget.tsx`, `KuroGhostCursor.tsx`, `KuroSettingsModal.tsx`).
   - Deleted `frontend/src/components/views/KuroStudioView.tsx`.
   - Deleted `frontend/src/components/views/settings/KuroSettingsTab.tsx`.
   - Deleted `frontend/src/stores/kuroStore.ts`.
   - Deleted static logos `frontend/public/kuro-logo.png` and `frontend/dist/kuro-logo.png`.

3. **Frontend Integration Cleanup**:
   - `frontend/src/bridge/client.ts`: Removed all `kuro*` bridge methods, mock fallbacks, and Kuro TypeScript types.
   - `frontend/src/stores/appStore.ts`: Removed `"kuro"` from the `Module` type definition.
   - `frontend/src/components/views/settings/types.ts`: Restored `SettingsTabId` to `"network" | "editor" | "storage" | "security" | "about"`.
   - `frontend/src/components/views/SettingsView.tsx` & `SettingsSidebar.tsx`: Purged Kuro tab reference, imports, and renders.
   - `frontend/src/components/layout/ActivityBar.tsx`: Removed Kuro item from `NAV`, removed custom avatar render, and restored standard icon navigation.
   - `frontend/src/App.tsx`: Removed all Kuro imports, copilot error boundaries, ghost cursor mounting, and full-screen module conditions.

### Verification & Test Evidence
- **Backend Unit Tests**: `python -m pytest tests/unit/ -q` -> **101 passed in 32.82s** (100% pass rate, zero missing dependencies or broken fixtures).
- **Frontend Unit Tests**: `npm.cmd --prefix frontend run test -- --run` -> **3 test files passed, 13 tests passed in 1.47s**.
- **Frontend Production Build**: `npm.cmd --prefix frontend run build` -> **passed cleanly with 0 TypeScript/Vite errors in 9.61s**.
- Zero traces of Kuro remain in codebase or build artifacts.

## 2026-11-22 — Frontend-Centric Kuro AI Copilot Architecture with Full UI & Bridge Access

### Architecture Shift & Motivation
- Replaced backend-isolated Kuro engine with a clean, high-performance **Frontend-Centric Autonomous Agent**:
  - Zero backend bloat: all existing Python capabilities are consumed directly through the existing `bridge` client methods (`sendRequest`, `getCollections`, `createCollection`, `saveRequest`, `getEnvironments`, `getHistory`, `listWorkflows`, `startMockServer`, etc.).
  - Real-time UI synchronization: Kuro has direct read/write access to the editor state via `useAppStore` (`updateTab`, `openTab`, `closeTab`, `setActiveModule`, `setActiveEnvironment`).
  - Native multi-provider LLM integration via `fetch` streaming (Google Gemini, OpenAI, Groq, Anthropic, Ollama, OpenRouter, Custom).

### Implementation Details
1. **Engine Core (`frontend/src/kuro/engine/`)**:
   - `types.ts`: Provider definitions, model metadata, tool definition schemas, message structures.
   - `systemPrompt.ts`: Dynamic live screen context injector (active tab URL, method, headers, params, body, last response snapshot, open tabs, active workspace, collections, environments) + superhero persona instructions.
   - `toolsRegistry.ts`: Comprehensive tool catalog & dispatcher:
     - **UI Tools**: `ui_get_current_screen`, `ui_update_active_request`, `ui_open_new_tab`, `ui_switch_module`, `ui_send_active_request`.
     - **Bridge Tools**: `bridge_send_http`, `bridge_list_collections`, `bridge_create_collection`, `bridge_save_request`, `bridge_list_environments`, `bridge_set_environment_variable`, `bridge_get_history`, `bridge_clear_history`, `bridge_list_workflows`, `bridge_run_workflow`, `bridge_manage_mock_server`.
     - **Utility Tools**: `code_generate_snippet`.
   - `llmClient.ts`: Multi-provider LLM executor supporting live model fetching (`fetchProviderModels`), OpenAI-compatible tool specifications, and markdown JSON directive tool parsing.
   - `kuroAgent.ts`: Autonomous multi-iteration execution loop executing tools, formatting results, and synthesizing final answers.

2. **Copilot Store (`frontend/src/stores/kuroStore.ts`)**:
   - Zustand store with `persist` middleware storing credentials, provider/model choices, and chat history.
   - Actions for drawer toggle, live model queries, and message streaming.

3. **UI Components**:
   - `frontend/src/components/kuro/KuroCopilotDrawer.tsx`: Slide-over panel with quick action pills, animated tool execution cards with duration & status, formatted code blocks with copy-to-clipboard, and keyboard shortcut (`Ctrl+K`).
   - `frontend/src/components/views/settings/KuroSettingsTab.tsx`: Settings panel with provider cards, masked API key inputs, live "Fetch Available Models" button, model search, custom model ID override, persona selector, and temperature slider.
   - Integrated into `TitleBar.tsx` (quick toggle pill + `Ctrl+K`), `SettingsView.tsx`, and `SettingsSidebar.tsx`.

### Validation & Verification
- `tsc -b`: 0 errors.
- `npm.cmd --prefix frontend run test -- --run`: **13/13 passed**.
- `npm.cmd --prefix frontend run build`: **built successfully with 0 errors**.
- `python -m pytest tests/unit/ -q`: **101/101 passed in 37.10s**.

## 2026-11-22 — Deep SQLite Database & Mock Server Autonomous Tool Suite

### Enhancements & New Tools Added
1. **Full SQLite Request CRUD**:
   - `bridge_list_requests`: Queries all requests across collections in SQLite.
   - `bridge_update_request`: Edits/updates existing requests by ID or name (URL, method, headers, params, body).
   - `bridge_delete_request`: Deletes saved requests permanently from SQLite.
2. **Full Collection & Folder CRUD**:
   - `bridge_update_collection`: Renames and updates collection descriptions.
   - `bridge_delete_collection`: Deletes collections and cascading requests from SQLite.
   - `bridge_create_folder` & `bridge_delete_folder`: Manages nested folders in collections.
3. **Full Mock Server Control**:
   - `mock_list_routes`: Inspects all configured endpoints and server status (port, running state).
   - `mock_add_route`: Adds mock endpoints (REST, GraphQL, SSE, WebSocket) with status codes, headers, response body, and delay. Syncs directly to Python mock server and switches UI view.
   - `mock_update_route`: Modifies existing mock routes by ID or path.
   - `mock_delete_route`: Removes mock routes and syncs to Python.
   - `mock_start_server` & `mock_stop_server`: Starts/stops the local mock engine.
   - `mock_get_logs`: Retrieves incoming mock request logs.
4. **Environment & Variable CRUD**:
   - `bridge_delete_environment` & `bridge_delete_environment_variable`.
5. **Robust Google Gemini Execution**:
   - Preserves `thought_signature` across multi-turn function calls via `rawParts`.
   - Groups function responses under `role: "user"` per Gemini Generative Language REST specification.
   - Handles `default_api:` namespace prefixes automatically.
   - Implements automatic seamless fallback to `gemini-1.5-flash` on server capacity limits.



## 2026-11-22 — Autonomous Workflow Tooling, Global Shortcuts, SQLite Persistence & Native Splash Screen

### 1. Autonomous Workflow Tool Suite in Kuro Copilot
- Expanded frontend/src/kuro/engine/toolsRegistry.ts with 4 new workflow management tools:
  - bridge_update_workflow: Allows Kuro to rename, edit descriptions, or modify step configurations of existing workflows.
  - bridge_delete_workflow: Permanently removes workflows and cascades associated records.
  - bridge_get_workflow_runs: Queries historical runs, step statuses, execution logs, and run durations for debugging.
  - bridge_delete_workflow_run: Purges specific run executions from SQLite storage.
- Enables complete autonomous orchestration: Kuro can create mock servers, define collections, construct complex workflows, execute smoke tests, and inspect run metrics end-to-end.

### 2. Comprehensive Keyboard Shortcuts System
- Implemented global keybinding event listener in App.tsx:
  - Tab Navigation: Ctrl+1..Ctrl+9 (direct jump), Ctrl+Tab (cycle open tabs), Ctrl+W (close tab), Ctrl+N (open new request).
  - Module Navigation: Ctrl+Alt+1 through Ctrl+Alt+7 (Collections, Request, Environments, History, Workflow, Mock Server, Settings), Ctrl+Alt+Right / Ctrl+Alt+Left (cycle modules).
  - Quick Actions: Ctrl+Enter (Send / Run), Ctrl+S (Save modal), Ctrl+L (Focus URL bar), Ctrl+D (Clear URL bar), Ctrl+K (Toggle Kuro Copilot), Ctrl+B (Toggle sidebar), Ctrl+, (Settings).
- Added dedicated KeyboardShortcutsTab.tsx inside Settings with categorized tables (Navigation, Tabs, Request Actions, AI & Workspace) and live search filtering.

### 3. 100% English Localization & UI Modernization
- Standardized entire frontend codebase to English:
  - Replaced all remaining Arabic strings in WorkflowFlowGraph.tsx, WorkflowStudioView.tsx, accentTheme.ts, and KuroCopilotDrawer.tsx.
  - Reordered Settings Navigation sidebar to follow standard IDE hierarchy:
    1. General & Network
    2. Editor & Workbench
    3. Kuro AI Copilot
    4. Keyboard Shortcuts
    5. Data & Storage
    6. Security & Vault
    7. About & KuroLabs

### 4. Double-Synced SQLite Persistence for Kuro AI Copilot
- Fixed configuration reset bug when closing and reopening the desktop app.
- Implemented SQLite double-sync architecture:
  - syncConfigToSqlite() automatically commits credentials (API keys, selected model, provider, temperature) to the app_settings SQLite table under the kuro_copilot_config key on every state change.
  - hydrateKuroStoreFromSqlite() reads and re-hydrates the store during app bootstrap in App.tsx.
  - Configured PyWebView storage_path in lifecycle.py to ensure local WebView2 storage remains persistent across sessions.

### 5. Brand Identity & Official Logo Integration
- Integrated frontend/public/logo.png across all primary UI touchpoints:
  - Replaced generic sparkle icons in TitleBar.tsx (Kuro Copilot launcher button), KuroCopilotDrawer.tsx (header & AI chat avatars), and KuroSettingsTab.tsx.
  - Added glowing accent container and SQLite sync indicator badges.

### 6. Backend Stability & Engine Resilience Fixes
- window_state.json Empty-File Guard: Added safety checks in bridge/api.py to handle 0-byte or corrupted window state files without crashing startup.
- Workflow Engine Payload Normalization:
  - In engines/workflows/engine.py, added automatic active environment variable injection so templates like {{BASE_URL}} resolve properly during automated runs.
  - Added recursive normalization for headers, query parameters, auth models, and request bodies before passing payloads to Pydantic validators.
  - Sanitized optional UUID fields (workspace_id, environment_id) converting empty strings to None.
- Private Network Security Configuration: Updated allow_private_network default to true in _SETTINGS_DEFAULTS, allowing seamless requests to local mock servers (http://localhost:4010).

### 7. High-Performance Native Python Splash Screen
- Built native Tkinter + PIL splash screen (src/kurorelay/core/splash.py) loaded before PyWebView:
  - DPI-Aware Centering: Configured SetProcessDpiAwareness(1) and queried physical display metrics (GetSystemMetrics) to guarantee exact geometric screen centering on Windows.
  - Cyber/Obsidian Artwork: High-resolution pre-rendered card (520x350) in deep obsidian #0c0e12, featuring ambient radial neon lime glow around the circular Kuro logo and top accent line.
  - Version Badge: Displays prominent v0.1.0 pill badge with neon borders.
  - Dynamic Animated Progress: Capsule progress bar (0-100%) with smooth interpolation, percentage readout, and stage-by-stage status text.
  - Smooth Alpha Fade-Out: Fades out smoothly on main window ready event (_on_shown) for a seamless transition.

### Validation & Verification
- python -m pytest tests/unit/ -q: 101/101 passed.
- cd frontend && npm run test -- --run: 13/13 passed.
- cd frontend && npx tsc -b --noEmit: 0 errors.
- cd frontend && npm run build: Built successfully with 0 errors.

## 2026-11-22 — Brand Identity Merging, Packaging Automation & Dual-Mode Inno Setup Installer

### 1. Dual-Layout Brand Identity Assets
- Programmatically synthesized the brand logo and text wordmark into two optimized layouts in assets/icons/:
  - assets/icons/kurorelay_combined_vertical.png (1030x1237): Logo centered on top with styled typography underneath.
  - assets/icons/kurorelay_combined_horizontal.png (1425x530): Logo on left with styled typography on right.
- Updated README.md header to showcase the horizontal combined brand banner alongside the app icon.

### 2. Standalone PyInstaller Packaging Pipeline
- Created scripts/kurorelay.spec and scripts/build_exe.py:
  - Supports --mode both (default), --mode onefile, and --mode onefolder.
  - Generates multi-resolution assets/icons/app.ico (16x16 through 256x256).
  - Automatically compiles the React 19 frontend bundle (frontend/dist/).
  - Bundles native splash screen assets, SQLite/SQLAlchemy dialects, pywebview Windows Edge Chromium backends, and keyring support.
  - Excludes heavy unused GUI modules (PySide, PyQt) to minimize footprint.
  - Verified outputs:
    - dist/onefile/KuroRelay.exe: 57.14 MB standalone executable.
    - dist/onefolder/KuroRelay.exe: 112.82 MB modular directory package (instant zero-extraction startup).

### 3. Dual-Mode Inno Setup Windows Installer
- Created scripts/kurorelay_setup.iss and scripts/build_installer.py:
  - Generates custom wizard banner artwork (dist/installer-assets/kurorelay-wizard.bmp) incorporating the vertical combined logo (text underneath) with ambient neon lime glow.
  - Supports dual installation modes via Inno Setup components:
    1. Standard (recommended): Fast-launch modular directory installation.
    2. Portable: Standalone single-file executable.
  - Adds Desktop and Start Menu shortcuts, uninstaller, and Windows App Paths registration (Win+R > kurorelay).
  - Produces dist/installer/KuroRelay-Setup-v0.1.0-x64.exe (96.86 MB).
