# Conchord — Design

State and purpose of every design artefact, and how they stay aligned. The visual
identity is **"Fun Light"** (working product name in mockups: *Chordette*) — warm
light neutrals, coral-orange primary, teal actives, flat zero-blur shadows.

> Token values live in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). This file records the
> *state* of the design artefacts (who leads, what lags); DESIGN-SYSTEM.md records
> the exact colors/type/spacing.

## The design artefacts

| Artefact | Where | Purpose | State (July 2026) |
|---|---|---|---|
| **Figma design master file** | [Conchord (Figma)](https://www.figma.com/design/uxHvgaOILlzU6bDgCEywPR/Conchord?node-id=93-4) — accessed via DesignAgent Claude Bridge | The **design master file**: canonical mockups and the Figma design system (components, tokens). Kept up to date with design decisions; intended to *become* the source of truth as it matures — not called that yet. | v1 Fun Light design + design system. |
| **DESIGN-SYSTEM.md** | [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | The design system **in repo form**: exact token values (colors, type, elevation, radii, spacing) and component specs, readable without Figma access. Reverse-engineered from the v1 design, with drift resolved (see its typography notes). | Current with the v1 Fun Light system. |
| **Web prototype (light)** | `conchord_au/prototype/index-light.html` | The Fun Light design **applied and interactive** — layout, components and interaction running against the real engine (`engine.js`). This is where design meets behavior before any JUCE work. | Current design direction. |
| **Web prototype (dark)** | `conchord_au/prototype/index.html` | The earlier dark-studio design. Kept for A/B comparison; not developed further. | Frozen. |
| **AU native GUI** | `conchord_au/Source/PluginEditor.{h,cpp}` | The shipped GUI. Currently implements the **dark** prototype layout; has **not** been reskinned to Fun Light yet. | Lags design — dark style. |

## Design flow

```
Figma (design master) ⇄ DESIGN-SYSTEM.md (tokens in repo) ⇄ index-light.html (interactive)
                                                                     │ (HTML now, JUCE later)
                                                                     ▼
                                                          PluginEditor (JUCE, not yet reskinned)
```

- Design can move first in **either** Figma or the prototype — we don't let Figma
  capacity block building. Whichever moved, mirror the outcome into the other and
  into DESIGN-SYSTEM.md, and update the State column above.
- **Tokens over raw values:** anything styled in the prototype or (later) the JUCE
  editor uses DESIGN-SYSTEM.md tokens. New colors/sizes require updating the system,
  not sneaking in hex values.
- The **JUCE reskin to Fun Light is future work** — until it happens, this file is
  the record that the shipped GUI intentionally lags the design (tracked as an
  unsequenced item in [docs/project-plan.md](docs/project-plan.md)).

## Known gaps

- `PluginEditor` uses the dark design; Fun Light reskin not scheduled yet.
- `DESIGN.md` and `DESIGN-SYSTEM.md` currently sit at the repo root; the plan is to
  move them into `docs/` later (done manually). When that happens, update the links
  in [CLAUDE.md](CLAUDE.md), [README.md](README.md), `conchord_au/README.md`, and
  `conchord_au/prototype/README.md`.
- Figma access from Claude goes through the DesignAgent Claude Bridge (plugin must
  be running in Figma); without it, DESIGN-SYSTEM.md is the readable fallback.
