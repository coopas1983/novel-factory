import unittest, tempfile, os, json
from pathlib import Path
from factory.editor_run import run as editor_run
from factory.longform_loop import run_longform
from factory.final_editor import audit_manuscript, finalize

class FinalEditorTests(unittest.TestCase):
    def test_final_editor_closes_last_hook_and_packages(self):
        with tempfile.TemporaryDirectory() as td:
            old=os.getcwd(); os.chdir(td)
            try:
                Path("market_data").mkdir()
                src=Path(old)/"market_data"/"snapshot_2026-09-03.json"
                Path("market_data/snapshot_2026-09-03.json").write_text(src.read_text(encoding="utf-8"),encoding="utf-8")
                editor_run("book",seed="final-test")
                base=Path("books/book")
                run_longform(base)
                self.assertFalse(audit_manuscript(base)["passed"])
                result=finalize(base)
                self.assertEqual(result["status"],"FINAL_EDITOR_PASS")
                self.assertTrue((base/"package/complete_manuscript.md").exists())
                mem=json.loads((base/"memory/state.json").read_text(encoding="utf-8"))
                self.assertEqual(mem["open_hooks"],[])
            finally: os.chdir(old)
if __name__=="__main__": unittest.main()
