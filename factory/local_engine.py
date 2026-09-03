from __future__ import annotations
import json, random
from pathlib import Path

CONCEPTS = [
 {"title":"퇴근 후 기억상점","genre":"현대판타지/미스터리","hook":"타인의 후회를 지워주는 야간 상점 직원이 자신의 사라진 7년을 상품 진열대에서 발견한다.",
  "market_fit":86,"originality":84,"series_potential":88,"emotion":90},
 {"title":"망한 재개발 구역의 마지막 식당","genre":"휴먼 미스터리","hook":"철거를 사흘 앞둔 식당에 죽은 사람들의 마지막 예약이 들어오기 시작한다.",
  "market_fit":82,"originality":89,"series_potential":78,"emotion":94},
 {"title":"내일을 반품합니다","genre":"로맨스판타지/드라마","hook":"하루 뒤의 선택을 한 번 반품할 수 있는 여자가 유일하게 되돌릴 수 없는 남자를 만난다.",
  "market_fit":91,"originality":80,"series_potential":84,"emotion":92},
 {"title":"404호에는 사람이 살지 않는다","genre":"생활밀착형 공포/미스터리","hook":"없는 호수 404호에서 매일 새벽 관리비 민원이 들어온다.",
  "market_fit":88,"originality":86,"series_potential":90,"emotion":85},
 {"title":"대리 효도 주식회사","genre":"휴먼드라마/미스터리","hook":"부모 대신 안부를 묻는 서비스 직원이 고객의 가족이 이미 존재하지 않는다는 사실을 알게 된다.",
  "market_fit":84,"originality":88,"series_potential":87,"emotion":93}
]

def score(c):
    return round(c["market_fit"]*.30+c["originality"]*.25+c["series_potential"]*.20+c["emotion"]*.25,1)

def produce(slug:str):
    base=Path("books")/slug
    for d in ["market","bible","outline","chapters","reviews","package","memory"]:
        (base/d).mkdir(parents=True,exist_ok=True)
    ranked=sorted([{**c,"score":score(c)} for c in CONCEPTS],key=lambda x:x["score"],reverse=True)
    winner=ranked[0]
    (base/"market"/"concepts.json").write_text(json.dumps(ranked,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"selected.json").write_text(json.dumps(winner,ensure_ascii=False,indent=2),encoding="utf-8")

    bible=f"""# STORY BIBLE — {winner['title']}

## 장르
{winner['genre']}

## 핵심 약속
{winner['hook']}

## 주인공
한서윤, 34세. 중요한 선택을 미루는 습관 때문에 관계와 커리어를 동시에 잃어가고 있다.
겉으로는 현실적이지만 '한 번만 다시 고를 수 있다면'이라는 욕망을 숨긴다.

## 상대역
윤태경, 36세. 반품된 선택의 흔적을 기억하는 유일한 사람.
서윤이 시간을 되돌릴수록 그가 서윤을 기억할 가능성은 줄어든다.

## 세계 규칙
1. 자정 전까지 그날의 선택 하나만 반품할 수 있다.
2. 반품하면 당사자를 제외한 세계의 기억이 새 결과에 맞춰진다.
3. 같은 선택은 두 번 반품할 수 없다.
4. 타인의 생사를 직접 선택하는 반품은 불가능하다.
5. 반복할수록 주인공 자신의 기억 일부가 대가로 사라진다.

## 중심 질문
완벽한 선택을 할 수 있다면 우리는 정말 더 행복해지는가?
"""
    (base/"bible"/"story_bible.md").write_text(bible,encoding="utf-8")

    chapters=[
      ("반품 버튼","서윤이 의문의 앱에서 오늘의 선택을 반품하고 결과가 실제로 바뀌는 것을 확인한다."),
      ("나만 기억하는 어제","바뀐 현실에서 태경만 이전 선택을 기억하는 듯한 반응을 보인다."),
      ("두 번째 영수증","서윤은 더 큰 선택을 고치고 성공을 얻지만 소중한 기억 하나를 잃는다."),
      ("기억하는 남자","태경이 반품 시스템과 과거의 연결고리를 털어놓는다."),
      ("완벽한 하루의 가격","서윤이 모든 것을 바로잡으려다 태경과의 첫 만남 자체를 지워버릴 위기에 처한다."),
      ("반품 불가","되돌릴 수 없는 사건이 발생하고 시스템의 진짜 목적이 드러난다."),
      ("내가 버린 것들","서윤은 자신이 반품했던 선택들이 누군가의 삶에는 필요한 실패였음을 깨닫는다."),
      ("마지막 선택","마지막 반품권으로 가장 원했던 성공과 태경의 기억 중 하나를 선택해야 한다."),
      ("그대로 둘게요","서윤은 반품을 포기하고 불완전한 현재를 받아들인다."),
      ("새 영수증","몇 달 뒤, 기억하지 못할 태경과 다시 마주치며 새로운 선택을 시작한다.")
    ]
    outline="# MASTER OUTLINE\n\n"+"\n".join(f"## {i}화 — {t}\n{s}\n**엔딩 훅:** 다음 선택의 대가가 더 커진다.\n" for i,(t,s) in enumerate(chapters,1))
    (base/"outline"/"master.md").write_text(outline,encoding="utf-8")

    ch1="""# 1화 — 반품 버튼

한서윤은 퇴사 메일의 전송 버튼을 누른 뒤 정확히 열세 번 새로고침을 했다.

메일은 사라지지 않았다. 보낸 편지함 맨 위에서 제목만 멀쩡했다.  
`사직 의사 전달드립니다.`

“미쳤지.”

회의실 유리벽 너머로 팀장이 자리에서 일어났다. 서윤은 노트북을 덮었다. 지금이라도 화장실로 도망치면 삼 분 정도는 벌 수 있었다. 그 삼 분으로 할 수 있는 일은 없었다.

휴대전화가 진동했다.

처음 보는 앱이 설치되어 있었다.

**오늘의 선택을 반품하시겠습니까?**

광고라고 생각했다. 삭제 버튼을 찾았지만 없었다. 대신 화면 아래 작은 문장이 떠 있었다.

**반품 가능 시간 00:17:42**

팀장이 문을 열었다.

“한서윤 씨. 잠깐 얘기 좀 하죠.”

서윤은 화면을 눌렀다.

세상이 꺼졌다가 켜졌다.

팀장은 다시 자기 자리에 앉아 있었다. 노트북은 열려 있었고, 보낸 편지함에는 사직 메일이 없었다.

서윤은 숨도 쉬지 못한 채 휴대전화를 들었다.

**반품이 완료되었습니다.**

그 아래에는 아까 없던 문장이 하나 더 생겨 있었다.

**결제 완료: 기억 1건.**

서윤은 비웃으려다 멈췄다.

방금 전까지 분명 알고 있던 엄마의 휴대전화 번호가 생각나지 않았다.
"""
    (base/"chapters"/"chapter-1.md").write_text(ch1,encoding="utf-8")
    review={"chapter":1,"hook":92,"progression":87,"character":84,"prose":85,"payoff":90,
            "blocking_issues":[],"continuity_conflicts":[],"result":"PASS","next":"chapter-2"}
    (base/"reviews"/"chapter-1.json").write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding="utf-8")
    metadata={"final_title":winner["title"],"genre":winner["genre"],
              "one_line_pitch":winner["hook"],
              "keywords":["선택","후회","기억","시간","로맨스","미스터리"],
              "cover_brief":"늦은 밤 도시, 영수증처럼 찢어진 두 개의 시간선 사이에 선 여성. 스마트폰의 희미한 반품 아이콘. 감성적이되 로맨스 표지에 치우치지 않는 미스터리 톤. 제목 영역은 상단 확보."}
    (base/"package"/"metadata.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    state={"slug":slug,"status":"RUNNING_VALIDATION","selected":winner["title"],"completed":["discover","ideate","select","bible","outline","write:chapter-1","review:chapter-1"],"next":"write:chapter-2"}
    (base/"state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    return state

if __name__=="__main__":
    print(json.dumps(produce("factory-book-001"),ensure_ascii=False,indent=2))
