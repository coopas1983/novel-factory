from pathlib import Path
import json, re

PLATFORMS = {
    "quarterfull": {
        "genre": "공포/추리",
        "fields": ["title","genre","description","cover","episode_title","episode_body"],
        "publish_action": "서점에 반영하기",
    },
    "novelpia": {
        "genre": "현대판타지/공포·미스터리",
        "fields": [
            "title","serialization_type","distribution","age_rating","primary_tag",
            "hashtags","schedule","description","cover_400x600",
            "episode_title","visibility","reservation","episode_body"
        ],
        "publish_action": "회차 등록/예약공개",
    },
}

def clean_title(s):
    return re.sub(r"^\s*#\s*", "", s).strip()

def build_platform_package(book_dir, platform):
    book=Path(book_dir)
    if platform not in PLATFORMS:
        raise ValueError(platform)
    chapters=sorted((book/"chapters").glob("chapter-*.md"),
                    key=lambda p:int(re.search(r"(\d+)",p.stem).group(1)))
    if not chapters:
        raise RuntimeError("PUBLISH_BLOCKED: no chapters")
    report=json.loads((book/"live_report.json").read_text(encoding="utf-8"))
    title=report["title"]
    desc=(f"{title}. 평범한 야간 콜센터에 걸려온, 존재해서는 안 될 전화. "
          "빚에 짓눌린 강이현은 자신을 알고 있는 발신자와 마주하며 "
          "일상 뒤에 숨은 기록을 추적하기 시작한다.")
    episodes=[]
    for i,p in enumerate(chapters,1):
        body=p.read_text(encoding="utf-8").strip()
        lines=body.splitlines()
        ep_title=clean_title(lines[0]) if lines and lines[0].startswith("#") else f"{i}화"
        if lines and lines[0].startswith("#"):
            body="\n".join(lines[1:]).strip()
        episodes.append({"episode":i,"episode_title":ep_title,"episode_body":body,
                         "chars":len(body)})
    return {
        "platform":platform,
        "work":{"title":title,"genre":PLATFORMS[platform]["genre"],
                "description":desc,
                "cover":"cover_400x600.png" if platform=="novelpia" else "cover.png",
                **({"serialization_type":"자유연재",
                    "distribution":"비독점작 (다중플랫폼연재)",
                    "age_rating":"전 연령",
                    "primary_tag":"현대판타지",
                    "hashtags":["현대판타지","미스터리","공포","콜센터","괴이"],
                    "schedule":"비정기",
                    "cover_rule":"표지 이미지 상업적 이용 가능"} if platform=="novelpia" else {})},
        "episodes":[dict(ep, **({"visibility":"전체 열람가능",
                                  "reservation":{"enabled":False,"date":None,"time":None},
                                  "input_mode":"원본 붙여넣기"} if platform=="novelpia" else {}))
                    for ep in episodes],
        "publish_action":PLATFORMS[platform]["publish_action"],
        "status":"READY_FOR_PLATFORM_INPUT",
    }

def write_packages(book_dir):
    book=Path(book_dir)
    out=book/"publish"
    out.mkdir(exist_ok=True)
    made=[]
    for platform in PLATFORMS:
        pkg=build_platform_package(book,platform)
        d=out/platform
        d.mkdir(parents=True,exist_ok=True)
        (d/"manifest.json").write_text(json.dumps(pkg,ensure_ascii=False,indent=2),encoding="utf-8")
        for ep in pkg["episodes"]:
            (d/f'episode-{ep["episode"]:03d}.txt').write_text(ep["episode_body"],encoding="utf-8")
        made.append(str(d))
    return made
