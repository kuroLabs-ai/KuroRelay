"""Application lifecycle — startup, shutdown, PyWebView wiring."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
import webview

from kurorelay.core.config import settings
from kurorelay.core.logging import get_logger
from kurorelay.database.base import init_db
from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.core.splash import SplashScreen

logger = get_logger(__name__)


def find_frontend_url() -> str:
    """Find built local frontend dist/index.html to serve directly in PyWebView."""
    candidates = []

    # Check PyInstaller frozen bundle location
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass) / "frontend" / "dist" / "index.html")
        exe_dir = Path(sys.executable).resolve().parent
        candidates.append(exe_dir / "frontend" / "dist" / "index.html")
        candidates.append(exe_dir / "_internal" / "frontend" / "dist" / "index.html")

    # Check relative to source repository root
    current = Path(__file__).resolve()
    for parent in [current.parent, current.parents[1], current.parents[2], current.parents[3]]:
        candidates.append(parent / "frontend" / "dist" / "index.html")

    for dist_path in candidates:
        if dist_path.is_file():
            logger.info("Serving local React build in pywebview", path=str(dist_path))
            return str(dist_path.resolve())

    # Fallback to dev server if not yet built
    logger.info("Local dist not found; falling back to dev URL", url=settings.frontend_dev_url)
    return settings.frontend_dev_url


class AppLifecycle:
    def __init__(self):
        self._api = KuroRelayAPI()
        self._window = None

    def start(self) -> None:
        logger.info("KuroRelay starting", version=settings.app_version)

        # ── Splash screen (native tkinter, shown before PyWebView loads) ──────
        logo_path = None
        # Look for logo.png next to the frontend/public/ folder
        for candidate in [
            Path(__file__).parents[4] / "frontend" / "public" / "logo.png",
            Path(__file__).parents[3] / "frontend" / "public" / "logo.png",
            Path(__file__).parents[2] / "frontend" / "public" / "logo.png",
        ]:
            if candidate.is_file():
                logo_path = str(candidate)
                break
        # Also check frozen bundle
        if not logo_path and getattr(sys, "frozen", False):
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                p = Path(meipass) / "frontend" / "public" / "logo.png"
                if p.is_file():
                    logo_path = str(p)

        splash = SplashScreen(logo_path=logo_path, version=settings.app_version)
        splash.show()
        splash.set_progress(10)

        # Ensure all local app data directories exist
        settings.ensure_directories()
        splash.set_status("Preparing directories…")
        splash.set_progress(25)

        # Initialize SQLite database
        try:
            init_db()
            logger.info("Database initialized", path=str(settings.database_path))
        except Exception as exc:
            logger.error("Database initialization failed", error=str(exc))
            splash.close()
            raise
        splash.set_status("Database ready…")
        splash.set_progress(55)

        url = find_frontend_url()
        splash.set_status("Loading interface…")
        splash.set_progress(75)

        # Load persisted window state (dimensions, position, maximized flag)
        win_state = self._api.get_window_state().get("state", {})
        is_maximized = win_state.get("is_maximized", True)
        self._api._is_maximized = bool(is_maximized)

        width = int(win_state.get("width") or settings.window_width)
        height = int(win_state.get("height") or settings.window_height)
        x = win_state.get("x")
        y = win_state.get("y")

        window_kwargs: dict[str, Any] = {
            "title": settings.app_name,
            "url": url,
            "js_api": self._api,
            "width": max(width, settings.window_min_width),
            "height": max(height, settings.window_min_height),
            "min_size": (settings.window_min_width, settings.window_min_height),
            "background_color": "#000000",
            "frameless": True,
            "easy_drag": False,
            "maximized": bool(is_maximized),
        }
        if isinstance(x, int) and isinstance(y, int) and x >= 0 and y >= 0:
            window_kwargs["x"] = x
            window_kwargs["y"] = y

        self._window = webview.create_window(**window_kwargs)
        self._api.set_window(self._window)

        # Wire window events for native lifecycle & persistence
        def _on_shown():
            # Close splash as soon as the main window is visible
            splash.set_progress(100)
            splash.set_status("Ready!")
            splash.close()
            if is_maximized:
                try:
                    self._window.maximize()
                except Exception:
                    pass

        def _on_maximized():
            self._api._is_maximized = True
            try:
                self._api.save_window_state({"is_maximized": True})
            except Exception:
                pass

        def _on_restored():
            self._api._is_maximized = False
            try:
                self._api.save_window_state({"is_maximized": False})
            except Exception:
                pass

        def _on_closing():
            try:
                self._api.save_window_state()
            except Exception:
                pass

        try:
            self._window.events.shown += _on_shown
            self._window.events.maximized += _on_maximized
            self._window.events.restored += _on_restored
            self._window.events.closing += _on_closing
        except Exception:
            pass

        logger.info("Launching window with local frontend", url=url, maximized=is_maximized)
        splash.set_status("Launching window…")
        splash.set_progress(90)
        storage_dir = settings.data_dir / "webview_data"
        try:
            storage_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        webview.start(debug=settings.debug, http_server=True, storage_path=str(storage_dir))

    def stop(self) -> None:
        logger.info("KuroRelay shutting down")
        result = self._api.stop_mock_server()
        if result.get("status") != "ok":
            logger.warning("Mock server did not stop cleanly", result=result)
