# Phase 1 audio analysis

SwarSadhak uses browser-native `getUserMedia`, `AudioContext`, a `MediaStreamAudioSourceNode`, and a short `ScriptProcessorNode` buffer. The processor is connected through a zero-gain sink so microphone audio is not played back through speakers. The stream is stopped when the user stops, leaves Practice, or an error occurs. No raw audio is uploaded, recorded, or persisted.

## Algorithm and assumptions

The detector uses normalized time-domain autocorrelation over a 2048-sample buffer. It searches configurable 65–1000 Hz periods, reports RMS, and rejects non-finite input, silence below RMS 0.01, digital full-scale clipping, low confidence below 0.72, and results outside the search range. Browser sample rate is passed directly into the period-to-frequency conversion, so 44.1 kHz and 48 kHz devices are supported.

The result is `{ frequencyHz, confidence, rms, voiced, clipped, reason }`. Reasons are `silence`, `low_confidence`, `clipping`, `out_of_range`, or `invalid_input`.

## Musical feedback

Cents are calculated as `1200 * log2(detected / target)`. Negative values are flat and positive values are sharp. Targets derive from a user-selected tonic using equal temperament for the initial Sa/Re/Ga/Ma approximation. This is not a claim that Hindustani intonation is equal-tempered or universally represented by twelve-tone conversion.

## Compatibility and limitations

Microphone access requires a browser with `navigator.mediaDevices.getUserMedia` and Web Audio, normally over HTTPS or localhost. Permission denial, missing devices, busy devices, unsupported APIs, silence, noise, and clipping produce visible states rather than invented notes. Synthetic tests validate numerical behavior but cannot prove accuracy for every singer, microphone, room, or musical tradition. The UI provides practice feedback only, not medical, vocal-health, emotional, or diagnostic advice.
