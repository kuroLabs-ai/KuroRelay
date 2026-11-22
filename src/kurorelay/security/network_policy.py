"""Validate destinations before connecting and before following redirects."""
from __future__ import annotations

import asyncio
import ipaddress
import socket

import httpx

from kurorelay.core.exceptions import DNSError, SecurityError, ValidationError


class NetworkAccessPolicy:
    async def validate_destination(
        self, url: str | httpx.URL, allow_private_network: bool = False
    ) -> None:
        try:
            parsed_url = url if isinstance(url, httpx.URL) else httpx.URL(url)
        except httpx.InvalidURL:
            raise ValidationError("Request URL is invalid") from None

        if parsed_url.scheme not in {"http", "https"} or not parsed_url.host:
            raise ValidationError("Request URL must use HTTP or HTTPS")
        if parsed_url.username or parsed_url.password:
            raise ValidationError(
                "Configure credentials in the Auth tab instead of the URL"
            )
        if allow_private_network:
            return

        host = parsed_url.host.rstrip(".").casefold()
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            default_port = 443 if parsed_url.scheme == "https" else 80
            addresses = await self._resolve_host(host, parsed_url.port or default_port)

        if any(not address.is_global for address in addresses):
            raise SecurityError(
                "Destination resolves to a local or non-public network address",
                details={"category": "private_network"},
            )

    @staticmethod
    async def _resolve_host(
        host: str, port: int
    ) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
        try:
            records = await asyncio.get_running_loop().getaddrinfo(
                host,
                port,
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise DNSError(
                "The request hostname could not be resolved",
                details={"category": "dns"},
            ) from exc

        addresses = {
            ipaddress.ip_address(record[4][0])
            for record in records
        }
        if not addresses:
            raise DNSError(
                "The request hostname did not resolve to an address",
                details={"category": "dns"},
            )
        return list(addresses)
