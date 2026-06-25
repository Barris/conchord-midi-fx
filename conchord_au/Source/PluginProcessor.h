#pragma once

#include <JuceHeader.h>
#include "ChordEngine.h"
#include "PianoSynth.h"
#include <atomic>
#include <map>
#include <set>
#include <vector>

// ============================================================================
// ConchordAU — MIDI-FX som ersätter varje nedtryckt tangent med ett ackord
// byggt av ChordEngine. Speglar Scripter-motorn (conchord_09.js) inkl. det
// interaktiva lagret: kryddzon (Hold/Latch), pitch bend / mod wheel -> Chord
// Size / Inversion, voice leading och presets. Editorn (PluginEditor) ritar
// prototypens layout och läser en trådsäker snapshot av det byggda ackordet.
// ============================================================================
class ConchordProcessor : public juce::AudioProcessor
{
public:
    ConchordProcessor();
    ~ConchordProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void reset() override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "ConchordAU"; }
    bool acceptsMidi() const override  { return true; }
    bool producesMidi() const override { return true; }
    // I Logic/AU är detta en ren MIDI-FX. I Standalone måste vi däremot säga
    // nej här: AudioProcessorPlayer ger MIDI-FX:er en 0-kanals ljudbuffert
    // (findMostSuitableLayout -> {}), och då kan den inbyggda synten inte höras.
    // AU-typen 'aumi' sätts ändå vid kompilering (JucePlugin_IsMidiEffect).
    bool isMidiEffect() const override { return wrapperType != wrapperType_Standalone; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState apvts;

    // ---- delat med editorn -------------------------------------------------
    // Skrivs på audiotråden OCH (vid GUI-interaktion) på meddelandetråden.
    std::atomic<std::uint32_t> modMask { 0 };   // bit i = kryddtangent i aktiv
    std::atomic<float>         pbValue { 0.0f }; // -1..+1 (0 = vila)
    std::atomic<bool>          pbTouched { false };
    std::atomic<float>         mwValue { -1.0f };// <0 = orört hjul, annars 0..1

    // GUI-klaviaturen matar in noter här; processBlock plockar upp dem.
    juce::MidiMessageCollector keyboardCollector;

    // Snapshot av senast byggda ackordet, för chord viewer + tangent-highlight.
    struct UiState { int root = 60; std::vector<int> active; std::vector<int> full; };
    UiState getUiState() const { const juce::SpinLock::ScopedLockType l (uiLock); return uiState; }

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    static BusesProperties makeBuses(); // ljudbuss bara i Standalone

    // Inbyggd synt som gör ackorden hörbara i Standalone (tyst i Logic-MIDI-FX).
    juce::Synthesiser pianoSynth;

    // ---- parametrar -> motor ----------------------------------------------
    float raw (const char* id) const { return apvts.getRawParameterValue (id)->load(); }
    conchord::RawParams currentRaw() const;

    // ---- referensräknad notsändning ---------------------------------------
    void emitOn  (int pitch, int velocity, juce::int64 when,
                  juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);
    void emitOff (int pitch, juce::int64 when,
                  juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);
    void scheduleOrEmit (const juce::MidiMessage& m, juce::int64 when,
                         juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);

    // ---- ackord-livscykel --------------------------------------------------
    void startChord  (int inputPitch, int velocity, juce::int64 when,
                      juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);
    bool releaseChord (int inputPitch, juce::int64 when,
                       juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);
    void releaseAll  (juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);

    // Morfa alla hållna ackord mot nuvarande inställningar om de ändrats sedan
    // sist. suppressAdd = bara tysta borttagna toner (subtraktiv modifier-release).
    void applySettingsChange (bool suppressAdd, juce::int64 when,
                              juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);

    void handleModZone (const juce::MidiMessage& m, juce::int64 when,
                        juce::int64 blockStart, juce::int64 blockEnd, juce::MidiBuffer& out);
    void applyResets (bool newChord); // nollställ pb/mw enligt reset-läge

    void refreshUi();
    void applyPreset (int index);
    void setParam (const char* id, float value);

    double sampleRate = 44100.0;
    juce::int64 samplePos = 0;

    struct PendingEvent { juce::int64 sampleTime; juce::MidiMessage msg; };
    std::vector<PendingEvent> pending; // framtida (delayade) events

    struct Voice  { int pitch; int delaySamples; };
    struct Record { int velocity = 100; std::vector<Voice> voices; std::vector<int> vlAnchor; };
    std::map<int, Record> active;          // inputNote -> ljudande ackord
    std::array<int, 128> sounding {};      // referensräknare per pitch

    std::set<int> heldKeys;                // fysiskt nedtryckta spel-tangenter
    std::vector<int> voiceLeadAnchor;      // senast byggda ackordets toner

    conchord::RawParams lastApplied;       // för att upptäcka inställningsändringar
    bool haveLastApplied = false;
    int  lastPresetIndex = 0;

    int uiRoot = 60;                       // grundtonen chord viewern visar
    mutable juce::SpinLock uiLock;
    UiState uiState;

    bool isInZone (int pitch) const;       // ligger pitch i kryddzonen?

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ConchordProcessor)
};
