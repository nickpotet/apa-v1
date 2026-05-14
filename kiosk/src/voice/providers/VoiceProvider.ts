// VoiceProvider — interface that any speech-to-speech engine adapter must implement.
// CLAUDE.md rule: no OpenAI/Gemini SDK calls outside this folder.

export type Language = 'es' | 'en' | 'ru' | 'ca';

export interface VoiceProviderConfig {
  /** Hard cap on a single conversation, in seconds. CLAUDE.md rule 4: 60–90 s. */
  maxConversationSeconds: number;
  /** Audio for push-to-talk turns, text for scenario chips. Defaults to audio. */
  inputMode?: 'audio' | 'text';
  /** Initial UI language; the engine may switch after detecting user speech. */
  initialLanguage: Language;
  /** Fully resolved system prompt assembled from /config/*. */
  systemPrompt: string;
  /** Token for the voice API. For Gemini: the actual API key (local kiosk, no cloud exposure).
   *  For OpenAI Realtime: the ephemeral token minted by /api/token. */
  ephemeralToken: string;
}

export interface VoiceProviderEvents {
  onListening: () => void;
  onThinking: () => void;
  onSpeakingStart: () => void;
  onSpeakingEnd: () => void;
  /** Anonymized — only summary fields, never raw audio. */
  onTranscript: (t: { role: 'user' | 'ap'; text: string }) => void;
  onLanguageDetected: (lang: Language) => void;
  /** Fired ~10 s before the hard cap so the UI can show a wrap-up cue. */
  onTimeoutNearing: () => void;
  onError: (err: Error) => void;
  onEnd: (reason: 'user' | 'timeout' | 'error' | 'network') => void;
}

export interface VoiceProvider {
  readonly name: string;
  readonly model: string;
  /** Opens the session and starts streaming mic audio. Call on button-down. */
  start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void>;
  /** Signals end of user speech (button-up). Stops mic, model generates response. */
  endTurn(): void;
  /** Sends a synthetic text turn — used by scenario chips to skip mic input. */
  sendText(text: string): void;
  /** Fully closes the session. */
  stop(): Promise<void>;
}
