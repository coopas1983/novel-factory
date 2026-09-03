from factory.independent_reviewer import _json_only

def test_json_only_plain():
    assert _json_only('{"issues":[]}') == {"issues":[]}

def test_json_only_fenced():
    assert _json_only('```json\n{"issues":[]}\n```') == {"issues":[]}
