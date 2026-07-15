from abc import ABC, abstractmethod
from typing import Any


class ModelAdapter(ABC):
    """Model-independent interface for sklearn, ONNX, PyTorch, or hosted models."""

    name = "abstract-model"

    @abstractmethod
    def predict(self, text: str, input_type: str) -> dict[str, Any]:
        """Return class, confidence, probabilities, reasoning, and features."""


class HybridModelAdapter(ModelAdapter):
    name = "safemind-hybrid-security-v3"

    def __init__(self, analyzer):
        self.analyzer = analyzer

    def predict(self, text: str, input_type: str) -> dict[str, Any]:
        result = self.analyzer.analyze(input_type, text)
        score = int(result["risk_score"])
        return {
            "class": result["verdict"],
            "confidence": result["confidence"],
            "probabilities": {
                "safe_or_unknown": round(max(0, 100 - score) / 100, 4),
                "suspicious_or_scam": round(score / 100, 4),
            },
            "reasoning": result["reason"],
            "features": result["indicators"],
            "raw": result,
            "model": result["model"],
        }
