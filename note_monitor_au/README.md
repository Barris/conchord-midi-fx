# Conchord Note Monitor (AU MIDI FX)

A transparent MIDI-effect Audio Unit that draws every note passing through it as
a live piano-roll keyboard (velocity-coloured) plus a text readout of held
notes. Built as a real plugin so it can sit in Logic's MIDI FX slot — the
visual counterpart to the Scripter-console `note_monitor.js`.

It never alters MIDI; it observes and passes everything through, so you can
leave it in the chain while designing Conchord.

## Build

Needs CMake + a C/C++ toolchain + Ninja. **Full Xcode is NOT required** — the
macOS Command Line Tools provide everything to build a classic AU `.component`.

```sh
cmake -S . -B build-ninja -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-ninja
```

Notes:
- Use the **Ninja** generator. The "Unix Makefiles" generator hits a
  `cmake_clean_target.cmake` regression in CMake 4.x.
- `COPY_PLUGIN_AFTER_BUILD` installs the AU to
  `~/Library/Audio/Plug-Ins/Components/` automatically.
- First configure shallow-clones JUCE (tag `8.0.4`, change in `CMakeLists.txt`).
- `-DUNIVERSAL=ON` builds a universal arm64+x86_64 binary.

## Validate

```sh
auval -v aumi NtMn Cncd
```

Should end with `AU VALIDATION SUCCEEDED`.

## Use in Logic

1. On an instrument/software track, click the **MIDI FX** slot.
2. Choose **AU MIDI-controlled Effects → Conchord → Conchord Note Monitor**.
3. Put it **after Conchord** in the slot order to watch Conchord's *output*,
   or before it to watch the raw keyboard input.

If Logic doesn't list it after a rebuild, it has cached the AU. Quit Logic and:

```sh
killall -9 AudioComponentRegistrar 2>/dev/null
auval -v aumi NtMn Cncd
```

then relaunch Logic.

## Standalone (quick testing without Logic)

The build also produces a standalone app at
`build-ninja/ConchordNoteMonitor_artefacts/Release/Standalone/ConchordNoteMonitor.app`.
Open it, pick a MIDI input in its audio/MIDI settings, and play.

## Layout

- `Source/PluginProcessor.*` — MIDI passthrough + thread-safe note snapshot
  (`std::atomic<uint8>[128]` velocities written on the audio thread).
- `Source/PluginEditor.*` — 60 Hz timer reads the snapshot and paints the
  keyboard + readout.

## Ideas / next steps

- Scrolling velocity history (piano-roll trail) instead of just current state.
- Per-channel colouring.
- Held-chord name detection (mirror Conchord's own chord logic).
