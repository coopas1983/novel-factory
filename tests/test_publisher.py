import tempfile, unittest, json
from pathlib import Path
from factory.publisher import write_packages
class PublisherTests(unittest.TestCase):
    def test_dual_package(self):
        with tempfile.TemporaryDirectory() as td:
            b=Path(td)
            (b/"chapters").mkdir()
            (b/"chapters/chapter-1.md").write_text("# 1화 — 이상 징후\n\n본문입니다.",encoding="utf-8")
            (b/"live_report.json").write_text(json.dumps({"title":"자정 이후의 콜센터"},ensure_ascii=False),encoding="utf-8")
            made=write_packages(b)
            self.assertEqual(len(made),2)
            for x in ("quarterfull","novelpia"):
                m=json.loads((b/"publish"/x/"manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(m["work"]["title"],"자정 이후의 콜센터")
                self.assertEqual(m["episodes"][0]["episode_body"],"본문입니다.")
