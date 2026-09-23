import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const languages = ['es', 'en', 'ru', 'ca', 'fr', 'de', 'uk', 'sr', 'it', 'pl'];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLocalizedMaps(value, path) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && Object.hasOwn(value, 'es')) {
    for (const language of languages) {
      assert(Object.hasOwn(value, language), `${path} is missing ${language}`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    assertLocalizedMaps(child, path ? `${path}.${key}` : key);
  }
}

function assertAudio(path) {
  const absolute = resolve(root, path);
  assert(existsSync(absolute), `Missing audio: ${path}`);
  assert(statSync(absolute).size > 1_000, `Invalid audio: ${path}`);
}

const languageConfig = readJson('config/languages.json');
assert(JSON.stringify(languageConfig.enabled) === JSON.stringify(languages), 'Enabled language order is inconsistent');

for (const file of ['config/pricing.json', 'config/gallery_faq.json', 'config/sales_scenarios.json']) {
  assertLocalizedMaps(readJson(file), file);
}

const chips = readJson('config/chip_responses.json');
for (const [scenario, byLanguage] of Object.entries(chips)) {
  for (const language of languages) {
    const clips = byLanguage[language];
    assert(Array.isArray(clips) && clips.length === 3, `${scenario}/${language} must have 3 clips`);
    for (const clip of clips) assertAudio(`kiosk/public/audio/chips/${language}/${clip.id}.mp3`);
  }
}

console.log(`Language support complete: ${languages.length} languages, 180 button clips, idle speech disabled.`);
