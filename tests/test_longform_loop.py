import unittest, tempfile, os, json
from pathlib import Path
from factory.editor_run import run as editor_run
from factory.longform_loop import run_longform

class LongformTests(unittest.TestCase):
    def test_completes_all_outline_chapters_and_memory(self):
        with tempfile.TemporaryDirectory() as td:
            old=os.getcwd(); os.chdir(td)
            try:
                # market snapshot is needed by dynamic generator
                Path("market_data").mkdir()
                src=Path(old)/"market_data"/"snapshot_2026-09-03.json"
                Path("market_data/snapshot_2026-09-03.json").write_text(src.read_text(encoding="utf-8"),encoding="utf-8")
                editor_run("book",seed="test-longform")
                result=run_longform(Path("books/book"))
                self.assertEqual(result["chapters_completed"],10)
                mem=json.loads(Path("books/book/memory/state.json").read_text(encoding="utf-8"))
                self.assertEqual(len(mem["chapter_summaries"]),10)
                self.assertEqual(len(mem["timeline"]),10)
            finally: os.chdir(old)
if __name__=="__main__": unittest.main()
