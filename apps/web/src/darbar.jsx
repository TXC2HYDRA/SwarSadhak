import { usePrahar } from './raga.js';

// Classical Devanagari name for each page, shown in the page crest in every language and under nav labels in English.
export const PAGE_TERMS = {
  home: 'स्वागतम्', practice: 'रियाज़', results: 'परिणाम', library: 'अभ्यास संग्रह', alankars: 'अलंकार', 'alankar-practice': 'अलंकार',
  routines: 'साधना क्रम', planner: 'साधना क्रम', routine: 'साधना क्रम', progress: 'प्रगति', settings: 'व्यवस्था',
  timetable: 'समय सारिणी', assignments: 'रियाज़ कार्य', dashboard: 'गुरु कक्ष',
  overview: 'दरबार', users: 'सदस्य', courses: 'पाठ्यक्रम', enrollments: 'प्रवेश', batches: 'वर्ग',
};
export const BRAND_DEVANAGARI = 'नादोपासना';
export const isDevanagari = (text) => /[ऀ-ॿ]/.test(String(text ?? ''));

export const PageCrest = ({ term }) => (term ? <p className="page-crest" lang="hi" aria-hidden="true"><span>{term}</span></p> : null);

// The current raga hour: a chip for the top bar, or a full line (prahar, time of day, ragas) for heroes and sign-in.
export function RagaHour({ t, line = false }) {
  const prahar = usePrahar(); const r = t.portal.raga;
  if (!line) return <span className="raga-chip" title={`${r.hour}: ${r.ragas[prahar]}`}><span className="raga-dot" aria-hidden="true" /><span className="sr-only">{r.hour}: </span>{r.names[prahar]}<span className="sr-only"> · {r.ragas[prahar]}</span></span>;
  return <p className="raga-line"><span className="raga-dot" aria-hidden="true" /><span><strong>{r.hour} · {r.names[prahar]}</strong> ({r.when[prahar]}) · {r.ragas[prahar]}</span></p>;
}
