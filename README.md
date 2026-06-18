# Conchord

A chord generator / MIDI transformer for Logic Pro's **Scripter** MIDI FX plugin,
inspired by the [Orchid](https://telepathicinstruments.com) by Telepathic Instruments.

Play single notes (e.g. with Logic's Musical Typing) and get full diatonic chords
with control over chord type, color, voicing, inversion, strum and bass — all
re-voiced **live** while you hold the keys.

## Install

1. In Logic, add **MIDI FX → Scripter** on a software instrument track.
2. Click **Open Script in Editor**.
3. Paste the contents of `conchord_06.js`, press **Run Script**.
4. Save it as a Scripter preset (top of the plugin window) so you can recall it anywhere.

## Parameters

| Parameter | What it does |
|---|---|
| **Key / Scale** | The diatonic context. 7 modes + Harmonic & Melodic Minor. |
| **Chord Size** | How many notes to stack (cycles the chord type upward in octaves). |
| **Inversion** | −6 … +6. Climbs through octaves instead of wrapping, so high values keep moving the voicing up. |
| **Voicing** | Close, Drop 2, Drop 3, Drop 2+4, Spread. |
| **Bass Note** | Adds the root one octave below; unaffected by inversion/voicing. |
| **Strum (ms)** | Delay between chord notes, 0–200 ms. Direction Up or Down. |
| **Harmony Velocity %** | The lowest note keeps your played velocity; the rest are scaled. |
| **Out-of-Scale Keys** | Mute, Pass Through (plays the bare note), or Snap to Scale (folds down to the nearest scale tone). |
| **Mod Wheel** | Off / Chord Size / Inversion — see below. |
| **Pitch Bend** | Off / Inversion / Chord Size — see below. |
| **Modifier Keys** | On/off for the modifier-key zone (a fixed B1–G2 range, see below). |
| **Modifier Mode** | Hold (active while held) or Latch (toggles per press, for one-handed play). |
| **Borrow Pairing** | Which "opposite" the Parallel key borrows from — Major / Minor or Interval Mirror (see below). |

## Performance controls

The point of Conchord is playing chords *expressively* from a plain keyboard:

- **Pitch Bend → Chord Size** (default): bends how many of the stacked notes sound
  around the Chord Size setting. Held chords grow and shrink live.
- **Mod Wheel → Inversion** (default): rolls the voicing up by up to +6 inversions
  around the slider setting, retriggering only the notes that change.
- Each controller has a **Latch** option (holds the peak of the gesture; flick the
  other way to start a new gesture) and a **Reset** option (Never / On New Chord /
  On Keys Released).
- Set either target to **Off** to pass the controller through to the instrument instead.

All other MIDI (sustain pedal, CCs, aftertouch) is passed through untouched.

## Modifier keys

A fixed key zone (**B1–G2**) is reserved as silent "modifier keys": notes in that zone
don't play chords, they reshape every chord you play in the rest of the keyboard. They
**stack**, morph held chords live, and follow the **Modifier Mode** (Hold or Latch).
Releasing a modifier is purely subtractive — it stops only the notes it added and never
re-attacks the notes already ringing. Turn the whole zone off with **Modifier Keys**.
The map is printed to the Scripter console on load.

| Key (default) | Modifier | What it does |
|---|---|---|
| B1 | **Spread** | Spread voicing (every other note dropped an octave). |
| C2 | **Sus 2** | Replace the 3rd with the 2nd. |
| C#2 | **Dim** | Force a diminished chord — minor 3rd (♭3) and diminished 5th (♭5). |
| D2 | **Sus 4** | Replace the 3rd with the 4th. |
| D#2 | **6th** | Build a 6th chord (forces size ≥ 4). |
| E2 | **7th** | Build a 7th chord (forces size ≥ 4). |
| F2 | **9th** | Build a 9th chord (forces size ≥ 5). |
| F#2 | **Parallel** | Momentarily borrow from the scale's "opposite" mode — see below. |
| G2 | **Strum** | Strum the chord; key velocity sets the speed (soft = slow, hard = tight). |

## Borrowing / opposite modes

Hold **Parallel** and the chords you play are built from the current scale's *opposite*
mode at the **same root** — modal interchange on a key. Release to return. **Borrow
Pairing** chooses how "opposite" is defined:

- **Major / Minor** — folds at the major/minor 3rd: Ionian↔Aeolian (the classic
  major↔minor), Mixolydian↔Dorian, Lydian↔Phrygian. (Locrian has no partner, so it
  borrows natural minor.)
- **Interval Mirror** — reverses the scale's interval string: Lydian↔Locrian,
  Ionian↔Phrygian, Mixolydian↔Aeolian, and Dorian is its own opposite. Every mode pairs.

Harmonic and Melodic Minor have no clean church-mode mirror, so both borrow toward Ionian.

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
- Releasing a modifier key runs the same diff but **subtractively** — it only sends
  NoteOffs for the notes it added, so the held chord never re-attacks.

## Roadmap / ideas

- Chord latch (chord holds until the next key). Note: *Modifier Mode → Latch* already
  latches the modifier keys; this is about sustaining the chord itself.
- Per-scale-degree custom chord matrices (define your own voicing per key in the scale).
- "Inversion dispersion" — thinning out individual notes at high inversions.
- Single-note additions on top of a held chord (toggle).
- Humanize (random timing/velocity per chord note).

## Files

- `conchord_06.js` — current version.
- `conchord_05.js`, `conchord_04.js`, `conchord_03.js` — previous versions (kept for reference).
