// Logic Conchord v.0.6
/* ==== CHANGE LOG ====
 * v0.6
 * - NYTT: Modifier Keys — en valbar tangentzon (default C2..B2) tystas
 *         och blir "kryddtangenter" som färgar alla andra ackord:
 *         +0 Sus 2, +1 Sus 4, +2 No 3, +3 6th, +4 7th, +5 9th, +6 Bass,
 *         +7 Drop 2, +8 Spread, +9 Lift (inversion upp, velocity = +1..+3),
 *         +10 Strum (velocity = svephastighet, mjukt = långsamt),
 *         +11 Shimmer (dubblar toppnoten en oktav upp, velocity = styrka)
 * - NYTT: Modifier Mode Hold/Latch — Latch togglar per tryck (enhandsspel)
 * - NYTT: modifiers stackar och morphar hållna ackord live
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
 * - NYTT: Harmony Velocity % (lägsta tonen behåller spelad velocity)
 * - NYTT: Out-of-scale-läge: Mute / Pass Through / Snap to Scale
 * - NYTT: valbara mål för modhjul & pitch bend (Off / Chord Size / Inversion)
 * - NYTT: Harmonic & Melodic Minor
 * - NYTT: Reset() städar alla noter vid stop/bypass
 * - NYTT: Single Chord Mode — mono-läge, ny tangent släpper föregående ackord
 * ==== TO DO ====
 * ==== IDÉER ====
 * - inversion dispersion för att ta bort enstaka noter??? :)
 * - custom chord voicings: egen matris per tangent i skalan!!!
 * - latch-läge (håll ackordet tills nästa tangent)
 * - modifier-zon: egna kartor (användarvald modifier per tangent)?
 */

var NeedsTimingInfo = true; // krävs för sendAfterMilliseconds

// ===== STATE =====

var activeNotes = []; // [{ inputPitch, channel, velocity, notes: [{pitch, delay}] }]
var soundingNotes = {}; // pitch -> antal records som håller tonen
var heldKeys = []; // fysiskt nedtryckta tangenter i tryckordning, för mono-retrigger

var modWheelValue = -1; // -1 = orört hjul; tolkas per mål (full Chord Size, 0 Inversion)
var pitchBendValue = 0.0; // -1..+1

var activeModifiers = {}; // zonindex -> { velocity } för aktiva kryddtangenter

// ===== HANDLEMIDI =====

function HandleMIDI(event) {
  // MOD WHEEL
  if (event instanceof ControlChange && event.number === 1) {
    if (GetParameter("Mod Wheel") === 0) {
      event.send(); // inget mål -> släpp igenom
      return;
    }
    var rawMw = event.value / 127;
    // Latch (unipolärt hjul): håll toppen, ignorera lägre värden.
    // Värdet släpps via Reset-läget (On New Chord / On Keys Released).
    if (
      GetParameter("Mod Wheel Latch") > 0 &&
      modWheelValue >= 0 &&
      rawMw <= modWheelValue
    )
      return;
    modWheelValue = rawMw;
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
    var wasSounding = releaseRecord(event.pitch);
    // mono: om det ljudande ackordet släpptes, återtrigga senast hållna tangent
    if (wasSounding && GetParameter("Single Chord Mode") > 0) {
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

    if (GetParameter("Single Chord Mode") > 0) {
      // mono: bara ett ackord i taget — släpp allt som låter
      releaseAllRecords();
    } else {
      // om samma tangent redan håller ett ackord: släpp det först
      releaseRecord(event.pitch);
    }

    // Reset-läge "On New Chord": nytt anslag nollställer perf-värdena
    // (mono-retrigger räknas inte som nytt anslag)
    if (GetParameter("Pitch Bend Reset") === 1) pitchBendValue = 0;
    if (GetParameter("Mod Wheel Reset") === 1) modWheelValue = -1;

    startChord(event.pitch, event.velocity, event.channel);
    return;
  }

  // allt annat (sustain, aftertouch, övriga CC) släpps igenom
  event.send();
}

// ===== MODIFIER KEYS =====

function getModifierZone() {
  var a = GetParameter("Mod Zone Low");
  var b = GetParameter("Mod Zone High");
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

function isInModifierZone(pitch) {
  if (GetParameter("Modifier Keys") === 0) return false;
  var zone = getModifierZone();
  return pitch >= zone.lo && pitch <= zone.hi;
}

function handleModifierKey(event) {
  var zone = getModifierZone();
  var idx = (event.pitch - zone.lo) % ZONE_MODIFIERS.length;
  var isOff =
    event instanceof NoteOff ||
    (event instanceof NoteOn && event.velocity === 0);

  if (GetParameter("Modifier Mode") === 1) {
    // Latch: varje tryck togglar, släpp ignoreras
    if (isOff) return;
    if (activeModifiers[idx]) delete activeModifiers[idx];
    else activeModifiers[idx] = { velocity: event.velocity };
  } else {
    // Hold: aktiv så länge tangenten hålls
    if (isOff) delete activeModifiers[idx];
    else activeModifiers[idx] = { velocity: event.velocity };
  }

  updateAllActiveChords(); // hållna ackord morphar direkt
}

// Kryddorna i zonordning, nedifrån och upp. apply muterar settings-objektet;
// vel är kryddtangentens anslag (1-127) för de velocity-känsliga.
var ZONE_MODIFIERS = [
  {
    name: "Sus 2",
    apply: function (s, vel) {
      s.colorName = "Sus2";
    },
  },
  {
    name: "Sus 4",
    apply: function (s, vel) {
      s.colorName = "Sus4";
    },
  },
  {
    name: "Dim", // tvingar förminskat ackord: liten ters (+3) och förminskad kvint (+6)
    apply: function (s, vel) {
      s.dim = true;
    },
  },
  {
    name: "6th",
    apply: function (s, vel) {
      s.baseDegrees = CHORD_BASE_TYPES["6th"];
      if (s.size < 4) s.size = 4;
    },
  },
  {
    name: "7th",
    apply: function (s, vel) {
      s.baseDegrees = CHORD_BASE_TYPES["7th"];
      if (s.size < 4) s.size = 4;
    },
  },
  {
    name: "9th",
    apply: function (s, vel) {
      s.baseDegrees = CHORD_BASE_TYPES["9th"];
      if (s.size < 5) s.size = 5;
    },
  },
  {
    name: "Strum", // anslaget styr svephastigheten: mjukt = långsamt, hårt = tajt
    apply: function (s, vel) {
      s.strumMs = Math.round(90 - (vel / 127) * 75); // 90..15 ms per ton
    },
  },
  {
    name: "Lift", // inversion uppåt, anslaget styr hur långt (+1..+3)
    apply: function (s, vel) {
      s.inversionPerf += 1 + Math.floor(vel / 43);
    },
  },
  {
    name: "Spread",
    apply: function (s, vel) {
      s.voicing = "Spread";
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
  var built = buildChordNotes(inputPitch, velocity, s);
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

// Mono-retrigger: spela senast hållna tangent igen (last-note priority).
// Mutade out-of-scale-tangenter hoppas över men ligger kvar i stacken.
function retriggerLastHeld() {
  for (var i = heldKeys.length - 1; i >= 0; i--) {
    var k = heldKeys[i];
    if (startChord(k.pitch, k.velocity, k.channel)) return;
  }
}

function releaseAllRecords() {
  while (activeNotes.length > 0) {
    releaseRecord(activeNotes[0].inputPitch);
  }
}

function ParameterChanged(param, value) {
  // zonändring kan lämna modifiers hängande -> rensa och visa nya kartan
  if (
    param === PARAM_INDEX["Modifier Keys"] ||
    param === PARAM_INDEX["Mod Zone Low"] ||
    param === PARAM_INDEX["Mod Zone High"] ||
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

function updateAllActiveChords() {
  if (activeNotes.length === 0) return;
  var s = getSettings();

  for (var i = 0; i < activeNotes.length; i++) {
    var record = activeNotes[i];
    var built = buildChordNotes(record.inputPitch, record.velocity, s);
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

    // NoteOn för nya toner, behåll delay på de som redan låter
    var updated = [];
    for (var j = 0; j < newNotes.length; j++) {
      var existing = findNote(newNotes[j].pitch, record.notes);
      if (existing) {
        updated.push(existing);
      } else {
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
  s.baseDegrees =
    CHORD_BASE_TYPES[CHORD_BASE_TYPE_NAMES[GetParameter("Chord Type")]];
  s.colorName = CHORD_COLOR_NAMES[GetParameter("Color")];
  s.size = GetParameter("Chord Size");
  s.inversion = GetParameter("Inversion"); // UI-slidern
  s.inversionPerf = 0; // offset från modhjul/pitch bend — hoppas över för 1-notsackord
  s.voicing = VOICING_NAMES[GetParameter("Voicing")];
  s.bass = GetParameter("Bass Note") > 0;
  s.strumMs = GetParameter("Strum (ms)");
  s.strumUp = GetParameter("Strum Direction") === 0;
  s.harmonyVel = GetParameter("Harmony Velocity %") / 100;
  s.outOfScale = GetParameter("Out-of-Scale Keys"); // 0=Mute 1=Pass 2=Snap
  s.shimmer = 0; // 0..1, sätts av Shimmer-modifiern
  s.dim = false; // sätts av Dim-modifiern: tvingar förminskat ackord

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
  var mwTarget = GetParameter("Mod Wheel"); // 0=Off 1=Chord Size 2=Inversion
  if (mwTarget === 1) {
    var mw = modWheelValue < 0 ? 1.0 : modWheelValue;
    s.size = Math.max(1, Math.ceil(s.size * mw));
  }
  if (mwTarget === 2 && modWheelValue >= 0)
    s.inversionPerf += Math.round(modWheelValue * 6);

  var pbTarget = GetParameter("Pitch Bend"); // 0=Off 1=Inversion 2=Chord Size
  if (pbTarget === 1) s.inversionPerf += Math.round(pitchBendValue * 6);
  if (pbTarget === 2)
    s.size = Math.max(1, Math.min(12, s.size + Math.round(pitchBendValue * 4)));

  return s;
}

// ===== ACKORDBYGGE =====
// Returnerar [{pitch, velocity}] sorterad nedifrån och upp, eller null (mute).

function buildChordNotes(inputPitch, velocity, s) {
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

  var coloredDegrees = applyChordColor(s.baseDegrees, s.colorName);
  var degreesForNotes = extendDegreesForNumNotes(coloredDegrees, s.size);

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
      // tvinga förminskat: liten ters och förminskad kvint, oavsett skalgrad
      var dp = (deg - 1) % 7;
      if (dp === 2) pitch = root + 3 + 12 * octaveOffset; // ♭3
      else if (dp === 4) pitch = root + 6 + 12 * octaveOffset; // ♭5
    }
    chord.push(pitch);
  }

  // perf-offset (hjul/bend/Lift) hoppar över 1-notsackord — där blir
  // "inversion" bara oktavtransponering. UI-slidern appliceras alltid.
  var inversion = s.inversion;
  if (chord.length > 1) inversion += s.inversionPerf;
  chord = applyInversion(chord, inversion);
  chord = applyVoicing(chord, s.voicing);

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

  // lägsta tonen behåller spelad velocity, resten skalas
  var notes = [];
  for (var i = 0; i < chord.length; i++) {
    if (chord[i] < 0 || chord[i] > 127) continue;
    var v = i === 0 ? velocity : velocity * s.harmonyVel;
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
  if (chord.length === 0) return chord;

  chord.sort(function (a, b) {
    return a - b;
  });

  var steps = inversion;
  while (steps > 0) {
    chord.push(chord.shift() + 12);
    steps--;
  }
  while (steps < 0) {
    chord.unshift(chord.pop() - 12);
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
    // varannan ton uppifrån räknat sänks en oktav
    for (var i = len - 2; i >= 0; i -= 2) {
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

var CHORD_COLOR_NAMES = ["Plain", "Sus2", "Sus4", "No 3"];
var VOICING_NAMES = ["Close", "Drop 2", "Drop 3", "Drop 2+4", "Spread"];

var CHORD_BASE_TYPE_NAMES = Object.keys(CHORD_BASE_TYPES);
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

// notnamn för zon-menyerna (menyindex = MIDI-pitch)
var NOTE_MENU_NAMES = [];
for (var p = 0; p < 128; p++) NOTE_MENU_NAMES.push(noteName(p));

var PluginParameters = [
  {
    name: "Key",
    type: "menu",
    valueStrings: CHROMATIC_SCALE_STRINGS,
    defaultValue: 0,
  },
  { name: "Scale", type: "menu", valueStrings: SCALE_KEYS, defaultValue: 0 },
  {
    name: "Chord Type",
    type: "menu",
    valueStrings: CHORD_BASE_TYPE_NAMES,
    defaultValue: 0,
  },
  {
    name: "Color",
    type: "menu",
    valueStrings: CHORD_COLOR_NAMES,
    defaultValue: 0,
  },
  {
    name: "Chord Size",
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
    name: "Voicing",
    type: "menu",
    valueStrings: VOICING_NAMES,
    defaultValue: 0,
  },
  { name: "Bass Note", type: "checkbox", defaultValue: 0 },
  { name: "Single Chord Mode", type: "checkbox", defaultValue: 0 },
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
    name: "Mod Zone Low",
    type: "menu",
    valueStrings: NOTE_MENU_NAMES,
    defaultValue: 48, // C2
  },
  {
    name: "Mod Zone High",
    type: "menu",
    valueStrings: NOTE_MENU_NAMES,
    defaultValue: 57, // A2 (10 kryddtangenter C2..A2)
  },
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
  { name: "Mod Wheel Latch", type: "checkbox", defaultValue: 0 },
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
