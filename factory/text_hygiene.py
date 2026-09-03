import re
import unicodedata

FORBIDDEN_PATTERNS = [
    ("REPLACEMENT_CHAR", re.compile("\ufffd")),
    ("THAI_SCRIPT", re.compile(r"[\u0E00-\u0E7F]")),
    ("NUL_CHAR", re.compile("\x00")),
]

SUSPECT_PHRASES = ["시커룝게", "푸른 청색광", "거센 거친"]

def scan_text(text: str):
    issues=[]
    for name, pattern in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            issues.append(name)
    for phrase in SUSPECT_PHRASES:
        if phrase in text:
            issues.append("SUSPECT_PHRASE:" + phrase)
    for ch in text:
        if ch not in "\n\r\t" and unicodedata.category(ch) == "Cc":
            issues.append("CONTROL_CHAR")
            break
    return sorted(set(issues))

def assert_clean(text: str):
    issues=scan_text(text)
    if issues:
        raise ValueError("TEXT_HYGIENE_BLOCKED:" + ",".join(issues))
    return True
