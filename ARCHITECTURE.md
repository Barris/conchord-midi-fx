# Conchord — arkitektur & funktion

Intern referens för hur motorn är byggd, så att man slipper läsa hela koden för
att svara på frågor om struktur, funktion och musikteori. README.md är den
*användarriktade* dokumentationen (installation, parameteröversikt); den här filen
är *utvecklarriktad*.

> **Sanningskälla:** den aktiva versionen är `conchord_09.js`. Äldre
> `conchord_0N.js` är frysta referenser. Radnummer nedan syftar på v0.9 och kan
> glida — sektionsrubrikerna (`// ===== ... =====`) är stabilare ankare.
> När motorn ändras: uppdatera den här filen i samma veva.

## Repo-karta

| Sökväg | Vad |
|---|---|
| `conchord_09.js` | Aktuell Scripter-motor (Logic Pro MIDI FX, JavaScript). |
| `conchord_0[3-8].js` | Tidigare versioner, sparade för referens. |
| `conchord_au/` | C++/JUCE-port av motorn som riktig AU MIDI-FX (Fas 1+2 klara, auval PASS, ingen GUI än). Se `conchord_au/README.md`. |
| `conchord_au/prototype/` | Interaktiv HTML-prototyp av GUI:t (Claude Design-skisserna). `engine.js` = v0.9-motorn portad till rena funktioner; driver chord viewer + klaviatur live. Källa inför JUCE-editorn. Se `conchord_au/prototype/README.md`. |
| `note_monitor_au/` | Fristående JUCE AU som visualiserar inkommande MIDI-noter. Eget projekt, byggs med Ninja. |
| `README.md` | Användardokumentation. |

## Scripter-körmodellen

Logics Scripter anropar globala funktioner som vi definierar. De viktiga:

- `HandleMIDI(event)` — entrypoint för varje MIDI-event (rad 136). Dirigerar
  NoteOn/NoteOff till ackord-/modifier-/single-/join-vägarna och släpper igenom
  allt annat (CC, sustain, aftertouch) orört.
- `ParameterChanged(param, value)` — när användaren rör en plugin-kontroll (610).
  Bygger om alla hållna ackord live. Ignorerar anrop medan en preset laddas.
- `Reset()` — transport stop / panik (632). Nollar all state.
- `GetParameter("Namn")` / `SetParameter(...)` — läser/skriver kontrollvärden.
- `SendMIDI`-motsvarigheter via `NoteOn`/`NoteOff`-objekt med `.send()` /
  `.sendAfterMilliseconds()` (inkapslat i `sendNoteOn`/`sendNoteOff`).
- `PluginParameters`-arrayen längst ner deklarerar alla kontroller (se Parametrar).

## Datamodell (state)

Definierad i `// ===== STATE =====` (rad 109).

| Variabel | Roll |
|---|---|
| `activeNotes` | `[{ inputPitch, channel, velocity, notes:[{pitch,delay}] }]` — ett record per nedtryckt ackordtangent. Källan för live-ombygge. |
| `soundingNotes` | `pitch -> antal record som håller tonen`. **Referensräkning** så att två ackord som delar en ton inte dödar varandras noter. |
| `heldKeys` | Fysiskt nedtryckta tangenter; driver "On Keys Released"-reset. |
| `joinExtras` | Hållna extratangenter (Free Play / Notes Join Chord) som vävs in i ackordet som äkta ackordtoner. |
| `modWheelValue` | -1 = orört; annars tolkat per mål. |
| `pitchBendValue` | -1..+1. |
| `activeModifiers` | `zonindex -> { velocity }` för aktiva kryddtangenter. |
| `voiceLeadAnchor` | Senast byggda ackordets tonhöjder; nästa ackord läggs närmast. Uppdateras **alltid** (även när Voice Lead är av) så gesten kan kopplas in mitt i en följd. |
| `applyingPreset` | Vakt så preset-laddning inte rekursar via `ParameterChanged`. |

`s` (settings) är ögonblicksbilden som byggs av `getSettings()` (736) inför varje
ackordbygge: `key, scaleSteps, size, inversion, voicing, bass, strumMs, colorName,
dim, dom7, voiceLead, outOfScale` m.fl. Modifierare muterar `s` innan ackordet byggs.

## Signalflöde: tangent → ljudande ackord

`startChord()` (434) → `buildChordNotes()` (819) → referensräknad utskick. Stegen i
`buildChordNotes`:

1. **Skala-grad:** `getScaleDegree(pitch, key, steps)` (954) mappar inputtonen till
   en grad i skalan. Utanför skalan → `Out-of-Scale Keys`-läget (Mute / Pass
   Through / Snap to Scale / Diminished).
2. **Grundackord:** stapla skalgrader (`CHORD_BASE_TYPES`, 1172) — alltid diatoniskt.
3. **Färg:** `applyChordColor()` (969) — Sus2/Sus4/No 3 m.m.
4. **Storlek:** `extendDegreesForNumNotes()` (993) staplar upp i oktaver till önskat antal toner.
5. **Inversion:** `applyInversion()` (1005) — klättrar genom oktaver i st f att wrappa.
6. **Voice leading:** `applyVoiceLeading()` (1043) lägger ackordet närmast `voiceLeadAnchor` (kostnadsfunktion `voiceLeadCost`, 1067).
7. **Voicing:** `applyVoicing()` (1098) — Close / Drop 2 / Drop 3 / Drop 2+4 / Spread.
8. **Bas + velocity:** basnot en oktav under (opåverkad av inversion/voicing); velocity-skalning per Bass/Harmony %.
9. **Strum:** delays per ton; NoteOff speglar NoteOns delay så snabb release aldrig lämnar hängande not.

### Centrala invarianter (= buggar som är fixade, rör ej)

- **Referensräkning** (`soundingNotes`): delade toner mellan två hållna ackord
  dödas inte i förtid (v0.3 "root drops out").
- **Diff vid live-ombygge** (`updateAllActiveChords`, 677): bara toner som *ändras*
  får NoteOff/NoteOn — gemensamma toner sustainar genom parameter-/geständringar.
- **Subtraktiv modifier-release:** att släppa en kryddtangent skickar bara NoteOff
  för toner den la till; det hållna ackordet re-attackerar aldrig.
- **Strum-säker release:** strummade NoteOns speglar sina delays på NoteOffs.

## Musikteorilagret

`// ===== SKALOR OCH ACKORD =====` (1132).

### Skalor (`SCALE_TEMPLATES`, 1134)

Nio skalor som intervallsträngar (halvtonssteg som summerar till 12):
de sju kyrkotonarterna `Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian,
Locrian` plus `Harmonic Minor` och `Melodic Minor`.

### Kvintcirkel-kopplingen

De sju modusen är inte en godtycklig lista — de ligger på kvintcirkelns axel.
Ordnar man dem efter **ljushet** (Lydian → Ionian → Mixolydian → Dorian → Aeolian
→ Phrygian → Locrian) sänker varje steg åt höger exakt en ton, och den tonen ligger
en ren kvint under den förra. I C: F♯→F (♭4), B→B♭ (♭7), E→E♭ (♭3), A→A♭ (♭6),
D→D♭ (♭2), G→G♭ (♭5). Tonerna F, B, E, A, D, G är kvintcirkeln moturs; varje steg =
"ett ♭ till". Modus och kvintcirkel är alltså samma sak från två håll: cirkeln
räknar tonarter, ljushetsaxeln räknar modus. **Dorian står exakt i mitten** och är
intervall-symmetriskt (sin egen spegelbild).

### De två "motsats"-tabellerna

Båda är geometriska operationer på just den kvintcirkel-axeln. `Parallel`-modifieraren
slår upp aktuell skalas motsats och bygger ackordet från den vid samma grundton
(modalt lån). `Borrow Pairing` väljer tabell:

- **`MODE_OPPOSITES_MAJORMINOR`** (1148) — parallellbyte dur↔moll vid samma grundton
  = **3 snäpp på kvintcirkeln** (C-dur 0♭ ↔ C-moll 3♭). Par speglas runt axeln mellan
  Mixolydian och Dorian: Ionian↔Aeolian, Mixolydian↔Dorian, Lydian↔Phrygian. Locrian
  saknar ren partner → låner naturlig moll (Aeolian).
- **`MODE_OPPOSITES_INTERVAL`** (1160) — vänd intervallsträngen = **spegel runt Dorian**:
  Lydian↔Locrian, Ionian↔Phrygian, Mixolydian↔Aeolian, Dorian↔Dorian (självspegel).
  Alla modus får en partner.

Harmonisk/melodisk moll ligger inte på den rena modus-axeln (3-halvtonssteg resp.
höjd 7/6, inte diatoniska rotationer), så båda tabellerna låter dem falla tillbaka
mot Ionian.

## Modifier-tangenter (kryddzonen)

`MOD_ZONE_LOW = 48` (C2). Zonen är `[lo, lo + ZONE_MODIFIERS.length - 1]` =
**C2–G♯2 (48–56)**, 9 tangenter (`getModifierZone`, 278). Toner i zonen spelar inga
ackord — de muterar `s` för varje ackord du spelar i resten av klaviaturen. De
*staplas*, morfar hållna ackord live, och följer `Modifier Mode` (Hold/Latch).
`ZONE_MODIFIERS` (340), i ordning från C2:

| # | Tangent | Modifierare | Effekt |
|---|---|---|---|
| 0 | C2 | Sus 2 | `colorName = "Sus2"` (ers. tersen med 2:an) |
| 1 | C♯2 | Dim | `s.dim` — ♭3 + ♭5 |
| 2 | D2 | Sus 4 | `colorName = "Sus4"` |
| 3 | D♯2 | 6th | `addDegree(s, 6)` |
| 4 | E2 | 7th | `addDegree(s, 7)` |
| 5 | F2 | Dom 7 | `s.dom7`, tvingar size ≥ 4 (dur-ters + ♭7) |
| 6 | F♯2 | Add 9 | `addDegree(s, 9)` additivt |
| 7 | G2 | Parallel | lån från motsatt skala (se ovan) |
| 8 | G♯2 | Voice Lead | `s.voiceLead = true` |

Kartan skrivs till Scripter-konsolen vid laddning (`traceModifierMap`, 406).

> README.md:s modifier-tabell är från v0.6 (Spread/9th/Strum, zon B1–G2) och är
> **inaktuell** mot v0.9. Den här tabellen gäller.

## Parametrar (v0.9, `PluginParameters`, ~1252)

Preset · Key · Scale · Max Chord Size · Inversion · Inversion Range − · Inversion
Range + · Voicing · Bass Note · Bass Velocity % · Single Chord Mode · Free Play
Notes · Notes Join Chord · Strum (ms) · Strum Direction · Harmony Velocity % ·
Out-of-Scale Keys · Modifier Keys · Modifier Mode · Borrow Pairing · Pitch Bend ·
Pitch Bend Latch · Pitch Bend Reset · Mod Wheel · Mod Wheel Reset.

`PARAM_INDEX` (1399) byggs från arrayen för namnuppslag. `PRESETS` (1212) är namngivna
värdesatser; `applyPreset` pushar dem med `applyingPreset`-vakten.

## Funktionsindex

| Funktion | Rad | Roll |
|---|---|---|
| `HandleMIDI` | 136 | event-dispatch |
| `handleModifierKey` | 288 | kryddzon på/av + ombygge |
| `addDegree` | 331 | lägg till grad i `s` |
| `startChord` / `releaseRecord` | 434 / 470 | ackord-livscykel |
| `startSingleNote` / `buildSingleNote` | 522 / 582 | Single Chord Mode |
| `addJoinExtra` / `currentJoinPitches` | 542 / 567 | Free Play / Notes Join |
| `sendNoteOn` / `sendNoteOff` | 646 / 659 | referensräknad utskick |
| `updateAllActiveChords` | 677 | live-diff av hållna ackord |
| `getSettings` | 736 | bygg `s` |
| `buildChordNotes` | 819 | huvudpipelinen |
| `getScaleDegree` / `buildScalePitchClassesRelative` | 954 / 943 | skala→grad |
| `applyChordColor` / `extendDegreesForNumNotes` | 969 / 993 | färg/storlek |
| `applyInversion` / `applyVoiceLeading` / `applyVoicing` | 1005 / 1043 / 1098 | röstläggning |
