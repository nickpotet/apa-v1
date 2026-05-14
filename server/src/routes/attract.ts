// Returns the list of available attract-mode audio clips per language.
// Frontend uses this to pick random clips without hardcoding filenames.
import { Router } from 'express';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ATTRACT_DIR = resolve(__dirname, '../../../audio/attract');

const LANGS = ['es', 'en', 'ru', 'ca'] as const;

export const attractRouter = Router();

attractRouter.get('/api/attract-manifest', (_req, res) => {
  const manifest: Record<string, string[]> = {};
  for (const lang of LANGS) {
    try {
      manifest[lang] = readdirSync(resolve(ATTRACT_DIR, lang))
        .filter((f) => f.endsWith('.mp3'))
        .sort();
    } catch {
      manifest[lang] = [];
    }
  }
  res.json(manifest);
});
