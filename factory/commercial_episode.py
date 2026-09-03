import re, json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate
from factory.independent_reviewer import review
from factory.lexical_preflight import scan_lexical, apply_lexical_fixes

MIN_VISIBLE_CHARS=3500
TARGET_VISIBLE_MIN=3700
TARGET_VISIBLE_MAX=4200
MAX_VISIBLE_CHARS=4400

def clean(s):
    s=re.sub(r"^```.*?\n|\n```$","",s.strip(),flags=re.S)
    return s.strip()

def visible_chars(text):
    # NovelPia-style safety metric: exclude whitespace from the count.
    return len(re.sub(r"\s+","",text))

def make_prompt(original):
    return f"""당신은 한국 웹소설 상업 편집자다.
아래 원고를 판매용 연재 원고로 재편집하라.
최종 분량은 반드시 공백/줄바꿈을 제외한 순수 한국어 글자수 {TARGET_VISIBLE_MIN:,}~{TARGET_VISIBLE_MAX:,}자를 목표로 한다.
분량을 채우기 위한 반복, 같은 의미의 재진술, 불필요한 회상, 장황한 풍경 묘사를 금지한다.
대신 사건 진행, 행동, 대화, 긴장, 단서, 인물의 선택과 반응으로 분량을 확보한다.
기존 사건/인물/미스터리/결말 훅은 보존한다.
메타 발언과 비정상 단어를 금지하고 자연스러운 한국어 본문만 출력한다.
[원문]
{original}"""

def expansion_prompt(text):
    return f"""아래 한국 웹소설 원고는 분량이 부족하다.
공백/줄바꿈 제외 글자수 {TARGET_VISIBLE_MIN:,}~{TARGET_VISIBLE_MAX:,}자가 되도록 자연스럽게 확장하라.
사건과 결말 훅은 바꾸지 마라.
단순 반복, 문장 늘이기, 같은 감정 재서술, 의미 없는 묘사로 글자수를 채우지 마라.
새 분량은 행동/대화/갈등/단서/상황 변화처럼 실제 서사를 전진시키는 내용으로만 확보하라.
본문 전체만 출력하라.
{text}"""

def repair_prompt(text, issues):
    return f"""한국 상업 웹소설 최종 교정이다.
아래 검수 오류만 최소한으로 고쳐라. 사건, 설정, 문단 순서, 결말은 바꾸지 마라.
원고 전체를 출력하되 검수되지 않은 내용을 임의로 재창작하지 마라.
검수 오류:
{json.dumps(issues,ensure_ascii=False)}
[원고]
{text}"""

def deterministic_issues(text):
    issues=[]
    vc=visible_chars(text)
    if vc<MIN_VISIBLE_CHARS: issues.append(f"TOO_SHORT_VISIBLE:{vc}")
    if vc>MAX_VISIBLE_CHARS: issues.append(f"TOO_LONG_VISIBLE:{vc}")
    issues.extend(scan_text(text))
    issues.extend(f"{x.code}:{x.phrase}" for x in scan_korean_editor(text))
    issues.extend(f"{x['code']}:{x['phrase']}" for x in scan_lexical(text))
    return sorted(set(issues))

def main():
    src=Path("books/live-gemini-pilot/chapters/chapter-1.md")
    if not src.exists(): raise SystemExit("SOURCE_CHAPTER_NOT_FOUND")
    cfg=config_from_env()
    text=clean(generate(cfg,make_prompt(src.read_text(encoding="utf-8"))))
    generation_passes=1
    if visible_chars(text)<MIN_VISIBLE_CHARS:
        text=clean(generate(cfg,expansion_prompt(text))); generation_passes=2

    pre_context=text
    text=clean(contextual_edit(cfg,text))
    preservation=preservation_gate(pre_context,text)

    lexical_before=scan_lexical(text)
    text=apply_lexical_fixes(text)
    text=apply_safe_fixes(text)

    review1=review(cfg,text)
    repair_passes=0
    if review1:
        before_repair=text
        text=clean(generate(cfg,repair_prompt(text,review1)))
        repair_passes=1
        preservation += preservation_gate(before_repair,text)
        text=apply_lexical_fixes(apply_safe_fixes(text))

    review2=review(cfg,text)
    lexical_after=scan_lexical(text)
    issues=sorted(set(preservation + deterministic_issues(text)))
    if review2: issues.append("INDEPENDENT_REVIEW_BLOCK")

    out=Path("books/live-gemini-pilot/commercial"); out.mkdir(parents=True,exist_ok=True)
    (out/"chapter-1.md").write_text(text,encoding="utf-8")
    report={
        "chars_with_spaces":len(text),
        "chars_without_whitespace":visible_chars(text),
        "platform_min_chars_without_whitespace":MIN_VISIBLE_CHARS,
        "target_chars_without_whitespace":[TARGET_VISIBLE_MIN,TARGET_VISIBLE_MAX],
        "generation_passes":generation_passes,
        "context_editor_passes":1,
        "lexical_preflight_detected":lexical_before,
        "lexical_preflight_final":lexical_after,
        "independent_review_passes":2,
        "repair_passes":repair_passes,
        "first_review_issues":review1,
        "final_review_issues":review2,
        "issues":issues,
        "lexical_preflight":"PASS" if not lexical_after else "BLOCK",
        "independent_reviewer":"PASS" if not review2 else "BLOCK",
        "gate":"PASS" if not issues else "BLOCK",
    }
    (out/"chapter-1-quality.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit("COMMERCIAL_GATE_BLOCKED")

if __name__=="__main__": main()
