import re, json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate

MIN_CHARS=3500
MAX_CHARS=4500
TARGET_MIN=3700
TARGET_MAX=4200

def clean(s):
    s=re.sub(r"^```.*?\n|\n```$","",s.strip(),flags=re.S)
    return s.strip()

def make_prompt(original):
    return f"""당신은 한국 웹소설 상업 편집자다.
아래 1화를 판매용 연재 원고로 재편집하라.
반드시 한국어 문자 수 3,700~4,200자 안에서 완결된 1화 본문을 출력하라.
기존 사건, 인물, 핵심 미스터리와 결말 훅은 보존한다.
분량을 늘리기 위한 반복/설명문/메타 발언/AI투 문장을 금지한다.
감각 묘사, 행동, 대화, 불안의 단계적 상승으로 장면을 풍부하게 한다.
한국어 본문에 비정상 문자나 잘못 생성된 단어를 섞지 않는다.
제목/해설 없이 소설 본문만 출력한다.

[원문]
{original}
"""

def expansion_prompt(text, need):
    return f"""아래 웹소설 1화는 현재 약 {len(text)}자다.
핵심 사건과 결말을 바꾸지 말고 최소 {need}자 이상 자연스럽게 확장하여
최종 3,500~4,500자 사이의 본문 전체를 다시 출력하라.
새 사건을 억지로 만들지 말고 장면 행동, 대화, 감각, 긴장 상승을 보강하라.
같은 뜻 반복, 요약, 메타 설명, 제목은 금지한다.
[현재 본문]
{text}
"""

def check(text):
    issues=[]
    if len(text)<MIN_CHARS: issues.append("TOO_SHORT")
    if len(text)>MAX_CHARS: issues.append("TOO_LONG")
    for bad in ["다음 화","독자 여러분","재편집"]:
        if bad in text: issues.append("META_OR_BAD_PHRASE:"+bad)
    issues.extend(scan_text(text))
    issues.extend(f"{x.code}:{x.phrase}" for x in scan_korean_editor(text))
    return sorted(set(issues))

def main():
    src=Path("books/live-gemini-pilot/chapters/chapter-1.md")
    if not src.exists(): raise SystemExit("SOURCE_CHAPTER_NOT_FOUND")
    original=src.read_text(encoding="utf-8")
    cfg=config_from_env()

    text=clean(generate(cfg,make_prompt(original)))
    generation_passes=1
    if len(text)<MIN_CHARS:
        text=clean(generate(cfg,expansion_prompt(text,TARGET_MIN-len(text))))
        generation_passes=2

    before_context=text
    text=clean(contextual_edit(cfg,text))
    preservation_issues=preservation_gate(before_context,text)
    text=apply_safe_fixes(text)
    issues=sorted(set(preservation_issues + check(text)))

    out=Path("books/live-gemini-pilot/commercial")
    out.mkdir(parents=True,exist_ok=True)
    (out/"chapter-1.md").write_text(text,encoding="utf-8")
    report={
        "chars":len(text),
        "generation_passes":generation_passes,
        "context_editor_passes":1,
        "preservation_ratio":round(len(text)/max(1,len(before_context)),4),
        "issues":issues,
        "context_editor":"PASS" if not preservation_issues else "BLOCK",
        "final_editor":"PASS" if not issues else "BLOCK",
        "gate":"PASS" if not issues else "BLOCK",
    }
    (out/"chapter-1-quality.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit("COMMERCIAL_GATE_BLOCKED")

if __name__=="__main__":
    main()
