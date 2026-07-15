"""Small best-effort per-process limiter for the public analysis endpoint."""

import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, limit=30, window_seconds=60):
        self.limit = limit
        self.window_seconds = window_seconds
        self.requests = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key):
        now = time.monotonic()
        cutoff = now - self.window_seconds
        safe_key = str(key or "unknown")[:80]
        with self.lock:
            entries = self.requests[safe_key]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if len(entries) >= self.limit:
                retry_after = max(1, round(self.window_seconds - (now - entries[0])))
                return False, retry_after
            entries.append(now)
            if len(self.requests) > 10_000:
                self.requests = defaultdict(deque, {safe_key: entries})
            return True, 0
