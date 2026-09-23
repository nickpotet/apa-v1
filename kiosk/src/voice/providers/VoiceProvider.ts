// No Gemini SDK calls outside this folder (CLAUDE.md rule).

export type Language = 'es' | 'en' | 'ru' | 'ca' | 'fr' | 'de' | 'uk' | 'sr' | 'it' | 'pl';

export interface VoiceProviderConfig {
  /** Hard cap enforced client-side. CLAUDE.md rule 4: 60–90 s. */
  maxConversationSeconds: number;
  initialLanguage: Language;
  /** Set when the visitor explicitly chose a language in the UI; overrides auto-detection. */
  languageLock: Language | null;
  systemPrompt: string;
  /** Short-lived ephemeral token minted by /api/token. */
  ephemeralToken: string;
}

export interface VoiceProviderEvents {
  onListening: () => void;
  onThinking: () => void;
  onSpeakingStart: () => void;
  onSpeakingEnd: () => void;
  onTranscript: (t: { role: 'user' | 'ap'; text: string }) => void;
  onLanguageDetected: (lang: Language) => void;
  /** Fired ~10 s before the hard cap so the UI can show a wrap-up cue. */
  onTimeoutNearing: () => void;
  onDebug?: (event: string, data?: Record<string, unknown>) => void;
  onError: (err: Error) => void;
  onEnd: (reason: 'user' | 'timeout' | 'error' | 'network' | 'quota' | 'complete') => void;
}

export interface VoiceProvider {
  readonly name: string;
  readonly model: string;
  readonly requiresToken?: boolean;
  warmupAudio?(): Promise<void>;
  start(config: VoiceProviderConfig, events: VoiceProviderEvents): Promise<void>;
  endTurn(): void;
  stop(): Promise<void>;
}
