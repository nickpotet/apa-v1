// Laptop dev simulation of the physical arcade button.
// Space bar = push-to-talk. On the real kiosk this becomes TelephoneHandset
// or the HID-wired arcade button — just swap the adapter in App.tsx.
import type { InputSource, InputSourceEvents } from './InputSource';

export class ArcadeButtonMic implements InputSource {
  readonly name = 'ArcadeButtonMic (Space key sim)';
  private events: InputSourceEvents | null = null;
  private held = false;

  private readonly handleDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || this.held || e.repeat) return;
    e.preventDefault();
    this.held = true;
    this.events?.onTalkStart();
  };

  private readonly handleUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !this.held) return;
    this.held = false;
    this.events?.onTalkEnd();
  };

  async attach(events: InputSourceEvents): Promise<void> {
    this.events = events;
    window.addEventListener('keydown', this.handleDown);
    window.addEventListener('keyup', this.handleUp);
  }

  async detach(): Promise<void> {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    this.events = null;
    this.held = false;
  }
}
