cmake_minimum_required(VERSION 3.22)

project(ConchordAU VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build for the current Mac arch only by default (faster, smaller).
# Set -DUNIVERSAL=ON for a universal arm64+x86_64 binary if you need it.
option(UNIVERSAL "Build a universal binary (arm64 + x86_64)" OFF)
if(UNIVERSAL)
    set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "" FORCE)
endif()

# ---- Pull in JUCE (shallow clone to keep disk usage down) ----
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.4          # match note_monitor_au
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(JUCE)

# ---- The plugin target ----
juce_add_plugin(ConchordAU
    PLUGIN_MANUFACTURER_CODE Cncd          # 4 chars, exactly one uppercase
    PLUGIN_CODE              CnCh           # 4 chars, unique per plugin (note_monitor = NtMn)
    COMPANY_NAME             "Conchord"
    PRODUCT_NAME             "ConchordAU"   # no spaces: avoids a CMake 4.x clean bug
    BUNDLE_ID                com.conchord.conchordau
    IS_MIDI_EFFECT          TRUE            # -> AU type 'aumi', shows in Logic MIDI FX slot
    IS_SYNTH                FALSE
    NEEDS_MIDI_INPUT        TRUE
    NEEDS_MIDI_OUTPUT       TRUE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE            # auto-installs to ~/Library/Audio/Plug-Ins
    FORMATS                 AU Standalone
)

juce_generate_juce_header(ConchordAU)

# ---- Embed the piano samples (used by the built-in Standalone synth) ----
juce_add_binary_data(ConchordSamples
    SOURCES
        samples/UR1_C1_f_RR1.wav
        samples/UR1_C2_f_RR1.wav
        samples/UR1_C3_f_RR1.wav
        samples/UR1_C4_f_RR1.wav
        samples/UR1_C5_f_RR1.wav
        samples/UR1_C6_f_RR1.wav
)
# Needed so the static data links cleanly into the AU/Standalone bundles.
set_target_properties(ConchordSamples PROPERTIES POSITION_INDEPENDENT_CODE TRUE)

target_sources(ConchordAU PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
)

target_compile_definitions(ConchordAU PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(ConchordAU PRIVATE
    juce::juce_audio_utils
    ConchordSamples
    PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags
)
