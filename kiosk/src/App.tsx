import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, VoiceProvider } from './voice/providers/VoiceProvider';
import type { KioskState } from './types';
import { KioskScreen } from './ui/KioskScreen';
import { GuideScreen } from './ui/GuideScreen';
import { DebugPanel } from './ui/DebugPanel';
import type { ScenarioId } from './ui/ScenarioChips';
import { GeminiVoiceProvider } from './voice/providers/gemini';
import { GuidePipelineProvider } from './voice/providers/guidePipeline';
import { ArcadeButtonMic } from './audio/inputs/ArcadeButtonMic';
import { requestMicrophonePermission } from './audio/microphonePermission';
import { ChipResponsePlayer } from './audio/ChipResponsePlayer';
import { detectLanguageDetailed } from './voice/languageDetection';
import {
  LIVE_MODEL_CHAIN,
  allLiveModelsExhausted,
  liveFailoverSnapshot,
} from './voice/liveModelFailover';
import { APP_VERSION } from './config/appVersion';
import {
  buildEntranceCadenceInstruction,
  claimEntranceSessionThemes,
  selectEntranceCadence,
} from './voice/entranceCadence';
import type { EntranceSessionThemes } from './voice/entranceCadence';
import {
  beginDiagnosticTurn,
  finishDiagnosticTurn,
  recordDiagnosticEvent,
  recordDiagnosticTranscript,
  refreshDiagnosticDeviceInfo,
  updateDiagnosticTurn,
} from './voice/diagnostics';

const DEFAULT_LANGUAGE: Language = 'es';
const SESSION_CONTEXT_TTL_MS = 30_000;
/** One retry per remaining route (other Live models + the REST pipeline). */
const MAX_QUOTA_RETRIES = LIVE_MODEL_CHAIN.length;
const KIOSK_THINKING_TIMEOUT_MS = 20_000;
const GUIDE_THINKING_TIMEOUT_MS = 45_000;
const MIN_RECORDING_MS = 700;

const input      = new ArcadeButtonMic();
const chipPlayer = new ChipResponsePlayer();

type TranscriptEntry = { role: 'user' | 'ap'; text: string };
type VoiceToken = { token: string; expiresAt?: string; newSessionExpireTime?: string };
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get('debug') === '1';
const APP_URL = new URL(window.location.href);
const URL_LANGUAGE = parseLanguage(APP_URL.searchParams.get('lang'));
const GUIDE_PROVIDER_MODE = APP_URL.searchParams.get('provider');
const GUIDE_HALL = APP_URL.searchParams.get('hall');
const GUIDE_STAND = APP_URL.searchParams.get('stand');
const APP_MODE: 'kiosk' | 'guide' = APP_URL.pathname.startsWith('/guide') || GUIDE_HALL || GUIDE_STAND
  ? 'guide'
  : 'kiosk';
// Two adapters kept alive so a quota failure can fail over without a reload.
// `?provider=pipeline` pins the turn-based path (STT→LLM→TTS over REST models,
// a separate quota from the realtime Live model) — the documented cost/quota
// lever in CLAUDE.md. Otherwise we start on Live and fall back automatically.
const livePipeline = new GuidePipelineProvider();
const liveRealtime = new GeminiVoiceProvider();
const PIPELINE_PINNED = GUIDE_PROVIDER_MODE === 'pipeline';
let provider: VoiceProvider = PIPELINE_PINNED ? livePipeline : liveRealtime;

/** Route the next turn: Live while any model has quota, else the REST pipeline. */
function selectProvider(): VoiceProvider {
  if (PIPELINE_PINNED) return livePipeline;
  provider = allLiveModelsExhausted() ? livePipeline : liveRealtime;
  return provider;
}

function parseLanguage(value: string | null): Language | null {
  return value === 'es' || value === 'en' || value === 'ru' || value === 'ca' || value === 'fr'
    || value === 'de' || value === 'uk' || value === 'sr' || value === 'it' || value === 'pl'
    ? value
    : null;
}

// Conservative: only clear connectivity/transport failures escalate to the
// QR "lost connection" fallback. Anything we can't confidently classify (e.g.
// "no microphone audio", speech-synthesis failures) keeps the old transient
// error so we never mislabel a local hiccup as an outage.
const CONNECTIVITY_ERROR = /failed to fetch|networkerror|load failed|net::|err_|http [45]\d\d|\b50[234]\b|websocket|socket|connection|disconnect|offline|timed? ?out|token|guide[ -]turn|econn|enotfound/i;

function isConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CONNECTIVITY_ERROR.test(message);
}

function guideContext(): string {
  if (APP_MODE !== 'guide') return '';
  const parts = [
    '## Current guide location context',
    'The visitor opened Apa guide mode from a QR code inside the exhibition.',
  ];
  if (GUIDE_STAND) parts.push(`Current stand: ${GUIDE_STAND}. Answer from this stand first when relevant.`);
  if (GUIDE_HALL) parts.push(`Current hall: ${GUIDE_HALL}. Answer from this hall first when relevant.`);
  if (!GUIDE_HALL && !GUIDE_STAND) parts.push('Current location: full exhibition overview.');
  return parts.join('\n');
}

function appendTranscriptText(current: string, next: string): string {
  if (!current) return next;
  if (/^[,.;:!?)]/.test(next)) return `${current}${next}`;
  return `${current} ${next}`;
}

function compactTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  const compacted: TranscriptEntry[] = [];
  for (const entry of entries) {
    const text = entry.text.trim();
    if (!text) continue;
    const previous = compacted[compacted.length - 1];
    if (previous?.role === entry.role) {
      previous.text = appendTranscriptText(previous.text, text);
    } else {
      compacted.push({ role: entry.role, text });
    }
  }
  return compacted.slice(-8);
}

function getEntranceCadence(entries: TranscriptEntry[], themes: EntranceSessionThemes) {
  const completedApaReplies = compactTranscript(entries)
    .filter((entry) => entry.role === 'ap')
    .length;
  return selectEntranceCadence(completedApaReplies, themes);
}

function buildRecentContext(
  entries: TranscriptEntry[],
  entranceThemes: EntranceSessionThemes | null,
): string {
  const compacted = compactTranscript(entries);
  if (compacted.length === 0 && APP_MODE === 'guide') return '';
  const lastApa = [...compacted].reverse().find((entry) => entry.role === 'ap')?.text;
  const lines = [
    '## Recent local kiosk context',
    'Use this to preserve continuity across push-to-talk turns.',
    'The current visitor speech wins over stale context when languages conflict.',
    'If the current turn contains no intelligible speech, briefly say you did not hear them.',
    'If the current visitor says only a short affirmation such as "yes", "yeah", "sí", "si", "да", "oui", "ja", "так", "da", "sì", "ok", or "ага", treat it as an answer to Apa’s last question and continue the immediately previous topic.',
    'If the current visitor says only a short rejection such as "no", "нет", "non", "nein", "ні", "ne", "nie", or "nope", treat it as a rejection of Apa’s last question and offer a different penguin topic. Mention the exhibition only when the deterministic cadence permits it.',
  ];
  if (APP_MODE === 'kiosk' && entranceThemes) {
    const cadence = getEntranceCadence(entries, entranceThemes);
    lines.unshift(
      '## Deterministic entrance cadence for this reply',
      `This is contentful Apa reply number ${cadence.replyNumber} in the current visitor session.`,
      `Session topic cycle: ${cadence.cycleIndex + 1}/5. Opening topic: ${cadence.openingTheme}. Bridge topic: ${cadence.bridgeTheme}.`,
      `Default response state: ${cadence.state}. This state overrides general promotional suggestions.`,
      buildEntranceCadenceInstruction(cadence),
      '',
    );
  }
  if (lastApa) lines.push(`Last complete Apa message: ${lastApa}`);
  lines.push(...compacted.map((entry) => `${entry.role === 'user' ? 'Visitor' : 'Apa'}: ${entry.text}`));
  return lines.join('\n');
}

export function App() {
  const [lang, setLang]           = useState<Language>(URL_LANGUAGE ?? DEFAULT_LANGUAGE);
  const [kioskState, setKiosk]    = useState<KioskState>('idle');
  const [systemPrompt, setPrompt] = useState<string | null>(null);

  const langRef          = useRef(lang);
  const turnState        = useRef<'idle' | 'starting' | 'live' | 'ending'>('idle');
  const pendingEndRef    = useRef(false);
  const errorTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedAt = useRef(0);
  /** True while the visitor is still holding the button — lets a quota failover
   *  retry salvage the current turn instead of losing what they are saying. */
  const buttonHeldRef    = useRef(false);
  const quotaRetries     = useRef(0);
  /** Lets the quota-failover path in onEnd restart the turn without the two
   *  callbacks depending on each other. */
  const startTalkTurnRef = useRef<(() => Promise<void>) | null>(null);
  const transcriptRef    = useRef<TranscriptEntry[]>([]);
  const entranceSessionRef = useRef<EntranceSessionThemes | null>(null);
  const languageLockRef  = useRef<Language | null>(URL_LANGUAGE);
  const tokenRef         = useRef<VoiceToken | null>(null);
  const tokenRequestRef  = useRef<Promise<VoiceToken | null> | null>(null);
  langRef.current = lang;

  // ── Boot: fetch system prompt, warm worklets and request mic permission.
  useEffect(() => {
    refreshDiagnosticDeviceInfo();
    recordDiagnosticEvent('app', 'app_boot', {
      debug: DEBUG_ENABLED,
      url: window.location.href,
      language: langRef.current,
      languageLock: languageLockRef.current,
      appVersion: APP_VERSION,
    });

    // Note: Cloudflare Pages serves static /api/config as octet-stream; we just parse the body.
    fetch(`/api/config?v=${encodeURIComponent(APP_VERSION)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`config HTTP ${r.status}`);
        const text = await r.text();
        return JSON.parse(text) as { appVersion?: string; systemPrompt: string; guideSystemPrompt?: string };
      })
      .then((d) => {
        if (d.appVersion && d.appVersion !== APP_VERSION) {
          recordDiagnosticEvent('app', 'app_version_mismatch', {
            clientVersion: APP_VERSION,
            configVersion: d.appVersion,
          });
        }
        setPrompt(APP_MODE === 'guide' ? (d.guideSystemPrompt ?? d.systemPrompt) : d.systemPrompt);
      })
      .catch((err) => {
        console.error('[config]', err);
        setKiosk('offline');
      });

    // Pre-cache worklets so the first conversation doesn't pay a cold-fetch penalty.
    fetch('/playback-worklet.js').catch(() => {});
    fetch('/capture-worklet.js').catch(() => {});

    requestMicrophonePermission();
  }, []);

  useEffect(() => () => {
    clearTimeout(errorTimer.current ?? undefined);
    clearTimeout(contextTimer.current ?? undefined);
    clearTimeout(thinkingTimer.current ?? undefined);
    clearTimeout(deferredEndTimer.current ?? undefined);
  }, []);

  const showTransientError = useCallback(() => {
    clearTimeout(errorTimer.current ?? undefined);
    recordDiagnosticEvent('app', 'ui_error_visible');
    setKiosk('error');
    errorTimer.current = setTimeout(() => {
      errorTimer.current = null;
      setKiosk('idle');
    }, 3000);
  }, []);

  const showConnectionFallback = useCallback((reason: string, error?: unknown) => {
    clearTimeout(errorTimer.current ?? undefined);
    recordDiagnosticEvent('app', 'ui_offline_visible', {
      reason,
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
    });
    setKiosk('offline');
    errorTimer.current = setTimeout(() => {
      errorTimer.current = null;
      if (turnState.current === 'idle') setKiosk('idle');
    }, 8000);
  }, []);

  const clearThinkingTimeout = useCallback(() => {
    clearTimeout(thinkingTimer.current ?? undefined);
    thinkingTimer.current = null;
  }, []);

  const startThinkingTimeout = useCallback(() => {
    clearThinkingTimeout();
    thinkingTimer.current = setTimeout(() => {
      thinkingTimer.current = null;
      if (turnState.current === 'idle') return;
      console.warn('[voice] thinking timeout; forcing idle recovery');
      recordDiagnosticEvent('app', 'thinking_timeout');
      turnState.current = 'idle';
      pendingEndRef.current = false;
      provider.stop().catch(() => {});
      showTransientError();
    }, APP_MODE === 'guide' ? GUIDE_THINKING_TIMEOUT_MS : KIOSK_THINKING_TIMEOUT_MS);
  }, [clearThinkingTimeout, showTransientError]);

  const isTokenFresh = useCallback((access: VoiceToken | null) => {
    if (!access?.token) return false;
    const expiry = access.newSessionExpireTime ?? access.expiresAt;
    if (!expiry) return true;
    return Date.parse(expiry) - Date.now() > 60_000;
  }, []);

  const fetchVoiceToken = useCallback(async (): Promise<VoiceToken | null> => {
    if (tokenRequestRef.current) return tokenRequestRef.current;
    const tokenStartedAt = performance.now();
    recordDiagnosticEvent('token', 'fetch_started');
    tokenRequestRef.current = fetch('/api/token', { method: 'POST' })
      .then(async (tokenRes) => {
        if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`);
        const data = await tokenRes.json() as {
          token?: string;
          capped?: boolean;
          expiresAt?: string;
          newSessionExpireTime?: string;
        };
        if (data.capped) {
          recordDiagnosticEvent('token', 'capped');
          setKiosk('capped');
          return null;
        }
        if (!data.token) throw new Error('token missing');
        recordDiagnosticEvent('token', 'fetch_succeeded', {
          latencyMs: Math.round(performance.now() - tokenStartedAt),
          hasNewSessionExpiry: Boolean(data.newSessionExpireTime),
        });
        return {
          token: data.token,
          expiresAt: data.expiresAt,
          newSessionExpireTime: data.newSessionExpireTime,
        };
      })
      .catch((err) => {
        recordDiagnosticEvent('token', 'fetch_failed', {
          latencyMs: Math.round(performance.now() - tokenStartedAt),
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      })
      .finally(() => {
        tokenRequestRef.current = null;
      });
    return tokenRequestRef.current;
  }, []);

  const prefetchVoiceToken = useCallback(() => {
    if (isTokenFresh(tokenRef.current)) return;
    recordDiagnosticEvent('token', 'prefetch_started');
    fetchVoiceToken()
      .then((access) => {
        if (isTokenFresh(access)) tokenRef.current = access;
        recordDiagnosticEvent('token', 'prefetch_finished', { cached: isTokenFresh(access) });
      })
      .catch((err) => console.warn('[token prefetch]', err));
  }, [fetchVoiceToken, isTokenFresh]);

  useEffect(() => {
    prefetchVoiceToken();
  }, [prefetchVoiceToken]);

  const takeVoiceToken = useCallback(async (): Promise<VoiceToken | null> => {
    const cached = tokenRef.current;
    if (isTokenFresh(cached)) {
      tokenRef.current = null;
      recordDiagnosticEvent('token', 'cache_hit');
      prefetchVoiceToken();
      return cached;
    }
    tokenRef.current = null;
    recordDiagnosticEvent('token', 'cache_miss');
    const access = await fetchVoiceToken();
    prefetchVoiceToken();
    return access;
  }, [fetchVoiceToken, isTokenFresh, prefetchVoiceToken]);

  const armContextExpiry = useCallback(() => {
    clearTimeout(contextTimer.current ?? undefined);
    contextTimer.current = setTimeout(() => {
      contextTimer.current = null;
      transcriptRef.current = [];
      entranceSessionRef.current = null;
      languageLockRef.current = URL_LANGUAGE;
      const resetLanguage = URL_LANGUAGE ?? DEFAULT_LANGUAGE;
      if (langRef.current !== resetLanguage) setLang(resetLanguage);
    }, SESSION_CONTEXT_TTL_MS);
  }, []);

  const remember = useCallback((entry: TranscriptEntry) => {
    const text = entry.text.trim();
    if (!text) return;
    transcriptRef.current = [...transcriptRef.current, { ...entry, text }];
    armContextExpiry();
  }, [armContextExpiry]);

  const syncUiLanguage = useCallback((entry: TranscriptEntry) => {
    if (entry.role !== 'user' || languageLockRef.current) return;
    const detected = detectLanguageDetailed(entry.text, langRef.current);
    recordDiagnosticEvent('app', 'language_detection_detail', detected);
    if (detected.confidence !== 'strong') return;
    languageLockRef.current = detected.language;
    updateDiagnosticTurn({ language: detected.language, languageLock: detected.language });
    recordDiagnosticEvent('app', 'language_auto_locked', { language: detected.language });
    if (detected.language !== langRef.current) setLang(detected.language);
  }, []);

  const startTalkTurn = useCallback(async () => {
    if (!systemPrompt) return;
    if (turnState.current !== 'idle') return;

    const entranceSession = APP_MODE === 'kiosk'
      ? (entranceSessionRef.current ?? claimEntranceSessionThemes(window.localStorage))
      : null;
    if (entranceSession) entranceSessionRef.current = entranceSession;

    // Route first, so the turn is logged against the adapter that actually runs it.
    selectProvider();

    beginDiagnosticTurn({
      trigger: APP_MODE === 'guide' ? 'guide-button' : 'button',
      provider: provider.name,
      model: provider.model,
      language: langRef.current,
      languageLock: languageLockRef.current,
      contextEntries: transcriptRef.current.length,
      openingTheme: entranceSession?.openingTheme,
      bridgeTheme: entranceSession?.bridgeTheme,
      topicCycleIndex: entranceSession?.cycleIndex,
    });
    if (entranceSession) {
      recordDiagnosticEvent('app', 'entrance_session_selected', entranceSession);
    }
    recordingStartedAt.current = Date.now();
    clearTimeout(deferredEndTimer.current ?? undefined);
    deferredEndTimer.current = null;
    buttonHeldRef.current = true;
    recordDiagnosticEvent('input', 'button_down');
    recordDiagnosticEvent('app', 'provider_route_selected', {
      provider: provider.name,
      ...liveFailoverSnapshot(),
    });
    const warmup = provider.warmupAudio?.();
    warmup
      ?.then(() => recordDiagnosticEvent('playback', 'playback_warmup_succeeded'))
      .catch((err) => recordDiagnosticEvent('playback', 'playback_warmup_failed', {
        message: err instanceof Error ? err.message : String(err),
      }));
    turnState.current = 'starting';
    pendingEndRef.current = false;
    clearTimeout(contextTimer.current ?? undefined);
    recordDiagnosticEvent('app', 'state_preparing');
    setKiosk('preparing');

    recordDiagnosticEvent('app', 'mic_permission_check_started');
    const micReady = await requestMicrophonePermission(true);
    recordDiagnosticEvent('app', 'mic_permission_check_finished', { granted: micReady });
    if (!micReady) {
      turnState.current = 'idle';
      finishDiagnosticTurn('error', { reason: 'mic_permission_denied', error: 'Microphone permission unavailable' });
      showTransientError();
      return;
    }

    try {
      const access = provider.requiresToken === false
        ? { token: '' }
        : await takeVoiceToken();
      if (!access) {
        finishDiagnosticTurn('ended', { reason: 'capped' });
        turnState.current = 'idle';
        return;
      }

      const localGuideContext = guideContext();
      const ctx = buildRecentContext(transcriptRef.current, entranceSession);
      const promptParts = [systemPrompt, localGuideContext, ctx].filter(Boolean);
      if (entranceSession) {
        recordDiagnosticEvent(
          'app',
          'entrance_cadence_selected',
          getEntranceCadence(transcriptRef.current, entranceSession),
        );
      }

      await provider.start(
        {
          maxConversationSeconds: 75,
          initialLanguage: langRef.current,
          languageLock: languageLockRef.current,
          systemPrompt: promptParts.join('\n\n'),
          ephemeralToken: access.token,
        },
        {
          onListening:        () => {
            recordDiagnosticEvent('app', 'state_listening');
            clearThinkingTimeout();
            setKiosk('listening');
          },
          onThinking:         () => {
            recordDiagnosticEvent('app', 'state_thinking');
            setKiosk('thinking');
            startThinkingTimeout();
          },
          onSpeakingStart:    () => {
            recordDiagnosticEvent('app', 'state_speaking');
            clearThinkingTimeout();
            setKiosk('speaking');
          },
          onSpeakingEnd:      () => {
            if (turnState.current === 'idle') {
              clearThinkingTimeout();
              recordDiagnosticEvent('app', 'state_idle_after_speaking');
              setKiosk('idle');
              return;
            }
            recordDiagnosticEvent('app', 'state_thinking_after_speaking');
            setKiosk('thinking');
            startThinkingTimeout();
          },
          onLanguageDetected: (l) => {
            updateDiagnosticTurn({ language: l });
            recordDiagnosticEvent('app', 'language_detected', { language: l });
            if (!languageLockRef.current) setLang(l);
          },
          onDebug: (event, data) => {
            const source = event.startsWith('playback_')
              ? 'playback'
              : event.startsWith('token_')
                ? 'token'
                : 'provider';
            if (
              event === 'provider_first_response_audio' ||
              event === 'guide_pipeline_response_ready' ||
              event === 'guide_pipeline_browser_tts_started' ||
              event === 'playback_started'
            ) {
              clearThinkingTimeout();
            }
            recordDiagnosticEvent(source, event, data);
          },
          onTranscript: (t) => {
            console.log(`[${t.role}]`, t.text);
            recordDiagnosticTranscript(t.role, t.text);
            syncUiLanguage(t);
            remember(t);
          },
          onTimeoutNearing: () => console.log('[voice] timeout nearing'),
          onError: (e) => {
            console.error('[voice]', e);
            clearThinkingTimeout();
            turnState.current = 'idle';
            pendingEndRef.current = false;
            finishDiagnosticTurn('error', { reason: 'provider_error', error: e.message });
            if (isConnectivityError(e)) showConnectionFallback('provider_error', e);
            else showTransientError();
          },
          onEnd: (reason) => {
            clearThinkingTimeout();
            turnState.current = 'idle';
            pendingEndRef.current = false;
            finishDiagnosticTurn('ended', { reason });
            if (reason === 'quota') {
              // The adapter has already parked the exhausted model, so selectProvider()
              // will now route to the next Live model or to the REST pipeline.
              recordDiagnosticEvent('app', 'provider_quota_failover', liveFailoverSnapshot());
              // Still holding the button? Restart straight away so the visitor keeps
              // talking into the new route and never sees the failure. Bounded by the
              // chain length so an all-exhausted key can't loop.
              if (buttonHeldRef.current && quotaRetries.current < MAX_QUOTA_RETRIES) {
                quotaRetries.current += 1;
                recordDiagnosticEvent('app', 'quota_failover_retry', {
                  attempt: quotaRetries.current,
                });
                void startTalkTurnRef.current?.();
                return;
              }
              // Released already — this turn is lost, but the next press uses the new
              // route, so go quiet rather than showing a dead-end "come back later".
              setKiosk('idle');
              return;
            }
            setKiosk('idle');
          },
        },
      );

      // Session is live. If the user already let go, end the turn immediately.
      turnState.current = 'live';
      if (pendingEndRef.current) {
        const remainingMs = MIN_RECORDING_MS - (Date.now() - recordingStartedAt.current);
        if (remainingMs > 0) {
          recordDiagnosticEvent('app', 'queued_end_turn_deferred', { remainingMs });
          deferredEndTimer.current = setTimeout(() => {
            deferredEndTimer.current = null;
            if (turnState.current !== 'live') return;
            pendingEndRef.current = false;
            turnState.current = 'ending';
            recordDiagnosticEvent('app', 'queued_end_turn_consumed_after_min_recording');
            provider.endTurn();
          }, remainingMs);
        } else {
          pendingEndRef.current = false;
          turnState.current = 'ending';
          recordDiagnosticEvent('app', 'queued_end_turn_consumed');
          provider.endTurn();
        }
      }
    } catch (err) {
      console.error('[voice start]', err);
      clearThinkingTimeout();
      turnState.current = 'idle';
      pendingEndRef.current = false;
      provider.stop().catch(() => {});
      finishDiagnosticTurn('error', {
        reason: 'start_failed',
        error: err instanceof Error ? err.message : String(err),
      });
      showConnectionFallback('start_failed', err);
    }
  }, [clearThinkingTimeout, remember, showConnectionFallback, showTransientError, startThinkingTimeout, syncUiLanguage, systemPrompt, takeVoiceToken]);

  startTalkTurnRef.current = startTalkTurn;

  const finishTalkTurn = useCallback(() => {
    recordDiagnosticEvent('input', 'button_up');
    // The hold is over: no further quota retry may salvage this turn, and the next
    // press starts its retry budget fresh.
    buttonHeldRef.current = false;
    quotaRetries.current = 0;
    if (turnState.current === 'idle' || turnState.current === 'ending') return;
    const remainingMs = MIN_RECORDING_MS - (Date.now() - recordingStartedAt.current);
    if (remainingMs > 0) {
      pendingEndRef.current = true;
      clearTimeout(deferredEndTimer.current ?? undefined);
      recordDiagnosticEvent('app', 'end_turn_deferred_for_min_recording', { remainingMs });
      deferredEndTimer.current = setTimeout(() => {
        deferredEndTimer.current = null;
        if (turnState.current === 'starting') {
          pendingEndRef.current = true;
          recordDiagnosticEvent('app', 'end_turn_still_queued_after_min_recording');
          return;
        }
        if (turnState.current === 'idle' || turnState.current === 'ending') return;
        pendingEndRef.current = false;
        turnState.current = 'ending';
        recordDiagnosticEvent('app', 'end_turn_requested_after_min_recording');
        provider.endTurn();
      }, remainingMs);
      return;
    }
    if (turnState.current === 'starting') {
      pendingEndRef.current = true;
      recordDiagnosticEvent('app', 'end_turn_queued');
      return;
    }
    turnState.current = 'ending';
    recordDiagnosticEvent('app', 'end_turn_requested');
    provider.endTurn();
  }, []);

  useEffect(() => {
    input.attach({
      onTalkStart: startTalkTurn,
      onTalkEnd: finishTalkTurn,
      onError: (e) => { console.error('[input]', e); showTransientError(); },
    });
    return () => { input.detach(); };
  }, [finishTalkTurn, showTransientError, startTalkTurn]);

  const handleLanguageChange = useCallback((nextLanguage: Language) => {
    languageLockRef.current = nextLanguage;
    updateDiagnosticTurn({ language: nextLanguage, languageLock: nextLanguage });
    recordDiagnosticEvent('app', 'language_locked', { language: nextLanguage });
    setLang(nextLanguage);
  }, []);

  const handleChipTap = useCallback((id: ScenarioId) => {
    if (turnState.current !== 'idle') return;
    turnState.current = 'live'; // block button presses while chip plays
    setKiosk('thinking');
    chipPlayer.play(
      id,
      langRef.current,
      () => setKiosk('speaking'),
      () => {
        turnState.current = 'idle';
        setKiosk('idle');
      },
    );
  }, []);

  return (
    <>
      {APP_MODE === 'guide' ? (
        <GuideScreen
          lang={lang}
          kioskState={kioskState}
          hall={GUIDE_HALL}
          stand={GUIDE_STAND}
          onTalkStart={startTalkTurn}
          onTalkEnd={finishTalkTurn}
          onLangChange={handleLanguageChange}
        />
      ) : (
        <KioskScreen
          lang={lang}
          kioskState={kioskState}
          onTalkStart={startTalkTurn}
          onTalkEnd={finishTalkTurn}
          onChipTap={handleChipTap}
          onLangChange={handleLanguageChange}
        />
      )}
      {DEBUG_ENABLED && <DebugPanel />}
    </>
  );
}
