"""Performance & Stress Testing Engine — concurrent load generation, percentile latency calculation, and timeline metrics."""
from __future__ import annotations

import concurrent.futures
import math
import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

logger = get_logger(__name__)

# Safety bounds
MAX_CONCURRENCY = 50
MAX_DURATION_SECONDS = 60
DEFAULT_CONCURRENCY = 5
DEFAULT_DURATION_SECONDS = 10


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (pct / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(sorted_values[int(k)], 2)
    d0 = sorted_values[int(f)] * (c - k)
    d1 = sorted_values[int(c)] * (k - f)
    return round(d0 + d1, 2)


class PerformanceTestRun:
    def __init__(
        self,
        test_id: str,
        request_config: dict[str, Any],
        concurrency: int = DEFAULT_CONCURRENCY,
        duration_seconds: int = DEFAULT_DURATION_SECONDS,
        total_requests_limit: int | None = None,
    ):
        self.test_id = test_id
        self.request_config = request_config
        self.concurrency = min(MAX_CONCURRENCY, max(1, concurrency))
        self.duration_seconds = min(MAX_DURATION_SECONDS, max(1, duration_seconds))
        self.total_requests_limit = total_requests_limit

        self.is_running = False
        self.is_completed = False
        self.start_time: float = 0.0
        self.end_time: float = 0.0

        self.total_sent = 0
        self.success_count = 0  # 2xx
        self.client_error_count = 0  # 4xx
        self.server_error_count = 0  # 5xx
        self.failed_count = 0  # timeouts, connection drops

        self.latencies: list[float] = []
        # Timeline: list of { second: int, rps: int, latency_mean: float, error_count: int }
        self._second_buckets: dict[int, list[float]] = {}
        self._second_errors: dict[int, int] = {}
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.is_running = True
        self.start_time = time.monotonic()
        self._thread = threading.Thread(target=self._execute_workers, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self.is_running = False

    def _execute_workers(self) -> None:
        url = self.request_config.get("url", "")
        method = (self.request_config.get("method") or "GET").upper()
        headers = self.request_config.get("headers") or {}
        params = self.request_config.get("params") or {}
        body = self.request_config.get("body")

        json_body = None
        data_body = None
        if isinstance(body, dict):
            if body.get("type") == "json":
                json_body = body.get("content")
            else:
                data_body = body.get("content")
        elif isinstance(body, str) and body.strip():
            data_body = body

        def worker_loop():
            # Dedicated client per virtual user with connection pooling
            with httpx.Client(timeout=10.0, follow_redirects=True) as client:
                while not self._stop_event.is_set():
                    elapsed = time.monotonic() - self.start_time
                    if elapsed >= self.duration_seconds:
                        break

                    with self._lock:
                        if self.total_requests_limit and self.total_sent >= self.total_requests_limit:
                            break
                        self.total_sent += 1

                    req_start = time.monotonic()
                    status_code = 0
                    is_success = False
                    is_client_err = False
                    is_server_err = False
                    is_fail = False

                    try:
                        resp = client.request(
                            method=method,
                            url=url,
                            headers=headers,
                            params=params,
                            json=json_body,
                            data=data_body,
                        )
                        status_code = resp.status_code
                        if 200 <= status_code < 300:
                            is_success = True
                        elif 400 <= status_code < 500:
                            is_client_err = True
                        elif status_code >= 500:
                            is_server_err = True
                    except Exception:
                        is_fail = True

                    latency_ms = (time.monotonic() - req_start) * 1000
                    current_second = int(time.monotonic() - self.start_time)

                    with self._lock:
                        self.latencies.append(latency_ms)
                        if is_success:
                            self.success_count += 1
                        elif is_client_err:
                            self.client_error_count += 1
                        elif is_server_err:
                            self.server_error_count += 1
                        elif is_fail:
                            self.failed_count += 1

                        if current_second not in self._second_buckets:
                            self._second_buckets[current_second] = []
                            self._second_errors[current_second] = 0
                        self._second_buckets[current_second].append(latency_ms)
                        if not is_success:
                            self._second_errors[current_second] += 1

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.concurrency) as executor:
                futures = [executor.submit(worker_loop) for _ in range(self.concurrency)]
                concurrent.futures.wait(futures)
        except Exception as exc:
            logger.error("Performance test worker failure", test_id=self.test_id, error=str(exc))
        finally:
            self.end_time = time.monotonic()
            self.is_running = False
            self.is_completed = True

    def get_metrics(self) -> dict[str, Any]:
        with self._lock:
            elapsed = (time.monotonic() - self.start_time) if self.is_running else (self.end_time - self.start_time)
            elapsed = max(0.001, elapsed)

            sorted_lat = sorted(self.latencies)
            total = len(sorted_lat)

            rps = round(total / elapsed, 2)
            total_errors = self.client_error_count + self.server_error_count + self.failed_count
            error_rate = round((total_errors / total * 100.0), 2) if total > 0 else 0.0

            mean_lat = round(sum(sorted_lat) / total, 2) if total > 0 else 0.0
            min_lat = round(sorted_lat[0], 2) if total > 0 else 0.0
            max_lat = round(sorted_lat[-1], 2) if total > 0 else 0.0

            p50 = _percentile(sorted_lat, 50)
            p90 = _percentile(sorted_lat, 90)
            p95 = _percentile(sorted_lat, 95)
            p99 = _percentile(sorted_lat, 99)

            # Build timeline
            timeline = []
            for sec in sorted(self._second_buckets.keys()):
                sec_lats = self._second_buckets[sec]
                sec_rps = len(sec_lats)
                sec_mean = round(sum(sec_lats) / sec_rps, 2) if sec_rps > 0 else 0.0
                timeline.append({
                    "second": sec,
                    "rps": sec_rps,
                    "mean_latency_ms": sec_mean,
                    "errors": self._second_errors.get(sec, 0),
                })

            progress = min(1.0, elapsed / self.duration_seconds) if not self.is_completed else 1.0

            return {
                "test_id": self.test_id,
                "is_running": self.is_running,
                "is_completed": self.is_completed,
                "progress": progress,
                "elapsed_seconds": round(elapsed, 2),
                "total_requests": total,
                "concurrency": self.concurrency,
                "throughput_rps": rps,
                "error_rate_pct": error_rate,
                "status_breakdown": {
                    "2xx": self.success_count,
                    "4xx": self.client_error_count,
                    "5xx": self.server_error_count,
                    "failed": self.failed_count,
                },
                "latency_ms": {
                    "min": min_lat,
                    "max": max_lat,
                    "mean": mean_lat,
                    "p50": p50,
                    "p90": p90,
                    "p95": p95,
                    "p99": p99,
                },
                "timeline": timeline,
            }


class PerformanceEngine:
    """Manages active performance & load testing runs."""

    def __init__(self) -> None:
        self._runs: dict[str, PerformanceTestRun] = {}
        self._lock = threading.Lock()

    def start_test(
        self,
        request_config: dict[str, Any],
        concurrency: int = DEFAULT_CONCURRENCY,
        duration_seconds: int = DEFAULT_DURATION_SECONDS,
        total_requests: int | None = None,
    ) -> dict[str, Any]:
        url = (request_config.get("url") or "").strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ValidationError("Target URL must begin with http:// or https://")

        test_id = f"perf-{uuid.uuid4()}"
        run = PerformanceTestRun(
            test_id=test_id,
            request_config=request_config,
            concurrency=concurrency,
            duration_seconds=duration_seconds,
            total_requests_limit=total_requests,
        )

        with self._lock:
            self._runs[test_id] = run

        run.start()
        return {
            "status": "ok",
            "test_id": test_id,
            "concurrency": run.concurrency,
            "duration_seconds": run.duration_seconds,
        }

    def get_status(self, test_id: str) -> dict[str, Any]:
        with self._lock:
            run = self._runs.get(test_id)
        if not run:
            return {"status": "failed", "error": f"Test run {test_id!r} not found"}

        return {"status": "ok", "metrics": run.get_metrics()}

    def stop_test(self, test_id: str) -> dict[str, Any]:
        with self._lock:
            run = self._runs.get(test_id)
        if run:
            run.stop()
        return {"status": "ok"}
