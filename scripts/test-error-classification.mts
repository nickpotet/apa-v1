// Which voice errors show the QR "lost connection" card. Real messages from kiosk logs.
// Run: npm run test:error-classification
import assert from 'node:assert/strict';
import { classifyVoiceFailure, createBusyStreak } from '../kiosk/src/voice/errorClassification.ts';

// 2026-10-08 16:10 UTC: guide pipeline got Google's 503 while the network was fine.
const highDemand = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}');
assert.equal(classifyVoiceFailure(highDemand), 'busy', 'Google being busy is not a lost connection');
// Quota lasts hours: not "busy", so it keeps its old handling instead of an endless "try again".
assert.notEqual(classifyVoiceFailure(new Error('You exceeded your current quota, please check your plan and billing details.')), 'busy');
assert.notEqual(classifyVoiceFailure(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')), 'busy');

// Real connectivity failures still show the fallback card.
for (const msg of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'guide-turn HTTP 502', 'net::ERR_INTERNET_DISCONNECTED', 'WebSocket closed']) {
  assert.equal(classifyVoiceFailure(new Error(msg)), 'connectivity', msg);
}
// Local problems stay a short transient error.
assert.equal(classifyVoiceFailure(new Error('No microphone audio was captured for this turn')), 'other');

// Busy streak: a blip gets "try again", a lasting Google outage the QR card again.
{
  let t = 0;
  const streak = createBusyStreak({ limit: 3, windowMs: 120_000, now: () => t });
  assert.equal(streak.record(), false);
  t += 30_000; assert.equal(streak.record(), false);
  t += 30_000; assert.equal(streak.record(), true, '3 busy failures within 2 min escalate');
  streak.reset();
  assert.equal(streak.record(), false, 'a completed turn resets the streak');
  t += 200_000; streak.record();
  t += 200_000; assert.equal(streak.record(), false, 'busy failures far apart never escalate');
}

console.log('error classification: all checks passed');
