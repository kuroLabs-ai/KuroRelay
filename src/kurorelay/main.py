"""KuroRelay application entry point."""
from __future__ import annotations

import sys
import os

from kurorelay.core.config import settings
from kurorelay.core.logging import configure_logging
from kurorelay.core.lifecycle import AppLifecycle


def main() -> None:
    configure_logging(level=settings.log_level)
    lifecycle = AppLifecycle()
    try:
        lifecycle.start()
    except KeyboardInterrupt:
        pass
    finally:
        lifecycle.stop()


if __name__ == "__main__":
    main()
