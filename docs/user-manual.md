# Conchord — User Guide (Scripter, v0.9)

A chord generator / MIDI transformer for Logic Pro's **Scripter** MIDI FX plugin,
inspired by the [Orchid](https://telepathicinstruments.com) by Telepathic Instruments.
Current version: `conchord_09.js`. (The AU plugin has the same engine; see
[conchord_au/README.md](../conchord_au/README.md) for its build/install.)

Play single notes (e.g. with Logic's Musical Typing) and get full diatonic chords
with control over chord type, color, voicing, inversion, strum and bass — all
re-voiced **live** while you hold the keys.

## Install

1. In Logic, add **MIDI FX → Scripter** on a software instrument track.
2. Click **Open Script in Editor**.
3. Paste the contents of `conchord_09.js`, press **Run Script**.
4. Save it as a Scripter preset (top of the plugin window) so you can recall it anywhere.

## Parameters (v0.9)

| Parameter | What it does |
|---|---|
| **Preset** | Named settings bundles (Harp / Piano / Pad / Pluck). |
| **Key / Scale** | The diatonic context. 7 modes + Harmonic & Melodic Minor. |
| **Max Chord Size** | How many notes to stack (cycles the chord type upward in octaves). Also the ceiling for the Pitch Bend size sweep. |
| **Inversion** | −6 … +6. Climbs through octaves instead of wrapping, so high values keep moving the voicing up. |
| **Inversion Range − / +** | Bounds for how far the PB/MW gestures sweep inversion. |
| **Voicing** | Close, Drop 2, Drop 3, Drop 2+4, Spread. |
| **Bass Note** | Adds the root one octave below; unaffected by inversion/voicing. |
| **Bass Velocity %** | Velocity scaling for the bass note. |
| **Single Chord Mode** | One chord at a time — a new key releases the previous chord. |
| **Free Play Notes** | Extra held keys play as plain notes alongside the chord. |
| **Notes Join Chord** | Extra held keys are woven into the chord as real chord tones. |
| **Strum (ms)** | Delay between chord notes, 0–200 ms. Direction Up or Down. |
| **Harmony Velocity %** | The lowest note keeps your played velocity; the rest are scaled. |
| **Out-of-Scale Keys** | Mute, Pass Through (bare note), Snap to Scale (fold to nearest scale tone), Diminished (build a dim chord on the chromatic note), or Chrom Bass (diatonic upper structure over the chromatic note as bass — slash chords / chromatic bass lines). |
| **Modifier Keys** | On/off for the modifier-key zone (see below). |
| **Modifier Mode** | Hold (active while held) or Latch (toggles per press, for one-handed play). |
| **Borrow Pairing** | Which "opposite" the Parallel key borrows from — Major / Minor or Interval Mirror (see below). |
| **Pitch Bend** | Off / Chord Size / Inversion, plus **Latch** and **Reset** options. |
| **Mod Wheel** | Off / Inversion / Chord Size, plus **Reset** option. |

## Performance controls

The point of Conchord is playing chords *expressively* from a plain keyboard:

- **Pitch Bend → Chord Size** (default): bends how many of the stacked notes sound.
  Held chords grow and shrink live.
- **Mod Wheel → Inversion** (default): rolls the voicing up through inversions,
  retriggering only the notes that change.
- Pitch Bend has a **Latch** option (holds the peak of the gesture; flick the other
  way to start a new gesture); both controllers have **Reset** options (Never /
  On New Chord / On Keys Released).
- Set either target to **Off** to pass the controller through to the instrument instead.

All other MIDI (sustain pedal, CCs, aftertouch) is passed through untouched.

## Modifier keys ("mod zone")

A fixed key zone starting at **C2** (9 keys, **C2–G♯2**) is reserved as silent
"modifier keys": notes in that zone don't play chords, they reshape every chord you
play in the rest of the keyboard. They **stack**, morph held chords live, and follow
the **Modifier Mode** (Hold or Latch). Releasing a modifier is purely subtractive —
it stops only the notes it added and never re-attacks the notes already ringing.
Turn the whole zone off with **Modifier Keys**. The map is printed to the Scripter
console on load.

| Key | Modifier | What it does |
|---|---|---|
| C2 | **Sus 2** | Replace the 3rd with the 2nd. |
| C♯2 | **Dim** | Force a diminished chord — ♭3 and ♭5. |
| D2 | **Sus 4** | Replace the 3rd with the 4th. |
| D♯2 | **6th** | Add the 6th degree. |
| E2 | **7th** | Add the 7th degree. |
| F2 | **Dom 7** | Dominant 7th — major 3rd + ♭7, forces size ≥ 4. |
| F♯2 | **Add 9** | Add the 9th degree (additive). |
| G2 | **Parallel** | Momentarily borrow from the scale's "opposite" mode — see below. |
| G♯2 | **Voice Lead** | Next chord voiced closest to the previous one. |

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

## How it works (short version)

- Input notes are mapped to a **scale degree** in the selected key/scale, and the
  chord is built by stacking scale degrees (so chords are always diatonic).
- Held notes are tracked; when any parameter or performance control changes, each
  held chord is recomputed and **diffed** — only notes that changed get
  NoteOff/NoteOn, so common tones sustain through changes.
- Sounding pitches are **reference-counted**, so two held chords that share a note
  won't kill each other's notes.
- Strummed NoteOns mirror their delays onto the NoteOffs, so a fast release can
  never leave a stuck note behind.

Full engine internals: [architecture.md](architecture.md).
