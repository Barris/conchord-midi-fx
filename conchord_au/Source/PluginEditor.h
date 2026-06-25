#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"
#include <set>
#include <map>

// ============================================================================
// ConchordEditor — native JUCE-port av HTML-prototypens interface
// (conchord_au/prototype/index.html). Dark-studio-stil, play-yta fram med
// flip-to-setup för routing/modifier-map. En Timer pollar processorns UiState
// och ritar chord viewer + tangent-highlight live.
// ============================================================================

// ---- Sliding pill-toggle (bunden till en bool-parameter) -------------------
class PillToggle : public juce::Button
{
public:
    PillToggle() : juce::Button ({}) { setClickingTogglesState (true); }
    void paintButton (juce::Graphics&, bool, bool) override;
};

// ---- Mode-flik (CHORD/HARP live, 2-FINGER/JAZZ stub) -----------------------
class TabButton : public juce::Button
{
public:
    TabButton (const juce::String& t, bool isStub) : juce::Button (t), stub (isStub) {}
    void paintButton (juce::Graphics&, bool, bool) override;
    bool selected = false;
    bool stub = false;
};

// ---- PB/MW-hjul ------------------------------------------------------------
class WheelControl : public juce::Component
{
public:
    WheelControl (ConchordProcessor& p, int kindIn, juce::String nameIn)
        : proc (p), kind (kindIn), wname (std::move (nameIn)) {}
    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseDoubleClick (const juce::MouseEvent&) override;
    juce::String sub; // undertext (sätts av editorn varje tick)
private:
    void apply (float y);
    ConchordProcessor& proc;
    int kind; // 0 = pitch bend (bipolärt, dubbelklick nollar), 1 = mod wheel (unipolärt)
    juce::String wname;
};

// ---- Chord viewer-yta ------------------------------------------------------
class ChordViewer : public juce::Component
{
public:
    void paint (juce::Graphics&) override;
    juce::String name = "—", desc;
    std::vector<juce::String> chips;
    std::vector<std::pair<float, bool>> bars; // (höjd 0..1, ghost?)
};

// ---- Klaviatur med kryddzon, highlight och dragbart zonhandtag -------------
class KeyboardComponent : public juce::Component
{
public:
    explicit KeyboardComponent (ConchordProcessor& p) : proc (p) {}
    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;

    std::set<int> lit, ghost; // sätts av editorn varje tick
    int root = -1;

    static constexpr int LO = 48, HI = 96; // C2..C6

private:
    void rebuildGeometry();
    int keyAt (juce::Point<float>) const;
    bool isWhite (int m) const;
    juce::Rectangle<float> zoneHandleRect() const;

    ConchordProcessor& proc;
    std::vector<std::pair<int, juce::Rectangle<float>>> whiteRects, blackRects;
    float wk = 24.0f, kh = 150.0f;
    int playing = -1;       // ton vi spelar via mus
    bool draggingZone = false;
};

// ============================================================================
class ConchordEditor : public juce::AudioProcessorEditor,
                       private juce::Timer
{
public:
    explicit ConchordEditor (ConchordProcessor&);
    ~ConchordEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    // ---- Musical Typing: spela med datorns tangentbord (som i Logic) --------
    // Nedtryck fångas i keyPressed (tecknet är layout-korrekt); SLÄPP upptäcks
    // genom att polla den fångade KeyPress:en i timern. Det gör hanteringen
    // oberoende av tangentlayout (svenska ö/ä) OCH av fokus (inga fastnade toner
    // när man klickar på en ratt).
    bool keyPressed (const juce::KeyPress&) override;

private:
    void timerCallback() override;
    void releaseAllTyped();          // tysta alla datorklaviatur-noter
    void shiftTypingOctave (int delta);
    void sendTypedNote (int note, bool on);
    void setMode (int mode);      // 0 CHORD, 1 HARP, 2 2-FINGER (stub), 3 JAZZ (stub)
    void showSetup (bool);

    using SA = juce::AudioProcessorValueTreeState::SliderAttachment;
    using CA = juce::AudioProcessorValueTreeState::ComboBoxAttachment;
    using BA = juce::AudioProcessorValueTreeState::ButtonAttachment;

    ConchordProcessor& proc;
    juce::LookAndFeel_V4 lnf;

    // text-etiketter (för layout-synk paint<->resized)
    juce::Label lPreset, lSize, lInv, lDyn, lType, lVoicing, lOos, lBass, lModHint, lZone;
    juce::Label lRouting, lPb, lMw, lModK, lMapTitle;

    // header
    juce::ComboBox presetBox;
    std::unique_ptr<CA> presetAtt;

    // tabs
    TabButton chordTab { "CHORD", false }, harpTab { "HARP", false },
              twoTab { "2-FINGER", true }, jazzTab { "JAZZ", true };
    int mode = 0;

    // viewer + key/scale
    ChordViewer viewer;
    juce::ComboBox keyBox, scaleBox;
    std::unique_ptr<CA> keyAtt, scaleAtt;

    // control card
    juce::Slider sizeS, invS, strumS, humanizeS;
    std::unique_ptr<SA> sizeAtt, invAtt, strumAtt;
    juce::ComboBox typeBox, voicingBox, oosBox;
    std::unique_ptr<CA> typeAtt, voicingAtt, oosAtt;
    PillToggle bassTog;
    std::unique_ptr<BA> bassAtt;

    // keyboard row
    PillToggle modKeysTog;
    std::unique_ptr<BA> modKeysAtt;
    juce::TextButton toSetupBtn { "setup >" };
    WheelControl pbWheel { proc, 0, "PITCH" }, mwWheel { proc, 1, "MOD" };
    KeyboardComponent keyboard { proc };

    // setup view
    juce::TextButton toPlayBtn { "<- FLIP TO PLAY" };
    juce::ComboBox pbTargetBox, pbResetBox, mwTargetBox, mwResetBox, modModeBox, borrowBox;
    std::unique_ptr<CA> pbTargetAtt, pbResetAtt, mwTargetAtt, mwResetAtt, modModeAtt, borrowAtt;
    PillToggle pbLatchTog, modKeysTog2;
    std::unique_ptr<BA> pbLatchAtt, modKeysAtt2;

    bool setupVisible = false;

    // Musical Typing-tillstånd. 'a' = typingBase (C4 som standard); raden
    // "awsedftgyhujkolp;" ger en oktav+ uppåt, z/x byter oktav.
    // En nedtryckt Musical Typing-tangent: KeyPress (för släpp-polling), vilken
    // not den spelar, och vilken sorts tangent det är.
    enum class TKind { Play, Mod };
    struct HeldKey { juce::KeyPress kp; int note; TKind kind; };
    std::vector<HeldKey> heldKeys;
    std::vector<juce::KeyPress> heldOctave; // z/x – hålls men spelar ingen not
    int  typingBase = 60;            // MIDI-not för 'a'
    bool grabbedInitialFocus = false;

    // kort-bakgrunder (sätts i resized(), ritas i paint())
    juce::Rectangle<int> rCtlCard, rDivider, rPbCard, rMwCard, rModCard, rMapCard;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ConchordEditor)
};
