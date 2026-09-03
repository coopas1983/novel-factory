from __future__ import annotations
import json, datetime
from pathlib import Path
from .market_engine import generate_candidates, score
from .factory_run import build_bible, build_outline, chapter_one

def run(slug="factory-book-003", seed=None):
    seed=seed or datetime.datetime.now().isoformat()
    base=Path("books")/slug
    for d in ["market","bible","outline","chapters","reviews","package","memory"]:
        (base/d).mkdir(parents=True,exist_ok=True)
    candidates=generate_candidates(seed,12)
    ranked=sorted([{**c,"score":score(c)} for c in candidates],key=lambda x:x["score"],reverse=True)
    selected=ranked[0]
    bible=build_bible(selected); outline=build_outline(bible); ch1=chapter_one(bible,outline)
    assert selected["title"]==bible["title"] and selected["title"] in ch1
    (base/"market"/"generated_candidates.json").write_text(json.dumps(ranked,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"market"/"selected.json").write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"bible"/"story_bible.json").write_text(json.dumps(bible,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"outline"/"chapters.json").write_text(json.dumps(outline,ensure_ascii=False,indent=2),encoding="utf-8")
    (base/"chapters"/"chapter-1.md").write_text(ch1,encoding="utf-8")
    state={"slug":slug,"status":"MARKET_SNAPSHOT_PIPELINE_OK","seed":seed,
           "candidate_count":len(ranked),"selected":selected["title"],
           "completed":["fresh_market_snapshot","dynamic_concept_generation","ranking","selection","bible","outline","chapter-1"],
           "next":"automated_live_web_ingestion_adapter"}
    (base/"state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    return state

if __name__=="__main__":
    print(json.dumps(run(seed="2026-09-03T13:41+09:00"),ensure_ascii=False,indent=2))
