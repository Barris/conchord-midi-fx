# ConchordAU

C++/JUCE-port av conchord-Scripter-motorn (conchord_09.js) som ett riktigt AU
MIDI-FX-plugg — nu med **egen native GUI** (Fas 3) som ritar prototypens
interface (`prototype/index.html`) mot APVTS.

Separat target från `note_monitor_au` med avsikt: monitorn släpper igenom MIDI
transparent (felsökningslins), Conchord *transformerar* den.

## Arkitektur

| Fil | Roll |
|---|---|
| `Source/ChordEngine.h` | Ren ackordmotor, **v0.9-paritet** med conchord_09.js. Header-only, JUCE-fri, unit-testbar. `buildSettings(RawParams)` + `buildChord()`. |
| `Source/PluginProcessor.{h,cpp}` | MIDI-FX-motorn: referensräknad notsändning, live-morf av hållna ackord, kryddzon (Hold/Latch), Pitch Bend / Mod Wheel, voice leading, presets. Publicerar en trådsäker `UiState`-snapshot. |
| `Source/PluginEditor.{h,cpp}` | Native editor i dark-studio-stil. Play-yta + flip-to-setup. En Timer pollar `UiState` och ritar chord viewer + tangent-highlight live. |

`ChordEngine.h` valideras mot prototypens `engine.js` (samma logik i JS) genom
att köra identiska scenarier i båda och diffa tonerna — håll dem i synk när
motorn ändras (samma princip som ARCHITECTURE.md).

## Vad som finns (v0.9-paritet)

- **Key / Scale** — 9 skalor (Ionian … Melodic Minor)
- **Chord Type** — Triad, 6th/7th/9th/11th/13th, Sus2, Sus4, Dom 7, Dim
  (bas-väljare; kryddzonen lägger sig **ovanpå**)
- **Kryddzon (Mod Zone)** — 9 tangenter från C2 (flyttbar, `Mod Zone Low`):
  Sus2 · Dim · Sus4 · 6th · 7th · Dom7 · Add9 · Parallel · Voice Lead.
  Stackar, morfar hållna ackord live, **Hold/Latch**, subtraktiv release.
- **Pitch Bend → Chord Size / Inversion** (Latch + Reset) och
  **Mod Wheel → Inversion / Chord Size** (Reset) med Inversion Range ±.
- **Voice Lead** — nästa ackord läggs närmast det förra.
- **Voicing** (Close … Spread), **Inversion** (-6..+6), **Max Chord Size** (1..12)
- **Bass Note** + **Bass / Harmony Velocity %**
- **Strum (ms)** + **Strum Direction** (speglade note-off-delays)
- **Out-of-Scale Keys** — Mute / Pass Through / Snap / Diminished / Chrom Bass
- **Borrow Pairing** (Parallel-lånets tabell), **Presets** (Harp/Piano/Pad/Pluck)
- Parametertillstånd sparas med projektet (APVTS state)

GUI:t kan dessutom spela ackord direkt (klicka klaviaturen) och utföra
PB/MW-gester med hjulen — bra för audition utan extern kontroller.

## Medvetet utelämnat (parkerat)

- Mode-flikarna **2-FINGER / JAZZ**, A/B och **Remap** (layout-stubbar).
- **Humanize** (to be designed) — platshållare i Chord-läget.
- **Single Chord Mode / Free Play / Notes Join Chord** — finns i Scripter-motorn,
  inte exponerade i den här editorn än (infrastrukturen för live-morf gör dem
  enkla att lägga till senare).
- Ackordnamnet i chord viewern är en preliminär detektor, inte motorlogik.

## Bygg (CLT + Ninja, inget Xcode)

```sh
cmake -G Ninja -B build-ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-ninja
```

`COPY_PLUGIN_AFTER_BUILD` installerar automatiskt till
`~/Library/Audio/Plug-Ins/Components/`. Validera: `auval -v aumi CnCh Cncd`.
I Logic: MIDI FX-slot → Conchord → ConchordAU. Standalone-appen (`FORMATS …
Standalone`) startar pluginen fristående för snabbtest.
