#pragma once

#include <JuceHeader.h>
#include <atomic>
#include <array>

//==============================================================================
// Conchord Note Monitor — a transparent MIDI FX that observes the notes
// passing through it and exposes a thread-safe snapshot for the editor to draw.
//
// MIDI arrives on the audio (realtime) thread; the GUI draws on the message
// thread. We never share complex objects across that boundary — just a flat
// array of atomics (one velocity per MIDI note) plus a couple of counters.
//==============================================================================
class NoteMonitorProcessor : public juce::AudioProcessor
{
public:
    NoteMonitorProcessor();
    ~NoteMonitorProcessor() override = default;

    //==========================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==========================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    //==========================================================================
    const juce::String getName() const override { return "ConchordNoteMonitor"; }
    bool acceptsMidi() const override  { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }

    //==========================================================================
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}

    //==========================================================================
    // --- shared snapshot, written on audio thread, read on GUI thread ---
    // velocity 0 means "not sounding"; 1..127 means held at that velocity.
    std::array<std::atomic<juce::uint8>, 128> noteVelocity {};
    std::atomic<int>  lastNote   { -1 };  // most recent NoteOn pitch
    std::atomic<int>  lastVel    { 0 };
    std::atomic<int>  lastChan   { 0 };
    std::atomic<int>  ccNumber   { -1 };  // most recent CC seen
    std::atomic<int>  ccValue    { 0 };
    std::atomic<juce::int64> eventCounter { 0 };

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NoteMonitorProcessor)
};
