import json
from factory.ai_writer import generate

def build_context_edit_prompt(text: str) -> str:
    return f"""당신은 한국 상업 웹소설의 최종 교정자다.
아래 원고의 사건, 인물, 정보, 장면 순서, 결말 훅은 절대 바꾸지 말고
오직 한국어 문장 품질만 교정하라.

반드시 고칠 것:
- 오타, 잘못 생성된 단어, 조사/어미 오류
- 부자연스러운 띄어쓰기
- 문맥상 성립하지 않는 단어 조합
- 같은 뜻의 중복 수식
- 번역투/기계적인 문장
- 문법은 맞지만 한국어 화자가 읽을 때 명백히 어색한 표현

금지:
- 새 사건/인물/설정 추가
- 사건 삭제
- 요약
- 분량을 의도적으로 늘리거나 줄이기
- 제목, 설명, 교정 코멘트 출력

특히 '이파인 잡음', '세세 명', '악성 악지형 고객'처럼
겉보기에는 한글이지만 문맥상 잘못 생성된 표현을 놓치지 마라.

원고 본문만 출력하라.

[원고]
{text}
"""

def contextual_edit(cfg, text: str) -> str:
    edited = generate(cfg, build_context_edit_prompt(text)).strip()
    if edited.startswith("```"):
        lines=edited.splitlines()
        if lines and lines[0].startswith("```"): lines=lines[1:]
        if lines and lines[-1].strip()=="```": lines=lines[:-1]
        edited="\n".join(lines).strip()
    return edited

def preservation_gate(before: str, after: str):
    issues=[]
    if not after:
        issues.append("EMPTY_CONTEXT_EDIT")
        return issues
    ratio=len(after)/max(1,len(before))
    if ratio < 0.88: issues.append("CONTEXT_EDIT_TOO_SHORT")
    if ratio > 1.12: issues.append("CONTEXT_EDIT_TOO_LONG")
    # Story anchors that must survive this episode.
    for anchor in ["강이현","중앙 고객센터","03:14:22"]:
        if anchor in before and anchor not in after:
            issues.append("LOST_ANCHOR:"+anchor)
    return issues
