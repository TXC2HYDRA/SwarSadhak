# Audio analysis

SwarSadhak performs microphone analysis locally in the browser. `createAudioController` requests `getUserMedia({audio:true})`, feeds a `ScriptProcessorNode` compatibility path, and sends fixed PCM buffers to `estimatePitch`. The processor is connected through a zero-gain node, so microphone audio is not audible and no samples are persisted or uploaded. Stopping disconnects nodes, closes the audio context, and stops every stream track.

`estimatePitch` uses normalized autocorrelation over a configurable vocal range (60–1000 Hz by default). It rejects invalid sample rates, non-finite samples, silence, clipping, low confidence, and out-of-range estimates. Every path applies the same confidence threshold; unreliable frames have no frequency and a reason such as `silence`, `clipping`, `low-confidence`, or `out-of-range`. Autocorrelation is explainable and dependency-free, but is not a studio-grade detector and may be affected by room noise, harmonics, and browser buffering.

The musical adapter converts a detected frequency against the selected tonic using `1200 * log2(detected / target)`. Positive cents are sharp and negative cents are flat. The current single-target metric path evaluates Sa-based exercises. Sequence exercises are available in the canonical exercise library but remain explicitly limited because per-target timing and advancement are not yet implemented.

Only derived observations and session summaries are retained in memory/local storage. Raw PCM and recordings never leave the browser.
