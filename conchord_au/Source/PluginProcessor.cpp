#include "PluginProcessor.h"
#include "PluginEditor.h"

using APVTS = juce::AudioProcessorValueTreeState;
using namespace conchord;

//==============================================================================
// Parameterlayout — hela v0.9-uppsättningen (conchord_09.js PluginParameters).
//==============================================================================
APVTS::ParameterLayout ConchordProcessor::createLayout()
{
    using namespace juce;
    APVTS::ParameterLayout layout;

    StringArray presets  { "(none)", "Harp", "Piano", "Pad", "Pluck" };
    StringArray keys     { "C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B" };
    StringArray scales   { "Ionian","Dorian","Phrygian","Lydian","Mixolydian","Aeolian",
                           "Locrian","Harmonic Minor","Melodic Minor" };
    StringArray types    { "Triad","6th","7th","9th","11th","13th","Sus2","Sus4","Dom 7","Dim" };
    StringArray voicings { "Close","Drop 2","Drop 3","Drop 2+4","Spread" };
    StringArray oos      { "Mute","Pass Through","Snap to Scale","Diminished","Chrom Bass" };
    StringArray strumDir { "Up","Down" };
    StringArray modMode  { "Hold","Latch" };
    StringArray borrow   { "Major / Minor","Interval Mirror" };
    StringArray pbTarget { "Off","Inversion","Chord Size" };
    StringArray mwTarget { "Off","Chord Size","Inversion" };
    StringArray resetOpt { "Never","On New Chord","On Keys Released" };

    auto choice = [&] (const char* id, const String& nm, const StringArray& s, int def)
        { layout.add (std::make_unique<AudioParameterChoice> (ParameterID { id, 1 }, nm, s, def)); };
    auto intp = [&] (const char* id, const String& nm, int lo, int hi, int def)
        { layout.add (std::make_unique<AudioParameterInt> (ParameterID { id, 1 }, nm, lo, hi, def)); };
    auto boolp = [&] (const char* id, const String& nm, bool def)
        { layout.add (std::make_unique<AudioParameterBool> (ParameterID { id, 1 }, nm, def)); };

    choice ("preset",     "Preset", presets, 0);
    choice ("key",        "Key", keys, 0);
    choice ("scale",      "Scale", scales, 0);
    choice ("type",       "Chord Type", types, 0);
    intp   ("size",       "Max Chord Size", 1, 12, 4);
    intp   ("inversion",  "Inversion", -6, 6, 0);
    intp   ("invDown",    "Inversion Range -", 0, 6, 3);
    intp   ("invUp",      "Inversion Range +", 0, 6, 3);
    choice ("voicing",    "Voicing", voicings, 0);
    boolp  ("bass",       "Bass Note", false);
    intp   ("bassVel",    "Bass Velocity %", 10, 150, 100);
    intp   ("harmVel",    "Harmony Velocity %", 10, 150, 100);
    intp   ("strum",      "Strum (ms)", 0, 200, 0);
    choice ("strumDir",   "Strum Direction", strumDir, 0);
    choice ("oos",        "Out-of-Scale Keys", oos, 2);
    boolp  ("modKeys",    "Modifier Keys", true);
    choice ("modMode",    "Modifier Mode", modMode, 0);
    choice ("borrow",     "Borrow Pairing", borrow, 0);
    choice ("pb",         "Pitch Bend", pbTarget, 2);
    boolp  ("pbLatch",    "Pitch Bend Latch", true);
    choice ("pbReset",    "Pitch Bend Reset", resetOpt, 0);
    choice ("mw",         "Mod Wheel", mwTarget, 2);
    choice ("mwReset",    "Mod Wheel Reset", resetOpt, 2);
    intp   ("modZoneLow", "Mod Zone Low", 48, 88, 48);

    return layout;
}

//==============================================================================
// Ljudbuss läggs bara till i Standalone — så att AU:n förblir en ren MIDI-FX
// ('aumi', ingen audio I/O) i Logic och auval inte påverkas.
juce::AudioProcessor::BusesProperties ConchordProcessor::makeBuses()
{
    BusesProperties b;
    if (juce::PluginHostType::getPluginLoadedAs() == wrapperType_Standalone)
        b = b.withOutput ("Output", juce::AudioChannelSet::stereo(), true);
    return b;
}

bool ConchordProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& out = layouts.getMainOutputChannelSet();
    return out.isDisabled()
        || out == juce::AudioChannelSet::mono()
        || out == juce::AudioChannelSet::stereo();
}

ConchordProcessor::ConchordProcessor()
    : juce::AudioProcessor (makeBuses()),
      apvts (*this, nullptr, "PARAMS", createLayout())
{
    // Sampler-rösterna byggs i prepareToPlay (behöver samplerate).
}

void ConchordProcessor::prepareToPlay (double sr, int)
{
    sampleRate = sr;
    samplePos = 0;
    pending.clear();
    active.clear();
    heldKeys.clear();
    sounding.fill (0);
    voiceLeadAnchor.clear();
    haveLastApplied = false;
    keyboardCollector.reset (sr);
    conchord::configurePianoSynth (pianoSynth, sr); // sampler-piano för Standalone
    uiRoot = 60;
    refreshUi();
}

void ConchordProcessor::reset()
{
    sounding.fill (0);
    active.clear();
    pending.clear();
    heldKeys.clear();
    voiceLeadAnchor.clear();
    modMask.store (0);
    pbValue.store (0.0f);
    pbTouched.store (false);
    mwValue.store (-1.0f);
    haveLastApplied = false;
    pianoSynth.allNotesOff (0, false);
    refreshUi();
}

//==============================================================================
RawParams ConchordProcessor::currentRaw() const
{
    RawParams r;
    r.key          = (int) raw ("key");
    r.scale        = (Scale) (int) raw ("scale");
    r.type         = (ChordType) (int) raw ("type");
    r.maxSize      = (int) raw ("size");
    r.inversion    = (int) raw ("inversion");
    r.invRangeDown = (int) raw ("invDown");
    r.invRangeUp   = (int) raw ("invUp");
    r.voicing      = (Voicing) (int) raw ("voicing");
    r.bass         = raw ("bass") > 0.5f;
    r.bassVel      = raw ("bassVel") / 100.0;
    r.harmonyVel   = raw ("harmVel") / 100.0;
    r.strumMs      = (int) raw ("strum");
    r.strumUp      = raw ("strumDir") < 0.5f;
    r.outOfScale   = (OutOfScale) (int) raw ("oos");
    r.borrowPairing = (int) raw ("borrow");
    r.modifierKeys = raw ("modKeys") > 0.5f;
    r.modMask      = modMask.load();
    r.pbTarget     = (int) raw ("pb");
    r.mwTarget     = (int) raw ("mw");
    r.pbTouched    = pbTouched.load();
    r.pb           = pbValue.load();
    r.mw           = mwValue.load();
    return r;
}

static bool sameRaw (const RawParams& a, const RawParams& b)
{
    return a.key == b.key && a.scale == b.scale && a.type == b.type && a.maxSize == b.maxSize
        && a.inversion == b.inversion && a.invRangeDown == b.invRangeDown && a.invRangeUp == b.invRangeUp
        && a.voicing == b.voicing && a.bass == b.bass && a.bassVel == b.bassVel && a.harmonyVel == b.harmonyVel
        && a.strumMs == b.strumMs && a.strumUp == b.strumUp && a.outOfScale == b.outOfScale
        && a.borrowPairing == b.borrowPairing && a.modifierKeys == b.modifierKeys && a.modMask == b.modMask
        && a.pbTarget == b.pbTarget && a.mwTarget == b.mwTarget && a.pbTouched == b.pbTouched
        && a.pb == b.pb && a.mw == b.mw;
}

//==============================================================================
bool ConchordProcessor::isInZone (int pitch) const
{
    if (raw ("modKeys") <= 0.5f) return false;
    int low = (int) raw ("modZoneLow");
    return pitch >= low && pitch < low + conchord::kNumModifiers;
}

//==============================================================================
// Referensräknad notsändning: NoteOn bara när tonen inte redan låter, NoteOff
// när sista hållaren släpper -> två ackord kan dela toner utan att döda varandra.
void ConchordProcessor::scheduleOrEmit (const juce::MidiMessage& m, juce::int64 when,
                                        juce::int64 blockStart, juce::int64 blockEnd,
                                        juce::MidiBuffer& out)
{
    if (when < blockStart) when = blockStart;
    if (when < blockEnd) out.addEvent (m, (int) (when - blockStart));
    else                 pending.push_back ({ when, m });
}

void ConchordProcessor::emitOn (int pitch, int velocity, juce::int64 when,
                                juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    if (pitch < 0 || pitch > 127) return;
    if (++sounding[(size_t) pitch] > 1) return; // låter redan
    auto v = (juce::uint8) juce::jlimit (1, 127, velocity);
    scheduleOrEmit (juce::MidiMessage::noteOn (1, pitch, v), when, blockStart, blockEnd, out);
}

void ConchordProcessor::emitOff (int pitch, juce::int64 when,
                                 juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    if (pitch < 0 || pitch > 127) return;
    if (sounding[(size_t) pitch] == 0) return;
    if (--sounding[(size_t) pitch] > 0) return; // någon annan håller tonen
    scheduleOrEmit (juce::MidiMessage::noteOff (1, pitch), when, blockStart, blockEnd, out);
}

//==============================================================================
void ConchordProcessor::startChord (int inputPitch, int velocity, juce::int64 when,
                                    juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    // dubbel note-on utan note-off: släpp ev. gammalt ackord på samma tangent
    if (auto it = active.find (inputPitch); it != active.end())
    {
        for (auto& v : it->second.voices) emitOff (v.pitch, when, blockStart, blockEnd, out);
        active.erase (it);
    }

    auto r = currentRaw();
    auto s = buildSettings (r);
    std::vector<int> anchor = s.voiceLead ? voiceLeadAnchor : std::vector<int> {};
    const std::vector<int>* ap = anchor.empty() ? nullptr : &anchor;

    auto built = buildChord (inputPitch, s, nullptr, ap);
    if (built.empty()) return; // out-of-scale + Mute

    // ankaret för NÄSTA ackord = detta ackords toner (uppdateras alltid)
    voiceLeadAnchor.clear();
    for (auto& n : built) voiceLeadAnchor.push_back (n.pitch);

    Record rec;
    rec.velocity = velocity;
    rec.vlAnchor = anchor;

    std::vector<ChordNote> ordered (built.begin(), built.end());
    if (! s.strumUp) std::reverse (ordered.begin(), ordered.end()); // Down: uppifrån och ned

    for (int i = 0; i < (int) ordered.size(); ++i)
    {
        int delay = s.strumMs > 0 ? (int) std::llround (i * s.strumMs / 1000.0 * sampleRate) : 0;
        int vel = (int) std::lround (velocity * ordered[(size_t) i].velocityScale);
        emitOn (ordered[(size_t) i].pitch, vel, when + delay, blockStart, blockEnd, out);
        rec.voices.push_back ({ ordered[(size_t) i].pitch, delay });
    }

    active[inputPitch] = std::move (rec);
    uiRoot = inputPitch;
}

bool ConchordProcessor::releaseChord (int inputPitch, juce::int64 when,
                                      juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    auto it = active.find (inputPitch);
    if (it == active.end()) return false;
    for (auto& v : it->second.voices)
        emitOff (v.pitch, when + v.delaySamples, blockStart, blockEnd, out); // spegla strum-delay
    active.erase (it);
    return true;
}

void ConchordProcessor::releaseAll (juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    for (auto& [k, rec] : active)
        for (auto& v : rec.voices) emitOff (v.pitch, blockStart, blockStart, blockEnd, out);
    active.clear();
}

//==============================================================================
// Morfa hållna ackord när inställningarna ändrats. Bara toner som ändras får
// NoteOff/NoteOn — gemensamma toner sustainar (ingen retrigg). suppressAdd =
// subtraktiv release (lägg aldrig till toner; bara tysta de som försvann).
void ConchordProcessor::applySettingsChange (bool suppressAdd, juce::int64 when,
                                             juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    auto r = currentRaw();
    if (haveLastApplied && sameRaw (r, lastApplied)) return;
    lastApplied = r;
    haveLastApplied = true;

    if (! active.empty())
    {
        auto s = buildSettings (r);
        for (auto& [inputPitch, rec] : active)
        {
            const std::vector<int>* ap = rec.vlAnchor.empty() ? nullptr : &rec.vlAnchor;
            auto built = buildChord (inputPitch, s, nullptr, ap);

            std::set<int> newSet;
            for (auto& n : built) newSet.insert (n.pitch);

            // NoteOff för toner som inte längre ska med; behåll de gemensamma (med delay)
            std::vector<Voice> kept;
            for (auto& v : rec.voices)
            {
                if (newSet.count (v.pitch)) kept.push_back (v);
                else emitOff (v.pitch, when + v.delaySamples, blockStart, blockEnd, out);
            }

            std::set<int> heldSet;
            for (auto& v : kept) heldSet.insert (v.pitch);

            std::vector<Voice> updated = kept;
            if (! suppressAdd)
                for (auto& n : built)
                {
                    if (heldSet.count (n.pitch)) continue;
                    int vel = (int) std::lround (rec.velocity * n.velocityScale);
                    emitOn (n.pitch, vel, when, blockStart, blockEnd, out);
                    updated.push_back ({ n.pitch, 0 });
                }

            std::sort (updated.begin(), updated.end(),
                       [] (const Voice& a, const Voice& b) { return a.pitch < b.pitch; });
            rec.voices = std::move (updated);
        }
    }

    refreshUi();
}

//==============================================================================
void ConchordProcessor::handleModZone (const juce::MidiMessage& m, juce::int64 when,
                                       juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out)
{
    int idx = m.getNoteNumber() - (int) raw ("modZoneLow");
    if (idx < 0 || idx >= conchord::kNumModifiers) return;

    bool isOff = m.isNoteOff() || (m.isNoteOn() && m.getVelocity() == 0);
    bool latch = raw ("modMode") > 0.5f;
    std::uint32_t bit = 1u << idx;
    bool turnedOff = false;

    if (latch)
    {
        if (isOff) return; // varje tryck togglar, släpp ignoreras
        std::uint32_t cur = modMask.load();
        if (cur & bit) { modMask.store (cur & ~bit); turnedOff = true; }
        else             modMask.store (cur | bit);
    }
    else // Hold
    {
        if (isOff) { modMask.fetch_and (~bit); turnedOff = true; }
        else         modMask.fetch_or (bit);
    }

    applySettingsChange (turnedOff, when, blockStart, blockEnd, out);
}

void ConchordProcessor::applyResets (bool newChord)
{
    int pbReset = (int) raw ("pbReset"); // 0 Never, 1 On New Chord, 2 On Keys Released
    if ((newChord && pbReset == 1) || (! newChord && pbReset == 2))
    {
        pbValue.store (0.0f);
        pbTouched.store (false);
    }
    int mwReset = (int) raw ("mwReset");
    if ((newChord && mwReset == 1) || (! newChord && mwReset == 2))
        mwValue.store (-1.0f);
}

//==============================================================================
void ConchordProcessor::refreshUi()
{
    auto r = currentRaw();
    auto s = buildSettings (r);

    std::vector<int> anchor;
    if (auto it = active.find (uiRoot); it != active.end()) anchor = it->second.vlAnchor;
    const std::vector<int>* ap = anchor.empty() ? nullptr : &anchor;

    std::vector<int> activeP, fullP;
    if (uiRoot >= 0)
    {
        for (auto& n : buildChord (uiRoot, s, nullptr, ap)) activeP.push_back (n.pitch);
        auto rFull = r; rFull.pbTouched = false; // ghost: full storlek (pb gallrar inte)
        auto sFull = buildSettings (rFull);
        for (auto& n : buildChord (uiRoot, sFull, nullptr, ap)) fullP.push_back (n.pitch);
    }

    const juce::SpinLock::ScopedLockType l (uiLock);
    uiState.root = uiRoot;
    uiState.active = std::move (activeP);
    uiState.full = std::move (fullP);
}

//==============================================================================
void ConchordProcessor::setParam (const char* id, float value)
{
    if (auto* p = apvts.getParameter (id)) p->setValueNotifyingHost (p->convertTo0to1 (value));
}

void ConchordProcessor::applyPreset (int index)
{
    switch (index) // 1 Harp, 2 Piano, 3 Pad, 4 Pluck (conchord_09.js PRESETS)
    {
        case 1: setParam ("size", 7); setParam ("voicing", 4); setParam ("strum", 90);
                setParam ("strumDir", 0); setParam ("bass", 0); setParam ("harmVel", 85); break;
        case 2: setParam ("size", 4); setParam ("voicing", 1); setParam ("strum", 0);
                setParam ("bass", 1); setParam ("bassVel", 110); setParam ("harmVel", 100); break;
        case 3: setParam ("size", 5); setParam ("voicing", 3); setParam ("strum", 0);
                setParam ("bass", 0); setParam ("harmVel", 95); break;
        case 4: setParam ("size", 3); setParam ("voicing", 0); setParam ("strum", 18);
                setParam ("strumDir", 0); setParam ("bass", 0); setParam ("harmVel", 100); break;
        default: break;
    }
}

//==============================================================================
void ConchordProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    buffer.clear();

    const int numSamples = buffer.getNumSamples();
    const juce::int64 blockStart = samplePos;
    const juce::int64 blockEnd   = samplePos + numSamples;

    juce::MidiBuffer out;

    // 0) Preset-menyn: byte (till >0) pushar karaktärsvärden till övriga parametrar.
    int presetIdx = (int) raw ("preset");
    if (presetIdx != lastPresetIndex) { lastPresetIndex = presetIdx; if (presetIdx > 0) applyPreset (presetIdx); }

    // 1) Köade (framtida) events som nu infaller i blocket.
    for (auto it = pending.begin(); it != pending.end(); )
    {
        if (it->sampleTime < blockEnd)
        {
            juce::int64 when = std::max (it->sampleTime, blockStart);
            out.addEvent (it->msg, (int) (when - blockStart));
            it = pending.erase (it);
        }
        else ++it;
    }

    // 2) Noter inmatade från GUI-klaviaturen vävs in i indata.
    keyboardCollector.removeNextBlockOfMessages (midi, numSamples);

    // 3) Ändrade inställningar (GUI-rattar/automation/kryddmask/hjul) mellan block.
    applySettingsChange (false, blockStart, blockStart, blockEnd, out);

    // 4) Inkommande MIDI.
    for (const auto meta : midi)
    {
        const auto m = meta.getMessage();
        const juce::int64 evTime = blockStart + meta.samplePosition;

        if (m.isPitchWheel())
        {
            if ((int) raw ("pb") == 0) { out.addEvent (m, meta.samplePosition); continue; } // Off -> släpp igenom
            float rawv = (m.getPitchWheelValue() - 8192) / 8192.0f;
            if (raw ("pbLatch") > 0.5f)
            {
                if (std::abs (rawv) < 1.0e-4f) continue;       // fjädring till mitten: håll gesten
                float cur = pbValue.load();
                bool newGesture = (cur == 0.0f) || ((rawv > 0) != (cur > 0));
                if (! newGesture && std::abs (rawv) <= std::abs (cur)) continue;
                pbValue.store (rawv); pbTouched.store (true);
            }
            else { pbValue.store (rawv); pbTouched.store (true); }
            applySettingsChange (false, evTime, blockStart, blockEnd, out);
            continue;
        }

        if (m.isController() && m.getControllerNumber() == 1) // Mod Wheel
        {
            if ((int) raw ("mw") == 0) { out.addEvent (m, meta.samplePosition); continue; }
            mwValue.store (m.getControllerValue() / 127.0f);
            applySettingsChange (false, evTime, blockStart, blockEnd, out);
            continue;
        }

        if ((m.isNoteOn() || m.isNoteOff()) && isInZone (m.getNoteNumber()))
        {
            handleModZone (m, evTime, blockStart, blockEnd, out); // kryddtangent: ingen ton ut
            continue;
        }

        if (m.isNoteOff() || (m.isNoteOn() && m.getVelocity() == 0))
        {
            heldKeys.erase (m.getNoteNumber());
            releaseChord (m.getNoteNumber(), evTime, blockStart, blockEnd, out);
            if (heldKeys.empty()) applyResets (false); // On Keys Released
            refreshUi();
            continue;
        }

        if (m.isNoteOn())
        {
            heldKeys.insert (m.getNoteNumber());
            applyResets (true); // On New Chord
            startChord (m.getNoteNumber(), m.getVelocity(), evTime, blockStart, blockEnd, out);
            refreshUi();
            continue;
        }

        if (m.isAllNotesOff() || m.isAllSoundOff())
        {
            releaseAll (blockStart, blockEnd, out);
            out.addEvent (m, meta.samplePosition);
            continue;
        }

        out.addEvent (m, meta.samplePosition); // CC, sustain, aftertouch m.m. passerar
    }

    // 5) Standalone: gör de utgående ackorden hörbara via den inbyggda synten.
    //    I Logic (MIDI-FX) finns ingen ljudbuss -> buffer har 0 kanaler -> hoppas över.
    if (buffer.getNumChannels() > 0)
    {
        pianoSynth.renderNextBlock (buffer, out, 0, numSamples);

        // Gain-staging: sampeln ligger nära 0 dBFS, så ett ackord (flera röster)
        // summerar långt över ±1. Sänk först med rejäl headroom, mjukklipp sedan
        // som sista skydd (tanh) så täta ackord inte hårdklipper till brus.
        buffer.applyGain (0.30f);
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        {
            auto* d = buffer.getWritePointer (ch);
            for (int i = 0; i < numSamples; ++i)
                d[i] = std::tanh (d[i]);
        }
    }

    midi.swapWith (out); // skicka alltid ackord-MIDI vidare (Logic-instrument + ev. MIDI-ut)
    samplePos = blockEnd;
}

//==============================================================================
void ConchordProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void ConchordProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

//==============================================================================
juce::AudioProcessorEditor* ConchordProcessor::createEditor()
{
    return new ConchordEditor (*this);
}

//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ConchordProcessor();
}
