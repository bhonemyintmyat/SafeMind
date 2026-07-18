import re
import unicodedata
import math
from collections import Counter, defaultdict

try:
    from nltk.classify import NaiveBayesClassifier
    from nltk.stem import PorterStemmer
except ImportError:  # Optional dependency for lightweight test and deploy environments.
    NaiveBayesClassifier = None

    class PorterStemmer:  # type: ignore[override]
        def stem(self, word):
            return word

try:
    import spacy
    from spacy.matcher import PhraseMatcher
except ImportError:  # Optional dependency for lightweight test and deploy environments.
    spacy = None
    PhraseMatcher = None


READABLE_TOKEN = re.compile(r"[a-z0-9]|[\u1000-\u109f]", re.IGNORECASE)
TOKEN_PATTERN = re.compile(r"\w+|[^\w\s]", re.UNICODE)


TRAINING_MESSAGES = [
    # Spam / scam examples
    ("Your account will close today. Verify your password now", "spam"),
    ("URGENT: click here to stop your bank account being suspended", "spam"),
    ("Congratulations you won a free prize, claim it now", "spam"),
    ("You have been selected for a cash reward. Send your bank details", "spam"),
    ("Final warning: confirm your payment information immediately", "spam"),
    ("Reset your password using this secure link or lose access", "spam"),
    ("Buy gift cards and send me the codes as soon as possible", "spam"),
    ("Limited time offer! Click to receive a free phone", "spam"),
    ("We detected unusual activity. Login now to verify your identity", "spam"),
    ("Your parcel is held. Pay the small delivery fee at this link", "spam"),
    ("You are our lucky winner. Reply with your credit card number", "spam"),
    ("Act now, your tax refund is waiting", "spam"),
    ("This is technical support. Give us your verification code", "spam"),
    ("Earn money fast from home with no experience", "spam"),
    ("Exclusive investment guaranteed to double your money", "spam"),
    ("Your subscription has expired, update payment now", "spam"),
    ("Call this number immediately to avoid arrest", "spam"),
    ("Dear customer your ATM card has been blocked verify now", "spam"),
    ("Transfer the money today and keep this confidential", "spam"),
    ("Click the shortened link to unlock your account", "spam"),
    ("အကောင့် ပိတ်ခံရမည် အခုပဲ အတည်ပြုပါ", "spam"),
    ("ဆုငွေ ရရှိပါပြီ ငွေလွှဲရန် ဘဏ်အကောင့် ပို့ပါ", "spam"),
    ("အရေးကြီးသည် လင့်ခ်ကို နှိပ်ပြီး စကားဝှက် ထည့်ပါ", "spam"),
    ("အခမဲ့ လက်ဆောင် ရယူရန် ယခုပဲ နှိပ်ပါ", "spam"),
    ("ဆုရရှိရန် မှတ်ပုံတင်ပြီး ငွေဖြည့်ရန် လင့်ခ်ကို နှိပ်ပါ", "spam"),
    ("အတွင်းလူအချက်အလက် ရယူရန် ငွေဖြည့်ပြီး ဝဘ်ဆိုက်လင့်ခ်ကို ဖွင့်ပါ", "spam"),
    ("I am from bank security. Send the OTP so I can protect your account", "spam"),
    ("Install this remote support app and share the access code", "spam"),
    ("Police warning: pay this confidential fee today to avoid arrest", "spam"),
    ("Your CEO needs gift cards urgently. Do not tell anyone", "spam"),
    ("ဘဏ်ဝန်ထမ်းပါ OTP ကုဒ်ကို ချက်ချင်း ပို့ပေးပါ", "spam"),
    ("အကောင့် လုံခြုံရေးအတွက် ငွေလွှဲပြီး လျှို့ဝှက်ထားပါ", "spam"),
    # Normal messages
    ("Can we meet for lunch tomorrow at noon", "ham"),
    ("I am on my way home, see you soon", "ham"),
    ("Please send me the notes from today's class", "ham"),
    ("Your appointment is confirmed for Monday at 10 AM", "ham"),
    ("Happy birthday! I hope you have a wonderful day", "ham"),
    ("The team meeting has moved to the second floor", "ham"),
    ("Thanks for your payment, your receipt is attached", "ham"),
    ("Could you pick up some milk on the way back", "ham"),
    ("Your order has shipped and will arrive on Friday", "ham"),
    ("Let me know when you are free for a call", "ham"),
    ("Here is the photo from our holiday", "ham"),
    ("The library closes at six this evening", "ham"),
    ("Remember to bring your ID to the appointment", "ham"),
    ("Dinner was lovely, thank you for inviting us", "ham"),
    ("The security update was installed successfully", "ham"),
    ("I transferred my share of the rent this morning", "ham"),
    ("Your monthly statement is ready in the official app", "ham"),
    ("Please review the project document before our meeting", "ham"),
    ("Your password was changed successfully in the official app", "ham"),
    ("Thanks for your card payment. View the receipt in the official app", "ham"),
    ("The IT team will never ask you to send your password or OTP", "ham"),
    ("မနက်ဖြန် နေ့လယ်စာ အတူစားကြမလား", "ham"),
    ("အိမ်ပြန်ရောက်ရင် ဖုန်းဆက်ပေးပါ", "ham"),
    ("အစည်းအဝေးကို တနင်္လာနေ့ ပြောင်းထားပါတယ်", "ham"),
    ("မွေးနေ့မှာ ပျော်ရွှင်ပါစေ", "ham"),
]


PHRASE_SIGNALS = {
    "verify now": 0.18,
    "click here": 0.18,
    "gift card": 0.22,
    "send your password": 0.28,
    "bank details": 0.22,
    "credit card number": 0.26,
    "verification code": 0.20,
    "act now": 0.14,
    "အခုပဲ": 0.14,
    "စကားဝှက်": 0.20,
    "လင့်ခ်ကို နှိပ်": 0.20,
    "လင့်ခ်ကို နှိပ်ပါ": 0.24,
    "မှတ်ပုံတင်": 0.14,
    "ငွေဖြည့်": 0.28,
    "လက်ဆောင်": 0.16,
    "အချက်အလက်များရယူရန်": 0.12,
    "one time password": 0.24,
    "confirm your identity": 0.18,
    "pay immediately": 0.20,
    "send the code": 0.22,
    "keep this confidential": 0.16,
    "guaranteed return": 0.20,
    "remote access": 0.18,
    "do not tell anyone": 0.18,
    "avoid arrest": 0.22,
    "install this app": 0.16,
    "share the access code": 0.24,
    "recovery phrase": 0.30,
    "seed phrase": 0.30,
    "private key": 0.30,
    "processing fee": 0.18,
    "training fee": 0.18,
    "work from home": 0.10,
    "investment opportunity": 0.16,
    "ဘဏ်ဝန်ထမ်း": 0.16,
    "otp ကုဒ်": 0.24,
    "ငွေလွှဲ": 0.18,
    "လျှို့ဝှက်ထား": 0.18,
}

CONTEXT_SIGNALS = (
    (re.compile(r"\b(?:send|share|tell|enter)\b.{0,35}\b(?:otp|pin|password|passcode|verification code)\b", re.I), 0.25, "Requests an authentication secret"),
    (re.compile(r"\b(?:pay|transfer|send)\b.{0,40}\b(?:money|crypto|bitcoin|gift card|fee|deposit)\b", re.I), 0.22, "Requests a difficult-to-reverse payment"),
    (re.compile(r"\b(?:urgent|immediately|final warning|act now|today only)\b", re.I), 0.12, "Uses urgency or pressure"),
    (re.compile(r"\b(?:guaranteed|double|risk.?free)\b.{0,30}\b(?:profit|return|investment|money)\b", re.I), 0.22, "Promises unrealistic financial returns"),
    (re.compile(r"https?://|\bwww\.", re.I), 0.06, "Contains a link requiring independent verification"),
    (re.compile(r"(?:^|\s)(?:[a-z0-9-]+\.)+(?:com|net|org|info|top|vip|work|click)(?:/[a-z0-9_/?=&%.-]*)?(?:\s|$)", re.I), 0.16, "Contains a bare website link requiring verification"),
    (re.compile(r"(?:ဆု|လက်ဆောင်|အတွင်းလူအချက်အလက်).{0,80}(?:မှတ်ပုံတင်|ငွေဖြည့်|လင့်ခ်|နှိပ်)"), 0.28, "Uses a reward lure to request registration or payment"),
    (re.compile(r"(?:မှတ်ပုံတင်|စာရင်းသွင်း).{0,60}(?:ငွေဖြည့်|ငွေသွင်း|ပေးချေ)"), 0.26, "Requests registration followed by a payment or top-up"),
    (re.compile(r"(?:လင့်ခ်|ဝဘ်ဆိုက်).{0,35}(?:နှိပ်|ဖွင့်)(?:ပါ)?"), 0.22, "Requests clicking an unverified link"),
    (re.compile(r"\b(?:bank|police|government|support|ceo|manager)\b.{0,45}\b(?:send|share|pay|install|transfer)\b", re.I), 0.20, "Claims authority while requesting action"),
    (re.compile(r"\b(?:secret|confidential|do not tell|keep this between us)\b", re.I), 0.16, "Requests secrecy"),
    (re.compile(r"\b(?:remote access|screen share|anydesk|teamviewer|access code)\b", re.I), 0.22, "Requests remote device access"),
    (re.compile(r"\b(?:won|winner|prize|lottery|reward)\b.{0,45}\b(?:fee|pay|claim|bank|card)\b", re.I), 0.22, "Uses a prize or reward lure"),
    (re.compile(r"\b(?:arrest|lawsuit|police|warrant|penalty)\b", re.I), 0.18, "Uses threats or intimidation"),
    (re.compile(r"\b(?:seed phrase|recovery phrase|private key|wallet key)\b", re.I), 0.30, "Requests a wallet recovery secret"),
    (re.compile(r"\b(?:job|hiring|recruiter|work from home|employment)\b.{0,70}\b(?:fee|deposit|crypto|gift card|equipment payment)\b", re.I), 0.24, "Requests payment for a job opportunity"),
    (re.compile(r"\b(?:love|relationship|fianc[eé]|dear|sweetheart)\b.{0,100}\b(?:money|loan|transfer|crypto|emergency)\b", re.I), 0.22, "Uses a relationship to request money"),
    (re.compile(r"\b(?:investment|trading|forex|crypto)\b.{0,70}\b(?:guaranteed|double|profit|return|risk.?free)\b", re.I), 0.24, "Promises unrealistic investment returns"),
    (re.compile(r"\b(?:support|technician|security team)\b.{0,70}\b(?:anydesk|teamviewer|screen share|remote access|install)\b", re.I), 0.24, "Impersonates support to request remote access"),
)

BENIGN_SIGNALS = {
    "official app": 0.14,
    "appointment is confirmed": 0.10,
    "meeting has moved": 0.08,
    "receipt is attached": 0.08,
    "monthly statement": 0.08,
    "will never ask": 0.16,
}


def normalize_text(text):
    """Normalize compatibility characters and remove invisible format controls."""
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(character for character in normalized if unicodedata.category(character) != "Cf")


class _SimpleToken:
    def __init__(self, text):
        self.text = text
        self.lower_ = text.lower()
        self.is_space = not text.strip()


class _SimpleDoc:
    def __init__(self, text):
        self.text = text
        self._tokens = [_SimpleToken(token) for token in TOKEN_PATTERN.findall(text)]

    def __iter__(self):
        return iter(self._tokens)


class _SimpleStrings:
    def __getitem__(self, key):
        return key


class _SimpleVocab:
    def __init__(self):
        self.strings = _SimpleStrings()


class _SimpleNLP:
    def __init__(self):
        self.vocab = _SimpleVocab()

    def make_doc(self, text):
        return _SimpleDoc(text)


class _SimplePhraseMatcher:
    def __init__(self, vocab, attr="LOWER"):
        self.vocab = vocab
        self._phrases = {}

    def add(self, name, docs):
        for doc in docs:
            phrase = getattr(doc, "text", str(doc)).strip().lower()
            if phrase:
                self._phrases[name] = phrase

    def __call__(self, doc):
        haystack = getattr(doc, "text", str(doc)).lower()
        matches = []
        for match_id, phrase in self._phrases.items():
            if phrase in haystack:
                matches.append((match_id, 0, 0))
        return matches


class _ProbabilityDistribution:
    def __init__(self, spam_probability):
        self._spam_probability = max(0.01, min(0.99, spam_probability))

    def prob(self, label):
        return self._spam_probability if label == "spam" else 1.0 - self._spam_probability


class _HeuristicClassifier:
    def __init__(self, vocabulary, token_counts, class_counts):
        self.vocabulary = vocabulary
        self.token_counts = token_counts
        self.class_counts = class_counts

    def prob_classify(self, features):
        score = math.log((self.class_counts["spam"] + 1) / (self.class_counts["ham"] + 1))

        for token in self.vocabulary:
            if features.get(f"contains({token})"):
                spam = self.token_counts["spam"][token] + 1
                ham = self.token_counts["ham"][token] + 1
                score += math.log(spam / ham)

        if features.get("has_url"):
            score += 0.45
        if features.get("has_exclamation"):
            score += 0.18
        if features.get("has_currency"):
            score += 0.28

        token_count = features.get("token_count")
        if token_count == "short":
            score += 0.12
        elif token_count == "long":
            score -= 0.08

        spam_probability = 1 / (1 + math.exp(-max(-8, min(8, score))))
        return _ProbabilityDistribution(spam_probability)


class SpamClassifier:
    """NLTK Naive Bayes classifier with spaCy tokenization and phrase matching."""

    def __init__(self, examples=None):
        self.examples = examples or TRAINING_MESSAGES
        self.nlp = spacy.blank("xx") if spacy else _SimpleNLP()
        self.stemmer = PorterStemmer()
        self.phrase_matcher = PhraseMatcher(self.nlp.vocab, attr="LOWER") if PhraseMatcher else _SimplePhraseMatcher(self.nlp.vocab, attr="LOWER")
        self.phrase_by_match_id = {}
        self.class_counts = Counter()
        self.token_counts = defaultdict(Counter)
        self.vocabulary = set()
        self.classifier = None
        self._train()

    def _normalize_token(self, token):
        lowered = token.lower_.strip()
        if lowered.isascii() and lowered.isalpha():
            return self.stemmer.stem(lowered)
        return lowered

    def _tokens(self, text):
        doc = self.nlp.make_doc(text)
        return [
            self._normalize_token(token)
            for token in doc
            if not token.is_space and READABLE_TOKEN.search(token.text)
        ]

    def _features(self, text, tokens=None):
        tokens = tokens if tokens is not None else self._tokens(text)
        token_set = set(tokens)
        features = {f"contains({token})": token in token_set for token in self.vocabulary}
        features.update({
            "has_url": bool(re.search(r"https?://|www\.", text, re.IGNORECASE)),
            "has_exclamation": "!" in text,
            "has_currency": bool(re.search(r"[$€£¥]|\b(?:usd|dollar|kyat)\b", text, re.IGNORECASE)),
            "token_count": "short" if len(tokens) < 6 else "medium" if len(tokens) < 16 else "long",
        })
        return features

    def _train(self):
        tokenized_examples = []
        for message, label in self.examples:
            tokens = self._tokens(message)
            tokenized_examples.append((message, label, tokens))
            self.class_counts[label] += 1
            self.token_counts[label].update(tokens)
            self.vocabulary.update(tokens)

        training_features = [
            (self._features(message, tokens), label)
            for message, label, tokens in tokenized_examples
        ]
        if NaiveBayesClassifier:
            self.classifier = NaiveBayesClassifier.train(training_features)
        else:
            self.classifier = _HeuristicClassifier(self.vocabulary, self.token_counts, self.class_counts)

        for index, phrase in enumerate(PHRASE_SIGNALS):
            match_name = f"SCAM_SIGNAL_{index}"
            self.phrase_matcher.add(match_name, [self.nlp.make_doc(phrase)])
            self.phrase_by_match_id[self.nlp.vocab.strings[match_name]] = phrase

    def _spam_terms(self, tokens):
        weighted = []
        for token in set(tokens):
            spam_count = self.token_counts["spam"][token]
            ham_count = self.token_counts["ham"][token]
            weight = (spam_count + 1) / (ham_count + 1)
            if weight > 1.4:
                weighted.append((weight, token))
        return [token for _, token in sorted(weighted, reverse=True)[:4]]

    def predict(self, text):
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Message must not be empty.")

        cleaned = normalize_text(text).strip()
        doc = self.nlp.make_doc(cleaned)
        tokens = self._tokens(cleaned)
        if not tokens:
            raise ValueError("Message does not contain readable words.")

        distribution = self.classifier.prob_classify(self._features(cleaned, tokens))
        probability = distribution.prob("spam")
        phrases = [self.phrase_by_match_id[match_id] for match_id, _, _ in self.phrase_matcher(doc)]
        phrase_boost = sum(PHRASE_SIGNALS[phrase] for phrase in phrases)
        contextual = [(boost, label) for pattern, boost, label in CONTEXT_SIGNALS if pattern.search(cleaned)]
        context_boost = sum(boost for boost, _ in contextual)
        benign_discount = min(0.24, sum(weight for phrase, weight in BENIGN_SIGNALS.items() if phrase in cleaned.lower()))
        combination_boost = 0.10 if len(contextual) >= 2 else 0.0
        if any(boost >= 0.22 for boost, _ in contextual):
            benign_discount = min(benign_discount, 0.04)
        probability = max(0.01, min(0.99, probability + phrase_boost + min(0.45, context_boost) + combination_boost - benign_discount))

        is_spam = probability >= 0.50
        indicators = list(dict.fromkeys(phrases + [label for _, label in contextual] + self._spam_terms(tokens)))[:6]
        confidence = probability if is_spam else 1.0 - probability

        if probability >= 0.70:
            risk = "HIGH"
        elif probability >= 0.50:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        if is_spam and indicators:
            reason = "Spam-like language detected: " + ", ".join(indicators) + "."
        elif is_spam:
            reason = "The message structure resembles known spam messages."
        else:
            reason = "The NLP model found no strong spam pattern in this message."

        indicator_labels = set(indicators)
        if "Requests an authentication secret" in indicator_labels:
            category = "Credential phishing"
        elif "Requests a wallet recovery secret" in indicator_labels:
            category = "Crypto wallet theft"
        elif "Requests payment for a job opportunity" in indicator_labels:
            category = "Job scam"
        elif "Uses a relationship to request money" in indicator_labels:
            category = "Romance scam"
        elif "Impersonates support to request remote access" in indicator_labels:
            category = "Tech-support scam"
        elif "Requests a difficult-to-reverse payment" in indicator_labels:
            category = "Payment scam"
        elif "Requests remote device access" in indicator_labels:
            category = "Remote-access scam"
        elif "Uses a prize or reward lure" in indicator_labels:
            category = "Prize or reward scam"
        elif "Promises unrealistic financial returns" in indicator_labels:
            category = "Investment scam"
        else:
            category = "Spam / Scam Message" if is_spam else "Likely Safe Message"

        return {
            "is_spam": is_spam,
            "label": "spam" if is_spam else "not_spam",
            "spam_probability": round(probability, 4),
            "confidence": round(confidence * 100),
            "risk": risk,
            "category": category,
            "reason": reason,
            "indicators": indicators,
            "model": "safemind-intent-nlp-v3",
            "nlp_stack": ["spaCy multilingual tokenizer", "spaCy PhraseMatcher", "NLTK PorterStemmer", "NLTK NaiveBayesClassifier"],
        }
