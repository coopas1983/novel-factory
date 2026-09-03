from __future__ import annotations
import json, hashlib
from pathlib import Path

GENRES = [
 ("현대판타지","직업/전문성","성장"),("생활미스터리","일상공간","착각"),
 ("오피스판타지","회사/조직","성공"),("스포츠판타지","코치/분석","성장"),
 ("엔터테인먼트판타지","제작/매니지먼트","성공"),("감성미스터리","가족/관계","성장")
]
DEVICES = [
 "주인공만 보이는 업무 성과의 숨은 원인",
 "실패한 선택이 자산으로 환산되는 규칙",
 "평범한 직업 기술이 초현실 사건 해결 능력이 되는 규칙",
 "사람들의 착각이 현실의 기회로 바뀌는 규칙",
 "사라진 기록을 복구할수록 주인공의 전문성이 성장하는 규칙",
 "타인의 미완성 목표를 해결하면 새로운 능력을 얻는 규칙"
]
SETTINGS=["폐업 직전 상가","야간 콜센터","지역 방송국","중고 거래 회사","망해가는 스포츠 구단","오래된 아파트 관리소","소형 연예기획사","지방 공장"]
GOALS=["회사를 살린다","업계 1위가 된다","사라진 사람을 찾는다","무너진 팀을 정상에 올린다","빚을 청산한다","숨겨진 사건의 진실을 밝힌다"]

def load_snapshot():
    p=Path("market_data/snapshot_2026-09-03.json")
    return json.loads(p.read_text(encoding="utf-8"))

def generate_candidates(run_seed:str, n=12):
    snap=load_snapshot()
    seed=int(hashlib.sha256(run_seed.encode()).hexdigest()[:8],16)
    out=[]
    for i in range(n):
        g,work,trend=GENRES[(seed+i*5)%len(GENRES)]
        device=DEVICES[(seed//7+i*3)%len(DEVICES)]
        setting=SETTINGS[(seed//11+i*5)%len(SETTINGS)]
        goal=GOALS[(seed//13+i*7)%len(GOALS)]
        title=f"{setting}에서 {['천재','에이스','팀장','사장','해결사','감독'][(seed+i)%6]}가 되었다"
        hook=f"{setting}에서 {device}을 발견한 주인공이 {goal}."
        market=78 + ((seed+i*7)%16)
        originality=74 + ((seed//3+i*11)%20)
        series=76 + ((seed//5+i*13)%19)
        emotion=70 + ((seed//17+i*5)%23)
        clarity=80 + ((seed//19+i*3)%18)
        out.append({"title":title,"genre":g,"trend_engine":trend,"hook":hook,
                    "market_fit":market,"originality":originality,"series_potential":series,
                    "emotion":emotion,"clarity":clarity,"source_strategy":snap["derived_strategy"]})
    # de-dupe title/hook pairs
    seen=set(); unique=[]
    for c in out:
        key=(c["title"],c["hook"])
        if key not in seen:
            seen.add(key); unique.append(c)
    return unique

def score(c):
    return round(c["market_fit"]*.25+c["originality"]*.25+c["series_potential"]*.20+
                 c["emotion"]*.15+c["clarity"]*.15,1)
