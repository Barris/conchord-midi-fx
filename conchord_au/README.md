# ConchordAU

C++/JUCE-port av conchord-Scripter-motorn som ett riktigt AU MIDI-FX-plugg.
Prototyp (Fas 1 + 2): ackordmotorn + parametrar, **ingen egen GUI** — JUCEs
generiska editor ritar en kontroll per parameter.

Separat target från `note_monitor_au` med avsikt: monitorn släpper igenom MIDI
transparent (felsökningslins), Conchord *transformerar* den. Tanken är att slå
ihop dem senare när motorn är bevisad.

## Vad som finns (porterat från conchord_08.js)

- **Key / Scale** — 9 skalor (Ionian … Melodic Minor)
- **Chord Type** — Triad, 6th/7th/9th/11th/13th, Sus2, Sus4, **Dom 7**, Dim
  (i Scripter sätts dessa av modifier-tangenter; här är de en parameter)
- **Max Chord Size**, **Inversion** (-6..+6, klättrar utan wrap)
- **Voicing** — Close, Drop 2, Drop 3, Drop 2+4, Spread
- **Bass Note** + **Bass / Harmony Velocity %**
- **Strum (ms)** + **Strum Direction** (speglade note-off-delays)
- **Out-of-Scale Keys** — Mute / Pass Through / Snap to Scale
- Parametertillstånd sparas med projektet (APVTS state)

## Medvetet utelämnat i prototypen

Perf/interaktiva lager som kräver realtids-CC eller tangentzoner:
Pitch Bend / Mod Wheel → Size/Inversion, modifier-tangenter, presets,
Single Chord Mode, Free Play, Notes Join Chord.

## Bygg (CLT + Ninja, inget Xcode)

```sh
cmake -G Ninja -B build-ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-ninja
```

`COPY_PLUGIN_AFTER_BUILD` installerar automatiskt till
`~/Library/Audio/Plug-Ins/Components/`. I Logic: MIDI FX-slot → Conchord →
ConchordAU.
