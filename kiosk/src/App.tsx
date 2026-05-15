import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, VoiceProvider } from './voice/providers/VoiceProvider';
import type { KioskState } from './types';
import { KioskScreen } from './ui/KioskScreen';
import type { ScenarioId } from './ui/ScenarioChips';
import type { VoiceAccess } from './voice/providerFactory';
import { createProvider } from './voice/providerFactory';
import { fetchVoiceAccess, isVoiceAccessFresh } from './voice/voiceAccess';
import { logConversation } from './voice/conversationLog';
import { ArcadeButtonMic } from './audio/inputs/ArcadeButtonMic';
import { requestMicrophonePermission } from './audio/microphonePermission';
import { AttractLoop } from './audio/AttractLoop';
import { ChipResponsePlayer } from './audio/ChipResponsePlayer';

const IS_PAGES_DEMO = import.meta.env.VITE_PAGES_DEMO === '1';
const DEMO_PROMPT = 'GitHub Pages demo mode. Static UI test only; realtime voice requires the local kiosk server.';

const input    = new ArcadeButtonMic();
const attract  = new AttractLoop();
const chipPlayer = new ChipResponsePlayer();
const SESSION_CONTEXT_TTL_MS = 30_000;

type TranscriptEntry = {
  role: 'user' | 'ap';
  text: string;
};

export function App() {
  const [lang, setLang]           = useState<Language>('es');
  const [kioskState, setKiosk]    = useState<KioskState>('idle');
  const [systemPrompt, setPrompt] = useState<string | null>(null);
  const providerRef = useRef<VoiceProvider>(createProvider(IS_PAGES_DEMO ? 'demo' : 'gemini'));
  const langRef    = useRef(lang);
  const convStart  = useRef<number | null>(null);
  const convTrigger = useRef<string>('button');
  const startInProgress = useRef(false);
  const endRequested = useRef(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextVoiceAccess = useRef<VoiceAccess | null>(null);
  const voiceAccessRequest = useRef<Promise<VoiceAccess | null> | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  langRef.current = lang;

  const resetConversation = useCallback((shouldLog: boolean) => {
    if (shouldLog && convStart.current !== null && !IS_PAGES_DEMO) {
      logConversation(langRef.current, convTrigger.current, convStart.current, providerRef.current.model);
    }
    convStart.current = null;
    startInProgress.current = false;
    endRequested.current = false;
  }, []);

  const fetchVoiceAccessOnce = useCallback(async (): Promise<VoiceAccess | null> => {
    if (voiceAccessRequest.current) return voiceAccessRequest.current;

    voiceAccessRequest.current = fetchVoiceAccess(IS_PAGES_DEMO, () => setKiosk('capped'))
      .finally(() => { voiceAccessRequest.current = null; });

    return voiceAccessRequest.current;
  }, []);

  const prefetchVoiceAccess = useCallback(() => {
    if (IS_PAGES_DEMO || isVoiceAccessFresh(nextVoiceAccess.current)) return;
    fetchVoiceAccessOnce()
      .then((access) => {
        if (access && isVoiceAccessFresh(access)) nextVoiceAccess.current = access;
      })
      .catch((err) => {
        console.warn('[token prefetch]', err);
      });
  }, [fetchVoiceAccessOnce]);

  // Fetch system prompt + token once on mount; load attract manifest
  useEffect(() => {
    if (IS_PAGES_DEMO) {
      setPrompt(DEMO_PROMPT);
      providerRef.current = createProvider('demo');
      attract.load();
      return;
    }

    fetch('/api/config')
      .then((r) => r.json())
      .then((d: { systemPrompt: string }) => setPrompt(d.systemPrompt))
      .catch(() => setKiosk('offline'));

    requestMicrophonePermission();
    attract.load();
    prefetchVoiceAccess();
  }, [prefetchVoiceAccess]);

  // Attract loop: play idle clips when kiosk is idle, stop during conversation
  useEffect(() => {
    if (kioskState === 'idle' || kioskState === 'capped') {
      attract.start(langRef.current);
    } else {
      attract.stop();
    }
  }, [kioskState]);

  // Keep attract loop's language in sync
  useEffect(() => {
    attract.setLang(lang);
  }, [lang]);

  const showTransientError = useCallback(() => {
    clearTimeout(errorTimer.current ?? undefined);
    setKiosk('error');
    errorTimer.current = setTimeout(() => {
      errorTimer.current = null;
      setKiosk('idle');
    }, 3000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(errorTimer.current ?? undefined);
  }, []);

  useEffect(() => {
    return () => clearTimeout(contextTimer.current ?? undefined);
  }, []);

  const armContextExpiry = useCallback(() => {
    clearTimeout(contextTimer.current ?? undefined);
    contextTimer.current = setTimeout(() => {
      contextTimer.current = null;
      transcriptRef.current = [];
    }, SESSION_CONTEXT_TTL_MS);
  }, []);

  const rememberTranscript = useCallback((entry: TranscriptEntry) => {
    const text = entry.text.trim();
    if (!text) return;

    transcriptRef.current = [
      ...transcriptRef.current,
      { ...entry, text },
    ];
    armContextExpiry();
  }, [armContextExpiry]);

  const providerConfig = useCallback((sessionToken: string) => ({
    maxConversationSeconds: 75,
    initialLanguage: langRef.current,
    systemPrompt: [
      systemPrompt ?? '',
      transcriptRef.current.length > 0
        ? [
            '## Recent local kiosk context',
            'Use this only to preserve continuity across push-to-talk turns.',
            'Keep the active kiosk language if this context conflicts with the current visitor speech.',
            ...transcriptRef.current.map((entry) => `${entry.role === 'user' ? 'Visitor' : 'Apa'}: ${entry.text}`),
          ].join('\n')
        : '',
    ].filter(Boolean).join('\n\n'),
    ephemeralToken: sessionToken,
  }), [systemPrompt]);

  const requestVoiceAccess = useCallback(async (): Promise<string | null> => {
    const access = isVoiceAccessFresh(nextVoiceAccess.current)
      ? nextVoiceAccess.current
      : await fetchVoiceAccessOnce();

    nextVoiceAccess.current = null;
    if (!access) return null;

    providerRef.current = createProvider(access.provider);
    prefetchVoiceAccess();
    return access.token;
  }, [fetchVoiceAccessOnce, prefetchVoiceAccess]);

  const events = useCallback(() => ({
    onListening:        () => setKiosk('listening'),
    onThinking:         () => setKiosk('thinking'),
    onSpeakingStart:    () => setKiosk('speaking'),
    onSpeakingEnd:      () => setKiosk(convStart.current !== null ? 'thinking' : 'idle'),
    onLanguageDetected: (l: Language) => setLang(l),
    onTranscript:       (t: TranscriptEntry) => {
      console.log(`[${t.role}]`, t.text);
      rememberTranscript(t);
    },
    onTimeoutNearing:   () => console.log('[voice] timeout nearing'),
    onError:            (e: Error) => {
      console.error('[voice]', e);
      resetConversation(false);
      showTransientError();
    },
    onEnd:              (_r: string) => {
      resetConversation(true);
      setKiosk('idle');
    },
  }), [rememberTranscript, resetConversation, showTransientError]);

  const startTalkTurn = useCallback(async () => {
    if (!systemPrompt) return;
    if (startInProgress.current || convStart.current !== null) return;

    clearTimeout(contextTimer.current ?? undefined);
    startInProgress.current = true;
    endRequested.current = false;

    try {
      const sessionToken = await requestVoiceAccess();
      if (!sessionToken) {
        resetConversation(false);
        return;
      }

      convStart.current = Date.now();
      convTrigger.current = 'button';
      setKiosk('listening');
      await providerRef.current.start(providerConfig(sessionToken), events());
      startInProgress.current = false;
      if (endRequested.current) providerRef.current.endTurn();
    } catch (e) {
      console.error('[voice start]', e);
      providerRef.current.stop().catch(() => {});
      resetConversation(false);
      showTransientError();
    }
  }, [events, providerConfig, requestVoiceAccess, resetConversation, showTransientError, systemPrompt]);

  const finishTalkTurn = useCallback(() => {
    if (startInProgress.current) {
      endRequested.current = true;
      return;
    }
    providerRef.current.endTurn();
  }, []);

  // Wire physical / keyboard input source
  useEffect(() => {
    input.attach({
      onTalkStart: startTalkTurn,
      onTalkEnd: finishTalkTurn,
      onError:   (e) => { console.error('[input]', e); showTransientError(); },
    });
    return () => { input.detach(); };
  }, [finishTalkTurn, showTransientError, startTalkTurn]);

  const handleTalkStart = startTalkTurn;

  const handleTalkEnd = finishTalkTurn;

  const handleChipTap = useCallback((id: ScenarioId) => {
    if (startInProgress.current || convStart.current !== null) return;
    startInProgress.current = true;
    endRequested.current = false;
    setKiosk('thinking');
    chipPlayer.play(id, langRef.current, () => {
      startInProgress.current = false;
      setKiosk('speaking');
    }, () => {
      providerRef.current.stop().catch(() => {});
      resetConversation(false);
      setKiosk('idle');
    });
  }, [resetConversation]);

  return (
    <KioskScreen
      lang={lang}
      kioskState={kioskState}
      onTalkStart={handleTalkStart}
      onTalkEnd={handleTalkEnd}
      onChipTap={handleChipTap}
      onLangChange={setLang}
    />
  );
}
