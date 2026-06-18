#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
NoteMonitorProcessor::NoteMonitorProcessor()
    : juce::AudioProcessor (BusesProperties()) // MIDI effect: no audio buses
{
    for (auto& v : noteVelocity)
        v.store (0);
}

void NoteMonitorProcessor::prepareToPlay (double, int) {}

//==============================================================================
void NoteMonitorProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                         juce::MidiBuffer& midi)
{
    // A MIDI effect gets no audio; make sure nothing leaks out.
    buffer.clear();

    for (const auto metadata : midi)
    {
        const auto m = metadata.getMessage();

        if (m.isNoteOn())
        {
            noteVelocity[(size_t) m.getNoteNumber()].store ((juce::uint8) m.getVelocity());
            lastNote.store (m.getNoteNumber());
            lastVel.store  (m.getVelocity());
            lastChan.store (m.getChannel());
            eventCounter.fetch_add (1);
        }
        else if (m.isNoteOff())
        {
            noteVelocity[(size_t) m.getNoteNumber()].store (0);
            eventCounter.fetch_add (1);
        }
        else if (m.isAllNotesOff() || m.isAllSoundOff())
        {
            for (auto& v : noteVelocity) v.store (0);
        }
        else if (m.isController())
        {
            ccNumber.store (m.getControllerNumber());
            ccValue.store  (m.getControllerValue());
            eventCounter.fetch_add (1);
        }
    }

    // Transparent: we leave `midi` untouched so everything passes straight on.
}

//==============================================================================
juce::AudioProcessorEditor* NoteMonitorProcessor::createEditor()
{
    return new NoteMonitorEditor (*this);
}

//==============================================================================
// This creates new instances of the plugin.
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new NoteMonitorProcessor();
}
