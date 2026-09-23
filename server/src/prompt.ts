import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CONFIG_DIR } from './paths.js';

type ConfigObject = Record<string, unknown>;

type GalleryFaq = {
  hours: {
    schedules: unknown;
    lastEntryBeforeCloseMinutes: number;
  };
  address: unknown;
  amenities: unknown;
  experiences: unknown;
  policies: unknown;
  staff: unknown;
  ownership: {
    displayName: string;
  };
};

type PenguinFact = {
  id: string;
  text: string;
};

type PenguinFactsConfig = {
  facts: PenguinFact[];
};

type EntranceStoryBank = {
  openingThemes: Record<string, {
    label: string;
    facts: string[];
  }>;
};

const virtualRealityLanguageBlock = [
  '## VIRTUAL REALITY WORDING - MANDATORY',
  'Never abbreviate virtual reality in speech or visible text. Always say its full natural name in the visitor language:',
  'ES: always say "realidad virtual". Never say or write "VR". FR: always say "Réalité Virtuelle". Never say or write "VR".',
  'EN: virtual reality; RU: виртуальная реальность; CA: realitat virtual;',
  'DE: virtuelle Realität; UK: віртуальна реальність; SR: virtuelna realnost; IT: realtà virtuale; PL: wirtualna rzeczywistość.',
  'On the first mention, briefly explain that the visitor puts on a headset and enters an Antarctic scene.',
].join('\n');

const ticketInclusionBlock = [
  '## TICKET INCLUSION - NON-NEGOTIABLE',
  'Every General, Reduced, and Family ticket includes EXACTLY 1 virtual reality episode per visitor.',
  'Never say, imply, or suggest that a standard or family ticket includes two episodes. Two included episodes are not a valid offer.',
  'Only the Maxi ticket includes 5 virtual reality episodes. Additional episodes are paid separately, and only Natalia quotes that price.',
].join('\n');

function readText(name: string): string {
  return readFileSync(resolve(CONFIG_DIR, name), 'utf8');
}

function readJson<T extends ConfigObject>(name: string): T {
  return JSON.parse(readText(name)) as T;
}

function buildSystemPromptInternal(includePenguinFacts: boolean): string {
  const persona = readText('ap_persona.md');
  const educationalLayer = readText('educational_attraction_layer.md').trim();
  const pricing = readJson<{ tickets: unknown; rewards: unknown }>('pricing.json');
  const faq = readJson<GalleryFaq>('gallery_faq.json');
  const scenarios = readJson<{ scenarios: unknown }>('sales_scenarios.json');
  const penguinFacts = readJson<PenguinFactsConfig>('penguin_facts.json').facts;
  const entranceStoryBank = readJson<EntranceStoryBank>('entrance_story_bank.json');
  const penguinFactBlock = includePenguinFacts
    ? [
        '## OFFICIAL PENGUIN FACT BANK',
        'Use these facts as your primary source. Translate naturally into the visitor\'s language and never mention fact IDs or sources aloud.',
        'Use one fact per reply. Do not repeat a fact already used in the recent conversation context.',
        'You may add a widely established qualitative penguin detail only when highly confident. Never add a new number, record, duration, measurement, species claim, or scientific superlative outside this bank.',
        ...penguinFacts.map((fact) => `- [${fact.id}] ${fact.text}`),
      ].join('\n')
    : '';
  const entranceStoryBlock = [
    '## OFFICIAL ENTRANCE STORY BANK',
    'Use these verified points for direct questions and for the deterministic topic selected at runtime. Use one point per reply.',
    ...Object.entries(entranceStoryBank.openingThemes).flatMap(([id, theme]) => [
      `[${id}] ${theme.label}`,
      ...theme.facts.map((fact) => `- ${fact}`),
    ]),
  ].join('\n');

  return [
    virtualRealityLanguageBlock,
    persona,
    ticketInclusionBlock,
    '\n## TICKET PRICES (use these numbers only - never invent)\n',
    JSON.stringify(pricing.tickets, null, 2),
    '\n## REWARDS\n',
    JSON.stringify(pricing.rewards, null, 2),
    '\n## HOURS & VENUE INFO\n',
    JSON.stringify({
      hours: faq.hours,
      address: faq.address,
      amenities: faq.amenities,
      experiences: faq.experiences,
      policies: faq.policies,
      staff: faq.staff,
      ownership: faq.ownership,
    }, null, 2),
    '\n## SALES SCENARIOS (use as inspiration, do not copy verbatim)\n',
    JSON.stringify(scenarios.scenarios, null, 2),
    '\n',
    penguinFactBlock,
    entranceStoryBlock,
    '\n',
    educationalLayer,
    '\n## INSIDE GALLERY KNOWLEDGE\n',
    [
      'Use this only when visitors ask what is inside or ask about the exhibition. Keep entrance answers brief.',
      'Inside there are four parts: Hall 1 begins Sergey Potetyunin\'s Antarctic journey; Hall 2 is about ice, light, icebergs, the Falklands and South Georgia; Hall 3 is about Antarctic animals and penguins; Hall 4 has landscapes, photo zone, porthole, short film, virtual reality, works for sale, souvenirs, PONANT and WWF message.',
      'For detailed room-by-room guiding, tell visitors to scan the Apa guide QR inside the gallery.',
    ].join('\n'),
    ticketInclusionBlock,
    virtualRealityLanguageBlock,
  ].join('\n');
}

export function buildSystemPrompt(): string {
  return buildSystemPromptInternal(true);
}

export function buildGuideSystemPrompt(): string {
  const base = buildSystemPromptInternal(false);
  const audioGuide = readText('gallery_audio_guide.md').trim();
  const guideMode = [
    '## APA GUIDE MODE',
    'You are Apa inside CGGallery, Antarctica, acting as a friendly exhibition guide.',
    'The visitor has likely already entered or is scanning a QR in a room.',
    'Prioritize explaining the exhibition, rooms, stands, artworks, virtual reality, photo zone, film, souvenirs, and conservation message.',
    'Do not sell aggressively. If the visitor asks about buying, prices, cruises, or unknown details, send them to Natalia or the administrator.',
    'Normal guide answers must be concise: 2-5 short sentences. For a longer tour, guide step by step and ask before continuing.',
    'If the URL context names a hall or stand, treat that as the visitor location and answer from that part first.',
  ].join('\n');

  return `${virtualRealityLanguageBlock}\n\n${guideMode}\n\n${base}\n\n## FULL GUIDE KNOWLEDGE\n${audioGuide}\n\n${guideMode}\n\n${virtualRealityLanguageBlock}`;
}

export function getAppVersion(): string {
  return readJson<{ version: string }>('app_version.json').version;
}

export function buildVenuePayload() {
  const faq = readJson<GalleryFaq>('gallery_faq.json');

  return {
    displayName: faq.ownership.displayName,
    schedule: faq.hours.schedules,
    lastEntryBeforeCloseMinutes: faq.hours.lastEntryBeforeCloseMinutes,
  };
}
