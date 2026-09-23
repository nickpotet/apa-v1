// Replays real recorded speech through the end-of-speech detector, chunked
// exactly like the providers see it (1024 samples @ 16 kHz = 64 ms).
// Run: node scripts/test-end-of-speech.ts   (needs ffmpeg on PATH)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EndOfSpeechDetector, KIOSK_END_OF_SPEECH } from '../kiosk/src/audio/endOfSpeech.ts';

const RATE = 16_000;
const CHUNK = 1024;
const CHUNK_MS = (CHUNK / RATE) * 1000;

function ffmpeg(args: string[]): Float32Array {
  const raw = execFileSync('ffmpeg', ['-v', 'error', ...args, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
    { maxBuffer: 64 * 1024 * 1024 });
  const i16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  return Float32Array.from(i16, (v) => v / 32768);
}
const speech = (file: string, gain = 1) => ffmpeg(['-i', file]).map((v) => v * gain);
const silence = (sec: number) => new Float32Array(Math.round(sec * RATE));
const noise = (sec: number, amp: number) =>
  ffmpeg(['-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=${amp}:duration=${sec}:sample_rate=${RATE}`]);
const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const mix = (a: Float32Array, b: Float32Array) => a.map((v, i) => Math.max(-1, Math.min(1, v + (b[i % b.length] ?? 0))));

function rms(s: Float32Array) { let q = 0; for (const v of s) q += v * v; return Math.sqrt(q / s.length); }

/** Seconds at which the detector fires, and why. */
function run(signal: Float32Array) {
  const d = new EndOfSpeechDetector(KIOSK_END_OF_SPEECH);
  for (let i = 0, t = 0; i + CHUNK <= signal.length; i += CHUNK, t += CHUNK_MS) {
    const reason = d.push(rms(signal.subarray(i, i + CHUNK)), CHUNK_MS);
    if (reason) return { reason, at: (t + CHUNK_MS) / 1000 };
  }
  return { reason: null, at: signal.length / RATE };
}
/** Last moment (s) a clip is audibly voiced — TTS files carry trailing silence. */
function voicedEnd(s: Float32Array, offsetSec = 0) {
  let last = 0;
  for (let i = 0; i + CHUNK <= s.length; i += CHUNK) if (rms(s.subarray(i, i + CHUNK)) > 0.02) last = (i + CHUNK) / RATE;
  return offsetSec + last;
}

const HOLA = 'audio/attract/es/02_hola.mp3';
const MONOLOGUE = 'kiosk/public/audio/chips/sr/family_01.mp3';
const hola = speech(HOLA);
const results: string[] = [];
const check = (name: string, fn: () => string) => { const r = fn(); results.push(`  ok  ${name.padEnd(40)} ${r}`); };

check('quiet room: phrase then silence', () => {
  const r = run(concat(hola, silence(4)));
  const end = voicedEnd(hola);
  assert.equal(r.reason, 'silence');
  assert.ok(r.at >= end + 1.1 && r.at <= end + 1.6, `fired ${r.at}s, speech ended ${end}s`);
  return `fired ${(r.at - end).toFixed(2)}s after speech`;
});

check('pause 0.8s inside utterance is not an end', () => {
  const firstEnd = voicedEnd(hola);
  const second = hola.length / RATE + 0.8;
  const r = run(concat(hola, silence(0.8), hola, silence(4)));
  const end = voicedEnd(hola, second);
  assert.equal(r.reason, 'silence');
  assert.ok(r.at > end, `cut off mid-utterance at ${r.at}s (first phrase ended ${firstEnd}s)`);
  return `waited through the pause, fired ${(r.at - end).toFixed(2)}s after 2nd phrase`;
});

check('9.4s monologue with natural pauses', () => {
  const m = speech(MONOLOGUE);
  const r = run(concat(m, silence(4)));
  const end = voicedEnd(m);
  assert.equal(r.reason, 'silence');
  assert.ok(r.at > end, `cut off at ${r.at}s, monologue ends ${end}s`);
  return `not cut off, fired ${(r.at - end).toFixed(2)}s after end`;
});

check('tap then nothing said', () => {
  const r = run(silence(20));
  assert.equal(r.reason, 'max_duration'); assert.ok(Math.abs(r.at - 15) < 0.1);
  return `backstop at ${r.at.toFixed(1)}s (was 75s)`;
});

check('loud street noise, nothing said', () => {
  const r = run(noise(20, 0.08));
  assert.equal(r.reason, 'max_duration', `false end-of-speech at ${r.at}s in pure noise`);
  return `no false end; backstop at ${r.at.toFixed(1)}s`;
});

check('speech over moderate street noise', () => {
  const pre = noise(2, 0.03);
  const body = mix(hola, noise(hola.length / RATE, 0.03));
  const r = run(concat(pre, body, noise(5, 0.03)));
  const end = 2 + voicedEnd(hola);
  assert.ok(r.reason === 'silence' ? r.at > end : r.reason === 'max_duration', `bad: ${JSON.stringify(r)}`);
  return r.reason === 'silence' ? `fired ${(r.at - end).toFixed(2)}s after speech` : 'fell to backstop (safe)';
});

check('quiet visitor (speech at 20% level)', () => {
  const soft = speech(HOLA, 0.2);
  const r = run(concat(soft, silence(4)));
  assert.ok(r.reason === 'silence' ? r.at > voicedEnd(soft) : r.reason === 'max_duration');
  return r.reason === 'silence' ? `detected, fired ${(r.at - voicedEnd(soft)).toFixed(2)}s after` : 'fell to backstop (safe)';
});

console.log(results.join('\n'));
console.log(`End-of-speech: ${results.length}/7 scenarios passed.`);
