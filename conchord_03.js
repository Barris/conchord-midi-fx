// Logic Conchord v.0.3
/* ==== CHANGE LOG ====
 * - trigger new active notes on mod
 * ==== TO DO ====
 * - Single chord / note additions, toggle
 * - inversion fungerar inte, triggar inte om noter, borde klättra uppåt på något vis
 * - negativa värden på inversions, gör reglaget från -100 till +100
 * ==== IDÉER ====
 *  *  - testa inversion dispersion för att ta bort enstaka noter??? :)
 * - custom chord voicings (??? behöver funder på vad jag menade va???)
 *    *** kanske att man kan skapa en egen matris per tangent i skalan!!!
 * ===== BUGGAR ========
 * - när man uppdaterar antalet noter fört fort, rooten slutar lätt spel
 */

var activeNotes = [];
var ResetParameterDefaults = false;
var relayControlMessages = false;
var relayOutOfScaleNotes = false;

var numNotes; // t.ex. 3–8
var baseTypeIndex; // index i CHORD_BASE_TYPE_NAMES
var colorIndex; // index i CHORD_COLOR_NAMES
var inversion; // 0..N

var modWheel;
var pitchBend;

// ===== HANDLEMIDI =====

function HandleMIDI(event) {
  // MOD WHEEL
  if (
    event instanceof ControlChange &&
    event.number === 1 &&
    !relayControlMessages
  ) {
    var modValue0to127 = event.value; // 0–127
    var modValueNormalized = event.value / 127; // 0.0–1.0
    numNotes = Math.ceil(GetParameter("ChordNotes") * modValueNormalized);
  }

  // PITCH BEND
  if (event instanceof PitchBend && !relayControlMessages) {
    var pb = event.value; // -8192 to +8191
    var pbNormalized = (pb + 8192) / 16383; // 0–1 range
    inversion = Math.round(GetParameter("Inversion") * pbNormalized);
  }

  if (event instanceof NoteOn) {
    var numNotes = GetParameter("ChordNotes");
    var baseTypeIndex = GetParameter("ChordType");
    var colorIndex = GetParameter("ChordColor");
    var inversion = GetParameter("Inversion");
    var baseTypeName = CHORD_BASE_TYPE_NAMES[baseTypeIndex];
    var colorName = CHORD_COLOR_NAMES[colorIndex];

    var chord = calculateChord(
      event.pitch,
      numNotes,
      baseTypeName,
      colorName,
      inversion
    );

    var record = {
      originalPitch: event.pitch,
      events: [],
    };

    for (var i = 0; i < chord.length; i++) {
      var harmony = new NoteOn(event);
      harmony.pitch = chord[i];
      harmony.send();
      record.events.push(harmony);
    }

    activeNotes.push(record);
    return;
  }

  if (event instanceof NoteOff) {
    // hitta record, droppa alla noter
    for (var i = 0; i < activeNotes.length; i++) {
      if (activeNotes[i].originalPitch === event.pitch) {
        for (var j = 0; j < activeNotes[i].events.length; j++) {
          var off = new NoteOff(activeNotes[i].events[j]);
          off.send();
        }
        activeNotes.splice(i, 1);
        break;
      }
    }
    return;
  }

  // control messages - t.ex. CC, pitchben, mod etc
  if (relayControlMessages) {
    event.send();
  }
}

function ParameterChanged(param, value) {
  numNotes = GetParameter("ChordNotes"); // t.ex. 3–8
  baseTypeIndex = GetParameter("ChordType"); // index i CHORD_BASE_TYPE_NAMES
  colorIndex = GetParameter("ChordColor"); // index i CHORD_COLOR_NAMES
  inversion = GetParameter("Inversion"); // 0..N
  var baseTypeName = CHORD_BASE_TYPE_NAMES[baseTypeIndex];
  var colorName = CHORD_COLOR_NAMES[colorIndex];
  updateAllActiveChords();
  Trace("Parameter " + param + " changed to " + value);
}

function pitchInArray(pitch, arr) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === pitch) return true;
  }
  return false;
}

function updateAllActiveChords() {
  for (var i = 0; i < activeNotes.length; i++) {
    var record = activeNotes[i];

    // Gamla pitches
    var oldEvents = record.events;
    var oldPitches = [];
    for (var j = 0; j < oldEvents.length; j++) {
      oldPitches.push(oldEvents[j].pitch);
    }

    // Nya pitches med aktuella parametrar
    var newPitches = calculateChord(
      record.originalPitch,
      numNotes,
      baseTypeName,
      colorName,
      inversion
    );

    // NOTE OFF: alla gamla som inte längre ska vara med
    for (var j = 0; j < oldPitches.length; j++) {
      var pOld = oldPitches[j];
      if (!pitchInArray(pOld, newPitches)) {
        // hitta matchande NoteOn-event i record.events
        for (var k = 0; k < record.events.length; k++) {
          if (record.events[k].pitch === pOld) {
            var off = new NoteOff(record.events[k]);
            off.send();
            break;
          }
        }
      }
    }

    // NOTE ON: alla nya som inte fanns förut
    var newEvents = [];
    for (var j = 0; j < newPitches.length; j++) {
      var pNew = newPitches[j];
      if (!pitchInArray(pNew, oldPitches)) {
        var on = new NoteOn(record.events[0]); // ta första som mall
        on.pitch = pNew;
        on.send();
        newEvents.push(on);
      } else {
        // om tonen fanns förut, återanvänd motsvarande gamla event
        // (simplaste: skapa ny NoteOn men utan att skicka den igen)
        // här kan vi bara spara ett dummy-event
        var dummy = new NoteOn(record.events[0]);
        dummy.pitch = pNew;
        newEvents.push(dummy);
      }
    }

    // Uppdatera record.events till de nya eventen
    record.events = newEvents;
  }
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

function getScaleDegree(originalPitch, key, steps) {
  var scalePCs = buildScalePitchClassesRelative(steps);
  var pcRel = ((originalPitch % 12) - key + 12) % 12;
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
  var degrees = baseDegrees.slice(0); // kopia

  if (colorName === "Sus2" || colorName === "Sus4") {
    var replaceWith = colorName === "Sus2" ? 2 : 4;
    for (var i = 0; i < degrees.length; i++) {
      if (degrees[i] === 3) {
        degrees[i] = replaceWith;
      }
    }
  }
  return degrees;
}

function extendDegreesForNumNotes(baseDegrees, numNotes) {
  var result = [];
  var len = baseDegrees.length;

  for (var i = 0; i < numNotes; i++) {
    var baseIndex = i % len;
    var octave = Math.floor(i / len); // varje varv = +7 skalgrader
    var deg = baseDegrees[baseIndex] + 7 * octave;
    result.push(deg);
  }
  return result;
}

function applyInversion(chordPitches, inversion) {
  var chord = chordPitches.slice(0);
  if (chord.length === 0) {
    return chord;
  }

  chord.sort(function (a, b) {
    return a - b;
  });

  var steps = inversion % chord.length;
  for (var i = 0; i < steps; i++) {
    var n = chord.shift();
    chord.push(n + 12);
  }

  return chord;
}

// ===== ACKORDBERÄKNING =====

function calculateChord(
  originalPitch,
  numNotes,
  baseTypeName,
  colorName,
  inversion
) {
  var key = GetParameter("Key"); // 0–11
  var modeIndex = GetParameter("Mode"); // 0–6, index i SCALE_KEYS
  var modeName = SCALE_KEYS[modeIndex];
  var steps = SCALE_TEMPLATES[modeName];

  var degreeInfo = getScaleDegree(originalPitch, key, steps);
  var baseDegree = degreeInfo.degree;
  var scalePCs = degreeInfo.scalePCs;

  // Om noten inte finns i skalan → bara root
  if (baseDegree === -1) {
    if (relayOutOfScaleNotes) {
      return [originalPitch];
    }
  }

  // Hämta bas-ackordtyp (1,3,5 etc)
  var baseDegrees = CHORD_BASE_TYPES[baseTypeName];
  if (!baseDegrees) {
    baseDegrees = [1, 3, 5]; // fallback: triad
  }

  // Applicera färgning (sus etc)
  var coloredDegrees = applyChordColor(baseDegrees, colorName);

  // Anpassa efter antal noter (stapla uppåt)
  var degreesForNotes = extendDegreesForNumNotes(coloredDegrees, numNotes);

  var chord = [];

  // Konvertera varje skalgrad till pitch (i halvtoner)
  for (var i = 0; i < degreesForNotes.length; i++) {
    var deg = degreesForNotes[i]; // t.ex. 1,3,5,8,10...
    var offsetFromRootDegree = deg - 1;
    var absDegree = baseDegree + offsetFromRootDegree; // kan vara > 6
    var wrappedDegree = absDegree % 7;
    var octaveOffset = Math.floor(absDegree / 7);

    var intervalFromBase =
      scalePCs[wrappedDegree] - scalePCs[baseDegree] + 12 * octaveOffset;

    var notePitch = originalPitch + intervalFromBase;
    chord.push(notePitch);
  }

  // Inversion appliceras sist
  chord = applyInversion(chord, inversion);

  return chord;
}

// ===== SKALOR OCH ACKORD  =====

var SCALE_TEMPLATES = {
  Ionian: [2, 2, 1, 2, 2, 2, 1],
  Dorian: [2, 1, 2, 2, 2, 1, 2],
  Phrygian: [1, 2, 2, 2, 1, 2, 2],
  Lydian: [2, 2, 2, 1, 2, 2, 1],
  Mixolydian: [2, 2, 1, 2, 2, 1, 2],
  Aeolian: [2, 1, 2, 2, 1, 2, 2],
  Locrian: [1, 2, 2, 1, 2, 2, 2],
};

var CHORD_BASE_TYPES = {
  Tri: [1, 3, 5],
  Six: [1, 3, 5, 6],
  Seven: [1, 3, 5, 7],
  Nine: [1, 3, 5, 7, 9],
};

var CHORD_COLOR_NAMES = ["Plain", "Sus2", "Sus4"];

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
  { name: "Mode", type: "menu", valueStrings: SCALE_KEYS, defaultValue: 0 },
  {
    name: "ChordNotes",
    type: "lin",
    minValue: 1,
    maxValue: 12,
    numberOfSteps: 11,
    defaultValue: 3,
  },
  {
    name: "ChordType",
    type: "menu",
    valueStrings: CHORD_BASE_TYPE_NAMES,
    defaultValue: 0,
  },
  {
    name: "ChordColor",
    type: "menu",
    valueStrings: CHORD_COLOR_NAMES,
    defaultValue: 0,
  },
  {
    name: "Inversion",
    type: "lin",
    minValue: 0,
    maxValue: 6,
    numberOfSteps: 6,
    defaultValue: 0,
  },
];
