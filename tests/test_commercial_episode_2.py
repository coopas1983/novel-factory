import pytest

from factory.commercial_episode_2 import parse_continuity_review, visible_chars


def test_episode2_visible_chars():
    assert visible_chars("가 나\n다\t라") == 4


def test_parse_continuity_review_plain_json():
    text="강이현은 7번 단말기를 바라봤다."
    raw='{"issues":[{"phrase":"7번 단말기","reason":"test"}]}'
    issues=parse_continuity_review(raw,text)
    assert issues == [{"phrase":"7번 단말기","reason":"test"}]


def test_parse_continuity_review_fenced_json():
    text="강이현은 7번 단말기를 바라봤다."
    raw='```json\n{"issues":[]}\n```'
    assert parse_continuity_review(raw,text) == []


def test_parse_continuity_review_with_prefix_suffix():
    text="강이현은 7번 단말기를 바라봤다."
    raw='검수 결과입니다. {"issues":[]} 감사합니다.'
    assert parse_continuity_review(raw,text) == []


def test_parse_continuity_review_rejects_malformed_json():
    with pytest.raises(ValueError):
        parse_continuity_review('not json','본문')
