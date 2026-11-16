import { useEffect, useState } from 'react';

// The eight prahars (three-hour watches of day and night), by local hour. Each has ragas traditionally sung then.
export const PRAHARS = ['nishith', 'ushah', 'pratah', 'purvahna', 'madhyahna', 'aparahna', 'sayam', 'pradosh'];
export const praharAt = (date = new Date()) => PRAHARS[Math.floor(date.getHours() / 3)];

// Current prahar, refreshed every minute; also tags <html data-prahar> so the theme accent follows the hour.
export function usePrahar() {
  const [prahar, setPrahar] = useState(() => praharAt());
  useEffect(() => {
    const tick = () => { const next = praharAt(); setPrahar(next); if (globalThis.document) document.documentElement.dataset.prahar = next; };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, []);
  return prahar;
}
