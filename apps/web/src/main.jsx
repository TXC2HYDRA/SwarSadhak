import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, BarChart3, ChevronRight, Home, Languages, Library, Play, Radio, Route, Search, Settings, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { getTranslations, localeNames, supportedLocales } from '@swarsadhak/localization';
import { createSession } from '@swarsadhak/practice-domain';
import { createStorage } from '@swarsadhak/persistence';
import { ALANKARS, EXERCISES, getExercise } from '@swarsadhak/exercises';
import { STARTER_ROUTINES, createRoutine, normalizeRoutine, routineItems, totalRoutineSeconds } from '@swarsadhak/routines';
import { deriveRewards, deriveAchievements, getLevel, getStreak, ACHIEVEMENTS } from '@swarsadhak/gamification';
import { recommend } from '@swarsadhak/recommendations';
import './styles.css';
import { AlankarList } from './AlankarList.jsx';
import { ThemeToggle } from './theme.jsx';
import { AppShell, Brand, BrandMark } from './AppShell.jsx';
import { pageFromPath, pagePath, showPath } from './router.js';
import { Practice, AlankarPractice } from './PracticeStudio.jsx';
import { Results } from './Results.jsx';
import { assessPracticeEvidence } from './practiceSession.js';
import { clearRoutineCurrent, completeRoutineItem, exerciseRoute, readPreference, routineRunState, skipRoutineItem, writePreference } from './navigation.js';

const store = createStorage();
const KEYS = { sessions: 'swar-practice-sessions-v1', routines: 'swar-routines-v1', rewards: 'swar-reward-events-v1', streak: 'swar-streak-preferences-v1' };
const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;

export { Brand };
// Sub-pages share their parent's URL and nav highlight; only parents can be opened from a link.
const PARENT = { results: 'practice', alankars: 'library', 'alankar-practice': 'library', planner: 'routines', routine: 'routines' };
const STUDIO_KEYS = ['home', 'practice', 'library', 'routines', 'progress', 'settings'];

// account/accountBar/pages come from AccountRoot when signed in; without them this is the offline studio.
// pages: [{ key, Icon, label(t), render(t, locale) }], rendered with this app's own language picker.
// home(t, locale, go): optional academy panel shown on Home under the practice hero.
export function App({ account = null, accountBar = null, pages = [], home = null } = {}) {
  const [locale, setLocale] = useState(() => readPreference('swar-locale', 'en') || 'en');
  const t = getTranslations(locale);
  const base = account ? 'student' : 'studio';
  const urlKeys = [...STUDIO_KEYS, ...pages.map((page) => page.key)];
  const [route, setRouteState] = useState(() => {
    const linked = pageFromPath(globalThis.location?.pathname, base, urlKeys, 'home');
    return linked !== 'home' || account || readPreference('swar-visited-v1', 'false') === 'true' || store.get(KEYS.sessions, []).length > 0 ? linked : 'landing';
  });
  const setRoute = (next) => { if (next !== 'landing') showPath(pagePath(base, PARENT[next] || next, 'home')); setRouteState(next); };
  const [sessions, setSessions] = useState(() => store.get(KEYS.sessions, []));
  const [routines, setRoutines] = useState(() => store.get(KEYS.routines, STARTER_ROUTINES));
  const [rewards, setRewards] = useState(() => store.get(KEYS.rewards, []));
  const [selected, setSelected] = useState(EXERCISES[0]);
  const [selectedAlankar, setSelectedAlankar] = useState(ALANKARS[0]);
  const [tonic, setTonic] = useState(261.63);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [notice, setNotice] = useState('');
  const [streakEnabled, setStreakEnabled] = useState(() => store.get(KEYS.streak, true));
  const [resultSaved, setResultSaved] = useState(null);
  const [retrySettings, setRetrySettings] = useState(null);
  useEffect(() => {
    document.documentElement.lang = supportedLocales.includes(locale) ? locale : 'en';
  }, [locale]);
  useEffect(() => {
    // Canonical URL for the opening page; Back/Forward re-open parent pages.
    // ponytail: Back skips the "leave this routine?" confirm; add a guard if people lose routine items that way.
    if (route !== 'landing') showPath(pagePath(base, PARENT[route] || route, 'home'), { replace: true });
    const onPop = () => setRouteState(pageFromPath(globalThis.location?.pathname, base, urlKeys, 'home'));
    globalThis.addEventListener?.('popstate', onPop);
    return () => globalThis.removeEventListener?.('popstate', onPop);
  }, [base]);
  const derivedRewards = useMemo(() => deriveRewards(sessions, rewards), [sessions, rewards]);
  const achievements = useMemo(() => deriveAchievements(sessions, derivedRewards), [sessions, derivedRewards]);
  const recommendation = useMemo(() => recommend(sessions.at(-1) || {}), [sessions]);
  const recommendedExercise = useMemo(() => getExercise(recommendation.exerciseId) || EXERCISES[0], [recommendation.exerciseId]);
  const level = useMemo(() => getLevel(derivedRewards.reduce((sum, item) => sum + item.xp, 0)), [derivedRewards]);
  const persist = (key, value) => { const result = store.set(key, value); const saved = result.ok && store.persistent; if (!saved) setNotice(t.persistenceWarning); else setNotice(''); return saved; };
  const saveSession = (payload) => {
    const routine = activeRoutine?.current ? activeRoutine : null;
    const valid = assessPracticeEvidence(payload.metrics).sufficient && payload.completion?.completed === true;
    if (!valid) { setNotice(t.insufficientGuidance); return false; }
    const items = routine && routineItems(routine);
    const itemIndex = routine ? items.findIndex((item) => item.id === routine.current?.id) : -1;
    const routineCompleted = Boolean(routine && itemIndex === items.length - 1);
    const session = createSession({ schemaVersion: 1, id: `session-${Date.now()}-${sessions.length}`, ...payload, ...(account ? { accountId: account.id } : {}), ...(routine ? { routineId: routine.id, routineItemId: routine.current.id, routineItemIndex: itemIndex, sectionType: routine.current.sectionType, routineCompleted } : {}) });
    const next = [...sessions, session];
    setSessions(next); setResultSaved(persist(KEYS.sessions, next));
    const nextRewards = deriveRewards(next, rewards);
    setRewards(nextRewards); persist(KEYS.rewards, nextRewards);
    if (routine) {
      setActiveRoutine(completeRoutineItem(routine, itemIndex));
    }
    setRoute(routine ? 'routine' : 'results');
    return true;
  };
  const go = (nextRoute, { routineItem } = {}) => {
    if (nextRoute === 'practice' && !routineItem) nextRoute = exerciseRoute(selected);
    if (nextRoute === route && !routineItem) return true;
    if (activeRoutine?.current && ['practice', 'alankar-practice'].includes(route) && nextRoute !== 'routine' && nextRoute !== 'results' && !confirm(t.exitConfirm)) return false;
    const saved = nextRoute === 'landing' || writePreference('swar-visited-v1', 'true');
    setActiveRoutine((routine) => routineItem ? { ...routine, current: routineItem } : clearRoutineCurrent(routine));
    setRoute(nextRoute); setNotice(saved ? '' : t.persistenceWarning);
    return true;
  };
  const changeLocale = (value) => {
    setLocale(value);
    if (!writePreference('swar-locale', value)) setNotice(t.persistenceWarning);
  };
  const chooseExercise = (exercise) => {
    setRetrySettings(null);
    const nextRoute = exerciseRoute(exercise);
    if (go(nextRoute) && nextRoute === 'practice') setSelected(exercise);
  };
  const retrySession = () => {
    const session = sessions.at(-1);
    if (!session) return;
    setTonic(session.tonicFrequency || tonic);
    const pattern = ALANKARS.find((item) => item.id === session.completion?.alankarId);
    if (pattern) { setSelectedAlankar(pattern); setRetrySettings(session.completion); go('alankar-practice'); }
    else chooseExercise(getExercise(session.exerciseId) || EXERCISES[0]);
  };
  const openRoutine = () => {
    const routine = activeRoutine || routines[0];
    if (routineRunState(routine).empty) { go('routines'); return; }
    setActiveRoutine(clearRoutineCurrent(routine));
    go('routine');
  };
  const clearHistory = () => { if (!confirm(t.clearConfirm)) return; setSessions([]); setRewards([]); persist(KEYS.sessions, []); persist(KEYS.rewards, []); };

  const navItems = [['home', Home], ...pages.map((page) => [page.key, page.Icon]), ['practice', Activity], ['library', Library], ['routines', Route], ['progress', BarChart3], ['settings', Settings]];
  const routeLabel = { home: t.home, practice: t.practice, results: t.results, library: t.library, alankars: t.alankarListTitle, 'alankar-practice': t.alankarPracticeTitle, routines: t.planner, planner: t.planner, routine: t.routineProgress, progress: t.progress, settings: t.settings }[route] || pages.find((page) => page.key === route)?.label(t) || t.home;
  if (route === 'landing') return <LandingPage t={t} locale={locale} onLocaleChange={changeLocale} onStart={() => go('home')} onExplore={() => go('library')} onNavigate={go} />;
  const items = navItems.map(([key, Icon]) => ({ key, Icon, label: key === 'routines' ? t.planner : pages.find((page) => page.key === key)?.label(t) ?? t[key] }));
  const tools = <><div className="language-picker"><Languages size={16} aria-hidden="true" /><select value={locale} aria-label={t.language} onChange={(event) => changeLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></div><ThemeToggle t={t} /></>;
  return <AppShell t={t} kicker={t.studio} items={items} active={PARENT[route] || route} focusKey={route} onNavigate={go} title={routeLabel} tools={tools} account={accountBar}>
        {notice && <div className="notice" role="status">{notice}</div>}
        {route === 'home' && <HomePage t={t} locale={locale} sessions={sessions} routines={routines} activeRoutine={activeRoutine} recommendation={recommendation} recommendedExercise={recommendedExercise} onStart={() => go('practice')} onSelectExercise={chooseExercise} onAlankar={() => chooseExercise(getExercise('sa-re-ga'))} onRoutine={openRoutine} onProgress={() => go('progress')} academy={home?.(t, locale, go)} />}
        {pages.map((page) => route === page.key && <React.Fragment key={page.key}>{page.render(t, locale)}</React.Fragment>)}
      {route === 'practice' && <Practice key={`${selected.id}-${activeRoutine?.current?.id || 'single'}`} t={t} exercise={selected} durationSeconds={activeRoutine?.current?.durationSeconds} tonic={tonic} setTonic={setTonic} onFinish={saveSession} onBack={() => go(activeRoutine?.current ? 'routine' : 'library')} />}
      {route === 'results' && <Results t={t} session={sessions.at(-1)} saved={resultSaved} onSaveAgain={() => { setResultSaved(persist(KEYS.sessions, sessions)); persist(KEYS.rewards, derivedRewards); }} onRetry={retrySession} onNext={() => chooseExercise(recommendedExercise)} onRoutine={sessions.at(-1)?.routineId && activeRoutine ? () => go('routine') : undefined} onBack={() => go(sessions.at(-1)?.completion?.alankarId ? 'alankars' : 'library')} />}
      {(route === 'routines' || route === 'planner') && <PlannerWithAllControls t={t} routines={routines} setRoutines={setRoutines} onStart={(routine) => { setActiveRoutine(routine); go('routine'); }} />}
        {route === 'routine' && activeRoutine && <RoutineRun t={t} routine={activeRoutine} onItem={(item) => { setRetrySettings(null); if (go(exerciseRoute(getExercise(item.exerciseId)), { routineItem: item })) setSelected(getExercise(item.exerciseId)); }} onSkip={() => setActiveRoutine(skipRoutineItem)} onExit={() => { setActiveRoutine(null); go('routines'); }} />}
        {route === 'library' && <LibraryPage t={t} onChoose={chooseExercise} onOpenAlankars={() => chooseExercise(getExercise('sa-re-ga'))} />}
      {route === 'alankars' && <AlankarList t={t} onChoose={(pattern) => { setSelectedAlankar(pattern); setRetrySettings(null); go('alankar-practice', { routineItem: activeRoutine?.current }); }} onBack={() => go(activeRoutine?.current ? 'routine' : 'library')} />}
      {route === 'alankar-practice' && <AlankarPractice key={selectedAlankar.id} t={t} pattern={selectedAlankar} initialSettings={retrySettings} durationSeconds={activeRoutine?.current?.durationSeconds} tonic={tonic} setTonic={setTonic} onFinish={saveSession} onBack={() => go(activeRoutine?.current ? 'routine' : 'alankars')} />}
       {route === 'progress' && <Progress t={t} sessions={sessions} rewards={derivedRewards} achievements={achievements} onClear={clearHistory} streakEnabled={streakEnabled} setStreakEnabled={(value) => { setStreakEnabled(value); persist(KEYS.streak, value); }} />}
        {route === 'settings' && <SettingsPage t={t} locale={locale} setLocale={changeLocale} />}
  </AppShell>;
}

function Surface({ children, className = '', ...props }) { return <section className={`panel ${className}`.trim()} {...props}>{children}</section>; }
function SectionHeader({ eyebrow, title, children }) { return <div className="section-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{children}</div>; }
function StatusBadge({ tone = 'neutral', icon: Icon = Radio, children }) { return <span className={`status-badge ${tone}`}><Icon size={14} aria-hidden="true" /><span>{children}</span></span>; }

export function LandingPage({ t, locale, onLocaleChange, onStart, onExplore, onNavigate }) {
  const f = t.landing.features; const st = t.landing.steps;
  const features = [[f.pitch, f.pitchDesc], [f.swara, f.swaraDesc], [f.routines, f.routinesDesc], [f.progress, f.progressDesc], [f.coaching, f.coachingDesc], [f.local, f.localDesc]];
  const steps = [[st.chooseTitle, st.chooseDesc], [st.tonicTitle, st.tonicDesc], [st.practiceTitle, st.practiceDesc], [st.reviewTitle, st.reviewDesc], [st.continueTitle, st.continueDesc]];
  return <div className="landing-shell">
    <header className="landing-nav"><button className="landing-brand" onClick={() => window.scrollTo(0, 0)} aria-label={t.brand.name}><span className="brand-mark"><BrandMark /></span><Brand t={t} /></button><nav aria-label={t.accessibility.publicNavigation}><a href="#features">{t.landing.featureTitle}</a><a href="#how-it-works">{t.landing.howTitle}</a><a href="#privacy">{t.landing.privacyTitle}</a></nav><div className="landing-nav-actions"><label className="landing-language"><Languages size={16} aria-hidden="true" /><span className="sr-only">{t.landing.languageLabel}</span><select aria-label={t.landing.languageLabel} value={locale} onChange={(event) => onLocaleChange(event.target.value)}>{supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></label><ThemeToggle t={t} /><button className="button primary" onClick={onStart}>{t.landing.start}<ArrowRight size={16} aria-hidden="true" /></button></div></header>
    <main>
      <section className="landing-hero">
        <h1>{t.landing.heroTitle}</h1>
        <p className="landing-hero-description">{t.landing.heroDescription}</p>
        <div className="landing-actions"><button className="button primary" onClick={onStart}><Play size={17} aria-hidden="true" />{t.landing.start}</button><button className="button quiet" onClick={onExplore}>{t.landing.explore}<ChevronRight size={16} aria-hidden="true" /></button></div>
        <p className="landing-privacy-note"><ShieldCheck size={16} aria-hidden="true" /> {t.landing.privacyNote}</p>
        {/* The held Sa: the studio's reference line, drawn once. Not a waveform; nothing on this page pretends to be audio. */}
        <div className="landing-sa-line" aria-hidden="true"><span>{t.swaras.Sa}</span></div>
      </section>
      <section className="landing-section" id="features"><div className="landing-section-heading"><h2>{t.landing.featureTitle}</h2><p>{t.landing.featureDescription}</p></div>
        <ul className="landing-features">{features.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ul></section>
      <section className="landing-section" id="how-it-works"><div className="landing-section-heading"><h2>{t.landing.howTitle}</h2><p>{t.landing.howDescription}</p></div>
        <ol className="landing-steps">{steps.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol></section>
      <section className="landing-section" id="privacy"><div className="landing-section-heading"><h2>{t.landing.privacyTitle}</h2><p>{t.landing.privacyDescription}</p></div>
        <ul className="landing-privacy">{Object.values(t.landing.privacyItems).map((item) => <li key={item}><ShieldCheck size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul></section>
    </main>
    <footer className="landing-footer"><div><div className="landing-brand"><span className="brand-mark"><BrandMark /></span><Brand t={t} /></div><h2>{t.landing.footerTitle}</h2><p>{t.landing.footerDescription}</p></div><nav aria-label={t.accessibility.publicNavigation}><button onClick={onStart}>{t.landing.footerStart}</button><button onClick={onExplore}>{t.landing.footerExercises}</button><button onClick={() => onNavigate('routines')}>{t.landing.footerRoutines}</button><button onClick={() => onNavigate('progress')}>{t.landing.footerProgress}</button><button onClick={() => onNavigate('settings')}>{t.landing.footerSettings}</button></nav></footer>
  </div>;
}

// Answers "what do I do next, when is my class, what is due" before anything else. academy: classes and work (signed in only).
export function HomePage({ t, locale = 'en', sessions, routines, activeRoutine, recommendation, recommendedExercise, onSelectExercise, onAlankar, onRoutine, onProgress, academy = null }) {
  const latest = sessions.at(-1);
  const routine = activeRoutine || routines[0];
  const routineState = routineRunState(routine);
  const routineAction = routineState.empty ? t.planner : routineState.completed ? t.finishRoutine : activeRoutine ? t.dashboard.continueRoutine : t.dashboard.startRoutine;
  const routineDescription = routineState.empty ? t.routinesEmpty : routineState.completed ? t.finishRoutine : activeRoutine ? `${t.dashboard.routineProgress}: ${routineState.index + 1} / ${routineState.items.length}` : textAt(t, routine.descriptionKey);
  const exerciseName = textAt(t, recommendedExercise.nameKey);
  const match = latest?.metrics?.reliablePitchMatchPercent;
  return <div className="page home-page">
    <header className="home-head"><h1>{t.portal.student.today}</h1><p className="home-date">{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></header>
    <div className={`home-grid${academy ? '' : ' is-offline'}`}>
      <section className="home-next" aria-labelledby="next-title">
        <p className="home-label">{t.dashboard.nextAction}</p>
        <h2 id="next-title">{exerciseName}</h2>
        <p>{textAt(t, recommendation.reasonKey)}</p>
        {sessions.length === 1 && <small className="honest-note">{t.dashboard.smallSample}</small>}
        <div className="home-actions"><button className="button primary" aria-label={`${t.start}: ${exerciseName}`} onClick={() => onSelectExercise(recommendedExercise)}><Play size={16} aria-hidden="true" />{t.start}</button><button className="button quiet" onClick={onAlankar}>{t.alankar.name}<ChevronRight size={16} aria-hidden="true" /></button></div>
      </section>
      {academy}
      <section className="home-routine" aria-labelledby="routine-title">
        <h2 id="routine-title">{routine ? textAt(t, routine.nameKey) : t.planner}</h2>
        <p>{routineDescription}</p>
        <button className="button" onClick={onRoutine}>{routineAction}</button>
      </section>
      <section className="home-recent" aria-labelledby="recent-title">
        <h2 id="recent-title">{t.dashboard.recentSummary}</h2>
        {latest ? <dl className="home-facts">
          <div><dt>{t.dashboard.lastExercise}</dt><dd>{textAt(t, getExercise(latest.exerciseId)?.nameKey || 'exercises.saSustain.name')}</dd></div>
          <div><dt>{t.dashboard.sessionsCompleted}</dt><dd>{sessions.length}</dd></div>
          <div><dt>{t.reliableMatch}</dt><dd>{match == null ? t.noAudio : `${match}%`}</dd></div>
        </dl> : <p>{t.empty}</p>}
        <button className="button quiet" onClick={onProgress}>{t.progress}<ChevronRight size={16} aria-hidden="true" /></button>
      </section>
    </div>
    <p className="dashboard-privacy-note"><ShieldCheck size={16} aria-hidden="true" /><span>{t.privacy}</span></p>
  </div>;
}

function PlannerWithAllControls({ t, routines, setRoutines, onStart }) {
  const [routine, setRoutine] = useState(() => routines[0] || createRoutine()); const [error, setError] = useState('');
  const update = (fn) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => ({ ...section, items: section.items.map(fn) })) }));
  const add = (type) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => section.type === type ? { ...section, items: [...section.items, { id: `${type}-${Date.now()}`, exerciseId: EXERCISES[0].id, durationSeconds: 30 }] } : section) }));
  const move = (type, index, delta) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => { if (section.type !== type) return section; const items = [...section.items]; const target = index + delta; if (target < 0 || target >= items.length) return section; [items[index], items[target]] = [items[target], items[index]]; return { ...section, items }; }) }));
  const remove = (id) => setRoutine((current) => ({ ...current, sections: current.sections.map((section) => ({ ...section, items: section.items.filter((item) => item.id !== id) })) }));
  const save = () => { try { const normalized = normalizeRoutine(routine); const next = [...routines.filter((item) => item.id !== normalized.id), normalized]; const result = store.set(KEYS.routines, next); if (!result.ok) { setError(t.persistenceWarning); return null; } setRoutines(next); setRoutine(normalized); setError(''); return normalized; } catch (cause) { setError(cause.message); return null; } };
  return <div className="page"><h1>{t.routinesTitle}</h1><select value={routine.id} onChange={(event) => setRoutine(routines.find((item) => item.id === event.target.value) || routine)}>{routines.map((item) => <option key={item.id} value={item.id}>{textAt(t, item.nameKey)}</option>)}</select>{routine.sections.map((section) => <section className="panel" key={section.type}><h2>{textAt(t, section.titleKey)}</h2>{section.items.map((item, index) => <div className="routine-item" key={item.id}><select aria-label={t.exercise} value={item.exerciseId} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, exerciseId: event.target.value } : candidate)}>{EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{textAt(t, exercise.nameKey)}</option>)}</select><input aria-label={t.duration} type="number" min="10" max="900" value={item.durationSeconds} onChange={(event) => update((candidate) => candidate.id === item.id ? { ...candidate, durationSeconds: Number(event.target.value) } : candidate)} /><button className="button" aria-label={t.moveUp} onClick={() => move(section.type, index, -1)}>{t.moveUp}</button><button className="button" aria-label={t.moveDown} onClick={() => move(section.type, index, 1)}>{t.moveDown}</button><button className="button" aria-label={`${t.remove}: ${textAt(t, getExercise(item.exerciseId)?.nameKey || 'exercises.saSustain.name')}`} onClick={() => remove(item.id)}>{t.remove}</button></div>)}<button className="button" onClick={() => add(section.type)}>{t.addExercise}</button></section>)}{error && <div className="notice" role="alert">{error}</div>}<p>{t.totalDuration}: {Math.ceil(totalRoutineSeconds(routine) / 60)} min</p><button className="button" onClick={save}>{t.saveRoutine}</button><button className="button primary" onClick={() => { const saved = save(); if (saved) onStart(saved); }}>{t.startRoutine}</button></div>;
}


export function RoutineRun({ t, routine, onItem, onSkip, onExit }) {
  const { items, index, item, empty } = routineRunState(routine);
  if (!item) return <div className="page"><h1>{textAt(t, routine.nameKey)}</h1><p className="notice">{empty ? t.routinesEmpty : t.finishRoutine}</p><button className="button primary" onClick={onExit}>{t.back}</button></div>;
  return <div className="page"><h1>{textAt(t, routine.nameKey)}</h1><p role="status">{t.itemProgress}: {index + 1} / {items.length} · {textAt(t, `routineSections.${item.sectionType}`)}</p><section className="panel"><h2>{textAt(t, item.exercise.nameKey)}</h2><p>{item.durationSeconds}s</p><button className="button primary" onClick={() => onItem(item)}>{t.start}</button><button className="button" onClick={onSkip}>{t.skipItem}</button></section><button className="button" onClick={onExit}>{t.exitRoutine}</button></div>;
}

function Progress({ t, sessions, rewards, achievements, onClear, streakEnabled, setStreakEnabled }) { const xp = rewards.reduce((sum, item) => sum + item.xp, 0); return <div className="page"><h1>{t.progressTitle}</h1><section className="stats-grid"><div className="stat-card"><strong>{xp}</strong><small>{t.xp}</small></div><div className="stat-card"><strong>{getLevel(xp).level}</strong><small>{t.levelLabel}</small></div><div className="stat-card"><strong>{getStreak(sessions, streakEnabled)}</strong><small>{streakEnabled ? t.streakOptional : t.streakOff}</small></div></section><p className="notice">{t.participationNotice}</p><label><input type="checkbox" checked={streakEnabled} onChange={(event) => setStreakEnabled(event.target.checked)} />{t.enableStreak}</label><section className="panel"><h2>{t.achievements}</h2>{ACHIEVEMENTS.map((achievement) => <div className="metric-row" key={achievement.id}><span><strong>{textAt(t, achievement.titleKey)}</strong><small>{textAt(t, achievement.descriptionKey)}</small></span><strong>{achievements.some((item) => item.id === achievement.id) ? '✓' : t.locked}</strong></div>)}</section><button className="button" onClick={onClear}>{t.clear}</button></div>; }
function exerciseGoalKey(exercise) { if (exercise.id === 'sa-sustain') return 'goalSa'; if (exercise.id === 'ascending-sargam') return 'goalSequence'; return 'goalAlankar'; }
function LibraryPage({ t, onChoose, onOpenAlankars }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const exercises = EXERCISES.filter((exercise) => exercise.id !== 'sa-re-ga').filter((exercise) => level === 'all' || String(exercise.level) === level).filter((exercise) => `${textAt(t, exercise.nameKey)} ${textAt(t, exercise.descriptionKey)} ${t.exerciseUi[exerciseGoalKey(exercise)]}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page library-page"><div className="page-heading"><div><p className="eyebrow"><Library size={15} aria-hidden="true" /> {t.library}</p><h1>{t.libraryTitle}</h1><p className="page-lede">{t.landing.featureDescription}</p></div></div><button className="alankar-hero" onClick={onOpenAlankars}><span className="feature-icon"><Sparkles size={20} aria-hidden="true" /></span><div><strong>{t.alankar.name}</strong><span>{t.alankar.description}</span></div><ChevronRight size={20} aria-hidden="true" /></button><Surface className="library-filters"><div className="filter-heading"><strong>{t.exerciseUi.filter}</strong><button className="button quiet" onClick={() => { setQuery(''); setLevel('all'); }}>{t.exerciseUi.clearFilters}</button></div><div className="filter-controls"><label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">{t.exerciseUi.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.exerciseUi.searchPlaceholder} aria-label={t.exerciseUi.search} /></label><label className="field-label"><span className="sr-only">{t.exerciseUi.difficulty}</span><select aria-label={t.exerciseUi.difficulty} value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">{t.exerciseUi.allLevels}</option><option value="1">{t.exerciseUi.beginner}</option><option value="2">{t.exerciseUi.intermediate}</option></select></label></div></Surface>{exercises.length ? <div className="exercise-list">{exercises.map((exercise) => <button className="exercise-card" key={exercise.id} onClick={() => onChoose(exercise)}><span className="exercise-card-icon"><Target size={19} aria-hidden="true" /></span><div className="exercise-card-content"><strong>{textAt(t, exercise.nameKey)}</strong><span>{textAt(t, exercise.descriptionKey)}</span><div className="exercise-meta"><small>{t.exerciseUi.difficulty}: {exercise.level === 1 ? t.exerciseUi.beginner : t.exerciseUi.intermediate}</small><small>{t.exerciseUi.duration}: {exercise.durationSeconds} {t.exerciseUi.seconds}</small><small>{t.exerciseUi.goal}: {t.exerciseUi[exerciseGoalKey(exercise)]}</small>{exercise.limited && <small className="limited-label">{t.exerciseUi.limited}</small>}</div></div><ArrowRight size={19} aria-hidden="true" /></button>)}</div> : <div className="empty-state panel"><Search size={23} aria-hidden="true" /><p>{t.exerciseUi.noResults}</p></div>}</div>;
}
function SettingsPage({ t, locale, setLocale }) { return <div className="page settings-page"><div className="page-heading"><div><p className="eyebrow"><Settings size={15} aria-hidden="true" /> {t.settings}</p><h1>{t.settingsTitle}</h1><p className="page-lede">{t.privacy}</p></div></div><Surface className="settings-panel"><SectionHeader title={t.language} /><label className="field-label">{t.language}<select value={locale} aria-label={t.language} onChange={(event) => setLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></label></Surface></div>; }
