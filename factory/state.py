from __future__ import annotations
from dataclasses import dataclass, asdict
from pathlib import Path
import json
from datetime import datetime, timezone

STAGES = [
    "discover", "ideate", "select", "bible", "outline",
    "write", "review", "continuity", "polish", "package"
]

@dataclass
class BookState:
    slug: str
    stage: str = "discover"
    status: str = "ready"
    current_chapter: int = 0
    revision_round: int = 0

def project_dir(slug: str) -> Path:
    return Path("books") / slug

def init_project(slug: str) -> Path:
    root = project_dir(slug)
    for part in ["market", "bible", "outline", "chapters", "reviews", "package", "memory"]:
        (root / part).mkdir(parents=True, exist_ok=True)
    state = BookState(slug=slug)
    save_state(state)
    defaults = {
        "memory/canon.json": {"facts": []},
        "memory/characters.json": {"characters": []},
        "memory/hooks.json": {"open": [], "resolved": []},
        "memory/chapter_summaries.json": {"chapters": []},
        "memory/style.json": {"voice": "", "avoid": [], "preferences": []},
    }
    for rel, payload in defaults.items():
        p = root / rel
        if not p.exists():
            p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return root

def save_state(state: BookState) -> None:
    root = project_dir(state.slug)
    root.mkdir(parents=True, exist_ok=True)
    payload = asdict(state)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    (root / "state.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

def load_state(slug: str) -> dict:
    p = project_dir(slug) / "state.json"
    if not p.exists():
        raise FileNotFoundError(f"Unknown book: {slug}")
    return json.loads(p.read_text(encoding="utf-8"))
