import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from .security_analyzer import SecurityAnalyzer
    from .rate_limit import SlidingWindowLimiter
    from .agent_runtime import AgentRuntime
    from .investigation import InvestigationCoordinator
except ImportError:  # Allows direct script execution as well as package execution.
    from security_analyzer import SecurityAnalyzer
    from rate_limit import SlidingWindowLimiter
    from agent_runtime import AgentRuntime
    from investigation import InvestigationCoordinator


HOST = os.getenv("NLP_HOST", "127.0.0.1")
PORT = int(os.getenv("NLP_PORT", "5050"))
MAX_MESSAGE_LENGTH = 10_000
ANALYZER = SecurityAnalyzer()
COORDINATOR = InvestigationCoordinator(ANALYZER)
AGENT_RUNTIME = AgentRuntime(COORDINATOR)
RATE_LIMITER = SlidingWindowLimiter(limit=int(os.getenv("NLP_RATE_LIMIT", "30")))


class SpamAPIHandler(BaseHTTPRequestHandler):
    server_version = "SafeMindNLP/1.0"

    def _send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        allowed_origin = os.getenv("NLP_CORS_ORIGIN", "").rstrip("/")
        request_origin = self.headers.get("Origin", "").rstrip("/")
        if allowed_origin and request_origin == allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, str(value))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_GET(self):
        if self.path == "/":
            self._send_json(200, {
                "service": "SafeMind AI Security Agent API",
                "status": "ok",
                "frontend": "http://127.0.0.1:5173",
                "health": "/health",
            })
            return
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "model": "safemind-hybrid-security-v3", "scan_types": ["message", "link", "email", "phone"]})
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/api/spam-check":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            client_ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",", 1)[0].strip()
            allowed, retry_after = RATE_LIMITER.check(client_ip)
            if not allowed:
                self._send_json(429, {"error": "Too many scans. Please wait before trying again."}, {"Retry-After": retry_after})
                return
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type != "application/json":
                self._send_json(415, {"error": "Content-Type must be application/json."})
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_MESSAGE_LENGTH * 4:
                raise ValueError("Request body is empty or too large.")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("The request body must be a JSON object.")
            scan_type = payload.get("scan_type", "message" if "message" in payload else None)
            content = payload.get("content", payload.get("message"))
            result = AGENT_RUNTIME.run(scan_type, content)
            result.pop("agent_run", None)
            self._send_json(200, result)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
        except Exception:
            self._send_json(500, {"error": "Unable to analyze this message."})

    def log_message(self, message_format, *args):
        print(f"{self.address_string()} - {message_format % args}")


def run():
    server = ThreadingHTTPServer((HOST, PORT), SpamAPIHandler)
    print(f"SafeMind NLP API running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
