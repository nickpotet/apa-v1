// Self-update for the unattended kiosk.
//
// The venue kiosk is an Android WebView that never reloads on its own: after the
// 1.0.8 deploy it kept serving 1.0.6 to visitors for ~18 hours, so every fix only
// reached the street after someone restarted the panel by hand. This polls the
// deployed version and reloads once the kiosk is idle.

import { APP_VERSION } from './appVersion';

const POLL_MS = 5 * 60_000;
const IDLE_CHECK_MS = 15_000;
/** If a reload for this version didn't take (e.g. a stale cached index.html),
 *  don't retry it in a loop — wait this long before trying again. */
const RETRY_AFTER_MS = 30 * 60_000;
const RELOAD_MARK = 'apa.auto-update-reload';

async function deployedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    // Pages serves this extension-less static file as octet-stream — parse the text.
    const data = JSON.parse(await res.text()) as { appVersion?: unknown };
    return typeof data.appVersion === 'string' ? data.appVersion : null;
  } catch {
    return null; // Offline or mid-deploy: just try again next poll.
  }
}

function recentlyTried(version: string): boolean {
  try {
    const mark = JSON.parse(sessionStorage.getItem(RELOAD_MARK) ?? 'null') as
      { version: string; at: number } | null;
    return mark?.version === version && Date.now() - mark.at < RETRY_AFTER_MS;
  } catch {
    return false;
  }
}

/**
 * Reload into a newly deployed version as soon as the kiosk is idle.
 * `isIdle` must say no while a visitor could be mid-interaction.
 * Returns a cleanup function.
 */
export function watchForNewVersion(
  isIdle: () => boolean,
  onReload?: (from: string, to: string) => void,
): () => void {
  let pending: string | null = null;

  const poll = async () => {
    const version = await deployedVersion();
    if (version && version !== APP_VERSION && !recentlyTried(version)) pending = version;
  };

  const maybeReload = () => {
    if (!pending || !isIdle()) return;
    try {
      sessionStorage.setItem(RELOAD_MARK, JSON.stringify({ version: pending, at: Date.now() }));
    } catch {
      // Storage blocked: the reload still happens; only the loop guard is lost.
    }
    onReload?.(APP_VERSION, pending);
    window.location.reload();
  };

  void poll();
  const pollTimer = window.setInterval(() => void poll(), POLL_MS);
  const idleTimer = window.setInterval(maybeReload, IDLE_CHECK_MS);
  return () => {
    window.clearInterval(pollTimer);
    window.clearInterval(idleTimer);
  };
}
