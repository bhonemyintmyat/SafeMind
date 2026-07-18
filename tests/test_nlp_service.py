import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

from nlp_service.app import SpamAPIHandler
from nlp_service.model import SpamClassifier
from nlp_service.security_analyzer import SecurityAnalyzer
from nlp_service.rate_limit import SlidingWindowLimiter
from nlp_service.agent_runtime import AgentRuntime
from nlp_service.investigation import InvestigationCoordinator


class SpamClassifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classifier = SpamClassifier()

    def test_detects_spam(self):
        result = self.classifier.predict("URGENT click here to verify your password now")
        self.assertTrue(result["is_spam"])
        self.assertIn(result["risk"], {"MEDIUM", "HIGH"})
        self.assertIn("NLTK NaiveBayesClassifier", result["nlp_stack"])
        self.assertIn("spaCy multilingual tokenizer", result["nlp_stack"])

    def test_detects_normal_message(self):
        result = self.classifier.predict("Can we have lunch tomorrow at noon?")
        self.assertFalse(result["is_spam"])
        self.assertEqual(result["risk"], "LOW")

    def test_rejects_empty_message(self):
        with self.assertRaises(ValueError):
            self.classifier.predict("  ")

    def test_normalizes_invisible_obfuscation(self):
        result = self.classifier.predict("URGENT: send your pass\u200bword immediately")
        self.assertTrue(result["is_spam"])
        self.assertIn("Requests an authentication secret", result["indicators"])

    def test_contextual_otp_request_is_flagged(self):
        result = self.classifier.predict("Please send your OTP immediately to the support agent")
        self.assertTrue(result["is_spam"])

    def test_detects_authority_and_secrecy_combination(self):
        result = self.classifier.predict("Police support needs you to pay today. Keep this confidential.")
        self.assertTrue(result["is_spam"])
        self.assertIn("Requests secrecy", result["indicators"])

    def test_detects_burmese_otp_scam(self):
        result = self.classifier.predict("ဘဏ်ဝန်ထမ်းပါ OTP ကုဒ်ကို ချက်ချင်း ပို့ပေးပါ")
        self.assertTrue(result["is_spam"])

    def test_detects_burmese_prize_registration_top_up_link_scam(self):
        result = self.classifier.predict("🎉ကမ္ဘာ့ဖလားချန်ပီယံအသင်းအကြောင်း အတွင်းလူအချက်အလက်များရယူရန် မှတ်ပုံတင်ရန်နှင့် ငွေဖြည့်ရန် လင့်ခ်ကို နှိပ်ပါ။ 🎁🔗 dljie.vip/kifh")
        self.assertTrue(result["is_spam"])
        self.assertEqual(result["risk"], "HIGH")
        self.assertGreaterEqual(result["spam_probability"], 0.70)

    def test_detects_crypto_recovery_secret_theft(self):
        result = self.classifier.predict("Security alert: share your seed phrase to restore your crypto wallet now")
        self.assertTrue(result["is_spam"])
        self.assertEqual(result["category"], "Crypto wallet theft")

    def test_detects_fake_job_fee_scam(self):
        result = self.classifier.predict("You are hired for this work from home job. Pay the training fee in crypto today")
        self.assertTrue(result["is_spam"])
        self.assertEqual(result["category"], "Job scam")

    def test_detects_romance_emergency_payment_scam(self):
        result = self.classifier.predict("Hello sweetheart, our relationship is real. I need you to transfer money for an emergency")
        self.assertTrue(result["is_spam"])
        self.assertEqual(result["category"], "Romance scam")

    def test_detects_tech_support_remote_access_scam(self):
        result = self.classifier.predict("Microsoft support technician says install AnyDesk for remote access now")
        self.assertTrue(result["is_spam"])
        self.assertEqual(result["category"], "Tech-support scam")

    def test_benign_official_app_message_stays_low_risk(self):
        result = self.classifier.predict("Your monthly statement is ready in the official app")
        self.assertFalse(result["is_spam"])
        self.assertEqual(result["risk"], "LOW")


class RateLimiterTests(unittest.TestCase):
    def test_blocks_requests_over_window_limit(self):
        limiter = SlidingWindowLimiter(limit=2, window_seconds=60)
        self.assertTrue(limiter.check("client")[0])
        self.assertTrue(limiter.check("client")[0])
        allowed, retry_after = limiter.check("client")
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 1)


class AgentRuntimeTests(unittest.TestCase):
    def test_routes_tools_and_reports_cache_metrics(self):
        runtime = AgentRuntime(SecurityAnalyzer())
        first = runtime.run("message", "Send your OTP to support now")
        second = runtime.run("message", "Send your OTP to support now")
        self.assertEqual(first["agent_run"]["intent"], "analyze_message")
        self.assertIn("intent_nlp", first["agent_run"]["selected_tools"])
        self.assertFalse(first["agent_run"]["cache_hit"])
        self.assertTrue(second["agent_run"]["cache_hit"])
        self.assertEqual(second["agent_run"]["estimated_cost_usd"], 0.0)
        self.assertIsNone(second["agent_run"]["throughput_per_gpu"])


class InvestigationCoordinatorTests(unittest.TestCase):
    def test_builds_case_timeline_evidence_and_explainable_score(self):
        result = InvestigationCoordinator(SecurityAnalyzer()).analyze(
            "message",
            "URGENT: Microsoft support needs your OTP. Pay the fee at https://secure-login.example.top now."
        )
        case = result["investigation"]
        self.assertTrue(case["case_number"].startswith("CASE-"))
        self.assertEqual(len(case["timeline"]), 6)
        self.assertTrue(case["evidence"])
        self.assertEqual(sum(item["score"] for item in case["scoring"]), result["risk_score"])
        self.assertFalse(case["related_cases"]["available"])
        self.assertFalse(case["knowledge"]["available"])
        self.assertTrue(case["checks_performed"])
        self.assertTrue(case["limitations"])


class SecurityAnalyzerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = SecurityAnalyzer()

    def test_detects_phishing_link_features(self):
        result = self.analyzer.analyze("link", "http://secure-account-verify-login.example.top/reset")
        self.assertEqual(result["risk"], "HIGH")
        self.assertGreaterEqual(result["risk_score"], 70)
        self.assertTrue(result["indicators"])

    def test_clean_link_is_not_declared_verified_safe(self):
        result = self.analyzer.analyze("link", "https://example.org/about")
        self.assertEqual(result["risk"], "LOW")
        self.assertEqual(result["verdict"], "unknown")

    def test_detects_sender_impersonation(self):
        result = self.analyzer.analyze("email", "microsoft-security@gmail.com")
        self.assertIn(result["risk"], {"MEDIUM", "HIGH"})

    def test_full_email_uses_sender_and_spam_language_layers(self):
        result = self.analyzer.analyze(
            "email",
            "From: billing@example.org\nSubject: Urgent verification\n\nSend your OTP and password immediately.",
        )
        self.assertEqual(result["scan_type"], "email")
        self.assertTrue(result["is_spam"])
        self.assertIn(result["risk"], {"MEDIUM", "HIGH"})
        self.assertEqual(result["pipeline"], ["type-specific analysis", "shared spam-language analysis"])

    def test_clean_email_body_remains_not_spam(self):
        result = self.analyzer.analyze(
            "email",
            "From: team@example.org\nSubject: Lunch\n\nCan we have lunch tomorrow at noon?",
        )
        self.assertFalse(result["is_spam"])
        self.assertEqual(result["label"], "not_spam")

    def test_detects_premium_phone_pattern(self):
        result = self.analyzer.analyze("phone", "+1 900 555 0100")
        self.assertIn(result["risk"], {"MEDIUM", "HIGH"})

    def test_returns_agent_guidance(self):
        result = self.analyzer.analyze("link", "http://secure-account-verify-login.example.top/reset")
        self.assertTrue(result["agent_headline"])
        self.assertTrue(result["agent_summary"])
        self.assertGreaterEqual(len(result["recommended_actions"]), 3)
        self.assertTrue(result["requires_human_review"])

    def test_rejects_unsupported_scan_type(self):
        with self.assertRaises(ValueError):
            self.analyzer.analyze("file", "example")


class SpamAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), SpamAPIHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method, path, payload=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
        body = json.dumps(payload) if payload is not None else None
        headers = {"Content-Type": "application/json"} if body else {}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = json.loads(response.read().decode("utf-8") or "{}")
        connection.close()
        return response.status, data

    def test_health_endpoint(self):
        status, data = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")

    def test_spam_check_endpoint(self):
        status, data = self.request("POST", "/api/spam-check", {"message": "Claim a free prize now"})
        self.assertEqual(status, 200)
        self.assertTrue(data["is_spam"])

    def test_bad_request(self):
        status, data = self.request("POST", "/api/spam-check", {"message": ""})
        self.assertEqual(status, 400)
        self.assertIn("error", data)

    def test_unified_link_scan_endpoint(self):
        status, data = self.request("POST", "/api/spam-check", {
            "scan_type": "link",
            "content": "http://secure-login.example.top/verify-account",
        })
        self.assertEqual(status, 200)
        self.assertEqual(data["risk"], "HIGH")
        self.assertEqual(data["scan_type"], "link")


if __name__ == "__main__":
    unittest.main()
