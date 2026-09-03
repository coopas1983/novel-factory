from __future__ import annotations
import re

BANNED_AWKWARD = [
    r"감독가 되었다", r"팀장가 되었다", r"사장가 되었다",
    r"에이스가 되었다가 되었다", r"천재가 되었다가 되었다"
]
CLICHE_TERMS={"SSS급","EX급","나 혼자","회귀한","재벌집 막내","천마"}

def title_quality(title:str, genre:str)->dict:
    reasons=[]
    score=100
    if any(re.search(p,title) for p in BANNED_AWKWARD):
        score-=60; reasons.append("한국어 조사/문형이 부자연스러움")
    if len(title)<5:
        score-=20; reasons.append("내용 전달이 너무 약함")
    if len(title)>32:
        score-=15; reasons.append("모바일 제목으로 과도하게 김")
    cliché=sum(1 for x in CLICHE_TERMS if x in title)
    score-=cliché*12
    if cliché: reasons.append("상투 키워드 의존")
    return {"score":max(0,score),"reasons":reasons}

def concept_quality(c:dict)->dict:
    reasons=[]
    scores={
      "clarity":c.get("clarity",0),
      "market":c.get("market_fit",0),
      "originality":c.get("originality",0),
      "series":c.get("series_potential",0),
      "emotion":c.get("emotion",0)
    }
    tq=title_quality(c["title"],c["genre"])
    weighted=round(scores["clarity"]*.15+scores["market"]*.20+scores["originality"]*.25+
                   scores["series"]*.15+scores["emotion"]*.10+tq["score"]*.15,1)
    if scores["originality"]<78: reasons.append("독창성 기준 미달")
    if scores["clarity"]<80: reasons.append("한 줄 전제 명확성 부족")
    reasons += tq["reasons"]
    return {"passed":weighted>=80 and tq["score"]>=75 and not reasons,
            "score":weighted,"title_score":tq["score"],"reasons":reasons}

def retitle(c:dict)->list[str]:
    # deterministic editor fallback; later a live model can replace this method.
    setting=c["hook"].split("에서")[0].strip()
    genre=c["genre"]
    hook=c["hook"]
    if "콜센터" in setting:
        return ["자정 이후의 콜센터","퇴근한 직원에게 전화가 온다","야간 콜센터의 미처리 전화"]
    if "아파트" in setting:
        return ["도면에 없는 세대","관리사무소에 없는 집이 민원을 넣었다","404동은 존재하지 않는다"]
    if "스포츠" in setting or "구단" in setting:
        return ["꼴찌 구단의 데이터가 보인다","망한 구단을 맡았다","패배의 원인이 숫자로 보인다"]
    if "연예" in setting:
        return ["망한 기획사의 미래가 보인다","퇴출 직전 아이돌의 매니저","내 가수의 실패가 먼저 보인다"]
    return [f"{setting}의 숨은 기록", f"{setting}에서만 보이는 것", f"{setting}, 마지막 미처리 건"]
