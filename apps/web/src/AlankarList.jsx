import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ALANKARS, alankarDisplayGroups } from '@swarsadhak/exercises';
import { SwaraLabel } from './SwaraLabel.jsx';

const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;
const renderGroups = (t, groups) => groups.map((group, index) => <span key={index}>[{group.map((note, noteIndex) => <React.Fragment key={noteIndex}><SwaraLabel t={t} {...note} />{noteIndex < group.length - 1 ? ', ' : ''}</React.Fragment>) }]</span>);

export function AlankarList({ t, onChoose, onBack }) { return <div className="page"><p className="eyebrow">{t.alankar.name}</p><h1>{t.alankarListTitle}</h1><p>{t.alankarListDescription}</p><section className="alankar-list" aria-label={t.alankarListTitle}>{ALANKARS.map((pattern) => <button className="alankar-card" key={pattern.id} onClick={() => onChoose(pattern)}><span className="alankar-card-heading"><strong>{textAt(t, pattern.nameKey)}</strong><ChevronRight size={18} /></span><small>{t.aaroha}</small><span className="group-preview">{renderGroups(t, alankarDisplayGroups(pattern, 'aaroha'))}</span><small>{t.avaroha}</small><span className="group-preview">{renderGroups(t, alankarDisplayGroups(pattern, 'avaroha'))}</span><small>{pattern.aroha.length} {t.groups} · {pattern.avaroha.length} {t.groups}</small></button>)}</section><button className="button" onClick={onBack}>{t.back}</button></div>; }
