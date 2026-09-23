import { useEffect, useState } from 'react';
import { getDiagnosticStore, refreshDiagnosticDeviceInfo, serializeDiagnostics } from '../voice/diagnostics';

function formatData(data?: Record<string, unknown>): string {
  if (!data) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function DebugPanel() {
  const [, rerender] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    refreshDiagnosticDeviceInfo();
    const timer = window.setInterval(() => rerender((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, []);

  const diagnostics = getDiagnosticStore();
  const active = diagnostics.activeTurn;
  const latest = active ?? diagnostics.recentTurns[0] ?? null;
  const events = diagnostics.recentEvents.slice(0, 12);
  const latestEvent = events[0] ?? null;
  const archiveCount = diagnostics.archiveTurns.length;

  const copyAll = async () => {
    const text = serializeDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    window.setTimeout(() => setCopyStatus('idle'), 1800);
  };

  return (
    <aside className={`fixed inset-x-2 z-50 rounded-lg border border-white/20 bg-black/82 p-3 text-[11px] leading-snug text-white shadow-2xl backdrop-blur ${expanded ? 'top-24 max-h-[62vh] overflow-auto' : 'top-24'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold">Apa debug</div>
          <div className="text-white/70">{diagnostics.deviceId}</div>
          {!expanded && latest && (
            <div className="mt-1 text-white/75">
              {latest.status} / {latest.reason ?? 'active'} / {events.length} events
            </div>
          )}
          {!expanded && latestEvent && (
            <div className="mt-1 truncate text-white/55">
              {latestEvent.source} {latestEvent.event}
            </div>
          )}
          {!expanded && archiveCount > 0 && (
            <div className="mt-1 text-white/55">
              saved turns: {archiveCount}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded border border-white/20 bg-white/10 px-2 py-1 font-semibold text-white"
            onClick={copyAll}
          >
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy all'}
          </button>
          <button
            type="button"
            className="rounded border border-white/20 bg-white/10 px-2 py-1 font-semibold text-white"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-white/80">
            <div>{String(diagnostics.device.maxTouchPoints ?? 0)} touch</div>
            <div>{String(diagnostics.device.viewport ? (diagnostics.device.viewport as { width?: number; height?: number }).width : '?')}x{String(diagnostics.device.viewport ? (diagnostics.device.viewport as { width?: number; height?: number }).height : '?')}</div>
            <div>media: {String(diagnostics.device.hasMediaDevices)}</div>
            <div>secure: {String(diagnostics.device.isSecureContext)}</div>
            <div>audio: {String(diagnostics.device.hasAudioContext)}</div>
            <div>worklet: {String(diagnostics.device.hasAudioWorklet)}</div>
          </div>

          {latest && (
            <div className="my-2 rounded border border-white/10 bg-white/8 p-2">
              <div className="font-semibold">{latest.id}</div>
              <div className="text-white/75">
                {latest.status} / {latest.reason ?? 'active'} / {latest.language}
              </div>
              <div className="text-white/65">
                events {latest.events.length}, transcripts {latest.transcripts.length}
              </div>
            </div>
          )}

          <div className="mb-2 text-white/65">
            archived turns: {archiveCount}
          </div>

          <div className="space-y-1">
            {events.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="border-t border-white/10 pt-1">
                <span className="text-sky-200">{entry.source}</span>
                <span className="text-white/50"> {entry.atMs}ms </span>
                <span>{entry.event}</span>
                {entry.data && <div className="break-words text-white/55">{formatData(entry.data)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
