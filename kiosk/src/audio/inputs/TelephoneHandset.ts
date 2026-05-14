// Telephone handset InputSource — toggle mode: pick up = start, hang up = end.
// Dev simulation: 'H' key toggles hook state.
// Production swap: replace the keydown listener with the HID event from the
// physical hookswitch (e.g., USB serial or Web HID API on the mini-PC GPIO).
import type { InputSource, InputSourceEvents } from './InputSource';

export class TelephoneHandset implements InputSource {
  readonly name = 'TelephoneHandset (H key sim)';
  private events: InputSourceEvents | null = null;
  private offHook = false;

  private readonly handleKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyH' || e.repeat) return;
    e.preventDefault();
    if (!this.offHook) {
      this.offHook = true;
      this.events?.onTalkStart();
    } else {
      this.offHook = false;
      this.events?.onTalkEnd();
    }
  };

  async attach(events: InputSourceEvents): Promise<void> {
    this.events = events;
    window.addEventListener('keydown', this.handleKey);
  }

  async detach(): Promise<void> {
    window.removeEventListener('keydown', this.handleKey);
    if (this.offHook) {
      this.offHook = false;
      this.events?.onTalkEnd();
    }
    this.events = null;
  }
}
