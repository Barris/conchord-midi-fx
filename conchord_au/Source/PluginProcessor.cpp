#include "PluginProcessor.h"

using APVTS = juce::AudioProcessorValueTreeState;

//==============================================================================
// Parameterlayout — speglar Scripter-parametrarna (de musikaliska + karaktär).
//==============================================================================
APVTS::ParameterLayout ConchordProcessor::createLayout()
{
    using namespace juce;
    APVTS::ParameterLayout layout;

    StringArray keys { "C","C#/Db","D","D#/Eb","E","F","F#/Gb","G","G#/Ab","A","A#/Bb","B" };
    StringArray scales { "Ionian","Dorian","Phrygian","Lydian","Mixolydian","Aeolian",
                         "Locrian","Harmonic Minor","Melodic Minor" };
    StringArray types { "Triad","6th","7th","9th","11th","13th","Sus2","Sus4","Dom 7","Dim" };
    StringArray voicings { "Close","Drop 2","Drop 3","Drop 2+4","Spread" };
    StringArray oos { "Mute","Pass Through","Snap to Scale" };
    StringArray strumDir { "Up","Down" };

    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "key", 1 }, "Key", keys, 0));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "scale", 1 }, "Scale", scales, 0));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "type", 1 }, "Chord Type", types, 0));
    layout.add (std::make_unique<AudioParameterInt>    (ParameterID { "size", 1 }, "Max Chord Size", 1, 12, 4));
    layout.add (std::make_unique<AudioParameterInt>    (ParameterID { "inversion", 1 }, "Inversion", -6, 6, 0));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "voicing", 1 }, "Voicing", voicings, 0));
    layout.add (std::make_unique<AudioParameterBool>   (ParameterID { "bass", 1 }, "Bass Note", false));
    layout.add (std::make_unique<AudioParameterInt>    (ParameterID { "bassVel", 1 }, "Bass Velocity %", 10, 150, 100));
    layout.add (std::make_unique<AudioParameterInt>    (ParameterID { "harmVel", 1 }, "Harmony Velocity %", 10, 150, 100));
    layout.add (std::make_unique<AudioParameterInt>    (ParameterID { "strum", 1 }, "Strum (ms)", 0, 200, 0));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "strumDir", 1 }, "Strum Direction", strumDir, 0));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { "oos", 1 }, "Out-of-Scale Keys", oos, 2));

    return layout;
}

//==============================================================================
ConchordProcessor::ConchordProcessor()
    : juce::AudioProcessor (BusesProperties()), // MIDI effect: no audio buses
      apvts (*this, nullptr, "PARAMS", createLayout())
{
}

void ConchordProcessor::prepareToPlay (double sr, int)
{
    sampleRate = sr;
    samplePos = 0;
    pending.clear();
    active.clear();
}

//==============================================================================
conchord::Settings ConchordProcessor::currentSettings() const
{
    using namespace conchord;
    Settings s;
    s.key          = (int) apvts.getRawParameterValue ("key")->load();
    s.scale        = (Scale) (int) apvts.getRawParameterValue ("scale")->load();
    s.type         = (ChordType) (int) apvts.getRawParameterValue ("type")->load();
    s.maxChordSize = (int) apvts.getRawParameterValue ("size")->load();
    s.inversion    = (int) apvts.getRawParameterValue ("inversion")->load();
    s.voicing      = (Voicing) (int) apvts.getRawParameterValue ("voicing")->load();
    s.bass         = apvts.getRawParameterValue ("bass")->load() > 0.5f;
    s.bassVel      = apvts.getRawParameterValue ("bassVel")->load() / 100.0;
    s.harmonyVel   = apvts.getRawParameterValue ("harmVel")->load() / 100.0;
    s.outOfScale   = (OutOfScale) (int) apvts.getRawParameterValue ("oos")->load();
    return s;
}

//==============================================================================
// Lägg event i utbufferten om det infaller i detta block, annars köa det.
void ConchordProcessor::scheduleOrEmit (const juce::MidiMessage& m, juce::int64 when,
                                        juce::int64 blockStart, juce::int64 blockEnd,
                                        juce::MidiBuffer& out)
{
    if (when < blockStart) when = blockStart; // aldrig bakåt i tiden
    if (when < blockEnd)
        out.addEvent (m, (int) (when - blockStart));
    else
        pending.push_back ({ when, m });
}

void ConchordProcessor::releaseAll (juce::int64 blockStart, juce::int64 blockEnd,
                                    juce::MidiBuffer& out)
{
    for (auto& [inputNote, voices] : active)
        for (auto& v : voices)
            scheduleOrEmit (juce::MidiMessage::noteOff (1, v.pitch),
                            blockStart, blockStart, blockEnd, out);
    active.clear();
}

//==============================================================================
void ConchordProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                      juce::MidiBuffer& midi)
{
    buffer.clear(); // MIDI effect: inget ljud passerar

    const int numSamples = buffer.getNumSamples();
    const juce::int64 blockStart = samplePos;
    const juce::int64 blockEnd   = samplePos + numSamples;

    juce::MidiBuffer out;
    const auto s = currentSettings();
    const int strumMs  = (int) apvts.getRawParameterValue ("strum")->load();
    const bool strumUp = apvts.getRawParameterValue ("strumDir")->load() < 0.5f;

    // 1) Köade (framtida) events som nu infaller i detta block.
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

    // 2) Inkommande MIDI.
    for (const auto metadata : midi)
    {
        const auto m = metadata.getMessage();
        const juce::int64 evTime = blockStart + metadata.samplePosition;

        if (m.isNoteOn())
        {
            const int inputNote = m.getNoteNumber();
            const int playedVel = m.getVelocity();

            // Skydd mot dubbel note-on utan note-off: släpp ev. gammalt ackord.
            if (auto found = active.find (inputNote); found != active.end())
            {
                for (auto& v : found->second)
                    scheduleOrEmit (juce::MidiMessage::noteOff (1, v.pitch),
                                    evTime, blockStart, blockEnd, out);
                active.erase (found);
            }

            auto built = conchord::buildChord (inputNote, s);
            if (built.empty()) continue; // out-of-scale + Mute

            // strum-ordning: Up = nedifrån och upp, Down = uppifrån och ned (js:418)
            if (! strumUp) std::reverse (built.begin(), built.end());

            std::vector<Voice> voices;
            for (int i = 0; i < (int) built.size(); ++i)
            {
                int delaySamples = (strumMs > 0)
                    ? (int) std::llround (i * strumMs / 1000.0 * sampleRate) : 0;

                int vel = juce::jlimit (1, 127,
                    (int) std::lround (playedVel * built[(size_t) i].velocityScale));

                scheduleOrEmit (juce::MidiMessage::noteOn (1, built[(size_t) i].pitch, (juce::uint8) vel),
                                evTime + delaySamples, blockStart, blockEnd, out);
                voices.push_back ({ built[(size_t) i].pitch, delaySamples });
            }
            active[inputNote] = std::move (voices);
        }
        else if (m.isNoteOff())
        {
            const int inputNote = m.getNoteNumber();
            if (auto found = active.find (inputNote); found != active.end())
            {
                // spegla strum-delayen så en delayad note-on alltid släpps efteråt (js:438)
                for (auto& v : found->second)
                    scheduleOrEmit (juce::MidiMessage::noteOff (1, v.pitch),
                                    evTime + v.delaySamples, blockStart, blockEnd, out);
                active.erase (found);
            }
        }
        else if (m.isAllNotesOff() || m.isAllSoundOff())
        {
            releaseAll (blockStart, blockEnd, out);
            out.addEvent (m, metadata.samplePosition);
        }
        else
        {
            out.addEvent (m, metadata.samplePosition); // CC, pitch bend m.m. passerar
        }
    }

    midi.swapWith (out);
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
    // Generisk editor: JUCE ritar en kontroll per parameter automatiskt.
    return new juce::GenericAudioProcessorEditor (*this);
}

//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ConchordProcessor();
}
