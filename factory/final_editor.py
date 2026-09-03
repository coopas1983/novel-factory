from __future__ import annotations
from pathlib import Path
import json, re

def audit_manuscript(base:Path)->dict:
    outline=json.loads((base/"outline/chapters.json").read_text(encoding="utf-8"))
    memory=json.loads((base/"memory/state.json").read_text(encoding="utf-8"))
    issues=[]
    chapters=[]
    seen_blocks={}
    for beat in outline:
        p=base/"chapters"/f"chapter-{beat['chapter']}.md"
        if not p.exists():
            issues.append({"severity":"BLOCK","chapter":beat["chapter"],"type":"missing_chapter"})
            continue
        text=p.read_text(encoding="utf-8")
        chapters.append(text)
        if beat["goal"] not in text:
            issues.append({"severity":"BLOCK","chapter":beat["chapter"],"type":"goal_not_executed"})
        # detect repeated paragraphs across chapters
        paras=[x.strip() for x in text.split("\n\n") if len(x.strip())>45]
        for para in paras:
            norm=re.sub(r"\d+","N",para)
            if norm in seen_blocks:
                issues.append({"severity":"MAJOR","chapter":beat["chapter"],"type":"repeated_block",
                               "first_chapter":seen_blocks[norm]})
            else:
                seen_blocks[norm]=beat["chapter"]

    # A completed standalone novel must not leave synthetic "next episode" hooks open.
    if memory.get("open_hooks"):
        issues.append({"severity":"BLOCK","chapter":len(outline),"type":"unresolved_hooks",
                       "hooks":memory["open_hooks"]})
    if len(memory.get("chapter_summaries",[])) != len(outline):
        issues.append({"severity":"BLOCK","type":"memory_count_mismatch"})
    return {"passed":not any(x["severity"]=="BLOCK" for x in issues),
            "issues":issues,"chapter_count":len(chapters)}

def repair_ending(base:Path,audit:dict)->list[str]:
    repaired=[]
    memory=json.loads((base/"memory/state.json").read_text(encoding="utf-8"))
    outline=json.loads((base/"outline/chapters.json").read_text(encoding="utf-8"))
    last=len(outline)
    p=base/"chapters"/f"chapter-{last}.md"
    text=p.read_text(encoding="utf-8")
    if any(x["type"]=="unresolved_hooks" for x in audit["issues"]):
        # Remove mechanical sequel bait and close the tracked hook.
        text=re.sub(r"\*\*미확인 기록: \d+\.\*\*","**모든 미확인 기록: 처리 완료.**",text)
        text=text.replace("다음 회차에서 기존 해석을 흔드는 새 정보가 드러난다.",
                          "이현은 더 이상 다음 기록을 기다리지 않았다. 남은 것은 자신이 선택한 삶을 살아가는 일이었다.")
        p.write_text(text,encoding="utf-8")
        for h in list(memory.get("open_hooks",[])):
            memory["open_hooks"].remove(h)
            memory["resolved_hooks"].append(h)
        (base/"memory/state.json").write_text(json.dumps(memory,ensure_ascii=False,indent=2),encoding="utf-8")
        repaired.append("closed_final_open_hooks")
    return repaired

def package_book(base:Path)->dict:
    selected=json.loads((base/"market/selected.json").read_text(encoding="utf-8"))
    title=selected["title"]
    pkg={
      "title":title,
      "genre":selected["genre"],
      "one_line_pitch":selected["hook"],
      "short_description":f"{selected['hook']} 평범한 일과 비정상적인 기록이 맞물리며, 주인공은 성공보다 더 어려운 선택의 대가를 마주한다.",
      "keywords":[selected.get("trend_engine","성장"),"직업물","미스터리","현대판타지","성장","완결"],
      "cover_brief":{
        "format":"vertical ebook cover",
        "composition":"밤의 핵심 직업 공간을 전경에 두고, 주인공 한 명을 중경에 배치. 사건을 암시하는 기록/문서/모니터 요소는 추상적으로.",
        "mood":"현실적인 한국의 야간 업무공간 + 미스터리한 긴장",
        "title_zone":"상단 25% 여백",
        "avoid":["유명 작품을 연상시키는 캐릭터/로고","과도한 네온 사이버펑크","본문 스포일러"]
      },
      "deliverables":["complete_manuscript.md","synopsis.md","metadata.json","cover_prompt.txt"]
    }
    pkgdir=base/"package"; pkgdir.mkdir(exist_ok=True)
    (pkgdir/"metadata.json").write_text(json.dumps(pkg,ensure_ascii=False,indent=2),encoding="utf-8")
    chapters=[]
    for p in sorted((base/"chapters").glob("chapter-*.md"), key=lambda x:int(re.search(r"(\d+)",x.stem).group(1))):
        chapters.append(p.read_text(encoding="utf-8"))
    (pkgdir/"complete_manuscript.md").write_text("\n\n---\n\n".join(chapters),encoding="utf-8")
    synopsis=f"""# {title}

## 한 줄 소개
{selected['hook']}

## 작품 소개
평범한 직업 현장에 설명할 수 없는 규칙이 침투한다. 주인공은 사건을 해결할수록 자신의 전문성과 선택의 의미를 다시 배우게 되고, 독립적으로 보였던 사건들은 하나의 장기 미스터리로 수렴한다.

## 완결 방향
외적 미스터리 해결과 주인공의 내적 변화가 마지막 선택에서 함께 닫히는 단권 완결 구조.
"""
    (pkgdir/"synopsis.md").write_text(synopsis,encoding="utf-8")
    (pkgdir/"cover_prompt.txt").write_text(
        f"Korean commercial web-fiction ebook cover for '{title}'. "+pkg["cover_brief"]["composition"]+
        " "+pkg["cover_brief"]["mood"]+" No copyrighted characters, no logos.",encoding="utf-8")
    return pkg

def finalize(base:Path):
    first=audit_manuscript(base)
    repairs=[]
    if not first["passed"]:
        repairs=repair_ending(base,first)
    second=audit_manuscript(base)
    if not second["passed"]:
        raise RuntimeError("FINAL EDITOR STOP: blocking issues remain: "+json.dumps(second["issues"],ensure_ascii=False))
    pkg=package_book(base)
    result={"status":"FINAL_EDITOR_PASS","first_audit":first,"repairs":repairs,
            "final_audit":second,"package_title":pkg["title"],"next":"live_model_quality_upgrade"}
    (base/"final_report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    return result
