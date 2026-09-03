import unittest
from factory.market_engine import generate_candidates, score
class MarketEngineTests(unittest.TestCase):
    def test_dynamic_seed_changes_output(self):
        a=generate_candidates("run-a",12)
        b=generate_candidates("run-b",12)
        self.assertNotEqual([(x["title"],x["hook"]) for x in a],[(x["title"],x["hook"]) for x in b])
    def test_scores_are_commercial_range(self):
        for c in generate_candidates("x",12):
            self.assertGreaterEqual(score(c),70)
            self.assertLessEqual(score(c),100)
if __name__=="__main__": unittest.main()
