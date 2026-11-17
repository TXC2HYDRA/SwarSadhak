import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { ALANKARS, getExercise } from '@swarsadhak/exercises';
import { deterministicCoach } from '@swarsadhak/ai-coach';
import { createApiClient } from '@swarsadhak/api-client';
import { assessPracticeEvidence } from './practiceSession.js';
import { readPreference } from './navigation.js';
import { timeLabel } from './practiceSetup.js';

const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;
const measurement = (value, suffix, missing) => Number.isFinite(value) ? `${Math.round(value)}${suffix}` : missing;
function Metric({ label, value }) { return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>; }

export function Results({ t, session, saved = null, onSaveAgain, onBack, onRetry, onNext, onRoutine }) {
  const sufficient = Boolean(session?.completion?.completed && assessPracticeEvidence(session?.metrics).sufficient);
  const coaching = useMemo(() => sufficient ? deterministicCoach({ exerciseId: session.exerciseId, metrics: session.metrics, quality: session.quality }) : null, [session, sufficient]);
  const [remote, setRemote] = useState(null);
  const [provider, setProvider] = useState('deterministic');
  useEffect(() => {
    setRemote(null); setProvider('deterministic');
    if (!coaching) return undefined;
    let cancelled = false;
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const token = readPreference('swar-access-token', '');
    if (!baseUrl || !token) return undefined;
    const client = createApiClient({ baseUrl, token });
    let timeoutId;
    const timeout = new Promise((resolve) => { timeoutId = setTimeout(() => resolve({ ok: false }), 5000); });
    Promise.race([client.coach.explain(session, readPreference('swar-locale', 'en')), timeout]).then((result) => {
      if (cancelled) return;
      if (result?.ok && result.data?.messageKey && result.data?.reasonKey) {
        setRemote({ ...coaching, ...result.data, metrics: coaching.metrics });
        setProvider(result.data.source === 'gemini' ? 'gemini' : 'fallback');
      } else setProvider('fallback');
    }).catch(() => { if (!cancelled) setProvider('fallback'); }).finally(() => clearTimeout(timeoutId));
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [session, coaching]);
  const displayed = remote || coaching;
  const alankar = ALANKARS.find((item) => item.id === session?.completion?.alankarId);
  const exercise = getExercise(session?.exerciseId);
  const providerKey = `coachingProvider${provider[0].toUpperCase()}${provider.slice(1)}`;
  return <div className="page results-page"><p className="eyebrow">{t.studioUi.completed}</p><h1>{t.results}</h1>
    {session && <section className="results-block"><h2>{textAt(t, alankar?.nameKey || exercise?.nameKey || 'exercises.saSustain.name')}</h2>
      {alankar && <p>{t[session.completion.direction]} · {session.completion.bpm} {t.bpm} · {session.completion.loops} {t.loops}</p>}
      <p>{session.completion?.reason === 'duration-complete' ? t.studioUi.finishedDuration : t.studioUi.finishedEarly}</p>
      {Number.isFinite(session.tonicFrequency) && <Metric label={t.tonic} value={`${session.tonicFrequency} Hz`} />}
      <Metric label={t.studioUi.activeTime} value={Number.isFinite(session.durationSeconds) ? timeLabel(session.durationSeconds * 1000) : t.studioUi.notMeasured} />
      {alankar && <p>{t.studioUi.countInNote}</p>}
      {(alankar || exercise?.limited) && <p className="notice">{alankar ? t.studioUi.alankarScope : t.studioUi.limited}</p>}
    </section>}
    {sufficient ? <>
      {saved === true && <p className="saved-note" role="status"><Check size={16} aria-hidden="true" />{t.studioUi.saved}</p>}
      {saved === false && <section className="notice warning" role="status"><div><p>{t.studioUi.unsaved}</p><button className="button" onClick={onSaveAgain}>{t.studioUi.saveAgain}</button></div></section>}
      <section className="results-block"><h2>{t.measurement}</h2>
        <Metric label={t.reliableMatch} value={measurement(session.metrics.reliablePitchMatchPercent, '%', t.studioUi.notMeasured)} />
        <Metric label={t.deviation} value={measurement(session.metrics.medianAbsoluteCents, ` ${t.cents}`, t.studioUi.notMeasured)} />
        <Metric label={t.stability} value={measurement(session.metrics.pitchStabilityCents, ` ${t.cents}`, t.studioUi.notMeasured)} />
        <Metric label={t.studioUi.evidence} value={`${session.metrics.reliableFrameCount} / ${session.metrics.totalFrameCount}`} />
        <p className="results-note">{t.studioUi.measuredOnly} {t.noHealthClaim}</p>
      </section>
      <section className="results-block coach-block"><p className="eyebrow">{provider === 'deterministic' ? t.studioUi.localCoach : `${t.coachingProvider}: ${t[providerKey]}`}</p>
        {/* Some coach messages and reasons are the same sentence; show it once. */}
        <h2>{textAt(t, displayed.messageKey)}</h2>{textAt(t, displayed.reasonKey) !== textAt(t, displayed.messageKey) && <p>{textAt(t, displayed.reasonKey)}</p>}<small>{t.coachingPrivacy}</small>
      </section>
    </> : <div className="notice" role="status"><div><p>{t.studioUi.insufficient}</p><p>{t.studioUi.evidencePolicy}</p></div></div>}
    <div className="top-actions">
      {onRoutine && <button className="button primary" onClick={onRoutine}>{t.dashboard.continueRoutine}</button>}
      {session && onRetry && <button className="button" onClick={onRetry}>{t.retry}</button>}
      {sufficient && onNext && <button className="button" onClick={onNext}>{t.studioUi.next}</button>}
      <button className="button quiet" onClick={onBack}>{t.studioUi.return}</button>
    </div>
  </div>;
}
