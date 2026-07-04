# Conchord — interactive GUI prototype

Interactive **HTML prototype** of Conchord's interface (play surface up front,
flip-to-setup for routing/modifier map, chord viewer at the center).
Purpose: validate **layout, interaction and design** before porting the interface
to the JUCE editor in `conchord_au/`.

Two skins of the same prototype:

- **`index-light.html`** — the current **"Fun Light"** design (product mockup name
  *Chordette*), styled per [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md) and the Figma
  design master file (see [DESIGN.md](../../DESIGN.md)).
- **`index.html`** — the earlier dark-studio design; frozen, kept for A/B
  comparison. This is the layout the current JUCE editor implements.

## Running

Double-click either HTML file (works via `file://` — `engine.js` loads as a classic
script). Or serve the folder:

```sh
python3 -m http.server 8777 --directory conchord_au/prototype
# -> http://localhost:8777
```

## What is LIVE (driven by the v0.9 engine)

`engine.js` is the conchord_09.js music engine ported to pure functions (no Logic
runtime). The chord viewer and keyboard are computed by real chord logic:

- **Root note** — click a playing key.
- **Modifiers** — click the mod zone (Sus2, Dim, Sus4, 6th, 7th, Dom7, Add9,
  Parallel, Voice Lead). They stack; mirrors `ZONE_MODIFIERS`.
- **Chord Size, Inversion, Voicing, Out-of-Scale, Bass Note, Key, Scale.**
- **Chord Size vs Active Chord Size** — the bars in the viewer and the keys show
  the FULL size; tones thinned out by the pitch wheel are faded (ghost,
  ~20 % opacity) instead of disappearing. The wheel's sub shows `active / max`.
- **Modes** — `CHORD` (max 8 tones, Humanize stub) and `HARP` (max 12 + Strum)
  change the control panel + size ceiling. `2-FINGER`/`JAZZ` are still parked.
- **Pitch & Mod wheels** (left of the keyboard) — wired through the perf layer in
  `buildSettings` (PB→Chord Size, MW→Inversion; mapping identical to
  `getSettings()` in conchord_09). Pitch: double-click resets. Both "untouched"
  at start = neutral (full size / no inversion offset).
- **Mod zone** — can be turned off (disappears entirely from the keyboard) and
  moved: drag the `⇆ MOD ZONE` handle to change `modZoneLow` (snaps to a white
  key). The modifier map on the back follows.
- **Presets** (Harp/Piano/Pad/Pluck) — push the same character values as the engine.
- **Voice Lead** — places the next chord closest to the previous one (`applyVoiceLeading`).
- **Borrow Pairing** (on the back) — switches the Parallel borrow table.

The keyboard has fixed key width and scrolls with the arrows below the keys;
the root shows full green, active chord tones green 50 %, ghost tones ~20 %.

## What is STUB (layout only, not wired)

The `2-FINGER`/`JAZZ` modes, the routing buttons on the back (Latch/Reset/Mode/Remap —
the PB/MW mapping itself is live, though). **Humanize** is a placeholder (to be
designed) in Chord mode. **The chord name** in the viewer is a preliminary detector
(`detectChordName`) — not engine logic and not in Scripter/AU yet.

## engine.js — keep in sync with the engine

The logic mirrors `conchord_09.js`. When the engine changes there: update `engine.js`
in the same effort (same principle as ARCHITECTURE.md). Node test:

```sh
node -e 'const C=require("./engine.js"); /* buildSettings/buildChordNotes */'
```

## Mapping for the JUCE port

This prototype shows the target layout. Mapping prototype → engine → AU parameter
(APVTS):

| UI control | state / `s` | conchord_09 param | In the AU today? |
|---|---|---|---|
| Chord Size | `maxSize` → `s.size` | Max Chord Size | ✅ |
| Inversion | `inversion` | Inversion | ✅ |
| Strum (moved → harp mode) | `strumMs` | Strum (ms) | ✅ |
| Humanize | — | — | ❌ (to be designed) |
| Voicing | `voicing` | Voicing | ✅ |
| Out-of-scale | `outOfScale` | Out-of-Scale Keys | ✅ |
| Bass Note | `bass` | Bass Note | ✅ |
| Key / Scale | `key` / `scale` | Key / Scale | ✅ |
| Preset | `applyPreset` | Preset | ✅ |
| Mod zone keys | `activeModifiers` + `ZONE_MODIFIERS` | modifier keys | ✅ (key zone + Chord Type kept) |
| Pitch / Mod wheels | `pb` / `mw` (+`pbTarget`/`mwTarget`/`invRange*`) | Pitch Bend / Mod Wheel | ✅ (ported to `ChordEngine::buildSettings`) |
| A/B · mode tabs · Remap | — | — | ⏸ (2-FINGER/JAZZ stub; A/B & Remap parked) |
| Chord viewer name | `detectChordName` | — | ✅ (ported to the editor; still the prototype detector) |

### Status: the port is done (Phase 3) — but of the dark skin

Everything above is built in `conchord_au/` (see its README):

1. ✅ `PluginEditor` draws this layout against APVTS in native JUCE — based on the
   **dark** `index.html`; the Fun Light reskin has not been ported yet (see
   [DESIGN.md](../../DESIGN.md)).
2. ✅ The processor publishes a thread-safe `UiState` snapshot (SpinLock) of the
   last built chord; the editor's Timer polls it for the live chord viewer + highlight.
3. ✅ Decision: the mod zone became a **key zone** (Scripter parity, Hold/Latch,
   movable via `Mod Zone Low`) **and** the `Chord Type` parameter was kept as base.
4. ⏸ Still parked: the 2-FINGER/JAZZ modes, A/B, Remap, Humanize.
