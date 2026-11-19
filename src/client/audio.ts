import type { SoundCue } from './audio-events.js';

/** On iOS WebKit, the default audio session can be muted by Silent Mode. */
export function preferPlaybackSession(target: { audioSession?: { type: string } }) {
  try {
    if (target.audioSession) target.audioSession.type = 'playback';
  } catch {
    // Browsers without a configurable AudioSession can still use Web Audio.
  }
}

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
export type PlaybackResult = 'started' | 'disabled' | 'background' | 'missing-buffer' | 'interrupted' | 'error';

export function createSoundEffects() {
  let context: AudioContext | null = null;
  let current: AudioBufferSourceNode | null = null;
  let enabled = false;
  let loading: Promise<boolean> | null = null;
  let buffers = new Map<SoundCue, AudioBuffer>();
  let playSequence = 0;
  let lastResult: PlaybackResult | null = null;

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
    playSequence++;
    stop();
  }

  async function enable(): Promise<boolean> {
    if (enabled) return true;
    if (loading) return loading;
    // Creating/resuming the audio context is triggered directly by a player's tap.
    const pending = (async () => {
      try {
        preferPlaybackSession(navigator as Navigator & { audioSession?: { type: string } });
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
        if (audioContext.state !== 'running') await audioContext.resume();
        if (audioContext.state !== 'running') throw new Error('Audio context did not start');
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

  async function play(cue: SoundCue): Promise<PlaybackResult> {
    const sequence = ++playSequence;
    const result = (value: PlaybackResult) => {
      lastResult = value;
      return value;
    };
    if (!enabled || !context) return result('disabled');
    if (document.hidden) return result('background');
    const audioContext = context;
    const buffer = buffers.get(cue);
    if (!buffer) return result('missing-buffer');

    // iOS can interrupt a previously unlocked AudioContext after a brief pause,
    // tab switch, notification, or media session handover. Never silently drop
    // period sounds just because the context is no longer "running".
    if (audioContext.state !== 'running') {
      preferPlaybackSession(navigator as Navigator & { audioSession?: { type: string } });
      try {
        // Some versions of WebKit never settle resume() while interrupted.
        // Bound the wait, so a missing device/audio session cannot hang the UI.
        await Promise.race([
          audioContext.resume(),
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
      } catch {
        return result('interrupted');
      }
    }
    if (sequence !== playSequence || !enabled || document.hidden) return result('disabled');
    if (audioContext.state !== 'running') return result('interrupted');
    try {
      stop(); // One sound at a time. A later cue takes precedence.
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      gain.gain.value = volumes[cue];
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.onended = () => {
        if (current === source) current = null;
        source.disconnect();
        gain.disconnect();
      };
      current = source;
      source.start();
      return result('started');
    } catch {
      return result('error');
    }
  }

  function resumeOnGesture() {
    if (!enabled) return;
    preferPlaybackSession(navigator as Navigator & { audioSession?: { type: string } });
    if (context && context.state !== 'running') void context.resume().catch(() => {});
  }

  return {
    enable,
    disable,
    stop,
    play,
    resumeOnGesture,
    get enabled() { return enabled; },
    get contextState() { return context?.state ?? 'not-created'; },
    get lastResult() { return lastResult; },
  };
}
