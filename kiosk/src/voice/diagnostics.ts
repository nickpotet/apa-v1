import type { Language } from './providers/VoiceProvider';
import type { EntranceTheme, OpeningTheme } from './entranceCadence';
import { APP_VERSION } from '../config/appVersion';

type EventSource = 'app' | 'provider' | 'playback' | 'input' | 'token';

type DiagnosticTranscript = {
  atMs: number;
  role: 'user' | 'ap';
  text: string;
};

type DiagnosticEvent = {
  atMs: number;
  source: EventSource;
  event: string;
  data?: Record<string, unknown>;
};

type DiagnosticTurn = {
  id: string;
  appVersion: string;
  status: 'active' | 'ended' | 'error';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  trigger: string;
  provider: string;
  model: string;
  language: Language;
  languageLock: Language | null;
  contextEntries: number;
  openingTheme?: OpeningTheme;
  bridgeTheme?: EntranceTheme;
  topicCycleIndex?: number;
  reason?: string;
  error?: string;
  events: DiagnosticEvent[];
  transcripts: DiagnosticTranscript[];
};

type DiagnosticsStore = {
  appVersion: string;
  deviceId: string;
  device: Record<string, unknown>;
  activeTurn: DiagnosticTurn | null;
  recentTurns: DiagnosticTurn[];
  archiveTurns: DiagnosticTurn[];
  recentEvents: Array<DiagnosticEvent & { turnId?: string; at: string }>;
};

declare global {
  interface Window {
    __apaDiagnostics?: DiagnosticsStore;
  }
}

const MAX_RECENT_TURNS = 20;
const MAX_RECENT_EVENTS = 100;
const MAX_ARCHIVE_TURNS = 400;
const ARCHIVE_STORAGE_KEY = 'apaConversationArchive';
const DURABLE_LOG_QUEUE_KEY = 'apaDurableLogQueue';
const MAX_DURABLE_LOG_QUEUE = 100;

type DurableLogItem = {
  id: string;
  queuedAt: string;
  attempts: number;
  payload: Record<string, unknown>;
};

function createDeviceId(): string {
  const existing = localStorage.getItem('apaDeviceId');
  if (existing) return existing;
  const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('apaDeviceId', id);
  return id;
}

function collectDeviceInfo(): Record<string, unknown> {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    language: navigator.language,
    languages: navigator.languages,
    isSecureContext: window.isSecureContext,
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasAudioContext: Boolean(window.AudioContext),
    hasWebkitAudioContext: Boolean((window as Window & { webkitAudioContext?: unknown }).webkitAudioContext),
    hasAudioWorklet: Boolean(window.AudioWorkletNode),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  };
}

function loadArchivedTurns(): DiagnosticTurn[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DiagnosticTurn => Boolean(item && typeof item === 'object' && 'id' in item));
  } catch {
    return [];
  }
}

function saveArchivedTurns(turns: DiagnosticTurn[]): void {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(turns));
  } catch {}
}

function loadDurableLogQueue(): DurableLogItem[] {
  try {
    const raw = localStorage.getItem(DURABLE_LOG_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as DurableLogItem[] : [];
  } catch {
    return [];
  }
}

function saveDurableLogQueue(queue: DurableLogItem[]): void {
  try {
    localStorage.setItem(DURABLE_LOG_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_DURABLE_LOG_QUEUE)));
  } catch {}
}

const store: DiagnosticsStore = window.__apaDiagnostics ?? {
  appVersion: APP_VERSION,
  deviceId: createDeviceId(),
  device: collectDeviceInfo(),
  activeTurn: null,
  recentTurns: [],
  archiveTurns: loadArchivedTurns(),
  recentEvents: [],
};

store.appVersion = APP_VERSION;
window.__apaDiagnostics = store;

let turnCounter = 0;

function nowMs(startedAt: string): number {
  return Math.max(0, Math.round(Date.now() - Date.parse(startedAt)));
}

function currentTurn(): DiagnosticTurn | null {
  return store.activeTurn;
}

function pushRecentTurn(turn: DiagnosticTurn): void {
  store.recentTurns = [turn, ...store.recentTurns].slice(0, MAX_RECENT_TURNS);
  store.archiveTurns = [turn, ...store.archiveTurns].slice(0, MAX_ARCHIVE_TURNS);
  saveArchivedTurns(store.archiveTurns);
  window.__apaDiagnostics = store;
}

function postDiagnosticLog(payload: Record<string, unknown>): void {
  const body = JSON.stringify({
    appVersion: APP_VERSION,
    deviceId: store.deviceId,
    device: store.device,
    page: {
      href: window.location.href,
      referrer: document.referrer,
    },
    ...payload,
  });

  void fetch('/api/log', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}

function withEnvelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    appVersion: APP_VERSION,
    deviceId: store.deviceId,
    device: store.device,
    page: {
      href: window.location.href,
      referrer: document.referrer,
    },
    ...payload,
  };
}

async function sendDurableLog(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/log', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`log HTTP ${response.status}`);
}

function enqueueDurableLog(payload: Record<string, unknown>): void {
  const queue = loadDurableLogQueue();
  const id = String(payload.turnId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const withoutExisting = queue.filter((item) => item.id !== id);
  withoutExisting.push({
    id,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    payload,
  });
  saveDurableLogQueue(withoutExisting);
}

async function flushDurableLogQueue(): Promise<void> {
  const queue = loadDurableLogQueue();
  if (!queue.length) return;
  const remaining: DurableLogItem[] = [];
  for (const item of queue) {
    try {
      await sendDurableLog(item.payload);
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  saveDurableLogQueue(remaining);
}

function postTurnLog(turn: DiagnosticTurn): void {
  const payload = withEnvelope({
    kind: 'voice_turn',
    appVersion: turn.appVersion,
    turnId: turn.id,
    status: turn.status,
    startedAt: turn.startedAt,
    endedAt: turn.endedAt,
    durationMs: turn.durationMs,
    lang: turn.language,
    languageLock: turn.languageLock,
    trigger: turn.trigger,
    provider: turn.provider,
    model: turn.model,
    contextEntries: turn.contextEntries,
    openingTheme: turn.openingTheme,
    bridgeTheme: turn.bridgeTheme,
    topicCycleIndex: turn.topicCycleIndex,
    reason: turn.reason,
    error: turn.error,
    duration_s: turn.durationMs ? turn.durationMs / 1000 : 0,
    events: turn.events,
    transcripts: turn.transcripts,
  });

  void flushDurableLogQueue()
    .catch(() => {})
    .then(() => sendDurableLog(payload))
    .catch(() => enqueueDurableLog(payload));
}

function pushRecentEvent(event: DiagnosticEvent & { turnId?: string; at: string }): void {
  store.recentEvents = [event, ...store.recentEvents].slice(0, MAX_RECENT_EVENTS);
  window.__apaDiagnostics = store;
}

window.setTimeout(() => { void flushDurableLogQueue(); }, 1000);
window.addEventListener('online', () => { void flushDurableLogQueue(); });

export function beginDiagnosticTurn(meta: {
  trigger: string;
  provider: string;
  model: string;
  language: Language;
  languageLock: Language | null;
  contextEntries: number;
  openingTheme?: OpeningTheme;
  bridgeTheme?: EntranceTheme;
  topicCycleIndex?: number;
}): string {
  const id = `turn-${Date.now()}-${++turnCounter}`;
  const turn: DiagnosticTurn = {
    id,
    appVersion: APP_VERSION,
    status: 'active',
    startedAt: new Date().toISOString(),
    trigger: meta.trigger,
    provider: meta.provider,
    model: meta.model,
    language: meta.language,
    languageLock: meta.languageLock,
    contextEntries: meta.contextEntries,
    openingTheme: meta.openingTheme,
    bridgeTheme: meta.bridgeTheme,
    topicCycleIndex: meta.topicCycleIndex,
    events: [],
    transcripts: [],
  };
  store.activeTurn = turn;
  window.__apaDiagnostics = store;
  recordDiagnosticEvent('app', 'turn_started', {
    turnId: id,
    appVersion: APP_VERSION,
    contextEntries: meta.contextEntries,
    language: meta.language,
    languageLock: meta.languageLock,
    openingTheme: meta.openingTheme,
    bridgeTheme: meta.bridgeTheme,
    topicCycleIndex: meta.topicCycleIndex,
  });
  return id;
}

export function updateDiagnosticTurn(meta: Partial<Pick<DiagnosticTurn,
  'provider' | 'model' | 'language' | 'languageLock' | 'openingTheme' | 'bridgeTheme' | 'topicCycleIndex'
>>): void {
  const turn = currentTurn();
  if (!turn) return;
  if (meta.provider) turn.provider = meta.provider;
  if (meta.model) turn.model = meta.model;
  if (meta.language) turn.language = meta.language;
  if (meta.languageLock !== undefined) turn.languageLock = meta.languageLock;
  if (meta.openingTheme !== undefined) turn.openingTheme = meta.openingTheme;
  if (meta.bridgeTheme !== undefined) turn.bridgeTheme = meta.bridgeTheme;
  if (meta.topicCycleIndex !== undefined) turn.topicCycleIndex = meta.topicCycleIndex;
  window.__apaDiagnostics = store;
}

export function recordDiagnosticEvent(source: EventSource, event: string, data?: Record<string, unknown>): void {
  const turn = currentTurn();
  const entry = {
    atMs: turn ? nowMs(turn.startedAt) : 0,
    source,
    event,
    data,
  };
  if (turn) turn.events.push(entry);
  const at = new Date().toISOString();
  pushRecentEvent({ ...entry, turnId: turn?.id, at });
  postDiagnosticLog({
    kind: 'voice_event',
    turnId: turn?.id,
    at,
    ...entry,
  });
  window.__apaDiagnostics = store;
}

export function recordDiagnosticTranscript(role: 'user' | 'ap', text: string): void {
  const turn = currentTurn();
  if (!turn) return;
  const clean = text.trim();
  if (!clean) return;
  turn.transcripts.push({
    atMs: nowMs(turn.startedAt),
    role,
    text: clean,
  });
  postDiagnosticLog({
    kind: 'voice_transcript',
    turnId: turn.id,
    at: new Date().toISOString(),
    atMs: nowMs(turn.startedAt),
    role,
    text: clean,
  });
  window.__apaDiagnostics = store;
}

export function finishDiagnosticTurn(
  status: 'ended' | 'error',
  details: { reason: string; error?: string },
): void {
  const turn = currentTurn();
  if (!turn) return;
  turn.status = status;
  turn.reason = details.reason;
  turn.error = details.error;
  turn.endedAt = new Date().toISOString();
  turn.durationMs = Math.max(0, Date.parse(turn.endedAt) - Date.parse(turn.startedAt));
  recordDiagnosticEvent('app', status === 'error' ? 'turn_failed' : 'turn_finished', {
    reason: details.reason,
    error: details.error,
  });
  store.activeTurn = null;
  pushRecentTurn(turn);
  postTurnLog(turn);
}

export function refreshDiagnosticDeviceInfo(): void {
  store.device = collectDeviceInfo();
  window.__apaDiagnostics = store;
  postDiagnosticLog({
    kind: 'device_snapshot',
    at: new Date().toISOString(),
  });
}

export function getDiagnosticStore(): DiagnosticsStore {
  return store;
}

export function serializeDiagnostics(): string {
  return JSON.stringify({
    copiedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    deviceId: store.deviceId,
    device: store.device,
    activeTurn: store.activeTurn,
    recentTurns: store.recentTurns,
    archiveTurns: store.archiveTurns,
    recentEvents: store.recentEvents,
    page: {
      href: window.location.href,
      referrer: document.referrer,
    },
  }, null, 2);
}
