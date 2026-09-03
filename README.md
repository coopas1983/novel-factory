# Novel Factory v0.1

AI-assisted novel production pipeline designed for Korean-first commercial fiction.

## Pipeline
discover -> ideate -> select -> bible -> outline -> write -> review -> continuity -> polish -> package

## What v0.1 proves
- A complete project skeleton can be created without tying the system to one AI vendor.
- Every book has persistent state outside the model context.
- Each stage has an explicit input/output contract and quality gate.
- Initial validation keeps one human concept-approval gate; it can later be disabled.

## Quick start
1. Copy `.env.example` to `.env` and configure a provider when an API is attached.
2. Edit `config/factory.yaml`.
3. Run `python -m factory init demo-book`
4. Run `python -m factory status demo-book`
5. Use the stage prompt contracts under `prompts/` with your chosen agent/model.

v0.1 intentionally separates the deterministic factory/state layer from model-provider calls.


## v0.3
Fixed selected-concept propagation. Added provider interface and zero-cost offline validation provider. Fixed topic candidates are now isolated to the validation provider and can be replaced by a live research/model provider without changing the factory pipeline.


## v0.5 Editor Gate
Adds fail-closed Korean title/concept quality gate, automatic retitling, cliché penalties, and explicit rejection logs.


## v0.6 Long-form Loop
Adds chapter-by-chapter write/review/revision/memory loop, fail-closed revision limit, persistent character/timeline/hook memory, and completion gates.


## v0.7 Final Editor
Adds full-manuscript audit, unresolved-hook fail gate, ending repair, repetition checks, and sellable package assembly.

## v0.8 Live AI Writer
Replaces the template writer with provider adapters for Gemini/OpenAI/Anthropic.
The writer loads bible + chapter beat + recent summaries + open hooks for every chapter.
It fails closed on missing credentials, very short drafts, template leakage, or excessive cross-chapter similarity.
No API key is bundled in this repository.
