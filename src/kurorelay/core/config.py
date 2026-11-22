"""Application configuration — loaded from environment or defaults."""
import os
import sys
from pathlib import Path


def _resolve_data_dir() -> Path:
    env_dir = os.getenv("KURORELAY_DATA_DIR")
    if env_dir:
        target = Path(env_dir)
    elif sys.platform == "win32":
        local_app_data = os.getenv("LOCALAPPDATA")
        base = Path(local_app_data) if local_app_data else (Path.home() / "AppData" / "Local")
        target = base / "KuroLabs" / "KuroRelay"
    elif sys.platform == "darwin":
        target = Path.home() / "Library" / "Application Support" / "KuroLabs" / "KuroRelay"
    else:
        xdg_data = os.getenv("XDG_DATA_HOME")
        base = Path(xdg_data) if xdg_data else (Path.home() / ".local" / "share")
        target = base / "KuroLabs" / "KuroRelay"

    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return target


class Settings:
    # App
    app_name: str = "KuroRelay"
    app_version: str = "0.1.0"

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # Database & Storage Structure
    @property
    def data_dir(self) -> Path:
        return _resolve_data_dir()

    @property
    def database_path(self) -> Path:
        return self.data_dir / "kurorelay.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def certs_dir(self) -> Path:
        return self.data_dir / "certificates"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def window_state_path(self) -> Path:
        return self.data_dir / "window_state.json"

    def ensure_directories(self) -> None:
        """Create canonical application data directories if missing."""
        for directory in (
            self.data_dir,
            self.backups_dir,
            self.logs_dir,
            self.certs_dir,
            self.cache_dir,
        ):
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass

    # Frontend dev server (used in dev mode)
    frontend_dev_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Window
    window_width: int = int(os.getenv("WINDOW_WIDTH", "1400"))
    window_height: int = int(os.getenv("WINDOW_HEIGHT", "900"))
    window_min_width: int = 900
    window_min_height: int = 600

    # Debug
    debug: bool = os.getenv("KURORELAY_DEBUG", "false").lower() == "true"


settings = Settings()
