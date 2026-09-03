import re, json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate
from factory.independent_reviewer import review
from factory.lexical_preflight import scan_lexical, apply_lexical_fixes

BOOK=Path("books/live-gemini-pilot"); EPISODE=2
MIN_VISIBLE_CHARS=3500; TARGET_VISIBLE_MIN=3700; TARGET_VISIBLE_MAX=4200; MAX_VISIBLE_CHARS=4400
MAX_EXPANSION_PASSES=3

def clean(s):
    s=re.sub(r"^```.*?\n|\n```$","",s.strip(),flags=re.S); return s.strip()

def visible_chars(text): return len(re.sub(r"\s+","",text))

def load_context():
    c1=(BOOK/"commercial/chapter-1.md").read_text(encoding="utf-8")
    bible=json.loads((BOOK/"bible/story_bible.json").read_text(encoding="utf-8"))
    outline=json.loads((BOOK/"outline/chapters.json").read_text(encoding="utf-8"))
    ep=next(x for x in outline if x.get("chapter")==EPISODE)
    mp=BOOK/"memory/state.json"; memory=json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {}
    return c1,bible,ep,memory

def make_prompt(c1,bible,ep,memory):
    return f"""당신은 한국 상업 웹소설 작가다. 작품은 '자정 이후의 콜센터'다. 지금부터 2화를 쓴다.
1화를 다시 쓰거나 요약하지 마라. 1화 마지막 직후에서 자연스럽게 이어라.
주인공/직장/부채/7층/7번 단말기/03:14:22 CCTV/수상한 전화 등 확정 사실을 임의 변경하지 마라.
2화 핵심 목표는 '우연이라 생각했던 현상이 반복되며 첫 번째 규칙을 확인한다'이다.
이번 화에서 모든 미스터리를 설명하지 말고 확인 가능한 규칙 하나를 사건으로 보여라.
마지막은 다음 화를 누르게 만드는 구체적인 새 정보나 위험으로 끝내라.
공백/줄바꿈 제외 {TARGET_VISIBLE_MIN}~{TARGET_VISIBLE_MAX}자 목표.
분량용 반복/같은 감정 재서술/장황한 풍경/메타 발언 금지.
행동/대화/갈등/단서/선택으로 서사를 전진시켜라. 본문만 출력.
[2화 아웃라인]{json.dumps(ep,ensure_ascii=False)}
[스토리 바이블]{json.dumps(bible,ensure_ascii=False)}
[기존 메모리]{json.dumps(memory,ensure_ascii=False)}
[발행된 1화]
{c1}"""

def expansion_prompt(text):
    current=visible_chars(text)
    need=max(0,TARGET_VISIBLE_MIN-current)
    return f"""아래 2화 원고는 현재 공백/줄바꿈 제외 {current}자다.
최종 원고를 공백/줄바꿈 제외 {TARGET_VISIBLE_MIN}~{TARGET_VISIBLE_MAX}자로 확장하라.
최소 {need}자 이상을 실질적인 새 서사로 보강해야 한다.
기존 원고를 축약하거나 삭제해서는 안 된다. 기존 사건 순서와 결말 훅을 유지한다.
추가 분량은 행동/대화/긴장 상승/새 단서/인물의 선택과 결과로만 만든다.
같은 감정 반복, 같은 정보 재진술, 풍경 늘이기, 요약문, 메타 발언은 금지한다.
본문 전체만 출력한다.
[현재 원고]
{text}"""

def repair_prompt(text,issues):
    return f"""한국 상업 웹소설 2화 최종 교정이다. 아래 오류만 최소한으로 고쳐라.
사건/설정/문단순서/결말 훅을 바꾸지 마라. 원고 전체만 출력한다.
검수 오류:{json.dumps(issues,ensure_ascii=False)}
[원고]{text}"""

def continuity_review(cfg,c1,text):
    prompt=f"""웹소설 연속성 검수자다. 1화와 2화를 비교해 명백한 설정 충돌만 찾는다.
취향/문체/속도는 평가하지 않는다. 인물/직책/나이/부채/장소/시간/CCTV 03:14:22/7번 단말기/전화 사건의 확정 사실 모순,
1화에 없던 일을 이미 있었던 일처럼 전제하는 오류, 불가능한 시간·장소 이동만 지적한다.
JSON만 출력: {{"issues":[{{"phrase":"2화의 실제 문구","reason":"충돌 이유"}}]}}
없으면 {{"issues":[]}}.
[1화]{c1}
[2화]{text}"""
    raw=clean(generate(cfg,prompt))
    try:
        obj=json.loads(raw[raw.find("{"):raw.rfind("}")+1]); xs=obj.get("issues",[])
        return [x for x in xs if isinstance(x,dict) and x.get("phrase") and x["phrase"] in text]
    except Exception:
        return [{"phrase":"CONTINUITY_REVIEW_PARSE_FAILED","reason":"review JSON parse failed"}]

def deterministic_issues(text):
    issues=[]; vc=visible_chars(text)
    if vc<MIN_VISIBLE_CHARS: issues.append(f"TOO_SHORT_VISIBLE:{vc}")
    if vc>MAX_VISIBLE_CHARS: issues.append(f"TOO_LONG_VISIBLE:{vc}")
    issues.extend(scan_text(text))
    issues.extend(f"{x.code}:{x.phrase}" for x in scan_korean_editor(text))
    issues.extend(f"{x['code']}:{x['phrase']}" for x in scan_lexical(text))
    return sorted(set(issues))

def main():
    c1,bible,ep,memory=load_context(); cfg=config_from_env()
    text=clean(generate(cfg,make_prompt(c1,bible,ep,memory))); generation_passes=1
    expansion_passes=0
    while visible_chars(text)<MIN_VISIBLE_CHARS and expansion_passes<MAX_EXPANSION_PASSES:
        before_expand=text
        candidate=clean(generate(cfg,expansion_prompt(text)))
        expansion_passes += 1
        generation_passes += 1
        # Never accept an "expansion" that shrinks the manuscript.
        if visible_chars(candidate) <= visible_chars(before_expand):
            continue
        text=candidate
    before=text; text=clean(contextual_edit(cfg,text)); preservation=preservation_gate(before,text)
    lexical_before=scan_lexical(text); text=apply_lexical_fixes(apply_safe_fixes(text))
    review1=review(cfg,text); repair_passes=0
    if review1:
        before=text; text=clean(generate(cfg,repair_prompt(text,review1)))
        preservation += preservation_gate(before,text); text=apply_lexical_fixes(apply_safe_fixes(text)); repair_passes=1
    review2=review(cfg,text); continuity=continuity_review(cfg,c1,text); lexical_after=scan_lexical(text)
    issues=sorted(set(preservation+deterministic_issues(text)))
    if review2: issues.append("INDEPENDENT_REVIEW_BLOCK")
    if continuity: issues.append("CONTINUITY_REVIEW_BLOCK")
    out=BOOK/"commercial"; out.mkdir(parents=True,exist_ok=True)
    (out/"chapter-2.md").write_text(text,encoding="utf-8")
    report={"episode":2,"chars_with_spaces":len(text),"chars_without_whitespace":visible_chars(text),
      "platform_min_chars_without_whitespace":MIN_VISIBLE_CHARS,"target_chars_without_whitespace":[TARGET_VISIBLE_MIN,TARGET_VISIBLE_MAX],
      "generation_passes":generation_passes,"expansion_passes":expansion_passes,"repair_passes":repair_passes,
      "lexical_preflight_detected":lexical_before,"lexical_preflight_final":lexical_after,
      "first_review_issues":review1,"final_review_issues":review2,"continuity_issues":continuity,"issues":issues,
      "lexical_preflight":"PASS" if not lexical_after else "BLOCK",
      "independent_reviewer":"PASS" if not review2 else "BLOCK","continuity_reviewer":"PASS" if not continuity else "BLOCK",
      "gate":"PASS" if not issues else "BLOCK"}
    (out/"chapter-2-quality.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit("EPISODE_2_GATE_BLOCKED")
if __name__=="__main__": main()
