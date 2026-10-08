// Durable upload queue for conversation logs.
//
// Every finished turn is written to localStorage first and uploaded from there,
// so a reload, a network drop or a crash mid-upload never loses it.
//
// 2026-10-08: venue logs were arriving 1–4 days late, ~60 KB per page load
// (about 7–8 turns of ~8 KB). Fixed here:
//  - uploads used fetch keepalive, whose body budget is 64 KB in flight. The
//    queue does not need keepalive — what fails to send stays queued;
//  - overlapping flushes each read the queue, then wrote back "what is left",
//    dropping turns enqueued meanwhile and sending others twice.
// So: one flush at a time per page, and only the items actually sent are removed.
// A re-send can still happen (a reload aborts an upload the server already
// stored), so /api/log must stay idempotent.
//
// The list lives in memory and is written through to storage: a backlog can reach
// ~800 KB, too much to re-parse on every turn end on the kiosk's WebView.

type DurableLogItem = {
  id: string;
  /** Times the server refused this item; it is dropped at maxRejections. Older
   *  builds also stored an `attempts` field (offline included) — ignored now. */
  rejections?: number;
  payload: Record<string, unknown>;
};

export function createDurableLogQueue(options: {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  key: string;
  maxItems: number;
  send: (payload: Record<string, unknown>) => Promise<void>;
  /** True when the server refused this payload itself (4xx): it is skipped this run
   *  and dropped after maxRejections, so it cannot block every later turn. Any
   *  other failure (offline, timeout, server down) stops the run, charging no one. */
  isRejected: (err: unknown) => boolean;
  maxRejections: number;
  /** Called whenever turns are dropped, so the loss is visible somewhere. */
  onDrop?: (reason: 'rejected' | 'overflow', count: number) => void;
}) {
  const { storage, key, maxItems, send, isRejected, maxRejections, onDrop } = options;

  const load = (): DurableLogItem[] => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as DurableLogItem[] : [];
    } catch {
      return [];
    }
  };

  let items = load();

  /** Persist, then adopt. False when storage refused the write (quota). */
  const commit = (next: DurableLogItem[]): boolean => {
    const kept = next.slice(-maxItems);
    try {
      storage.setItem(key, JSON.stringify(kept));
    } catch {
      return false;
    }
    items = kept;
    if (next.length > maxItems) onDrop?.('overflow', next.length - maxItems);
    return true;
  };

  let running: Promise<void> | null = null;
  let rerun = false;

  const runOnce = async (): Promise<void> => {
    const sent = new Set<string>();
    const rejected = new Set<string>();
    for (const item of items) {
      try {
        await send(item.payload);
        sent.add(item.id);
      } catch (err) {
        // Offline or server down: the rest would fail the same way. Keep everything
        // for the next flush instead of hammering the network.
        if (!isRejected(err)) break;
        rejected.add(item.id);
      }
    }
    if (!sent.size && !rejected.size) return;
    // `items` may have grown while we were uploading; drop only what this run settled.
    let dropped = 0;
    const kept: DurableLogItem[] = [];
    for (const item of items) {
      if (sent.has(item.id)) continue;
      if (!rejected.has(item.id)) { kept.push(item); continue; }
      const rejections = (item.rejections ?? 0) + 1;
      if (rejections >= maxRejections) dropped += 1;
      else kept.push({ ...item, rejections });
    }
    commit(kept);
    if (dropped) onDrop?.('rejected', dropped);
  };

  return {
    /** False when storage refused the write (quota): the caller must send directly. */
    enqueue(id: string, payload: Record<string, unknown>): boolean {
      return commit([...items.filter((item) => item.id !== id), { id, payload }]);
    },
    /** Upload queued items oldest first. Concurrent calls share one run; a call
     *  made while a run is in progress gets a follow-up run for new items. */
    flush(): Promise<void> {
      if (running) {
        rerun = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            rerun = false;
            await runOnce();
          } while (rerun);
        } finally {
          running = null;
        }
      })();
      return running;
    },
    /** Re-read storage after another tab changed it (guide mode on a phone). */
    reload(): void {
      items = load();
    },
    size: () => items.length,
  };
}
