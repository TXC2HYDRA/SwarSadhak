import React from 'react';

export function SwaraLabel({ t, swara, octave = 'middle' }) {
  const label = t.swaras?.[swara] ?? swara;
  return <span className="swara-label">{label}</span>;
}
