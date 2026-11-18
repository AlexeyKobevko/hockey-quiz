import type { SoundCue } from './audio-events.js';

const files: ReadonlyArray<readonly [SoundCue, string]> = [
  ['period-start', '/audio/period-start.mp3'],
  ['puck-hit', '/audio/puck-hit.mp3'],
  ['period-end', '/audio/period-end.mp3'],
  ['final-horn', '/audio/final-horn.mp3'],
];
const volumes: Record<SoundCue, number> = {
  'period-start': 0.35,
  'puck-hit': 0.65,
  'period-end': 0.62,
  'final-horn': 0.65,
};

/** Audio is opt-in and deliberately not persisted: iOS requires a fresh gesture after reload. */
export function createSoundEffects() {
  let context: AudioContext | null = null;
  let current: AudioBufferSourceNode | null = null;
  let enabled = false;
  let loading: Promise<boolean> | null = null;
  let buffers = new Map<SoundCue, AudioBuffer>();

  function stop() {
    if (!current) return;
    const sound = current;
    current = null;
    sound.onended = null;
    try {
      sound.stop();
    } catch {
      // The buffer may have finished naturally.
    }
    sound.disconnect();
  }

  function disable() {
    enabled = false;
    stop();
  }

  async function enable(): Promise<boolean> {
    if (enabled) return true;
    if (loading) return loading;
    // Creating/resuming the audio context is triggered directly by a player's tap.
    const pending = (async () => {
      try {
        const audioContext = context ?? new AudioContext();
        context = audioContext;
        await audioContext.resume();
        const decoded = await Promise.all(
          files.map(async ([cue, url]) => {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error('Audio unavailable: ' + url);
            const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
            return [cue, buffer] as const;
          }),
        );
        buffers = new Map(decoded);
        enabled = true;
        return true;
      } catch {
        enabled = false;
        return false;
      }
    })();
    loading = pending;
    try {
      return await pending;
    } finally {
      loading = null;
    }
  }

  function play(cue: SoundCue) {
    if (!enabled || document.hidden || context?.state !== 'running') return;
    const buffer = buffers.get(cue);
    if (!buffer) return;
    stop(); // Only one sound at a time, never overlapping cues.
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volumes[cue];
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      if (current === source) current = null;
      source.disconnect();
      gain.disconnect();
    };
    current = source;
    source.start();
  }

  function resumeOnGesture() {
    if (enabled && context?.state === 'suspended') void context.resume().catch(() => {});
  }

  return { enable, disable, stop, play, resumeOnGesture, get enabled() { return enabled; } };
}
