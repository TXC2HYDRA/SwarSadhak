import React from 'react';
import { SwaraLabel } from './SwaraLabel.jsx';

export function AlankarPracticeDisplay({ beat, timeline, groups, octaveGroups = groups.map((group) => group.map((swara) => ({ swara, octave: 'middle' }))), progress, phase, t, groupKey }) {
  const practiceBeat = beat.phase === 'practice' ? beat : null;
  const beatSwaraIndex = (groupLength, groupBeatIndex) => groupLength === 1 ? 0 : groupLength === 2 ? Math.floor(groupBeatIndex / 2) : Math.min(groupBeatIndex, 2);
  const currentSwara = practiceBeat ? octaveGroups[practiceBeat.groupIndex]?.[beatSwaraIndex(octaveGroups[practiceBeat.groupIndex]?.length ?? 1, practiceBeat.groupBeatIndex)] : null;
  // Beat ruler: the four beats of the 4/4 bar, with the first (sam) drawn heavier; it advances one beat at a time.
  const tick = phase === 'count-in' ? beat.countInBeat || 1 : practiceBeat ? practiceBeat.beatInBar : 0;
  return <section className="alankar-live">
    <div className="live-metrics">
      <div><small>{phase === 'count-in' ? t.countIn : t.activePractice}</small><strong>{phase === 'count-in' ? `${t.countInBeat} ${beat.countInBeat || 1} / ${timeline.countInBeats}` : (practiceBeat?.accent ? `♩ ${t.beat} 1` : `${t.beat} ${practiceBeat ? practiceBeat.beatInBar : 1}`)}</strong></div>
      <div><small>{t.currentSwara}</small><strong>{currentSwara ? <SwaraLabel t={t} {...currentSwara} /> : '—'}</strong></div>
      <div><small>{t.progress}</small><strong>{progress}%</strong></div>
    </div>
    <ol className={`beat-ruler${phase === 'count-in' ? ' is-count-in' : ''}`} aria-hidden="true">{[1, 2, 3, 4].map((n) => <li key={n} className={n === tick ? 'is-on' : undefined}>{n}</li>)}</ol>
    <div className="group-strip">{octaveGroups.map((group, index) => <span className={practiceBeat?.groupIndex === index ? 'active' : ''} key={`${groupKey}-${index}`}>{group.map((note, noteIndex) => <React.Fragment key={noteIndex}><SwaraLabel t={t} {...note} />{noteIndex < group.length - 1 ? ' · ' : ''}</React.Fragment>)}</span>)}</div>
    {practiceBeat && <p>{t.activeGroup}: {practiceBeat.groupIndex + 1} · {practiceBeat.groupBeatIndex + 1}/{practiceBeat.groupLength} · {t.loops}: {practiceBeat.loopIndex + 1}/{timeline.loops}</p>}
  </section>;
}
