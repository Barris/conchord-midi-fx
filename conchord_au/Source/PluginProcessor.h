#pragma once

#include <JuceHeader.h>
#include "ChordEngine.h"
#include <map>

// ============================================================================
// ConchordAU — MIDI-FX som ersätter varje nedtryckt tangent med ett ackord
// byggt av ChordEngine. Parametrarna speglar Scripter-versionen och visas via
// JUCEs generiska editor (ingen egen GUI i denna prototyp).
// ============================================================================
class ConchordProcessor : public juce::AudioProcessor
{
public:
    ConchordProcessor();
    ~ConchordProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "ConchordAU"; }
    bool acceptsMidi() const override  { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState apvts;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    // Läs aktuella parametervärden till en ChordEngine::Settings.
    conchord::Settings currentSettings() const;

    double sampleRate = 44100.0;

    // Global sample-klocka så strum-delay och speglade note-offs kan ligga
    // bortom den aktuella bufferten och plockas upp i kommande block.
    juce::int64 samplePos = 0;

    struct PendingEvent { juce::int64 sampleTime; juce::MidiMessage msg; };
    std::vector<PendingEvent> pending; // ej än utskickade (framtida) MIDI-events

    // Aktiva ackord per nedtryckt tangent, så rätt toner släpps vid note-off.
    // delaySamples = strum-offset tonen triggades med (speglas på note-off).
    struct Voice { int pitch; int delaySamples; };
    std::map<int, std::vector<Voice>> active; // inputNote -> ljudande toner

    void scheduleOrEmit (const juce::MidiMessage& m, juce::int64 when,
                         juce::int64 blockStart, juce::int64 blockEnd,
                         juce::MidiBuffer& out);
    void releaseAll (juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ConchordProcessor)
};
