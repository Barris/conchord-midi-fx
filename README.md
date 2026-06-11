# Conchord

A chord generator / MIDI transformer for Logic Pro's **Scripter** MIDI FX plugin,
inspired by the [Orchid](https://telepathicinstruments.com) by Telepathic Instruments.

Play single notes (e.g. with Logic's Musical Typing) and get full diatonic chords
with control over chord type, color, voicing, inversion, strum and bass — all
re-voiced **live** while you hold the keys.

## Install

1. In Logic, add **MIDI FX → Scripter** on a software instrument track.
2. Click **Open Script in Editor**.
3. Paste the contents of `conchord_04.js`, press **Run Script**.
4. Save it as a Scripter preset (top of the plugin window) so you can recall it anywhere.

## Parameters

| Parameter | What it does |
|---|---|
| **Key / Scale** | The diatonic context. 7 modes + Harmonic & Melodic Minor. |
| **Chord Type** | Stack to build from: Triad, 6th, 7th, 9th, 11th, 13th. |
| **Color** | Plain, Sus2, Sus4 (replaces all 3rds), No 3. |
| **Chord Size** | How many notes to stack (cycles the chord type upward in octaves). |
| **Inversion** | −6 … +6. Climbs through octaves instead of wrapping, so high values keep moving the voicing up. |
| **Voicing** | Close, Drop 2, Drop 3, Drop 2+4, Spread. |
| **Bass Note** | Adds the root one octave below; unaffected by inversion/voicing. |
| **Strum (ms)** | Delay between chord notes, 0–200 ms. Direction Up or Down. |
| **Harmony Velocity %** | The lowest note keeps your played velocity; the rest are scaled. |
| **Out-of-Scale Keys** | Mute, Pass Through (plays the bare note), or Snap to Scale (folds down to the nearest scale tone). |
| **Mod Wheel** | Off / Chord Size / Inversion — see below. |
| **Pitch Bend** | Off / Inversion / Chord Size — see below. |

## Performance controls

The point of Conchord is playing chords *expressively* from a plain keyboard:

- **Mod Wheel → Chord Size** (default): the wheel scales how many of the stacked
  notes sound, from 1 up to the Chord Size setting. Held chords grow and shrink live.
- **Pitch Bend → Inversion** (default): bends the voicing up/down by up to ±6
  inversions around the slider setting, retriggering only the notes that change.
- Set either to **Off** to pass the controller through to the instrument instead.

All other MIDI (sustain pedal, CCs, aftertouch) is passed through untouched.

## How it works

- Input notes are mapped to a **scale degree** in the selected key/scale, and the
  chord is built by stacking scale degrees (so chords are always diatonic).
- Held notes are tracked in `activeNotes`; when any parameter or performance
  control changes, each held chord is recomputed and **diffed** — only notes that
  changed get NoteOff/NoteOn, so common tones sustain through changes.
- Sounding pitches are **reference-counted**, so two held chords that share a note
  won't kill each other's notes (this was the "root drops out" bug in v0.3).
- Strummed NoteOns mirror their delays onto the NoteOffs, so a fast release can
  never leave a stuck note behind.

## Roadmap / ideas

- Latch mode (chord holds until the next key).
- Per-scale-degree custom chord matrices (define your own voicing per key in the scale).
- "Inversion dispersion" — thinning out individual notes at high inversions.
- Single-note additions on top of a held chord (toggle).
- Humanize (random timing/velocity per chord note).

## Files

- `conchord_04.js` — current version.
- `conchord_03.js` — previous experiment (kept for reference).
