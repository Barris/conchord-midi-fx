#include "PluginEditor.h"
#include <cmath>

// ============================================================================
// Färger från prototypens CSS (conchord_au/prototype/index.html).
// ============================================================================
namespace col
{
    const juce::Colour panel   (0xff0c1110);
    const juce::Colour panel2  (0xff121a18);
    const juce::Colour panel3  (0xff0f1715);
    const juce::Colour teal    (0xff5fe3b3);
    const juce::Colour teal2   (0xff3fbf95);
    const juce::Colour tealdim (0xff1d3a31);
    const juce::Colour text    (0xffe9f1ec);
    const juce::Colour muted   (0xff8ba398);
    const juce::Colour faint   (0xff5e7068);
    const juce::Colour amber   (0xffe3b15f);
    const juce::Colour white    (0xffe9ebe7);
    inline juce::Colour line()  { return juce::Colours::white.withAlpha (0.08f); }
    inline juce::Colour line2() { return juce::Colours::white.withAlpha (0.14f); }
}

static juce::Font mono (float h, bool bold = false)
{
    return juce::Font (juce::Font::getDefaultMonospacedFontName(), h, bold ? juce::Font::bold : 0);
}

static const char* CHROM_SHORT[12] = { "C","C#","D","D#","E","F","F#","G","G#","A","A#","B" };
static juce::String noteShort (int p) { return CHROM_SHORT[((p % 12) + 12) % 12]; }
static int octOf (int m) { return m / 12 - 2; }
static const char* MOD_SHORT[9] = { "SUS2","DIM","SUS4","6TH","7TH","DOM7","ADD9","PARA","VLD" };
static const char* MOD_NAME[9]  = { "Sus 2","Dim","Sus 4","6th","7th","Dom 7","Add 9","Parallel","Voice Lead" };

// ---- Ackordnamn: preliminär detektor (port av engine.js detectChordName) ---
static std::pair<juce::String, juce::String> detectChordName (int rootMidi, const std::vector<int>& notes)
{
    if (notes.empty()) return { "—", "" };
    std::set<int> set;
    for (int p : notes) set.insert ((((p - rootMidi) % 12) + 12) % 12);
    auto h = [&] (int i) { return set.count (i) > 0; };

    juce::String root = noteShort (rootMidi), tri, triDesc;
    if      (h (4) && h (8)) { tri = "aug"; triDesc = "Augmented"; }
    else if (h (3) && h (6)) { tri = "dim"; triDesc = "Diminished"; }
    else if (h (4))          { tri = "";    triDesc = "Major"; }
    else if (h (3))          { tri = "m";   triDesc = "Minor"; }
    else if (h (2))          { tri = "sus2";triDesc = "Sus2"; }
    else if (h (5))          { tri = "sus4";triDesc = "Sus4"; }
    else                     { tri = "5";   triDesc = "Power"; }

    juce::String ext;
    if      (tri == "dim" && h (9)) ext = "7";
    else if (h (11))                ext = "maj7";
    else if (h (10))                ext = "7";
    else if (h (9) && tri != "dim") ext = "6";

    std::vector<juce::String> tens;
    if (ext.isNotEmpty() && ext != "6" && h (2)) tens.push_back ("9");
    if (ext.isNotEmpty() && ext != "6" && h (5) && tri != "sus4") tens.push_back ("11");

    juce::String name = root + tri;
    if      (ext == "maj7") name += tens.size() ? "maj" + tens.back() : "maj7";
    else if (ext == "7")    name += tens.size() ? tens.back() : "7";
    else if (ext == "6")    name += "6";
    if (tens.size() && (ext == "7" || ext == "maj7"))
        for (size_t i = 0; i + 1 < tens.size(); ++i) name += "add" + tens[i];

    juce::String desc;
    if      (ext == "maj7") desc = tri.isEmpty() ? "MAJ7" : triDesc.toUpperCase() + " MAJ7";
    else if (ext == "7")    desc = tri.isEmpty() ? "DOMINANT 7" : triDesc.toUpperCase() + " 7";
    else if (ext == "6")    desc = triDesc.toUpperCase() + " 6";
    else                    desc = triDesc.toUpperCase();
    if (tens.size())
    {
        juce::String j;
        for (size_t i = 0; i < tens.size(); ++i) { if (i) j += "/"; j += tens[i]; }
        desc += " +" + j;
    }
    return { name, desc };
}

// ============================================================================
// PillToggle
// ============================================================================
void PillToggle::paintButton (juce::Graphics& g, bool, bool)
{
    auto r = getLocalBounds().toFloat();
    float h = juce::jmin (26.0f, r.getHeight());
    float w = juce::jmin (46.0f, r.getWidth());
    juce::Rectangle<float> track (r.getX(), r.getCentreY() - h / 2, w, h);
    bool on = getToggleState();
    g.setColour (on ? col::teal : juce::Colour (0xff24332e));
    g.fillRoundedRectangle (track, h / 2);
    if (! on) { g.setColour (col::line2()); g.drawRoundedRectangle (track, h / 2, 1.0f); }
    float kn = h - 4;
    float kx = on ? track.getRight() - kn - 2 : track.getX() + 2;
    g.setColour (on ? juce::Colour (0xff06241b) : juce::Colour (0xff7c8e87));
    g.fillEllipse (kx, track.getY() + 2, kn, kn);
}

// ============================================================================
// TabButton
// ============================================================================
void TabButton::paintButton (juce::Graphics& g, bool, bool)
{
    auto r = getLocalBounds().toFloat();
    if (selected)
    {
        g.setColour (col::teal); g.fillRoundedRectangle (r, 12);
        g.setColour (juce::Colour (0xff06241b));
    }
    else
    {
        g.setColour (col::panel2); g.fillRoundedRectangle (r, 12);
        g.setColour (col::line()); g.drawRoundedRectangle (r, 12, 1);
        g.setColour (stub ? col::faint : col::muted);
    }
    g.setFont (juce::Font (14.0f, juce::Font::bold));
    g.drawText (getButtonText(), r, juce::Justification::centred);
    if (stub)
    {
        g.setColour (col::amber);
        g.setFont (mono (8.5f));
        g.drawText ("snart", r.reduced (6, 4).removeFromTop (12), juce::Justification::topRight);
    }
}

// ============================================================================
// WheelControl
// ============================================================================
static juce::Rectangle<int> wheelTrack (juce::Rectangle<int> full)
{
    full.removeFromTop (14);
    full.removeFromBottom (28);
    return full.reduced (6, 2);
}

void WheelControl::paint (juce::Graphics& g)
{
    auto full = getLocalBounds();
    g.setColour (col::muted); g.setFont (mono (10.0f));
    g.drawText (wname, full.removeFromTop (14), juce::Justification::centred);
    auto subArea = full.removeFromBottom (28);
    g.setColour (col::teal); g.setFont (mono (9.0f));
    g.drawFittedText (sub, subArea, juce::Justification::centredTop, 2);

    auto track = full.reduced (6, 2).toFloat();
    g.setColour (juce::Colour (0xff0a1410)); g.fillRoundedRectangle (track, 8);
    g.setColour (col::line2()); g.drawRoundedRectangle (track, 8, 1);

    float n; bool untouched;
    if (kind == 0)
    {
        bool t = proc.pbTouched.load(); float pb = proc.pbValue.load();
        untouched = ! t; n = t ? (pb + 1.0f) / 2.0f : 0.5f;
        g.setColour (col::line2());
        float cy = track.getCentreY();
        g.drawLine (track.getX() + 3, cy, track.getRight() - 3, cy);
    }
    else { float mw = proc.mwValue.load(); untouched = mw < 0; n = mw < 0 ? 0.0f : mw; }

    float th = 16.0f;
    float ty = track.getY() + (1.0f - n) * (track.getHeight() - th);
    juce::Rectangle<float> thumb (track.getX() + 3, ty, track.getWidth() - 6, th);
    g.setColour (untouched ? juce::Colour (0xff3a5e53) : col::teal);
    g.fillRoundedRectangle (thumb, 5);
}

void WheelControl::apply (float y)
{
    auto track = wheelTrack (getLocalBounds()).toFloat();
    float n = juce::jlimit (0.0f, 1.0f, 1.0f - (y - track.getY()) / track.getHeight());
    if (kind == 0)
    {
        float pb = (std::abs (n - 0.5f) < 0.04f) ? 0.0f : (n * 2.0f - 1.0f);
        proc.pbValue.store (pb); proc.pbTouched.store (true);
    }
    else proc.mwValue.store (n);
    repaint();
}

void WheelControl::mouseDown (const juce::MouseEvent& e) { apply (e.position.y); }
void WheelControl::mouseDrag (const juce::MouseEvent& e) { apply (e.position.y); }
void WheelControl::mouseDoubleClick (const juce::MouseEvent&)
{
    if (kind == 0) { proc.pbValue.store (0.0f); proc.pbTouched.store (false); repaint(); }
}

// ============================================================================
// ChordViewer
// ============================================================================
void ChordViewer::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat();
    g.setColour (col::panel3); g.fillRoundedRectangle (r, 14);
    g.setColour (col::line()); g.drawRoundedRectangle (r, 14, 1);

    auto inner = getLocalBounds().reduced (18);
    g.setColour (col::muted); g.setFont (mono (11.0f));
    g.drawText ("CHORD VIEWER", inner.removeFromTop (16), juce::Justification::topLeft);

    auto nameArea = inner.removeFromTop (78);
    g.setColour (col::text); g.setFont (juce::Font (62.0f, juce::Font::bold));
    g.drawText (name, nameArea, juce::Justification::centredLeft);

    auto chipRow = inner.removeFromTop (32);
    int x = chipRow.getX();
    g.setFont (mono (14.0f, true));
    for (auto& c : chips)
    {
        int w = (int) g.getCurrentFont().getStringWidth (c) + 22;
        juce::Rectangle<int> chip (x, chipRow.getY(), w, 28);
        g.setColour (col::tealdim); g.fillRoundedRectangle (chip.toFloat(), 8);
        g.setColour (juce::Colour (0xff2a5447)); g.drawRoundedRectangle (chip.toFloat(), 8, 1);
        g.setColour (col::teal); g.drawText (c, chip, juce::Justification::centred);
        x += w + 8;
        if (x > chipRow.getRight() - 30) break;
    }

    g.setColour (col::muted); g.setFont (mono (11.0f));
    g.drawText (desc, inner.removeFromTop (18), juce::Justification::topLeft);

    auto barArea = inner.removeFromBottom (54);
    int bx = barArea.getX();
    for (auto& b : bars)
    {
        int hgt = juce::jmax (8, (int) std::round (b.first * 54.0f));
        juce::Rectangle<float> bar ((float) bx, (float) (barArea.getBottom() - hgt), 10.0f, (float) hgt);
        g.setColour (col::teal2.withAlpha (b.second ? 0.22f : 0.85f));
        g.fillRoundedRectangle (bar, 2);
        bx += 15;
        if (bx > barArea.getRight() - 12) break;
    }
}

// ============================================================================
// KeyboardComponent
// ============================================================================
bool KeyboardComponent::isWhite (int m) const
{
    int pc = ((m % 12) + 12) % 12;
    return pc == 0 || pc == 2 || pc == 4 || pc == 5 || pc == 7 || pc == 9 || pc == 11;
}

void KeyboardComponent::resized() { rebuildGeometry(); }

void KeyboardComponent::rebuildGeometry()
{
    whiteRects.clear(); blackRects.clear();
    int numWhite = 0;
    for (int m = LO; m <= HI; ++m) if (isWhite (m)) ++numWhite;
    if (numWhite == 0) return;

    wk = (float) getWidth() / (float) numWhite;
    kh = (float) getHeight();
    float bw = wk * 0.62f, bh = kh * 0.62f;

    int wi = 0;
    for (int m = LO; m <= HI; ++m)
    {
        if (isWhite (m)) { whiteRects.push_back ({ m, { wi * wk, 0.0f, wk, kh } }); ++wi; }
        else             { blackRects.push_back ({ m, { wi * wk - bw / 2.0f, 0.0f, bw, bh } }); }
    }
}

juce::Rectangle<float> KeyboardComponent::zoneHandleRect() const
{
    int low = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();
    auto rectOf = [&] (int m) -> juce::Rectangle<float> {
        for (auto& [mm, rc] : whiteRects) if (mm == m) return rc;
        for (auto& [mm, rc] : blackRects) if (mm == m) return rc;
        return {};
    };
    auto a = rectOf (low), b = rectOf (low + conchord::kNumModifiers - 1);
    if (a.isEmpty()) return {};
    float right = b.isEmpty() ? a.getRight() : b.getRight();
    return { a.getX(), 0.0f, right - a.getX(), 18.0f };
}

void KeyboardComponent::paint (juce::Graphics& g)
{
    int low = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();
    bool modKeys = proc.apvts.getRawParameterValue ("modKeys")->load() > 0.5f;
    std::uint32_t mask = proc.modMask.load();
    auto inZone = [&] (int m) { return modKeys && m >= low && m < low + conchord::kNumModifiers; };

    auto drawKey = [&] (int m, juce::Rectangle<float> rc, bool black)
    {
        bool z = inZone (m);
        juce::Colour base = black ? (z ? juce::Colour (0xff16493b) : juce::Colour (0xff1a1a1a))
                                   : (z ? juce::Colour (0xff0f2a22) : col::white);
        g.setColour (base); g.fillRoundedRectangle (rc, 3);
        if (m == root)              { g.setColour (col::amber);                g.fillRoundedRectangle (rc, 3); }
        else if (lit.count (m))     { g.setColour (col::teal);                 g.fillRoundedRectangle (rc, 3); }
        else if (ghost.count (m))   { g.setColour (juce::Colours::grey.withAlpha (0.35f)); g.fillRoundedRectangle (rc, 3); }

        if (z && (mask & (1u << (m - low))))
        { g.setColour (col::amber); g.drawRoundedRectangle (rc.reduced (1.0f), 3, 2.0f); }
        else
        { g.setColour (black ? juce::Colours::black : juce::Colour (0xff2a2a2a)); g.drawRoundedRectangle (rc, 3, 0.7f); }

        // etiketter
        if (z)
        {
            g.setColour (col::teal); g.setFont (mono (8.5f, true));
            auto lblArea = black ? rc.withY (rc.getBottom() + 2).withHeight (12).expanded (8.0f, 0.0f)
                                 : rc.removeFromBottom (14);
            g.drawText (MOD_SHORT[m - low], lblArea.toNearestInt(), juce::Justification::centred);
        }
        else if (! black && (m % 12) == 0)
        {
            g.setColour (juce::Colour (0xff3a4a44)); g.setFont (mono (8.5f));
            g.drawText ("C" + juce::String (octOf (m)), rc.removeFromBottom (12).toNearestInt(), juce::Justification::centred);
        }
    };

    for (auto& [m, rc] : whiteRects) drawKey (m, rc, false);
    for (auto& [m, rc] : blackRects) drawKey (m, rc, true);

    if (modKeys)
    {
        auto hr = zoneHandleRect();
        if (! hr.isEmpty())
        {
            g.setColour (col::teal.withAlpha (0.92f)); g.fillRoundedRectangle (hr, 5);
            g.setColour (juce::Colour (0xff06241b)); g.setFont (mono (8.5f, true));
            g.drawText ("<-> MOD ZONE", hr, juce::Justification::centred);
        }
    }
}

int KeyboardComponent::keyAt (juce::Point<float> p) const
{
    for (auto& [m, rc] : blackRects) if (rc.contains (p)) return m; // svarta ligger överst
    for (auto& [m, rc] : whiteRects) if (rc.contains (p)) return m;
    return -1;
}

void KeyboardComponent::mouseDown (const juce::MouseEvent& e)
{
    bool modKeys = proc.apvts.getRawParameterValue ("modKeys")->load() > 0.5f;
    int low = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();

    if (modKeys && zoneHandleRect().contains (e.position)) { draggingZone = true; return; }

    int m = keyAt (e.position);
    if (m < 0) return;

    if (modKeys && m >= low && m < low + conchord::kNumModifiers)
    {
        proc.modMask.fetch_xor (1u << (m - low)); // klick togglar krydda
        repaint();
    }
    else
    {
        playing = m;
        auto on = juce::MidiMessage::noteOn (1, m, (juce::uint8) 100);
        on.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
        proc.keyboardCollector.addMessageToQueue (on);
    }
}

void KeyboardComponent::mouseDrag (const juce::MouseEvent& e)
{
    if (! draggingZone) return;
    int best = -1; float bestd = 1.0e9f;
    for (auto& [m, rc] : whiteRects) { float d = std::abs (rc.getCentreX() - e.position.x); if (d < bestd) { bestd = d; best = m; } }
    if (best < 0) return;
    int low = juce::jlimit (48, 88, best);
    if (low + conchord::kNumModifiers - 1 > HI) low = HI - (conchord::kNumModifiers - 1);
    if (auto* p = proc.apvts.getParameter ("modZoneLow")) p->setValueNotifyingHost (p->convertTo0to1 ((float) low));
    repaint();
}

void KeyboardComponent::mouseUp (const juce::MouseEvent&)
{
    draggingZone = false;
    if (playing >= 0)
    {
        auto off = juce::MidiMessage::noteOff (1, playing);
        off.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
        proc.keyboardCollector.addMessageToQueue (off);
        playing = -1;
    }
}

// ============================================================================
// ConchordEditor
// ============================================================================
static juce::String choiceName (juce::AudioProcessorValueTreeState& apvts, const char* id)
{
    if (auto* c = dynamic_cast<juce::AudioParameterChoice*> (apvts.getParameter (id)))
        return c->getCurrentChoiceName();
    return {};
}

ConchordEditor::ConchordEditor (ConchordProcessor& p)
    : juce::AudioProcessorEditor (p), proc (p)
{
    setLookAndFeel (&lnf);
    lnf.setColour (juce::PopupMenu::backgroundColourId, col::panel2);
    lnf.setColour (juce::PopupMenu::textColourId, col::text);
    lnf.setColour (juce::PopupMenu::highlightedBackgroundColourId, col::tealdim);
    lnf.setColour (juce::PopupMenu::highlightedTextColourId, col::teal);
    lnf.setColour (juce::ComboBox::backgroundColourId, col::panel2);
    lnf.setColour (juce::ComboBox::textColourId, col::text);
    lnf.setColour (juce::ComboBox::outlineColourId, col::line2());
    lnf.setColour (juce::ComboBox::arrowColourId, col::muted);
    lnf.setColour (juce::Slider::backgroundColourId, juce::Colour (0xff24332e));
    lnf.setColour (juce::Slider::trackColourId, col::teal2);
    lnf.setColour (juce::Slider::thumbColourId, col::teal);
    lnf.setColour (juce::Slider::textBoxTextColourId, col::text);
    lnf.setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    lnf.setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);

    auto styleLabel = [&] (juce::Label& l, const juce::String& t, bool monoFont = true,
                           float sz = 11.0f, juce::Colour c = col::muted)
    {
        l.setText (t, juce::dontSendNotification);
        l.setFont (monoFont ? mono (sz) : juce::Font (sz));
        l.setColour (juce::Label::textColourId, c);
        addAndMakeVisible (l);
    };

    // ComboBoxParameterAttachment populerar INTE boxen (JUCE 8) — fyll den själv
    // från parameterns choices, sedan attach.
    auto setupCombo = [&] (juce::ComboBox& box, const char* id, std::unique_ptr<CA>& att, bool vis)
    {
        if (auto* cp = dynamic_cast<juce::AudioParameterChoice*> (proc.apvts.getParameter (id)))
            box.addItemList (cp->choices, 1);
        if (vis) addAndMakeVisible (box); else addChildComponent (box);
        att = std::make_unique<CA> (proc.apvts, id, box);
    };

    // ---- header / preset ----
    setupCombo (presetBox, "preset", presetAtt, true);
    styleLabel (lPreset, "PRESET");

    // ---- tabs ----
    for (auto* t : { &chordTab, &harpTab, &twoTab, &jazzTab }) addAndMakeVisible (t);
    chordTab.onClick = [this] { setMode (0); };
    harpTab.onClick  = [this] { setMode (1); };
    twoTab.onClick   = [this] { setMode (2); };
    jazzTab.onClick  = [this] { setMode (3); };

    // ---- viewer + key/scale ----
    addAndMakeVisible (viewer);
    setupCombo (keyBox, "key", keyAtt, true);
    setupCombo (scaleBox, "scale", scaleAtt, true);

    // ---- control card ----
    auto initSlider = [&] (juce::Slider& s, const char* id, std::unique_ptr<SA>& att, const juce::String& suffix = {})
    {
        s.setSliderStyle (juce::Slider::LinearHorizontal);
        s.setTextBoxStyle (juce::Slider::TextBoxRight, false, 52, 22);
        if (suffix.isNotEmpty()) s.setTextValueSuffix (suffix);
        addAndMakeVisible (s);
        att = std::make_unique<SA> (proc.apvts, id, s);
    };
    initSlider (sizeS, "size", sizeAtt);
    initSlider (invS, "inversion", invAtt);
    initSlider (strumS, "strum", strumAtt, " ms");
    humanizeS.setSliderStyle (juce::Slider::LinearHorizontal);
    humanizeS.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    humanizeS.setEnabled (false);
    addChildComponent (humanizeS);

    setupCombo (typeBox, "type", typeAtt, true);
    setupCombo (voicingBox, "voicing", voicingAtt, true);
    setupCombo (oosBox, "oos", oosAtt, true);
    addAndMakeVisible (bassTog);    bassAtt    = std::make_unique<BA> (proc.apvts, "bass", bassTog);

    styleLabel (lSize, "CHORD SIZE");
    styleLabel (lInv, "INVERSION");
    styleLabel (lDyn, "HUMANIZE");
    styleLabel (lType, "CHORD TYPE");
    styleLabel (lVoicing, "VOICING");
    styleLabel (lOos, "OUT-OF-SCALE");
    styleLabel (lBass, "BASS NOTE");

    // ---- keyboard row ----
    addAndMakeVisible (modKeysTog); modKeysAtt = std::make_unique<BA> (proc.apvts, "modKeys", modKeysTog);
    styleLabel (lModHint, "MOD ZONE  -  KLICK = KRYDDA  -  DRA HANDTAGET = FLYTTA");
    styleLabel (lZone, "Mod zone");
    addAndMakeVisible (pbWheel); addAndMakeVisible (mwWheel);
    addAndMakeVisible (keyboard);

    toSetupBtn.setColour (juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
    toSetupBtn.setColour (juce::TextButton::textColourOffId, col::teal);
    toSetupBtn.onClick = [this] { showSetup (true); };
    addAndMakeVisible (toSetupBtn);

    // ---- setup view ----
    toPlayBtn.setColour (juce::TextButton::buttonColourId, col::teal);
    toPlayBtn.setColour (juce::TextButton::textColourOffId, juce::Colour (0xff06241b));
    toPlayBtn.onClick = [this] { showSetup (false); };
    addChildComponent (toPlayBtn);

    setupCombo (pbTargetBox, "pb", pbTargetAtt, false);
    setupCombo (pbResetBox, "pbReset", pbResetAtt, false);
    setupCombo (mwTargetBox, "mw", mwTargetAtt, false);
    setupCombo (mwResetBox, "mwReset", mwResetAtt, false);
    setupCombo (modModeBox, "modMode", modModeAtt, false);
    setupCombo (borrowBox, "borrow", borrowAtt, false);
    addChildComponent (pbLatchTog); pbLatchAtt  = std::make_unique<BA> (proc.apvts, "pbLatch", pbLatchTog);
    addChildComponent (modKeysTog2); modKeysAtt2 = std::make_unique<BA> (proc.apvts, "modKeys", modKeysTog2);

    styleLabel (lRouting, "PERFORMANCE ROUTING");
    styleLabel (lPb, "Pitch Bend", false, 16.0f, col::text);
    styleLabel (lMw, "Mod Wheel", false, 16.0f, col::text);
    styleLabel (lModK, "Modifier Keys", false, 16.0f, col::text);
    styleLabel (lMapTitle, "MODIFIER MAP");

    setMode (0);
    showSetup (false);
    setSize (1000, 780);
    setWantsKeyboardFocus (true); // ta emot datorklaviatur (Musical Typing)
    startTimerHz (30);
}

ConchordEditor::~ConchordEditor()
{
    setLookAndFeel (nullptr);
}

void ConchordEditor::setMode (int m)
{
    if (m == 2 || m == 3) return; // 2-FINGER/JAZZ är stubbar (parkerade)
    mode = m;
    chordTab.selected = (m == 0); harpTab.selected = (m == 1);
    twoTab.selected = jazzTab.selected = false;
    for (auto* t : { &chordTab, &harpTab, &twoTab, &jazzTab }) t->repaint();

    bool harp = (m == 1);
    strumS.setVisible (harp && ! setupVisible);
    humanizeS.setVisible (! harp && ! setupVisible);
    lDyn.setText (harp ? "STRUM" : "HUMANIZE", juce::dontSendNotification);

    // size-tak: CHORD 8, HARP 12 (mjukt — klampar värdet)
    int cap = harp ? 12 : 8;
    if ((int) proc.apvts.getRawParameterValue ("size")->load() > cap)
        if (auto* sp = proc.apvts.getParameter ("size"))
            sp->setValueNotifyingHost (sp->convertTo0to1 ((float) cap));
}

void ConchordEditor::showSetup (bool s)
{
    setupVisible = s;
    // play-komponenter
    for (auto* c : std::initializer_list<juce::Component*> {
            &presetBox, &chordTab, &harpTab, &twoTab, &jazzTab, &viewer, &keyBox, &scaleBox,
            &sizeS, &invS, &typeBox, &voicingBox, &oosBox, &bassTog, &modKeysTog, &toSetupBtn,
            &pbWheel, &mwWheel, &keyboard, &lPreset, &lSize, &lInv, &lDyn, &lType, &lVoicing,
            &lOos, &lBass, &lModHint, &lZone })
        c->setVisible (! s);
    strumS.setVisible (! s && mode == 1);
    humanizeS.setVisible (! s && mode != 1);

    // setup-komponenter
    for (auto* c : std::initializer_list<juce::Component*> {
            &toPlayBtn, &pbTargetBox, &pbResetBox, &mwTargetBox, &mwResetBox, &modModeBox,
            &borrowBox, &pbLatchTog, &modKeysTog2, &lRouting, &lPb, &lMw, &lModK, &lMapTitle })
        c->setVisible (s);

    resized();
    repaint();
}

void ConchordEditor::resized()
{
    auto b = getLocalBounds();
    auto header = b.removeFromTop (56);
    presetBox.setBounds (header.removeFromRight (180).withSizeKeepingCentre (170, 30).translated (-20, 0));
    lPreset.setBounds (presetBox.getX() - 70, presetBox.getY(), 64, 30);

    if (! setupVisible)
    {
        auto tabs = b.removeFromTop (54).reduced (26, 8);
        int tw = (tabs.getWidth() - 30) / 4;
        chordTab.setBounds (tabs.removeFromLeft (tw)); tabs.removeFromLeft (10);
        harpTab.setBounds (tabs.removeFromLeft (tw));  tabs.removeFromLeft (10);
        twoTab.setBounds (tabs.removeFromLeft (tw));   tabs.removeFromLeft (10);
        jazzTab.setBounds (tabs.removeFromLeft (tw));

        auto body = b.removeFromTop (360).reduced (26, 8);
        rCtlCard = body.removeFromRight (340);
        body.removeFromRight (16);
        viewer.setBounds (body);
        // key/scale combos in viewer top-right
        keyBox.setBounds (viewer.getRight() - 200, viewer.getY() + 12, 90, 26);
        scaleBox.setBounds (viewer.getRight() - 104, viewer.getY() + 12, 92, 26);

        // control-kort innehåll
        auto card = rCtlCard.reduced (18);
        auto rowSlider = [&] (juce::Label& lbl, juce::Slider& s)
        {
            auto row = card.removeFromTop (44);
            lbl.setBounds (row.removeFromTop (18));
            s.setBounds (row);
            card.removeFromTop (4);
        };
        rowSlider (lSize, sizeS);
        rowSlider (lInv, invS);
        { auto row = card.removeFromTop (44); lDyn.setBounds (row.removeFromTop (18));
          strumS.setBounds (row); humanizeS.setBounds (row); card.removeFromTop (4); }
        rDivider = card.removeFromTop (10).withSizeKeepingCentre (card.getWidth(), 1);
        auto rowCombo = [&] (juce::Label& lbl, juce::Component& c)
        {
            auto row = card.removeFromTop (32);
            lbl.setBounds (row.removeFromLeft (130));
            c.setBounds (row.removeFromRight (180));
            card.removeFromTop (6);
        };
        rowCombo (lType, typeBox);
        rowCombo (lVoicing, voicingBox);
        rowCombo (lOos, oosBox);
        { auto row = card.removeFromTop (30); lBass.setBounds (row.removeFromLeft (130));
          bassTog.setBounds (row.removeFromRight (50)); }

        // keyboard row
        auto kbwrap = b.reduced (26, 6);
        auto kbHead = kbwrap.removeFromTop (30);
        modKeysTog.setBounds (kbHead.removeFromLeft (50).withSizeKeepingCentre (46, 26));
        lModHint.setBounds (kbHead.removeFromLeft (520).withHeight (26).withY (kbHead.getY() + 2));
        toSetupBtn.setBounds (kbHead.removeFromRight (90));

        auto footer = kbwrap.removeFromBottom (24);
        lZone.setBounds (footer.removeFromLeft (260));

        auto perf = kbwrap.removeFromLeft (110);
        pbWheel.setBounds (perf.removeFromLeft (52));
        perf.removeFromLeft (6);
        mwWheel.setBounds (perf.removeFromLeft (52));
        kbwrap.removeFromLeft (12);
        keyboard.setBounds (kbwrap);
    }
    else
    {
        toPlayBtn.setBounds (header.removeFromRight (180).withSizeKeepingCentre (160, 32).translated (-20, 0));

        auto body = b.reduced (26, 8);
        auto right = body.removeFromRight (360);
        body.removeFromRight (16);

        lRouting.setBounds (body.removeFromTop (24));
        auto routeCard = [&] (juce::Rectangle<int>& store, juce::Label& name, int extra)
        {
            store = body.removeFromTop (76);
            body.removeFromTop (14);
            auto inner = store.reduced (16, 12);
            name.setBounds (inner.removeFromTop (22).removeFromLeft (200));
            return inner;
        };
        { auto inner = routeCard (rPbCard, lPb, 0);
          pbTargetBox.setBounds (rPbCard.getRight() - 150, rPbCard.getY() + 14, 134, 26);
          auto opts = inner.removeFromBottom (28);
          pbLatchTog.setBounds (opts.removeFromLeft (52).withSizeKeepingCentre (46, 26));
          pbResetBox.setBounds (opts.removeFromLeft (170).withHeight (26).withY (opts.getY())); }
        { auto inner = routeCard (rMwCard, lMw, 0); juce::ignoreUnused (inner);
          mwTargetBox.setBounds (rMwCard.getRight() - 150, rMwCard.getY() + 14, 134, 26);
          mwResetBox.setBounds (rMwCard.getX() + 16, rMwCard.getBottom() - 40, 200, 26); }
        { auto inner = routeCard (rModCard, lModK, 0); juce::ignoreUnused (inner);
          modKeysTog2.setBounds (rModCard.getRight() - 60, rModCard.getY() + 14, 46, 26);
          modModeBox.setBounds (rModCard.getX() + 16, rModCard.getBottom() - 40, 120, 26);
          borrowBox.setBounds (rModCard.getX() + 144, rModCard.getBottom() - 40, 180, 26); }

        rMapCard = right;
        lMapTitle.setBounds (right.getX() + 16, right.getY() + 14, 200, 18);
    }
}

void ConchordEditor::paint (juce::Graphics& g)
{
    g.fillAll (col::panel);

    g.setColour (col::text); g.setFont (juce::Font (22.0f, juce::Font::bold));
    g.drawText ("CONCHORD", 26, 14, 200, 28, juce::Justification::centredLeft);
    g.setColour (col::teal); g.setFont (mono (11.0f));
    g.drawText (setupVisible ? "SETUP" : "CHORD ENGINE", 168, 14, 200, 28, juce::Justification::centredLeft);

    if (! setupVisible)
    {
        g.setColour (col::panel3); g.fillRoundedRectangle (rCtlCard.toFloat(), 14);
        g.setColour (col::line()); g.drawRoundedRectangle (rCtlCard.toFloat(), 14, 1);
        g.setColour (col::line()); g.fillRect (rDivider);
    }
    else
    {
        for (auto* r : { &rPbCard, &rMwCard, &rModCard, &rMapCard })
        {
            g.setColour (col::panel3); g.fillRoundedRectangle (r->toFloat(), 14);
            g.setColour (col::line()); g.drawRoundedRectangle (r->toFloat(), 14, 1);
        }
        // pill-etiketter på routing-målen
        auto pill = [&] (juce::Rectangle<int> card, const juce::String& txt)
        {
            // (mål-comboboxarna sköter valet; pillen här är bara dekor på namnraden)
        };
        juce::ignoreUnused (pill);

        // modifier map (följer modZoneLow)
        int low = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();
        auto list = rMapCard.reduced (16, 0).withTrimmedTop (44);
        for (int i = 0; i < conchord::kNumModifiers; ++i)
        {
            auto row = list.removeFromTop (30); list.removeFromTop (4);
            int m = low + i;
            bool white = ! (((m % 12) == 1) || ((m % 12) == 3) || ((m % 12) == 6) || ((m % 12) == 8) || ((m % 12) == 10));
            g.setColour (white ? col::panel2 : juce::Colours::transparentBlack);
            g.fillRoundedRectangle (row.toFloat(), 9);
            g.setColour (white ? col::teal : col::muted); g.setFont (mono (12.0f, true));
            g.drawText (noteShort (m) + juce::String (octOf (m)), row.removeFromLeft (70).withTrimmedLeft (12), juce::Justification::centredLeft);
            g.setColour (col::text); g.setFont (juce::Font (13.0f, juce::Font::bold));
            g.drawText (MOD_NAME[i], row.withTrimmedRight (12), juce::Justification::centredRight);
        }
    }
}

// ============================================================================
// Musical Typing — datorns tangentbord spelar in noter precis som i Logic.
//
// Tangenter identifieras via TECKNET de producerar (getTextCharacter) vid
// nedtryck – det är layout-korrekt, så svenska ö/ä funkar utan gissningar om
// versaler/keycodes. SLÄPP upptäcks genom att polla den fångade KeyPress:en i
// timern (oberoende av fokus -> inga fastnade toner när man klickar på en ratt).
//
// Layout:  rad "awsedftgyhujkolp" + ö/ä = vita+svarta tangenter en oktav+ från
// typingBase ('a' = C4). z/x byter oktav. Sifferrad 1..9 = kryddtangenterna.
// ============================================================================
namespace
{
    // Tecken (gemener) -> halvtonsoffset från typingBase. Både US-interpunktion
    // (;,') och svenska ö/ä pekar på samma toppnoter (E/F) – det som din layout
    // ger matchas.
    struct TypingKey { juce::juce_wchar ch; int semis; };
    const TypingKey kTypingKeys[] = {
        { 'a', 0 }, { 'w', 1 }, { 's', 2 }, { 'e', 3 }, { 'd', 4 }, { 'f', 5 },
        { 't', 6 }, { 'g', 7 }, { 'y', 8 }, { 'h', 9 }, { 'u', 10 }, { 'j', 11 },
        { 'k', 12 }, { 'o', 13 }, { 'l', 14 }, { 'p', 15 },
        { ';', 16 }, { (juce::juce_wchar) 0x00F6, 16 },  // E: US ';' / svensk 'ö'
        { '\'',17 }, { (juce::juce_wchar) 0x00E4, 17 },  // F: US '\'' / svensk 'ä'
    };

    int semitoneForChar (juce::juce_wchar lc)
    {
        for (auto& k : kTypingKeys) if (lc == k.ch) return k.semis;
        return -1;
    }
}

void ConchordEditor::sendTypedNote (int note, bool on)
{
    auto m = on ? juce::MidiMessage::noteOn (1, note, (juce::uint8) 100)
                : juce::MidiMessage::noteOff (1, note);
    m.setTimeStamp (juce::Time::getMillisecondCounterHiRes() * 0.001);
    proc.keyboardCollector.addMessageToQueue (m);
}

bool ConchordEditor::keyPressed (const juce::KeyPress& key)
{
    // Auto-repeat: tangenten hålls redan -> konsumera men trigga inte om.
    for (auto& h : heldKeys)   if (h.kp == key) return true;
    for (auto& k : heldOctave) if (k == key)    return true;

    const auto lc = juce::CharacterFunctions::toLowerCase (key.getTextCharacter());

    if (lc == 'z') { shiftTypingOctave (-12); heldOctave.push_back (key); return true; }
    if (lc == 'x') { shiftTypingOctave (+12); heldOctave.push_back (key); return true; }

    // Sifferrad 1..9 -> kryddtangenter (via kryddzonens noter, så motorns
    // Hold/Latch gäller). Kräver att Modifier Keys är på.
    if (lc >= '1' && lc <= '9')
    {
        const bool modKeysOn = proc.apvts.getRawParameterValue ("modKeys")->load() > 0.5f;
        if (modKeysOn)
        {
            const int zoneLow = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();
            const int note = zoneLow + (int) (lc - '1');
            if ((int) (lc - '1') < conchord::kNumModifiers)
            {
                sendTypedNote (note, true);
                heldKeys.push_back ({ key, note, TKind::Mod });
            }
        }
        return true; // konsumera oavsett (inget pip)
    }

    // Spel-tangent?
    const int semis = semitoneForChar (lc);
    if (semis >= 0)
    {
        const int note = typingBase + semis;
        sendTypedNote (note, true);
        heldKeys.push_back ({ key, note, TKind::Play });
        return true;
    }

    return false;
}

void ConchordEditor::releaseAllTyped()
{
    for (auto& h : heldKeys) sendTypedNote (h.note, false);
    heldKeys.clear();
    heldOctave.clear();
}

void ConchordEditor::shiftTypingOctave (int delta)
{
    // Släpp hållna spel-toner innan basen flyttas (annars fastnar de på gammal not).
    for (auto it = heldKeys.begin(); it != heldKeys.end(); )
    {
        if (it->kind == TKind::Play) { sendTypedNote (it->note, false); it = heldKeys.erase (it); }
        else ++it;
    }
    typingBase = juce::jlimit (24, 96, typingBase + delta);
}

void ConchordEditor::timerCallback()
{
    if (! grabbedInitialFocus && isShowing())
    {
        grabKeyboardFocus(); // se till att tangenttryck når editorn från start
        grabbedInitialFocus = true;
    }

    // Musical Typing: upptäck släppta tangenter genom att polla fångade KeyPress.
    // Om appen inte är i förgrunden kan vi missa key-up -> släpp allt.
    if (! juce::Process::isForegroundProcess())
    {
        releaseAllTyped();
    }
    else
    {
        for (auto it = heldKeys.begin(); it != heldKeys.end(); )
        {
            if (! it->kp.isCurrentlyDown()) { sendTypedNote (it->note, false); it = heldKeys.erase (it); }
            else ++it;
        }
        for (auto it = heldOctave.begin(); it != heldOctave.end(); )
            it = it->isCurrentlyDown() ? it + 1 : heldOctave.erase (it);
    }

    auto ui = proc.getUiState();
    std::set<int> active (ui.active.begin(), ui.active.end());

    keyboard.root = ui.root;
    keyboard.lit = active;
    std::set<int> gh;
    for (int p : ui.full) if (! active.count (p)) gh.insert (p);
    keyboard.ghost = gh;
    keyboard.repaint();

    auto nm = detectChordName (ui.root, ui.active);
    viewer.name = ui.active.empty() ? "—" : nm.first;
    juce::String desc = ui.active.empty() ? "" : nm.second;
    if (! ui.active.empty()) desc += "  -  " + choiceName (proc.apvts, "voicing").toUpperCase();
    viewer.desc = desc;
    viewer.chips.clear();
    for (int p : ui.active) viewer.chips.push_back (noteShort (p));
    viewer.bars.clear();
    for (int p : ui.full) viewer.bars.push_back ({ 0.72f, ! active.count (p) });
    viewer.repaint();

    auto pbName = choiceName (proc.apvts, "pb");
    pbWheel.sub = ">" + pbName.toUpperCase();
    if (pbName == "Chord Size")
        pbWheel.sub = "> SIZE\n" + juce::String ((int) active.size()) + "/" + juce::String ((int) ui.full.size());
    mwWheel.sub = ">" + choiceName (proc.apvts, "mw").toUpperCase();
    pbWheel.repaint(); mwWheel.repaint();

    int low = (int) proc.apvts.getRawParameterValue ("modZoneLow")->load();
    bool modKeys = proc.apvts.getRawParameterValue ("modKeys")->load() > 0.5f;
    lZone.setText (modKeys ? "Mod zone: " + noteShort (low) + juce::String (octOf (low)) + "-"
                                 + noteShort (low + 8) + juce::String (octOf (low + 8))
                           : "Mod zone: av", juce::dontSendNotification);
}
