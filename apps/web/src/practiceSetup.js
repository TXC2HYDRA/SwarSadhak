import { alankarDisplayGroups, alankarGroups } from '@swarsadhak/exercises';
import { createAlankarTimeline, getAlankarBeatAt } from '@swarsadhak/practice-domain';

export const octaveNumber = (octave) => ({ lower: -1, middle: 0, higher: 1 })[octave] ?? 0;
export const octaveKey = (octave = 0) => octave < 0 ? 'baseOctave' : octave > 0 ? 'highOctave' : 'middleOctave';
export const timeLabel = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export function alankarSetup(pattern, { direction = 'full', bpm = 60, loops = 1, durationSeconds } = {}) {
  const groups = alankarGroups(pattern, direction);
  const octaveGroups = alankarDisplayGroups(pattern, direction);
  const timeline = createAlankarTimeline({ groups, bpm, loops });
  const countInMs = timeline.countInBeats * timeline.beatDurationMs;
  const fullDurationMs = timeline.totalBeats * timeline.beatDurationMs;
  const durationMs = Number.isFinite(durationSeconds) ? Math.min(fullDurationMs, countInMs + durationSeconds * 1000) : fullDurationMs;
  const targetAt = (elapsedMs) => {
    const beat = getAlankarBeatAt(elapsedMs, timeline);
    if (beat.phase !== 'practice') return null;
    const group = octaveGroups[beat.groupIndex];
    const noteIndex = group.length === 1 ? 0 : group.length === 2 ? Math.floor(beat.groupBeatIndex / 2) : Math.min(beat.groupBeatIndex, group.length - 1);
    const note = group[noteIndex];
    return { ...beat, swara: note.swara, octave: octaveNumber(note.octave), noteIndex };
  };
  return { groups, octaveGroups, timeline, targetAt, durationMs, countInMs };
}

// The same exact target/octave comparison is used by live feedback and results.
export function livePitch(observation, target, elapsedMs) {
  const usable = observation && target && observation.targetNote === target.swara
    && observation.octave === (target.octave ?? 0) && elapsedMs - observation.timestamp <= 500
    && observation.voiced && !observation.clipped && observation.valid !== false
    && observation.confidence >= .55 && Number.isFinite(observation.centsError);
  if (!usable) return null;
  return { frequencyHz: observation.frequencyHz, cents: observation.centsError,
    status: Math.abs(observation.centsError) <= 50 ? 'inTune' : observation.centsError < 0 ? 'flat' : 'sharp' };
}
