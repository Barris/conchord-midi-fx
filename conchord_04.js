// Logic Conchord v.0.4
/* ==== CHANGE LOG ====
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
 */

var NeedsTimingInfo = true; // krävs för sendAfterMilliseconds

// ===== STATE =====

var activeNotes = []; // [{ inputPitch, channel, velocity, notes: [{pitch, delay}] }]
var soundingNotes = {}; // pitch -> antal records som håller tonen

var modWheelValue = 1.0; // 0..1 (1.0 så att Chord Size gäller fullt innan hjulet rörs)
var pitchBendValue = 0.0; // -1..+1

// ===== HANDLEMIDI =====

function HandleMIDI(event) {
  // MOD WHEEL
  if (event instanceof ControlChange && event.number === 1) {
    if (GetParameter("Mod Wheel") === 0) {
      event.send(); // inget mål -> släpp igenom
      return;
    }
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
    pitchBendValue = event.value / 8192; // -1..+1 (ungefär)
    updateAllActiveChords();
    return;
  }

  // NOTE OFF (kolla före NoteOn — NoteOn med velocity 0 räknas också som off)
  if (event instanceof NoteOff || (event instanceof NoteOn && event.velocity === 0)) {
    releaseRecord(event.pitch);
    return;
  }

  // NOTE ON
  if (event instanceof NoteOn) {
    if (GetParameter("Single Chord Mode") > 0) {
      // mono: bara ett ackord i taget — släpp allt som låter
      releaseAllRecords();
    } else {
      // om samma tangent redan håller ett ackord: släpp det först
      releaseRecord(event.pitch);
    }

    var s = getSettings();
    var built = buildChordNotes(event.pitch, event.velocity, s);
    if (!built) return; // out-of-scale + Mute

    var record = {
      inputPitch: event.pitch,
      channel: event.channel,
      velocity: event.velocity,
      notes: [],
    };

    // strum-ordning: Up = nedifrån och upp, Down = uppifrån och ned
    var ordered = built.slice(0);
    if (!s.strumUp) ordered.reverse();

    for (var i = 0; i < ordered.length; i++) {
      var delay = s.strumMs > 0 ? i * s.strumMs : 0;
      sendNoteOn(ordered[i].pitch, ordered[i].velocity, event.channel, delay);
      record.notes.push({ pitch: ordered[i].pitch, delay: delay });
    }

    activeNotes.push(record);
    return;
  }

  // allt annat (sustain, aftertouch, övriga CC) släpps igenom
  event.send();
}

function releaseRecord(inputPitch) {
  for (var i = 0; i < activeNotes.length; i++) {
    if (activeNotes[i].inputPitch === inputPitch) {
      var record = activeNotes[i];
      for (var j = 0; j < record.notes.length; j++) {
        // spegla strum-delayen så att en delayad NoteOn alltid får sin NoteOff efteråt
        sendNoteOff(record.notes[j].pitch, record.channel, record.notes[j].delay);
      }
      activeNotes.splice(i, 1);
      return;
    }
  }
}

function releaseAllRecords() {
  while (activeNotes.length > 0) {
    releaseRecord(activeNotes[0].inputPitch);
  }
}

function ParameterChanged(param, value) {
  updateAllActiveChords();
}

function Reset() {
  MIDI.allNotesOff();
  activeNotes = [];
  soundingNotes = {};
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
        sendNoteOff(record.notes[j].pitch, record.channel, record.notes[j].delay);
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
  s.baseDegrees = CHORD_BASE_TYPES[CHORD_BASE_TYPE_NAMES[GetParameter("Chord Type")]];
  s.colorName = CHORD_COLOR_NAMES[GetParameter("Color")];
  s.size = GetParameter("Chord Size");
  s.inversion = GetParameter("Inversion");
  s.voicing = VOICING_NAMES[GetParameter("Voicing")];
  s.bass = GetParameter("Bass Note") > 0;
  s.strumMs = GetParameter("Strum (ms)");
  s.strumUp = GetParameter("Strum Direction") === 0;
  s.harmonyVel = GetParameter("Harmony Velocity %") / 100;
  s.outOfScale = GetParameter("Out-of-Scale Keys"); // 0=Mute 1=Pass 2=Snap

  // performance-kontroller ovanpå reglagen
  var mwTarget = GetParameter("Mod Wheel"); // 0=Off 1=Chord Size 2=Inversion
  if (mwTarget === 1) s.size = Math.max(1, Math.ceil(s.size * modWheelValue));
  if (mwTarget === 2) s.inversion += Math.round(modWheelValue * 6);

  var pbTarget = GetParameter("Pitch Bend"); // 0=Off 1=Inversion 2=Chord Size
  if (pbTarget === 1) s.inversion += Math.round(pitchBendValue * 6);
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
    chord.push(root + intervalFromBase);
  }

  chord = applyInversion(chord, s.inversion);
  chord = applyVoicing(chord, s.voicing);

  chord.sort(function (a, b) {
    return a - b;
  });
  chord = dedupe(chord);

  if (s.bass) {
    var bassPitch = root - 12;
    if (chord.indexOf(bassPitch) === -1) chord.unshift(bassPitch);
  }

  // lägsta tonen behåller spelad velocity, resten skalas
  var notes = [];
  for (var i = 0; i < chord.length; i++) {
    if (chord[i] < 0 || chord[i] > 127) continue;
    notes.push({
      pitch: chord[i],
      velocity: i === 0 ? velocity : velocity * s.harmonyVel,
    });
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
  var pcRel = (((pitch % 12) - key) + 12) % 12;
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
    maxValue: 8,
    numberOfSteps: 7,
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
  {
    name: "Mod Wheel",
    type: "menu",
    valueStrings: ["Off", "Chord Size", "Inversion"],
    defaultValue: 1,
  },
  {
    name: "Pitch Bend",
    type: "menu",
    valueStrings: ["Off", "Inversion", "Chord Size"],
    defaultValue: 1,
  },
];
