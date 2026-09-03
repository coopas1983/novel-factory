import unittest
from factory.gates import concept_gate, chapter_gate
from factory.pipeline import next_stage

class CoreTests(unittest.TestCase):
    def test_next_stage(self):
        self.assertEqual(next_stage("discover"), "ideate")
        self.assertIsNone(next_stage("package"))

    def test_concept_gate(self):
        r = concept_gate({"market_fit":80,"hook":85,"originality":82,"series_potential":78})
        self.assertTrue(r.passed)

    def test_chapter_gate_blocks_issue(self):
        r = chapter_gate({"hook":90,"progression":90,"character":90,"prose":90,"payoff":90,
                          "blocking_issues":["timeline conflict"]})
        self.assertFalse(r.passed)

if __name__ == "__main__":
    unittest.main()
