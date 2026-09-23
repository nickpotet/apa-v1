import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const expected = readJson('config/app_version.json').version;

if (!/^\d+\.\d+\.\d+$/.test(expected)) throw new Error(`Invalid app version: ${expected}`);

for (const path of [
  'package.json',
  'kiosk/package.json',
  'server/package.json',
  'package-lock.json',
  'kiosk/package-lock.json',
  'server/package-lock.json',
]) {
  const value = readJson(path);
  if (value.version !== expected) throw new Error(`${path} has version ${value.version}; expected ${expected}`);
  if (value.packages?.[''] && value.packages[''].version !== expected) {
    throw new Error(`${path} root package has version ${value.packages[''].version}; expected ${expected}`);
  }
}

if (process.argv.includes('--dist')) {
  const builtPath = resolve(root, 'kiosk/dist/api/config');
  if (!existsSync(builtPath)) throw new Error('Built Pages config is missing');
  const built = JSON.parse(readFileSync(builtPath, 'utf8'));
  if (built.appVersion !== expected) {
    throw new Error(`Built app version is ${built.appVersion}; expected ${expected}`);
  }
}

console.log(`Apa version ${expected} is consistent.`);
