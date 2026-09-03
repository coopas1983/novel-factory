import re
import unicodedata

# Fail-closed lexical preflight. This is intentionally deterministic:
# obvious malformed tokens must never rely on an LLM reviewer alone.
KNOWN_MALFORMED = {
    "시커룟게": "시커멓게",
    "시커룝게": "시커멓게",
    "곰팡내구역질": "곰팡내와 구역질",
    "세세 명": "서너 명",
    "악성 악지형": "악성",
    "돋움살": "소름",
    "이파인 잡음": "이상한 잡음",
    "잘못 걸하셨으면": "잘못 거셨으면",
    "띵- 하고도착한": "띵- 하고 도착한",
}

FOREIGN_SCRIPT_RANGES = [
    ("THAI", 0x0E00, 0x0E7F),
    ("CYRILLIC", 0x0400, 0x04FF),
    ("ARABIC", 0x0600, 0x06FF),
]

def scan_lexical(text: str):
    issues=[]
    for bad, fix in KNOWN_MALFORMED.items():
        if bad in text:
            issues.append({"code":"KNOWN_MALFORMED","phrase":bad,"suggestion":fix})

    for ch in text:
        cp=ord(ch)
        if ch == "\ufffd":
            issues.append({"code":"REPLACEMENT_CHAR","phrase":ch,"suggestion":""})
            break
        if ch not in "\n\r\t" and unicodedata.category(ch)=="Cc":
            issues.append({"code":"CONTROL_CHAR","phrase":repr(ch),"suggestion":""})
            break
        for name, lo, hi in FOREIGN_SCRIPT_RANGES:
            if lo <= cp <= hi:
                issues.append({"code":"FOREIGN_SCRIPT_"+name,"phrase":ch,"suggestion":""})
                break

    # Catch a frequent generation failure: Hangul immediately glued to a bracketed
    # system token without spacing is allowed, so do not overreach with generic rules.
    return issues

def apply_lexical_fixes(text: str):
    for bad, fix in KNOWN_MALFORMED.items():
        text=text.replace(bad,fix)
    return text
