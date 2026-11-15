import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic2, Pause, Play, ShieldCheck } from 'lucide-react';
import { getAlankarBeatAt } from '@swarsadhak/practice-domain';
import { targetFrequency } from '@swarsadhak/musical-core';
import { createPracticeSession } from './practiceSession.js';
import { alankarSetup, livePitch, octaveKey, timeLabel } from './practiceSetup.js';
import { createBeatPlayer } from './beatPlayer.js';
import { AlankarPracticeDisplay } from './AlankarPracticeDisplay.jsx';
import { TanpuraPlayer } from './TanpuraPlayer.jsx';
import { TONICS } from './tonics.js';
import './practiceStudio.css';

const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;
const initial = { phase: 'idle', elapsedMs: 0, observation: null, error: null, outcome: null };
const isLocked = (phase) => ['requesting', 'running', 'paused'].includes(phase);

function usePracticeSession(config, onFinish) {
  const [state, setState] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    const timer = setInterval(() => controller.current?.tick(), 40);
    return () => { clearInterval(timer); controller.current?.dispose(); };
  }, []);
  const start = () => {
    if (controller.current && isLocked(controller.current.snapshot.phase)) return;
    controller.current?.dispose();
    controller.current = createPracticeSession({ ...config, onChange: setState, onComplete: (payload) => finishRef.current(payload) });
    void controller.current.start();
  };
  const cancel = () => { controller.current?.dispose(); controller.current = null; setState({ ...initial, outcome: 'cancelled' }); setAttempt((value) => value + 1); };
  return { state, attempt, start, cancel, pause: () => controller.current?.pause(), resume: () => controller.current?.resume(), finish: () => controller.current?.finish() };
}

export function SessionStatus({ t, state, countIn = false }) {
  const ui = t.studioUi;
  const label = { idle: t.ready, requesting: state.startedAt ? ui.updating : ui.requesting, running: countIn ? t.countInReady : t.activePractice, paused: t.paused, error: t.microphoneError, completed: ui.completed }[state.phase];
  const help = state.phase === 'error' ? (state.error === 'microphone-permission-denied' ? ui.permissionDenied : ui.audioError)
    : state.outcome === 'insufficient-audio' ? ui.insufficient
      : state.phase === 'requesting' && !state.startedAt ? ui.permissionHelp
        : state.phase === 'paused' ? ui.pausedHelp
          : state.outcome === 'cancelled' ? ui.stoppedHelp : state.phase === 'idle' ? ui.idleHelp : null;
  return <div className="session-status" role={state.phase === 'error' ? 'alert' : 'status'} aria-live="polite">
    <span className={`status-badge ${state.phase === 'error' ? 'error' : state.phase === 'running' ? 'success' : 'neutral'}`}>{label}</span>
    {help && <p>{help}</p>}
  </div>;
}

export function SessionControls({ t, session }) {
  const { state, start, pause, resume, finish, cancel } = session;
  const locked = isLocked(state.phase);
  return <div className="control-stack" aria-label={t.microphone}>
    {!locked && <button className="button primary wide" onClick={start}><Play size={17} aria-hidden="true" />{state.phase === 'idle' ? t.start : t.retry}</button>}
    {state.phase === 'requesting' && <button className="button wide" disabled>{state.startedAt ? t.studioUi.updating : t.studioUi.requesting}</button>}
    {state.phase === 'running' && <button className="button wide" onClick={pause}><Pause size={17} aria-hidden="true" />{t.pause}</button>}
    {state.phase === 'paused' && <button className="button primary wide" onClick={resume}><Play size={17} aria-hidden="true" />{t.resume}</button>}
    {['running', 'paused'].includes(state.phase) && <button className="button wide" onClick={finish}>{t.studioUi.finish}</button>}
    {locked && <button className="button quiet wide" onClick={cancel}>{t.studioUi.cancel}</button>}
  </div>;
}

export function PitchReadout({ t, state, target, tonic }) {
  const observation = state.phase === 'running' ? state.observation : null;
  const pitch = livePitch(observation, target, state.elapsedMs);
  const targetHz = target ? targetFrequency(target.swara, tonic) * 2 ** (target.octave ?? 0) : null;
  const guidance = pitch ? t.pitchFeedback[pitch.status] : observation?.clipped ? t.pitchFeedback.clipping
    : observation?.reason === 'silence' ? t.studioUi.silence : observation?.reason === 'low-confidence' ? t.pitchFeedback.lowConfidence : t.studioUi.waiting;
  return <section className="pitch-readout" aria-label={t.measurement}>
    <div className="pitch-target"><span>{t.pitchFeedback.target}</span><strong>{target ? t.swaras[target.swara] || target.swara : '—'}</strong>
      {target && <small>{t.pitchFeedback[octaveKey(target.octave)]} · {targetHz.toFixed(2)} Hz</small>}
    </div>
    <div className="pitch-actual"><span>{t.studioUi.actual}</span><strong>{pitch ? `${pitch.frequencyHz.toFixed(1)} Hz` : '—'}</strong>
      <small>{pitch ? `${Math.round(pitch.cents)} ${t.cents}` : t.studioUi.noReading}</small>
    </div>
    <p className={`pitch-guidance ${pitch?.status || ''}`}><Mic2 size={17} aria-hidden="true" />{state.phase === 'running' && target ? guidance : t.studioUi.noReading}</p>
  </section>;
}

function TonicControl({ t, tonic, setTonic, locked }) {
  return <label className="field-label">{t.tonic}<select disabled={locked} value={tonic} onChange={(event) => setTonic(Number(event.target.value))}>
    {TONICS.map((item) => <option key={item.value} value={item.value}>{textAt(t, item.labelKey)} · {item.value} Hz</option>)}
  </select></label>;
}

export function Practice({ t, exercise, tonic, setTonic, onFinish, onBack, durationSeconds = exercise.durationSeconds }) {
  const target = { swara: exercise.notes?.[0] || 'Sa', octave: 0 };
  const session = usePracticeSession({ tonic, exerciseId: exercise.id, durationMs: durationSeconds * 1000,
    toleranceCents: exercise.toleranceCents, targetAt: () => target,
    completion: { comparison: exercise.limited ? 'first-target-only' : 'single-target' } }, onFinish);
  const { state } = session;
  const locked = isLocked(state.phase);
  return <div className="page practice-page">
    <div className="practice-heading"><div><p className="eyebrow">{t.practice}</p><h1>{textAt(t, exercise.nameKey)}</h1><p className="page-lede">{textAt(t, exercise.descriptionKey)}</p></div></div>
    <SessionStatus t={t} state={state} />
    <div className="practice-grid">
      <section className="panel practice-studio">
        <div className="studio-header"><h2>{t.measurement}</h2><div className="elapsed"><span>{timeLabel(state.elapsedMs)} / {timeLabel(durationSeconds * 1000)}</span><small>{t.studioUi.activeTime}</small></div></div>
        <PitchReadout t={t} state={state} target={target} tonic={tonic} />
        <p className="evidence-note">{t.studioUi.evidencePolicy}</p>
        {exercise.limited && <p className="notice">{t.studioUi.limited}</p>}
      </section>
      <section className="panel practice-controls"><h2>{t.studioUi.setup}</h2>
        <h3>{t.studioUi.instructions}</h3><p>{textAt(t, exercise.instructionKey)}</p>
        <p>{t.studioUi.plannedTime}: {durationSeconds} {t.exerciseUi.seconds}</p>
        <TonicControl t={t} tonic={tonic} setTonic={setTonic} locked={locked} />
        {locked && <p className="evidence-note">{t.studioUi.settingsLocked}</p>}
        <SessionControls t={t} session={session} />
      </section>
    </div>
    {!['completed', 'error'].includes(state.phase) && <TanpuraPlayer key={session.attempt} t={t} tonic={tonic} setTonic={setTonic} settingsLocked={locked} />}
    <p className="studio-privacy"><ShieldCheck size={17} aria-hidden="true" />{t.privacy}</p>
    <button className="button quiet" onClick={onBack}>{t.studioUi.return}</button>
  </div>;
}

export function AlankarPractice({ t, pattern, tonic, setTonic, onFinish, onBack, durationSeconds, initialSettings }) {
  const [direction, setDirection] = useState(initialSettings?.direction || 'full');
  const [bpm, setBpm] = useState(initialSettings?.bpm || 60);
  const [loops, setLoops] = useState(initialSettings?.loops || 1);
  const [clickEnabled, setClickEnabled] = useState(true);
  const [clickError, setClickError] = useState(false);
  const setup = useMemo(() => alankarSetup(pattern, { direction, bpm, loops, durationSeconds }), [pattern, direction, bpm, loops, durationSeconds]);
  const { groups, octaveGroups, timeline, targetAt, durationMs, countInMs } = setup;
  const session = usePracticeSession({ tonic, exerciseId: 'sa-re-ga', durationMs, countInMs, targetAt,
    completion: { alankarId: pattern.id, direction, bpm: timeline.bpm, loops: timeline.loops, timeSignature: '4/4', countInBeats: timeline.countInBeats, practiceBeats: timeline.practiceBeats, comparison: 'timed-targets' } }, onFinish);
  const { state } = session;
  const locked = isLocked(state.phase);
  const beat = state.startedAt ? getAlankarBeatAt(state.elapsedMs, timeline) : { phase: 'idle' };
  const countIn = state.phase === 'running' && beat.phase === 'count-in';
  const beatPlayer = useRef(null);
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (state.phase !== 'running' || !clickEnabled) { beatPlayer.current?.stop(); if (!state.startedAt) lastBeat.current = -1; return; }
    if (beat.index === lastBeat.current || !['count-in', 'practice'].includes(beat.phase)) return;
    lastBeat.current = beat.index;
    beatPlayer.current ??= createBeatPlayer();
    if (!beatPlayer.current.play(beat.accent)) setClickError(true);
  }, [state.phase, state.startedAt, beat.index, clickEnabled]);
  useEffect(() => () => beatPlayer.current?.stop(), []);
  const practiceMs = Math.max(0, state.elapsedMs - countInMs);
  const progress = Math.min(100, Math.floor(practiceMs / Math.max(1, durationMs - countInMs) * 100));
  return <div className="page practice-page alankar-practice-page">
    <p className="eyebrow">{t.alankar.name}</p><h1>{textAt(t, pattern.nameKey)}</h1><p className="page-lede">{t.alankar.instruction}</p>
    <SessionStatus t={t} state={state} countIn={countIn} />
    <section className="panel"><h2>{t.studioUi.setup}</h2><div className="control-grid">
      <TonicControl t={t} tonic={tonic} setTonic={setTonic} locked={locked} />
      <label>{t.bpm}<input disabled={locked} type="number" min="20" max="240" step="1" value={bpm} onChange={(event) => setBpm(event.target.value)} onBlur={() => setBpm(timeline.bpm)} /></label>
      <label>{t.loops}<input disabled={locked} type="number" min="1" max="10" step="1" value={loops} onChange={(event) => setLoops(event.target.value)} onBlur={() => setLoops(timeline.loops)} /></label>
      <label>{t.direction}<select disabled={locked} value={direction} onChange={(event) => setDirection(event.target.value)}><option value="full">{t.full}</option><option value="aaroha">{t.aaroha}</option><option value="avaroha">{t.avaroha}</option></select></label>
    </div><p>{t.timeSignature}: {t.timeSignatureValue} · {timeline.bpm} {t.bpm} · {t.studioUi.plannedTime}: {timeLabel(durationMs - countInMs)}</p>
      {locked && <p className="evidence-note">{t.studioUi.settingsLocked}</p>}
      <label className="beat-toggle"><input type="checkbox" checked={clickEnabled} onChange={(event) => { setClickEnabled(event.target.checked); setClickError(false); }} />{t.studioUi.click}</label>
      {clickError && <p role="status">{t.studioUi.clickUnavailable}</p>}
    </section>
    <AlankarPracticeDisplay beat={beat} timeline={timeline} groups={groups} octaveGroups={octaveGroups} progress={progress} phase={countIn ? 'count-in' : state.phase} t={t} groupKey={`${pattern.id}-${direction}`} />
    <section className="panel"><h2>{t.measurement}</h2><p>{t.studioUi.activeTime}: {timeLabel(practiceMs)}</p>
      <PitchReadout t={t} state={state} target={state.startedAt ? targetAt(state.elapsedMs) : null} tonic={tonic} />
      <p>{t.studioUi.countInNote}</p><p className="evidence-note">{t.studioUi.evidencePolicy}</p><p className="notice">{t.studioUi.alankarScope}</p>
      <SessionControls t={t} session={session} />
    </section>
    {!['completed', 'error'].includes(state.phase) && <TanpuraPlayer key={session.attempt} t={t} tonic={tonic} setTonic={setTonic} settingsLocked={locked} />}
    <p className="studio-privacy"><ShieldCheck size={17} aria-hidden="true" />{t.privacy}</p>
    <button className="button quiet" onClick={onBack}>{t.backToAlankars}</button>
  </div>;
}
