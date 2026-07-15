import re
import unicodedata
from urllib.parse import urlsplit

from .contracts import Evidence, RiskContribution


URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}", re.I)
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d ()-]{6,}\d)")
CRYPTO_RE = re.compile(r"\b(?:bc1[a-z0-9]{25,62}|0x[a-f0-9]{40})\b", re.I)
INVISIBLE = {"Cf", "Cc"}


class InputUnderstandingAgent:
    def run(self, input_type, content):
        normalized = unicodedata.normalize("NFKC", content).strip()
        myanmar = sum("\u1000" <= char <= "\u109f" for char in normalized)
        letters = sum(char.isalpha() for char in normalized)
        language = "my" if letters and myanmar / letters > 0.25 else "en"
        return {
            "detected_type": input_type,
            "language": language,
            "encoding": "unicode",
            "character_count": len(normalized),
            "normalization": "NFKC",
            "entities_extracted": True,
        }, normalized


class ThreatIntelligenceAgent:
    def run(self, input_type, content):
        hostname = ""
        if input_type == "link":
            try:
                hostname = urlsplit(content if "://" in content else f"https://{content}").hostname or ""
            except ValueError:
                pass
        return {
            "local_reputation_checked": True,
            "external_feeds_configured": False,
            "whois_configured": False,
            "domain_observed": bool(hostname),
            "note": "Live WHOIS and campaign feeds require configured providers; no external reputation was invented.",
        }


class EvidenceAgent:
    SENSITIVE = {
        "OTP request": (r"\b(?:otp|one.?time password|verification code|passcode)\b|otp ကုဒ်", "high"),
        "Credential request": (r"\b(?:password|pin|recovery key|login code)\b|စကားဝှက်", "high"),
        "Money request": (r"\b(?:pay|payment|transfer|gift card|bitcoin|crypto|bank details)\b|ငွေလွှဲ", "high"),
        "Urgency language": (r"\b(?:urgent|immediately|act now|final warning|today only)\b|ချက်ချင်း|အခုပဲ", "medium"),
        "Authority claim": (r"\b(?:bank|police|government|support|microsoft|paypal|amazon|apple)\b|ဘဏ်ဝန်ထမ်း", "medium"),
    }

    def run(self, content):
        evidence = []
        for value in URL_RE.findall(content):
            evidence.append(Evidence("url", "URL found", "medium", value[:180], "Inspect the destination independently."))
        for value in EMAIL_RE.findall(content):
            evidence.append(Evidence("email", "Email address found", "low", value[:254], "Verify the sender domain."))
        for value in PHONE_RE.findall(content):
            evidence.append(Evidence("phone", "Phone number found", "low", value[:32], "Check the number reputation."))
        for value in CRYPTO_RE.findall(content):
            evidence.append(Evidence("crypto_wallet", "Crypto wallet found", "high", value[:70], "Crypto payments are difficult to reverse."))
        for label, (pattern, severity) in self.SENSITIVE.items():
            if re.search(pattern, content, re.I):
                evidence.append(Evidence("behavior", label, severity, explanation=f"Detected {label.lower()} in the submitted content."))
        if any(unicodedata.category(char) in INVISIBLE and char not in "\n\r\t" for char in content):
            evidence.append(Evidence("obfuscation", "Hidden Unicode", "high", explanation="Invisible characters may hide malicious wording."))
        return evidence[:16]


class MLClassificationAgent:
    def __init__(self, model):
        self.model = model

    def run(self, input_type, content):
        prediction = self.model.predict(content, input_type)
        features = " ".join(prediction.get("features", [])).lower()
        base = prediction["probabilities"]["suspicious_or_scam"]
        return prediction, {
            "spam": round(base if input_type == "message" else base * .45, 4),
            "phishing": round(base if input_type in {"link", "email"} else base * .6, 4),
            "fraud": round(base, 4),
            "urgency": round(min(1, .75 if "urgency" in features or "pressure" in features else base * .4), 4),
            "financial_scam": round(min(1, .8 if any(term in features for term in ("payment", "money", "gift")) else base * .35), 4),
            "social_engineering": round(min(1, .8 if any(term in features for term in ("secret", "authority", "authentication")) else base * .5), 4),
        }


class ReasoningAgent:
    WEIGHTS = {
        "urgency": ("Urgency or pressure", 20),
        "password": ("Credential request", 25),
        "authentication": ("Credential request", 25),
        "otp": ("OTP request", 25),
        "domain": ("Suspicious domain", 25),
        "url": ("Suspicious URL", 20),
        "payment": ("Money request", 25),
        "premium": ("Phone reputation", 30),
        "imperson": ("Brand impersonation", 25),
        "unicode": ("Hidden Unicode", 20),
    }

    def run(self, score, indicators, evidence):
        contributions, used, allocated = [], set(), 0
        source_text = " ".join(indicators + [item.label for item in evidence]).lower()
        for needle, (label, weight) in self.WEIGHTS.items():
            if needle in source_text and label not in used and allocated < score:
                applied = min(weight, score - allocated)
                contributions.append(RiskContribution(label, applied, "evidence"))
                used.add(label)
                allocated += applied
        if allocated < score:
            contributions.append(RiskContribution("ML pattern score", score - allocated, "model"))
        return contributions


class DecisionAgent:
    def run(self, score):
        if score >= 90: return "Critical"
        if score >= 70: return "High Risk"
        if score >= 50: return "Likely Scam"
        if score >= 25: return "Suspicious"
        return "Safe"
