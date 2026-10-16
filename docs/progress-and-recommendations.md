# Progress and recommendations

## Metrics

Reliable frames are voiced, finite, within the exercise frequency range, not clipped, and above the configured confidence threshold. Reliable pitch match is the percentage of reliable frames within the exercise tolerance. Median absolute cents deviation is the median absolute distance from the target. Pitch stability is median absolute deviation (MAD) of cents values; lower is steadier. Frequency range uses reliable frames only. If there are no reliable frames, metrics are `null`, never zero.

The quality summary counts reliable ratio, silence, low-confidence, clipped, and invalid frames. These are measurement observations, not a judgement of vocal health or overall singing ability. Sequence exercises are explicitly limited until per-target evaluation exists.

## Recommendations

Rules are deterministic and local: no reliable data suggests a shorter sustain and signal guidance; clipping suggests moving away or lowering input; high deviation (>50 cents) suggests shorter pitch matching; otherwise stable reliable performance suggests a slightly harder sequence. Every recommendation carries an exercise ID, reason key, metric, value, and threshold. Invalid frames cannot cause a performance recommendation.

## Storage and privacy

`swar-practice-sessions-v1` stores schema-versioned session IDs, timestamps, exercise ID, active duration, metrics, quality counts, and completion state. It never stores audio. Storage is browser-local and can be unavailable or cleared by site-data settings. Progress is real history only; unrelated exercises are not combined into an unexplained score. The user can clear all summaries from Progress with confirmation.

The browser practice flow now connects microphone frames to the musical adapter and `calculateMetrics`. Active duration is accumulated only while running; pause time is excluded and audio processing is suspended/resumed. The user selects a tonic, which is used for target-relative cents and persisted with the session. If permission is denied or no reliable frames are collected, the app does not persist a normal completed session and shows localized retry guidance. Real microphone behavior still requires manual browser testing.

Progress filters by canonical exercise ID. The selected exercise's comparable reliable-match values are shown as a text trend; fewer than two comparable sessions are explicitly described as insufficient for a meaningful trend. Storage-write failures leave the result visible in memory and show a warning rather than crashing.
