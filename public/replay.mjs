// The same clock drives the reader, completed thumbnails, counters and map.
export const CLOSEUP_SECONDS = 1.6;

export function replayDuration(total, style = "timelapse", seconds = 40) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return style === "close" ? total * CLOSEUP_SECONDS : Math.max(1, Number(seconds) || 40);
}

export function replayFrame(total, elapsed, style = "timelapse", seconds = 40) {
  const duration = replayDuration(total, style, seconds);
  if (!duration) return { duration: 0, completed: 0, active: null, phase: 1 };
  const position = Math.min(total, Math.max(0, elapsed) / duration * total);
  const completed = Math.min(total, Math.floor(position + 1e-9));
  return {
    duration,
    completed,
    active: completed < total ? completed : null,
    phase: completed < total ? Math.max(0, position - completed) : 1,
  };
}

export function revealedLabels(phase, total) {
  return Math.min(total, Math.max(0, Math.floor((phase - .25) / .6 * total + 1e-9)));
}

export function visualFrame(phase, total) {
  return total ? Math.min(total - 1, Math.floor(Math.max(0, phase) / .28 * total)) : 0;
}
