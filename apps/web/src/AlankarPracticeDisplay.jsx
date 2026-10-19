import React from 'react';
import { SwaraLabel } from './SwaraLabel.jsx';

export function AlankarPracticeDisplay({ beat, timeline, groups, octaveGroups = groups.map((group) => group.map((swara) => ({ swara, octave: 'middle' }))), progress, phase, t, groupKey }) {
  const practiceBeat = beat.phase === 'practice' ? beat : null;
  const beatSwaraIndex = (groupLength, groupBeatIndex) => groupLength === 1 ? 0 : groupLength === 2 ? Math.floor(groupBeatIndex / 2) : Math.min(groupBeatIndex, 2);
  const currentSwara = practiceBeat ? octaveGroups[practiceBeat.groupIndex]?.[beatSwaraIndex(octaveGroups[practiceBeat.groupIndex]?.length ?? 1, practiceBeat.groupBeatIndex)] : null;
  return <section className="panel alankar-live" aria-live="polite">
    <div className="live-metrics">
      <div><small>{phase === 'count-in' ? t.countIn : t.activePractice}</small><strong>{phase === 'count-in' ? `${t.countInBeat} ${beat.countInBeat || 1} / ${timeline.countInBeats}` : (practiceBeat?.accent ? `♩ ${t.beat} 1` : `${t.beat} ${practiceBeat ? practiceBeat.beatInBar : 1}`)}</strong></div>
      <div><small>{t.currentSwara}</small><strong>{currentSwara ? <SwaraLabel t={t} {...currentSwara} /> : '—'}</strong></div>
      <div><small>{t.progress}</small><strong>{progress}%</strong></div>
    </div>
    <div className="group-strip">{octaveGroups.map((group, index) => <span className={practiceBeat?.groupIndex === index ? 'active' : ''} key={`${groupKey}-${index}`}>{group.map((note, noteIndex) => <React.Fragment key={noteIndex}><SwaraLabel t={t} {...note} />{noteIndex < group.length - 1 ? ' · ' : ''}</React.Fragment>)}</span>)}</div>
    {practiceBeat && <p>{t.activeGroup}: {practiceBeat.groupIndex + 1} · {practiceBeat.groupBeatIndex + 1}/{practiceBeat.groupLength} · {t.loops}: {practiceBeat.loopIndex + 1}/{timeline.loops}</p>}
  </section>;
}
