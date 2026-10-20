import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ChevronRight, Home, Languages, Library, Menu, Music2, Pause, Play, Settings, Trophy } from 'lucide-react';
import { getTranslations, localeNames, supportedLocales } from '@swarsadhak/localization';
import { advanceElapsed, calculateMetrics, createAlankarTimeline, createSession, getAlankarBeatAt } from '@swarsadhak/practice-domain';
import { createStorage } from '@swarsadhak/persistence';
import { createAudioController } from '@swarsadhak/audio-engine';
import { frameToObservation } from '@swarsadhak/musical-core';
import { ALANKARS, EXERCISES, alankarDisplayGroups, alankarGroups, getExercise } from '@swarsadhak/exercises';
import { STARTER_ROUTINES, createRoutine, normalizeRoutine, routineItems, totalRoutineSeconds, nextRoutineIndex } from '@swarsadhak/routines';
import { deriveRewards, deriveAchievements, getLevel, getStreak, ACHIEVEMENTS } from '@swarsadhak/gamification';
import { deterministicCoach } from '@swarsadhak/ai-coach';
import { createApiClient } from '@swarsadhak/api-client';
import './styles.css';
import './optionalSync.js';
import { SaSustainFeedback } from './SaSustainFeedback.jsx';
import { TONICS } from './tonics.js';
import { AlankarList } from './AlankarList.jsx';
import { AlankarPracticeDisplay } from './AlankarPracticeDisplay.jsx';

const store = createStorage();
const KEYS = { sessions: 'swar-practice-sessions-v1', routines: 'swar-routines-v1', rewards: 'swar-reward-events-v1', streak: 'swar-streak-preferences-v1' };
const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;

function App() {
  const [locale, setLocale] = useState(() => localStorage.getItem('swar-locale') || 'en');
  const t = getTranslations(locale);
  const [route, setRoute] = useState('home');
  const [sessions, setSessions] = useState(() => store.get(KEYS.sessions, []));
  const [routines, setRoutines] = useState(() => store.get(KEYS.routines, STARTER_ROUTINES));
  const [rewards, setRewards] = useState(() => store.get(KEYS.rewards, []));
  const [selected, setSelected] = useState(EXERCISES[0]);
  const [selectedAlankar, setSelectedAlankar] = useState(ALANKARS[0]);
  const [tonic, setTonic] = useState(261.63);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [notice, setNotice] = useState('');
  const [streakEnabled, setStreakEnabled] = useState(() => store.get(KEYS.streak, true));
  const derivedRewards = useMemo(() => deriveRewards(sessions, rewards), [sessions, rewards]);
  const achievements = useMemo(() => deriveAchievements(sessions, derivedRewards), [sessions, derivedRewards]);
  const persist = (key, value) => { const result = store.set(key, value); if (!result.ok) setNotice(t.persistenceWarning); return result.ok; };
  const saveSession = (payload) => {
    const routine = activeRoutine?.current ? activeRoutine : null;
    const valid = payload.metrics?.reliableFrameCount > 0 && payload.completion?.completed === true;
    if (!valid) { setNotice(t.insufficientGuidance); return false; }
    const items = routine && routineItems(routine);
    const itemIndex = routine ? items.findIndex((item) => item.id === routine.current?.id) : -1;
    const routineCompleted = Boolean(routine && itemIndex === items.length - 1);
    const session = createSession({ schemaVersion: 1, id: `session-${Date.now()}`, ...payload, ...(routine ? { routineId: routine.id, routineItemId: routine.current.id, routineItemIndex: itemIndex, sectionType: routine.current.sectionType, routineCompleted } : {}) });
    const next = [...sessions, session];
    setSessions(next); persist(KEYS.sessions, next);
    const nextRewards = deriveRewards(next, rewards);
    setRewards(nextRewards); persist(KEYS.rewards, nextRewards);
    if (routine) {
      setActiveRoutine({ ...routine, completedIndex: itemIndex, routineCompleted });
      setRoute('routine');
    } else setRoute('results');
    return true;
  };
  const go = (nextRoute) => {
    if (activeRoutine && route === 'practice' && nextRoute !== 'routine' && nextRoute !== 'results' && !confirm(t.exitConfirm)) return;
    setRoute(nextRoute); setNotice('');
  };
  const clearHistory = () => { if (!confirm(t.clearConfirm)) return; setSessions([]); setRewards([]); persist(KEYS.sessions, []); persist(KEYS.rewards, []); };

  const navItems = [['home', Home], ['practice', Activity], ['library', Library], ['routines', Trophy], ['progress', Trophy], ['settings', Settings]];
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Music2 size={20} /></span>Swar<span>Sadhak</span></div><nav aria-label={t.nav}>{navItems.map(([key, Icon]) => <button className={`nav-item ${route === key ? 'active' : ''}`} key={key} onClick={() => go(key)}><Icon size={19} /><span>{key === 'routines' ? t.planner : (typeof t[key] === 'string' ? t[key] : key)}</span></button>)}</nav></aside>
    <main className="main-content"><header className="topbar"><button className="menu-button" aria-label={t.openMenu}><Menu size={22} /></button><div className="breadcrumbs">SwarSadhak <ChevronRight size={15} /><strong>{route === 'alankar-practice' ? t.alankarPracticeTitle : route === 'alankars' ? t.alankarListTitle : route}</strong></div><div className="language-picker"><Languages size={16} /><select value={locale} aria-label={t.language} onChange={(event) => { setLocale(event.target.value); localStorage.setItem('swar-locale', event.target.value); }}>{supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></div></header>
      {notice && <div className="notice" role="status">{notice}</div>}
      {route === 'home' && <HomePage t={t} sessions={sessions} onStart={() => go('practice')} onAlankar={() => go('alankars')} />}
      {route === 'practice' && <Practice t={t} exercise={selected} tonic={tonic} setTonic={setTonic} onFinish={saveSession} />}
      {route === 'results' && <Results t={t} session={sessions.at(-1)} onBack={() => go(sessions.at(-1)?.completion?.alankarId ? 'alankars' : 'home')} />}
      {(route === 'routines' || route === 'planner') && <PlannerWithAllControls t={t} routines={routines} setRoutines={setRoutines} onStart={(routine) => { setActiveRoutine(routine); go('routine'); }} />}
      {route === 'routine' && activeRoutine && <RoutineRun t={t} routine={activeRoutine} completedIndex={activeRoutine.completedIndex ?? -1} routineCompleted={activeRoutine.routineCompleted === true} onItem={(item) => { setSelected(getExercise(item.exerciseId)); setActiveRoutine({ ...activeRoutine, current: item }); go('practice'); }} onExit={() => { setActiveRoutine(null); go('routines'); }} />}
      {route === 'library' && <LibraryPage t={t} onChoose={(exercise) => { setSelected(exercise); go('practice'); }} onOpenAlankars={() => go('alankars')} />}
      {route === 'alankars' && <AlankarList t={t} onChoose={(pattern) => { setSelectedAlankar(pattern); go('alankar-practice'); }} onBack={() => go('library')} />}
      {route === 'alankar-practice' && <AlankarPractice t={t} pattern={selectedAlankar} tonic={tonic} setTonic={setTonic} onFinish={saveSession} onBack={() => go('alankars')} />}
      {route === 'progress' && <Progress t={t} sessions={sessions} rewards={derivedRewards} achievements={achievements} onClear={clearHistory} streakEnabled={streakEnabled} setStreakEnabled={(value) => { setStreakEnabled(value); persist(KEYS.streak, value); }} />}
      {route === 'settings' && <SettingsPage t={t} />}
    </main>
  </div>;
}

function HomePage({ t, sessions, onStart, onAlankar }) { return <div className="page"><p className="eyebrow">SWARSADHAK</p><h1>{t.greeting}</h1><p>{t.subtitle}</p><div className="top-actions"><button className="button primary" onClick={onStart}><Play size={17} />{t.start}</button><button className="button" onClick={onAlankar}>{t.alankar.name}</button></div><section className="panel"><h2>{t.recent}</h2><p>{sessions.length ? `${sessions.length} ${t.sessions.toLowerCase()}.` : t.empty}</p></section></div>; }

function Practice({ t, exercise, tonic, setTonic, onFinish }) {
  const [phase, setPhase] = useState('idle'); const [elapsed, setElapsed] = useState(0);
  const observations = useRef([]); const startRef = useRef(0); const active = useRef(0); const controller = useRef(null);
  useEffect(() => () => controller.current?.stop(), []);
  const start = async () => { observations.current = []; const audio = createAudioController({ onFrame: (frame) => observations.current.push({ ...frameToObservation(frame, tonic, { targetNote: exercise.notes?.[0] || 'Sa' }), timestamp: Date.now() }), onError: () => setPhase('error') }); controller.current = audio; const result = await audio.start(); if (!result.ok) { setPhase('error'); return; } startRef.current = performance.now(); setPhase('running'); };
  useEffect(() => { if (phase !== 'running') return undefined; const id = setInterval(() => setElapsed((performance.now() - startRef.current + active.current) / 1000), 250); return () => clearInterval(id); }, [phase]);
  const pause = () => { active.current += performance.now() - startRef.current; controller.current?.pause(); setPhase('paused'); };
  const resume = () => { startRef.current = performance.now(); controller.current?.resume(); setPhase('running'); };
  const finish = () => { if (phase === 'running') active.current += performance.now() - startRef.current; controller.current?.stop(); const metrics = calculateMetrics(observations.current, { toleranceCents: exercise.toleranceCents ?? 50, confidenceThreshold: .55 }); onFinish({ startedAt: new Date(Date.now() - active.current).toISOString(), endedAt: new Date().toISOString(), exerciseId: exercise.id, tonicFrequency: tonic, durationSeconds: active.current / 1000, reliableFrameCount: metrics.reliableFrameCount, totalFrameCount: metrics.totalFrameCount, metrics, quality: metrics.quality, completion: { completed: true, reason: 'finished' } }); setPhase('idle'); };
  return <div className="page"><p className="eyebrow">{t.practice}</p><h1>{textAt(t, exercise.nameKey)}</h1><label>{t.tonic}<select value={tonic} onChange={(event) => setTonic(Number(event.target.value))}>{TONICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p>{Math.round(elapsed)}s {t.activePractice}</p>{phase === 'error' && <div className="notice" role="alert">{t.microphoneError}</div>}{phase === 'paused' && <p className="notice">{t.paused}</p>}<div className="top-actions">{phase === 'idle' || phase === 'error' ? <button className="button primary" onClick={start}><Play size={17} />{t.start}</button> : phase === 'running' ? <button className="button" onClick={pause}><Pause size={17} />{t.pause}</button> : <button className="button primary" onClick={resume}><Play size={17} />{t.resume}</button>}{phase !== 'idle' && <button className="button" onClick={finish}>{t.complete}</button>}</div>{exercise.id === 'sa-sustain' && <SaSustainFeedback tonic={tonic} t={t} />}</div>;
}

function playBeat(accent) { const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AudioContext) return; const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = accent ? 880 : 660; gain.gain.setValueAtTime(.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .08); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .09); oscillator.addEventListener('ended', () => context.close(), { once: true }); }

function AlankarPractice({ t, pattern, tonic, setTonic, onFinish, onBack }) {
  const [direction, setDirection] = useState('full'); const [bpm, setBpm] = useState(60); const [loops, setLoops] = useState(1); const [phase, setPhase] = useState('idle'); const [elapsed, setElapsed] = useState(0); const [beat, setBeat] = useState({ phase: 'idle' });
  const groups = useMemo(() => alankarGroups(pattern, direction), [pattern, direction]); const octaveGroups = useMemo(() => alankarDisplayGroups(pattern, direction), [pattern, direction]); const timeline = useMemo(() => createAlankarTimeline({ groups, bpm, loops }), [groups, bpm, loops]);
  const observations = useRef([]); const controller = useRef(null); const startRef = useRef(0); const elapsedRef = useRef(0); const beatRef = useRef(beat); const lastBeatIndex = useRef(-1); const finished = useRef(false);
  useEffect(() => { beatRef.current = beat; }, [beat]); useEffect(() => () => controller.current?.stop(), []);
  const finish = (reason = 'finished') => { if (finished.current) return; finished.current = true; controller.current?.stop(); const metrics = calculateMetrics(observations.current, { toleranceCents: 50, confidenceThreshold: .55 }); onFinish({ startedAt: new Date(Date.now() - elapsedRef.current).toISOString(), endedAt: new Date().toISOString(), exerciseId: 'sa-re-ga', tonicFrequency: tonic, durationSeconds: elapsedRef.current / 1000, reliableFrameCount: metrics.reliableFrameCount, totalFrameCount: metrics.totalFrameCount, metrics, quality: metrics.quality, completion: { completed: true, reason, alankarId: pattern.id, direction, bpm: timeline.bpm, loops: timeline.loops, timeSignature: '4/4', countInBeats: timeline.countInBeats, practiceBeats: timeline.practiceBeats } }); setPhase('idle'); };
  const tick = () => { const now = performance.now(); const nextElapsed = advanceElapsed(elapsedRef.current, startRef.current, now); elapsedRef.current = nextElapsed; startRef.current = now; const nextBeat = getAlankarBeatAt(nextElapsed, timeline); beatRef.current = nextBeat; setElapsed(nextElapsed); setBeat(nextBeat); if (nextBeat.index !== lastBeatIndex.current && nextBeat.phase !== 'idle') { lastBeatIndex.current = nextBeat.index; playBeat(nextBeat.accent); } if (nextBeat.phase === 'complete') finish('completed'); };
  const start = async () => { observations.current = []; elapsedRef.current = 0; setElapsed(0); setBeat({ phase: 'idle' }); finished.current = false; lastBeatIndex.current = -1; const audio = createAudioController({ onFrame: (frame) => { const current = beatRef.current; if (current.phase !== 'practice') return; observations.current.push({ ...frameToObservation(frame, tonic, { targetNote: current.swara }), timestamp: Date.now(), groupIndex: current.groupIndex, groupBeatIndex: current.groupBeatIndex, loopIndex: current.loopIndex, targetSwara: current.swara, isSustain: current.isSustain }); }, onError: () => setPhase('error') }); controller.current = audio; const result = await audio.start(); if (!result.ok) { setPhase('error'); return; } startRef.current = performance.now(); setPhase('count-in'); };
  useEffect(() => { if (phase !== 'count-in' && phase !== 'running') return undefined; const id = setInterval(() => { if (phase === 'count-in' && getAlankarBeatAt(elapsedRef.current, timeline).phase === 'practice') setPhase('running'); tick(); }, 40); return () => clearInterval(id); }, [phase, timeline]);
  const pause = () => { elapsedRef.current += performance.now() - startRef.current; setElapsed(elapsedRef.current); controller.current?.pause(); setPhase('paused'); };
  const resume = () => { startRef.current = performance.now(); controller.current?.resume(); setPhase(getAlankarBeatAt(elapsedRef.current, timeline).phase === 'count-in' ? 'count-in' : 'running'); };
  const stop = () => { if (phase === 'running' || phase === 'count-in') elapsedRef.current += performance.now() - startRef.current; finish('finished'); };
  const progress = timeline.practiceBeats ? Math.min(100, Math.round(((beat.practiceIndex ?? -1) + 1) / timeline.practiceBeats * 100)) : 0;
  return <div className="page alankar-practice-page"><p className="eyebrow">{t.alankar.name}</p><h1>{textAt(t, pattern.nameKey)}</h1><p>{t.alankar.instruction}</p><div className="control-grid"><label>{t.tonic}<select disabled={phase !== 'idle'} value={tonic} onChange={(event) => setTonic(Number(event.target.value))}>{TONICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>{t.bpm}<input disabled={phase !== 'idle'} type="number" min="20" max="240" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><label>{t.loops}<input disabled={phase !== 'idle'} type="number" min="1" max="10" value={loops} onChange={(event) => setLoops(Number(event.target.value))} /></label><label>{t.direction}<select disabled={phase !== 'idle'} value={direction} onChange={(event) => setDirection(event.target.value)}><option value="full">{t.full}</option><option value="aaroha">{t.aaroha}</option><option value="avaroha">{t.avaroha}</option></select></label></div><p className="time-signature-note">{t.timeSignature}: {t.timeSignatureValue}</p>{phase === 'error' && <div className="notice" role="alert">{t.microphoneError}</div>}<AlankarPracticeDisplay beat={beat} timeline={timeline} groups={groups} octaveGroups={octaveGroups} progress={progress} phase={phase} t={t} groupKey={`${pattern.id}-${direction}`} /><div className="top-actions">{phase === 'idle' || phase === 'error' ? <button className="button primary" onClick={start}><Play size={17} />{t.startAlankar}</button> : phase === 'paused' ? <button className="button primary" onClick={resume}><Play size={17} />{t.resume}</button> : <button className="button" onClick={pause}><Pause size={17} />{t.pause}</button>}{phase !== 'idle' && <button className="button" onClick={stop}>{t.stop}</button>}</div><button className="button" onClick={onBack}>{t.backToAlankars}</button></div>;
}

function Results({ t, session, onBack }) {
  const coaching = useMemo(() => session ? deterministicCoach({ exerciseId: session.exerciseId, metrics: session.metrics, quality: session.quality }) : null, [session]);
  const [remote, setRemote] = useState(null); const [provider, setProvider] = useState('deterministic');
  useEffect(() => {
    let cancelled = false; if (!session) return undefined;
    const baseUrl = import.meta.env.VITE_API_URL || ''; const token = localStorage.getItem('swar-access-token');
    if (!baseUrl || !token) { setProvider(baseUrl && !token ? 'disabled' : 'unavailable'); return undefined; }
    const client = createApiClient({ baseUrl, token }); const request = client.coach.explain(session, localStorage.getItem('swar-locale') || 'en'); const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false }), 5000));
    Promise.race([request, timeout]).then((result) => { if (cancelled) return; if (result?.ok && result.data?.messageKey) { setRemote({ ...coaching, ...result.data, metrics: coaching.metrics }); setProvider(result.data.source === 'gemini' ? 'gemini' : 'fallback'); } else setProvider('fallback'); }).catch(() => { if (!cancelled) setProvider('fallback'); });
    return () => { cancelled = true; };
  }, [session, coaching]);
  const displayed = remote || coaching; const providerKey = `coachingProvider${provider[0].toUpperCase()}${provider.slice(1)}`;
  const alankarId = session?.completion?.alankarId; const alankar = ALANKARS.find((item) => item.id === alankarId);
  return <div className="page"><h1>{t.results}</h1>{session ? <><section className="panel"><h2>{alankar ? `${t.alankar.name} · ${textAt(t, alankar.nameKey)}` : session.exerciseId}</h2>{alankarId && <p>{t[session.completion.direction] || session.completion.direction} · {session.completion.bpm} {t.bpm} · {session.completion.loops} {t.loops}</p>}<Metric label={t.reliableMatch} value={`${session.metrics.reliablePitchMatchPercent ?? t.noAudio}%`} /><Metric label={t.deviation} value={`${Math.round(session.metrics.medianAbsoluteCents ?? 0)} ${t.cents}`} /><p>{t.noHealthClaim}</p></section><section className="panel" aria-live="polite"><p className="eyebrow">{t.coachingProvider}: {t[providerKey] || t.coachingProviderFallback}</p><h2>{textAt(t, displayed.messageKey)}</h2><p>{textAt(t, displayed.reasonKey)}</p><p><strong>{t.coachingEvidence}:</strong> {displayed.metrics.reliableFrameCount ?? 0} {t.frames}</p><small>{t.coachingPrivacy}</small></section></> : <p>{t.noAudio}</p>}<button className="button" onClick={onBack}>{alankarId ? t.backToAlankars : t.back}</button></div>;
}
function Metric({ label, value }) { return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>; }

function PlannerWithAllControls({ t, routines, setRoutines, onStart }) {
  const [routine, setRoutine] = useState(() => routines[0] || createRoutine()); const [error, setError] = useState('');
  const update = (fn) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => ({ ...section, items: section.items.map(fn) })) }));
  const add = (type) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => section.type === type ? { ...section, items: [...section.items, { id: `${type}-${Date.now()}`, exerciseId: EXERCISES[0].id, durationSeconds: 30 }] } : section) }));
  const move = (type, index, delta) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => { if (section.type !== type) return section; const items = [...section.items]; const target = index + delta; if (target < 0 || target >= items.length) return section; [items[index], items[target]] = [items[target], items[index]]; return { ...section, items }; }) }));
  const remove = (id) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => ({ ...section, items: section.items.filter((item) => item.id !== id) })) }));
  const save = () => { try { const normalized = normalizeRoutine(routine); const next = [...routines.filter((item) => item.id !== normalized.id), normalized]; const result = store.set(KEYS.routines, next); if (!result.ok) { setError(t.persistenceWarning); return null; } setRoutines(next); setRoutine(normalized); setError(''); return normalized; } catch (cause) { setError(cause.message); return null; } };
  return <div className="page"><h1>{t.routinesTitle}</h1><select value={routine.id} onChange={(event) => setRoutine(routines.find((item) => item.id === event.target.value) || routine)}>{routines.map((item) => <option key={item.id} value={item.id}>{textAt(t, item.nameKey)}</option>)}</select>{routine.sections.map((section) => <section className="panel" key={section.type}><h2>{textAt(t, section.titleKey)}</h2>{section.items.map((item, index) => <div className="routine-item" key={item.id}><select aria-label={t.exercise} value={item.exerciseId} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, exerciseId: event.target.value } : candidate)}>{EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{textAt(t, exercise.nameKey)}</option>)}</select><input aria-label={t.duration} type="number" min="10" max="900" value={item.durationSeconds} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, durationSeconds: Number(event.target.value) } : candidate)} /><button className="button" aria-label={t.moveUp} onClick={() => move(section.type, index, -1)}>{t.moveUp}</button><button className="button" aria-label={t.moveDown} onClick={() => move(section.type, index, 1)}>{t.moveDown}</button><button className="button" aria-label={`${t.remove}: ${textAt(t, getExercise(item.exerciseId)?.nameKey || 'exercises.saSustain.name')}`} onClick={() => remove(item.id)}>{t.remove}</button></div>)}<button className="button" onClick={() => add(section.type)}>{t.addExercise}</button></section>)}{error && <div className="notice" role="alert">{error}</div>}<p>{t.totalDuration}: {Math.ceil(totalRoutineSeconds(routine) / 60)} min</p><button className="button" onClick={save}>{t.saveRoutine}</button><button className="button primary" onClick={() => { const saved = save(); if (saved) onStart(saved); }}>{t.startRoutine}</button></div>;
}

function Planner({ t, routines, setRoutines, onStart }) { const [routine, setRoutine] = useState(() => routines[0] || createRoutine()); const [error, setError] = useState(''); const update = (fn) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => ({ ...section, items: section.items.map(fn) })) })); const add = (type) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => section.type === type ? { ...section, items: [...section.items, { id: `${type}-${Date.now()}`, exerciseId: EXERCISES[0].id, durationSeconds: 30 }] } : section) })); const save = () => { try { const normalized = normalizeRoutine(routine); const next = [...routines.filter((item) => item.id !== normalized.id), normalized]; setRoutines(next); store.set(KEYS.routines, next); setRoutine(normalized); setError(''); return normalized; } catch (cause) { setError(cause.message); return null; } }; return <div className="page"><h1>{t.routinesTitle}</h1><select value={routine.id} onChange={(event) => setRoutine(routines.find((item) => item.id === event.target.value) || routine)}>{routines.map((item) => <option key={item.id} value={item.id}>{textAt(t, item.nameKey)}</option>)}</select>{routine.sections.map((section) => <section className="panel" key={section.type}><h2>{textAt(t, section.titleKey)}</h2>{section.items.map((item, index) => <div className="routine-item" key={item.id}><select aria-label={t.exercise} value={item.exerciseId} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, exerciseId: event.target.value } : candidate)}>{EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{textAt(t, exercise.nameKey)}</option>)}</select><input aria-label={t.duration} type="number" min="10" max="900" value={item.durationSeconds} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, durationSeconds: Number(event.target.value) } : candidate)} /><button className="button" onClick={() => { const items = [...section.items]; if (index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]]; setRoutine((current) => ({ ...current, sections: current.sections.map((candidate) => candidate.type === section.type ? { ...candidate, items } : candidate) })); }}>{t.moveUp}</button></div>)}<button className="button" onClick={() => add(section.type)}>{t.addExercise}</button></section>)}{error && <div className="notice" role="alert">{error}</div>}<p>{t.totalDuration}: {totalRoutineSeconds(routine)}s</p><div className="top-actions"><button className="button" onClick={save}>{t.saveRoutine}</button><button className="button primary" onClick={() => { const saved = save(); if (saved) onStart(saved); }}>{t.startRoutine}</button></div></div>; }

function RoutineRun({ t, routine, onItem, onExit, completedIndex = -1, routineCompleted = false }) { const items = routineItems(routine); const [index, setIndex] = useState(nextRoutineIndex(routine.completedIndex ?? completedIndex, items.length)); const item = items[index]; if (!item || routineCompleted || index >= items.length) return <div className="page"><h1>{textAt(t, routine.nameKey)}</h1><p className="notice">{t.finishRoutine}</p><button className="button primary" onClick={onExit}>{t.back}</button></div>; return <div className="page"><h1>{textAt(t, routine.nameKey)}</h1><p role="status">{t.itemProgress}: {index + 1} / {items.length} · {textAt(t, `routineSections.${item.sectionType}`)}</p><section className="panel"><h2>{textAt(t, item.exercise.nameKey)}</h2><p>{item.durationSeconds}s</p><button className="button primary" onClick={() => onItem(item)}>{t.start}</button><button className="button" onClick={() => { const next = nextRoutineIndex(index, items.length); if (next < items.length) setIndex(next); else onExit(); }}>{t.skipItem}</button></section><button className="button" onClick={onExit}>{t.exitRoutine}</button></div>; }

function Progress({ t, sessions, rewards, achievements, onClear, streakEnabled, setStreakEnabled }) { const xp = rewards.reduce((sum, item) => sum + item.xp, 0); return <div className="page"><h1>{t.progressTitle}</h1><section className="stats-grid"><div className="stat-card"><strong>{xp}</strong><small>{t.xp}</small></div><div className="stat-card"><strong>{getLevel(xp).level}</strong><small>{t.levelLabel}</small></div><div className="stat-card"><strong>{getStreak(sessions, streakEnabled)}</strong><small>{streakEnabled ? t.streakOptional : t.streakOff}</small></div></section><p className="notice">{t.participationNotice}</p><label><input type="checkbox" checked={streakEnabled} onChange={(event) => setStreakEnabled(event.target.checked)} />{t.enableStreak}</label><section className="panel"><h2>{t.achievements}</h2>{ACHIEVEMENTS.map((achievement) => <div className="metric-row" key={achievement.id}><span><strong>{textAt(t, achievement.titleKey)}</strong><small>{textAt(t, achievement.descriptionKey)}</small></span><strong>{achievements.some((item) => item.id === achievement.id) ? '✓' : t.locked}</strong></div>)}</section><button className="button" onClick={onClear}>{t.clear}</button></div>; }
function LibraryPage({ t, onChoose, onOpenAlankars }) { return <div className="page"><h1>{t.libraryTitle}</h1><button className="alankar-hero" onClick={onOpenAlankars}><strong>{t.alankar.name}</strong><span>{t.alankar.description}</span><ChevronRight size={20} /></button>{EXERCISES.filter((exercise) => exercise.id !== 'sa-re-ga').map((exercise) => <button className="exercise-card" key={exercise.id} onClick={() => onChoose(exercise)}><strong>{textAt(t, exercise.nameKey)}</strong><span>{textAt(t, exercise.descriptionKey)}</span></button>)}</div>; }
function SettingsPage({ t }) { return <div className="page"><h1>{t.settingsTitle}</h1><section className="panel"><p>{t.privacy}</p><p>{t.participationNotice}</p></section></div>; }

createRoot(document.getElementById('root')).render(<App />);
