import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { TONICS } from './tonics.js';
import { createTanpuraPlayer, tanpuraRecordingsFor } from './tanpura.js';

const textAt = (t, key) => key.split('.').reduce((value, part) => value?.[part], t) || key;

export function TanpuraPlayer({ t, tonic, setTonic, visible = true }) {
  const player = useRef(null);
  const tonicOption = TONICS.find((item) => item.value === tonic) || TONICS[0];
  const recordings = tanpuraRecordingsFor(tonicOption.pitch);
  const [profile, setProfile] = useState(recordings[0]?.id || '');
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const recording = recordings.find((item) => item.id === profile) || recordings[0];

  useEffect(() => {
    setProfile(recordings[0]?.id || '');
    if (!playing || !recordings[0] || !player.current) return undefined;
    let cancelled = false;
    setPlaying(false);
    player.current.stop().then(async () => {
      if (cancelled) return;
      const result = await player.current.start(recordings[0]);
      if (!cancelled) setPlaying(Boolean(result.ok));
    });
    return () => { cancelled = true; };
  }, [tonicOption.pitch]);

  useEffect(() => () => player.current?.stop({ immediate: true }), []);

  const start = async () => {
    if (!player.current) player.current = createTanpuraPlayer();
    const result = await player.current.start(recording);
    if (result.ok) {
      setError(false);
      setPlaying(true);
    } else {
      setError(true);
      setPlaying(false);
    }
  };

  const stop = () => {
    player.current?.stop();
    setPlaying(false);
  };

  const changeProfile = async (event) => {
    const next = recordings.find((item) => item.id === event.target.value);
    setProfile(next?.id || '');
    if (playing && next) {
      setPlaying(false);
      await player.current?.stop();
      const result = await player.current?.start(next);
      setPlaying(Boolean(result?.ok));
    }
  };

  if (!visible && !playing) return null;

  return <section className={`tanpura-panel panel ${visible ? '' : 'tanpura-floating'}`} aria-labelledby="tanpura-title">
    <div className="tanpura-heading">
      <div>
        <p className="eyebrow"><Volume2 size={15} aria-hidden="true" /> {t.tanpuraLabel}</p>
        <h2 id="tanpura-title">{t.tanpuraTitle}</h2>
        <p>{t.tanpuraDescription}</p>
      </div>
      <span className={`tanpura-status ${playing ? 'playing' : ''}`} role="status">{playing ? t.tanpuraPlaying : t.tanpuraStopped}</span>
    </div>
    <div className="tanpura-controls">
      <label>{t.tanpuraScale}
        <select value={tonic} onChange={(event) => setTonic(Number(event.target.value))}>
          {TONICS.map((item) => <option key={item.value} value={item.value}>{textAt(t, item.labelKey)}</option>)}
        </select>
      </label>
      {recordings.length > 1 && <label>{t.tanpuraProfile}
        <select value={profile} onChange={changeProfile}>
          {recordings.map((item) => <option key={item.id} value={item.id}>{textAt(t, item.labelKey)}</option>)}
        </select>
      </label>}
      {!playing ? <button className="button primary" onClick={start}><Play size={17} />{t.tanpuraStart}</button> : <button className="button tanpura-stop" onClick={stop}><Pause size={17} />{t.tanpuraStop}</button>}
    </div>
    <small className="tanpura-hint">{t.tanpuraHint}</small>
    <small className="tanpura-offline-note">{t.tanpuraOfflineNote}</small>
    {error && <p className="notice" role="alert">{t.tanpuraUnavailable}</p>}
  </section>;
}
