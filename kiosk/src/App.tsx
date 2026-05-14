import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, VoiceProvider } from './voice/providers/VoiceProvider';
import type { KioskState } from './types';
import { KioskScreen } from './ui/KioskScreen';
import type { ScenarioId } from './ui/ScenarioChips';
import { GeminiVoiceProvider } from './voice/providers/gemini';
import { OpenAIRealtimeProvider } from './voice/providers/openai';
import { DemoVoiceProvider } from './voice/providers/demo';
import { ArcadeButtonMic } from './audio/inputs/ArcadeButtonMic';
import { AttractLoop } from './audio/AttractLoop';
import { ChipResponsePlayer } from './audio/ChipResponsePlayer';

type ProviderKind = 'gemini' | 'openai' | 'demo';
type VoiceAccess = {
  token: string;
  provider: ProviderKind;
  expiresAt: number | null;
};

const IS_PAGES_DEMO = import.meta.env.VITE_PAGES_DEMO === '1';
const DEMO_PROMPT = 'GitHub Pages demo mode. Static UI test only; realtime voice requires the local kiosk server.';

const input    = new ArcadeButtonMic();
const attract  = new AttractLoop();
const chipPlayer = new ChipResponsePlayer();

async function requestMicrophonePermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    console.warn('[mic permission]', err);
    return false;
  }
}

function createProvider(kind: ProviderKind): VoiceProvider {
  if (kind === 'demo') return new DemoVoiceProvider();
  return kind === 'openai' ? new OpenAIRealtimeProvider() : new GeminiVoiceProvider();
}

function logConversation(lang: string, trigger: string, startedAt: number, model: string) {
  const duration_s = Math.round((Date.now() - startedAt) / 1000);
  if (duration_s < 2) return; // ignore accidental taps
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang, trigger, duration_s, model }),
  }).catch(() => {/* log failures are non-fatal */});
}

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
  const nextVoiceAccess = useRef<VoiceAccess | null>(null);
  const voiceAccessRequest = useRef<Promise<VoiceAccess | null> | null>(null);
  langRef.current = lang;

  const resetConversation = useCallback((shouldLog: boolean) => {
    if (shouldLog && convStart.current !== null && !IS_PAGES_DEMO) {
      logConversation(langRef.current, convTrigger.current, convStart.current, providerRef.current.model);
    }
    convStart.current = null;
    startInProgress.current = false;
    endRequested.current = false;
  }, []);

  const isVoiceAccessFresh = useCallback((access: VoiceAccess | null) => {
    if (!access) return false;
    return access.expiresAt === null || access.expiresAt > Date.now() + 30_000;
  }, []);

  const fetchVoiceAccess = useCallback(async (): Promise<VoiceAccess | null> => {
    if (IS_PAGES_DEMO) {
      return { token: 'demo-token', provider: 'demo', expiresAt: null };
    }

    if (voiceAccessRequest.current) return voiceAccessRequest.current;

    voiceAccessRequest.current = fetch('/api/token', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`token request failed: ${response.status}`);
        }

        const data = await response.json() as {
          token?: string;
          capped?: boolean;
          provider?: ProviderKind;
          expiresAt?: string;
        };

        if (data.capped) {
          setKiosk('capped');
          return null;
        }

        if (!data.token) {
          throw new Error('token missing from /api/token response');
        }

        return {
          token: data.token,
          provider: data.provider ?? 'gemini',
          expiresAt: data.expiresAt ? Date.parse(data.expiresAt) : null,
        };
      })
      .finally(() => {
        voiceAccessRequest.current = null;
      });

    return voiceAccessRequest.current;
  }, []);

  const prefetchVoiceAccess = useCallback(() => {
    if (IS_PAGES_DEMO || isVoiceAccessFresh(nextVoiceAccess.current)) return;
    fetchVoiceAccess()
      .then((access) => {
        if (access && isVoiceAccessFresh(access)) nextVoiceAccess.current = access;
      })
      .catch((err) => {
        console.warn('[token prefetch]', err);
      });
  }, [fetchVoiceAccess, isVoiceAccessFresh]);

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

  const providerConfig = useCallback((sessionToken: string, inputMode: 'audio' | 'text' = 'audio') => ({
    maxConversationSeconds: 75,
    inputMode,
    initialLanguage: langRef.current,
    systemPrompt: systemPrompt ?? '',
    ephemeralToken: sessionToken,
  }), [systemPrompt]);

  const requestVoiceAccess = useCallback(async (): Promise<string | null> => {
    const access = isVoiceAccessFresh(nextVoiceAccess.current)
      ? nextVoiceAccess.current
      : await fetchVoiceAccess();

    nextVoiceAccess.current = null;
    if (!access) return null;

    providerRef.current = createProvider(access.provider);
    prefetchVoiceAccess();
    return access.token;
  }, [fetchVoiceAccess, isVoiceAccessFresh, prefetchVoiceAccess]);

  const events = useCallback(() => ({
    onListening:        () => setKiosk('listening'),
    onThinking:         () => setKiosk('thinking'),
    onSpeakingStart:    () => setKiosk('speaking'),
    onSpeakingEnd:      () => {
      resetConversation(true);
      setKiosk('idle');
      providerRef.current.stop().catch(() => {});
    },
    onLanguageDetected: (l: Language) => setLang(l),
    onTranscript:       (t: { role: 'user' | 'ap'; text: string }) => console.log(`[${t.role}]`, t.text),
    onTimeoutNearing:   () => console.log('[voice] timeout nearing'),
    onError:            (e: Error) => {
      console.error('[voice]', e);
      resetConversation(false);
      setKiosk('error');
      setTimeout(() => setKiosk('idle'), 3000);
    },
    onEnd:              (_r: string) => {
      resetConversation(true);
      setKiosk('idle');
    },
  }), [resetConversation]);

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
      onTalkStart: async () => {
        if (!systemPrompt) return;
        if (startInProgress.current || convStart.current !== null) return;
        startInProgress.current = true;
        endRequested.current = false;
        try {
          const sessionToken = await requestVoiceAccess();
          if (!sessionToken) {
            resetConversation(false);
            return;
          }
          convStart.current  = Date.now();
          convTrigger.current = 'button';
          setKiosk('listening');
          await providerRef.current.start(providerConfig(sessionToken, 'audio'), events());
          startInProgress.current = false;
          if (endRequested.current) providerRef.current.endTurn();
        } catch (e) {
          console.error('[voice start]', e);
          providerRef.current.stop().catch(() => {});
          resetConversation(false);
          setKiosk('error');
          setTimeout(() => setKiosk('idle'), 3000);
        }
      },
      onTalkEnd: finishTalkTurn,
      onError:   (e) => { console.error('[input]', e); setKiosk('error'); setTimeout(() => setKiosk('idle'), 3000); },
    });
    return () => { input.detach(); };
  }, [systemPrompt, providerConfig, events, requestVoiceAccess, resetConversation]);

  const handleTalkStart = useCallback(async () => {
    if (!systemPrompt) return;
    if (startInProgress.current || convStart.current !== null) return;
    startInProgress.current = true;
    endRequested.current = false;
    try {
      const sessionToken = await requestVoiceAccess();
      if (!sessionToken) {
        resetConversation(false);
        return;
      }
      convStart.current   = Date.now();
      convTrigger.current = 'button';
      setKiosk('listening');
      await providerRef.current.start(providerConfig(sessionToken, 'audio'), events());
      startInProgress.current = false;
      if (endRequested.current) providerRef.current.endTurn();
    } catch (e) {
      console.error('[voice start]', e);
      providerRef.current.stop().catch(() => {});
      resetConversation(false);
      setKiosk('error');
      setTimeout(() => setKiosk('idle'), 3000);
    }
  }, [systemPrompt, providerConfig, events, requestVoiceAccess, resetConversation]);

  const handleTalkEnd = finishTalkTurn;

  const handleChipTap = useCallback(async (id: ScenarioId) => {
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
