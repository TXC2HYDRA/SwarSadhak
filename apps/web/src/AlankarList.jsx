import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ALANKARS, alankarDisplayGroups } from '@swarsadhak/exercises';
import { SwaraLabel } from './SwaraLabel.jsx';

const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;
// Groups keep the established [Sa, Re, Ga] notation as plain text; spacing, not boxes, separates them.
const renderGroups = (t, groups) => groups.map((group, index) => <span key={index} className="phrase-group">[{group.map((note, noteIndex) => <React.Fragment key={noteIndex}><SwaraLabel t={t} {...note} />{noteIndex < group.length - 1 ? ', ' : ''}</React.Fragment>)}]</span>);

export function AlankarList({ t, onChoose, onBack }) {
  return <div className="page alankar-list-page">
    <div className="page-heading"><div><h1>{t.alankarListTitle}</h1><p className="page-lede">{t.alankarListDescription}</p></div></div>
    <section className="alankar-list" aria-label={t.alankarListTitle}>{ALANKARS.map((pattern) => <button className="alankar-card" key={pattern.id} onClick={() => onChoose(pattern)}>
      <span className="alankar-card-heading"><strong>{textAt(t, pattern.nameKey)}</strong><small>{pattern.aroha.length} {t.groups}</small><ChevronRight size={18} aria-hidden="true" /></span>
      <span className="phrase-row"><small>{t.aaroha}</small><span className="group-preview">{renderGroups(t, alankarDisplayGroups(pattern, 'aaroha'))}</span></span>
      <span className="phrase-row"><small>{t.avaroha}</small><span className="group-preview">{renderGroups(t, alankarDisplayGroups(pattern, 'avaroha'))}</span></span>
    </button>)}</section>
    <button className="button" onClick={onBack}>{t.back}</button>
  </div>;
}
