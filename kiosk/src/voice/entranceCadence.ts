import storyBank from '../../../config/entrance_story_bank.json';

export type OpeningTheme = keyof typeof storyBank.openingThemes;
export type EntranceTheme = keyof typeof storyBank.bridgeThemes;

export type EntranceSessionThemes = {
  cycleIndex: number;
  openingTheme: OpeningTheme;
  bridgeTheme: EntranceTheme;
};

export type EntranceCadence = EntranceSessionThemes & {
  replyNumber: number;
  state: 'OPENING_TOPIC' | 'BRIDGE_ALLOWED' | 'FOLLOW_VISITOR';
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type ThemePair = Omit<EntranceSessionThemes, 'cycleIndex'>;

export const ENTRANCE_THEME_STORAGE_KEY = 'apaEntranceThemeCycleV1';

const cycle = storyBank.cycle as ThemePair[];

export function claimEntranceSessionThemes(storage: StorageLike): EntranceSessionThemes {
  const parsed = Number.parseInt(storage.getItem(ENTRANCE_THEME_STORAGE_KEY) ?? '0', 10);
  const cycleIndex = Number.isFinite(parsed) && parsed >= 0 ? parsed % cycle.length : 0;
  storage.setItem(ENTRANCE_THEME_STORAGE_KEY, String((cycleIndex + 1) % cycle.length));
  return { cycleIndex, ...cycle[cycleIndex] };
}

export function selectEntranceCadence(
  completedApaReplies: number,
  themes: EntranceSessionThemes,
): EntranceCadence {
  const replyNumber = Math.max(0, Math.floor(completedApaReplies)) + 1;
  return {
    ...themes,
    replyNumber,
    state: replyNumber <= 2
      ? 'OPENING_TOPIC'
      : replyNumber === 3
        ? 'BRIDGE_ALLOWED'
        : 'FOLLOW_VISITOR',
  };
}

export function buildEntranceCadenceInstruction(cadence: EntranceCadence): string {
  const opening = storyBank.openingThemes[cadence.openingTheme];
  const bridge = storyBank.bridgeThemes[cadence.bridgeTheme];
  const shared = [
    'Use exactly one factual point in this reply and do not repeat a point from the recent context.',
    'A direct current visitor question overrides the assigned topic. Answer that question first.',
    'Never abbreviate virtual reality. Always use its full natural name in the visitor language.',
  ];

  if (cadence.state === 'OPENING_TOPIC') {
    return [
      `OPENING_TOPIC: use the assigned topic "${opening.label}" without a sales pitch or invitation to enter.`,
      'Choose one approved point:',
      ...opening.facts.map((fact) => `- ${fact}`),
      'End with one short reaction or a question that continues curiosity.',
      ...shared,
    ].join('\n');
  }

  if (cadence.state === 'BRIDGE_ALLOWED') {
    return [
      `BRIDGE_ALLOWED: the only unsolicited exhibition bridge in this visitor session is "${bridge.label}".`,
      bridge.instruction,
      'Do not switch to another exhibition bridge theme.',
      ...shared,
    ].join('\n');
  }

  return [
    'FOLLOW_VISITOR: continue the visitor\'s current topic or offer another art, photographer, expedition, installation, or penguin topic.',
    'Do not add another unsolicited exhibition invitation, ticket mention, or promotional bridge.',
    ...shared,
  ].join('\n');
}
