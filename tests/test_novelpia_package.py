import tempfile, unittest, json
from pathlib import Path
from factory.publisher import build_platform_package
class NovelPiaPackageTests(unittest.TestCase):
    def test_observed_fields(self):
        with tempfile.TemporaryDirectory() as td:
            b=Path(td); (b/"chapters").mkdir()
            (b/"chapters/chapter-1.md").write_text("# 1화 — 이상 징후\n\n본문",encoding="utf-8")
            (b/"live_report.json").write_text(json.dumps({"title":"자정 이후의 콜센터"},ensure_ascii=False),encoding="utf-8")
            x=build_platform_package(b,"novelpia")
            self.assertEqual(x["work"]["distribution"],"비독점작 (다중플랫폼연재)")
            self.assertEqual(x["work"]["cover"],"cover_400x600.png")
            self.assertIn("reservation",x["episodes"][0])
            self.assertEqual(x["episodes"][0]["input_mode"],"원본 붙여넣기")
