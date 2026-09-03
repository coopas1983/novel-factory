from .state import STAGES

def next_stage(current: str) -> str | None:
    if current not in STAGES:
        raise ValueError(f"Unknown stage: {current}")
    idx = STAGES.index(current)
    return STAGES[idx + 1] if idx + 1 < len(STAGES) else None

def stage_contract(stage: str) -> dict:
    contracts = {
        "discover": {"out": ["market/signals.json", "market/brief.md"]},
        "ideate": {"out": ["market/concepts.json"]},
        "select": {"out": ["market/selected.json"]},
        "bible": {"out": ["bible/story_bible.md", "memory/canon.json"]},
        "outline": {"out": ["outline/master.md", "outline/chapters.json"]},
        "write": {"out": ["chapters/chapter-N.md"]},
        "review": {"out": ["reviews/chapter-N.json"]},
        "continuity": {"out": ["memory/characters.json", "memory/hooks.json", "memory/chapter_summaries.json"]},
        "polish": {"out": ["chapters/chapter-N.final.md"]},
        "package": {"out": ["package/metadata.json", "package/synopsis.md", "package/cover-brief.md"]},
    }
    return contracts[stage]
