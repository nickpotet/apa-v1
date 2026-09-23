import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const versionPath = resolve(root, 'config/app_version.json');
const packagePaths = [
  resolve(root, 'package.json'),
  resolve(root, 'kiosk/package.json'),
  resolve(root, 'server/package.json'),
];
const lockPaths = [
  resolve(root, 'package-lock.json'),
  resolve(root, 'kiosk/package-lock.json'),
  resolve(root, 'server/package-lock.json'),
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const current = readJson(versionPath).version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) throw new Error(`Invalid app version: ${current}`);

const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
writeJson(versionPath, { version: next });

for (const path of packagePaths) {
  const value = readJson(path);
  value.version = next;
  writeJson(path, value);
}

for (const path of lockPaths) {
  const value = readJson(path);
  value.version = next;
  if (value.packages?.['']) value.packages[''].version = next;
  writeJson(path, value);
}

console.log(`Apa version: ${current} -> ${next}`);
