# Conchord

A chord generator / MIDI transformer inspired by the [Orchid](https://telepathicinstruments.com)
by Telepathic Instruments. Play single notes, get expressive diatonic chords, re-voiced
live while you hold the keys. Started as a Logic Pro Scripter script, now being ported
to a native AU/VST plugin with its own GUI.

**This CLAUDE.md is the index.** It is auto-loaded each session so that anyone (human
or Claude) opening this repo knows what the artefacts are, where their documentation
lives, and what must be kept in sync with what. It deliberately contains no engine
details, no parameter tables, no roadmap — those live in the docs listed below. When
the project changes shape (new artefact, new doc, changed sync rule), update **this
file** in the same commit.

## The artefacts

The project is one chord engine expressed in four artefacts, kept in sync as a pipeline:

```
Figma design master ──▶ DESIGN-SYSTEM.md ──▶ web prototype (GUI blueprint)
                                                    │
conchord_09.js (engine source of truth) ──▶ engine.js (JS port) ──▶ conchord_au (C++/JUCE AU)
```

| Artefact | Where | Purpose | Doc |
|---|---|---|---|
| **Scripter engine** | `conchord_09.js` (older `conchord_0N.js` frozen) | The chord engine's **source of truth**. All engine behavior is designed and proven here first. | [docs/architecture.md](docs/architecture.md), [docs/user-manual.md](docs/user-manual.md) |
| **Web prototype** | `conchord_au/prototype/` | Interactive HTML blueprint of the GUI. `engine.js` is the v0.9 engine as pure functions; `index-light.html` is the current "Fun Light" design, `index.html` the older dark version (kept for A/B). Design and interaction are validated here before JUCE work. | [prototype/README.md](conchord_au/prototype/README.md) |
| **AU plugin** | `conchord_au/` | The **product**: C++/JUCE AU MIDI-FX port with native GUI. Phase 3 done (v0.9 engine parity, native editor, auval PASS). | [conchord_au/README.md](conchord_au/README.md) |
| **Design** | Figma "Conchord" file + [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | The **design master file** (Figma) and its token description in the repo. Feeds the prototype reskin, eventually the JUCE GUI. | [DESIGN.md](DESIGN.md) |

(`note_monitor_au/` is a separate standalone JUCE tool — a MIDI note visualizer, not
part of the Conchord pipeline. See its own README.)

## The docs and their contracts

| Doc | Answers | Update when |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) (this file) | "What is here and where do I look?" | An artefact or doc is added/removed/repurposed, or a sync rule changes. |
| [docs/architecture.md](docs/architecture.md) | "How does the engine work, and what is every file?" Repo map, state model, chord pipeline, music theory, function index. | The engine (`conchord_09.js`) changes, or files are added/moved. Read this **instead of re-grepping code** for engine questions. |
| [docs/user-manual.md](docs/user-manual.md) | "How do I play it?" User-facing manual: install, parameters, performance controls, modifier keys. | Parameters or playable behavior change in the current engine version. |
| [DESIGN.md](DESIGN.md) | "What is the design, where does it live, what state is each design artefact in?" | Design work happens in Figma, DESIGN-SYSTEM.md, or the prototype's look. |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | "What are the exact tokens?" Colors, type scale, elevation, radii, spacing, components. | Tokens change (in Figma or in the prototype — whichever moved first, mirror it here). |
| [docs/project-plan.md](docs/project-plan.md) | "What do we build next, and why in that order?" Roadmap, phases, open design questions. | A phase completes, priorities shift, or new work is decided. **The roadmap lives here and only here.** |
| [conchord_au/README.md](conchord_au/README.md) | AU state: what's ported, what's parked, how to build/validate. | The AU gains/loses features or the build process changes. |
| [conchord_au/prototype/README.md](conchord_au/prototype/README.md) | Prototype state: what's live vs. stub, how to run, prototype→AU mapping. | The prototype gains features or its role shifts. |

## Sync rules (why the docs must stay current)

The same engine exists in three languages and the same design in three media. Nothing
enforces their equivalence except discipline, so each doc records its artefact's
state — that record is how drift gets caught.

1. **Engine change** (`conchord_09.js`) → port to `conchord_au/prototype/engine.js`
   and `conchord_au/Source/ChordEngine.h` in the same effort; update docs/architecture.md
   (and docs/user-manual.md if playable behavior changed). Verify JS/C++ parity by
   running identical scenarios and diffing output notes.
2. **Design change** (Figma or prototype) → mirror tokens into DESIGN-SYSTEM.md,
   note state in DESIGN.md. Figma is the design master file; when it lags the
   prototype, DESIGN.md must say so.
3. **New feature** → designed in the prototype first, then ported to the AU
   (prototype-first workflow, see docs/project-plan.md).
4. **Any completed phase or scope decision** → docs/project-plan.md.
