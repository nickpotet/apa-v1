import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(BUILD_DIR, '../..');
export const CONFIG_DIR = resolve(REPO_ROOT, 'config');
export const ATTRACT_DIR = resolve(REPO_ROOT, 'audio/attract');
export const DATA_DIR = resolve(REPO_ROOT, 'data');
