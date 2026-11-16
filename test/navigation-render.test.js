import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getTranslations } from '@swarsadhak/localization';
import { ALANKARS, getExercise } from '@swarsadhak/exercises';
import { STARTER_ROUTINES, createRoutine, routineItems } from '@swarsadhak/routines';
import { routineRunState } from '../apps/web/src/navigation.js';

let server;
let App;
let HomePage;
let RoutineRun;
let createHarness;
let failReads = false;
let failWrites = false;
const values = new Map();
const storage = {
  getItem(key) { if (failReads) throw new Error('blocked'); return values.get(key) ?? null; },
  setItem(key, value) { if (failWrites) throw new Error('quota'); values.set(key, value); },
};
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const previousConfirm = globalThis.confirm;
const t = getTranslations('en');
const validSession = {
  exerciseId: 'sa-sustain', startedAt: '2026-01-01T00:00:00.000Z', durationSeconds: 30,
  metrics: { reliableFrameCount: 30, reliablePitchMatchPercent: 95, medianAbsoluteCents: 10, timedReliableFrameCount: 30, reliableSpanMs: 1200, reliableTimestampsMonotonic: true },
  completion: { completed: true, reason: 'finished' },
};

before(async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const mainPath = fileURLToPath(new URL('../apps/web/src/main.jsx', import.meta.url));
  // Exercise App's real callbacks and state transitions without installing a DOM.
  // Only hooks in main.jsx are replaced; HomePage/RoutineRun also get real SSR below.
  server = await createServer({
    root: fileURLToPath(new URL('../apps/web', import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    plugins: [{
      name: 'navigation-state-harness', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:navigation-hooks') return '\0navigation-hooks'; },
      load(id) {
        if (id !== '\0navigation-hooks') return;
        return `
          let active;
          export function createHarness(Component) {
            const state = [];
            return () => {
              active = { state, cursor: 0 };
              try { return Component(); } finally { active = null; }
            };
          }
          export function useState(initial) {
            const { state } = active;
            const index = active.cursor++;
            if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
            return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
          }
          export const useMemo = (compute) => compute();
          export const useEffect = () => {};
          export const useRef = (value) => useState({ current: value })[0];
        `;
      },
      transform(code, id) {
        if (id !== mainPath) return;
        return code.replace(/import React, \{([^}]+)\} from 'react';/, "import React from 'react'; import {$1} from 'virtual:navigation-hooks';")
          .replace("import './optionalSync.js';", '');
      },
    }],
  });
  ({ App, HomePage, RoutineRun } = await server.ssrLoadModule('/src/main.jsx'));
  ({ createHarness } = await server.ssrLoadModule('virtual:navigation-hooks'));
});
after(async () => {
  await server?.close();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
  if (previousConfirm) globalThis.confirm = previousConfirm;
  else delete globalThis.confirm;
});
beforeEach(() => {
  values.clear(); values.set('swar-visited-v1', 'true');
  failReads = false; failWrites = false;
  globalThis.confirm = () => true;
});

function elements(tree) {
  return React.Children.toArray(tree).flatMap((node) => React.isValidElement(node) ? [node, ...elements(node.props.children)] : []);
}
function component(tree, name) {
  const result = elements(tree).find((node) => node.type?.name === name);
  assert.ok(result, `Expected ${name}`);
  return result;
}
// The shared AppShell renders the nav from its items; drive it the way a click would.
function navigate(tree, label) {
  const shell = component(tree, 'AppShell');
  const item = shell.props.items.find((entry) => entry.label === label);
  assert.ok(item, `Expected navigation to ${label}`);
  shell.props.onNavigate(item.key);
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const homeProps = (activeRoutine) => ({ t, sessions: [], routines: [STARTER_ROUTINES[0]], activeRoutine, rewards: [], achievements: [], level: { level: 1 }, recommendation: { reasonKey: 'recommendations.noReliableAudio' }, recommendedExercise: getExercise('sa-sustain') });
function startRoutine(app) {
  component(app(), 'HomePage').props.onRoutine();
  const run = component(app(), 'RoutineRun');
  run.props.onItem(routineRunState(run.props.routine).item);
}

test('dashboard and routine render the same next item after completion and skips', () => {
  for (const nextIndex of [undefined, 2]) {
    const routine = { ...STARTER_ROUTINES[0], completedIndex: 0, nextIndex, current: routineItems(STARTER_ROUTINES[0])[0] };
    const expected = nextIndex === 2 ? '3 / 3' : '2 / 3';
    assert.ok(render(HomePage, homeProps(routine)).includes(`${t.dashboard.routineProgress}: ${expected}`));
    assert.ok(render(RoutineRun, { t, routine }).includes(`${t.itemProgress}: ${expected}`));
  }
});

test('completed and empty routines render explicit states rather than impossible item counts', () => {
  for (const routine of [{ ...STARTER_ROUTINES[0], completedIndex: 2 }, { ...STARTER_ROUTINES[0], nextIndex: 3 }, { ...STARTER_ROUTINES[0], routineCompleted: true }, createRoutine()]) {
    const empty = routineRunState(routine).empty;
    const home = render(HomePage, homeProps(routine));
    const run = render(RoutineRun, { t, routine });
    assert.ok(home.includes(empty ? t.routinesEmpty : t.finishRoutine));
    assert.ok(run.includes(empty ? t.routinesEmpty : t.finishRoutine));
    assert.ok(!home.includes(`${t.dashboard.routineProgress}:`));
    assert.ok(!run.includes(`${t.itemProgress}:`));
    assert.ok(!run.includes(t.skipItem));
  }
  assert.ok(render(HomePage, { ...homeProps(null), routines: [] }).includes(t.routinesEmpty));
});

test('blocked visited writes never prevent landing, sidebar, or locale navigation', () => {
  failReads = true; failWrites = true;
  const app = createHarness(App);
  let landing = component(app(), 'LandingPage');
  assert.equal(landing.props.locale, 'en');
  landing.props.onLocaleChange('mr');
  landing = component(app(), 'LandingPage');
  assert.equal(landing.props.locale, 'mr');
  landing.props.onLocaleChange('en');
  component(app(), 'LandingPage').props.onStart();
  component(app(), 'HomePage');
  assert.ok(elements(app()).some((node) => node.props.role === 'status' && node.props.children === t.persistenceWarning));
  navigate(app(), t.library);
  component(app(), 'LibraryPage');
  navigate(app(), t.settings);
  component(app(), 'SettingsPage').props.setLocale('hi');
  assert.equal(component(app(), 'SettingsPage').props.locale, 'hi');
  const picker = elements(component(app(), 'AppShell').props.tools).find((node) => node.type === 'select' && node.props.value === 'hi');
  picker.props.onChange({ target: { value: 'en' } });
  assert.equal(component(app(), 'SettingsPage').props.locale, 'en');
});

test('dashboard recommendation and library alankar entry open the real pattern picker', () => {
  values.set('swar-practice-sessions-v1', JSON.stringify([{ ...validSession, id: 'seed' }]));
  const app = createHarness(App);
  const home = component(app(), 'HomePage');
  assert.equal(home.props.recommendedExercise.id, 'sa-re-ga');
  const recommendationButton = elements(HomePage(home.props)).find((node) => node.type === 'button' && node.props['aria-label']?.startsWith(`${t.start}:`));
  recommendationButton.props.onClick();
  component(app(), 'AlankarList');
  navigate(app(), t.library);
  component(app(), 'LibraryPage').props.onOpenAlankars();
  component(app(), 'AlankarList');
  navigate(app(), t.library);
  component(app(), 'LibraryPage').props.onChoose(getExercise('ascending-sargam'));
  assert.equal(component(app(), 'Practice').props.exercise.id, 'ascending-sargam');
});

test('finishing, leaving, skipping and reentering keep dashboard and routine progress aligned', () => {
  const app = createHarness(App);
  startRoutine(app);
  assert.equal(component(app(), 'Practice').props.onFinish(validSession), true);
  let run = component(app(), 'RoutineRun');
  assert.equal(run.props.routine.current, null);
  assert.equal(routineRunState(run.props.routine).index, 1);
  navigate(app(), t.home);
  let home = component(app(), 'HomePage');
  assert.ok(render(HomePage, home.props).includes(`${t.dashboard.routineProgress}: 2 / 3`));
  home.props.onStart();
  assert.equal(component(app(), 'Practice').props.onFinish(validSession), true);
  const standalone = component(app(), 'Results').props.session;
  assert.equal(standalone.routineId, undefined);
  assert.equal(standalone.routineItemId, undefined);
  navigate(app(), t.home);
  component(app(), 'HomePage').props.onRoutine();
  run = component(app(), 'RoutineRun');
  assert.equal(routineRunState(run.props.routine).index, 1);
  const skipButton = elements(RoutineRun(run.props)).find((node) => node.type === 'button' && node.props.children === t.skipItem);
  skipButton.props.onClick();
  navigate(app(), t.home);
  home = component(app(), 'HomePage');
  assert.ok(render(HomePage, home.props).includes(`${t.dashboard.routineProgress}: 3 / 3`));
  home.props.onRoutine();
  run = component(app(), 'RoutineRun');
  assert.equal(routineRunState(run.props.routine).index, 2);
  assert.equal(run.props.routine.completedIndex, 0);
  run.props.onSkip();
  navigate(app(), t.home);
  home = component(app(), 'HomePage');
  assert.ok(render(HomePage, home.props).includes(t.finishRoutine));
  home.props.onRoutine();
  run = component(app(), 'RoutineRun');
  assert.equal(routineRunState(run.props.routine).item, null);
  assert.equal(JSON.parse(values.get('swar-practice-sessions-v1')).length, 2);
});

test('leaving an unfinished routine clears attribution for standalone alankars but preserves resume', () => {
  const app = createHarness(App);
  startRoutine(app);
  globalThis.confirm = () => false;
  navigate(app(), t.library);
  component(app(), 'Practice');
  globalThis.confirm = () => true;
  navigate(app(), t.library);
  component(app(), 'LibraryPage').props.onOpenAlankars();
  component(app(), 'AlankarList').props.onChoose(ALANKARS[0]);
  component(app(), 'AlankarPractice').props.onFinish({ ...validSession, exerciseId: 'sa-re-ga', completion: { completed: true, alankarId: ALANKARS[0].id } });
  assert.equal(component(app(), 'Results').props.session.routineId, undefined);
  navigate(app(), t.home);
  const home = component(app(), 'HomePage');
  assert.equal(home.props.activeRoutine.current, null);
  assert.equal(routineRunState(home.props.activeRoutine).index, 0);
  home.props.onRoutine();
  const run = component(app(), 'RoutineRun');
  run.props.onItem(routineRunState(run.props.routine).item);
  component(app(), 'Practice').props.onFinish(validSession);
  const saved = JSON.parse(values.get('swar-practice-sessions-v1')).at(-1);
  assert.equal(saved.routineId, STARTER_ROUTINES[0].id);
  assert.equal(saved.routineItemIndex, 0);
});

test('missing and empty dashboard routines open the planner instead of a blank runner', () => {
  for (const routines of [[], [createRoutine()]]) {
    values.set('swar-routines-v1', JSON.stringify(routines));
    const app = createHarness(App);
    component(app(), 'HomePage').props.onRoutine();
    component(app(), 'PlannerWithAllControls');
  }
});
