from __future__ import annotations
import json
from pathlib import Path
from .market_engine import generate_candidates, score
from .editor_gate import concept_quality, retitle
from .factory_run import build_bible, build_outline, chapter_one

def run(slug="factory-book-004", seed="editor-validation-2026-09-03"):
    base=Path("books")/slug
    for d in ["market","bible","outline","chapters","reviews","package","memory"]:
        (base/d).mkdir(parents=True,exist_ok=True)

    raw=generate_candidates(seed,12)
    edited=[]
    rejected=[]
    for c in raw:
        q=concept_quality(c)
        item={**c,"factory_score":score(c),"editor":q}
        if not q["passed"]:
            original=c["title"]
            best=None
            for t in retitle(c):
                test={**c,"title":t}
                q2=concept_quality(test)
                if best is None or q2["score"]>best["editor"]["score"]:
                    best={**test,"factory_score":score(test),"editor":q2,
                          "retitled_from":original}
            if best and best["editor"]["passed"]:
                edited.append(best)
            else:
                rejected.append(item)
        else:
            edited.append(item)

    if not edited:
        raise RuntimeError("EDITOR STOP: no concept passed quality gate")
    edited.sort(key=lambda x:(x["editor"]["score"],x["factory_score"]),reverse=True)
    selected=edited[0]
    bible=build_bible(selected)
    outline=build_outline(bible)
    ch1=chapter_one(bible,outline)
    assert selected["title"]==bible["title"] and selected["title"] in ch1

    (base/"market"/"editor_candidates.json").write_text(json.dumps(edited,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"editor_rejected.json").write_text(json.dumps(rejected,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"selected.json").write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"bible"/"story_bible.json").write_text(json.dumps(bible,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"outline"/"chapters.json").write_text(json.dumps(outline,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"chapters"/"chapter-1.md").write_text(ch1,encoding="utf-8")
    state={"slug":slug,"status":"EDITOR_GATE_OK","raw_candidates":len(raw),
           "passed_or_repaired":len(edited),"rejected":len(rejected),
           "selected":selected["title"],"editor_score":selected["editor"]["score"],
           "completed":["dynamic_candidates","editor_gate","retitle_if_needed","selection","bible","outline","chapter-1"],
           "next":"chapter_writer_and_continuity_loop"}
    (base/"state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    return state

if __name__=="__main__":
    print(json.dumps(run(),ensure_ascii=False,indent=2))
