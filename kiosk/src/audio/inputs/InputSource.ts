// InputSource — interface for the physical "press to talk" gesture.
// Two adapters built in parallel for the day-7 bake-off:
//   - TelephoneHandset (hookswitch as momentary button)
//   - ArcadeButtonMic (USB cardioid + 60mm button)
// CLAUDE.md rule: no direct mic/handset/hookswitch access outside this folder.

export interface InputSourceEvents {
  /** Visitor began the gesture (button down / handset off-hook). */
  onTalkStart: () => void;
  /** Visitor ended the gesture. */
  onTalkEnd: () => void;
  onError: (err: Error) => void;
}

export interface InputSource {
  readonly name: string;
  /** Begin listening for the physical gesture. Idempotent. */
  attach(events: InputSourceEvents): Promise<void>;
  /** Release hardware handles. */
  detach(): Promise<void>;
}
