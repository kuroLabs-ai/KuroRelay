import httpx
import respx


def test_bearer_token_is_sent_as_authorization_header(api):
    url = "https://api.example.test/resource"
    with respx.mock(assert_all_called=True) as router:
        route = router.get(url).mock(return_value=httpx.Response(200, json={"ok": True}))

        result = api.send_request(
            {
                "task_id": "bearer-task",
                "method": "GET",
                "url": url,
                "allow_private_network": True,
                "auth": {
                    "type": "bearer",
                    "configuration": {"token": "test-token"},
                },
            },
        )

    assert result["status"] == "completed"
    assert result["task_id"] == "bearer-task"
    assert route.calls.last.request.headers["Authorization"] == "Bearer test-token"
    history = api.get_request_history()
    assert "test-token" not in str(history["items"][0]["request_snapshot"])
    assert (
        history["items"][0]["request_snapshot"]["auth"]["configuration"]["token"]
        == "[REDACTED]"
    )


def test_basic_credentials_are_sent_using_httpx_basic_auth(api):
    url = "https://api.example.test/resource"
    with respx.mock(assert_all_called=True) as router:
        route = router.get(url).mock(return_value=httpx.Response(200, json={"ok": True}))

        result = api.send_request(
            {
                "task_id": "basic-task",
                "method": "GET",
                "url": url,
                "allow_private_network": True,
                "auth": {
                    "type": "basic",
                    "configuration": {"username": "test-user", "password": "test-pass"},
                },
            },
        )

    assert result["status"] == "completed"
    assert route.calls.last.request.headers["Authorization"] == "Basic dGVzdC11c2VyOnRlc3QtcGFzcw=="


def test_bearer_auth_requires_a_nonempty_token(api):
    result = api.send_request(
        {
            "method": "GET",
            "url": "https://api.example.test/resource",
            "allow_private_network": True,
            "auth": {"type": "bearer", "configuration": {"token": " "}},
        }
    )

    assert result["status"] == "failed"
    assert result["error"]["code"] == "VALIDATION_ERROR"
    assert result["error"]["message"] == "A bearer token is required"
