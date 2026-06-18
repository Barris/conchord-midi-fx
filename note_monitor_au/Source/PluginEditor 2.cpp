#include "PluginEditor.h"

//==============================================================================
NoteMonitorEditor::NoteMonitorEditor (NoteMonitorProcessor& p)
    : juce::AudioProcessorEditor (&p), proc (p)
{
    setSize (760, 280);
    setResizable (true, true);
    setResizeLimits (480, 200, 1600, 600);
    startTimerHz (60);
}

NoteMonitorEditor::~NoteMonitorEditor()
{
    stopTimer();
}

void NoteMonitorEditor::timerCallback()
{
    repaint();
}

bool NoteMonitorEditor::isBlackKey (int pitch) const
{
    switch (pitch % 12)
    {
        case 1: case 3: case 6: case 8: case 10: return true;
        default: return false;
    }
}

//==============================================================================
void NoteMonitorEditor::paint (juce::Graphics& g)
{
    auto area = getLocalBounds().toFloat();

    // background
    g.fillAll (juce::Colour (0xff14171c));

    // --- header / readout ---
    auto header = area.removeFromTop (64.0f).reduced (12.0f, 8.0f);

    g.setColour (juce::Colours::white);
    g.setFont (juce::Font (juce::FontOptions (18.0f, juce::Font::bold)));
    g.drawText ("Conchord Note Monitor", header.removeFromTop (24.0f),
                juce::Justification::topLeft);

    // collect currently-held notes
    juce::StringArray names;
    int heldCount = 0;
    for (int p = 0; p < 128; ++p)
    {
        if (proc.noteVelocity[(size_t) p].load() > 0)
        {
            ++heldCount;
            names.add (juce::MidiMessage::getMidiNoteName (p, true, true, 3)
                       + ":" + juce::String (proc.noteVelocity[(size_t) p].load()));
        }
    }

    g.setColour (juce::Colour (0xff9fb3c8));
    g.setFont (juce::Font (juce::FontOptions (13.0f)));

    juce::String readout = juce::String (heldCount) + " held";
    if (heldCount > 0)
        readout << "   " << names.joinIntoString ("  ");

    const int cc = proc.ccNumber.load();
    if (cc >= 0)
        readout << "      CC " << cc << " = " << proc.ccValue.load();

    g.drawText (readout, header, juce::Justification::topLeft);

    // --- keyboard ---
    drawKeyboard (g, area.reduced (12.0f, 8.0f));
}

void NoteMonitorEditor::drawKeyboard (juce::Graphics& g, juce::Rectangle<float> area)
{
    // count white keys in range to size them
    int whiteCount = 0;
    for (int p = lowNote; p <= highNote; ++p)
        if (! isBlackKey (p)) ++whiteCount;

    if (whiteCount == 0) return;

    const float whiteW = area.getWidth() / (float) whiteCount;
    const float whiteH = area.getHeight();
    const float blackW = whiteW * 0.62f;
    const float blackH = whiteH * 0.62f;

    auto velColour = [] (int vel)
    {
        // green (soft) -> yellow -> red (hard)
        const float t = juce::jlimit (0.0f, 1.0f, vel / 127.0f);
        return juce::Colour::fromHSV ((1.0f - t) * 0.33f, 0.85f, 1.0f, 1.0f);
    };

    // pass 1: white keys
    float x = area.getX();
    for (int p = lowNote; p <= highNote; ++p)
    {
        if (isBlackKey (p)) continue;

        juce::Rectangle<float> r (x, area.getY(), whiteW - 1.0f, whiteH);
        const int vel = proc.noteVelocity[(size_t) p].load();

        g.setColour (vel > 0 ? velColour (vel) : juce::Colour (0xffe9edf2));
        g.fillRect (r);
        g.setColour (juce::Colour (0xff3a4250));
        g.drawRect (r, 1.0f);

        // octave C labels
        if (p % 12 == 0)
        {
            g.setColour (juce::Colour (0xff6b7686));
            g.setFont (juce::Font (juce::FontOptions (10.0f)));
            g.drawText (juce::MidiMessage::getMidiNoteName (p, true, true, 3),
                        r.removeFromBottom (14.0f), juce::Justification::centred);
        }

        x += whiteW;
    }

    // pass 2: black keys (drawn on top, centred on the gap)
    x = area.getX();
    for (int p = lowNote; p <= highNote; ++p)
    {
        if (isBlackKey (p)) continue;
        const float nextX = x + whiteW;

        // a black key may sit to the right of this white key
        const int bp = p + 1;
        if (bp <= highNote && isBlackKey (bp))
        {
            juce::Rectangle<float> r (nextX - blackW * 0.5f, area.getY(),
                                      blackW, blackH);
            const int vel = proc.noteVelocity[(size_t) bp].load();
            g.setColour (vel > 0 ? velColour (vel) : juce::Colour (0xff202732));
            g.fillRect (r);
            g.setColour (juce::Colour (0xff05070a));
            g.drawRect (r, 1.0f);
        }

        x = nextX;
    }
}
