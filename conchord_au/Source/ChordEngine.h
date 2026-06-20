#pragma once

// ============================================================================
// ChordEngine — C++-port av conchord_08.js ackordmotor (Fas 2).
//
// Ren logik, inga JUCE-beroenden, så den kan unit-testas fristående. Speglar
// getSettings() + buildChordNotes() + hjälpfunktionerna i conchord_08.js så
// nära som möjligt; radhänvisningar i kommentarerna pekar på JS-källan.
//
// MEDVETET UTELÄMNAT i denna prototyp (perf/interaktiva lager — kräver
// realtids-CC + tangentzoner och hör till en senare fas):
//   - Performance-kontroller (Pitch Bend / Mod Wheel -> Chord Size / Inversion)
//   - Modifier-tangenter (zonbaserad färgning) -> ersatt av "Chord Type"-param
//   - Presets, Single Chord Mode, Free Play, Notes Join Chord
// ============================================================================

#include <array>
#include <vector>
#include <algorithm>
#include <cmath>

namespace conchord
{

// ----- Skalmallar (conchord_08.js:1016) -------------------------------------
// Intervall i halvtoner mellan skalgraderna; summan = 12.
enum class Scale { Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian,
                   Locrian, HarmonicMinor, MelodicMinor };

inline const std::array<int, 7>& scaleSteps (Scale s)
{
    static const std::array<std::array<int, 7>, 9> table = {{
        {{2, 2, 1, 2, 2, 2, 1}}, // Ionian
        {{2, 1, 2, 2, 2, 1, 2}}, // Dorian
        {{1, 2, 2, 2, 1, 2, 2}}, // Phrygian
        {{2, 2, 2, 1, 2, 2, 1}}, // Lydian
        {{2, 2, 1, 2, 2, 1, 2}}, // Mixolydian
        {{2, 1, 2, 2, 1, 2, 2}}, // Aeolian
        {{1, 2, 2, 1, 2, 2, 2}}, // Locrian
        {{2, 1, 2, 2, 1, 3, 1}}, // Harmonic Minor
        {{2, 1, 2, 2, 2, 2, 1}}, // Melodic Minor
    }};
    return table[(size_t) s];
}

// ----- Ackordtyp -------------------------------------------------------------
// I Scripter sitter färgen på modifier-tangenter; här exponeras den som en
// vanlig parameter. Triad..13th sätter basgraderna; Sus2/Sus4 färgar tersen;
// Dom7/Dim tvingar fram intervallmönstret oavsett skala.
enum class ChordType { Triad, Sixth, Seventh, Ninth, Eleventh, Thirteenth,
                       Sus2, Sus4, Dom7, Dim };

enum class Voicing { Close, Drop2, Drop3, Drop2_4, Spread };

enum class OutOfScale { Mute, PassThrough, Snap };

struct Settings
{
    int key = 0;                 // 0..11, C..B
    Scale scale = Scale::Ionian;
    ChordType type = ChordType::Triad;
    int maxChordSize = 4;        // antal toner (1..12)
    int inversion = 0;           // -6..+6, klättrar utan wrap
    Voicing voicing = Voicing::Close;
    bool bass = false;           // basnot en oktav under
    double bassVel = 1.0;        // Bass Velocity % / 100
    double harmonyVel = 1.0;     // Harmony Velocity % / 100
    OutOfScale outOfScale = OutOfScale::Snap;
};

struct ChordNote { int pitch; double velocityScale; }; // velocityScale * spelad velocity

// ----- Hjälpare (conchord_08.js:885,896) ------------------------------------

// Pitch classes för skalans grader relativt grundtonen. {0,2,4,5,7,9,11} för dur.
inline std::array<int, 7> buildScalePitchClasses (const std::array<int, 7>& steps)
{
    std::array<int, 7> pcs {};
    pcs[0] = 0;
    int sum = 0;
    for (int i = 0; i < 6; ++i) { sum += steps[(size_t) i]; pcs[(size_t) (i + 1)] = sum; }
    return pcs;
}

// Returnerar skalgraden (0..6) för en pitch, eller -1 om utanför skalan.
inline int getScaleDegree (int pitch, int key, const std::array<int, 7>& pcs)
{
    int pcRel = (((pitch % 12) - key) % 12 + 12) % 12;
    for (int i = 0; i < 7; ++i)
        if (pcs[(size_t) i] == pcRel) return i;
    return -1;
}

// Basgrader för en ackordtyp (1-indexerade skalgrader, conchord_08.js:1054).
inline std::vector<int> baseDegreesFor (ChordType t)
{
    switch (t)
    {
        case ChordType::Sixth:      return {1, 3, 5, 6};
        case ChordType::Seventh:    return {1, 3, 5, 7};
        case ChordType::Ninth:      return {1, 3, 5, 7, 9};
        case ChordType::Eleventh:   return {1, 3, 5, 7, 9, 11};
        case ChordType::Thirteenth: return {1, 3, 5, 7, 9, 11, 13};
        default:                    return {1, 3, 5}; // Triad, Sus2/4, Dom7, Dim
    }
}

// Sus2/Sus4: ersätt tersen (grad 3, även en oktav upp = grad 10). (conchord_08.js:911)
inline std::vector<int> applyChordColor (std::vector<int> degrees, ChordType t)
{
    if (t == ChordType::Sus2 || t == ChordType::Sus4)
    {
        int replaceWith = (t == ChordType::Sus2) ? 2 : 4;
        for (auto& d : degrees)
            if ((d - 1) % 7 == 2) d = replaceWith + (d - 3);
    }
    return degrees;
}

// Stapla basgraderna i oktaver tills vi har numNotes toner. (conchord_08.js:935)
inline std::vector<int> extendDegrees (const std::vector<int>& base, int numNotes)
{
    std::vector<int> out;
    int len = (int) base.size();
    if (len == 0) return out;
    for (int i = 0; i < numNotes; ++i)
    {
        int octave = i / len;
        out.push_back (base[(size_t) (i % len)] + 7 * octave);
    }
    return out;
}

// Voicing FÖRE inversion (conchord_08.js:980). Förutsätter sorterad stigande.
inline void applyVoicing (std::vector<int>& chord, Voicing v)
{
    int len = (int) chord.size();
    if (v == Voicing::Drop2 && len >= 3)        chord[(size_t) (len - 2)] -= 12;
    else if (v == Voicing::Drop3 && len >= 4)   chord[(size_t) (len - 3)] -= 12;
    else if (v == Voicing::Drop2_4 && len >= 4) { chord[(size_t) (len - 2)] -= 12;
                                                  chord[(size_t) (len - 4)] -= 12; }
    else if (v == Voicing::Spread && len >= 3)
        for (int i = 1; i < len; i += 2) chord[(size_t) i] -= 12;
}

// Negativa inversions klättrar nedåt, positiva uppåt — utan wrap. (conchord_08.js:947)
inline void applyInversion (std::vector<int>& chord, int inversion)
{
    if (chord.size() <= 1) return;
    std::sort (chord.begin(), chord.end());

    int steps = inversion;
    while (steps > 0)
    {
        int lo = chord.front();
        chord.erase (chord.begin());
        int top = chord.back();
        while (lo <= top) lo += 12;
        chord.push_back (lo);
        --steps;
    }
    while (steps < 0)
    {
        int hi = chord.back();
        chord.pop_back();
        int bot = chord.front();
        while (hi >= bot) hi -= 12;
        chord.insert (chord.begin(), hi);
        ++steps;
    }
}

// ----- Huvudfunktionen (conchord_08.js:776) ---------------------------------
// Bygger ackordet för en nedtryckt tangent. Returnerar toner sorterade
// nedifrån och upp. Tom vector = mute (out-of-scale + Mute).
inline std::vector<ChordNote> buildChord (int inputPitch, const Settings& s)
{
    auto steps = scaleSteps (s.scale);
    auto pcs   = buildScalePitchClasses (steps);

    int root = inputPitch;
    int baseDegree = getScaleDegree (root, s.key, pcs);

    if (baseDegree == -1)
    {
        if (s.outOfScale == OutOfScale::Mute)        return {};
        if (s.outOfScale == OutOfScale::PassThrough) return {{ inputPitch, 1.0 }};
        // Snap to Scale: leta nedåt tills en skalton hittas.
        for (int t = 1; t <= 11 && baseDegree == -1; ++t)
        {
            root = inputPitch - t;
            baseDegree = getScaleDegree (root, s.key, pcs);
        }
        if (baseDegree == -1) return {}; // borde aldrig hända inom en oktav
    }

    const bool forceDom7 = (s.type == ChordType::Dom7);
    const bool forceDim  = (s.type == ChordType::Dim);

    // Basnoten räknas som ackordets första ton -> en färre ackordton. (js:793)
    auto colored = applyChordColor (baseDegreesFor (s.type), s.type);
    int numChordNotes = s.bass ? std::max (0, s.maxChordSize - 1) : s.maxChordSize;
    auto degreesForNotes = extendDegrees (colored, numChordNotes);

    // skalgrader -> halvtoner (conchord_08.js:799)
    std::vector<int> chord;
    static const int DOM7[4] = {0, 4, 7, 10};
    for (int i = 0; i < (int) degreesForNotes.size(); ++i)
    {
        int deg = degreesForNotes[(size_t) i];
        int absDegree = baseDegree + (deg - 1);
        int wrapped = absDegree % 7;
        int octaveOffset = absDegree / 7;
        int interval = pcs[(size_t) wrapped] - pcs[(size_t) baseDegree] + 12 * octaveOffset;
        int pitch = root + interval;

        if (forceDim)       pitch = root + 3 * i;                       // dim-stapel (js:809)
        else if (forceDom7) pitch = root + DOM7[i % 4] + 12 * (i / 4);  // dominant7 (js:817)

        chord.push_back (pitch);
    }

    // dedupe FÖRE inversion (js:833)
    std::sort (chord.begin(), chord.end());
    chord.erase (std::unique (chord.begin(), chord.end()), chord.end());

    // Voicing FÖRE inversion (js:843)
    applyVoicing (chord, s.voicing);
    applyInversion (chord, s.inversion);

    std::sort (chord.begin(), chord.end());
    chord.erase (std::unique (chord.begin(), chord.end()), chord.end());

    if (s.bass)
    {
        int bassPitch = root - 12;
        if (std::find (chord.begin(), chord.end(), bassPitch) == chord.end())
            chord.insert (chord.begin(), bassPitch);
    }

    // Velocity: index 0 = bas (bassVel) eller lägsta ton (full), övriga harmonyVel. (js:869)
    std::vector<ChordNote> notes;
    for (int i = 0; i < (int) chord.size(); ++i)
    {
        if (chord[(size_t) i] < 0 || chord[(size_t) i] > 127) continue;
        double v = (i == 0) ? (s.bass ? s.bassVel : 1.0) : s.harmonyVel;
        notes.push_back ({ chord[(size_t) i], v });
    }
    return notes;
}

} // namespace conchord
