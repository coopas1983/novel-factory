from factory.commercial_episode_2 import visible_chars

def test_episode2_visible_chars():
    assert visible_chars("가 나\\n다\\t라") == 4
