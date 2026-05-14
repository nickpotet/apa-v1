import type { VoiceProvider, VoiceProviderConfig, VoiceProviderEvents, Language } from './VoiceProvider';

export class DemoVoiceProvider implements VoiceProvider {
  readonly name = 'Demo Voice';
  readonly model = 'demo-pages';

  private events: VoiceProviderEvents | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = true;
  private lang: Language = 'es';

  async start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.events = events;
    this.lang = config.initialLanguage;
    if ((config.inputMode ?? 'audio') === 'audio') events.onListening();
  }

  endTurn(): void {
    this.respond();
  }

  sendText(text: string): void {
    this.events?.onTranscript({ role: 'user', text });
    this.respond();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    this.events = null;
  }

  private respond(): void {
    const ev = this.events;
    if (!ev || this.stopped) return;

    ev.onThinking();
    this.timers.push(setTimeout(() => {
      if (this.stopped || !this.events) return;
      this.events.onSpeakingStart();
      this.events.onTranscript({ role: 'ap', text: this.sampleLine() });
    }, 650));
    this.timers.push(setTimeout(() => {
      if (this.stopped || !this.events) return;
      this.events.onSpeakingEnd();
    }, 2700));
  }

  private sampleLine(): string {
    switch (this.lang) {
      case 'en':
        return 'Demo mode: I would invite you into the VR episode now.';
      case 'ru':
        return 'Демо-режим: сейчас я бы позвал тебя в VR-эпизод.';
      case 'ca':
        return "Mode demo: ara et convidaria a l'episodi de VR.";
      default:
        return 'Modo demo: ahora te invitaría al episodio de VR.';
    }
  }
}
