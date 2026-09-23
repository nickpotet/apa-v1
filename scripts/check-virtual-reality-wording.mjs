import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const forbidden = new RegExp(`\\b${'V'}${'R'}\\b`);
// The prompt itself must name the abbreviation to forbid it ("Never say or write
// \"VR\"") — explicit prohibitions are allowed; any other use on the line still fails.
const prohibition = new RegExp(
  `(never say or write "${'V'}${'R'}"|never use the abbreviation \\*\\*${'V'}${'R'}\\*\\*)`, 'gi');
const usesAbbreviation = (text) => forbidden.test(text.replace(prohibition, ''));
const files = [];

function collect(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (statSync(absolutePath).isDirectory()) {
    for (const name of readdirSync(absolutePath)) collect(`${relativePath}/${name}`);
    return;
  }
  if (['.json', '.md', '.ts', '.tsx', '.mjs'].includes(extname(absolutePath))) files.push(relativePath);
}

collect('config');
collect('kiosk/src');
files.push('scripts/build-pages-config.mjs');

const violations = files.flatMap((file) => {
  const lines = readFileSync(resolve(root, file), 'utf8').split('\n');
  return lines.flatMap((line, index) => usesAbbreviation(line) ? [`${file}:${index + 1}`] : []);
});

if (violations.length) {
  throw new Error(`Abbreviated virtual reality wording remains in visitor-facing sources:\n${violations.join('\n')}`);
}

if (process.argv.includes('--dist')) {
  const configPath = resolve(root, 'kiosk/dist/api/config');
  if (!existsSync(configPath)) throw new Error('Built Pages config is missing');
  const built = JSON.parse(readFileSync(configPath, 'utf8'));
  for (const key of ['systemPrompt', 'guideSystemPrompt']) {
    if (usesAbbreviation(built[key])) throw new Error(`${key} contains the forbidden abbreviation`);
    if (!built[key].includes('## VIRTUAL REALITY WORDING')) {
      throw new Error(`${key} is missing the mandatory full-wording instruction`);
    }
  }
}

console.log(`Virtual reality wording passed: ${files.length} source files use full names.`);
