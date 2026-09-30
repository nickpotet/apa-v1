// Live-model failover: close classification against the close codes/reasons seen
// in real kiosk logs, and cool-down routing through the registry.
// Run: npm run test:model-failover  (.mts: ESM, for top-level await)
import assert from 'node:assert/strict';

// Minimal localStorage for the registry (it only touches window.localStorage).
const mem = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const m = await import('../kiosk/src/voice/liveModelFailover.ts');
const { classifyLiveClose: classify } = m;

// Real closes from kiosk logs.
assert.equal(classify(1011, 'You exceeded your current quota, please check your plan and billing details.'), 'quota'); // 2026-09-03
assert.equal(classify(1011, 'Internal error encountered.'), 'server_error'); // 2026-09-30, the outage the old code missed
assert.equal(classify(1007, 'Precondition check failed.'), null); // our protocol error, fixed in 1.0.9 — not the model's fault
assert.equal(classify(1000, ''), null); // normal close
assert.equal(classify(1006, ''), null); // abnormal close = network loss, not the model
// Other server-side shapes.
assert.equal(classify(1013, 'Try again later'), 'server_error');
assert.equal(classify(1008, 'The service is currently unavailable.'), 'server_error');
assert.equal(classify(1008, 'RESOURCE_EXHAUSTED'), 'quota');

// Routing: an outage parks the primary for 10 min, then it comes back.
const [primary, fallback] = m.LIVE_MODEL_CHAIN;
assert.equal(m.nextAvailableLiveModel(), primary);
m.markLiveModelExhausted(primary, m.OUTAGE_COOLDOWN_MS);
assert.equal(m.nextAvailableLiveModel(), fallback, 'after an outage the next turn must use the fallback');
const realNow = Date.now;
Date.now = () => realNow() + m.OUTAGE_COOLDOWN_MS + 1_000;
assert.equal(m.nextAvailableLiveModel(), primary, 'primary must return after the outage cool-down');
Date.now = realNow;
// Quota parks for longer.
m.markLiveModelExhausted(primary, m.QUOTA_COOLDOWN_MS);
Date.now = () => realNow() + m.OUTAGE_COOLDOWN_MS + 1_000;
assert.equal(m.nextAvailableLiveModel(), fallback, 'quota must outlast the outage cool-down');
Date.now = realNow;
// All parked -> pipeline takes over.
m.LIVE_MODEL_CHAIN.forEach((x) => m.markLiveModelExhausted(x, m.OUTAGE_COOLDOWN_MS));
assert.equal(m.allLiveModelsExhausted(), true);

console.log('Model failover passed: 8 close classifications, outage/quota cool-downs, full-chain fallback.');
