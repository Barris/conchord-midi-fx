# Conchord — Planning

**This file is the roadmap and only the roadmap**: what to build next, in what order,
and the open design questions. Artefact/doc index: [CLAUDE.md](../CLAUDE.md). Engine
internals: [architecture.md](architecture.md). Design state: [DESIGN.md](../DESIGN.md).
Update this file whenever a phase completes or priorities shift.

## Context

The project is a three-layer pipeline kept in sync: `conchord_09.js` (Logic Scripter
engine, source of truth) → `conchord_au/prototype/` (web GUI blueprint + `engine.js`
pure-function port) → `conchord_au/` (C++/JUCE AU production port). In parallel, a
**design track** (Figma design master + [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md)) produced
the "Fun Light" reskin, applied so far only to the prototype
(`index-light.html`) — the JUCE editor still uses the dark design.

 **The user wants several tracks**, all considered important: fix the **performance-control
   feel** (PB→size mapping is hard to control, range selection incomplete), port 2-TOUCH to
   the AU, expose existing engine features in the GUI, build Humanize, **plus new
   features** — a *Tight Chord* mode (toggle, one-octave voicing), a *retrigger-on-mod-zone*
   toggle, a built-out *Harp* mode, and a drawable *Arpeggio* sequencer.

This plan sequences that work: checkpoint first, fix the control feel (it's foundational —
the new toggles build on the same size/voicing pipeline), front-load the well-defined
engine wins, port the already-designed 2-TOUCH, then the design-led features.

Confirmed during review: Chrom Bass **is** implemented in both
[conchord_09.js](../conchord_09.js) and [ChordEngine.h](../conchord_au/Source/ChordEngine.h)
(an earlier exploration wrongly flagged it missing). The "zone" references in the AU
editor are the **mod zone**, not 2-TOUCH — 2-TOUCH/JAZZ are still stubbed
([PluginEditor.cpp:529](../conchord_au/Source/PluginEditor.cpp) bails for modes 2/3).

---

## Phase 0 — Checkpoint (do first, low risk)

Get the finished work under version control before building on it.

**Status: partially done** — the "standalone" commit (26c42d4) landed the editor +
standalone work, but the doc restructure (root `CLAUDE.md` index + `README.md`,
`DESIGN.md`, `DESIGN-SYSTEM.md`, `docs/architecture.md`, `docs/user-manual.md`, this
file) and `conchord_au/prototype/index-light.html` are still untracked. Remaining:

- Build the AU clean: `cmake -G Ninja -B conchord_au/build-ninja -DCMAKE_BUILD_TYPE=Release && cmake --build conchord_au/build-ninja`
- Validate: `auval -v aumi CnCh Cncd` (expect PASS) and smoke-test the Standalone build (audio via PianoSynth).
- Commit the untracked design/doc files and the doc restructure.

**Verification:** `auval` PASS; Standalone plays piano on input; plugin loads in Logic as MIDI-FX.

---

## Phase 1 — Control feel: PB→size remap, range selection, smooth voicings (bug/UX)

The current PB→Chord Size mapping
([conchord_09.js:813-819](../conchord_09.js)) is `s.size = max(perfSizeFloor, ceil(maxSlider × pbAmt))`
— it scales *multiplicatively* off the Max Chord Size slider with a floor of 2, so resting
position lands at half-size and small bends behave inconsistently depending on the slider.
That's the "hard to control" problem. Fixes:

### 1a. Remap Pitch Bend → Chord Size to a linear 1..MaxChordSize sweep
- Replace the multiplicative mapping with a direct **linear sweep from 1 to the Max Chord
  Size slider**: full-down = 1 note, full-up = the slider's max, resting (center) maps
  predictably to the midpoint. `s.size = round(lerp(1, MaxChordSize, pbAmt))`, where
  `pbAmt = (pitchBendValue + 1) / 2`. No fixed 6 cap — so in Harp (slider up to 12) bend
  reaches the full size. Mirror in `engine.js` and `ChordEngine.h`/AU.
- This makes the Max Chord Size slider the single ceiling and PB the expressive sweep
  beneath it (1..slider), replacing the confusing `floor 2 × multiplicative` behavior.
- Revisit `perfSizeFloor` (the size-1 special case at [conchord_09.js:792](../conchord_09.js))
  so reaching size 1 via PB is smooth (see 1c) — the floor should now be 1, not 2.

### 1b. Finish range selection
The Inversion Range −/+ controls ([conchord_09.js:783-784](../conchord_09.js)) drive how far
PB/MW sweep inversion, but range selection "isn't fully implemented" — audit and complete
the wiring end-to-end, especially in the AU editor
([PluginEditor.cpp](../conchord_au/Source/PluginEditor.cpp), control card), so the GUI exposes
and respects both bounds. Confirm AU APVTS params match the JS params.

### 1c. Smooth size sweeps across inversions & voicings
Make PB-driven size changes glitch-free for every voicing. Known rough edges from the
engine comments: size-1 early-return drops inversion movement
([conchord_09.js:786-792](../conchord_09.js)); Spread/Drop voicings flip note parity on
note-count change ([conchord_09.js:1158-1166](../conchord_09.js)). Lean on the existing
`updateAllActiveChords` diff ([conchord_09.js:685](../conchord_09.js)) and voice-leading
anchoring so common tones sustain through a sweep instead of retriggering. Verify by ear
across all 5 voicings × inversion offsets while sweeping PB.

**Verification:** sweep PB through the full size range under each voicing and inversion
setting in Standalone + Logic; confirm smooth, predictable note-count changes with no
stuck/retriggered notes; `engine.js` and `ChordEngine.h` produce identical output.

---

## Phase 2 — Engine quick wins (well-defined, high value)

These are small, additive changes to the engine that flow JS → `engine.js` → `ChordEngine.h`
/ AU, each behind a **toggle parameter** (per the user: not mod-zone keys).

### 2a. Tight Chord mode (one-octave voicing toggle)
Compress the built chord into ~one octave instead of stacking across octaves. The
mechanism already exists in [engine.js `buildZoneChord`](../conchord_au/prototype/engine.js):
voice-lead into a single register, then fold. Implementation:
- Add `s.tight` to `getSettings()` and a new step in `buildChordNotes`
  ([conchord_09.js:819](../conchord_09.js)) after voicing/inversion: fold pitches into a
  one-octave window above the (bass-excluded) root via repeated ±12, then `dedupe`.
  Reuse `applyVoiceLeading`/`dedupe` rather than new math.
- New `PluginParameters` entry `Tight Chord` (checkbox); mirror in `ChordEngine.h`
  settings struct + APVTS in [PluginProcessor.cpp](../conchord_au/Source/PluginProcessor.cpp),
  and add a toggle to the CHORD control card in
  [PluginEditor.cpp](../conchord_au/Source/PluginEditor.cpp). Wire the same toggle into the
  prototype CHORD mode.
- **Design note (open):** interaction with Voicing (Drop/Spread inherently widen). Likely
  Tight overrides/disables wide voicings, or applies as a final fold. Decide in prototype.

### 2b. Retrigger-on-mod-zone toggle
Currently `updateAllActiveChords` ([conchord_09.js:685](../conchord_09.js)) diffs notes so
common tones sustain silently when a mod-zone key changes the chord. Add an opt-in that
retriggers all notes on mod-zone press:
- Add a `forceRetrigger` arg to `updateAllActiveChords`; when set, NoteOff every current
  note then NoteOn the full rebuilt chord (bypass the `findNote` keep-alive at
  [conchord_09.js:714-724](../conchord_09.js)). Pass it from `handleModifierKey` when the new
  param is on. Preserve the subtractive-release invariant for the *off* direction.
- New checkbox param `Retrigger on Modifier`; mirror to AU + prototype as above.

### 2c. Expose existing engine features in the AU GUI
`Single Chord Mode`, `Free Play Notes`, and `Notes Join Chord` already work in the engine
and ship in `PluginParameters` but aren't reachable from the native editor. Add controls
to the CHORD control card / Setup view in
[PluginEditor.cpp](../conchord_au/Source/PluginEditor.cpp), bound to the existing APVTS
params — no engine change needed.

**Verification:** unit-check `ChordEngine.h` against `engine.js` for identical output on
the new flags; A/B the prototype vs. AU by ear; confirm tight/retrigger toggles change
behavior in Standalone and Logic.

---

## Phase 3 — Port 2-TOUCH mode to the AU

2-TOUCH is fully designed in the prototype (`buildZoneChord`, `snapRootToScale`,
`ZONE_QUALITIES`, Orchid + Hands flavors, draggable zones, MW→register) but stubbed in the
AU. Carry it into production:
- Port `buildZoneChord` / `ZONE_QUALITIES` / `snapRootToScale` into `ChordEngine.h`.
- Add a zone-chord MIDI path in `PluginProcessor` selected when mode == 2; publish zone
  state in the `UiState` snapshot.
- Un-stub the tab in [PluginEditor.cpp:529](../conchord_au/Source/PluginEditor.cpp); build the
  two-zone keyboard rendering, draggable handles, flavor + snap-to-scale controls, and
  MW→register subtitle from the prototype layout.

**Verification:** prototype and AU produce identical chords for the same zone touches;
auval PASS; manual play test of both flavors.

---

## Phase 4 — Design-led features (prototype-first)

These need design work before production. Per the project's workflow, design in the web
prototype first, then port. Each starts with a short design pass, not code.

### 4a. Humanize
Turn the placeholder (stubbed in prototype + AU) into real velocity + timing
humanization. **Open questions:** depth/amount control shape; whether it jitters strum
delays, velocities, or both; per-note vs. per-chord. Design in prototype, then add a
post-build randomization step in `buildChordNotes` + param.

### 4b. Harp mode build-out
HARP currently = max 12 tones + visible strum. Needs a real identity. **Open questions to
resolve with the user:** what distinguishes HARP beyond size+strum — glissando/run
patterns, sustain/overlap behavior, a dedicated voicing, auto-strum on every chord? Scope
in a short design doc + prototype before coding.

### 4c. Arpeggio / drawable sequence
Most ambitious: a step sequencer where the user **draws a pattern** and chords are
arpeggiated to adapt to it. **Open questions:** is the drawn shape a pitch-order/step
pattern over the current chord's tones, a rhythmic grid, or both; sync to host tempo
(needs `AudioPlayHead` in the AU); how it composes with strum and Tight mode. Prototype
the interaction (drawable grid in the web GUI) before committing to engine/host-sync work.

---

### 4d. Fun Light reskin of the JUCE editor (unsequenced)
The design exists (Figma master + DESIGN-SYSTEM.md + `index-light.html`); the native
editor still draws the dark design. Not yet prioritized against 4a–4c — decide when
Phase 3 (2-TOUCH) lands. Tracked in [DESIGN.md](../DESIGN.md).

## Suggested order & rationale

`Phase 0` (checkpoint) → `Phase 1` (control feel — fix PB→size + range + smooth voicings;
foundational, everything else plays through this pipeline) → `Phase 2` (cheap, high-value
toggles + unlock existing power) → `Phase 3` (cash in the already-designed 2-TOUCH) →
`Phase 4` (design-led, sequenced 4a→4b→4c by increasing design uncertainty). This fixes
the control problems first, front-loads value, keeps the three layers in sync at each step,
and defers the items that need design decisions until the foundation is committed and
validated.
