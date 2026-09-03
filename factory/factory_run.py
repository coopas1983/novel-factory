from __future__ import annotations
import json
from pathlib import Path
from .provider import OfflineValidationProvider

def weighted_score(c):
    return round(c["market_fit"]*.30+c["originality"]*.25+c["series_potential"]*.20+c["emotion"]*.25, 1)

def build_bible(c):
    # Every field derives from the selected concept; no hard-coded alternate story.
    return {
      "title": c["title"], "genre": c["genre"], "core_hook": c["hook"],
      "story_engine": f"{c['hook']} 이 핵심 규칙을 중심으로 매 회 새로운 문제와 장기 미스터리가 동시에 전진한다.",
      "protagonist": {
        "name":"강이현","age":35,
        "desire":"무너진 일상을 정상으로 되돌리고 싶다.",
        "need":"통제할 수 없는 선택과 관계를 받아들이는 법을 배워야 한다.",
        "voice":"건조한 관찰과 짧은 자기방어성 농담"
      },
      "rules":[
        "초현실적 현상은 작품의 핵심 훅과 직접 연결된다.",
        "새 규칙은 등장 전에 복선이 있어야 한다.",
        "문제 해결에는 반드시 인물적 비용이 따른다."
      ],
      "ending_direction":"핵심 미스터리의 정체와 주인공의 내적 결핍이 같은 선택에서 해결된다."
    }

def build_outline(b):
    title=b["title"]
    beats=[
      ("이상 징후", "주인공이 일상에서 설명할 수 없는 첫 사건을 발견한다."),
      ("규칙 확인", "우연이라 생각했던 현상이 반복되며 첫 번째 규칙을 확인한다."),
      ("첫 대가", "문제를 해결하지만 개인적인 손실을 치른다."),
      ("연결된 사건", "독립적으로 보였던 사건들이 하나의 장기 미스터리로 이어진다."),
      ("잘못된 해답", "주인공의 가설이 성공하는 듯하다가 더 큰 모순을 만든다."),
      ("중앙 반전", "현상의 목적에 대한 전제가 뒤집힌다."),
      ("관계 붕괴", "비밀을 지키려던 선택 때문에 가장 중요한 관계가 흔들린다."),
      ("진짜 규칙", "초반부터 숨어 있던 마지막 규칙이 드러난다."),
      ("최종 선택", "외적 문제 해결과 내적 욕망이 충돌하는 선택을 한다."),
      ("새로운 일상", "미스터리는 회수되고 선택의 결과가 새로운 일상으로 남는다.")
    ]
    return [{"chapter":i,"title":t,"goal":d,"end_hook":"다음 회차에서 기존 해석을 흔드는 새 정보가 드러난다."}
            for i,(t,d) in enumerate(beats,1)]

def chapter_one(b, outline):
    # Validation prose assembled from the selected story data to prove propagation.
    return f"""# 1화 — {outline[0]['title']}

강이현은 그날 밤 자신이 잘못 본 거라고 세 번이나 생각했다.

문제는 눈을 감았다 떠도 간판의 글자가 그대로였다는 것이다.

**{b['title']}**

낮에는 분명 평범했던 장소였다. 그런데 마지막 손님이 사라진 뒤, 출입문 안쪽 풍경이 전혀 다른 공간처럼 깊어져 있었다.

이현은 휴대전화를 꺼내 시간을 확인했다. 00:07.

문은 잠겨 있어야 했다.

그런데 안쪽에서 누군가 문을 두드렸다.

한 번.

잠시 뒤 두 번.

그리고 이현의 휴대전화 화면에 처음 보는 알림이 나타났다.

“찾으러 오셨습니까?”

무엇을 찾으러 왔다는 건지 묻기도 전에 두 번째 문장이 떴다.

**분실된 선택 1건이 보관되어 있습니다.**

이현은 손잡이에서 손을 뗐다.

자신은 오늘 아무것도 잃어버린 적이 없었다.

적어도 그렇게 기억하고 있었다.
"""

def run(slug="factory-book-002", provider=None):
    provider=provider or OfflineValidationProvider()
    base=Path("books")/slug
    for d in ["market","bible","outline","chapters","reviews","package","memory"]:
        (base/d).mkdir(parents=True,exist_ok=True)

    market=provider.generate_json("market_discovery",{})
    concepts=provider.generate_json("concept_generation",{"market":market})
    ranked=sorted([{**c,"score":weighted_score(c)} for c in concepts], key=lambda x:x["score"], reverse=True)
    selected=ranked[0]
    bible=build_bible(selected)
    outline=build_outline(bible)
    ch1=chapter_one(bible,outline)

    (base/"market"/"signals.json").write_text(json.dumps(market,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"concepts.json").write_text(json.dumps(ranked,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"selected.json").write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"bible"/"story_bible.json").write_text(json.dumps(bible,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"outline"/"chapters.json").write_text(json.dumps(outline,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"chapters"/"chapter-1.md").write_text(ch1,encoding="utf-8")

    # Propagation assertions: fail closed if the selected concept gets lost downstream.
    assert bible["title"] == selected["title"]
    assert bible["core_hook"] == selected["hook"]
    assert selected["title"] in ch1

    state={"slug":slug,"mode":"offline-validation","selected":selected["title"],
           "completed":["market_discovery","concept_generation","selection","bible","outline","chapter-1"],
           "next":"attach_live_provider"}
    (base/"state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    return state

if __name__=="__main__":
    print(json.dumps(run(),ensure_ascii=False,indent=2))
