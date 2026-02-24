import React from "react";
import css from "./AudioPlayer.module.css";

/* ── Icons ──────────────────────────────────────────── */

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.5 2.5L13 8L4.5 13.5V2.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="3.5" height="12" rx="1" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3L4.5 5.5H2V10.5H4.5L8 13V3Z" />
      <path d="M11 6C11.6 6.8 12 7.8 12 9C12 10.2 11.6 11.2 11 12" />
    </svg>
  );
}

/* ── Stable pseudo-random waveform heights ──────────── */

const BAR_COUNT = 32;

/** Deterministic waveform using a simple hash so bars don't shift on re-render. */
function generateBars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = ((h << 5) - h + i * 7 + 13) | 0;
    const norm = ((h >>> 0) % 100) / 100; // 0..1
    bars.push(4 + norm * 16); // 4px .. 20px
  }
  return bars;
}

/* ── Helpers ─────────────────────────────────────────── */

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Component ──────────────────────────────────────── */

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [error, setError] = React.useState(false);

  const bars = React.useMemo(() => generateBars(src), [src]);

  const toggle = React.useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => setError(true));
    }
  }, [playing]);

  const handleSeek = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
    },
    [duration]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const timeLabel = playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration);

  /* ── Error state ──────────────── */
  if (error) {
    return (
      <div className={css.AudioPlayer}>
        <span className={css.AudioPlayerIconMuted}>
          <SpeakerIcon />
        </span>
        <span className={css.AudioPlayerError}>Audio unavailable</span>
      </div>
    );
  }

  /* ── Normal state ─────────────── */
  return (
    <div className={css.AudioPlayer}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setError(true)}
      />

      {/* Play / Pause */}
      <button
        type="button"
        className={css.AudioPlayerBtn}
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Waveform bars */}
      <div className={css.AudioPlayerWave} onClick={handleSeek}>
        <div className={css.AudioPlayerBars}>
          {bars.map((h, i) => (
            <div key={i} className={css.AudioPlayerBar} style={{ height: `${h}px` }} />
          ))}
        </div>

        {/* Progress overlay */}
        <div className={css.AudioPlayerProgress} style={{ width: `${progress}%` }} />
      </div>

      {/* Time */}
      <span className={css.AudioPlayerTime}>{timeLabel}</span>
    </div>
  );
}
