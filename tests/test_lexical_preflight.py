from factory.lexical_preflight import scan_lexical, apply_lexical_fixes

def test_known_malformed_detect_and_fix():
    text="눈 밑에 시커룟게 그림자가 내려앉았다."
    issues=scan_lexical(text)
    assert any(x["phrase"]=="시커룟게" for x in issues)
    fixed=apply_lexical_fixes(text)
    assert "시커룟게" not in fixed
    assert "시커멓게" in fixed

def test_foreign_script_blocks():
    assert any(x["code"]=="FOREIGN_SCRIPT_THAI" for x in scan_lexical("문ประตู장"))

def test_clean_korean_passes():
    assert scan_lexical("강이현은 7층 복도를 바라보았다.") == []
