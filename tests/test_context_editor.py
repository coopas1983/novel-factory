from factory.context_editor import preservation_gate

def test_preservation_gate_accepts_small_edit():
    before="강이현은 중앙 고객센터에서 03:14:22를 보았다. " * 30
    after=before.replace("보았다","확인했다")
    assert preservation_gate(before,after)==[]

def test_preservation_gate_blocks_story_loss():
    before=("강이현은 중앙 고객센터에서 03:14:22를 보았다. " * 30)
    after="짧아졌다."
    issues=preservation_gate(before,after)
    assert "CONTEXT_EDIT_TOO_SHORT" in issues
    assert any(x.startswith("LOST_ANCHOR:") for x in issues)
