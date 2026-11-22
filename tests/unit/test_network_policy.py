import ipaddress

import httpx
import pytest
import respx

from kurorelay.core.exceptions import SecurityError
from kurorelay.engines.http.client import HTTPEngine
from kurorelay.engines.requests.engine import RequestEngine
from kurorelay.security.network_policy import NetworkAccessPolicy


@pytest.mark.asyncio
async def test_private_address_is_blocked_unless_request_explicitly_allows_it():
    policy = NetworkAccessPolicy()

    with pytest.raises(SecurityError):
        await policy.validate_destination("http://127.0.0.1:8000")

    await policy.validate_destination("http://127.0.0.1:8000", allow_private_network=True)


@pytest.mark.asyncio
async def test_hostname_is_blocked_if_any_resolved_address_is_non_public(monkeypatch):
    async def resolve_host(host, port):
        return [
            ipaddress.ip_address("93.184.216.34"),
            ipaddress.ip_address("10.0.0.5"),
        ]

    monkeypatch.setattr(NetworkAccessPolicy, "_resolve_host", staticmethod(resolve_host))
    with pytest.raises(SecurityError):
        await NetworkAccessPolicy().validate_destination("https://api.example.test")


@pytest.mark.asyncio
async def test_http_engine_rechecks_private_redirect_before_following():
    start_url = "https://8.8.8.8/start"
    private_url = "http://127.0.0.1/private"
    prepared = RequestEngine().prepare({"method": "GET", "url": start_url})

    with respx.mock(assert_all_called=False) as router:
        start_route = router.get(start_url).mock(
            return_value=httpx.Response(302, headers={"location": private_url})
        )
        private_route = router.get(private_url).mock(
            return_value=httpx.Response(200, text="should not be sent")
        )
        with pytest.raises(SecurityError):
            await HTTPEngine().execute(prepared)

    assert start_route.called
    assert not private_route.called


@pytest.mark.asyncio
async def test_explicit_private_network_access_allows_local_redirects():
    start_url = "https://8.8.8.8/start"
    private_url = "http://127.0.0.1/private"
    prepared = RequestEngine().prepare(
        {
            "method": "GET",
            "url": start_url,
            "allow_private_network": True,
        }
    )

    with respx.mock(assert_all_called=True) as router:
        router.get(start_url).mock(
            return_value=httpx.Response(302, headers={"location": private_url})
        )
        router.get(private_url).mock(return_value=httpx.Response(200, text="ok"))
        response = await HTTPEngine().execute(prepared)

    assert response.status_code == 200
    assert len(response.history) == 1
