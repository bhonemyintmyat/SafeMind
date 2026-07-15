from dataclasses import asdict, dataclass, field
from typing import Any, Optional


@dataclass
class TimelineEvent:
    agent: str
    label: str
    status: str = "completed"
    duration_ms: float = 0.0


@dataclass
class Evidence:
    kind: str
    label: str
    severity: str
    value: Optional[str] = None
    explanation: str = ""


@dataclass
class RiskContribution:
    label: str
    score: int
    source: str


@dataclass
class Investigation:
    case_id: str
    case_number: str
    status: str
    confidence: int
    threat_type: str
    investigation_time_ms: float
    evidence_count: int
    document: dict[str, Any]
    intelligence: dict[str, Any]
    predictions: dict[str, Any]
    evidence: list[Evidence] = field(default_factory=list)
    scoring: list[RiskContribution] = field(default_factory=list)
    timeline: list[TimelineEvent] = field(default_factory=list)
    graph: dict[str, Any] = field(default_factory=dict)
    related_cases: dict[str, Any] = field(default_factory=dict)
    knowledge: dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)
