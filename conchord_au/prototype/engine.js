// Conchord engine — porterad rakt från conchord_09.js (Scripter).
// Rena funktioner, ingen Logic-runtime: ingen GetParameter/SetParameter, inga
// NoteOn/NoteOff. Tar en settings-snapshot (s) och returnerar tonhöjder, så att
// både HTML-prototypen och (senare) JUCE-editorn kan dela exakt samma musik-
// matematik. Sanningskälla för logiken är fortfarande conchord_09.js — håll
// dessa funktioner i synk när motorn ändras.
//
// Medvetet UTELÄMNAT i prototypen (kräver realtids-CC / Scripter-state):
//   Pitch Bend / Mod Wheel -> Size/Inversion, Single Chord / Free Play / Join,
//   strum-timing (vi visar bara delays konceptuellt), referensräknad utskickning.

const SCALE_TEMPLATES = {
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
const SCALE_KEYS = Object.keys(SCALE_TEMPLATES);

const MODE_OPPOSITES_MAJORMINOR = {
  Ionian: "Aeolian", Aeolian: "Ionian", Mixolydian: "Dorian", Dorian: "Mixolydian",
  Lydian: "Phrygian", Phrygian: "Lydian", Locrian: "Aeolian",
  "Harmonic Minor": "Ionian", "Melodic Minor": "Ionian",
};
const MODE_OPPOSITES_INTERVAL = {
  Lydian: "Locrian", Locrian: "Lydian", Ionian: "Phrygian", Phrygian: "Ionian",
  Mixolydian: "Aeolian", Aeolian: "Mixolydian", Dorian: "Dorian",
  "Harmonic Minor": "Ionian", "Melodic Minor": "Ionian",
};

const CHORD_BASE_TYPES = {
  Triad: [1, 3, 5], "6th": [1, 3, 5, 6], "7th": [1, 3, 5, 7],
  "9th": [1, 3, 5, 7, 9], "11th": [1, 3, 5, 7, 9, 11], "13th": [1, 3, 5, 7, 9, 11, 13],
};

const VOICING_NAMES = ["Close", "Drop 2", "Drop 3", "Drop 2+4", "Spread"];

// ZONE-läge: explicita kvaliteter (intervall i halvtoner från grundtonen). Till
// skillnad från den ordinarie kryddzonen (rent diatonisk) bär den här BÅDE dur
// och moll, så chord-zonens vänsterhand väljer ackord direkt på grundtonen.
const ZONE_QUALITIES = [
  { short: "MAJ", name: "Major", intervals: [0, 4, 7] },
  { short: "MIN", name: "Minor", intervals: [0, 3, 7] },
  { short: "MAJ7", name: "Major 7", intervals: [0, 4, 7, 11] },
  { short: "MIN7", name: "Minor 7", intervals: [0, 3, 7, 10] },
  { short: "DOM7", name: "Dominant 7", intervals: [0, 4, 7, 10] },
  { short: "SUS2", name: "Sus2", intervals: [0, 2, 7] },
  { short: "SUS4", name: "Sus4", intervals: [0, 5, 7] },
  { short: "DIM", name: "Diminished", intervals: [0, 3, 6] },
  { short: "AUG", name: "Augmented", intervals: [0, 4, 8] },
];

const CHROMATIC_SCALE_STRINGS = [
  "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
];
const CHROM_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Logic-konvention: MIDI 60 = C3
function noteName(pitch) {
  return CHROMATIC_SCALE_STRINGS[((pitch % 12) + 12) % 12] + (Math.floor(pitch / 12) - 2);
}
function noteShort(pitch) {
  return CHROM_SHORT[((pitch % 12) + 12) % 12];
}

// Kryddzonen: C2 (48) och uppåt, en tangent per modifierare. apply() muterar s.
// borrow = 0 Major/Minor, 1 Interval Mirror (för Parallel-lånet).
const MOD_ZONE_LOW = 48;
const ZONE_MODIFIERS = [
  { name: "Sus 2", short: "SUS2", apply: (s) => { s.colorName = "Sus2"; } },
  { name: "Dim", short: "DIM", apply: (s) => { s.dim = true; } },
  { name: "Sus 4", short: "SUS4", apply: (s) => { s.colorName = "Sus4"; } },
  { name: "6th", short: "6TH", apply: (s) => { addDegree(s, 6); } },
  { name: "7th", short: "7TH", apply: (s) => { addDegree(s, 7); } },
  { name: "Dom 7", short: "DOM7", apply: (s) => { s.dom7 = true; if (s.size < 4) s.size = 4; } },
  { name: "Add 9", short: "ADD9", apply: (s) => { addDegree(s, 9); } },
  { name: "Parallel", short: "PARA", apply: (s) => {
      const table = s.borrow === 1 ? MODE_OPPOSITES_INTERVAL : MODE_OPPOSITES_MAJORMINOR;
      const opp = table[s.scaleName] || s.scaleName;
      s.scaleSteps = SCALE_TEMPLATES[opp];
    } },
  { name: "Voice Lead", short: "VLD", apply: (s) => { s.voiceLead = true; } },
];

function addDegree(s, deg) {
  if (s.baseDegrees.indexOf(deg) === -1) {
    s.baseDegrees = s.baseDegrees.concat([deg]).sort((a, b) => a - b);
  }
  if (s.size < s.baseDegrees.length) s.size = s.baseDegrees.length;
}

// Karaktärspresets — rör bara de listade parametrarna (samma som conchord_09.js).
const PRESETS = {
  Harp: { maxSize: 7, voicing: 4, strumMs: 90, strumDir: 0, bass: false, harmonyVel: 85 },
  Piano: { maxSize: 4, voicing: 1, strumMs: 0, bass: true, bassVel: 110, harmonyVel: 100 },
  Pad: { maxSize: 5, voicing: 3, strumMs: 0, bass: false, harmonyVel: 95 },
  Pluck: { maxSize: 3, voicing: 0, strumMs: 18, strumDir: 0, bass: false, harmonyVel: 100 },
};

// ===== MUSIKTEORI =====

function buildScalePitchClassesRelative(steps) {
  const pcs = [0];
  let sum = 0;
  for (let i = 0; i < steps.length - 1; i++) { sum += steps[i]; pcs.push(sum); }
  return pcs;
}

function getScaleDegree(pitch, key, steps) {
  const scalePCs = buildScalePitchClassesRelative(steps);
  const pcRel = ((pitch % 12) - key + 12) % 12;
  let degree = -1;
  for (let i = 0; i < scalePCs.length; i++) if (scalePCs[i] === pcRel) { degree = i; break; }
  return { degree, scalePCs };
}

function applyChordColor(baseDegrees, colorName) {
  let degrees = baseDegrees.slice(0);
  if (colorName === "Sus2" || colorName === "Sus4") {
    const replaceWith = colorName === "Sus2" ? 2 : 4;
    for (let i = 0; i < degrees.length; i++)
      if ((degrees[i] - 1) % 7 === 2) degrees[i] = replaceWith + (degrees[i] - 3);
  }
  if (colorName === "No 3") {
    const filtered = degrees.filter((d) => (d - 1) % 7 !== 2);
    if (filtered.length) degrees = filtered;
  }
  return degrees;
}

function extendDegreesForNumNotes(baseDegrees, numNotes) {
  const result = [];
  const len = baseDegrees.length;
  for (let i = 0; i < numNotes; i++)
    result.push(baseDegrees[i % len] + 7 * Math.floor(i / len));
  return result;
}

function applyInversion(chordPitches, inversion) {
  const chord = chordPitches.slice(0);
  if (chord.length <= 1) return chord;
  chord.sort((a, b) => a - b);
  let steps = inversion;
  while (steps > 0) {
    let lo = chord.shift();
    const top = chord[chord.length - 1];
    while (lo <= top) lo += 12;
    chord.push(lo);
    steps--;
  }
  while (steps < 0) {
    let hi = chord.pop();
    const bot = chord[0];
    while (hi >= bot) hi -= 12;
    chord.unshift(hi);
    steps++;
  }
  return chord;
}

function voiceLeadCost(cand, anchor) {
  const a = cand.slice(0).sort((x, y) => x - y);
  const b = anchor.slice(0).sort((x, y) => x - y);
  let cost = 0;
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) cost += Math.abs(a[i] - b[i]);
  } else {
    for (let i = 0; i < a.length; i++) {
      let best = Infinity;
      for (let j = 0; j < b.length; j++) best = Math.min(best, Math.abs(a[i] - b[j]));
      cost += best;
    }
  }
  return cost;
}

function applyVoiceLeading(chord, anchor) {
  const n = chord.length;
  const shifts = [-24, -12, 0, 12, 24];
  let best = null, bestCost = Infinity;
  for (const sh of shifts) {
    const shifted = chord.map((p) => p + sh);
    for (let inv = -(n - 1); inv <= n - 1; inv++) {
      const cand = applyInversion(shifted, inv);
      const cost = voiceLeadCost(cand, anchor);
      if (cost < bestCost) { bestCost = cost; best = cand; }
    }
  }
  return best || chord;
}

function applyVoicing(chordPitches, voicingName) {
  const chord = chordPitches.slice(0);
  const len = chord.length;
  if (voicingName === "Drop 2" && len >= 3) chord[len - 2] -= 12;
  else if (voicingName === "Drop 3" && len >= 4) chord[len - 3] -= 12;
  else if (voicingName === "Drop 2+4" && len >= 4) { chord[len - 2] -= 12; chord[len - 4] -= 12; }
  else if (voicingName === "Spread" && len >= 3) for (let i = 1; i < len; i += 2) chord[i] -= 12;
  return chord;
}

function dedupe(sorted) {
  const out = [];
  for (let i = 0; i < sorted.length; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) out.push(sorted[i]);
  return out;
}

// ===== SETTINGS-SNAPSHOT =====
// Bygger s från ett enkelt UI-state + aktiva modifiers. Spegel av getSettings()
// inkl. perf-lagret (Pitch Bend / Mod Wheel). I prototypen är källorna GUI-hjulen:
//   state.pb = null (orört) | -1..+1   ·   state.mw = -1 (orört) | 0..1
//   state.pbTarget/mwTarget · state.invRangeDown/Up  (mappning som i conchord_09)
function buildSettings(state, activeModifiers) {
  const scaleName = SCALE_KEYS[state.scale];
  const s = {
    key: state.key,
    scaleName,
    scaleSteps: SCALE_TEMPLATES[scaleName],
    baseDegrees: CHORD_BASE_TYPES["Triad"].slice(0),
    colorName: "Plain",
    size: state.maxSize,
    inversion: state.inversion,
    inversionPerf: 0,
    voicing: VOICING_NAMES[state.voicing],
    bass: !!state.bass,
    bassVel: state.bassVel / 100,
    harmonyVel: state.harmonyVel / 100,
    strumMs: state.strumMs,
    strumUp: state.strumDir === 0,
    outOfScale: state.outOfScale,
    borrow: state.borrow,
    shimmer: 0, dim: false, dom7: false, voiceLead: false,
  };
  if (state.modifierKeys && activeModifiers) {
    Object.keys(activeModifiers).map(Number).sort((a, b) => a - b)
      .forEach((i) => { if (activeModifiers[i]) ZONE_MODIFIERS[i].apply(s); });
  }

  // ===== Performance-lager (PB / MW) — speglar getSettings() i conchord_09 =====
  const invDown = state.invRangeDown == null ? 3 : state.invRangeDown;
  const invUp = state.invRangeUp == null ? 3 : state.invRangeUp;
  const perfSizeFloor = state.maxSize <= 1 ? 1 : 2;

  const mwTarget = state.mwTarget == null ? 2 : state.mwTarget; // 0 Off 1 Size 2 Inv
  const mw = state.mw == null ? -1 : state.mw;                  // -1 = orört hjul
  if (mwTarget === 1) s.size = Math.max(perfSizeFloor, Math.ceil(s.size * (mw < 0 ? 1 : mw)));
  if (mwTarget === 2 && mw >= 0) {
    const v = (mw - 0.5) * 2; // mitten = neutral, botten = -down, toppen = +up
    s.inversionPerf += Math.round(v * (v >= 0 ? invUp : invDown));
  }

  const pbTarget = state.pbTarget == null ? 2 : state.pbTarget; // 0 Off 1 Inv 2 Size
  const pb = state.pb;                                          // null = orört (neutralt)
  if (pb != null) {
    if (pbTarget === 1) s.inversionPerf += Math.round(pb * (pb >= 0 ? invUp : invDown));
    if (pbTarget === 2) s.size = Math.max(perfSizeFloor, Math.ceil(s.size * ((pb + 1) / 2)));
  }

  return s;
}

// ===== ACKORDBYGGE =====
// Returnerar [{pitch, velocity, delay}] nedifrån och upp, eller null (mute).
function buildChordNotes(inputPitch, velocity, s, extras, vlAnchor) {
  let root = inputPitch;
  let degreeInfo = getScaleDegree(root, s.key, s.scaleSteps);

  if (degreeInfo.degree === -1) {
    if (s.outOfScale === 0) return null;                                   // Mute
    if (s.outOfScale === 1) return [{ pitch: inputPitch, velocity, delay: 0 }]; // Pass Through
    if (s.outOfScale === 3) { s.dim = true; }                             // Diminished
    else {
      for (let t = 1; t <= 11 && degreeInfo.degree === -1; t++) {         // Snap to Scale
        root = inputPitch - t;
        degreeInfo = getScaleDegree(root, s.key, s.scaleSteps);
      }
    }
  }

  const baseDegree = degreeInfo.degree;
  const scalePCs = degreeInfo.scalePCs;

  const coloredDegrees = applyChordColor(s.baseDegrees, s.colorName);
  const numChordNotes = s.bass ? Math.max(0, s.size - 1) : s.size;
  const degreesForNotes = extendDegreesForNumNotes(coloredDegrees, numChordNotes);

  let chord = [];
  for (let i = 0; i < degreesForNotes.length; i++) {
    const deg = degreesForNotes[i];
    const absDegree = baseDegree + (deg - 1);
    const wrappedDegree = absDegree % 7;
    const octaveOffset = Math.floor(absDegree / 7);
    let pitch = root + (scalePCs[wrappedDegree] - scalePCs[baseDegree] + 12 * octaveOffset);
    if (s.dim) pitch = root + 3 * i;
    else if (s.dom7) { const DOM7 = [0, 4, 7, 10]; pitch = root + DOM7[i % 4] + 12 * Math.floor(i / 4); }
    chord.push(pitch);
  }

  if (extras && extras.length) for (const e of extras) chord.push(e);

  chord.sort((a, b) => a - b);
  chord = dedupe(chord);

  let inversion = s.inversion;
  if (chord.length > 1) inversion += s.inversionPerf;
  chord = applyVoicing(chord, s.voicing);
  if (s.voiceLead && vlAnchor && vlAnchor.length && chord.length > 1)
    chord = applyVoiceLeading(chord, vlAnchor);
  else chord = applyInversion(chord, inversion);

  chord.sort((a, b) => a - b);
  chord = dedupe(chord);

  if (s.bass) {
    const bassPitch = root - 12;
    if (chord.indexOf(bassPitch) === -1) chord.unshift(bassPitch);
  }

  // strum-delays (konceptuellt: visar i prototypen att tonerna fördröjs)
  const ordered = chord.slice(0);
  const notes = [];
  for (let i = 0; i < chord.length; i++) {
    if (chord[i] < 0 || chord[i] > 127) continue;
    let v = i === 0 ? (s.bass ? velocity * s.bassVel : velocity) : velocity * s.harmonyVel;
    const strumIndex = s.strumUp ? i : chord.length - 1 - i;
    notes.push({ pitch: chord[i], velocity: Math.round(v), delay: s.strumMs > 0 ? strumIndex * s.strumMs : 0 });
  }
  return notes;
}

// ===== ZONE-LÄGE =====
// Kompakt, röstlett ackord. Grundton från note-zonen (höger hand), ackordet
// (kvalitet eller fritt grepp) från chord-zonen (vänster hand). Confineras till
// en oktav genom voice leading mot föregående ackord -> alla inversioner ligger
// tätt: C -> C-E-G, men F -> C-F-A (2:a inv, packad nära). Första ackordet (utan
// ankare) hamnar i grundläge. vlAnchor = föregående zon-ackords toner (eller null).
//
//   intervals : halvtonsintervall från grundtonen (Orchid-kvalitet ELLER grepp).
//   s.zoneRegister : oktav-offset från mod wheel (vandra upp/ner på brädet).
function buildZoneChord(rootMidi, intervals, velocity, s, vlAnchor) {
  if (!intervals || !intervals.length) return null;
  let chord = dedupe(intervals.map((iv) => rootMidi + iv).sort((a, b) => a - b));
  if (vlAnchor && vlAnchor.length && chord.length > 1) {
    chord = applyVoiceLeading(chord, vlAnchor);
    chord = dedupe(chord.slice(0).sort((a, b) => a - b));
  }
  const reg = s.zoneRegister || 0;
  const notes = [];
  for (let i = 0; i < chord.length; i++) {
    const p = chord[i] + 12 * reg;
    if (p < 0 || p > 127) continue;
    const v = i === 0 ? velocity : velocity * s.harmonyVel;
    notes.push({ pitch: p, velocity: Math.round(v), delay: 0 });
  }
  return notes;
}

// Snappa en grundton nedåt till närmaste skalton (samma som Snap to Scale).
function snapRootToScale(rootMidi, key, scaleSteps) {
  for (let t = 0; t <= 11; t++) {
    if (getScaleDegree(rootMidi - t, key, scaleSteps).degree !== -1) return rootMidi - t;
  }
  return rootMidi;
}

// ===== ACKORDNAMN (preliminär detektor — INTE motorlogik) =====
// Basal etikett från de byggda tonernas intervall mot grundtonen. Räcker för
// chord viewern i prototypen; full namngivning är parkerad.
function detectChordName(rootMidi, notes) {
  if (!notes || !notes.length) return { name: "—", desc: "" };
  const set = new Set(notes.map((n) => (((n.pitch - rootMidi) % 12) + 12) % 12));
  const h = (i) => set.has(i);
  const root = noteShort(rootMidi);

  let tri, triDesc;
  if (h(4) && h(8)) { tri = "aug"; triDesc = "Augmented"; }
  else if (h(3) && h(6)) { tri = "dim"; triDesc = "Diminished"; }
  else if (h(4)) { tri = ""; triDesc = "Major"; }
  else if (h(3)) { tri = "m"; triDesc = "Minor"; }
  else if (h(2)) { tri = "sus2"; triDesc = "Sus2"; }
  else if (h(5)) { tri = "sus4"; triDesc = "Sus4"; }
  else { tri = "5"; triDesc = "Power"; }

  let ext = "", extDesc = "";
  if (tri === "dim" && h(9)) { ext = "7"; extDesc = " 7"; tri = "dim"; }
  else if (h(11)) { ext = "maj7"; extDesc = " maj7"; }
  else if (h(10)) { ext = "7"; extDesc = " 7"; }
  else if (h(9) && tri !== "dim") { ext = "6"; extDesc = " 6"; }

  const tens = [];
  if (ext && ext !== "6" && h(2)) tens.push("9");
  if (ext && ext !== "6" && h(5) && tri !== "sus4") tens.push("11");

  let name = root + tri;
  if (ext === "maj7") name += tens.length ? "maj" + tens[tens.length - 1] : "maj7";
  else if (ext === "7") name += tens.length ? tens[tens.length - 1] : "7";
  else if (ext === "6") name += "6";
  if (tens.length && (ext === "7" || ext === "maj7")) {
    for (const t of tens.slice(0, -1)) name += "add" + t;
  }

  let desc;
  if (ext === "maj7") desc = tri === "" ? "MAJ7" : triDesc.toUpperCase() + " MAJ7";
  else if (ext === "7") desc = tri === "" ? "DOMINANT 7" : triDesc.toUpperCase() + " 7";
  else if (ext === "6") desc = triDesc.toUpperCase() + " 6";
  else desc = triDesc.toUpperCase();
  if (tens.length) desc += " · +" + tens.join("/");
  return { name, desc };
}

// ===== EXPORT (UMD: webbläsare via window.Conchord, node via module.exports) =====
const Conchord = {
  SCALE_TEMPLATES, SCALE_KEYS, CHORD_BASE_TYPES, VOICING_NAMES, ZONE_QUALITIES,
  CHROMATIC_SCALE_STRINGS, CHROM_SHORT, MOD_ZONE_LOW, ZONE_MODIFIERS, PRESETS,
  noteName, noteShort, getScaleDegree, buildSettings, buildChordNotes, detectChordName,
  buildZoneChord, snapRootToScale,
};
if (typeof window !== "undefined") window.Conchord = Conchord;
if (typeof module !== "undefined" && module.exports) module.exports = Conchord;
