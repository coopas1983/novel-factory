from factory.commercial_episode import visible_chars, deterministic_issues

def test_visible_chars_excludes_all_whitespace():
    assert visible_chars("가 나\n다\t라") == 4

def test_under_3500_visible_blocks():
    issues=deterministic_issues("가 "*3499)
    assert any(x.startswith("TOO_SHORT_VISIBLE:") for x in issues)

def test_3500_visible_does_not_length_block():
    issues=deterministic_issues("가"*3500)
    assert not any(x.startswith("TOO_SHORT_VISIBLE:") for x in issues)
