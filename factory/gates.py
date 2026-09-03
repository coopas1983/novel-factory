from dataclasses import dataclass

@dataclass
class GateResult:
    passed: bool
    score: int
    reasons: list[str]

def concept_gate(scores: dict[str, int], minimum: int = 75) -> GateResult:
    required = ["market_fit", "hook", "originality", "series_potential"]
    missing = [k for k in required if k not in scores]
    if missing:
        return GateResult(False, 0, [f"missing score: {k}" for k in missing])
    score = round(sum(scores[k] for k in required) / len(required))
    reasons = []
    if scores["originality"] < 70:
        reasons.append("originality risk")
    if scores["hook"] < 70:
        reasons.append("weak commercial hook")
    passed = score >= minimum and not reasons
    return GateResult(passed, score, reasons)

def chapter_gate(review: dict, minimum: int = 80) -> GateResult:
    keys = ["hook", "progression", "character", "prose", "payoff"]
    missing = [k for k in keys if k not in review]
    if missing:
        return GateResult(False, 0, [f"missing score: {k}" for k in missing])
    score = round(sum(int(review[k]) for k in keys) / len(keys))
    reasons = list(review.get("blocking_issues", []))
    return GateResult(score >= minimum and not reasons, score, reasons)
