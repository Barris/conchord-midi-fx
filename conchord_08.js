// Logic Conchord v.0.8
/* ==== CHANGE LOG ====
 * v0.8
 * - NYTT: Preset-meny överst — paketerade karaktärsinställningar (Harp, Piano,
 *         Pad, Pluck). Väljs ett preset pushas en knippe värden ut till de andra
 *         parametrarna med SetParameter. Bara KARAKTÄRS-parametrarna rörs
 *         (size/voicing/strum/bass/velocity m.m.) — Key/Scale och de musikaliska
 *         valen lämnas orörda, så ett preset byter ljudkaraktär utan att kapa
 *         tonart eller skala. Första valet "—" gör inget (och låter dig välja om
 *         samma preset för att re-applya efter att du vridit en ratt manuellt).
 *         applyingPreset-guard hindrar att de SetParameter-kedjade anropen
 *         rekursar i ParameterChanged.
 * v0.7
 * - FIX: perf-styrt Chord Size-svep golvas nu på 2 toner (utom när Max Chord
 *        Size är 1 i GUI:t). Vid size 1 byggdes ackordet till ren grundton FÖRE
 *        inversion -> applyInversion early-returnade och inversionPerf hoppades
 *        över, så all inversionsrörelse tappades och basen hoppade.
 * - NYTT: Inversion Range -/+ (0..6 var) — separat hur långt hjul/bend -> Inversion
 *         sveper under (-) resp över (+) Inversion-slidern. Slidern = vilo/basläge,
 *         asymmetriskt svep (0/0 = perf rör inte inversionen). Default 3/3 -> ±3.
 * - NYTT: Notes Join Chord (kräver Free Play) — extra tangenter vävs in i
 *         ackordet som äkta ackordtoner och deltar i size/inversion/voicing-svep
 *         (i st f statiska enstaka noter). Hålls melodin kvar när ackordtangenten
 *         byts re-harmoniseras den in i det nya ackordet. Av = statiska noter.
 * - BORT: Mod Wheel Latch — hjulet spårar nu alltid direkt, så ett svep följer
 *         hjulet fritt upp OCH ned (latchen låste gestens topp och blockerade
 *         återvägen). Pitch Bend Latch finns kvar för det fjädrande reglaget.
 * - FIX: inversion i Drop-voicingarna (Drop 2 m.fl.) flyttade flera toner per
 *        steg — voicingen valde sin ton positionellt EFTER rotationen. Voicing
 *        körs nu FÖRE inversion -> ett inversionssteg flyttar exakt en ton.
 * - NYTT: Free Play Notes (kräver Single Chord Mode) — toggle: första tangenten
 *         blir ett ackord, övriga hållna tangenter läggs på som enstaka noter
 *         (ovanpå eller under, följer Out-of-Scale Keys). När ackordtangenten
 *         släpps tystnar ackordet, enstaka noter ligger kvar, nästa anslag
 *         bygger nytt ackord. Av = klassiskt mono (ny tangent ersätter ackordet,
 *         last-note retrigger).
 * - FIX: inversion höll inte nottalet konstant — oktavdubblade ackord (t.ex.
 *        treklang utdragen till 7 toner) krockade i dedupe och tappade toner.
 *        Inversion lyfter nu understa tonen FÖRBI toppen (nästa lediga oktav)
 *        i st f exakt +12, och dedupe körs FÖRE inversion -> konstant nottal.
 * - ÄNDRAT: Chord Size heter nu MAX Chord Size och är ett tak. Pitch Bend ->
 *        Chord Size sveper hela slaget 1..max (full ner = 1, full upp = max,
 *        vila = mitten) i st f additivt runt slidern, så slider 7 ger 1..7.
 * - FIX: bass note räknas nu som ackordets första ton (Bass Note på -> bas +
 *        ackordtoner = Chord Size, inte Size + 1)
 * v0.6
 * - NYTT: Modifier Keys — en fast tangentzon (B1..G2) tystas
 *         och blir "kryddtangenter" som färgar alla andra ackord:
 * - NYTT: Borrow Pairing — vilken "motsats" Parallel lånar från:
 *         Major / Minor (Ionian<->Aeolian m.fl.) eller Interval Mirror
 *         (vänd intervallsträngen: Ionian<->Phrygian, Dorian<->Dorian)
 * - NYTT: Modifier Mode Hold/Latch — Latch togglar per tryck (enhandsspel)
 * - NYTT: modifiers stackar och morphar hållna ackord live
 * - ÄNDRAT: släpp av en modifier är rent subtraktivt — bara tillagda toner
 *           tystas, originaltonerna återanslås (retriggas) aldrig
 * - NYTT: zonkartan skrivs till Scripter-konsolen när zonen ändras
 * v0.5
 * - NYTT: Single Chord Mode retriggar som en monosynt (last-note priority):
 *         släpps översta tangenten återtriggas senast hållna ackord
 * - NYTT: Latch & Reset per performance-kontroll: Latch håller gestens
 *         topp (flick åt motsatt håll = ny gest; unipolärt hjul håller
 *         bara toppen), Reset släpper värdet Never / On New Chord /
 *         On Keys Released (mono-retrigger räknas inte som nytt anslag)
 * - FIX: orört modhjul gav +6 inversion när hjulet mappats till Inversion
 *        (init-värdet var tänkt för Chord Size) -> -1-sentinel, tolkas per mål
 * - FIX: hjul/bend-inversion på 1-notsackord blev ren oktavtransponering
 *        -> perf-offset hoppar över enstaka noter, UI-slidern påverkas inte
 * - ÄNDRAT: default-mappning: Pitch Bend -> Chord Size, Mod Wheel -> Inversion
 * v0.4
 * - FIX: ParameterChanged läste odefinierade globaler (baseTypeName/colorName)
 *        -> ackordet föll alltid tillbaka till triad vid live-uppdatering
 * - FIX: noter som delades mellan två ackord dödades av varandras NoteOff
 *        -> referensräknad notspårning (soundingNotes)
 * - FIX: out-of-scale-noter gav NaN-pitchar (scalePCs[-1])
 * - FIX: modhjul på 0 vid start gav alltid 1-notsackord (init = 1.0)
 * - NYTT: negativa inversions, klättrar uppåt/nedåt utan wrap (-6..+6)
 * - NYTT: voicings (Close, Drop 2, Drop 3, Drop 2+4, Spread)
 * - NYTT: strum (0-200 ms, upp/ned) med speglade NoteOff-delays
 * - NYTT: bass note (root -1 oktav, påverkas inte av inversion/voicing)
 * - NYTT: Bass Velocity % (skalar basnotens anslag separat)
 * - NYTT: Harmony Velocity % (lägsta tonen behåller spelad velocity)
 * - NYTT: Out-of-scale-läge: Mute / Pass Through / Snap to Scale
 * - NYTT: valbara mål för modhjul & pitch bend (Off / Chord Size / Inversion)
 * - NYTT: Harmonic & Melodic Minor
 * - NYTT: Reset() städar alla noter vid stop/bypass
 * - NYTT: Single Chord Mode — mono-läge, ny tangent släpper föregående ackord
 */

var NeedsTimingInfo = true; // krävs för sendAfterMilliseconds

// ===== STATE =====

var activeNotes = []; // [{ inputPitch, channel, velocity, notes: [{pitch, delay}] }]
var soundingNotes = {}; // pitch -> antal records som håller tonen
var heldKeys = []; // fysiskt nedtryckta tangenter, räknas för "On Keys Released"-reset

// Free Play + Notes Join Chord: hållna extra-tangenter vävs in i ACKORDET som
// äkta ackordtoner (deltar i size/inversion/voicing) i st f egna isSingle-records.
// [{ inputPitch, pitch (skala-snappad), velocity, channel }]
var joinExtras = [];

var modWheelValue = -1; // -1 = orört hjul; tolkas per mål (full Chord Size, 0 Inversion)
var pitchBendValue = 0.0; // -1..+1

var activeModifiers = {}; // zonindex -> { velocity } för aktiva kryddtangenter

// true medan applyPreset pushar värden -> ParameterChanged ignorerar de
// SetParameter-kedjade anropen så att de inte rekursar eller dubbel-uppdaterar.
var applyingPreset = false;

// ===== HANDLEMIDI =====

function HandleMIDI(event) {
  // MOD WHEEL
  if (event instanceof ControlChange && event.number === 1) {
    if (GetParameter("Mod Wheel") === 0) {
      event.send(); // inget mål -> släpp igenom
      return;
    }
    // mod wheel spårar alltid direkt -> ett svep följer hjulet fritt upp OCH ned
    modWheelValue = event.value / 127;
    updateAllActiveChords();
    return;
  }

  // PITCH BEND
  if (event instanceof PitchBend) {
    if (GetParameter("Pitch Bend") === 0) {
      event.send();
      return;
    }
    var raw = event.value / 8192; // -1..+1 (ungefär)

    if (GetParameter("Pitch Bend Latch") > 0) {
      // Latch: håll gestens topp i stället för att fjädra tillbaka till 0.
      // - utåtgående rörelse uppdaterar värdet
      // - rörelse tillbaka mot mitten (inkl. fjädring till 0) ignoreras
      // - rörelse åt motsatt håll startar en ny gest (liten flick åt andra
      //   hållet ~= nollställning, eftersom små värden rundas till 0 steg)
      if (raw === 0) return;
      var newGesture = pitchBendValue === 0 || raw > 0 !== pitchBendValue > 0;
      if (!newGesture && Math.abs(raw) <= Math.abs(pitchBendValue)) return;
      pitchBendValue = raw;
    } else {
      pitchBendValue = raw;
    }

    updateAllActiveChords();
    return;
  }

  // MODIFIER KEYS — tangenter i zonen spelar inget själva, de kryddar
  // de andra ackorden. Kollas före vanliga NoteOn/NoteOff så att de
  // varken hamnar i heldKeys eller triggar perf-resets.
  if (
    (event instanceof NoteOn || event instanceof NoteOff) &&
    isInModifierZone(event.pitch)
  ) {
    handleModifierKey(event);
    return;
  }

  // NOTE OFF (kolla före NoteOn — NoteOn med velocity 0 räknas också som off)
  if (
    event instanceof NoteOff ||
    (event instanceof NoteOn && event.velocity === 0)
  ) {
    removeHeldKey(event.pitch);
    // joinad extra-ton? -> dra ur joinExtras och bygg om ackordet (släpper tonen)
    if (removeJoinExtra(event.pitch)) {
      updateAllActiveChords();
      if (heldKeys.length === 0) {
        if (GetParameter("Pitch Bend Reset") === 2) pitchBendValue = 0;
        if (GetParameter("Mod Wheel Reset") === 2) modWheelValue = -1;
      }
      return;
    }
    // släpp tangentens record (ackord ELLER enstaka not). Med Free Play på
    // tystnar ackordet medan ev. hållna enstaka noter ligger kvar; nästa anslag
    // bygger ett nytt ackord (se NoteOn).
    var wasSounding = releaseRecord(event.pitch);
    // Klassiskt mono (Free Play av): släpps det ljudande ackordet, retrigga
    // senast hållna tangent (last-note priority). Free Play retriggar aldrig.
    if (
      wasSounding &&
      GetParameter("Single Chord Mode") > 0 &&
      GetParameter("Free Play Notes") === 0
    ) {
      retriggerLastHeld();
    }
    // Reset-läge "On Keys Released": släpp perf-värdena när allt är tyst
    if (heldKeys.length === 0) {
      if (GetParameter("Pitch Bend Reset") === 2) pitchBendValue = 0;
      if (GetParameter("Mod Wheel Reset") === 2) modWheelValue = -1;
    }
    return;
  }

  // NOTE ON
  if (event instanceof NoteOn) {
    removeHeldKey(event.pitch); // skydd mot dubbla NoteOn utan NoteOff
    heldKeys.push({
      pitch: event.pitch,
      velocity: event.velocity,
      channel: event.channel,
    });

    var singleChord = GetParameter("Single Chord Mode") > 0;
    var freePlay = singleChord && GetParameter("Free Play Notes") > 0;

    if (freePlay && hasActiveChord()) {
      if (GetParameter("Notes Join Chord") > 0) {
        // Notes Join Chord: väv in tangenten i ackordet som äkta ackordton — den
        // deltar i size/inversion/voicing. Lagras i joinExtras, ackordet byggs om.
        addJoinExtra(event.pitch, event.velocity, event.channel);
      } else {
        // Free Play: ett ackord låter redan -> den här tangenten läggs på som en
        // enstaka not (ovanpå eller under), statisk. Perf-reset hoppas över.
        startSingleNote(event.pitch, event.velocity, event.channel);
      }
      return;
    }

    if (freePlay) {
      // inget aktivt ackord -> den här tangenten blir ackordet; lämna ev. hållna
      // enstaka noter kvar (vi minns att de inte är ackord).
      releaseRecord(event.pitch);
    } else if (singleChord) {
      // klassiskt mono: bara ett ackord i taget -> släpp allt som låter
      releaseAllRecords();
    } else {
      // poly: om samma tangent redan håller ett ackord, släpp det först
      releaseRecord(event.pitch);
    }

    // Reset-läge "On New Chord": nytt anslag nollställer perf-värdena
    if (GetParameter("Pitch Bend Reset") === 1) pitchBendValue = 0;
    if (GetParameter("Mod Wheel Reset") === 1) modWheelValue = -1;

    startChord(event.pitch, event.velocity, event.channel);
    return;
  }

  // allt annat (sustain, aftertouch, övriga CC) släpps igenom
  event.send();
}

// ===== MODIFIER KEYS =====

// Kryddzonen är fast: börjar på C2 och spänner exakt över antalet kryddtangenter
// och räknar uppåt därifrån. Inte inställbar — gamla preset kan annars ligga
// kvar på en felaktig range och ge döda tangenter.
var MOD_ZONE_LOW = 48; // C2

function getModifierZone() {
  return { lo: MOD_ZONE_LOW, hi: MOD_ZONE_LOW + ZONE_MODIFIERS.length - 1 };
}

function isInModifierZone(pitch) {
  if (GetParameter("Modifier Keys") === 0) return false;
  var zone = getModifierZone();
  return pitch >= zone.lo && pitch <= zone.hi;
}

function handleModifierKey(event) {
  var zone = getModifierZone();
  // ingen wrap: tangenter bortom sista kryddan gör inget (zonen kan vara bredare)
  var idx = event.pitch - zone.lo;
  if (idx < 0 || idx >= ZONE_MODIFIERS.length) return;
  var isOff =
    event instanceof NoteOff ||
    (event instanceof NoteOn && event.velocity === 0);

  var turnedOff;
  if (GetParameter("Modifier Mode") === 1) {
    // Latch: varje tryck togglar, släpp ignoreras
    if (isOff) return;
    if (activeModifiers[idx]) {
      delete activeModifiers[idx];
      turnedOff = true;
    } else {
      activeModifiers[idx] = { velocity: event.velocity };
      turnedOff = false;
    }
  } else {
    // Hold: aktiv så länge tangenten hålls
    if (isOff) {
      delete activeModifiers[idx];
      turnedOff = true;
    } else {
      activeModifiers[idx] = { velocity: event.velocity };
      turnedOff = false;
    }
  }

  // hållna ackord morphar direkt; vid släpp bara tysta tillagda toner
  updateAllActiveChords(turnedOff);
}

// Kryddorna i zonordning, nedifrån och upp (idx 0 = lägsta tangenten i zonen).
// apply muterar settings-objektet; vel är kryddtangentens anslag (1-127) för
// de velocity-känsliga. Längden här = antalet kryddtangenter; zonen är fast
// och börjar på B1 (se MOD_ZONE_LOW), så B1..G2 med dagens 9 kryddor.
// Lägg till en skalgrad i baskackordet utan att skriva över de andra, så att
// flera extension-modifiers (6th/7th/Add 9) stackar additivt. Skapar alltid en
// NY array (muterar aldrig den delade Triad-mallen) och växer Chord Size så att
// alla grader får plats (extendDegreesForNumNotes trunkerar annars).
function addDegree(s, deg) {
  if (s.baseDegrees.indexOf(deg) === -1) {
    s.baseDegrees = s.baseDegrees.concat([deg]).sort(function (a, b) {
      return a - b;
    });
  }
  if (s.size < s.baseDegrees.length) s.size = s.baseDegrees.length;
}

var ZONE_MODIFIERS = [
  {
    name: "Sus 2",
    apply: function (s, vel) {
      s.colorName = "Sus2";
    },
  },
  {
    name: "Dim", // tvingar förminskat ackord: liten ters (+3) och förminskad kvint (+6)
    apply: function (s, vel) {
      s.dim = true;
    },
  },
  {
    name: "Sus 4",
    apply: function (s, vel) {
      s.colorName = "Sus4";
    },
  },
  {
    name: "6th",
    apply: function (s, vel) {
      addDegree(s, 6);
    },
  },
  {
    name: "7th",
    apply: function (s, vel) {
      addDegree(s, 7);
    },
  },
  {
    name: "Dom 7", // tvingar dominant7: dur-ters (+4), ren kvint (+7), liten septim (+10)
    apply: function (s, vel) {
      s.dom7 = true;
      if (s.size < 4) s.size = 4; // annars hörs ingen septim
    },
  },
  {
    name: "Add 9", // lägger till nian additivt (utan att tvinga in septim)
    apply: function (s, vel) {
      addDegree(s, 9);
    },
  },
  {
    name: "Parallel", // momentärt lån: bygg ackord från motsatt skala (samma grundton)
    apply: function (s, vel) {
      var curName = SCALE_KEYS[GetParameter("Scale")];
      var table =
        GetParameter("Borrow Pairing") === 1
          ? MODE_OPPOSITES_INTERVAL
          : MODE_OPPOSITES_MAJORMINOR;
      var oppName = table[curName] || curName;
      s.scaleSteps = SCALE_TEMPLATES[oppName];
    },
  },
];

// Skriv zonkartan till konsolen så man ser vilken tangent som gör vad.
var lastTracedZone = "";
function traceModifierMap() {
  var enabled = GetParameter("Modifier Keys") > 0;
  var zone = getModifierZone();
  var mode = GetParameter("Modifier Mode") === 1 ? "Latch" : "Hold";
  var sig = enabled + ":" + zone.lo + ":" + zone.hi + ":" + mode;
  if (sig === lastTracedZone) return;
  lastTracedZone = sig;

  if (!enabled) {
    Trace("Modifier Keys: OFF");
    return;
  }
  Trace(
    "Modifier Keys: " +
      noteName(zone.lo) +
      ".." +
      noteName(zone.hi) +
      " (" +
      mode +
      ")",
  );
  var count = Math.min(zone.hi - zone.lo + 1, ZONE_MODIFIERS.length);
  for (var i = 0; i < count; i++) {
    Trace("  " + noteName(zone.lo + i) + " -> " + ZONE_MODIFIERS[i].name);
  }
}

// Bygger och triggar ett ackord från en tangent. Returnerar false vid mute.
function startChord(inputPitch, velocity, channel) {
  var s = getSettings();
  // nytt ackord ärver hållna join-extras (melodin re-harmoniseras till ackordet)
  var built = buildChordNotes(inputPitch, velocity, s, currentJoinPitches());
  if (!built) return false; // out-of-scale + Mute

  var record = {
    inputPitch: inputPitch,
    channel: channel,
    velocity: velocity,
    notes: [],
  };

  // strum-ordning: Up = nedifrån och upp, Down = uppifrån och ned
  var ordered = built.slice(0);
  if (!s.strumUp) ordered.reverse();

  for (var i = 0; i < ordered.length; i++) {
    var delay = s.strumMs > 0 ? i * s.strumMs : 0;
    sendNoteOn(ordered[i].pitch, ordered[i].velocity, channel, delay);
    record.notes.push({ pitch: ordered[i].pitch, delay: delay });
  }

  activeNotes.push(record);
  return true;
}

// Returnerar true om tangenten höll ett ljudande ackord.
function releaseRecord(inputPitch) {
  for (var i = 0; i < activeNotes.length; i++) {
    if (activeNotes[i].inputPitch === inputPitch) {
      var record = activeNotes[i];
      for (var j = 0; j < record.notes.length; j++) {
        // spegla strum-delayen så att en delayad NoteOn alltid får sin NoteOff efteråt
        sendNoteOff(
          record.notes[j].pitch,
          record.channel,
          record.notes[j].delay,
        );
      }
      activeNotes.splice(i, 1);
      return true;
    }
  }
  return false;
}

function removeHeldKey(pitch) {
  for (var i = heldKeys.length - 1; i >= 0; i--) {
    if (heldKeys[i].pitch === pitch) heldKeys.splice(i, 1);
  }
}

function releaseAllRecords() {
  while (activeNotes.length > 0) {
    releaseRecord(activeNotes[0].inputPitch);
  }
}

// Klassiskt mono (Free Play av): spela senast hållna tangent igen (last-note
// priority). Mutade out-of-scale-tangenter hoppas över men ligger kvar i stacken.
function retriggerLastHeld() {
  for (var i = heldKeys.length - 1; i >= 0; i--) {
    var k = heldKeys[i];
    if (startChord(k.pitch, k.velocity, k.channel)) return;
  }
}

// Single Chord Mode: finns det ett ljudande ackord just nu? Enstaka noter
// (isSingle) räknas inte — bara dessa avgör om nästa tangent blir ett ackord.
function hasActiveChord() {
  for (var i = 0; i < activeNotes.length; i++) {
    if (!activeNotes[i].isSingle) return true;
  }
  return false;
}

// Spelar en enstaka not ovanpå/under ett redan ljudande ackord (Single Chord
// Mode). Noten följer skalans out-of-scale-läge men byggs aldrig ut till ett
// ackord och morphas inte av reglage/modifiers. Returnerar false vid mute.
function startSingleNote(inputPitch, velocity, channel) {
  var s = getSettings();
  var note = buildSingleNote(inputPitch, velocity, s);
  if (!note) return false; // out-of-scale + Mute

  sendNoteOn(note.pitch, note.velocity, channel, 0);
  activeNotes.push({
    inputPitch: inputPitch,
    channel: channel,
    velocity: velocity,
    isSingle: true,
    notes: [{ pitch: note.pitch, delay: 0 }],
  });
  return true;
}

// ===== JOINADE EXTRA-TONER (Free Play + Notes Join Chord) =====

// Lägg en hållen extra-tangent i joinExtras och bygg om ackordet så tonen vävs
// in i voicing/inversion. Skala-snappas via buildSingleNote (Mute -> ignoreras).
function addJoinExtra(inputPitch, velocity, channel) {
  var note = buildSingleNote(inputPitch, velocity, getSettings());
  if (!note) return; // out-of-scale + Mute
  joinExtras.push({
    inputPitch: inputPitch,
    pitch: note.pitch,
    velocity: velocity,
    channel: channel,
  });
  updateAllActiveChords();
}

// Dra ur en joinad extra-tangent. Returnerar true om någon togs bort.
function removeJoinExtra(inputPitch) {
  for (var i = joinExtras.length - 1; i >= 0; i--) {
    if (joinExtras[i].inputPitch === inputPitch) {
      joinExtras.splice(i, 1);
      return true;
    }
  }
  return false;
}

// Pitcharna som ska vävas in i ackordet just nu, eller null när läget är av
// (då bygger buildChordNotes ackordet utan extras, som vanligt).
function currentJoinPitches() {
  if (
    joinExtras.length === 0 ||
    GetParameter("Single Chord Mode") === 0 ||
    GetParameter("Free Play Notes") === 0 ||
    GetParameter("Notes Join Chord") === 0
  )
    return null;
  var out = [];
  for (var i = 0; i < joinExtras.length; i++) out.push(joinExtras[i].pitch);
  return out;
}

// En enstaka not enligt Out-of-Scale Keys: Mute (null), Pass Through (rått)
// eller Snap to Scale (leta nedåt till närmaste skalton). Skalatoner spelas rått.
function buildSingleNote(inputPitch, velocity, s) {
  if (getScaleDegree(inputPitch, s.key, s.scaleSteps).degree !== -1)
    return { pitch: inputPitch, velocity: velocity };
  if (s.outOfScale === 0) return null; // Mute
  if (s.outOfScale === 1) return { pitch: inputPitch, velocity: velocity }; // Pass Through
  // Snap to Scale: leta nedåt tills vi hittar en skalton
  for (var t = 1; t <= 11; t++) {
    if (getScaleDegree(inputPitch - t, s.key, s.scaleSteps).degree !== -1)
      return { pitch: inputPitch - t, velocity: velocity };
  }
  return { pitch: inputPitch, velocity: velocity };
}

// Pusha ett presets värden ut till de andra parametrarna. Guarden gör att de
// SetParameter-kedjade ParameterChanged-anropen tystas; en enda
// updateAllActiveChords() körs när allt är satt.
function applyPreset(name) {
  var p = PRESETS[name];
  if (!p) return;
  applyingPreset = true;
  for (var k in p) SetParameter(k, p[k]);
  applyingPreset = false;
  updateAllActiveChords();
}

function ParameterChanged(param, value) {
  // medan ett preset appliceras: ignorera de kedjade anropen (applyPreset
  // gör en samlad updateAllActiveChords() själv när allt är satt)
  if (applyingPreset) return;

  // Preset-menyn: index 0 = "—" gör inget, annars applicera valt preset
  if (param === PARAM_INDEX["Preset"]) {
    if (value > 0) applyPreset(PRESET_KEYS[value - 1]);
    return;
  }

  // av/på eller läge kan lämna modifiers hängande -> rensa och visa kartan
  if (
    param === PARAM_INDEX["Modifier Keys"] ||
    param === PARAM_INDEX["Modifier Mode"]
  ) {
    activeModifiers = {};
    traceModifierMap();
  }
  updateAllActiveChords();
}

function Reset() {
  MIDI.allNotesOff();
  activeNotes = [];
  soundingNotes = {};
  heldKeys = [];
  activeModifiers = {};
  joinExtras = [];
}

// ===== REFERENSRÄKNAD NOTSÄNDNING =====
// Skickar bara NoteOn när tonen inte redan låter, och NoteOff när
// sista hållaren släpper -> två ackord kan dela toner utan att döda varandra.

function sendNoteOn(pitch, velocity, channel, delayMs) {
  if (pitch < 0 || pitch > 127) return;
  soundingNotes[pitch] = (soundingNotes[pitch] || 0) + 1;
  if (soundingNotes[pitch] > 1) return; // låter redan

  var on = new NoteOn();
  on.pitch = pitch;
  on.velocity = Math.max(1, Math.min(127, Math.round(velocity)));
  on.channel = channel;
  if (delayMs > 0) on.sendAfterMilliseconds(delayMs);
  else on.send();
}

function sendNoteOff(pitch, channel, delayMs) {
  if (!soundingNotes[pitch]) return;
  soundingNotes[pitch]--;
  if (soundingNotes[pitch] > 0) return; // någon annan håller fortfarande tonen
  delete soundingNotes[pitch];

  var off = new NoteOff();
  off.pitch = pitch;
  off.velocity = 64;
  off.channel = channel;
  if (delayMs > 0) off.sendAfterMilliseconds(delayMs);
  else off.send();
}

// ===== LIVE-UPPDATERING AV HÅLLNA ACKORD =====

// suppressAdd: släpp av en modifier ska bara tysta tillagda toner — aldrig
// återanslå (retrigga) originaltonerna eller fylla i toner som inte redan låter.
function updateAllActiveChords(suppressAdd) {
  if (activeNotes.length === 0) return;
  var s = getSettings();

  for (var i = 0; i < activeNotes.length; i++) {
    var record = activeNotes[i];
    if (record.isSingle) continue; // enstaka noter morphas inte av reglage/modifiers
    var built = buildChordNotes(
      record.inputPitch,
      record.velocity,
      s,
      currentJoinPitches(),
    );
    var newNotes = built || []; // null (mute) -> tysta allt men behåll recordet

    // NoteOff för gamla toner som inte längre ska vara med
    for (var j = 0; j < record.notes.length; j++) {
      if (!pitchInNotes(record.notes[j].pitch, newNotes)) {
        sendNoteOff(
          record.notes[j].pitch,
          record.channel,
          record.notes[j].delay,
        );
      }
    }

    // NoteOn för nya toner, behåll delay på de som redan låter.
    // Vid släpp (suppressAdd) hoppar vi över toner som inte redan låter.
    var updated = [];
    for (var j = 0; j < newNotes.length; j++) {
      var existing = findNote(newNotes[j].pitch, record.notes);
      if (existing) {
        updated.push(existing);
      } else if (!suppressAdd) {
        sendNoteOn(newNotes[j].pitch, newNotes[j].velocity, record.channel, 0);
        updated.push({ pitch: newNotes[j].pitch, delay: 0 });
      }
    }
    record.notes = updated;
  }
}

function pitchInNotes(pitch, notes) {
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].pitch === pitch) return true;
  }
  return false;
}

function findNote(pitch, notes) {
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].pitch === pitch) return notes[i];
  }
  return null;
}

// ===== AKTUELLA INSTÄLLNINGAR =====

function getSettings() {
  var s = {};
  s.key = GetParameter("Key");
  s.scaleSteps = SCALE_TEMPLATES[SCALE_KEYS[GetParameter("Scale")]];
  // bas: vanlig treklang utan färg — kryddtangenterna (6th/7th/9th, Sus/Dim) styr resten
  s.baseDegrees = CHORD_BASE_TYPES["Triad"];
  s.colorName = "Plain";
  s.size = GetParameter("Max Chord Size"); // slidern = MAX; perf-kontroller tunnar ut nedåt
  s.inversion = GetParameter("Inversion"); // UI-slidern
  s.inversionPerf = 0; // offset från modhjul/pitch bend — hoppas över för 1-notsackord
  s.voicing = VOICING_NAMES[GetParameter("Voicing")];
  s.bass = GetParameter("Bass Note") > 0;
  s.bassVel = GetParameter("Bass Velocity %") / 100;
  s.strumMs = GetParameter("Strum (ms)");
  s.strumUp = GetParameter("Strum Direction") === 0;
  s.harmonyVel = GetParameter("Harmony Velocity %") / 100;
  s.outOfScale = GetParameter("Out-of-Scale Keys"); // 0=Mute 1=Pass 2=Snap
  s.shimmer = 0; // 0..1, sätts av Shimmer-modifiern
  s.dim = false; // sätts av Dim-modifiern: tvingar förminskat ackord
  s.dom7 = false; // sätts av Dom 7-modifiern: tvingar dominant7-ackord

  // modifier-tangenter kryddar ovanpå reglagen (i zonordning, senare vinner)
  // — före hjul/bend så att Chord Size-hjulet fortfarande kan skala storleken
  if (GetParameter("Modifier Keys") > 0) {
    var idxs = Object.keys(activeModifiers)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    for (var m = 0; m < idxs.length; m++) {
      ZONE_MODIFIERS[idxs[m]].apply(s, activeModifiers[idxs[m]].velocity);
    }
  }

  // performance-kontroller ovanpå reglagen
  // modWheelValue -1 (orört hjul) -> full Chord Size, ingen inversion-offset
  // Inversion Range -/+ = hur långt perf-kontrollen sveper under/över Inversion-
  // slidern. Asymmetriskt: neråtrörelse skalas av "-", uppåt av "+".
  var invDown = GetParameter("Inversion Range -");
  var invUp = GetParameter("Inversion Range +");

  // Golv för de perf-styrda Chord Size-svepen. Vid size 1 byggs ackordet till
  // ren grundton FÖRE inversion -> applyInversion early-returnar (length<=1) och
  // inversionPerf hoppas över (chord.length>1-guarden), så all inversionsrörelse
  // tappas och basen hoppar. Vid size 2 finns minst en ton att rotera och
  // voicingen håller ihop. Floor = 2, utom när GUI:ts Max Chord Size är 1 (då
  // har spelaren uttryckligen valt enstaka noter).
  var perfSizeFloor = GetParameter("Max Chord Size") <= 1 ? 1 : 2;

  var mwTarget = GetParameter("Mod Wheel"); // 0=Off 1=Chord Size 2=Inversion
  if (mwTarget === 1) {
    var mw = modWheelValue < 0 ? 1.0 : modWheelValue;
    s.size = Math.max(perfSizeFloor, Math.ceil(s.size * mw));
  }
  if (mwTarget === 2 && modWheelValue >= 0) {
    // unipolärt hjul centrerat: ett svep går neråt -> neutral -> uppåt i samma
    // rörelse. Mitten (0.5) = ingen offset, botten = -invDown, toppen = +invUp.
    // Orört hjul (-1) ger ingen offset (guarden ovan).
    var mw = (modWheelValue - 0.5) * 2; // -1..+1
    s.inversionPerf += Math.round(mw * (mw >= 0 ? invUp : invDown));
  }

  var pbTarget = GetParameter("Pitch Bend"); // 0=Off 1=Inversion 2=Chord Size
  // full ner = -invDown, full upp = +invUp, vila (0) = ingen offset.
  if (pbTarget === 1)
    s.inversionPerf += Math.round(
      pitchBendValue * (pitchBendValue >= 0 ? invUp : invDown),
    );
  if (pbTarget === 2) {
    // Chord Size-slidern = MAX. Pitch bend sveper hela slaget floor..max: full
    // ner = floor (2, eller 1 om Max Chord Size är 1), full upp = max. Bipolärt
    // -> vila (mitten) = halva storleken. Slider 7 ger spannet 2..7.
    var pbAmt = (pitchBendValue + 1) / 2; // -1..+1 -> 0..1
    s.size = Math.max(perfSizeFloor, Math.ceil(s.size * pbAmt));
  }

  return s;
}

// ===== ACKORDBYGGE =====
// Returnerar [{pitch, velocity}] sorterad nedifrån och upp, eller null (mute).

function buildChordNotes(inputPitch, velocity, s, extras) {
  var root = inputPitch;
  var degreeInfo = getScaleDegree(root, s.key, s.scaleSteps);

  if (degreeInfo.degree === -1) {
    if (s.outOfScale === 0) return null; // Mute
    if (s.outOfScale === 1) return [{ pitch: inputPitch, velocity: velocity }]; // Pass Through
    // Snap to Scale: leta nedåt tills vi hittar en skalton
    for (var t = 1; t <= 11 && degreeInfo.degree === -1; t++) {
      root = inputPitch - t;
      degreeInfo = getScaleDegree(root, s.key, s.scaleSteps);
    }
  }

  var baseDegree = degreeInfo.degree;
  var scalePCs = degreeInfo.scalePCs;

  // basnoten räknas som ackordets första ton: med Bass Note på bygger vi en
  // ton färre här, så att bas + ackordtoner = Chord Size (i st f Size + 1).
  var coloredDegrees = applyChordColor(s.baseDegrees, s.colorName);
  var numChordNotes = s.bass ? Math.max(0, s.size - 1) : s.size;
  var degreesForNotes = extendDegreesForNumNotes(coloredDegrees, numChordNotes);

  // skalgrader -> halvtoner
  var chord = [];
  for (var i = 0; i < degreesForNotes.length; i++) {
    var deg = degreesForNotes[i]; // 1,3,5,8,10...
    var absDegree = baseDegree + (deg - 1);
    var wrappedDegree = absDegree % 7;
    var octaveOffset = Math.floor(absDegree / 7);
    var intervalFromBase =
      scalePCs[wrappedDegree] - scalePCs[baseDegree] + 12 * octaveOffset;
    var pitch = root + intervalFromBase;
    if (s.dim) {
      // tvinga förminskat: ett symmetriskt staplat torn av små terser (+3 per
      // ackordton), oavsett skalgrad. i är ackordtonens stapelindex (treklang),
      // så ton 0,1,2,3,... hamnar på +0,+3,+6,+9,... — en äkta dim-stapel.
      // (Tidigare flyttades bara 3:an/5:an till ♭3/♭5 medan oktavtonen, deg 8,
      // låg kvar på +12 i stället för dim7 +9 — därför hoppade topptonen en
      // oktav upp så fort ackordet hade fler än tre noter.)
      pitch = root + 3 * i;
    } else if (s.dom7) {
      // tvinga dominant7: dur-ters (+4), ren kvint (+7), liten septim (+10),
      // oavsett skalgrad. Mönstret upprepas per oktav (i % 4 + oktavlyft) så
      // högre ackordtoner staplar 9/11/13 ovanpå utan att topptonen hoppar.
      var DOM7 = [0, 4, 7, 10];
      pitch = root + DOM7[i % 4] + 12 * Math.floor(i / 4);
    }
    chord.push(pitch);
  }

  // Notes Join Chord: väv in de hållna extra-tonerna FÖRE voicing/inversion så
  // att de behandlas som äkta ackordtoner och deltar i size/inversion/voicing.
  if (extras && extras.length) {
    for (var e = 0; e < extras.length; e++) chord.push(extras[e]);
  }

  // dedupe FÖRE inversion så rotationen roterar unika toner -> konstant nottal
  chord.sort(function (a, b) {
    return a - b;
  });
  chord = dedupe(chord);

  // perf-offset (hjul/bend/Lift) hoppar över 1-notsackord — där blir
  // "inversion" bara oktavtransponering. UI-slidern appliceras alltid.
  var inversion = s.inversion;
  if (chord.length > 1) inversion += s.inversionPerf;
  // Voicing FÖRE inversion: annars väljer Drop-voicingarna sin ton positionellt
  // (näst översta) EFTER rotationen, så ett inversionssteg både roterar OCH
  // byter vilken ton som dras ned -> flera toner hoppar samtidigt. Med voicing
  // först roterar applyInversion en färdig-voicad form och flyttar exakt en ton
  // per steg. Vid inversion 0 är resultatet identiskt oavsett ordning.
  chord = applyVoicing(chord, s.voicing);
  chord = applyInversion(chord, inversion);

  chord.sort(function (a, b) {
    return a - b;
  });
  chord = dedupe(chord);

  if (s.bass) {
    var bassPitch = root - 12;
    if (chord.indexOf(bassPitch) === -1) chord.unshift(bassPitch);
  }

  // Shimmer: dubbla toppnoten en oktav upp, styrkan följer kryddtangentens anslag
  var shimmerPitch = null;
  if (s.shimmer > 0 && chord.length > 0) {
    shimmerPitch = chord[chord.length - 1] + 12;
    if (chord.indexOf(shimmerPitch) === -1) chord.push(shimmerPitch);
    else shimmerPitch = null;
  }

  // basnoten (index 0 när Bass Note är på) skalas av Bass Velocity %, annars
  // behåller lägsta tonen spelad velocity; resten skalas av Harmony Velocity %.
  var notes = [];
  for (var i = 0; i < chord.length; i++) {
    if (chord[i] < 0 || chord[i] > 127) continue;
    var v;
    if (i === 0) v = s.bass ? velocity * s.bassVel : velocity;
    else v = velocity * s.harmonyVel;
    if (chord[i] === shimmerPitch) v = velocity * s.harmonyVel * s.shimmer;
    notes.push({ pitch: chord[i], velocity: v });
  }
  return notes;
}

// ===== HJÄLPFUNKTIONER FÖR SKALA & GRADER =====

function buildScalePitchClassesRelative(steps) {
  var pcs = [0];
  var sum = 0;
  // sista steget tar oss tillbaka till oktaven, så vi behöver bara 6 till
  for (var i = 0; i < steps.length - 1; i++) {
    sum += steps[i];
    pcs.push(sum);
  }
  return pcs; // t.ex. [0,2,4,5,7,9,11]
}

function getScaleDegree(pitch, key, steps) {
  var scalePCs = buildScalePitchClassesRelative(steps);
  var pcRel = ((pitch % 12) - key + 12) % 12;
  var degree = -1;
  for (var i = 0; i < scalePCs.length; i++) {
    if (scalePCs[i] === pcRel) {
      degree = i;
      break;
    }
  }
  return { degree: degree, scalePCs: scalePCs };
}

// ===== ACKORD-FORMNING =====

function applyChordColor(baseDegrees, colorName) {
  var degrees = baseDegrees.slice(0);

  if (colorName === "Sus2" || colorName === "Sus4") {
    var replaceWith = colorName === "Sus2" ? 2 : 4;
    for (var i = 0; i < degrees.length; i++) {
      // träffa även terser en oktav upp (grad 10 = 3 + 7)
      if ((degrees[i] - 1) % 7 === 2) {
        degrees[i] = replaceWith + (degrees[i] - 3);
      }
    }
  }

  if (colorName === "No 3") {
    var filtered = [];
    for (var i = 0; i < degrees.length; i++) {
      if ((degrees[i] - 1) % 7 !== 2) filtered.push(degrees[i]);
    }
    if (filtered.length > 0) degrees = filtered;
  }

  return degrees;
}

function extendDegreesForNumNotes(baseDegrees, numNotes) {
  var result = [];
  var len = baseDegrees.length;
  for (var i = 0; i < numNotes; i++) {
    var octave = Math.floor(i / len); // varje varv = +7 skalgrader
    result.push(baseDegrees[i % len] + 7 * octave);
  }
  return result;
}

// Negativa inversions klättrar nedåt, positiva uppåt — utan wrap,
// så höga värden fortsätter upp i oktaverna.
function applyInversion(chordPitches, inversion) {
  var chord = chordPitches.slice(0);
  if (chord.length <= 1) return chord;

  chord.sort(function (a, b) {
    return a - b;
  });

  // Lyft understa tonen FÖRBI toppen (nästa lediga oktav) i st f exakt +12 —
  // och spegelvänt neråt. Vid oktavdubblade ackord (t.ex. treklang utdragen
  // till 7 toner = C E G C E G C) skulle ett rakt +12 landa på en redan
  // ljudande ton och dedupe slänga den -> nottalet ändrades med inversion.
  // Genom att alltid placera tonen ovanför nuvarande topp (under botten neråt)
  // krockar den aldrig och nottalet hålls konstant.
  var steps = inversion;
  while (steps > 0) {
    var lo = chord.shift();
    var top = chord[chord.length - 1];
    while (lo <= top) lo += 12;
    chord.push(lo);
    steps--;
  }
  while (steps < 0) {
    var hi = chord.pop();
    var bot = chord[0];
    while (hi >= bot) hi -= 12;
    chord.unshift(hi);
    steps++;
  }
  return chord;
}

// Förutsätter sorterad stigande input
function applyVoicing(chordPitches, voicingName) {
  var chord = chordPitches.slice(0);
  var len = chord.length;

  if (voicingName === "Drop 2" && len >= 3) {
    chord[len - 2] -= 12;
  } else if (voicingName === "Drop 3" && len >= 4) {
    chord[len - 3] -= 12;
  } else if (voicingName === "Drop 2+4" && len >= 4) {
    chord[len - 2] -= 12;
    chord[len - 4] -= 12;
  } else if (voicingName === "Spread" && len >= 3) {
    // varannan ton NEDIFRÅN räknat sänks en oktav (index 1,3,5...).
    // Ankras nedifrån så att grundton och lägre ackordtoner ligger kvar när
    // ackordet växer uppåt — annars flippar pariteten på vilka toner som
    // sänks så fort nottalet ändras, och ett treklang->septim-morf skulle
    // byta oktav på ALLA toner (retrigga allt) i stället för att lägga till en.
    for (var i = 1; i < len; i += 2) {
      chord[i] -= 12;
    }
  }
  return chord;
}

function dedupe(sortedPitches) {
  var result = [];
  for (var i = 0; i < sortedPitches.length; i++) {
    if (i === 0 || sortedPitches[i] !== sortedPitches[i - 1]) {
      result.push(sortedPitches[i]);
    }
  }
  return result;
}

// ===== SKALOR OCH ACKORD =====

var SCALE_TEMPLATES = {
  Ionian: [2, 2, 1, 2, 2, 2, 1],
  Dorian: [2, 1, 2, 2, 2, 1, 2],
  Phrygian: [1, 2, 2, 2, 1, 2, 2],
  Lydian: [2, 2, 2, 1, 2, 2, 1],
  Mixolydian: [2, 2, 1, 2, 2, 1, 2],
  Aeolian: [2, 1, 2, 2, 1, 2, 2],
  Locrian: [1, 2, 2, 1, 2, 2, 2],
  "Harmonic Minor": [2, 1, 2, 2, 1, 3, 1],
  "Melodic Minor": [2, 1, 2, 2, 2, 2, 1],
};

// Motsatt skala för Parallel-lånet. Nyckel = aktuell skala, värde = den att låna från.
// Major/Minor: vik vid dur/moll-tersen — Ionian<->Aeolian (klassisk dur<->moll).
var MODE_OPPOSITES_MAJORMINOR = {
  Ionian: "Aeolian",
  Aeolian: "Ionian",
  Mixolydian: "Dorian",
  Dorian: "Mixolydian",
  Lydian: "Phrygian",
  Phrygian: "Lydian",
  Locrian: "Aeolian", // oparad: släpp ♭5 till ren moll
  "Harmonic Minor": "Ionian", // lån = parallelldur
  "Melodic Minor": "Ionian",
};
// Interval mirror: vik vid Dorian (vänd intervallsträngen) — varje mod får en motsats.
var MODE_OPPOSITES_INTERVAL = {
  Lydian: "Locrian",
  Locrian: "Lydian",
  Ionian: "Phrygian",
  Phrygian: "Ionian",
  Mixolydian: "Aeolian",
  Aeolian: "Mixolydian",
  Dorian: "Dorian", // spegelsymmetrisk — sin egen motsats
  "Harmonic Minor": "Ionian",
  "Melodic Minor": "Ionian",
};

var CHORD_BASE_TYPES = {
  Triad: [1, 3, 5],
  "6th": [1, 3, 5, 6],
  "7th": [1, 3, 5, 7],
  "9th": [1, 3, 5, 7, 9],
  "11th": [1, 3, 5, 7, 9, 11],
  "13th": [1, 3, 5, 7, 9, 11, 13],
};

var VOICING_NAMES = ["Close", "Drop 2", "Drop 3", "Drop 2+4", "Spread"];

var SCALE_KEYS = Object.keys(SCALE_TEMPLATES);
var CHROMATIC_SCALE_STRINGS = [
  "C",
  "C#/Db",
  "D",
  "D#/Eb",
  "E",
  "F",
  "F#/Gb",
  "G",
  "G#/Ab",
  "A",
  "A#/Bb",
  "B",
];

// Logic-konvention: MIDI 60 = C3
function noteName(pitch) {
  return CHROMATIC_SCALE_STRINGS[pitch % 12] + (Math.floor(pitch / 12) - 2);
}

// ===== PRESETS =====
// Paketerade KARAKTÄRS-inställningar. Varje preset rör BARA de parametrar det
// listar — allt annat (Key, Scale, Inversion, perf-mappningar...) lämnas orört,
// så ett preset byter ljudkaraktär utan att kapa det musikaliska sammanhanget.
// Värden måste matcha respektive parameters skala/menyindex:
//   Voicing:         0 Close, 1 Drop 2, 2 Drop 3, 3 Drop 2+4, 4 Spread
//   Strum Direction: 0 Up, 1 Down
//   Bass Note:       0 av, 1 på
var PRESETS = {
  // Stora, brett spridda ackord som veckas ut nedifrån — luftigt och harpigt.
  Harp: {
    "Max Chord Size": 7,
    Voicing: 4, // Spread
    "Strum (ms)": 90,
    "Strum Direction": 0, // Up
    "Bass Note": 0,
    "Harmony Velocity %": 85,
  },
  // Kompakta blockackord med tydlig bas — pianistiskt, ingen strum.
  Piano: {
    "Max Chord Size": 4,
    Voicing: 1, // Drop 2
    "Strum (ms)": 0,
    "Bass Note": 1,
    "Bass Velocity %": 110,
    "Harmony Velocity %": 100,
  },
  // Tjockt, liggande och jämnt — fler toner, mjuk harmonivelocity, ingen strum.
  Pad: {
    "Max Chord Size": 5,
    Voicing: 3, // Drop 2+4
    "Strum (ms)": 0,
    "Bass Note": 0,
    "Harmony Velocity %": 95,
  },
  // Små, täta ackord med en snabb strum — perkussivt plock/mallet.
  Pluck: {
    "Max Chord Size": 3,
    Voicing: 0, // Close
    "Strum (ms)": 18,
    "Strum Direction": 0, // Up
    "Bass Note": 0,
    "Harmony Velocity %": 100,
  },
};
var PRESET_KEYS = Object.keys(PRESETS);

var PluginParameters = [
  {
    // "—" (index 0) gör inget. Väljs ett preset pushas dess värden ut via
    // SetParameter (se applyPreset). Menyn fortsätter visa valt preset även
    // efter att du vridit en ratt manuellt — välj "—" och presetet igen för
    // att re-applya.
    name: "Preset",
    type: "menu",
    valueStrings: ["—"].concat(PRESET_KEYS),
    defaultValue: 0,
  },
  {
    name: "Key",
    type: "menu",
    valueStrings: CHROMATIC_SCALE_STRINGS,
    defaultValue: 0,
  },
  { name: "Scale", type: "menu", valueStrings: SCALE_KEYS, defaultValue: 0 },
  {
    name: "Max Chord Size",
    type: "lin",
    minValue: 1,
    maxValue: 12,
    numberOfSteps: 11,
    defaultValue: 4,
  },
  {
    name: "Inversion",
    type: "lin",
    minValue: -6,
    maxValue: 6,
    numberOfSteps: 12,
    defaultValue: 0,
  },
  {
    // Hur långt NER perf-kontrollen (hjul/bend -> Inversion) sveper under
    // Inversion-slidern: botten av hjulet / full ner-bend = slider - detta.
    // 0 = ingen rörelse nedåt.
    name: "Inversion Range -",
    type: "lin",
    minValue: 0,
    maxValue: 6,
    numberOfSteps: 6,
    defaultValue: 3,
  },
  {
    // Hur långt UPP perf-kontrollen sveper över Inversion-slidern: toppen av
    // hjulet / full upp-bend = slider + detta. 0 = ingen rörelse uppåt.
    name: "Inversion Range +",
    type: "lin",
    minValue: 0,
    maxValue: 6,
    numberOfSteps: 6,
    defaultValue: 3,
  },
  {
    name: "Voicing",
    type: "menu",
    valueStrings: VOICING_NAMES,
    defaultValue: 0,
  },
  { name: "Bass Note", type: "checkbox", defaultValue: 0 },
  {
    name: "Bass Velocity %",
    type: "lin",
    minValue: 10,
    maxValue: 150,
    numberOfSteps: 140,
    defaultValue: 100,
  },
  { name: "Single Chord Mode", type: "checkbox", defaultValue: 0 },
  // Free Play (kräver Single Chord Mode): första tangenten = ackord, övriga
  // hållna tangenter = enstaka noter ovanpå/under. Av = klassiskt mono där ny
  // tangent ersätter ackordet (last-note retrigger).
  { name: "Free Play Notes", type: "checkbox", defaultValue: 0 },
  // Notes Join Chord (kräver Free Play): extra tangenter vävs in i ackordet som
  // äkta ackordtoner och deltar i size/inversion/voicing-svep, i st f statiska
  // enstaka noter. Av = extra noter ligger kvar där de spelades (statiska).
  { name: "Notes Join Chord", type: "checkbox", defaultValue: 0 },
  {
    name: "Strum (ms)",
    type: "lin",
    minValue: 0,
    maxValue: 200,
    numberOfSteps: 200,
    defaultValue: 0,
  },
  {
    name: "Strum Direction",
    type: "menu",
    valueStrings: ["Up", "Down"],
    defaultValue: 0,
  },
  {
    name: "Harmony Velocity %",
    type: "lin",
    minValue: 10,
    maxValue: 150,
    numberOfSteps: 140,
    defaultValue: 100,
  },
  {
    name: "Out-of-Scale Keys",
    type: "menu",
    valueStrings: ["Mute", "Pass Through", "Snap to Scale"],
    defaultValue: 2,
  },
  { name: "Modifier Keys", type: "checkbox", defaultValue: 1 },
  {
    name: "Modifier Mode",
    type: "menu",
    valueStrings: ["Hold", "Latch"],
    defaultValue: 0,
  },
  {
    name: "Borrow Pairing",
    type: "menu",
    valueStrings: ["Major / Minor", "Interval Mirror"],
    defaultValue: 0,
  },
  {
    name: "Pitch Bend",
    type: "menu",
    valueStrings: ["Off", "Inversion", "Chord Size"],
    defaultValue: 2,
  },
  { name: "Pitch Bend Latch", type: "checkbox", defaultValue: 1 },
  {
    name: "Pitch Bend Reset",
    type: "menu",
    valueStrings: ["Never", "On New Chord", "On Keys Released"],
    defaultValue: 0,
  },
  {
    name: "Mod Wheel",
    type: "menu",
    valueStrings: ["Off", "Chord Size", "Inversion"],
    defaultValue: 2,
  },
  {
    name: "Mod Wheel Reset",
    type: "menu",
    valueStrings: ["Never", "On New Chord", "On Keys Released"],
    defaultValue: 2,
  },
];

// namn -> index, för att känna igen zonparametrar i ParameterChanged
var PARAM_INDEX = {};
for (var pi = 0; pi < PluginParameters.length; pi++) {
  PARAM_INDEX[PluginParameters[pi].name] = pi;
}
