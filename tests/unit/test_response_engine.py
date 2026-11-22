import httpx

from kurorelay.engines.responses.engine import ResponseEngine


def test_response_engine_keeps_http_error_responses_and_decodes_json_suffix():
    response = httpx.Response(
        422,
        headers={"content-type": "application/problem+json"},
        json={"detail": "invalid"},
    )

    result = ResponseEngine().normalize("task-id", response, 12.345)

    assert result["status"] == "completed"
    assert result["response"]["status_code"] == 422
    assert result["response"]["body"] == {"type": "json", "data": {"detail": "invalid"}}
    assert result["response"]["duration_ms"] == 12.35


def test_response_engine_extracts_image_as_data_url():
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    response = httpx.Response(
        200,
        headers={"content-type": "image/png"},
        content=png_bytes,
    )

    result = ResponseEngine().normalize("task-img", response, 5.0)

    assert result["status"] == "completed"
    assert result["response"]["status_code"] == 200
    body = result["response"]["body"]
    assert body["type"] == "image"
    assert body["mime_type"] == "image/png"
    assert body["data"].startswith("data:image/png;base64,")
    assert body["size_bytes"] == len(png_bytes)
