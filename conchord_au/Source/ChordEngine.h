#pragma once

// ============================================================================
// ChordEngine — C++-port av conchord_09.js ackordmotor.
//
// Ren logik, inga JUCE-beroenden, så den kan unit-testas fristående. Speglar
// getSettings() + buildChordNotes() + modifier-/perf-lagret i conchord_09.js
// (och engine.js i prototypen) så nära som möjligt. Radhänvisningar i
// kommentarerna pekar på JS-källan.
//
// MODELL (skillnad mot den gamla v0.8-porten): i st f en enda `ChordType` som
// gör allt bär `Settings` nu samma muterbara fält som Scripter-motorn —
// baseDegrees / color / dim / dom7 / voiceLead — så att BÅDE en Chord Type-
// parameter OCH kryddzonens modifierare kan lägga sig ovanpå varandra.
//   buildSettings(RawParams)  -> bygger en Settings av råa parametrar
//                                (Chord Type, kryddmask, pitch bend, mod wheel)
//   buildChord(inputPitch, s) -> bygger tonerna för en nedtryckt tangent
// ============================================================================

#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <climits>

namespace conchord
{

// ----- Skalmallar (conchord_09.js:1176) -------------------------------------
// Intervall i halvtoner mellan skalgraderna; summan = 12.
enum class Scale { Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian,
                   Locrian, HarmonicMinor, MelodicMinor };
static constexpr int kNumScales = 9;

inline const std::array<int, 7>& scaleSteps (Scale s)
{
    static const std::array<std::array<int, 7>, kNumScales> table = {{
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

// ----- Bas-ackordtyp ---------------------------------------------------------
// Chord Type-parametern sätter grunduppsättningen av skalgrader (och, för
// Sus/Dom7/Dim, en initial färg). Kryddzonen kan sedan lägga till mer ovanpå.
enum class ChordType { Triad, Sixth, Seventh, Ninth, Eleventh, Thirteenth,
                       Sus2, Sus4, Dom7, Dim };

enum class Voicing { Close, Drop2, Drop3, Drop2_4, Spread };

// Out-of-Scale Keys: full v0.9-uppsättning (conchord_09.js:1397).
enum class OutOfScale { Mute, PassThrough, Snap, Diminished, ChromBass };

// Tersfärg som applyChordColor förstår.
enum class Color { Plain, Sus2, Sus4, No3 };

// ----- Kryddzonens modifierare (conchord_09.js:340) -------------------------
// Index = tangentens position i zonen (0 = lägsta). Måste matcha både GUI:t och
// processorns zonmask (en bit per index).
enum class Mod { Sus2 = 0, Dim, Sus4, Sixth, Seventh, Dom7, Add9, Parallel, VoiceLead };
static constexpr int kNumModifiers = 9;

struct Settings
{
    int key = 0;                              // 0..11, C..B
    std::array<int, 7> steps = scaleSteps (Scale::Ionian); // aktiv skala (Parallel kan byta)
    std::vector<int> baseDegrees { 1, 3, 5 }; // skalgrader (1-indexerade) före färg
    Color color = Color::Plain;
    bool dim = false;        // tvingar förminskad stapel (+3 per ton)
    bool dom7 = false;       // tvingar dominant7-mönster
    bool voiceLead = false;  // lägg ackordet närmast föregående (kräver ankare)
    int size = 4;            // antal toner (1..12)
    int inversion = 0;       // -6..+6, klättrar utan wrap (UI-slidern)
    int inversionPerf = 0;   // offset från hjul/bend — hoppas över för 1-notsackord
    Voicing voicing = Voicing::Close;
    bool bass = false;       // basnot en oktav under
    double bassVel = 1.0;    // Bass Velocity % / 100
    double harmonyVel = 1.0; // Harmony Velocity % / 100
    int strumMs = 0;
    bool strumUp = true;
    OutOfScale outOfScale = OutOfScale::Snap;
};

struct ChordNote { int pitch; double velocityScale; }; // velocityScale * spelad velocity

// ----- Skala/grad-hjälpare (conchord_09.js:985,996) -------------------------

// Pitch classes för skalans grader relativt grundtonen. {0,2,4,5,7,9,11} för dur.
inline std::array<int, 7> buildScalePCs (const std::array<int, 7>& steps)
{
    std::array<int, 7> pcs {};
    pcs[0] = 0;
    int sum = 0;
    for (int i = 0; i < 6; ++i) { sum += steps[(size_t) i]; pcs[(size_t) (i + 1)] = sum; }
    return pcs;
}

// Skalgraden (0..6) för en pitch, eller -1 om utanför skalan.
inline int getScaleDegree (int pitch, int key, const std::array<int, 7>& pcs)
{
    int pcRel = (((pitch % 12) - key) % 12 + 12) % 12;
    for (int i = 0; i < 7; ++i)
        if (pcs[(size_t) i] == pcRel) return i;
    return -1;
}

// ----- Ackord-formning (conchord_09.js:1011) --------------------------------

// Sus2/Sus4: ersätt tersen (grad 3, även oktaven upp = grad 10). No 3: filtrera.
inline std::vector<int> applyChordColor (std::vector<int> degrees, Color c)
{
    if (c == Color::Sus2 || c == Color::Sus4)
    {
        int replaceWith = (c == Color::Sus2) ? 2 : 4;
        for (auto& d : degrees)
            if ((d - 1) % 7 == 2) d = replaceWith + (d - 3);
    }
    else if (c == Color::No3)
    {
        std::vector<int> filtered;
        for (int d : degrees) if ((d - 1) % 7 != 2) filtered.push_back (d);
        if (! filtered.empty()) degrees = filtered;
    }
    return degrees;
}

// Lägg till en skalgrad utan att skriva över de andra (6th/7th/Add9 stackar).
// Växer size så graden får plats (extendDegrees trunkerar annars). (js:331)
inline void addDegree (Settings& s, int deg)
{
    if (std::find (s.baseDegrees.begin(), s.baseDegrees.end(), deg) == s.baseDegrees.end())
    {
        s.baseDegrees.push_back (deg);
        std::sort (s.baseDegrees.begin(), s.baseDegrees.end());
    }
    if (s.size < (int) s.baseDegrees.size()) s.size = (int) s.baseDegrees.size();
}

// Stapla basgraderna i oktaver tills vi har numNotes toner. (js:1035)
inline std::vector<int> extendDegrees (const std::vector<int>& base, int numNotes)
{
    std::vector<int> out;
    int len = (int) base.size();
    if (len == 0) return out;
    for (int i = 0; i < numNotes; ++i)
        out.push_back (base[(size_t) (i % len)] + 7 * (i / len));
    return out;
}

// Voicing FÖRE inversion (js:1140). Förutsätter sorterad stigande.
inline std::vector<int> applyVoicing (std::vector<int> chord, Voicing v)
{
    int len = (int) chord.size();
    if (v == Voicing::Drop2 && len >= 3)        chord[(size_t) (len - 2)] -= 12;
    else if (v == Voicing::Drop3 && len >= 4)   chord[(size_t) (len - 3)] -= 12;
    else if (v == Voicing::Drop2_4 && len >= 4) { chord[(size_t) (len - 2)] -= 12;
                                                  chord[(size_t) (len - 4)] -= 12; }
    else if (v == Voicing::Spread && len >= 3)
        for (int i = 1; i < len; i += 2) chord[(size_t) i] -= 12;
    return chord;
}

// Negativa inversions klättrar nedåt, positiva uppåt — utan wrap. (js:1047)
inline std::vector<int> applyInversion (std::vector<int> chord, int inversion)
{
    if (chord.size() <= 1) return chord;
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
    return chord;
}

// ----- Voice leading (nära ackord, conchord_09.js:1085) ---------------------

// Lägre = mindre total rörelse. Lika många toner: para ihop sorterat (gemensamma
// toner hamnar på avstånd 0). Olika antal: varje ny ton till närmaste ankarton.
inline int voiceLeadCost (std::vector<int> a, std::vector<int> b)
{
    std::sort (a.begin(), a.end());
    std::sort (b.begin(), b.end());
    int cost = 0;
    if (a.size() == b.size())
    {
        for (size_t i = 0; i < a.size(); ++i) cost += std::abs (a[i] - b[i]);
        return cost;
    }
    for (size_t i = 0; i < a.size(); ++i)
    {
        int nearest = INT_MAX;
        for (size_t j = 0; j < b.size(); ++j) nearest = std::min (nearest, std::abs (a[i] - b[j]));
        cost += nearest;
    }
    return cost;
}

// Väljer den oktav/inversions-omläggning av chord (redan voicad) som rör sig
// minst från anchor. Bevarar tonklassuppsättningen -> samma ackordtyp, omlagd.
inline std::vector<int> applyVoiceLeading (const std::vector<int>& chord,
                                           const std::vector<int>& anchor)
{
    int n = (int) chord.size();
    static const int shifts[5] = { -24, -12, 0, 12, 24 };
    std::vector<int> best = chord;
    int bestCost = INT_MAX;
    bool found = false;
    for (int si = 0; si < 5; ++si)
    {
        std::vector<int> shifted;
        shifted.reserve ((size_t) n);
        for (int k = 0; k < n; ++k) shifted.push_back (chord[(size_t) k] + shifts[si]);
        for (int inv = -(n - 1); inv <= n - 1; ++inv)
        {
            auto cand = applyInversion (shifted, inv);
            int cost = voiceLeadCost (cand, anchor);
            if (cost < bestCost) { bestCost = cost; best = cand; found = true; }
        }
    }
    return found ? best : chord;
}

// Sortera + dedupe en pitch-vektor in place.
inline void sortUnique (std::vector<int>& v)
{
    std::sort (v.begin(), v.end());
    v.erase (std::unique (v.begin(), v.end()), v.end());
}

// ----- Huvudfunktionen (conchord_09.js:821) ---------------------------------
// Bygger ackordet för en nedtryckt tangent. Returnerar toner sorterade
// nedifrån och upp. Tom vector = mute (out-of-scale + Mute).
//   extras   : hållna join-toner som vävs in som äkta ackordtoner (eller null)
//   vlAnchor : föregående ackords toner för voice leading (eller null)
inline std::vector<ChordNote> buildChord (int inputPitch, const Settings& sIn,
                                          const std::vector<int>* extras = nullptr,
                                          const std::vector<int>* vlAnchor = nullptr)
{
    Settings s = sIn;                 // s.dim kan sättas för Out-of-Scale Diminished
    auto pcs = buildScalePCs (s.steps);

    int root = inputPitch;
    int baseDegree = getScaleDegree (root, s.key, pcs);
    bool chromBass = false;

    if (baseDegree == -1)
    {
        if (s.outOfScale == OutOfScale::Mute)        return {};
        if (s.outOfScale == OutOfScale::PassThrough) return {{ inputPitch, 1.0 }};
        if (s.outOfScale == OutOfScale::Diminished)  s.dim = true; // dim-stapeln skriver över intervallet
        else if (s.outOfScale == OutOfScale::ChromBass)
        {
            chromBass = true; // snappa till närmaste skalton, flytta bas kromatiskt senare
            for (int d = 1; d <= 6 && baseDegree == -1; ++d)
            {
                root = inputPitch - d; baseDegree = getScaleDegree (root, s.key, pcs);
                if (baseDegree == -1) { root = inputPitch + d; baseDegree = getScaleDegree (root, s.key, pcs); }
            }
        }
        else // Snap to Scale: leta nedåt tills en skalton hittas
        {
            for (int t = 1; t <= 11 && baseDegree == -1; ++t)
            {
                root = inputPitch - t; baseDegree = getScaleDegree (root, s.key, pcs);
            }
        }
    }

    // Diminished kan lämna baseDegree == -1 (root = den spelade out-of-scale-tonen);
    // dim-stapeln nedan skriver ändå över intervallet, så vi använder 0 som säkert index.
    int safeBase = baseDegree < 0 ? 0 : baseDegree;

    auto colored = applyChordColor (s.baseDegrees, s.color);
    int numChordNotes = (s.bass && ! chromBass) ? std::max (0, s.size - 1) : s.size;
    auto degreesForNotes = extendDegrees (colored, numChordNotes);

    std::vector<int> chord;
    static const int DOM7[4] = { 0, 4, 7, 10 };
    for (int i = 0; i < (int) degreesForNotes.size(); ++i)
    {
        int deg = degreesForNotes[(size_t) i];
        int absDegree = safeBase + (deg - 1);
        int wrapped = ((absDegree % 7) + 7) % 7;
        int octaveOffset = (int) std::floor (absDegree / 7.0);
        int interval = pcs[(size_t) wrapped] - pcs[(size_t) safeBase] + 12 * octaveOffset;
        int pitch = root + interval;

        if (s.dim)       pitch = root + 3 * i;                          // dim-stapel (js:888)
        else if (s.dom7) pitch = root + DOM7[i % 4] + 12 * (i / 4);     // dominant7 (js:894)

        chord.push_back (pitch);
    }

    if (extras) for (int e : *extras) chord.push_back (e);

    sortUnique (chord); // FÖRE inversion -> konstant nottal

    int inversion = s.inversion;
    if ((int) chord.size() > 1) inversion += s.inversionPerf;
    chord = applyVoicing (chord, s.voicing);
    if (s.voiceLead && vlAnchor && ! vlAnchor->empty() && chord.size() > 1)
        chord = applyVoiceLeading (chord, *vlAnchor);
    else
        chord = applyInversion (chord, inversion);

    sortUnique (chord);

    if (chromBass)
    {
        int rootPc = ((root % 12) + 12) % 12;
        for (size_t bi = 0; bi < chord.size(); ++bi)
            if (((chord[bi] % 12) + 12) % 12 == rootPc) { chord.erase (chord.begin() + (long) bi); break; }
        if (std::find (chord.begin(), chord.end(), inputPitch) == chord.end()) chord.push_back (inputPitch);
        if (s.bass && std::find (chord.begin(), chord.end(), inputPitch - 12) == chord.end())
            chord.insert (chord.begin(), inputPitch - 12);
        sortUnique (chord);
    }
    else if (s.bass)
    {
        int bassPitch = root - 12;
        if (std::find (chord.begin(), chord.end(), bassPitch) == chord.end())
            chord.insert (chord.begin(), bassPitch);
    }

    // Velocity: index 0 = bas (bassVel) eller lägsta ton (full), övriga harmonyVel. (js:971)
    std::vector<ChordNote> notes;
    for (int i = 0; i < (int) chord.size(); ++i)
    {
        if (chord[(size_t) i] < 0 || chord[(size_t) i] > 127) continue;
        double v = (i == 0) ? (s.bass ? s.bassVel : 1.0) : s.harmonyVel;
        notes.push_back ({ chord[(size_t) i], v });
    }
    return notes;
}

// ----- Chord Type -> bas (sätter baseDegrees + ev. färg/dim/dom7) -----------
inline void applyChordType (Settings& s, ChordType t)
{
    switch (t)
    {
        case ChordType::Triad:      s.baseDegrees = { 1, 3, 5 }; break;
        case ChordType::Sixth:      s.baseDegrees = { 1, 3, 5, 6 }; break;
        case ChordType::Seventh:    s.baseDegrees = { 1, 3, 5, 7 }; break;
        case ChordType::Ninth:      s.baseDegrees = { 1, 3, 5, 7, 9 }; break;
        case ChordType::Eleventh:   s.baseDegrees = { 1, 3, 5, 7, 9, 11 }; break;
        case ChordType::Thirteenth: s.baseDegrees = { 1, 3, 5, 7, 9, 11, 13 }; break;
        case ChordType::Sus2:       s.baseDegrees = { 1, 3, 5 }; s.color = Color::Sus2; break;
        case ChordType::Sus4:       s.baseDegrees = { 1, 3, 5 }; s.color = Color::Sus4; break;
        case ChordType::Dom7:       s.baseDegrees = { 1, 3, 5 }; s.dom7 = true; if (s.size < 4) s.size = 4; break;
        case ChordType::Dim:        s.baseDegrees = { 1, 3, 5 }; s.dim = true; break;
    }
}

// ----- Parallel-lånets motsatta skala (conchord_09.js:1190) -----------------
inline Scale borrowOpposite (Scale cur, int borrowPairing /* 0 Major/Minor, 1 Interval Mirror */)
{
    if (borrowPairing == 1) // Interval Mirror: vänd intervallsträngen (spegel runt Dorian)
    {
        switch (cur)
        {
            case Scale::Lydian:     return Scale::Locrian;
            case Scale::Locrian:    return Scale::Lydian;
            case Scale::Ionian:     return Scale::Phrygian;
            case Scale::Phrygian:   return Scale::Ionian;
            case Scale::Mixolydian: return Scale::Aeolian;
            case Scale::Aeolian:    return Scale::Mixolydian;
            case Scale::Dorian:     return Scale::Dorian; // självspegel
            default:                return Scale::Ionian; // Harmonic/Melodic Minor
        }
    }
    switch (cur) // Major/Minor: dur<->moll vid samma grundton
    {
        case Scale::Ionian:     return Scale::Aeolian;
        case Scale::Aeolian:    return Scale::Ionian;
        case Scale::Mixolydian: return Scale::Dorian;
        case Scale::Dorian:     return Scale::Mixolydian;
        case Scale::Lydian:     return Scale::Phrygian;
        case Scale::Phrygian:   return Scale::Lydian;
        case Scale::Locrian:    return Scale::Aeolian; // oparad -> ren moll
        default:                return Scale::Ionian;  // Harmonic/Melodic Minor
    }
}

// Applicera en kryddtangent på s (conchord_09.js ZONE_MODIFIERS, :340).
inline void applyModifier (Settings& s, int idx, Scale currentScale, int borrowPairing)
{
    switch ((Mod) idx)
    {
        case Mod::Sus2:      s.color = Color::Sus2; break;
        case Mod::Dim:       s.dim = true; break;
        case Mod::Sus4:      s.color = Color::Sus4; break;
        case Mod::Sixth:     addDegree (s, 6); break;
        case Mod::Seventh:   addDegree (s, 7); break;
        case Mod::Dom7:      s.dom7 = true; if (s.size < 4) s.size = 4; break;
        case Mod::Add9:      addDegree (s, 9); break;
        case Mod::Parallel:  s.steps = scaleSteps (borrowOpposite (currentScale, borrowPairing)); break;
        case Mod::VoiceLead: s.voiceLead = true; break;
    }
}

// ----- buildSettings: råa parametrar -> Settings (speglar getSettings() + ----
//        engine.js buildSettings, conchord_09.js:738). ------------------------
struct RawParams
{
    int key = 0;
    Scale scale = Scale::Ionian;
    ChordType type = ChordType::Triad;
    int maxSize = 4;
    int inversion = 0;
    int invRangeDown = 3, invRangeUp = 3;
    Voicing voicing = Voicing::Close;
    bool bass = false;
    double bassVel = 1.0, harmonyVel = 1.0;
    int strumMs = 0;
    bool strumUp = true;
    OutOfScale outOfScale = OutOfScale::Snap;
    int borrowPairing = 0;

    // Kryddzon
    bool modifierKeys = true;
    std::uint32_t modMask = 0; // bit i = kryddtangent i aktiv

    // Performance-lager. pb: -1..+1 (0 = vila); pbTouched = false -> orörd (neutral).
    // mw: <0 = orörd (sentinel), annars 0..1.
    int pbTarget = 2; // 0 Off, 1 Inversion, 2 Chord Size
    int mwTarget = 2; // 0 Off, 1 Chord Size, 2 Inversion
    bool pbTouched = false;
    float pb = 0.0f;
    float mw = -1.0f;
};

inline Settings buildSettings (const RawParams& r)
{
    Settings s;
    s.key = r.key;
    s.steps = scaleSteps (r.scale);
    s.color = Color::Plain;
    s.dim = false; s.dom7 = false; s.voiceLead = false;
    s.size = r.maxSize;
    s.inversion = r.inversion;
    s.inversionPerf = 0;
    s.voicing = r.voicing;
    s.bass = r.bass;
    s.bassVel = r.bassVel; s.harmonyVel = r.harmonyVel;
    s.strumMs = r.strumMs; s.strumUp = r.strumUp;
    s.outOfScale = r.outOfScale;

    // Chord Type sätter basen (kan höja size till 4 för Dom7)
    applyChordType (s, r.type);

    // Kryddzon ovanpå (zonordning, senare vinner) — före hjul/bend så Size-hjulet
    // fortfarande kan skala den modifierade storleken.
    if (r.modifierKeys && r.modMask)
        for (int i = 0; i < kNumModifiers; ++i)
            if (r.modMask & (1u << i)) applyModifier (s, i, r.scale, r.borrowPairing);

    // Performance-kontroller (conchord_09.js:773). Golv för size-svepen: rak
    // kontinuum 1..max (full ner = 1 ton, full upp = Max Chord Size).
    const int invDown = r.invRangeDown, invUp = r.invRangeUp;
    const int perfSizeFloor = 1;

    if (r.mwTarget == 1) // Mod Wheel -> Chord Size
    {
        double mw = r.mw < 0 ? 1.0 : (double) r.mw;
        s.size = std::max (perfSizeFloor, (int) std::ceil (s.size * mw));
    }
    if (r.mwTarget == 2 && r.mw >= 0) // Mod Wheel -> Inversion (centrerat unipolärt)
    {
        double mw = ((double) r.mw - 0.5) * 2.0;
        s.inversionPerf += (int) std::lround (mw * (mw >= 0 ? invUp : invDown));
    }

    if (r.pbTarget == 1 && r.pbTouched) // Pitch Bend -> Inversion
        s.inversionPerf += (int) std::lround (r.pb * (r.pb >= 0 ? invUp : invDown));
    if (r.pbTarget == 2 && r.pbTouched) // Pitch Bend -> Chord Size (svep floor..max)
    {
        double amt = ((double) r.pb + 1.0) / 2.0;
        s.size = std::max (perfSizeFloor, (int) std::ceil (s.size * amt));
    }

    return s;
}

} // namespace conchord
