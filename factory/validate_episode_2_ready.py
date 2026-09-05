import json
import re
from pathlib import Path

BOOK = Path("books/live-gemini-pilot")
CHAPTER = BOOK / "commercial/chapter-2.md"
QUALITY = BOOK / "commercial/chapter-2-quality.json"
MIN_VISIBLE = 3500
TARGET_MIN = 3700
TARGET_MAX = 4200
MAX_VISIBLE = 4400

REQUIRED_SNIPPETS = [
    "03시 14분 22초",
    "[지시어 : 031422 - RELEASE]",
    "[발신자 : 강이현]",
    "[발신 위치 : 7층 비상구 내부]",
]

FORBIDDEN_SNIPPETS = [
    "먼짓가루",
    "5년간 콜센터",
    "대기 수신 인원이 다시 '1'로 바뀌었다.",
    "여성 상담원 혹은 방문객",
    "절대적인 물질적 보상",
    "시간은 무섭도록 빠르게 흘러 새벽 3시를 향해 가고 있었다.",
]


def visible_chars(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def main():
    text = CHAPTER.read_text(encoding="utf-8").strip()
    quality = json.loads(QUALITY.read_text(encoding="utf-8"))
    vc = visible_chars(text)
    issues = []

    if vc < MIN_VISIBLE:
        issues.append(f"TOO_SHORT_VISIBLE:{vc}")
    if vc > MAX_VISIBLE:
        issues.append(f"TOO_LONG_VISIBLE:{vc}")
    if not (TARGET_MIN <= vc <= TARGET_MAX):
        issues.append(f"OUTSIDE_TARGET_VISIBLE:{vc}")

    expected_vc = quality.get("chars_without_whitespace")
    if expected_vc != vc:
        issues.append(f"QUALITY_COUNT_MISMATCH:{expected_vc}!={vc}")

    for field in ("gate", "human_polish", "lexical_preflight", "independent_reviewer", "continuity_reviewer"):
        if quality.get(field) != "PASS":
            issues.append(f"QUALITY_{field.upper()}_NOT_PASS:{quality.get(field)}")

    for field in ("lexical_preflight_final", "final_review_issues", "continuity_issues"):
        if quality.get(field):
            issues.append(f"QUALITY_{field.upper()}_NOT_EMPTY")

    for snippet in REQUIRED_SNIPPETS:
        if snippet not in text:
            issues.append(f"MISSING_REQUIRED:{snippet}")

    for snippet in FORBIDDEN_SNIPPETS:
        if snippet in text:
            issues.append(f"FORBIDDEN_REMAINS:{snippet}")

    report = {
        "episode": 2,
        "chars_without_whitespace": vc,
        "target": [TARGET_MIN, TARGET_MAX],
        "required_snippets_ok": all(s in text for s in REQUIRED_SNIPPETS),
        "forbidden_snippets_ok": all(s not in text for s in FORBIDDEN_SNIPPETS),
        "quality_gate": quality.get("gate"),
        "human_polish": quality.get("human_polish"),
        "status": "PASS" if not issues else "BLOCK",
        "issues": issues,
    }
    print(json.dumps(report, ensure_ascii=False))
    if issues:
        raise SystemExit("EPISODE_2_READY_GATE_BLOCKED")


if __name__ == "__main__":
    main()
