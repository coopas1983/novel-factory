import json, tempfile, os, unittest
from pathlib import Path
from factory.factory_run import run

class PropagationTests(unittest.TestCase):
    def test_selected_concept_reaches_bible_and_chapter(self):
        with tempfile.TemporaryDirectory() as td:
            old=os.getcwd(); os.chdir(td)
            try:
                state=run("x")
                base=Path("books/x")
                selected=json.loads((base/"market/selected.json").read_text(encoding="utf-8"))
                bible=json.loads((base/"bible/story_bible.json").read_text(encoding="utf-8"))
                chapter=(base/"chapters/chapter-1.md").read_text(encoding="utf-8")
                self.assertEqual(selected["title"], bible["title"])
                self.assertEqual(selected["hook"], bible["core_hook"])
                self.assertIn(selected["title"], chapter)
            finally: os.chdir(old)
if __name__=="__main__": unittest.main()
