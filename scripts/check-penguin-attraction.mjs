import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readText = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const config = JSON.parse(readText('config/penguin_facts.json'));
const facts = config.facts;
const audiences = new Set(['all', 'kids', 'adults']);
const ids = new Set();

assert(config.version === 1, 'penguin fact bank version must be 1');
assert(Array.isArray(facts) && facts.length >= 20, 'penguin fact bank must contain at least 20 facts');

for (const fact of facts) {
  assert(typeof fact.id === 'string' && /^[a-z0-9_]+$/.test(fact.id), `invalid fact id: ${fact.id}`);
  assert(!ids.has(fact.id), `duplicate fact id: ${fact.id}`);
  ids.add(fact.id);
  assert(typeof fact.text === 'string' && fact.text.length >= 30, `fact ${fact.id} has no useful text`);
  assert(Array.isArray(fact.tags) && fact.tags.length > 0, `fact ${fact.id} has no tags`);
  assert(audiences.has(fact.audience), `fact ${fact.id} has invalid audience`);
  assert(typeof fact.sourceTitle === 'string' && fact.sourceTitle.length > 0, `fact ${fact.id} has no source title`);
  assert(typeof fact.sourceUrl === 'string' && fact.sourceUrl.startsWith('https://'), `fact ${fact.id} has invalid source URL`);
}

const persona = readText('config/ap_persona.md');
const educationalLayer = readText('config/educational_attraction_layer.md');
const appSource = readText('kiosk/src/App.tsx');

assert(!persona.includes('Every conversation has one goal: **get the visitor through the door'), 'old sales-first goal remains in persona');
assert(persona.includes('runtime-assigned opening topic'), 'persona is missing the balanced opening-topic rule');
assert(persona.includes('Make at most one unsolicited gallery bridge'), 'persona is missing the one-bridge limit');
assert(!educationalLayer.includes('Apa should usually connect the topic'), 'old bridge-after-every-fact rule remains');
assert(educationalLayer.includes('Apa stays silent before interaction'), 'silent idle rule is missing');
assert(educationalLayer.includes('avoid repeating a fact already used'), 'fact repetition guard is missing');
assert(educationalLayer.includes('## Mandatory response-state check'), 'mandatory response-state check is missing');
assert(educationalLayer.includes('five topics rotate equally'), 'balanced bridge rotation rule is missing');
assert(educationalLayer.includes('Use exactly one scientific fact per turn'), 'one-fact limit is missing');
assert(educationalLayer.includes('A factual claim phrased as a question still counts as a second fact'), 'follow-up question fact guard is missing');
assert(appSource.includes('claimEntranceSessionThemes(window.localStorage)'), 'runtime theme cycle is not persistent');
assert(appSource.includes('buildEntranceCadenceInstruction(cadence)'), 'runtime theme instruction is missing');
assert(appSource.includes('entrance_cadence_selected'), 'runtime cadence diagnostics are missing');

if (process.argv.includes('--dist')) {
  const distPath = resolve(root, 'kiosk/dist/api/config');
  assert(existsSync(distPath), 'built Pages config is missing');
  const built = JSON.parse(readFileSync(distPath, 'utf8'));
  assert(built.systemPrompt.includes('## OFFICIAL PENGUIN FACT BANK'), 'entrance system prompt is missing penguin facts');
  assert(!built.guideSystemPrompt.includes('## OFFICIAL PENGUIN FACT BANK'), 'guide prompt must not inherit entrance fact behavior');
  assert(!built.systemPrompt.includes('Every conversation has one goal: **get the visitor through the door'), 'built prompt contains old sales-first goal');
  assert(built.systemPrompt.includes('## Mandatory response-state check'), 'built prompt is missing response-state check');
  assert(built.systemPrompt.includes('## OFFICIAL ENTRANCE STORY BANK'), 'built prompt is missing entrance story topics');
  for (const fact of facts) {
    assert(built.systemPrompt.includes(`[${fact.id}] ${fact.text}`), `built prompt is missing fact ${fact.id}`);
  }
}

console.log(`Penguin attraction rules complete: ${facts.length} sourced facts, curiosity-first cadence, one bridge per session.`);
