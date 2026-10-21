import { useEffect, useState } from 'react';
import { classifyPitchFeedback, frameToObservation, targetFrequency } from '@swarsadhak/musical-core';
import './SaSustainFeedback.css';

const initialFeedback = { status: 'waiting', labelKey: 'pitchFeedback.waiting', octaveLabelKey: null, centsError: null };
const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;

export function SaSustainFeedback({ tonic, t }) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setFeedback(initialFeedback);
    const handleFrame = (event) => {
      const observation = frameToObservation(event.detail, tonic, { targetNote: 'Sa' });
      setFeedback(classifyPitchFeedback(observation, { toleranceCents: 50, confidenceThreshold: 0.55 }));
    };
    window.addEventListener('swar:audio-frame', handleFrame);
    return () => window.removeEventListener('swar:audio-frame', handleFrame);
  }, [tonic]);

  useEffect(() => {
    const nextAnnouncement = feedback.status === 'waiting' ? '' : textAt(t, feedback.labelKey);
    const timeout = setTimeout(() => setAnnouncement(nextAnnouncement), 350);
    return () => clearTimeout(timeout);
  }, [feedback.status, feedback.labelKey, t]);

  return <section className={`sa-feedback sa-feedback-${feedback.status}`}>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    <div>
      <span className="sa-feedback-label">{textAt(t, 'pitchFeedback.target')}</span>
      <strong>Sa · {targetFrequency('Sa', tonic).toFixed(2)} Hz</strong>
    </div>
    <div className="sa-feedback-result">
      {feedback.octaveLabelKey && <span className="sa-feedback-octave">{textAt(t, feedback.octaveLabelKey)}</span>}
      <span>{textAt(t, feedback.labelKey)}</span>
      {feedback.centsError !== null && <small>{Math.round(feedback.centsError)} {t.cents}</small>}
    </div>
  </section>;
}
