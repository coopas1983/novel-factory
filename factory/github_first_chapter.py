from __future__ import annotations
from pathlib import Path
import json
from .editor_run import run as editor_run
from .longform_loop import initial_memory, update_memory
from .ai_writer import config_from_env, build_prompt, generate
from .ai_longform import similarity

def main():
    slug="live-gemini-pilot"
    editor_run(slug=slug,seed="live-gemini-pilot")
    base=Path("books")/slug
    cfg=config_from_env()
    if cfg.provider!="gemini" or not cfg.api_key:
        raise RuntimeError("GEMINI SECRET NOT AVAILABLE")

    selected=json.loads((base/"market/selected.json").read_text(encoding="utf-8"))
    bible=json.loads((base/"bible/story_bible.json").read_text(encoding="utf-8"))
    outline=json.loads((base/"outline/chapters.json").read_text(encoding="utf-8"))
    memory=initial_memory()
    beat=outline[0]

    prompt=build_prompt(bible,beat,memory)
    text=generate(cfg,prompt).strip()

    issues=[]
    if len(text)<1200: issues.append("too_short")
    if "이전까지의 변화:" in text: issues.append("meta_template_leak")
    if similarity(text,text) < .99: issues.append("similarity_guard_internal_error")
    if issues:
        raise RuntimeError("FIRST_CHAPTER_QUALITY_BLOCK: "+",".join(issues))

    chapter_path=base/"chapters"/"chapter-1.md"
    chapter_path.write_text(f"# 1화 — {beat['title']}\n\n{text}",encoding="utf-8")
    memory=update_memory(memory,beat,text)
    (base/"memory"/"state.json").write_text(json.dumps(memory,ensure_ascii=False,indent=2),encoding="utf-8")

    report={
      "status":"REAL_AI_CHAPTER_1_COMPLETE",
      "provider":cfg.provider,
      "model":cfg.model,
      "title":selected["title"],
      "chapter_chars":len(text),
      "quality_issues":issues,
      "next":"human_quality_read_then_10_chapter_live_run"
    }
    (base/"live_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
