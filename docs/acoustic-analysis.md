# Acoustic analysis

`packages/acoustic-analysis` contains pure, bounded summaries over already-derived frames. It reports voiced-frame ratio, frequency range, confidence, clipping count, median absolute cents, and median absolute deviation. Missing values remain `null`; non-finite values are ignored. Inputs are capped to prevent unbounded work.

These are practice-signal measurements, not medical or emotional inference. No feature assesses throat tension, vocal cords, vocal health, emotion, or authoritative voice type. Raw audio remains in the browser analysis path and is not uploaded by Phase 5.

Total frames are all bounded observations. Voiced frames have `voiced === true`; reliable frames additionally require finite frequency within the configured range, finite cents error when cents metrics are requested, confidence at or above the configured threshold, and no clipping when `excludeClipped` is enabled. The default analysis threshold is aligned with the practice contract (`0.7` in the analysis helper; the practice session may provide its explicit threshold).
