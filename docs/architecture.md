# Conchord — architecture & function

Internal reference for how the engine is built, so that questions about structure,
function and music theory can be answered without re-reading the whole code.
[user-manual.md](user-manual.md) is the *user-facing* documentation (install,
parameter overview); this file is *developer-facing*. [CLAUDE.md](../CLAUDE.md) is
the index of all artefacts and docs.

> **Source of truth:** the active version is `conchord_09.js`. Older
> `conchord_0N.js` are frozen references. Line numbers below refer to v0.9 and can
> drift — the section headers (`// ===== ... =====`) are more stable anchors.
> When the engine changes: update this file in the same effort.

## Repo map

| Path | What |
|---|---|
| `conchord_09.js` | Current Scripter engine (Logic Pro MIDI FX, JavaScript). **Engine source of truth.** |
| `conchord_0[3-8].js` | Previous versions, kept for reference. |
| `conchord_au/` | C++/JUCE port of the engine as a real AU MIDI-FX. **Phase 3 done:** native GUI (port of the prototype) + v0.9 engine parity (mod zone, PB/MW perf layer, voice lead, presets), auval PASS. See `conchord_au/README.md`. |
| `conchord_au/prototype/` | Interactive HTML prototype of the GUI. `engine.js` = the v0.9 engine ported to pure functions; drives the chord viewer + keyboard live. Blueprint for the JUCE editor. `index-light.html` = current "Fun Light" design, `index.html` = older dark design (kept for A/B). See `conchord_au/prototype/README.md`. |
| `note_monitor_au/` | Standalone JUCE AU that visualizes incoming MIDI notes. Separate project, built with Ninja. |
| `CLAUDE.md` | Index of artefacts, docs, and sync rules (auto-loaded reference). |
| `README.md` | Short human front door. |
| `docs/user-manual.md` | User guide for the Scripter version (v0.9). |
| `docs/project-plan.md` | Roadmap: phases, priorities, open design questions. |
| `DESIGN.md` | Design artefact states (Figma master file, design system, prototype skins, GUI). |
| `DESIGN-SYSTEM.md` | Fun Light design tokens (colors, type, elevation, radii, spacing, components). |

## The Scripter execution model

Logic's Scripter calls global functions that we define. The important ones:

- `HandleMIDI(event)` — entrypoint for every MIDI event (line 136). Routes
  NoteOn/NoteOff to the chord/modifier/single/join paths and passes everything
  else (CC, sustain, aftertouch) through untouched.
- `ParameterChanged(param, value)` — when the user moves a plugin control (610).
  Rebuilds all held chords live. Ignores calls while a preset is loading.
- `Reset()` — transport stop / panic (632). Clears all state.
- `GetParameter("Name")` / `SetParameter(...)` — reads/writes control values.
- `SendMIDI` equivalents via `NoteOn`/`NoteOff` objects with `.send()` /
  `.sendAfterMilliseconds()` (wrapped in `sendNoteOn`/`sendNoteOff`).
- The `PluginParameters` array at the bottom declares all controls (see Parameters).

## Data model (state)

Defined in `// ===== STATE =====` (line 109).

| Variable | Role |
|---|---|
| `activeNotes` | `[{ inputPitch, channel, velocity, notes:[{pitch,delay}] }]` — one record per pressed chord key. The source for live rebuilds. |
| `soundingNotes` | `pitch -> number of records holding the tone`. **Reference counting** so that two chords sharing a tone don't kill each other's notes. |
| `heldKeys` | Physically pressed keys; drives the "On Keys Released" reset. |
| `joinExtras` | Held extra keys (Free Play / Notes Join Chord) woven into the chord as real chord tones. |
| `modWheelValue` | -1 = untouched; otherwise interpreted per target. |
| `pitchBendValue` | -1..+1. |
| `activeModifiers` | `zone index -> { velocity }` for active modifier keys. |
| `voiceLeadAnchor` | The last built chord's pitches; the next chord is placed closest to it. Updated **always** (even when Voice Lead is off) so the gesture can be engaged mid-sequence. |
| `applyingPreset` | Guard so preset loading doesn't recurse via `ParameterChanged`. |

`s` (settings) is the snapshot built by `getSettings()` (736) before every chord
build: `key, scaleSteps, size, inversion, voicing, bass, strumMs, colorName,
dim, dom7, voiceLead, outOfScale` etc. Modifiers mutate `s` before the chord is built.

## Signal flow: key → sounding chord

`startChord()` (434) → `buildChordNotes()` (819) → reference-counted send. The steps in
`buildChordNotes`:

1. **Scale degree:** `getScaleDegree(pitch, key, steps)` (954) maps the input note to
   a degree in the scale. Outside the scale → the `Out-of-Scale Keys` mode (Mute /
   Pass Through / Snap to Scale / Diminished / Chrom Bass). **Chrom Bass** snaps to
   the *nearest* scale degree for the chord's upper structure but swaps the root for
   the actually played chromatic note in the bass step (the `chromBass` flag) →
   slash chords / chromatic bass lines (C-E-G becomes C#-E-G). Upper tones (incl. any
   octave-doubled root) are kept; only the lowest root occurrence moves.
2. **Base chord:** stack scale degrees (`CHORD_BASE_TYPES`, 1172) — always diatonic.
3. **Color:** `applyChordColor()` (969) — Sus2/Sus4/No 3 etc.
4. **Size:** `extendDegreesForNumNotes()` (993) stacks up in octaves to the desired note count.
5. **Inversion:** `applyInversion()` (1005) — climbs through octaves instead of wrapping.
6. **Voice leading:** `applyVoiceLeading()` (1043) places the chord closest to `voiceLeadAnchor` (cost function `voiceLeadCost`, 1067).
7. **Voicing:** `applyVoicing()` (1098) — Close / Drop 2 / Drop 3 / Drop 2+4 / Spread.
8. **Bass + velocity:** bass note one octave below (unaffected by inversion/voicing); velocity scaling per Bass/Harmony %.
9. **Strum:** delays per tone; NoteOff mirrors the NoteOn's delay so a fast release never leaves a hanging note.

### Core invariants (= fixed bugs, do not touch)

- **Reference counting** (`soundingNotes`): shared tones between two held chords
  are not killed prematurely (v0.3 "root drops out").
- **Diff on live rebuild** (`updateAllActiveChords`, 677): only tones that *change*
  get NoteOff/NoteOn — common tones sustain through parameter/gesture changes.
- **Subtractive modifier release:** releasing a modifier key only sends NoteOff
  for tones it added; the held chord never re-attacks.
- **Strum-safe release:** strummed NoteOns mirror their delays onto the NoteOffs.

## The music theory layer

`// ===== SKALOR OCH ACKORD =====` (1132).

### Scales (`SCALE_TEMPLATES`, 1134)

Nine scales as interval strings (semitone steps summing to 12):
the seven church modes `Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian,
Locrian` plus `Harmonic Minor` and `Melodic Minor`.

### The circle-of-fifths connection

The seven modes are not an arbitrary list — they sit on the circle of fifths' axis.
Ordered by **brightness** (Lydian → Ionian → Mixolydian → Dorian → Aeolian
→ Phrygian → Locrian), each step to the right lowers exactly one tone, and that tone
sits a perfect fifth below the previous one. In C: F♯→F (♭4), B→B♭ (♭7), E→E♭ (♭3),
A→A♭ (♭6), D→D♭ (♭2), G→G♭ (♭5). The tones F, B, E, A, D, G are the circle of fifths
counterclockwise; each step = "one more ♭". Modes and the circle of fifths are thus
the same thing from two directions: the circle counts keys, the brightness axis
counts modes. **Dorian sits exactly in the middle** and is interval-symmetric
(its own mirror image).

### The two "opposite" tables

Both are geometric operations on that circle-of-fifths axis. The `Parallel` modifier
looks up the current scale's opposite and builds the chord from it at the same root
(modal borrowing). `Borrow Pairing` selects the table:

- **`MODE_OPPOSITES_MAJORMINOR`** (1148) — parallel switch major↔minor at the same root
  = **3 steps on the circle of fifths** (C major 0♭ ↔ C minor 3♭). Pairs mirror around
  the axis between Mixolydian and Dorian: Ionian↔Aeolian, Mixolydian↔Dorian,
  Lydian↔Phrygian. Locrian lacks a clean partner → borrows natural minor (Aeolian).
- **`MODE_OPPOSITES_INTERVAL`** (1160) — reverse the interval string = **mirror around
  Dorian**: Lydian↔Locrian, Ionian↔Phrygian, Mixolydian↔Aeolian, Dorian↔Dorian
  (self-mirror). Every mode gets a partner.

Harmonic/melodic minor don't sit on the clean mode axis (3-semitone step resp.
raised 7/6, not diatonic rotations), so both tables let them fall back toward Ionian.

## Modifier keys (the mod zone)

`MOD_ZONE_LOW = 48` (C2). The zone is `[lo, lo + ZONE_MODIFIERS.length - 1]` =
**C2–G♯2 (48–56)**, 9 keys (`getModifierZone`, 278). Notes in the zone play no
chords — they mutate `s` for every chord you play in the rest of the keyboard. They
*stack*, morph held chords live, and follow `Modifier Mode` (Hold/Latch).
`ZONE_MODIFIERS` (340), in order from C2:

| # | Key | Modifier | Effect |
|---|---|---|---|
| 0 | C2 | Sus 2 | `colorName = "Sus2"` (replaces the 3rd with the 2nd) |
| 1 | C♯2 | Dim | `s.dim` — ♭3 + ♭5 |
| 2 | D2 | Sus 4 | `colorName = "Sus4"` |
| 3 | D♯2 | 6th | `addDegree(s, 6)` |
| 4 | E2 | 7th | `addDegree(s, 7)` |
| 5 | F2 | Dom 7 | `s.dom7`, forces size ≥ 4 (major 3rd + ♭7) |
| 6 | F♯2 | Add 9 | `addDegree(s, 9)` additively |
| 7 | G2 | Parallel | borrow from the opposite scale (see above) |
| 8 | G♯2 | Voice Lead | `s.voiceLead = true` |

The map is written to the Scripter console on load (`traceModifierMap`, 406).

## Parameters (v0.9, `PluginParameters`, ~1252)

Preset · Key · Scale · Max Chord Size · Inversion · Inversion Range − · Inversion
Range + · Voicing · Bass Note · Bass Velocity % · Single Chord Mode · Free Play
Notes · Notes Join Chord · Strum (ms) · Strum Direction · Harmony Velocity % ·
Out-of-Scale Keys · Modifier Keys · Modifier Mode · Borrow Pairing · Pitch Bend ·
Pitch Bend Latch · Pitch Bend Reset · Mod Wheel · Mod Wheel Reset.

`PARAM_INDEX` (1399) is built from the array for name lookup. `PRESETS` (1212) are
named value sets; `applyPreset` pushes them with the `applyingPreset` guard.

## Function index

| Function | Line | Role |
|---|---|---|
| `HandleMIDI` | 136 | event dispatch |
| `handleModifierKey` | 288 | mod zone on/off + rebuild |
| `addDegree` | 331 | add a degree to `s` |
| `startChord` / `releaseRecord` | 434 / 470 | chord lifecycle |
| `startSingleNote` / `buildSingleNote` | 522 / 582 | Single Chord Mode |
| `addJoinExtra` / `currentJoinPitches` | 542 / 567 | Free Play / Notes Join |
| `sendNoteOn` / `sendNoteOff` | 646 / 659 | reference-counted send |
| `updateAllActiveChords` | 677 | live diff of held chords |
| `getSettings` | 736 | build `s` |
| `buildChordNotes` | 819 | the main pipeline |
| `getScaleDegree` / `buildScalePitchClassesRelative` | 954 / 943 | scale→degree |
| `applyChordColor` / `extendDegreesForNumNotes` | 969 / 993 | color/size |
| `applyInversion` / `applyVoiceLeading` / `applyVoicing` | 1005 / 1043 / 1098 | voicing |
