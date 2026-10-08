// Durable log queue: nothing lost or sent twice when turns finish mid-upload,
// offline keeps everything, a rejected item can't block the rest.
// Run: npm run test:log-queue
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDurableLogQueue } from '../kiosk/src/voice/durableLogQueue.ts';

class Offline extends Error {}

function memoryStorage(capacity = Infinity) {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > capacity) throw new Error('QuotaExceededError');
      mem.set(k, v);
    },
  };
}

function queue(send: (p: Record<string, unknown>) => Promise<void>, storage = memoryStorage()) {
  return createDurableLogQueue({
    storage, key: 'q', maxItems: 100, maxAttempts: 3, send,
    isOffline: (err) => err instanceof Offline,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// 1. A turn finishing while an upload runs is neither dropped nor sent twice (2026-10-08 race).
{
  const sent: string[] = [];
  const pending: Array<() => void> = [];
  const q = queue((p) => new Promise<void>((resolve) => pending.push(() => { sent.push(String(p.turnId)); resolve(); })));
  q.enqueue('a', { turnId: 'a' });
  q.enqueue('b', { turnId: 'b' });
  const first = q.flush();
  await tick();
  q.enqueue('c', { turnId: 'c' }); // turn finished mid-upload
  const second = q.flush();        // its own flush joins the running one
  while (pending.length) { pending.shift()!(); await tick(); }
  await Promise.all([first, second]);
  assert.deepEqual(sent, ['a', 'b', 'c'], 'every turn uploaded once, oldest first');
  assert.equal(q.size(), 0);
}

// 2. Concurrent flushes on one page never upload the same turn twice.
{
  let calls = 0;
  const q = queue(async () => { calls += 1; });
  for (const id of ['a', 'b', 'c']) q.enqueue(id, { turnId: id });
  await Promise.all([q.flush(), q.flush(), q.flush()]);
  assert.equal(calls, 3);
  assert.equal(q.size(), 0);
}

// 3. Offline: the first failure stops the run, everything stays queued, no attempts burnt.
{
  let calls = 0;
  let online = false;
  const q = queue(async () => { calls += 1; if (!online) throw new Offline('Failed to fetch'); });
  for (const id of ['a', 'b', 'c']) q.enqueue(id, { turnId: id });
  for (let i = 0; i < 5; i++) await q.flush(); // more offline runs than maxAttempts
  assert.equal(calls, 5, 'one probe per run while offline');
  assert.equal(q.size(), 3, 'offline never drops a turn');
  online = true;
  await q.flush();
  assert.equal(q.size(), 0);
}

// 4. A payload the server always rejects doesn't block later turns, and is dropped
//    after maxAttempts instead of sitting at the head of the queue forever.
{
  const sent: string[] = [];
  const q = queue(async (p) => {
    if (p.turnId === 'poison') throw new Error('log HTTP 503');
    sent.push(String(p.turnId));
  });
  q.enqueue('poison', { turnId: 'poison' });
  q.enqueue('ok', { turnId: 'ok' });
  await q.flush();
  assert.deepEqual(sent, ['ok'], 'later turns go through past a rejected one');
  await q.flush();
  await q.flush();
  assert.equal(q.size(), 0, 'rejected item dropped after maxAttempts');
}

// 4b. Items left by older builds (attempts counted every offline failure) are never
//     dropped untried, and one rejection doesn't drop them either.
{
  const storage = memoryStorage();
  storage.setItem('q', JSON.stringify([{ id: 'old', queuedAt: '2026-10-04T17:32:06Z', attempts: 80, payload: { turnId: 'old' } }]));
  let online = false;
  let reject = false;
  const q = queue(async () => {
    if (!online) throw new Offline('Failed to fetch');
    if (reject) throw new Error('log HTTP 400');
  }, storage);
  q.enqueue('new', { turnId: 'new' });
  await q.flush(); // offline run
  assert.equal(q.size(), 2, 'offline keeps the legacy item');
  online = true; reject = true;
  await q.flush(); // one rejection each
  assert.equal(q.size(), 2, 'one rejection does not drop an item with a high legacy attempts count');
}

// 4c. Drops are reported, not silent.
{
  const drops: string[] = [];
  const q = createDurableLogQueue({
    storage: memoryStorage(), key: 'q', maxItems: 2, maxAttempts: 1,
    isOffline: () => false,
    send: async () => { throw new Error('log HTTP 400'); },
    onDrop: (reason, count) => drops.push(`${reason}:${count}`),
  });
  for (const id of ['a', 'b', 'c']) q.enqueue(id, { turnId: id });
  assert.deepEqual(drops, ['overflow:1']);
  await q.flush();
  assert.deepEqual(drops, ['overflow:1', 'rejected:2']);
}

// 5. Storage full: enqueue reports it, so the caller can send directly instead of losing the turn.
{
  const q = queue(async () => {}, memoryStorage(150));
  assert.equal(q.enqueue('big', { turnId: 'big', pad: 'x'.repeat(200) }), false);
  assert.equal(q.enqueue('s', { turnId: 's' }), true);
}

// 6. Log uploads must not use fetch keepalive: its 64 KB body budget capped the venue
//    kiosk at ~7 turns per page load. A source check — the queue itself can't see fetch.
{
  const src = readFileSync(new URL('../kiosk/src/voice/diagnostics.ts', import.meta.url), 'utf8');
  assert.equal(/keepalive\s*:\s*true/.test(src), false, 'diagnostics.ts must not send logs with keepalive');
}

console.log('log queue: all checks passed');
