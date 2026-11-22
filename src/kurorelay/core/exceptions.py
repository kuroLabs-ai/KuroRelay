"""KuroRelay base exception hierarchy."""


class KuroRelayError(Exception):
    """Base error for all application exceptions."""
    code: str = "KURORELAY_ERROR"

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class ValidationError(KuroRelayError):
    code = "VALIDATION_ERROR"


class BridgeError(KuroRelayError):
    code = "BRIDGE_ERROR"


class NetworkError(KuroRelayError):
    code = "NETWORK_ERROR"


class SecurityError(KuroRelayError):
    code = "SECURITY_ERROR"


class DNSError(KuroRelayError):
    code = "DNS_ERROR"


class ConnectionError(KuroRelayError):
    code = "CONNECTION_ERROR"


class TimeoutError(KuroRelayError):
    code = "TIMEOUT"


class TLSError(KuroRelayError):
    code = "TLS_ERROR"


class AuthenticationError(KuroRelayError):
    code = "AUTHENTICATION_ERROR"


class DatabaseError(KuroRelayError):
    code = "DATABASE_ERROR"


class ScriptError(KuroRelayError):
    code = "SCRIPT_ERROR"


class AIProviderError(KuroRelayError):
    code = "AI_PROVIDER_ERROR"
