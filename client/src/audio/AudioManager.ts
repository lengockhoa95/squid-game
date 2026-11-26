/**
 * Tiny synthesized sound effects (WebAudio oscillators) — no audio files to download.
 * The AudioContext is created lazily on first use; browsers only allow it after a user gesture,
 * which every sound here follows (clicks in menus / in game).
 */
type Cue = 'tick' | 'go' | 'red' | 'green' | 'out' | 'pass' | 'win' | 'break' | 'pull' | 'click' | 'cast' | 'zap' | 'whoosh' | 'rumble';

const CUES: Record<Cue, ReadonlyArray<[freq: number, start: number, dur: number, type: OscillatorType]>> = {
  tick: [[660, 0, 0.09, 'square']],
  go: [[880, 0, 0.12, 'square'], [1320, 0.1, 0.22, 'square']],
  red: [[300, 0, 0.18, 'sawtooth'], [220, 0.16, 0.25, 'sawtooth']],
  green: [[520, 0, 0.1, 'triangle'], [780, 0.08, 0.14, 'triangle']],
  out: [[400, 0, 0.15, 'sawtooth'], [260, 0.13, 0.18, 'sawtooth'], [160, 0.28, 0.3, 'sawtooth']],
  pass: [[660, 0, 0.1, 'triangle'], [990, 0.09, 0.18, 'triangle']],
  win: [[523, 0, 0.14, 'triangle'], [659, 0.13, 0.14, 'triangle'], [784, 0.26, 0.14, 'triangle'], [1046, 0.39, 0.4, 'triangle']],
  break: [[1800, 0, 0.05, 'square'], [1200, 0.03, 0.08, 'square'], [700, 0.07, 0.12, 'sawtooth']],
  pull: [[180, 0, 0.07, 'square']],
  click: [[900, 0, 0.04, 'triangle']],
  cast: [[440, 0, 0.08, 'triangle'], [880, 0.05, 0.12, 'triangle']],
  zap: [[2200, 0, 0.04, 'sawtooth'], [600, 0.03, 0.1, 'square'], [1800, 0.1, 0.06, 'sawtooth']],
  whoosh: [[300, 0, 0.25, 'triangle'], [520, 0.05, 0.2, 'sine']],
  rumble: [[90, 0, 0.3, 'sawtooth'], [70, 0.1, 0.3, 'square']],
};

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  play(cue: Cue, volume = 0.18): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    for (const [freq, start, dur, type] of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(volume, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(this.master);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null; // audio unavailable (e.g. headless): stay silent
    }
  }
}

export const audio = new AudioManager();
export type { Cue };
