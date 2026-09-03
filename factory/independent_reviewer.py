import json
from factory.ai_writer import generate

def build_review_prompt(text: str) -> str:
    return f"""당신은 한국 상업 웹소설의 독립 최종 검수자다.
아래 원고를 수정하지 말고 오류만 찾아라.

찾을 것:
- 붙어버린 단어/문장 (예: '곰팡내구역질')
- 오타, 잘못 생성된 한국어 단어
- 조사/어미/호응 오류
- 문맥상 의미가 성립하지 않는 표현
- 중복 수식, 기계 번역투
- 비정상 문자

소설의 취향, 전개, 문체는 평가하지 마라.
명백한 오류만 보고하라.

반드시 JSON 하나만 출력:
{{"issues":[{{"phrase":"원문의 문제 구절","reason":"짧은 이유","suggestion":"최소 수정안"}}]}}
오류가 없으면 {{"issues":[]}}.

[원고]
{text}
"""

def _json_only(raw: str):
    s=raw.strip()
    if s.startswith("```"):
        lines=s.splitlines()
        lines=lines[1:] if lines else lines
        if lines and lines[-1].strip()=="```": lines=lines[:-1]
        s="\n".join(lines).strip()
    a=s.find("{"); b=s.rfind("}")
    if a<0 or b<a: raise ValueError("REVIEWER_NON_JSON")
    return json.loads(s[a:b+1])

def review(cfg, text: str):
    data=_json_only(generate(cfg, build_review_prompt(text)))
    issues=data.get("issues",[])
    if not isinstance(issues,list): raise ValueError("REVIEWER_BAD_SCHEMA")
    clean=[]
    for x in issues:
        if not isinstance(x,dict): continue
        phrase=str(x.get("phrase","")).strip()
        if phrase and phrase in text:
            clean.append({
                "phrase":phrase,
                "reason":str(x.get("reason","")).strip(),
                "suggestion":str(x.get("suggestion","")).strip(),
            })
    return clean
