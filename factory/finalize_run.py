from pathlib import Path
import json
from .editor_run import run as editor_run
from .longform_loop import run_longform
from .final_editor import finalize

def main():
    slug="factory-book-006"
    editor_run(slug=slug,seed="final-editor-validation")
    base=Path("books")/slug
    run_longform(base)
    result=finalize(base)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
