import unittest
from factory.ai_writer import build_prompt, WriterConfig, generate
from factory.ai_longform import similarity
class AIWriterTests(unittest.TestCase):
    def test_prompt_has_no_fixed_story(self):
        p=build_prompt({"title":"X"},{"chapter":2,"goal":"Y"},{"chapter_summaries":[],"open_hooks":[]})
        self.assertIn('"title": "X"',p)
        self.assertIn('"goal": "Y"',p)
    def test_similarity_detects_repeat(self):
        a="주인공은 문을 열고 복도로 나갔다 새로운 기록을 발견했다"
        self.assertGreater(similarity(a,a),0.9)
    def test_missing_key_fails_closed(self):
        with self.assertRaises(RuntimeError):
            generate(WriterConfig("openai","x",""),"hello")
if __name__=="__main__": unittest.main()
