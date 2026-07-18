"""Unified, explainable security analysis for SafeMind scan types."""

import ipaddress
import re
import unicodedata
from urllib.parse import urlsplit

try:
    from .model import SpamClassifier
except ImportError:  # Allows direct local execution from the project root.
    from model import SpamClassifier


SUPPORTED_SCAN_TYPES = {"message", "link", "email", "phone"}
SHORTENER_DOMAINS = {"bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy", "ow.ly"}
RISKY_TLDS = {"click", "country", "download", "gq", "loan", "men", "mom", "party", "rest", "review", "stream", "top", "work", "zip"}
URL_BAIT_TERMS = {"account", "auth", "bank", "confirm", "login", "password", "payment", "reset", "secure", "signin", "update", "verify", "wallet"}
BRAND_TERMS = {"amazon", "apple", "facebook", "google", "instagram", "microsoft", "netflix", "paypal", "telegram", "whatsapp"}
FREE_MAIL_DOMAINS = {"gmail.com", "hotmail.com", "icloud.com", "outlook.com", "proton.me", "yahoo.com"}
EMAIL_PATTERN = re.compile(r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Z0-9-]+\.)+[A-Z]{2,63}$", re.IGNORECASE)
EMAIL_SEARCH_PATTERN = re.compile(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,63}", re.IGNORECASE)


def _agent_guidance(scan_type, risk, category):
    subject = {"message": "message", "link": "link", "email": "sender", "phone": "number"}.get(scan_type, "item")
    if risk == "HIGH":
        return {
            "headline": "High-risk behavior detected",
            "summary": f"I found strong warning signals in this {subject}. Treat it as unsafe unless the organization verifies it through an official channel.",
            "actions": [
                "Do not click, reply, pay, call back, or share any code.",
                "Block the sender and preserve the content as evidence.",
                "Contact the organization through its official app, website, or published phone number.",
            ],
        }
    if risk == "MEDIUM":
        return {
            "headline": "Suspicious signals need verification",
            "summary": f"I found warning signals in this {subject}, but the evidence is not conclusive. Pause and verify it independently before acting.",
            "actions": [
                "Do not use contact details or links contained in the suspicious content.",
                "Verify the request through an official channel.",
                "Never share passwords, OTP codes, recovery keys, or payment details.",
            ],
        }
    return {
        "headline": "No strong threat signal found",
        "summary": f"I did not find strong automated warning signals in this {subject}. This is not a guarantee of safety, especially for unexpected requests.",
        "actions": [
            "Confirm the sender and context independently if the request was unexpected.",
            "Open official apps or websites directly instead of following supplied links.",
            "Keep credentials, verification codes, and payment details private.",
        ],
    }


def _result(scan_type, score, category, reason, indicators, model):
    score = max(0, min(99, round(score)))
    if score >= 70:
        risk, verdict = "HIGH", "scam"
        confidence = min(99, 72 + round((score - 70) * 0.9))
    elif score >= 35:
        risk, verdict = "MEDIUM", "suspicious"
        confidence = min(92, 60 + round((score - 35) * 0.9))
    else:
        risk, verdict = "LOW", "unknown"
        confidence = min(88, 58 + round((35 - score) * 0.7))

    guidance = _agent_guidance(scan_type, risk, category)
    return {
        "scan_type": scan_type,
        "verdict": verdict,
        "risk": risk,
        "risk_score": score,
        "confidence": confidence,
        "category": category,
        "reason": reason,
        "indicators": list(dict.fromkeys(indicators))[:6],
        "model": model,
        "agent_headline": guidance["headline"],
        "agent_summary": guidance["summary"],
        "recommended_actions": guidance["actions"],
        "requires_human_review": risk != "LOW",
    }


class SecurityAnalyzer:
    """Hybrid analyzer combining NLP classification and deterministic threat features."""

    def __init__(self, message_classifier=None):
        self.message_classifier = message_classifier or SpamClassifier()

    def analyze(self, scan_type, content):
        if scan_type not in SUPPORTED_SCAN_TYPES:
            raise ValueError("Scan type must be message, link, email, or phone.")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Content must not be empty.")

        value = content.strip()
        limits = {"message": 10_000, "link": 2_048, "email": 10_000, "phone": 32}
        if len(value) > limits[scan_type]:
            raise ValueError(f"{scan_type.title()} must be {limits[scan_type]} characters or fewer.")

        primary = getattr(self, f"_analyze_{scan_type}")(value)
        if scan_type == "message":
            return primary
        if not self._contains_prose(scan_type, value):
            primary["pipeline"] = ["type-specific analysis", "shared spam-language analysis skipped because no prose was present"]
            return primary
        try:
            language = self._analyze_message(value)
        except ValueError:
            return primary
        return self._combine_with_spam_language(scan_type, primary, language)

    @staticmethod
    def _contains_prose(scan_type, value):
        if scan_type == "email":
            if re.search(r"(?:^|\n)(?:subject|from|to):", value, re.IGNORECASE):
                return True
            remainder = EMAIL_SEARCH_PATTERN.sub("", value).strip()
            return len(remainder) >= 12
        remainder = re.sub(r"https?://\S+|\+?[\d\s().-]{7,22}", "", value, flags=re.IGNORECASE).strip()
        return bool(re.search(r"\s", value)) and len(remainder) >= 12

    @staticmethod
    def _combine_with_spam_language(scan_type, primary, language):
        primary_score = int(primary.get("risk_score", 0) or 0)
        language_score = int(language.get("risk_score", 0) or 0)
        language_dominates = language_score > primary_score
        combined = _result(
            scan_type,
            max(primary_score, language_score),
            language["category"] if language_dominates else primary["category"],
            language["reason"] if language_dominates else primary["reason"],
            [*primary.get("indicators", []), *language.get("indicators", [])],
            f"{primary['model']}+safemind-intent-nlp-v3",
        )
        is_spam = combined["risk"] in {"HIGH", "MEDIUM"}
        combined.update({
            "is_spam": is_spam,
            "label": "spam" if is_spam else "not_spam",
            "spam_probability": max(float(primary.get("spam_probability", 0) or 0), float(language.get("spam_probability", 0) or 0)),
            "pipeline": ["type-specific analysis", "shared spam-language analysis"],
        })
        return combined

    def _analyze_message(self, value):
        prediction = self.message_classifier.predict(value)
        result = _result(
            "message",
            prediction["spam_probability"] * 100,
            prediction["category"],
            prediction["reason"],
            prediction["indicators"],
            "safemind-intent-nlp-v3",
        )
        result.update({
            "is_spam": prediction["is_spam"],
            "spam_probability": prediction["spam_probability"],
            "label": prediction["label"],
        })
        return result

    def _analyze_link(self, value):
        candidate = value if "://" in value else f"https://{value}"
        try:
            parsed = urlsplit(candidate)
            hostname = (parsed.hostname or "").lower().rstrip(".")
            if parsed.scheme not in {"http", "https"} or not hostname:
                raise ValueError
        except (ValueError, UnicodeError):
            return _result("link", 96, "Invalid or dangerous URL", "The value is not a valid HTTP or HTTPS address.", ["Invalid URL format"], "url-threat-features-v2")

        score, indicators = 5, []
        if parsed.scheme != "https":
            score += 20
            indicators.append("Connection does not use HTTPS")
        try:
            ipaddress.ip_address(hostname.strip("[]"))
            score += 35
            indicators.append("Uses an IP address instead of a domain")
        except ValueError:
            pass
        if "xn--" in hostname:
            score += 30
            indicators.append("Internationalized domain may imitate another name")
        if any(ord(character) > 127 for character in hostname):
            scripts = {unicodedata.name(character, "").split(" ", 1)[0] for character in hostname if character.isalpha()}
            score += 28 if len(scripts) > 1 else 16
            indicators.append("Unicode domain requires careful visual verification")
        if hostname in SHORTENER_DOMAINS or any(hostname.endswith(f".{item}") for item in SHORTENER_DOMAINS):
            score += 30
            indicators.append("Shortened URL hides its final destination")
        if parsed.username or parsed.password or "@" in value.split("?", 1)[0]:
            score += 30
            indicators.append("URL contains misleading user-information syntax")
        labels = hostname.split(".")
        if len(labels) > 4:
            score += 14
            indicators.append("Unusually deep subdomain structure")
        if hostname.count("-") >= 3:
            score += 14
            indicators.append("Domain contains many hyphens")
        if labels[-1] in RISKY_TLDS:
            score += 18
            indicators.append(f"Frequently abused .{labels[-1]} domain ending")
        inspected = f"{hostname}{parsed.path}".lower()
        bait = sorted(term for term in URL_BAIT_TERMS if term in inspected)
        if bait:
            score += min(32, len(bait) * 9)
            indicators.append("Credential or payment bait: " + ", ".join(bait[:4]))
        if len(value) > 180:
            score += 12
            indicators.append("Unusually long URL")
        if value.count("%") >= 4:
            score += 14
            indicators.append("Heavy URL encoding may hide the destination path")

        category = "Potential phishing link" if score >= 35 else "No obvious URL threats"
        reason = "Structural phishing indicators were detected in this URL." if indicators else "No common structural phishing indicators were detected; verify the sender before opening it."
        return _result("link", score, category, reason, indicators or ["No known structural warning signs"], "url-threat-features-v2")

    def _analyze_email(self, value):
        from_match = re.search(r"^from:\s*.*?(" + EMAIL_SEARCH_PATTERN.pattern + r")", value, re.IGNORECASE | re.MULTILINE)
        address_match = from_match or EMAIL_SEARCH_PATTERN.search(value)
        lowered = address_match.group(1 if from_match else 0).lower() if address_match else ""
        if not EMAIL_PATTERN.fullmatch(lowered):
            return _result("email", 92, "Invalid or deceptive email address", "The sender address is malformed or cannot be reliably verified.", ["Invalid email format"], "email-threat-features-v2")

        local, domain = lowered.rsplit("@", 1)
        labels = domain.split(".")
        score, indicators = 6, []
        if "xn--" in domain:
            score += 30
            indicators.append("Punycode domain may imitate a trusted brand")
        if labels[-1] in RISKY_TLDS:
            score += 22
            indicators.append(f"Frequently abused .{labels[-1]} domain ending")
        brands = sorted(term for term in BRAND_TERMS if term in local or term in domain)
        if brands and domain in FREE_MAIL_DOMAINS:
            score += 38
            indicators.append("Brand name is sent from a free mailbox provider")
        if brands and sum(term in domain for term in brands) and domain.count("-") >= 1:
            score += 22
            indicators.append("Brand-like domain uses impersonation-style separators")
        if domain.count("-") >= 3:
            score += 15
            indicators.append("Domain contains many hyphens")
        if len(local) > 64 or ".." in local:
            score += 20
            indicators.append("Unusual mailbox structure")
        if any(term in local for term in {"security", "support", "verify", "billing", "admin"}) and labels[-1] in RISKY_TLDS:
            score += 20
            indicators.append("Authority-style mailbox on a high-risk domain")

        category = "Potential sender impersonation" if score >= 35 else "No obvious sender threats"
        reason = "The sender address contains impersonation or domain-risk indicators." if indicators else "The address format has no obvious impersonation indicators; confirm the domain independently."
        return _result("email", score, category, reason, indicators or ["Valid email structure"], "email-threat-features-v2")

    def _analyze_phone(self, value):
        normalized = re.sub(r"[^\d+]", "", value)
        digits = re.sub(r"\D", "", normalized)
        if not (7 <= len(digits) <= 15) or normalized.count("+") > 1 or ("+" in normalized and not normalized.startswith("+")):
            return _result("phone", 86, "Invalid phone number", "The number does not match a valid international phone-number structure.", ["Invalid phone number format"], "phone-risk-features-v2")

        score, indicators = 8, []
        if not value.strip().startswith("+"):
            score += 8
            indicators.append("Country code is missing")
        if digits.startswith("1900") or digits.startswith("900"):
            score += 48
            indicators.append("Premium-rate prefix")
        if re.search(r"(\d)\1{5,}", digits):
            score += 28
            indicators.append("Long repeated-digit sequence")
        if any(sequence in digits for sequence in ("012345", "123456", "234567", "987654", "876543")):
            score += 22
            indicators.append("Artificial sequential-digit pattern")
        if len(set(digits)) <= 3:
            score += 20
            indicators.append("Unusually low digit variety")

        category = "Suspicious phone pattern" if score >= 35 else "Unknown phone number"
        reason = "The number contains patterns often associated with suspicious or premium-rate calls." if indicators and score >= 35 else "No strong number-pattern warning was found; an unknown caller still requires verification."
        return _result("phone", score, category, reason, indicators or ["Valid phone-number structure"], "phone-risk-features-v2")
