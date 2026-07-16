import time
import uuid
from datetime import datetime, timezone

from .agents import (DecisionAgent, EvidenceAgent, InputUnderstandingAgent,
                     MLClassificationAgent, ReasoningAgent,
                     ThreatIntelligenceAgent)
from .contracts import Investigation, TimelineEvent
from .models import HybridModelAdapter


class InvestigationCoordinator:
    """Coordinates modular agents and returns one stable investigation contract."""

    def __init__(self, analyzer, model=None):
        self.input_agent = InputUnderstandingAgent()
        self.threat_agent = ThreatIntelligenceAgent()
        self.ml_agent = MLClassificationAgent(model or HybridModelAdapter(analyzer))
        self.evidence_agent = EvidenceAgent()
        self.reasoning_agent = ReasoningAgent()
        self.decision_agent = DecisionAgent()

    @staticmethod
    def _run(timeline, agent, label, operation):
        started = time.perf_counter()
        value = operation()
        timeline.append(TimelineEvent(agent, label, duration_ms=round((time.perf_counter() - started) * 1000, 3)))
        return value

    def analyze(self, input_type, content):
        started = time.perf_counter()
        timeline = []
        document, normalized = self._run(timeline, "Input Agent", "Reading and normalizing input", lambda: self.input_agent.run(input_type, content))
        intelligence = self._run(timeline, "Threat Agent", "Checking available intelligence", lambda: self.threat_agent.run(input_type, normalized))
        prediction, probabilities = self._run(timeline, "ML Agent", "Running classification models", lambda: self.ml_agent.run(input_type, normalized))
        evidence = self._run(timeline, "Evidence Agent", "Extracting entities and behaviors", lambda: self.evidence_agent.run(normalized))
        raw = prediction["raw"]
        scoring = self._run(timeline, "Reasoning Agent", "Scoring explainable evidence", lambda: self.reasoning_agent.run(raw["risk_score"], raw["indicators"], evidence))
        status = self._run(timeline, "Decision Agent", "Producing risk decision", lambda: self.decision_agent.run(raw["risk_score"]))
        case_uuid = uuid.uuid4()
        case_number = f"CASE-{datetime.now(timezone.utc):%Y%m%d}-{str(case_uuid)[:8].upper()}"
        nodes = [{"id": "input", "type": input_type, "label": input_type.title()}]
        edges = []
        for index, item in enumerate(evidence):
            if item.kind in {"url", "email", "phone", "crypto_wallet"}:
                node_id = f"evidence-{index}"
                nodes.append({"id": node_id, "type": item.kind, "label": item.label})
                edges.append({"source": "input", "target": node_id, "relation": "contains"})
        investigation = Investigation(
            case_id=str(case_uuid), case_number=case_number, status=status,
            confidence=int(raw["confidence"]), threat_type=raw["category"],
            investigation_time_ms=round((time.perf_counter() - started) * 1000, 3),
            evidence_count=len(evidence) + len(raw["indicators"]), document=document,
            intelligence=intelligence, predictions={"model": prediction["model"], "probabilities": probabilities, "calibration": "derived_from_active_model_risk"},
            evidence=evidence, scoring=scoring, timeline=timeline,
            graph={"nodes": nodes, "edges": edges},
            related_cases={"available": False, "matches": [], "reason": "Vector similarity is ready for pgvector but not configured."},
            knowledge={"available": False, "citations": [], "reason": "RAG providers are not configured; no citation was fabricated."},
            checks_performed=[
                "Text normalization and language-aware token analysis",
                "Behavior, urgency, impersonation, and secret-request detection",
                "URL, email, phone, and wallet pattern extraction",
                "Explainable hybrid risk classification",
            ],
            limitations=[
                "No live account ownership or identity verification was performed.",
                "No external threat-intelligence or WHOIS provider is configured.",
                "A low score is not a guarantee that content is safe.",
            ],
        )
        raw["investigation"] = investigation.to_dict()
        return raw
