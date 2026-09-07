import os,re,json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate
from factory.independent_reviewer import review
from factory.lexical_preflight import scan_lexical, apply_lexical_fixes

BOOK=Path('books/live-gemini-pilot')
MIN_VISIBLE_CHARS=3500; TARGET_VISIBLE_MIN=3700; TARGET_VISIBLE_MAX=4200; MAX_VISIBLE_CHARS=4400
MAX_EXPANSION_PASSES=5; MAX_CONTRACTION_PASSES=4; MAX_REPAIR_PASSES=2; MAX_CONTINUITY_REVIEW_ATTEMPTS=2
EP3_LOCK='''3화는 반드시 2화의 마지막 직후에서 시작한다. 확정 연속성: 예약 통화 시각 03:30, 발신자 강이현, 발신 위치 7층 비상구 내부. CCTV에는 강이현과 같은 옷을 입은 검은 그림자/도플갱어가 구조된 여성 뒤에 있었고 카메라를 향해 목을 긋는 동작을 했다. 첫 규칙은 비정상 전화를 해결하면 현실의 빚 상환이 발생할 수 있다는 것. 이 사실들을 리셋하거나 꿈/착각으로 무효화하지 마라.'''

def clean(s):
    s=re.sub(r'^```.*?\n|\n```$','',s.strip(),flags=re.S); return s.strip()
def visible_chars(text): return len(re.sub(r'\s+','',text))

def load_context(episode):
    if episode<3 or episode>10: raise ValueError('EPISODE must be 3..10')
    previous=[]
    for n in range(1,episode):
        p=BOOK/f'commercial/chapter-{n}.md'
        if not p.exists(): raise FileNotFoundError(f'MISSING_PREVIOUS_CHAPTER:{n}')
        previous.append((n,p.read_text(encoding='utf-8')))
    bible=json.loads((BOOK/'bible/story_bible.json').read_text(encoding='utf-8'))
    outline=json.loads((BOOK/'outline/chapters.json').read_text(encoding='utf-8'))
    ep=next(x for x in outline if x.get('chapter')==episode)
    mp=BOOK/'memory/state.json'; memory=json.loads(mp.read_text(encoding='utf-8')) if mp.exists() else {}
    return previous,bible,ep,memory

def context_text(previous):
    return '\n\n'.join(f'[발행/고정 {n}화]\n{text}' for n,text in previous)

def make_prompt(episode,previous,bible,ep,memory):
    locks=EP3_LOCK if episode==3 else '이전 고정 원고들의 확정 사실과 인과관계를 임의 변경하지 마라. 바로 직전 화의 마지막 훅에서 자연스럽게 이어라. 강이현의 야간 콜센터 상담 경력은 2개월로 고정한다.'
    return f'''당신은 한국 상업 웹소설 작가다. 작품은 '자정 이후의 콜센터'다. 지금부터 {episode}화를 쓴다.
이전 회차를 다시 쓰거나 요약하지 마라. {locks}
이번 화 아웃라인: {json.dumps(ep,ensure_ascii=False)}
작품 중심: 야간 콜센터의 초현실 사건을 평범한 상담 기술로 해결하고, 해결에는 반드시 인물적 비용이 따른다.
장기 미스터리와 회차 사건을 동시에 전진시켜라. 모든 비밀을 한 번에 설명하지 마라.
주인공 강이현(35), 약 8천만원의 빚, 야간 중앙 콜센터, 7층, 7번 단말기, 03:14:22의 핵심 단서를 유지한다.
공백/줄바꿈 제외 {TARGET_VISIBLE_MIN}~{TARGET_VISIBLE_MAX}자 목표. 반복/같은 감정 재서술/장황한 풍경/메타 발언 금지.
행동/대화/갈등/단서/선택으로 전진시켜라. 마지막은 다음 화를 누르게 만드는 구체적 위험/정보/선택으로 끝내라. 본문만 출력.
[스토리 바이블]{json.dumps(bible,ensure_ascii=False)}
[기존 메모리]{json.dumps(memory,ensure_ascii=False)}
{context_text(previous)}'''

def expansion_prompt(episode,text):
    current=visible_chars(text); need=max(0,TARGET_VISIBLE_MIN-current)
    return f'''아래 {episode}화 원고는 현재 공백/줄바꿈 제외 약 {current}자다. 기존 문장을 요약하거나 삭제하지 말고 최소 {need+300}자 분량의 실질 내용을 추가하여 최종 {TARGET_VISIBLE_MIN}~{TARGET_VISIBLE_MAX}자로 확장하라. 기존 사건 순서와 결말 훅 유지. 반복/재진술/풍경 늘이기 금지. 행동, 대화, 단서, 선택, 갈등의 구체적 장면만 보강한다. 원고 전체만 출력.\n[원고]\n{text}'''
def contraction_prompt(episode,text):
    return f'''아래 {episode}화 원고를 핵심 사건/단서/인과/결말 훅을 유지하며 공백/줄바꿈 제외 {TARGET_VISIBLE_MIN}~{TARGET_VISIBLE_MAX}자로 압축하라. 중복만 제거하고 새 설정 추가 금지. 원고 전체만 출력.\n[원고]\n{text}'''
def repair_prompt(episode,text,issues):
    return f'''한국 상업 웹소설 {episode}화 최종 교정이다. 아래 오류만 최소한으로 고쳐라. 사건/설정/문단순서/결말 훅 변경 금지. 원고 전체만 출력.\n검수 오류:{json.dumps(issues,ensure_ascii=False)}\n[원고]{text}'''

def parse_continuity_review(raw,text):
    candidate=clean(raw); decoder=json.JSONDecoder()
    for m in re.finditer(r'\{',candidate):
        try: obj,_=decoder.raw_decode(candidate[m.start():])
        except json.JSONDecodeError: continue
        if not isinstance(obj,dict) or 'issues' not in obj: continue
        xs=obj.get('issues',[])
        if not isinstance(xs,list): raise ValueError('issues must be list')
        return [x for x in xs if isinstance(x,dict) and x.get('phrase') and x['phrase'] in text]
    raise ValueError('no valid continuity JSON')

def continuity_review(cfg,episode,previous,text):
    prompt=f'''웹소설 연속성 검수자다. 이전 고정 원고와 {episode}화를 비교해 명백한 설정 충돌만 찾는다. 취향/문체/속도는 평가하지 않는다. 인물, 나이, 직업, 부채, 장소, 시간, 사건 결과, 이미 확정된 규칙, 직전 화 훅과의 모순만 지적한다. 반드시 JSON 객체 하나만 출력: {{"issues":[{{"phrase":"현재 화 실제 문구","reason":"충돌 이유"}}]}}. 없으면 {{"issues":[]}}.\n{context_text(previous)}\n[현재 {episode}화]\n{text}'''
    last=None
    for _ in range(MAX_CONTINUITY_REVIEW_ATTEMPTS):
        raw=generate(cfg,prompt)
        try: return parse_continuity_review(raw,text)
        except Exception as exc:
            last=exc; prompt+='\n직전 출력 파싱 실패. 다른 말 없이 JSON만 다시 출력.'
    return [{'phrase':'CONTINUITY_REVIEW_PARSE_FAILED','reason':str(last)}]

def deterministic_issues(text):
    issues=[]; vc=visible_chars(text)
    if vc<MIN_VISIBLE_CHARS: issues.append(f'TOO_SHORT_VISIBLE:{vc}')
    if vc>MAX_VISIBLE_CHARS: issues.append(f'TOO_LONG_VISIBLE:{vc}')
    issues.extend(scan_text(text)); issues.extend(f'{x.code}:{x.phrase}' for x in scan_korean_editor(text)); issues.extend(f"{x['code']}:{x['phrase']}" for x in scan_lexical(text))
    return sorted(set(issues))

def main():
    episode=int(os.environ.get('EPISODE','3')); previous,bible,ep,memory=load_context(episode); cfg=config_from_env()
    text=clean(generate(cfg,make_prompt(episode,previous,bible,ep,memory))); generation_passes=1; expansion_passes=contraction_passes=repair_passes=0
    while visible_chars(text)<TARGET_VISIBLE_MIN and expansion_passes<MAX_EXPANSION_PASSES:
        candidate=clean(generate(cfg,expansion_prompt(episode,text))); expansion_passes+=1; generation_passes+=1
        if visible_chars(candidate)>visible_chars(text): text=candidate
    while visible_chars(text)>MAX_VISIBLE_CHARS and contraction_passes<MAX_CONTRACTION_PASSES:
        candidate=clean(generate(cfg,contraction_prompt(episode,text))); contraction_passes+=1; generation_passes+=1
        if MIN_VISIBLE_CHARS<=visible_chars(candidate)<visible_chars(text): text=candidate
    before=text; text=clean(contextual_edit(cfg,text)); preservation=preservation_gate(before,text)
    lexical_before=scan_lexical(text); text=apply_lexical_fixes(apply_safe_fixes(text)); review_now=review(cfg,text)
    while review_now and repair_passes<MAX_REPAIR_PASSES:
        before=text; text=clean(generate(cfg,repair_prompt(episode,text,review_now))); preservation+=preservation_gate(before,text); text=apply_lexical_fixes(apply_safe_fixes(text)); repair_passes+=1; review_now=review(cfg,text)
    continuity=continuity_review(cfg,episode,previous,text); lexical_after=scan_lexical(text); issues=sorted(set(preservation+deterministic_issues(text)))
    if review_now: issues.append('INDEPENDENT_REVIEW_BLOCK')
    if continuity: issues.append('CONTINUITY_REVIEW_BLOCK')
    out=BOOK/'commercial'; out.mkdir(parents=True,exist_ok=True); (out/f'chapter-{episode}.md').write_text(text,encoding='utf-8')
    report={'episode':episode,'chars_with_spaces':len(text),'chars_without_whitespace':visible_chars(text),'target_chars_without_whitespace':[TARGET_VISIBLE_MIN,TARGET_VISIBLE_MAX],'generation_passes':generation_passes,'expansion_passes':expansion_passes,'contraction_passes':contraction_passes,'repair_passes':repair_passes,'lexical_preflight_detected':lexical_before,'lexical_preflight_final':lexical_after,'final_review_issues':review_now,'continuity_issues':continuity,'issues':issues,'lexical_preflight':'PASS' if not lexical_after else 'BLOCK','independent_reviewer':'PASS' if not review_now else 'BLOCK','continuity_reviewer':'PASS' if not continuity else 'BLOCK','gate':'PASS' if not issues else 'BLOCK','publication_state':'DRAFT_REVIEWED'}
    (out/f'chapter-{episode}-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(report,ensure_ascii=False))
    if issues: raise SystemExit(f'EPISODE_{episode}_GATE_BLOCKED')
if __name__=='__main__': main()