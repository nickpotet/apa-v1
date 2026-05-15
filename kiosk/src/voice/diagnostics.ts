import type { Language } from './providers/VoiceProvider';

type DebugEvent = {
  at: string;
  scope: 'app' | 'provider';
  event: string;
  data?: Record<string, unknown>;
};

type DebugTurn = {
  id: string;
  provider: string;
  initialLanguage: Language;
  languageLock: Language | null;
  startedAt: string;
  finishedAt?: string;
  finishReason?: string;
  userTranscriptCount: number;
  apTranscriptCount: number;
  contextEntries: number;
  events: DebugEvent[];
};

type DiagnosticsState = {
  activeTurn: DebugTurn | null;
  recentTurns: DebugTurn[];
};

declare global {
  interface Window {
    __apaDiagnostics?: DiagnosticsState;
  }
}

const MAX_RECENT_TURNS = 8;

function ensureState(): DiagnosticsState | null {
  if (typeof window === 'undefined') return null;
  window.__apaDiagnostics ??= { activeTurn: null, recentTurns: [] };
  return window.__apaDiagnostics;
}

export function beginDebugTurn(
  provider: string,
  initialLanguage: Language,
  contextEntries: number,
  languageLock: Language | null,
): void {
  const state = ensureState();
  if (!state) return;

  state.activeTurn = {
    id: `${Date.now()}`,
    provider,
    initialLanguage,
    languageLock,
    startedAt: new Date().toISOString(),
    userTranscriptCount: 0,
    apTranscriptCount: 0,
    contextEntries,
    events: [],
  };
}

export function recordDebugEvent(
  scope: 'app' | 'provider',
  event: string,
  data?: Record<string, unknown>,
): void {
  const state = ensureState();
  const turn = state?.activeTurn;
  if (!turn) return;

  turn.events.push({
    at: new Date().toISOString(),
    scope,
    event,
    data,
  });

  if (event === 'user_transcript') turn.userTranscriptCount += 1;
  if (event === 'ap_transcript') turn.apTranscriptCount += 1;

  console.info(`[voice:${scope}] ${event}`, data ?? {});
}

export function finishDebugTurn(reason: string): void {
  const state = ensureState();
  const turn = state?.activeTurn;
  if (!state || !turn) return;

  turn.finishedAt = new Date().toISOString();
  turn.finishReason = reason;
  state.recentTurns = [turn, ...state.recentTurns].slice(0, MAX_RECENT_TURNS);
  state.activeTurn = null;
}
