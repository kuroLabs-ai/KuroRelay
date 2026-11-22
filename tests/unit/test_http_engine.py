import asyncio
from threading import Event, Thread

import httpx
import pytest
import respx

from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.core.exceptions import TimeoutError as KuroTimeoutError
from kurorelay.engines.http.client import HTTPEngine
from kurorelay.engines.requests.engine import RequestEngine


def test_bridge_orchestrates_request_and_normalizes_response(api):
    url = "https://api.example.test/result"
    with respx.mock(assert_all_called=True) as router:
        router.get(url).mock(return_value=httpx.Response(200, json={"ok": True}))
        result = api.send_request(
            {"method": "GET", "url": url, "allow_private_network": True}
        )

    assert result["status"] == "completed"
    assert result["response"]["body"] == {"type": "json", "data": {"ok": True}}
    history = api.get_request_history()
    assert history["total"] == 1
    assert history["items"][0]["response_metadata"]["status_code"] == 200


def test_bridge_returns_structured_validation_errors(api):
    result = api.send_request(
        {"method": "GET", "url": "file:///private/resource"}
    )

    assert result["status"] == "failed"
    assert result["error"]["code"] == "VALIDATION_ERROR"
    assert result["error"]["message"] == "Request URL must use HTTP or HTTPS"


@pytest.mark.asyncio
async def test_http_engine_returns_real_http_error_statuses():
    url = "https://api.example.test/missing"
    prepared = RequestEngine().prepare(
        {"method": "GET", "url": url, "allow_private_network": True}
    )

    with respx.mock(assert_all_called=True) as router:
        router.get(url).mock(return_value=httpx.Response(404, text="missing"))
        response = await HTTPEngine().execute(prepared)

    assert response.status_code == 404
    assert response.text == "missing"


@pytest.mark.asyncio
async def test_http_engine_maps_timeouts_without_leaking_transport_details():
    url = "https://api.example.test/private"
    prepared = RequestEngine().prepare(
        {"method": "GET", "url": url, "allow_private_network": True}
    )

    with respx.mock(assert_all_called=True) as router:
        router.get(url).mock(side_effect=httpx.ReadTimeout("sensitive transport text"))
        with pytest.raises(KuroTimeoutError) as error:
            await HTTPEngine().execute(prepared)

    assert error.value.message == "The request timed out"
    assert "sensitive transport text" not in str(error.value)


def test_bridge_cancels_active_service_task_from_another_thread():
    started = Event()
    result = {}

    class BlockingRequestService:
        async def execute(self, task_id, payload):
            started.set()
            await asyncio.sleep(30)

    task_id = "cancel-this-request"
    api = KuroRelayAPI(request_service=BlockingRequestService())
    thread = Thread(
        target=lambda: result.update(
            api.send_request(
                {
                    "task_id": task_id,
                    "method": "GET",
                    "url": "https://api.example.test/slow",
                }
            )
        ),
        daemon=True,
    )
    thread.start()

    assert started.wait(timeout=2)
    assert api.cancel_task(task_id)["status"] == "cancellation_requested"
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert result == {"task_id": task_id, "status": "cancelled"}
