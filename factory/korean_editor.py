import re
from dataclasses import dataclass

@dataclass(frozen=True)
class EditIssue:
    code: str
    phrase: str

KNOWN_BAD = {
    "띵- 하고도착한": "TYPO_SPACING",
    "잘못 걸하셨으면": "TYPO_WORDING",
    "푸른 청색광": "REDUNDANT_WORDING",
    "거센 거친": "REDUNDANT_WORDING",
    "시커룝게": "TYPO_WORDING",
}

def scan_korean_editor(text: str):
    issues=[]
    for phrase, code in KNOWN_BAD.items():
        if phrase in text:
            issues.append(EditIssue(code, phrase))
    if re.search(r"[가-힣][A-Za-z]{2,}[가-힣]", text):
        issues.append(EditIssue("SUSPICIOUS_MIXED_SCRIPT","KOREAN_LATIN_KOREAN"))
    return issues

def apply_safe_fixes(text: str):
    replacements={
        "띵- 하고도착한":"띵- 하고 도착한",
        "잘못 걸하셨으면":"잘못 거셨으면",
        "푸른 청색광":"푸른빛",
        "거센 거친":"거센",
        "시커룝게":"시커멓게",
    }
    for old,new in replacements.items():
        text=text.replace(old,new)
    return text
