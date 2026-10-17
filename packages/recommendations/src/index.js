export function recommend(session = {}) {
  const m = session.metrics || session;
  const q = m.quality || session.quality || {};
  if (!m.reliableFrameCount || m.reliablePitchMatchPercent == null) return { exerciseId: 'sa-sustain', reasonKey: 'recommendations.noReliableAudio', evidence: { metric: 'reliableFrameCount', value: m.reliableFrameCount ?? 0, threshold: 1 } };
  if ((q.clippedFrameCount ?? 0) > 0) return { exerciseId: session.exerciseId || 'sa-sustain', reasonKey: 'recommendations.clipping', evidence: { metric: 'clippedFrameCount', value: q.clippedFrameCount, threshold: 0 } };
  if ((m.medianAbsoluteCents ?? 0) > 50) return { exerciseId: 'sa-sustain', reasonKey: 'recommendations.highDeviation', evidence: { metric: 'medianAbsoluteCents', value: m.medianAbsoluteCents, threshold: 50 } };
  return { exerciseId: 'sa-re-ga', reasonKey: 'recommendations.stablePerformance', evidence: { metric: 'reliablePitchMatchPercent', value: m.reliablePitchMatchPercent, threshold: 80 } };
}
export function getRecommendations(session) { return [recommend(session)]; }
