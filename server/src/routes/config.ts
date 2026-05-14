// Assembles and returns the full system prompt + venue config.
// Reads /config/*.json and ap_persona.md at request time so edits take
// effect on next git pull without a rebuild.
import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, '../../../config');

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(CONFIG_DIR, name), 'utf8'));
}

export const configRouter = Router();

configRouter.get('/api/config', (_req, res) => {
  try {
    const persona   = readFileSync(resolve(CONFIG_DIR, 'ap_persona.md'), 'utf8');
    const pricing   = readJson('pricing.json') as Record<string, unknown>;
    const faq       = readJson('gallery_faq.json') as Record<string, unknown>;
    const scenarios = readJson('sales_scenarios.json') as Record<string, unknown>;

    const systemPrompt = [
      persona,
      '\n## TICKET PRICES (use these numbers only — never invent)\n',
      JSON.stringify((pricing as { tickets: unknown }).tickets, null, 2),
      '\n## REWARDS\n',
      JSON.stringify((pricing as { rewards: unknown }).rewards, null, 2),
      '\n## HOURS & VENUE INFO\n',
      JSON.stringify({
        hours:         (faq as { hours: unknown }).hours,
        address:       (faq as { address: unknown }).address,
        amenities:     (faq as { amenities: unknown }).amenities,
        experiences:   (faq as { experiences: unknown }).experiences,
        policies:      (faq as { policies: unknown }).policies,
        staff:         (faq as { staff: unknown }).staff,
        ownership:     (faq as { ownership: unknown }).ownership,
      }, null, 2),
      '\n## SALES SCENARIOS (use as inspiration, do not copy verbatim)\n',
      JSON.stringify((scenarios as { scenarios: unknown }).scenarios, null, 2),
    ].join('\n');

    res.json({
      systemPrompt,
      venue: {
        displayName:               ((faq as { ownership: { displayName: string } }).ownership).displayName,
        schedule:                  ((faq as { hours: { schedules: unknown } }).hours).schedules,
        lastEntryBeforeCloseMinutes: ((faq as { hours: { lastEntryBeforeCloseMinutes: number } }).hours).lastEntryBeforeCloseMinutes,
      },
    });
  } catch (err) {
    console.error('[config]', err);
    res.status(500).json({ error: String(err) });
  }
});
