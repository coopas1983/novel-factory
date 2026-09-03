import unittest
from factory.editor_gate import title_quality, concept_quality, retitle
class EditorGateTests(unittest.TestCase):
    def test_rejects_bad_korean_title(self):
        self.assertLess(title_quality("야간 콜센터에서 감독가 되었다","현대판타지")["score"],75)
    def test_retitle_repairs_callcenter(self):
        c={"title":"야간 콜센터에서 감독가 되었다","genre":"현대판타지",
           "hook":"야간 콜센터에서 이상한 규칙을 발견한다.","market_fit":90,
           "originality":88,"series_potential":88,"emotion":85,"clarity":90}
        candidates=retitle(c)
        self.assertIn("자정 이후의 콜센터",candidates)
        repaired={**c,"title":candidates[0]}
        self.assertTrue(concept_quality(repaired)["passed"])
if __name__=="__main__": unittest.main()
