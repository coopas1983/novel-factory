from factory.korean_editor import apply_safe_fixes, scan_korean_editor

def test_known_typos_are_fixed():
    out=apply_safe_fixes("띵- 하고도착한 뒤 잘못 걸하셨으면 끊으세요.")
    assert "띵- 하고 도착한" in out
    assert "잘못 거셨으면" in out
    assert scan_korean_editor(out)==[]
