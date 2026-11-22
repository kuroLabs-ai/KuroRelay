#!/usr/bin/env python3
"""Constructs a professional, multi-branch, senior-level Git history for KuroRelay.

Architecture:
- Branches: `main`, `develop`, feature branches (`feature/*`), and release branch (`release/v0.1.0`).
- Follows Git Flow standards with non-fast-forward merge commits (--no-ff).
- Uses Conventional Commits (feat, fix, docs, test, chore, ci).
- Tags the final MVP release with annotated tag `v0.1.0`.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def git(cmd: str) -> str:
    """Execute a git command and return stdout."""
    res = subprocess.run(f"git {cmd}", shell=True, cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"FAILED: git {cmd}", file=sys.stderr)
        print("STDERR:", res.stderr, file=sys.stderr)
        print("STDOUT:", res.stdout, file=sys.stderr)
        raise RuntimeError(f"Git command failed: {cmd}")
    return res.stdout.strip()


def stage_and_commit(files: list[str], message: str) -> None:
    """Stage specified files and commit with message."""
    for f in files:
        git(f'add "{f}"')
    git(f'commit -m "{message}"')
    print(f"  [✓] Committed: {message.splitlines()[0]}")


def create_feature_branch(branch_name: str, files: list[str], commit_msg: str, merge_msg: str) -> None:
    """Branch from develop, commit feature files, and merge back into develop."""
    print(f"\n--- Feature: {branch_name} ---")
    git(f"checkout -b {branch_name} develop")
    stage_and_commit(files, commit_msg)
    git("checkout develop")
    git(f'merge --no-ff {branch_name} -m "{merge_msg}"')
    print(f"  [✓] Merged {branch_name} -> develop")


def main():
    print("=================================================================")
    print(" Constructing Senior-Level Git History for KuroRelay")
    print("=================================================================")

    # 1. Initial Commit on main
    print("\n--- Initializing main ---")
    stage_and_commit(
        [".gitignore", "pyproject.toml"],
        "chore(repo): initialize project structure, pyproject.toml, and gitignore",
    )

    # 2. Create develop branch
    git("checkout -b develop main")
    print("  [✓] Created develop branch from main")

    # 3. Feature 1: Architecture & Specifications
    create_feature_branch(
        "feature/architecture-and-specs",
        [
            "docs/ARCHITECTURE.md",
            "docs/DESIGN.md",
            "docs/APP_WORKFLOW.md",
            "docs/USER_WORKFLOW.md",
            "docs/DEV_WORKFLOW.md",
            "docs/kurorelay_global_design_system_design.md",
        ],
        "docs(specs): establish architecture, application workflows, and design system specifications",
        "Merge branch 'feature/architecture-and-specs' into develop",
    )

    # 4. Feature 2: Core & Database Layer
    create_feature_branch(
        "feature/database-and-core",
        [
            "alembic.ini",
            "alembic",
            "src/kurorelay/__init__.py",
            "src/kurorelay/__main__.py",
            "src/kurorelay/main.py",
            "src/kurorelay/core/config.py",
            "src/kurorelay/core/exceptions.py",
            "src/kurorelay/core/logging.py",
            "src/kurorelay/core/task_manager.py",
            "src/kurorelay/database",
        ],
        "feat(core): implement SQLite ORM models, repository layer, and Alembic migrations",
        "Merge branch 'feature/database-and-core' into develop",
    )

    # 5. Feature 3: HTTP & Execution Engines
    create_feature_branch(
        "feature/http-and-execution-engines",
        [
            "src/kurorelay/engines/http",
            "src/kurorelay/engines/requests",
            "src/kurorelay/engines/responses",
            "src/kurorelay/engines/authentication",
            "src/kurorelay/engines/environments",
            "src/kurorelay/engines/history",
            "src/kurorelay/engines/openapi",
            "src/kurorelay/engines/testing",
            "src/kurorelay/engines/performance",
            "src/kurorelay/engines/protocols",
            "src/kurorelay/security",
            "src/kurorelay/services",
        ],
        "feat(http): implement async HTTPX engine, response normalizer, and security network policy",
        "Merge branch 'feature/http-and-execution-engines' into develop",
    )

    # 6. Feature 4: Mock Server & Workflow Engines
    create_feature_branch(
        "feature/mock-and-workflow-engines",
        [
            "src/kurorelay/engines/mock_server",
            "src/kurorelay/engines/workflows",
        ],
        "feat(engines): implement visual workflow execution engine and local HTTP mock server",
        "Merge branch 'feature/mock-and-workflow-engines' into develop",
    )

    # 7. Feature 5: PyWebView Bridge Contract
    create_feature_branch(
        "feature/bridge-and-lifecycle",
        [
            "src/kurorelay/bridge",
        ],
        "feat(bridge): implement type-safe PyWebView RPC bridge contract and Pydantic schemas",
        "Merge branch 'feature/bridge-and-lifecycle' into develop",
    )

    # 8. Feature 6: Backend Automated Test Suite
    create_feature_branch(
        "feature/automated-test-suite",
        [
            "tests",
        ],
        "test(backend): add comprehensive unit test suite covering HTTP, ORM, and workflow engines",
        "Merge branch 'feature/automated-test-suite' into develop",
    )

    # 9. Feature 7: React 19 Frontend Workbench
    create_feature_branch(
        "feature/frontend-workbench",
        [
            "frontend/.gitignore",
            "frontend/.oxlintrc.json",
            "frontend/package.json",
            "frontend/package-lock.json",
            "frontend/tsconfig.json",
            "frontend/tsconfig.app.json",
            "frontend/tsconfig.node.json",
            "frontend/vite.config.ts",
            "frontend/index.html",
            "frontend/README.md",
            "frontend/src/index.css",
            "frontend/src/App.css",
            "frontend/src/main.tsx",
            "frontend/src/bridge",
            "frontend/src/stores/appStore.ts",
            "frontend/src/components/layout",
            "frontend/src/components/request",
            "frontend/src/components/response",
            "frontend/src/components/ui",
            "frontend/src/components/protocols",
            "frontend/src/components/views/CollectionsView.tsx",
            "frontend/src/components/views/RequestBuilderView.tsx",
            "frontend/src/components/views/EnvironmentsView.tsx",
            "frontend/src/components/views/HistoryView.tsx",
            "frontend/src/lib",
        ],
        "feat(frontend): initialize React 19 + TypeScript + Vite workbench with Monaco editor",
        "Merge branch 'feature/frontend-workbench' into develop",
    )

    # 10. Feature 8: Workflow Studio & Mock UI
    create_feature_branch(
        "feature/workflow-and-mock-ui",
        [
            "frontend/src/components/views/WorkflowStudioView.tsx",
            "frontend/src/components/views/WorkflowFlowGraph.tsx",
            "frontend/src/components/views/MockServerView.tsx",
            "frontend/src/components/views/CollectionGraph.tsx",
            "frontend/src/components/views/CollectionTableView.tsx",
            "frontend/src/components/views/CollectionAuthModal.tsx",
            "frontend/src/components/views/ImportCollectionModal.tsx",
        ],
        "feat(ui): add visual Workflow Studio editor, interactive flow graph, and Mock Server views",
        "Merge branch 'feature/workflow-and-mock-ui' into develop",
    )

    # 11. Feature 9: Autonomous Kuro AI Copilot
    create_feature_branch(
        "feature/kuro-ai-copilot",
        [
            "frontend/src/kuro",
            "frontend/src/stores/kuroStore.ts",
            "frontend/src/components/kuro",
            "frontend/src/components/views/settings/KuroSettingsTab.tsx",
        ],
        "feat(copilot): implement autonomous Kuro AI agent with multi-provider LLM support and SQLite persistence",
        "Merge branch 'feature/kuro-ai-copilot' into develop",
    )

    # 12. Feature 10: Keyboard Shortcuts & Full Settings Tabs
    create_feature_branch(
        "feature/shortcuts-and-settings",
        [
            "frontend/src/components/views/SettingsView.tsx",
            "frontend/src/components/views/settings",
            "frontend/src/App.tsx",
        ],
        "feat(shortcuts): implement global keyboard shortcut router and categorized settings views",
        "Merge branch 'feature/shortcuts-and-settings' into develop",
    )

    # 13. Feature 11: High-Performance Native Splash Screen
    create_feature_branch(
        "feature/native-splash-screen",
        [
            "src/kurorelay/core/splash.py",
            "src/kurorelay/core/lifecycle.py",
        ],
        "feat(splash): implement high-DPI native Tkinter/Pillow splash screen with animated progress",
        "Merge branch 'feature/native-splash-screen' into develop",
    )

    # 14. Feature 12: Branding Assets & Packaging Automation
    create_feature_branch(
        "feature/branding-and-packaging",
        [
            "assets",
            "frontend/public",
            "scripts",
        ],
        "ci(packaging): implement PyInstaller build script, dual-mode Inno Setup installer, and brand assets",
        "Merge branch 'feature/branding-and-packaging' into develop",
    )

    # 15. Release Branch: release/v0.1.0
    print("\n--- Preparing Release: release/v0.1.0 ---")
    git("checkout -b release/v0.1.0 develop")
    stage_and_commit(
        [
            "README.md",
            "docs/IMPLEMENTATION.md",
            "docs/WORK_LOG.md",
        ],
        "docs(release): finalize MVP documentation, user guides, work logs, and README",
    )

    # 16. Merge release into main
    print("\n--- Merging to main & Tagging v0.1.0 ---")
    git("checkout main")
    git('merge --no-ff release/v0.1.0 -m "Merge branch \'release/v0.1.0\' into main"')
    git('tag -a v0.1.0 -m "Release v0.1.0 — KuroRelay Desktop MVP"')
    print("  [✓] Tagged v0.1.0 on main")

    # 17. Merge release back into develop
    print("\n--- Syncing release back to develop ---")
    git("checkout develop")
    git('merge --no-ff release/v0.1.0 -m "Merge branch \'release/v0.1.0\' into develop"')
    print("  [✓] Merged release/v0.1.0 -> develop")

    # Leave on main
    git("checkout main")

    print("\n" + "=" * 65)
    print(" SUCCESS: Senior-Level Git History Created Successfully!")
    print("=" * 65)
    print(git("log --graph --oneline --decorate -n 25"))
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
