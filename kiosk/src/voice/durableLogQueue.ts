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
// So: one flush at a time per page, and on save only the items actually sent are
// removed from a fresh read of storage. A re-send can still happen (a reload
// aborts an upload the server already stored), so /api/log must stay idempotent.

export type DurableLogItem = {
  id: string;
  queuedAt: string;
  /** Legacy: older builds counted every failed send here, offline included. */
  attempts: number;
  /** Times the server refused this item; it is dropped at maxAttempts. */
  rejections?: number;
  payload: Record<string, unknown>;
};

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DurableLogQueue = {
  /** False when storage refused the write (quota): the caller must send directly. */
  enqueue(id: string, payload: Record<string, unknown>): boolean;
  /** Upload queued items oldest first. Concurrent calls share one run; a call
   *  made while a run is in progress gets a follow-up run for new items. */
  flush(): Promise<void>;
  size(): number;
};

export function createDurableLogQueue(options: {
  storage: QueueStorage;
  key: string;
  maxItems: number;
  send: (payload: Record<string, unknown>) => Promise<void>;
  /** True for failures where the rest would fail too: offline, timeout, server
   *  down (5xx/429). The run stops and nobody is charged an attempt. Anything else
   *  is blamed on the item: it is skipped this run and dropped after maxAttempts,
   *  so one payload the server always rejects cannot block every later turn. */
  isOffline: (err: unknown) => boolean;
  maxAttempts: number;
  /** Called whenever turns are dropped, so the loss is visible somewhere. */
  onDrop?: (reason: 'rejected' | 'overflow', count: number) => void;
  now?: () => Date;
}): DurableLogQueue {
  const { storage, key, maxItems, send, isOffline, maxAttempts, onDrop } = options;
  const now = options.now ?? (() => new Date());

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

  const save = (items: DurableLogItem[]): boolean => {
    try {
      storage.setItem(key, JSON.stringify(items.slice(-maxItems)));
      if (items.length > maxItems) onDrop?.('overflow', items.length - maxItems);
      return true;
    } catch {
      return false;
    }
  };

  let running: Promise<void> | null = null;
  let rerun = false;

  const runOnce = async (): Promise<void> => {
    const sent = new Set<string>();
    const rejected = new Set<string>();
    for (const item of load()) {
      try {
        await send(item.payload);
        sent.add(item.id);
      } catch (err) {
        // Offline: the rest would fail the same way. Keep everything for the next
        // flush instead of hammering the network, and don't count it against the item.
        if (isOffline(err)) break;
        rejected.add(item.id);
      }
    }
    if (!sent.size && !rejected.size) return;
    // Re-read: turns may have been enqueued while we were uploading. Only server
    // rejections count towards dropping an item, never offline failures.
    let dropped = 0;
    const kept: DurableLogItem[] = [];
    for (const item of load()) {
      if (sent.has(item.id)) continue;
      if (!rejected.has(item.id)) { kept.push(item); continue; }
      const rejections = (item.rejections ?? 0) + 1;
      if (rejections >= maxAttempts) dropped += 1;
      else kept.push({ ...item, attempts: item.attempts + 1, rejections });
    }
    save(kept);
    if (dropped) onDrop?.('rejected', dropped);
  };

  const flush = (): Promise<void> => {
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
  };

  return {
    enqueue(id, payload) {
      const items = load().filter((item) => item.id !== id);
      items.push({ id, queuedAt: now().toISOString(), attempts: 0, payload });
      return save(items);
    },
    flush,
    size: () => load().length,
  };
}
