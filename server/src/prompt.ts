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

function readText(name: string): string {
  return readFileSync(resolve(CONFIG_DIR, name), 'utf8');
}

function readJson<T extends ConfigObject>(name: string): T {
  return JSON.parse(readText(name)) as T;
}

export function buildSystemPrompt(): string {
  const persona = readText('ap_persona.md');
  const pricing = readJson<{ tickets: unknown; rewards: unknown }>('pricing.json');
  const faq = readJson<GalleryFaq>('gallery_faq.json');
  const scenarios = readJson<{ scenarios: unknown }>('sales_scenarios.json');

  return [
    persona,
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
  ].join('\n');
}

export function buildVenuePayload() {
  const faq = readJson<GalleryFaq>('gallery_faq.json');

  return {
    displayName: faq.ownership.displayName,
    schedule: faq.hours.schedules,
    lastEntryBeforeCloseMinutes: faq.hours.lastEntryBeforeCloseMinutes,
  };
}
