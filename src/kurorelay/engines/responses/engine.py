"""Normalize HTTPX responses for the bridge contract."""
from __future__ import annotations

import base64
import json

import httpx


class ResponseEngine:
    def normalize(
        self, task_id: str, response: httpx.Response, duration_ms: float
    ) -> dict:
        content_type = response.headers.get("content-type", "")
        body = self._extract_body(response, content_type)

        return {
            "task_id": task_id,
            "status": "completed",
            "response": {
                "status_code": response.status_code,
                "status_text": response.reason_phrase,
                "headers": dict(response.headers),
                "body": body,
                "duration_ms": round(duration_ms, 2),
                "size_bytes": len(response.content),
                "redirect_count": len(response.history),
            },
        }

    @staticmethod
    def _extract_body(response: httpx.Response, content_type: str) -> dict:
        media_type = content_type.split(";", maxsplit=1)[0].strip().lower()
        if media_type == "application/json" or media_type.endswith("+json"):
            try:
                return {"type": "json", "data": response.json()}
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        if media_type.startswith("image/"):
            try:
                raw_bytes = response.content
                b64 = base64.b64encode(raw_bytes).decode("ascii")
                data_url = f"data:{media_type};base64,{b64}"
                raw_text = None
                if media_type == "image/svg+xml":
                    try:
                        raw_text = response.text
                    except (UnicodeDecodeError, Exception):  # noqa: S110
                        pass
                return {
                    "type": "image",
                    "data": data_url,
                    "mime_type": media_type,
                    "size_bytes": len(raw_bytes),
                    "raw": raw_text or data_url,
                }
            except Exception:  # noqa: S110
                pass

        return {"type": "text", "data": response.text}
