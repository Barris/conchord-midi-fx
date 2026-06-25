#pragma once

#include <JuceHeader.h>
#include "BinaryData.h"

// ============================================================================
// PianoSynth — gör pluginet hörbart i Standalone-läge (tyst MIDI-FX i Logic).
//
// juce::Sampler med RIKTIGA pianosampel (C1..C6, inbäddade via BinaryData).
// Varje sampel täcker ±6 halvtoner runt sin oktav, så resampling (och därmed
// "fart"-artefakterna när toner ligger långt från grundtonen) hålls minimal.
// SamplerVoice frigör rösten när samplet tar slut -> inga fastnade toner.
// ============================================================================
namespace conchord
{

// Läs in ett inbäddat WAV och lägg det som SamplerSound över [lo, hi] med
// rootNote = rootMidi (sampelns verkliga tonhöjd).
inline void addSampledNote (juce::Synthesiser& synth,
                            const void* data, int dataSize,
                            int rootMidi, int lo, int hi)
{
    juce::WavAudioFormat wav;
    std::unique_ptr<juce::AudioFormatReader> reader (
        wav.createReaderFor (new juce::MemoryInputStream (data, (size_t) dataSize, false), true));
    if (reader == nullptr)
        return;

    juce::BigInteger range;
    range.setRange (lo, hi - lo + 1, true);

    synth.addSound (new juce::SamplerSound ("piano", *reader, range,
                                            rootMidi,
                                            0.001, // attack
                                            0.10,  // release vid note-off
                                            20.0));// max sampellängd (sek)
}

// Bygg om samplern vid given samplerate. Anropas från prepareToPlay.
inline void configurePianoSynth (juce::Synthesiser& synth, double sampleRate)
{
    synth.clearVoices();
    synth.clearSounds();
    synth.setCurrentPlaybackSampleRate (sampleRate);

    using namespace BinaryData;
    // root  lo  hi  — uppdelat vid mittpunkten mellan intilliggande C:n.
    addSampledNote (synth, UR1_C1_f_RR1_wav, UR1_C1_f_RR1_wavSize, 24,  0,  30);
    addSampledNote (synth, UR1_C2_f_RR1_wav, UR1_C2_f_RR1_wavSize, 36, 31,  42);
    addSampledNote (synth, UR1_C3_f_RR1_wav, UR1_C3_f_RR1_wavSize, 48, 43,  54);
    addSampledNote (synth, UR1_C4_f_RR1_wav, UR1_C4_f_RR1_wavSize, 60, 55,  66);
    addSampledNote (synth, UR1_C5_f_RR1_wav, UR1_C5_f_RR1_wavSize, 72, 67,  78);
    addSampledNote (synth, UR1_C6_f_RR1_wav, UR1_C6_f_RR1_wavSize, 84, 79, 127);

    for (int i = 0; i < 32; ++i)
        synth.addVoice (new juce::SamplerVoice());
}

} // namespace conchord
