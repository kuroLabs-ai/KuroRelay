"""Structured logging configuration."""
import logging
from logging.handlers import RotatingFileHandler

import structlog

from kurorelay.core.config import settings


def configure_logging(level: str = "INFO") -> None:
    """Configure structlog with safe, redaction-aware processors and file rotation."""
    root_logger = logging.getLogger()
    log_level = getattr(logging, level.upper(), logging.INFO)
    root_logger.setLevel(log_level)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(message)s"))
    root_logger.handlers = [console_handler]

    try:
        settings.logs_dir.mkdir(parents=True, exist_ok=True)
        log_file = settings.logs_dir / "kurorelay.log"
        file_handler = RotatingFileHandler(
            str(log_file),
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        root_logger.addHandler(file_handler)
    except Exception:
        pass

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            _redact_sensitive_fields,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def _redact_sensitive_fields(logger, method, event_dict: dict) -> dict:
    """Redact credential-like fields throughout structured log values."""
    sensitive_keys = {
        "authorization",
        "password",
        "token",
        "api_key",
        "apikey",
        "secret",
        "client_secret",
        "credential",
        "cookie",
        "set_cookie",
        "x_api_key",
    }

    def redact(value):
        if isinstance(value, dict):
            redacted = {}
            for key, nested_value in value.items():
                normalized_key = str(key).casefold().replace("-", "_")
                is_sensitive = (
                    normalized_key in sensitive_keys
                    or normalized_key.endswith(("_token", "_password", "_secret", "_credential"))
                )
                redacted[key] = (
                    "[REDACTED]" if is_sensitive else redact(nested_value)
                )
            return redacted
        if isinstance(value, list):
            return [redact(item) for item in value]
        if isinstance(value, tuple):
            return tuple(redact(item) for item in value)
        return value

    return redact(event_dict)


def get_logger(name: str):
    return structlog.get_logger(name)
