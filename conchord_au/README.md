# ConchordAU

C++/JUCE port of the conchord Scripter engine (conchord_09.js) as a real AU
MIDI-FX plugin — now with its **own native GUI** (Phase 3) that draws the
prototype's interface (`prototype/index.html`, the dark skin) against APVTS.
The "Fun Light" reskin (`prototype/index-light.html`) has **not** been ported
yet — see [DESIGN.md](../DESIGN.md).

Deliberately a separate target from `note_monitor_au`: the monitor passes MIDI
through transparently (a debugging lens), Conchord *transforms* it.

## Architecture

| File | Role |
|---|---|
| `Source/ChordEngine.h` | Pure chord engine, **v0.9 parity** with conchord_09.js. Header-only, JUCE-free, unit-testable. `buildSettings(RawParams)` + `buildChord()`. |
| `Source/PluginProcessor.{h,cpp}` | The MIDI-FX engine: reference-counted note sending, live morph of held chords, mod zone (Hold/Latch), Pitch Bend / Mod Wheel, voice leading, presets. Publishes a thread-safe `UiState` snapshot. |
| `Source/PluginEditor.{h,cpp}` | Native editor in dark-studio style. Play surface + flip-to-setup. A Timer polls `UiState` and draws the chord viewer + key highlight live. |

`ChordEngine.h` is validated against the prototype's `engine.js` (same logic in JS)
by running identical scenarios in both and diffing the notes — keep them in sync
when the engine changes (same principle as ARCHITECTURE.md).

## What exists (v0.9 parity)

- **Key / Scale** — 9 scales (Ionian … Melodic Minor)
- **Chord Type** — Triad, 6th/7th/9th/11th/13th, Sus2, Sus4, Dom 7, Dim
  (base selector; the mod zone stacks **on top**)
- **Mod zone** — 9 keys from C2 (movable, `Mod Zone Low`):
  Sus2 · Dim · Sus4 · 6th · 7th · Dom7 · Add9 · Parallel · Voice Lead.
  Stacks, morphs held chords live, **Hold/Latch**, subtractive release.
- **Pitch Bend → Chord Size / Inversion** (Latch + Reset) and
  **Mod Wheel → Inversion / Chord Size** (Reset) with Inversion Range ±.
- **Voice Lead** — the next chord is placed closest to the previous one.
- **Voicing** (Close … Spread), **Inversion** (-6..+6), **Max Chord Size** (1..12)
- **Bass Note** + **Bass / Harmony Velocity %**
- **Strum (ms)** + **Strum Direction** (mirrored note-off delays)
- **Out-of-Scale Keys** — Mute / Pass Through / Snap / Diminished / Chrom Bass
- **Borrow Pairing** (the Parallel borrow table), **Presets** (Harp/Piano/Pad/Pluck)
- Parameter state is saved with the project (APVTS state)

The GUI can also play chords directly (click the keyboard) and perform
PB/MW gestures with the wheels — handy for auditioning without an external controller.

## Deliberately left out (parked)

- The mode tabs **2-FINGER / JAZZ**, A/B and **Remap** (layout stubs).
- **Humanize** (to be designed) — placeholder in Chord mode.
- **Single Chord Mode / Free Play / Notes Join Chord** — exist in the Scripter
  engine, not exposed in this editor yet (the live-morph infrastructure makes
  them easy to add later).
- The chord name in the chord viewer is a preliminary detector, not engine logic.
- The **Fun Light reskin** of the editor (design exists in the prototype + Figma).

## Build (CLT + Ninja, no Xcode)

```sh
cmake -G Ninja -B build-ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-ninja
```

`COPY_PLUGIN_AFTER_BUILD` installs automatically to
`~/Library/Audio/Plug-Ins/Components/`. Validate: `auval -v aumi CnCh Cncd`.
In Logic: MIDI FX slot → Conchord → ConchordAU. The Standalone app (`FORMATS …
Standalone`) launches the plugin on its own for quick testing.
