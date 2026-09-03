from pathlib import Path
import json
from .editor_run import run as editor_run
from .longform_loop import run_longform

def main():
    slug="factory-book-005"
    editor_run(slug=slug, seed="longform-validation-2026-09-03")
    result=run_longform(Path("books")/slug)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
