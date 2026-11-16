import React from 'react';
import { SwaraLabel } from './SwaraLabel.jsx';

// Tala cycles for the opt-in ruler: vibhag lengths and the mark at the start of each vibhag
// (X = sam, a number = clap (taali), 0 = wave (khali)). Rupak begins on khali, so its sam is marked 0.
export const TALAS = {
  keherwa: { vibhag: [4, 4], marks: ['X', '0'] },
  dadra: { vibhag: [3, 3], marks: ['X', '0'] },
  rupak: { vibhag: [3, 2, 2], marks: ['0', '1', '2'] },
  jhaptaal: { vibhag: [2, 3, 2, 3], marks: ['X', '2', '0', '3'] },
  ektaal: { vibhag: [2, 2, 2, 2, 2, 2], marks: ['X', '0', '2', '0', '3', '4'] },
  teentaal: { vibhag: [4, 4, 4, 4], marks: ['X', '2', '0', '3'] },
};

// One entry per matra: its number and, at a vibhag start, the clap/wave mark.
export function talaMatras(id) {
  const tala = TALAS[id];
  if (!tala) return null;
  return tala.vibhag.flatMap((length, part) => Array.from({ length }, (_, offset) => ({ mark: offset === 0 ? tala.marks[part] : null })))
    .map((matra, index) => ({ ...matra, n: index + 1 }));
}

export function AlankarPracticeDisplay({ beat, timeline, groups, octaveGroups = groups.map((group) => group.map((swara) => ({ swara, octave: 'middle' }))), progress, phase, t, groupKey, tala = '' }) {
  const practiceBeat = beat.phase === 'practice' ? beat : null;
  const beatSwaraIndex = (groupLength, groupBeatIndex) => groupLength === 1 ? 0 : groupLength === 2 ? Math.floor(groupBeatIndex / 2) : Math.min(groupBeatIndex, 2);
  const currentSwara = practiceBeat ? octaveGroups[practiceBeat.groupIndex]?.[beatSwaraIndex(octaveGroups[practiceBeat.groupIndex]?.length ?? 1, practiceBeat.groupBeatIndex)] : null;
  // Beat ruler: the four beats of the 4/4 bar, with the first (sam) drawn heavier; it advances one beat at a time.
  const tick = phase === 'count-in' ? beat.countInBeat || 1 : practiceBeat ? practiceBeat.beatInBar : 0;
  // Tala ruler: the matra is the practice beat counted around the chosen cycle; nothing is lit during the count-in.
  const matras = talaMatras(tala);
  const matra = matras && practiceBeat ? (practiceBeat.beatIndex % matras.length) + 1 : 0;
  return <section className="alankar-live">
    <div className="live-metrics">
      <div><small>{phase === 'count-in' ? t.countIn : t.activePractice}</small><strong>{phase === 'count-in' ? `${t.countInBeat} ${beat.countInBeat || 1} / ${timeline.countInBeats}` : matra ? `${matra === 1 ? '♩ ' : ''}${t.studioUi.matra} ${matra} / ${matras.length}` : (practiceBeat?.accent ? `♩ ${t.beat} 1` : `${t.beat} ${practiceBeat ? practiceBeat.beatInBar : 1}`)}</strong></div>
      <div><small>{t.currentSwara}</small><strong>{currentSwara ? <SwaraLabel t={t} {...currentSwara} /> : '—'}</strong></div>
      <div><small>{t.progress}</small><strong>{progress}%</strong></div>
    </div>
    {matras
      ? <ol className="beat-ruler is-tala" style={{ '--matras': matras.length }} aria-hidden="true">{matras.map(({ n, mark }) => <li key={n} className={[n === 1 && 'is-sam', mark && n > 1 && 'is-vibhag', n === matra && 'is-on'].filter(Boolean).join(' ') || undefined}>{mark && <span className={`tala-mark${mark === '0' ? ' is-khali' : ''}`}>{mark}</span>}{n}</li>)}</ol>
      : <ol className={`beat-ruler${phase === 'count-in' ? ' is-count-in' : ''}`} aria-hidden="true">{[1, 2, 3, 4].map((n) => <li key={n} className={n === tick ? 'is-on' : undefined}>{n}</li>)}</ol>}
    {matras && <p className="tala-key">{t.studioUi.talaKey}</p>}
    <div className="group-strip">{octaveGroups.map((group, index) => <span className={practiceBeat?.groupIndex === index ? 'active' : ''} key={`${groupKey}-${index}`}>{group.map((note, noteIndex) => <React.Fragment key={noteIndex}><SwaraLabel t={t} {...note} />{noteIndex < group.length - 1 ? ' · ' : ''}</React.Fragment>)}</span>)}</div>
    {practiceBeat && <p>{t.activeGroup}: {practiceBeat.groupIndex + 1} · {practiceBeat.groupBeatIndex + 1}/{practiceBeat.groupLength} · {t.loops}: {practiceBeat.loopIndex + 1}/{timeline.loops}</p>}
  </section>;
}
