import os, re, json
from pathlib import Path
from factory.ai_writer import config_from_env, generate

MIN_CHARS=3500
MAX_CHARS=4500

def clean(s):
    s=re.sub(r"^```.*?\n|\n```$","",s.strip(),flags=re.S)
    return s.strip()

def main():
    src=Path("books/live-gemini-pilot/chapters/chapter-1.md")
    if not src.exists(): raise SystemExit("SOURCE_CHAPTER_NOT_FOUND")
    original=src.read_text(encoding="utf-8")
    prompt=f"""당신은 한국 웹소설 상업 편집자다.
아래 1화를 3,500~4,500자 분량의 판매용 연재 원고로 재편집하라.
기존 사건, 인물, 핵심 미스터리와 결말 훅은 보존한다.
분량을 늘리기 위한 반복, 설명문, 메타 발언, AI투 문장을 금지한다.
감각 묘사, 행동, 대화, 불안의 단계적 상승으로 장면을 풍부하게 한다.
제목/해설 없이 소설 본문만 출력한다.

[원문]
{original}
"""
    cfg=config_from_env()
    text=clean(generate(cfg,prompt))
    issues=[]
    if len(text)<MIN_CHARS: issues.append("TOO_SHORT")
    if len(text)>MAX_CHARS: issues.append("TOO_LONG")
    for bad in ["다음 화","독자 여러분","AI","재편집"]:
        if bad in text: issues.append("META_OR_BAD_PHRASE:"+bad)
    out=Path("books/live-gemini-pilot/commercial")
    out.mkdir(parents=True,exist_ok=True)
    (out/"chapter-1.md").write_text(text,encoding="utf-8")
    report={"chars":len(text),"issues":issues,"gate":"PASS" if not issues else "BLOCK"}
    (out/"chapter-1-quality.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit("COMMERCIAL_GATE_BLOCKED")
if __name__=="__main__": main()
