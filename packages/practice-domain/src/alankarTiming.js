export const ALANKAR_MAX_LOOPS = 10;
export const ALANKAR_COUNT_IN_BEATS = 4;
export const ALANKAR_TIME_SIGNATURE = '4/4';

export function normalizeBpm(value, fallback = 60) {
  const bpm = Number(value);
  return Number.isFinite(bpm) && bpm > 0 ? Math.min(240, Math.max(20, bpm)) : fallback;
}

export function normalizeLoopCount(value, max = ALANKAR_MAX_LOOPS) {
  const loops = Number(value);
  return Number.isFinite(loops) ? Math.min(max, Math.max(1, Math.floor(loops))) : 1;
}

export function beatDurationMs(bpm = 60) {
  return 60000 / normalizeBpm(bpm);
}

/** Add one timer segment without double-counting earlier segments. */
export function advanceElapsed(elapsedMs = 0, segmentStartedAt = 0, now = 0) {
  const elapsed = Number(elapsedMs);
  const started = Number(segmentStartedAt);
  const current = Number(now);
  if (![elapsed, started, current].every(Number.isFinite)) return Math.max(0, elapsed || 0);
  return Math.max(0, elapsed + Math.max(0, current - started));
}

const beatInBar = (beatIndex) => (beatIndex % 4) + 1;

// Every Alankar group occupies exactly one 4/4 bar. The swaras are placed at
// the beginning of their musical positions and the remaining beats sustain the
// most recent swara, matching the notation used in the practice specification:
// [Sa] -> Sa | . | . | ., [Sa, Sa] -> Sa | . | Sa | ., and so on.
const groupTargets = (group) => {
  const targets = [...group];
  if (targets.length === 0) return Array(4).fill(null);
  if (targets.length === 1) return Array(4).fill(targets[0]);
  if (targets.length === 2) return [targets[0], targets[0], targets[1], targets[1]];
  return [targets[0], targets[1], targets[2], targets[targets.length - 1]];
};

/**
 * Build a deterministic beat timeline. Count-in beats are included once, then
 * the musical groups repeat without another count-in between loops.
 */
export function createAlankarTimeline({ groups = [], bpm = 60, loops = 1, countInBeats = ALANKAR_COUNT_IN_BEATS } = {}) {
  const normalizedGroups = groups.filter((group) => Array.isArray(group) && group.length > 0).map((group) => [...group]);
  const normalizedLoops = normalizeLoopCount(loops);
  const normalizedCountIn = Math.max(0, Math.floor(Number(countInBeats) || 0));
  const practice = [];
  let beatIndex = 0;

  for (let loopIndex = 0; loopIndex < normalizedLoops; loopIndex += 1) {
    normalizedGroups.forEach((group, groupIndex) => {
      groupTargets(group).forEach((swara, groupBeatIndex) => {
        practice.push({
          phase: 'practice',
          swara,
          groupIndex,
          groupBeatIndex,
          groupLength: group.length,
          isSustain: (group.length === 1 ? groupBeatIndex > 0 : group.length === 2 ? groupBeatIndex % 2 === 1 : groupBeatIndex === 3),
          loopIndex,
          beatIndex,
          beatInBar: beatInBar(beatIndex),
          // Group boundaries are bar boundaries, so every group starts on an
          // accented beat even when the number of groups is not a multiple of
          // four.
          accent: groupBeatIndex === 0,
        });
        beatIndex += 1;
      });
    });
  }

  const countIn = Array.from({ length: normalizedCountIn }, (_, index) => ({
    phase: 'count-in',
    countInBeat: index + 1,
    beatInBar: beatInBar(index),
    accent: index === 0,
  }));

  return Object.freeze({
    bpm: normalizeBpm(bpm),
    beatDurationMs: beatDurationMs(bpm),
    countInBeats: normalizedCountIn,
    loops: normalizedLoops,
    groups: normalizedGroups,
    countIn: Object.freeze(countIn),
    practice: Object.freeze(practice),
    totalBeats: normalizedCountIn + practice.length,
    practiceBeats: practice.length,
  });
}

/** Return the state at an elapsed active time without advancing on audio frames. */
export function getAlankarBeatAt(elapsedMs, timeline) {
  if (!timeline || !Number.isFinite(elapsedMs) || elapsedMs < 0) return { phase: 'idle', index: -1 };
  const index = Math.floor(elapsedMs / timeline.beatDurationMs);
  if (index < timeline.countInBeats) return { ...timeline.countIn[index], index };
  const practiceIndex = index - timeline.countInBeats;
  if (practiceIndex >= timeline.practice.length) return { phase: 'complete', index, practiceIndex: timeline.practice.length };
  return { ...timeline.practice[practiceIndex], index, practiceIndex };
}
