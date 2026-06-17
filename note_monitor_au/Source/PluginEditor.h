#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

//==============================================================================
// The visualizer window. A Timer polls the processor's atomic snapshot ~60x/s
// and repaints a piano-roll keyboard plus a text readout of held notes.
//==============================================================================
class NoteMonitorEditor : public juce::AudioProcessorEditor,
                          private juce::Timer
{
public:
    explicit NoteMonitorEditor (NoteMonitorProcessor&);
    ~NoteMonitorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override {}

private:
    void timerCallback() override;

    // Keyboard drawing
    void drawKeyboard (juce::Graphics&, juce::Rectangle<float> area);
    bool isBlackKey (int pitch) const;

    NoteMonitorProcessor& proc;

    static constexpr int lowNote  = 21;   // A0
    static constexpr int highNote = 108;  // C8

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NoteMonitorEditor)
};
