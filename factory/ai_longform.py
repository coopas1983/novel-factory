from __future__ import annotations
import json, re
from pathlib import Path
from .ai_writer import config_from_env, build_prompt, generate
from .longform_loop import initial_memory, update_memory

def similarity(a,b):
    A=set(re.findall(r"[가-힣A-Za-z0-9]{2,}",a))
    B=set(re.findall(r"[가-힣A-Za-z0-9]{2,}",b))
    return len(A&B)/max(1,len(A|B))

def run(base:Path, max_revisions=3):
    cfg=config_from_env()
    if cfg.provider=="none" or not cfg.api_key:
        raise RuntimeError("AI_WRITER_BLOCKED: no live AI provider/key configured")
    selected=json.loads((base/"market/selected.json").read_text(encoding="utf-8"))
    bible=json.loads((base/"bible/story_bible.json").read_text(encoding="utf-8"))
    outline=json.loads((base/"outline/chapters.json").read_text(encoding="utf-8"))
    memory=initial_memory(); accepted=[]
    log=[]
    for beat in outline:
        ok=False
        for attempt in range(1,max_revisions+1):
            prompt=build_prompt(bible,beat,memory)
            text=generate(cfg,prompt).strip()
            max_sim=max([similarity(text,x) for x in accepted],default=0)
            reasons=[]
            if len(text)<1200: reasons.append("too_short")
            if max_sim>0.42: reasons.append("cross_chapter_similarity")
            if "이전까지의 변화:" in text: reasons.append("meta_template_leak")
            if not reasons:
                p=base/"chapters"/f"chapter-{beat['chapter']}.md"
                p.write_text(f"# {beat['chapter']}화 — {beat['title']}\n\n{text}",encoding="utf-8")
                accepted.append(text)
                memory=update_memory(memory,beat,text)
                (base/"memory"/"state.json").write_text(json.dumps(memory,ensure_ascii=False,indent=2),encoding="utf-8")
                log.append({"chapter":beat["chapter"],"attempt":attempt,"chars":len(text),
                            "max_similarity":round(max_sim,3),"status":"PASS"})
                ok=True; break
        if not ok:
            raise RuntimeError(f"AI_WRITER_FAIL_CLOSED: chapter {beat['chapter']}")
    return {"status":"AI_LONGFORM_COMPLETE","provider":cfg.provider,"model":cfg.model,
            "chapters":len(accepted),"log":log}
