import re, json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate
from factory.independent_reviewer import review

MIN_CHARS=3500
MAX_CHARS=4500
TARGET_MIN=3700

def clean(s):
    s=re.sub(r"^```.*?\n|\n```$","",s.strip(),flags=re.S)
    return s.strip()

def make_prompt(original):
    return f"""당신은 한국 웹소설 상업 편집자다.
아래 1화를 판매용 연재 원고로 재편집하라.
한국어 3,700~4,200자를 목표로 한다. 기존 사건/인물/미스터리/결말 훅은 보존한다.
반복, 메타 발언, 비정상 단어를 금지하고 자연스러운 한국어 본문만 출력한다.
[원문]
{original}"""

def expansion_prompt(text):
    return f"""아래 원고를 사건과 결말을 바꾸지 않고 3,500~4,500자 사이로 자연스럽게 확장하라.
반복/요약/메타 설명 없이 본문 전체만 출력하라.
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
    if len(text)<MIN_CHARS: issues.append("TOO_SHORT")
    if len(text)>MAX_CHARS: issues.append("TOO_LONG")
    issues.extend(scan_text(text))
    issues.extend(f"{x.code}:{x.phrase}" for x in scan_korean_editor(text))
    return sorted(set(issues))

def main():
    src=Path("books/live-gemini-pilot/chapters/chapter-1.md")
    if not src.exists(): raise SystemExit("SOURCE_CHAPTER_NOT_FOUND")
    cfg=config_from_env()
    text=clean(generate(cfg,make_prompt(src.read_text(encoding="utf-8"))))
    generation_passes=1
    if len(text)<MIN_CHARS:
        text=clean(generate(cfg,expansion_prompt(text))); generation_passes=2

    pre_context=text
    text=clean(contextual_edit(cfg,text))
    preservation=preservation_gate(pre_context,text)
    text=apply_safe_fixes(text)

    review1=review(cfg,text)
    repair_passes=0
    if review1:
        before_repair=text
        text=clean(generate(cfg,repair_prompt(text,review1)))
        repair_passes=1
        preservation += preservation_gate(before_repair,text)
        text=apply_safe_fixes(text)

    review2=review(cfg,text)
    issues=sorted(set(preservation + deterministic_issues(text)))
    if review2: issues.append("INDEPENDENT_REVIEW_BLOCK")

    out=Path("books/live-gemini-pilot/commercial"); out.mkdir(parents=True,exist_ok=True)
    (out/"chapter-1.md").write_text(text,encoding="utf-8")
    report={
        "chars":len(text),
        "generation_passes":generation_passes,
        "context_editor_passes":1,
        "independent_review_passes":2 if review1 else 1,
        "repair_passes":repair_passes,
        "first_review_issues":review1,
        "final_review_issues":review2,
        "issues":issues,
        "independent_reviewer":"PASS" if not review2 else "BLOCK",
        "gate":"PASS" if not issues else "BLOCK",
    }
    (out/"chapter-1-quality.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit("COMMERCIAL_GATE_BLOCKED")

if __name__=="__main__": main()
