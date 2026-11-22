# KuroRelay — Development Workflow

**Product:** KuroRelay  
**Organization:** Kuro-Labs  
**Version:** 1.0  
**Status:** Initial Baseline

---

## Overview

This document defines the **engineering process** for KuroRelay — how development work is organized, executed, reviewed, and completed. Every team member and contributor must follow these rules.

> [!IMPORTANT]
> Never claim a feature is complete without evidence. Build the foundation before the advanced features.

---

## 14.1 Core Development Rules

These rules are non-negotiable:

1. **Inspect before changing.** Read and understand existing code before modifying it.
2. **Verify existence.** Do not assume an implementation exists because it is documented.
3. **Define scope.** Every major feature must have a written requirement and scope before implementation begins.
4. **Separate concerns.** UI implementation must be separated from business logic.
5. **Test core behavior.** Every core behavior must have automated tests.
6. **No unnecessary dependencies.** Justify every new library. Use established options from the approved stack.
7. **No duplication.** Do not reimplement existing functionality.
8. **Document decisions.** Architectural decisions must be recorded with their rationale.
9. **Focused commits.** Each commit should address one concern.
10. **Test before merging.** Tests must pass before any merge.
11. **Evidence of completion.** Features are done only when there is evidence: test results, screenshots, QA notes.

---

## 14.2 Feature Development Cycle

Every feature follows this sequence without skipping steps:

```
flowchart TD
    A[1. Requirement Definition] --> B[2. Technical Design]
    B --> C[3. Data Model Design]
    C --> D[4. Bridge Contract Definition]
    D --> E[5. Backend Implementation]
    E --> F[6. Backend Tests]
    F --> G[7. Frontend Implementation]
    G --> H[8. Frontend Tests]
    H --> I[9. Integration Tests]
    I --> J[10. Manual QA]
    J --> K[11. Documentation Update]
    K --> L[12. Code Review]
    L --> M{Review passed?}
    M -- Changes required --> E
    M -- Approved --> N[13. Merge to develop]
```

---

## 14.3 Git Strategy

### Branch Types

| Branch | Purpose |
|---|---|
| `main` | Stable releases only |
| `develop` | Integration branch — always buildable |
| `feature/<name>` | New feature implementation |
| `fix/<name>` | Bug fixes |
| `release/<version>` | Release preparation and stabilization |
| `hotfix/<name>` | Critical production fixes |

### Branch Workflow

```
flowchart LR
    A[feature/xyz] --> B[develop]
    C[fix/abc] --> B
    B --> D[release/1.0]
    D --> E[main]
    D --> B
    F[hotfix/critical] --> E
    F --> B
```

### Commit Message Format

```
type(scope): short description

Body: what and why (optional for simple changes)

Refs: #issue-number
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `security`

**Examples:**
```
feat(request-engine): add Bearer token authentication support
fix(bridge): validate payload size before processing
test(history-engine): add secret redaction tests
docs(architecture): update bridge contract section
security(tls): enforce verify=True as default in HTTP engine
```

### Pull Request Requirements

A PR must include:
- **Description:** What does this change do?
- **Scope:** What is the boundary of this change?
- **Screenshots:** UI changes must include before/after screenshots.
- **Testing Evidence:** Test output, manual QA steps completed.
- **Known Limitations:** Anything deferred or incomplete.
- **Related Issue:** Issue number this PR closes.

PR template:

```markdown
## Description
<!-- What does this PR do? -->

## Scope
<!-- What is the boundary? What is NOT changed? -->

## Screenshots
<!-- Before / After for UI changes -->

## Testing Evidence
<!-- Paste test output or describe manual QA steps completed -->

## Known Limitations
<!-- Anything deferred, incomplete, or technical debt introduced -->

## Related Issue
Closes #
```

---

## 14.4 Definition of Done

A feature is **complete** only when **all** of the following are true:

| Criterion | Description |
|---|---|
| ✅ Requirements satisfied | All defined requirements are implemented |
| ✅ Implementation integrated | Code merged into develop, not just a branch |
| ✅ Error cases handled | All error paths surface correctly to the user |
| ✅ Security reviewed | Security implications considered and addressed |
| ✅ Tests pass | Unit and integration tests pass in CI |
| ✅ UI states handled | Loading, success, empty, and error states all implemented |
| ✅ Documentation updated | Relevant docs updated to reflect the change |
| ✅ No critical regression | No previously passing tests broken |
| ✅ Evidence exists | Screenshot, test output, or QA notes recorded |

---

## 14.5 Code Organization Rules

### Backend (Python)

```
backend/app/
├── core/           # Config, exceptions, logging, lifecycle — no business logic
├── bridge/         # Bridge API, command handlers, schemas — thin layer only
├── services/       # Business logic services — orchestrate engines
├── engines/        # Specialized execution engines — domain logic
├── database/       # Models, sessions, repositories — data access only
├── security/       # Security enforcement — called by engines and services
└── utils/          # Pure utility functions — no side effects
```

**Rules:**
- Engines must not import from `bridge/` directly.
- Services orchestrate engines — they do not contain HTTP client code.
- Database repositories must not contain business logic.
- `core/` modules must not import from `services/` or `engines/`.

### Frontend (React + TypeScript)

```
frontend/src/
├── app/            # App entry, routes, providers — minimal logic
├── components/     # Reusable components — no data fetching
├── features/       # Feature modules — colocate components, hooks, state
├── bridge/         # Bridge client, types, commands — no UI
├── stores/         # Zustand stores — UI state only
├── hooks/          # Shared custom hooks
├── schemas/        # Zod schemas — no components
├── types/          # TypeScript interfaces and types
└── utils/          # Pure utility functions
```

**Rules:**
- Components must not call bridge directly — use hooks or services.
- Zustand stores must not contain async data — use TanStack Query for that.
- Features must not import from other features — use shared `components/`, `hooks/`, `types/`.
- Bridge client must not contain UI logic.

---

## 14.6 Testing Requirements

### Backend

| Test Type | Location | Requirement |
|---|---|---|
| Unit | `backend/tests/unit/` | Every engine function, every repository method |
| Integration | `backend/tests/integration/` | Bridge → Service → Engine → Database |
| Security | `backend/tests/security/` | Secret redaction, TLS, SSRF, invalid payloads |

Run tests:
```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

### Frontend

| Test Type | Tool | Requirement |
|---|---|---|
| Unit | Vitest | Utility functions, Zod schemas, state stores |
| Component | React Testing Library | Key components: Request Builder, Response Inspector |
| E2E | Playwright | First launch, create request, send, inspect |

Run tests:
```bash
cd frontend
npm run test
npm run test:e2e
```

### Coverage Targets

| Layer | Target |
|---|---|
| Python engines | ≥ 80% line coverage |
| Python services | ≥ 70% line coverage |
| Frontend utilities | ≥ 70% line coverage |

> [!NOTE]
> Coverage numbers are targets, not substitutes for meaningful tests. 100% coverage with weak assertions is worse than 70% coverage with strong assertions.

### Regression Rule

> **Every bug fix must include a test that reproduces the original problem before the fix is applied.**

---

## 14.7 Code Review Guidelines

**Reviewer responsibilities:**
- Verify the change does what it claims.
- Check that error paths are handled.
- Check that tests are meaningful (not just hitting lines).
- Check that secrets are not logged or leaked.
- Check that security-sensitive changes are correct.
- Check that the bridge contract is not bypassed.
- Verify that documentation is updated.

**Author responsibilities:**
- Respond to all review comments.
- Do not dismiss security concerns without discussion.
- Request re-review after significant changes.
- Do not self-merge (except hotfixes with post-merge review).

---

## 14.8 Security Development Rules

> [!CAUTION]
> These rules apply to every contributor, every commit, every PR.

1. **Never log credentials.** No passwords, API keys, OAuth tokens, Authorization header values in logs.
2. **Never store secrets in plaintext.** Always use `keyring` / Windows Credential Manager.
3. **Never disable TLS silently.** TLS downgrade requires explicit user action and UI warning.
4. **Never use `eval`.** Neither Python `eval` nor frontend `eval` for user scripts.
5. **Never bypass the bridge allowlist.** Only approved commands are exposed.
6. **Never invent security mechanisms.** Use established libraries (keyring, cryptography).
7. **Always redact before storing.** History records must strip Authorization headers and other sensitive fields.
8. **Always validate redirect destinations.** Re-check the target URL after any redirect.

---

## 14.9 Development Environment Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Git

### Full Setup

```bash
# Clone repository
git clone https://github.com/Kuro-Labs/KuroRelay.git
cd KuroRelay

# Backend setup
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head

# Frontend setup
cd ../frontend
npm install

# Run in development mode (two terminals)
# Terminal 1 - Frontend
cd frontend && npm run dev

# Terminal 2 - Backend / Desktop
cd backend && python -m desktop.launcher
```

### Environment Variables for Development

Create `backend/.env.dev`:
```
LOG_LEVEL=DEBUG
DATABASE_PATH=./dev.db
WEBVIEW_DEBUG=true
```

---

## 14.10 Development Roadmap at a Glance

| Phase | Focus | Deliverable |
|---|---|---|
| **Phase 0** | Foundation | Working desktop app with React/Python bridge |
| **Phase 1** | HTTP Core | Request execution environment |
| **Phase 2** | Main UI | Complete basic developer workspace |
| **Phase 3** | Persistence | Persistent local workspace |
| **Phase 4** | Testing Center | API testing environment |
| **Phase 5** | API Explorer | OpenAPI exploration |
| **Phase 6** | Workflow Studio | Visual API automation |
| **Phase 7** | Advanced Protocols | WebSocket, GraphQL, SSE |
| **Phase 8** | Mock & Performance | Mock servers and load testing |
| **Phase 9** | AI Integration | AI-assisted development |
| **Phase 10** | Plugins | Extension ecosystem |
| **Phase 11** | Release | Packaged Windows release |

> [!IMPORTANT]
> **Phase 0 → Phase 1 → Phase 2 → Phase 3 must be completed and stable before any later phase begins.** The foundation is non-negotiable.

---

## 14.11 Documentation Requirements

| Document | Location | Update trigger |
|---|---|---|
| `PRD.md` | `docs/` | Product scope changes |
| `ARCHITECTURE.md` | `docs/` | Architectural decisions |
| `IMPLEMENTATION.md` | `docs/` | Each phase completion |
| `USER_WORKFLOW.md` | `docs/` | New user-facing features |
| `APP_WORKFLOW.md` | `docs/` | New internal workflows |
| `DEV_WORKFLOW.md` | `docs/` | Process changes |
| `SECURITY.md` | `docs/` | Security architecture changes |
| `DATABASE.md` | `docs/` | Schema changes |
| `BRIDGE_CONTRACT.md` | `docs/` | Bridge command changes |
| `TESTING.md` | `docs/` | QA strategy updates |
| `RELEASE.md` | `docs/` | Packaging and release steps |
| `CHANGELOG.md` | root | Every merge to main |

---

*This document should be updated when development processes change. All contributors are expected to read and follow it.*
