// Plays pre-baked TTS clips from /audio/attract/{lang}/ at random intervals.
// Never calls an external API — Rule 1: attract mode is always free.
import type { Language } from '../voice/providers/VoiceProvider';

const DELAY_MIN_MS = 8_000;
const DELAY_MAX_MS = 15_000;

export class AttractLoop {
  private audio: HTMLAudioElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lang: Language = 'es';
  private manifest: Partial<Record<Language, string[]>> = {};

  async load(): Promise<void> {
    try {
      const res = await fetch('/api/attract-manifest');
      this.manifest = await res.json() as Record<Language, string[]>;
    } catch {
      // No manifest available — loop runs silently until clips are added.
    }
  }

  start(lang: Language): void {
    this.lang = lang;
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }

  setLang(lang: Language): void {
    this.lang = lang;
  }

  private scheduleNext(): void {
    const delay = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
    this.timer = setTimeout(() => this.playNext(), delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private playNext(): void {
    if (!this.running) return;

    const clips = this.manifest[this.lang] ?? this.manifest['es'] ?? [];
    if (clips.length === 0) {
      this.scheduleNext();
      return;
    }

    const clip = clips[Math.floor(Math.random() * clips.length)];
    const url  = `/audio/attract/${this.lang}/${clip}`;

    this.audio = new Audio(url);
    this.audio.onended = () => { if (this.running) this.scheduleNext(); };
    this.audio.onerror = () => { if (this.running) this.scheduleNext(); };
    this.audio.play().catch(() => { if (this.running) this.scheduleNext(); });
  }
}
