from factory.text_hygiene import scan_text
from factory.commercial_episode import check

def test_clean_korean_passes():
    assert scan_text("정상적인 한국어 웹소설 문장이다.") == []

def test_thai_is_blocked():
    assert "THAI_SCRIPT" in scan_text("유리ประตู")

def test_replacement_char_is_blocked():
    assert "REPLACEMENT_CHAR" in scan_text("단순한 상�담")

def test_known_typo_is_blocked():
    assert "SUSPECT_PHRASE:시커룝게" in scan_text("눈 밑이 시커룝게 내려앉았다.")

def test_commercial_gate_includes_hygiene():
    text = ("가" * 3600) + "ประตู"
    issues = check(text)
    assert "THAI_SCRIPT" in issues
