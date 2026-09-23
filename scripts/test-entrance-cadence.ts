import assert from 'node:assert/strict';
import {
  buildEntranceCadenceInstruction,
  claimEntranceSessionThemes,
  ENTRANCE_THEME_STORAGE_KEY,
  selectEntranceCadence,
} from '../kiosk/src/voice/entranceCadence.ts';

const storageValues = new Map<string, string>();
const storage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => { storageValues.set(key, value); },
};

const sessions = Array.from({ length: 5 }, () => claimEntranceSessionThemes(storage));
assert.deepEqual(sessions.map((session) => session.bridgeTheme), [
  'photographic_art',
  'photographer',
  'expedition_film',
  'installation',
  'virtual_reality',
]);
assert.deepEqual(sessions.map((session) => session.openingTheme), [
  'photographic_art',
  'photographer',
  'expedition_story',
  'installation',
  'penguin',
]);
assert.equal(storage.getItem(ENTRANCE_THEME_STORAGE_KEY), '0');

const expectedStates = [
  'OPENING_TOPIC',
  'OPENING_TOPIC',
  'BRIDGE_ALLOWED',
  'FOLLOW_VISITOR',
] as const;

for (let completedReplies = 0; completedReplies < expectedStates.length; completedReplies++) {
  const cadence = selectEntranceCadence(completedReplies, sessions[0]);
  assert.equal(cadence.replyNumber, completedReplies + 1);
  assert.equal(cadence.state, expectedStates[completedReplies]);
}

const virtualRealityCadence = selectEntranceCadence(2, sessions[4]);
const instruction = buildEntranceCadenceInstruction(virtualRealityCadence);
assert.match(instruction, /puts on a headset and enters an Antarctic scene/);
assert.doesNotMatch(instruction, /\bVR\b/i);

console.log('Entrance cadence passed: five balanced themes, fixed session topic, and one bridge window.');
