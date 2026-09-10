import os,re,json
from pathlib import Path
from factory.ai_writer import config_from_env, generate
from factory.text_hygiene import scan_text
from factory.korean_editor import apply_safe_fixes, scan_korean_editor
from factory.context_editor import contextual_edit, preservation_gate
from factory.independent_reviewer import review
from factory.lexical_preflight import scan_lexical, apply_lexical_fixes

BOOK=Path('books/live-gemini-pilot')
OUTLINE=BOOK/'outline/final_arc_11_15.json'
MIN_VISIBLE=3500; TARGET_MIN=3700; TARGET_MAX=4200; MAX_VISIBLE=4400
MAX_EXPAND=4; MAX_CONTRACT=3; MAX_REPAIR=2; MAX_FULL_ATTEMPTS=2

def clean(s):
    s=re.sub(r'^```.*?\n|\n```$','',str(s).strip(),flags=re.S)
    return s.strip()

def visible(s): return len(re.sub(r'\s+','',s))

def previous_context(ep):
    items=[]
    for n in range(1,ep):
        p=BOOK/f'commercial/chapter-{n}.md'
        if not p.exists(): raise FileNotFoundError(f'MISSING_PREVIOUS_CHAPTER:{n}')
        items.append((n,p.read_text(encoding='utf-8')))
    return items

def context_text(items,limit=None):
    use=items[-limit:] if limit else items
    return '\n\n'.join(f'[고정 {n}화]\n{text}' for n,text in use)

def make_prompt(ep,items,spec,bible):
    finish = ep==15
    ending = ('이번 화가 작품의 최종 완결화다. 마지막에 새 사건/괴전화/새 적/시즌2 떡밥을 만들지 말고, 주요 인과와 감정을 회수한 뒤 조용하고 명백한 종결 장면으로 끝내라.' if finish else '마지막은 아웃라인의 end_hook을 구체적 장면으로 실현해 다음 화로 이어라.')
    return f'''당신은 한국 상업 웹소설 작가다. 작품은 「자정 이후의 콜센터」이고 지금 {ep}화를 쓴다.
10화까지 공개된 고정 원고의 사실을 절대 리셋하거나 소급 변경하지 마라. 주인공 강이현은 35세, 야간 콜센터 경력 두 달, 7층 7번 단말기, 핵심 시각 03:14:22를 유지한다.
11~15화는 최종 아크이며 15화로 완결한다. 공포/미스터리의 긴장과 콜센터 상담 기술을 이용한 해결 방식을 끝까지 유지한다. 설명문만 길게 늘이지 말고 행동, 대화, 선택, 구체적 시스템 반응으로 전진시켜라.
이번 화 설계: {json.dumps(spec,ensure_ascii=False)}
{ending}
해결에는 반드시 인물적 비용이 남아야 한다. 이미 지불한 비용과 기존 보상/채무 기록을 무효화하지 마라.
공백/줄바꿈 제외 {TARGET_MIN}~{TARGET_MAX}자 목표. 반복, 같은 감정 재서술, 메타 발언, 작가 후기 금지. 제목 없이 본문만 출력.
[스토리 바이블]{json.dumps(bible,ensure_ascii=False)}
[기존 공개/고정 원고]
{context_text(items)}'''

def expand_prompt(ep,text):
    need=max(0,TARGET_MIN-visible(text))
    return f'''아래 {ep}화는 공백 제외 {visible(text)}자다. 사건 순서, 설정, 마지막 훅을 바꾸지 말고 최소 {need+250}자 분량의 실질 장면을 보강해 최종 {TARGET_MIN}~{TARGET_MAX}자로 만들어라. 반복/풍경 늘이기 금지. 대화, 행동, 단서, 선택만 보강. 전체 원고만 출력.\n{text}'''

def contract_prompt(ep,text):
    return f'''아래 {ep}화를 사건, 단서, 인과, 결말을 유지하며 공백 제외 {TARGET_MIN}~{TARGET_MAX}자로 압축하라. 중복만 제거하고 새 설정 추가 금지. 전체 원고만 출력.\n{text}'''

def repair_prompt(ep,text,issues):
    return f'''아래 웹소설 {ep}화에서 명백한 오류만 최소 수정하라. 사건 순서/설정/결말 변경 금지. 전체 원고만 출력. 오류:{json.dumps(issues,ensure_ascii=False)}\n{text}'''

def parse_cont(raw,text):
    c=clean(raw); dec=json.JSONDecoder()
    for m in re.finditer(r'\{',c):
        try: obj,_=dec.raw_decode(c[m.start():])
        except Exception: continue
        if not isinstance(obj,dict) or not isinstance(obj.get('issues'),list): continue
        return [x for x in obj['issues'] if isinstance(x,dict) and x.get('phrase') and x['phrase'] in text]
    return [{'phrase':'CONTINUITY_REVIEW_PARSE_FAILED','reason':'invalid JSON'}]

def continuity(cfg,ep,items,text,spec):
    prompt=f'''웹소설 연속성 검수자다. 고정 원고와 현재 {ep}화를 비교해 명백한 설정/인과 충돌만 찾는다. 취향이나 문체는 평가하지 않는다. 특히 이번 화 must_keep을 검사한다. 반드시 JSON 하나만 출력: {{"issues":[{{"phrase":"현재 화의 실제 문구","reason":"충돌 이유"}}]}}. 없으면 {{"issues":[]}}.
[이번 화 설계]{json.dumps(spec,ensure_ascii=False)}
{context_text(items,limit=6)}
[현재화]{text}'''
    return parse_cont(generate(cfg,prompt),text)

def deterministic(text):
    out=[]; v=visible(text)
    if v<MIN_VISIBLE: out.append(f'TOO_SHORT_VISIBLE:{v}')
    if v>MAX_VISIBLE: out.append(f'TOO_LONG_VISIBLE:{v}')
    out += scan_text(text)
    out += [f'{x.code}:{x.phrase}' for x in scan_korean_editor(text)]
    out += [f"{x['code']}:{x['phrase']}" for x in scan_lexical(text)]
    return sorted(set(out))

def process(cfg,ep,items,spec,bible):
    text=clean(generate(cfg,make_prompt(ep,items,spec,bible)))
    gen=1; ex=co=rp=0
    while visible(text)<TARGET_MIN and ex<MAX_EXPAND:
        cand=clean(generate(cfg,expand_prompt(ep,text))); ex+=1; gen+=1
        if visible(cand)>visible(text): text=cand
    while visible(text)>MAX_VISIBLE and co<MAX_CONTRACT:
        cand=clean(generate(cfg,contract_prompt(ep,text))); co+=1; gen+=1
        if MIN_VISIBLE<=visible(cand)<visible(text): text=cand
    before=text; text=clean(contextual_edit(cfg,text)); preservation=preservation_gate(before,text)
    text=apply_lexical_fixes(apply_safe_fixes(text))
    independent=review(cfg,text)
    while independent and rp<MAX_REPAIR:
        before=text; text=clean(generate(cfg,repair_prompt(ep,text,independent))); gen+=1; rp+=1
        preservation += preservation_gate(before,text)
        text=apply_lexical_fixes(apply_safe_fixes(text)); independent=review(cfg,text)
    cont=continuity(cfg,ep,items,text,spec)
    lexical=scan_lexical(text)
    issues=sorted(set(preservation+deterministic(text)))
    if independent: issues.append('INDEPENDENT_REVIEW_BLOCK')
    if cont: issues.append('CONTINUITY_REVIEW_BLOCK')
    report={
      'episode':ep,'chars_with_spaces':len(text),'chars_without_whitespace':visible(text),
      'target_chars_without_whitespace':[TARGET_MIN,TARGET_MAX], 'generation_passes':gen,
      'expansion_passes':ex,'contraction_passes':co,'repair_passes':rp,
      'lexical_preflight_final':lexical,'final_review_issues':independent,'continuity_issues':cont,
      'issues':issues,'lexical_preflight':'PASS' if not lexical else 'BLOCK',
      'independent_reviewer':'PASS' if not independent else 'BLOCK',
      'continuity_reviewer':'PASS' if not cont else 'BLOCK','gate':'PASS' if not issues else 'BLOCK',
      'publication_state':'DRAFT_REVIEWED'
    }
    return text,report

def main():
    ep=int(os.environ.get('EPISODE','11'))
    if ep<11 or ep>15: raise ValueError('EPISODE must be 11..15')
    items=previous_context(ep)
    outline=json.loads(OUTLINE.read_text(encoding='utf-8'))
    spec=next(x for x in outline if x['chapter']==ep)
    bible=json.loads((BOOK/'bible/story_bible.json').read_text(encoding='utf-8'))
    cfg=config_from_env(); last=None
    for attempt in range(1,MAX_FULL_ATTEMPTS+1):
        text,report=process(cfg,ep,items,spec,bible); report['full_attempt']=attempt; last=(text,report)
        if report['gate']=='PASS': break
    text,report=last
    out=BOOK/'commercial'; out.mkdir(parents=True,exist_ok=True)
    (out/f'chapter-{ep}.md').write_text(text,encoding='utf-8')
    (out/f'chapter-{ep}-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    if report['gate']!='PASS': raise SystemExit(f'EPISODE_{ep}_GATE_BLOCKED')

if __name__=='__main__': main()
