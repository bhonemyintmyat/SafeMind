"""Privacy-safe agent routing, caching, and runtime telemetry."""

import hashlib
import json
import threading
import time
import uuid
from copy import deepcopy
from collections import OrderedDict
from datetime import datetime, timezone


TOOL_ROUTES = {
    "message": ["intent_nlp", "social_engineering_rules"],
    "link": ["url_parser", "phishing_rules"],
    "email": ["email_parser", "impersonation_rules"],
    "phone": ["phone_normalizer", "number_risk_rules"],
}


class AgentRuntime:
    def __init__(self, analyzer, cache_size=256, cache_ttl_seconds=300):
        self.analyzer = analyzer
        self.cache_size = cache_size
        self.cache_ttl_seconds = cache_ttl_seconds
        self.cache = OrderedDict()
        self.lock = threading.Lock()

    @staticmethod
    def _key(scan_type, content):
        return hashlib.sha256(f"{scan_type}\0{content.strip()}".encode("utf-8")).hexdigest()

    def _cached(self, key):
        now = time.monotonic()
        with self.lock:
            item = self.cache.get(key)
            if not item or now - item[0] > self.cache_ttl_seconds:
                self.cache.pop(key, None)
                return None
            self.cache.move_to_end(key)
            return deepcopy(item[1])

    def _store(self, key, result):
        with self.lock:
            self.cache[key] = (time.monotonic(), deepcopy(result))
            self.cache.move_to_end(key)
            while len(self.cache) > self.cache_size:
                self.cache.popitem(last=False)

    def run(self, scan_type, content):
        started = time.perf_counter()
        key = self._key(scan_type, content)
        result = self._cached(key)
        cache_hit = result is not None
        selected_tools = list(TOOL_ROUTES.get(scan_type, []))
        if result is None:
            result = self.analyzer.analyze(scan_type, content)
            self._store(key, result)
        elif result.get("investigation"):
            case_uuid = uuid.uuid4()
            result["investigation"]["case_id"] = str(case_uuid)
            result["investigation"]["case_number"] = f"CASE-{datetime.now(timezone.utc):%Y%m%d}-{str(case_uuid)[:8].upper()}"

        latency_ms = max(0.01, (time.perf_counter() - started) * 1000)
        output_bytes = len(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        output_tokens = max(1, round(output_bytes / 4))
        result["agent_run"] = {
            "run_id": str(uuid.uuid4()),
            "intent": f"analyze_{scan_type}",
            "intent_confidence": 1.0,
            "parameters": {
                "scan_type": scan_type,
                "content_length": len(content.strip()),
                "content_stored": False,
            },
            "selected_tools": selected_tools,
            "tool_selection_correct": bool(selected_tools),
            "task_succeeded": True,
            "turns_to_completion": 1,
            "estimated_cost_usd": 0.0,
            "cache_hit": cache_hit,
            "latency_ms": round(latency_ms, 3),
            "ttft_ms": round(latency_ms, 3),
            "ttft_mode": "non_streaming_response",
            "output_tokens_estimated": output_tokens,
            "tokens_per_second_estimated": round(output_tokens / (latency_ms / 1000), 2),
            "compute_device": "cpu",
            "throughput_per_gpu": None,
            "batch_size": 1,
            "batch_efficiency": 1.0,
        }
        return result
