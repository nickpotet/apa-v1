import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configDir = resolve(root, 'config');
const outDir = resolve(root, 'kiosk/dist/api');

function readJson(name) {
  return JSON.parse(readFileSync(resolve(configDir, name), 'utf8'));
}

const persona = readFileSync(resolve(configDir, 'ap_persona.md'), 'utf8');
const pricing = readJson('pricing.json');
const faq = readJson('gallery_faq.json');
const scenarios = readJson('sales_scenarios.json');

const systemPrompt = [
  persona,
  '\n## TICKET PRICES (use these numbers only — never invent)\n',
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

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'config'), JSON.stringify({
  systemPrompt,
  venue: {
    displayName: faq.ownership.displayName,
    schedule: faq.hours.schedules,
    lastEntryBeforeCloseMinutes: faq.hours.lastEntryBeforeCloseMinutes,
  },
}, null, 2));
