import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI, Modality } from '@google/genai';

const repoRoot = resolve(import.meta.dirname, '..');
const chipSource = resolve(repoRoot, 'config/chip_responses.json');
const chipOutRoot = resolve(repoRoot, 'kiosk/public/audio/chips');
const tmpRoot = resolve(repoRoot, 'audio/_masters/fixed');
const envPath = resolve(repoRoot, '.env');
const model = process.env.GEMINI_LIVE_MODEL ?? process.env.VITE_GEMINI_MODEL ?? 'gemini-3.1-flash-live-preview';
const voiceName = process.env.GEMINI_LIVE_VOICE ?? 'Puck';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const scenarioFilter = process.argv.find((arg) => arg.startsWith('--scenario='))?.slice('--scenario='.length);
const languageFilter = process.argv.find((arg) => arg.startsWith('--lang='))?.slice('--lang='.length);
const clipFilter = process.argv.find((arg) => arg.startsWith('--clip='))?.slice('--clip='.length);

function readEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local file.
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}`);
  }
}

function decodeBase64(base64) {
  return Buffer.from(base64, 'base64');
}

async function synthesize(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });
  const chunks = [];
  let resolveTurn;
  let rejectTurn;
  const turnComplete = new Promise((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });

  const session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{
          text: 'You are recording fixed kiosk audio as Apa the penguin. Read the user text exactly as written. Do not add words, greetings, comments, or sound effects.',
        }],
      },
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
    callbacks: {
      onmessage: (msg) => {
        const parts = msg.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
            chunks.push(decodeBase64(part.inlineData.data));
          }
        }
        if (msg.serverContent?.turnComplete) resolveTurn();
      },
      onerror: (err) => {
        rejectTurn(err);
      },
    },
  });

  const timeout = setTimeout(() => rejectTurn(new Error(`Timed out synthesizing: ${text}`)), 75_000);
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text }] }],
    turnComplete: true,
  });
  await turnComplete.finally(() => clearTimeout(timeout));

  try { session.close(); } catch {}

  if (chunks.length === 0) throw new Error(`No audio returned for: ${text}`);
  return Buffer.concat(chunks);
}

async function synthesizeWithRetry(text, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const pcm = await synthesize(text);
      if (pcm.byteLength < 4_800) throw new Error(`Audio is too short: ${pcm.byteLength} bytes`);
      return pcm;
    } catch (error) {
      lastError = error;
      console.warn(`attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : error}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

async function renderClip(lang, clip, outRoot, group) {
  const tmpDir = resolve(tmpRoot, group, lang);
  const outDir = resolve(outRoot, lang);
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const tmp = resolve(tmpDir, `${clip.id}.pcm`);
  const out = resolve(outDir, `${clip.id}.mp3`);
  if (!force && existsSync(out) && statSync(out).size > 1_000) {
    console.log(`${group}/${lang}/${clip.id}.mp3 exists`);
    return;
  }

  const pcm = await synthesizeWithRetry(clip.text);
  writeFileSync(tmp, pcm);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '128k', out]);
  rmSync(tmp, { force: true });
  if (!existsSync(out) || statSync(out).size <= 1_000) throw new Error(`Invalid output: ${out}`);
  console.log(`${group}/${lang}/${clip.id}.mp3`);
}

readEnvFile(envPath);
mkdirSync(tmpRoot, { recursive: true });

const data = JSON.parse(readFileSync(chipSource, 'utf8'));
for (const [scenario, byLang] of Object.entries(data)) {
  if (scenario.startsWith('$')) continue;
  if (scenarioFilter && scenario !== scenarioFilter) continue;
  for (const [lang, clips] of Object.entries(byLang)) {
    if (languageFilter && lang !== languageFilter) continue;
    for (const clip of clips) {
      if (clipFilter && clip.id !== clipFilter) continue;
      await renderClip(lang, clip, chipOutRoot, 'chips');
    }
  }
}
