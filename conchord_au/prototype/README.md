# Conchord — interaktiv GUI-prototyp

Tidig **HTML-prototyp** av Conchords interface, byggd från Claude Design-skisserna
(play-yta fram, flip-to-setup för routing/modifier-map, chord viewer som centrum).
Syfte: validera **layout & funktion** innan vi porterar interfacet till en riktig
JUCE-editor i `conchord_au/`. Design är medvetet oslipad.

## Köra

Dubbelklicka `index.html` (funkar via `file://` — `engine.js` laddas som klassiskt
script). Eller servera mappen:

```sh
python3 -m http.server 8777 --directory conchord_au/prototype
# -> http://localhost:8777
```

## Vad som är LIVE (drivet av v0.9-motorn)

`engine.js` är conchord_09.js musikmotor portad till rena funktioner (ingen Logic-
runtime). Chord viewer och klaviatur räknas ut av riktig ackordlogik:

- **Grundton** — klicka en spel-tangent.
- **Modifierare** — klicka kryddzonen (Sus2, Dim, Sus4, 6th, 7th, Dom7, Add9,
  Parallel, Voice Lead). Stackar; speglar `ZONE_MODIFIERS`.
- **Chord Size, Inversion, Voicing, Out-of-Scale, Bass Note, Key, Scale.**
- **Chord Size vs Active Chord Size** — staplarna i viewern och tangenterna visar
  den FULLA storleken; toner som Pitch-hjulet gallrar bort tonas ut (ghost,
  ~20 % opacitet) i stället för att försvinna. Hjulets sub visar `aktiv / max`.
- **Lägen** — `CHORD` (max 8 toner, Humanize-stub) och `HARP` (max 12 + Strum)
  ändrar kontrollpanel + storlekstak. `2-FINGER`/`JAZZ` är fortfarande parkerade.
- **Pitch- &amp; Mod-hjulen** (vänster om klaviaturen) — kopplade via perf-lagret i
  `buildSettings` (PB→Chord Size, MW→Inversion; mappning identisk med
  `getSettings()` i conchord_09). Pitch: dubbelklick nollställer. Bägge "orörda"
  vid start = neutralt (full size / ingen inversion-offset).
- **Mod zone** — kan stängas av (försvinner då helt från klaviaturen) och flyttas:
  dra handtaget `⇆ MOD ZONE` så ändras `modZoneLow` (snäpper till vit tangent).
  Modifier-mappen på baksidan följer med.
- **Presets** (Harp/Piano/Pad/Pluck) — pushar samma karaktärsvärden som motorn.
- **Voice Lead** — lägger nästa ackord närmast det förra (`applyVoiceLeading`).
- **Borrow Pairing** (på baksidan) — byter Parallel-lånets tabell.

Klaviaturen har fast tangentbredd och scrollas med pilarna under tangenterna;
grundtonen visas full grön, aktiva ackordtoner grön 50 %, ghost-toner ~20 %.

## Vad som är STUB (layout, ej kopplat)

`2-FINGER`/`JAZZ`-lägena, routing-knapparna på baksidan (Latch/Reset/Mode/Remap —
själva PB/MW-mappningen är dock live). **Humanize** är en platshållare (to be
designed) i Chord-läget. **Ackordnamnet** i viewern är en preliminär detektor
(`detectChordName`) — inte motorlogik och inte i Scripter/AU än.

## engine.js — sanningskälla

Logiken speglar `conchord_09.js`. Ändras motorn där: uppdatera `engine.js` i samma
veva (samma princip som ARCHITECTURE.md). Node-test:

```sh
node -e 'const C=require("./engine.js"); /* buildSettings/buildChordNotes */'
```

## Mappning inför JUCE-porten

Editorn i `conchord_au/` ritar idag generiska kontroller. Den här prototypen visar
mål-layouten. Mappning prototyp → motor → AU-parameter (APVTS):

| UI-kontroll | state / `s` | conchord_09-param | Finns i AU idag? |
|---|---|---|---|
| Chord Size | `maxSize` → `s.size` | Max Chord Size | ✅ |
| Inversion | `inversion` | Inversion | ✅ |
| Strum (flyttad → harpläget) | `strumMs` | Strum (ms) | ✅ |
| Humanize | — | — | ❌ (to be designed) |
| Voicing | `voicing` | Voicing | ✅ |
| Out-of-scale | `outOfScale` | Out-of-Scale Keys | ✅ |
| Bass Note | `bass` | Bass Note | ✅ |
| Key / Scale | `key` / `scale` | Key / Scale | ✅ |
| Preset | `applyPreset` | Preset | ✅ |
| Kryddzon-tangenter | `activeModifiers` + `ZONE_MODIFIERS` | modifier-tangenter | ✅ (tangentzon + Chord Type behållen) |
| Pitch- / Mod-hjul | `pb` / `mw` (+`pbTarget`/`mwTarget`/`invRange*`) | Pitch Bend / Mod Wheel | ✅ (porterat till `ChordEngine::buildSettings`) |
| A/B · mode-flikar · Remap | — | — | ⏸ (2-FINGER/JAZZ stub; A/B & Remap parkerade) |
| Chord viewer-namn | `detectChordName` | — | ✅ (porterad till editorn; fortfarande prototyp-detektor) |

### Status: porten är gjord (Fas 3)

Allt ovan är nu byggt i `conchord_au/` (se dess README):

1. ✅ `PluginEditor` ritar den här layouten mot APVTS i native JUCE.
2. ✅ Processorn publicerar en trådsäker `UiState`-snapshot (SpinLock) av senast
   byggda ackordet; editorns Timer pollar den för live chord viewer + highlight.
3. ✅ Beslut: kryddzonen blev **tangentzon** (Scripter-paritet, Hold/Latch,
   flyttbar via `Mod Zone Low`) **och** `Chord Type`-parametern behölls som bas.
4. ⏸ Fortfarande parkerat: 2-FINGER/JAZZ-lägena, A/B, Remap, Humanize.
