"""HTTPX transport engine with structured, credential-safe error mapping."""
from __future__ import annotations

import socket
import ssl

import httpx

from kurorelay.core.exceptions import ConnectionError as KuroConnectionError
from kurorelay.core.exceptions import (
    DNSError,
    NetworkError,
    SecurityError,
    TLSError,
    ValidationError,
)
from kurorelay.core.exceptions import TimeoutError as KuroTimeoutError
from kurorelay.engines.requests.engine import PreparedRequest
from kurorelay.security.network_policy import NetworkAccessPolicy


class HTTPEngine:
    def __init__(self, network_policy: NetworkAccessPolicy | None = None) -> None:
        self._network_policy = network_policy or NetworkAccessPolicy()

    async def execute(self, request: PreparedRequest) -> httpx.Response:
        try:
            await self._network_policy.validate_destination(
                request.url, request.allow_private_network
            )
            async with httpx.AsyncClient(
                verify=request.verify_tls,
                follow_redirects=False,
                timeout=httpx.Timeout(request.timeout_seconds),
            ) as client:
                response = await client.request(
                    method=request.method,
                    url=request.url,
                    headers=request.headers,
                    params=request.params,
                    content=request.content,
                    auth=request.auth,
                    follow_redirects=False,
                )
                history = []
                if not request.follow_redirects:
                    return response

                while response.next_request is not None:
                    if len(history) >= client.max_redirects:
                        raise httpx.TooManyRedirects(
                            "Exceeded maximum allowed redirects.",
                            request=response.request,
                        )

                    outgoing = response.next_request
                    await self._network_policy.validate_destination(
                        outgoing.url, request.allow_private_network
                    )
                    await response.aread()
                    history.append(response)
                    response = await client.send(outgoing, follow_redirects=False)

                response.history = history
                return response
        except httpx.TimeoutException as exc:
            raise KuroTimeoutError(
                "The request timed out",
                details={"category": "timeout"},
            ) from exc
        except httpx.InvalidURL:
            raise ValidationError("Request URL is invalid") from None
        except SecurityError:
            raise
        except httpx.TooManyRedirects as exc:
            raise NetworkError(
                "The request exceeded the maximum redirect count",
                details={"category": "redirect_limit"},
            ) from exc
        except httpx.ConnectError as exc:
            cause = self._root_cause(exc)
            if isinstance(cause, ssl.SSLError):
                raise TLSError(
                    "TLS negotiation or certificate verification failed",
                    details={"category": "tls"},
                ) from exc
            if isinstance(cause, socket.gaierror):
                raise DNSError(
                    "The request hostname could not be resolved",
                    details={"category": "dns"},
                ) from exc
            raise KuroConnectionError(
                "Could not connect to the request host",
                details={"category": "connection"},
            ) from exc
        except httpx.TransportError as exc:
            raise NetworkError(
                "The request failed due to a network transport error",
                details={"category": "transport"},
            ) from exc

    @staticmethod
    def _root_cause(error: BaseException) -> BaseException:
        cause = error
        visited: set[int] = set()
        while cause.__cause__ or cause.__context__:
            if id(cause) in visited:
                break
            visited.add(id(cause))
            next_cause = cause.__cause__ or cause.__context__
            if next_cause is None:
                break
            cause = next_cause
        return cause
