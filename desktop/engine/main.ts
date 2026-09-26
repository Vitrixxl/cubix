/** Headless Bun host of the data engine, kept for the archived GPUI reference and the smoke test:
 * JSON lines over stdin/stdout, preferences in a private storage.json. */
import { createEngine } from './core';
import { desktopEngine } from './practiceScramble';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { desktopDataDirectory } from '../data-path';
import { createInterface } from 'node:readline';
const origin = process.env.CUBIX_API_ORIGIN ?? 'https://cubix.vitrixxl.fr';
const root = desktopDataDirectory();
mkdirSync(root, { recursive: true, mode: 0o700 });
const file = join(root, 'storage.json');
let values: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
function persist(next: Record<string, string>) { const temp = file + '.tmp'; writeFileSync(temp, JSON.stringify(next), { mode: 0o600 }); const fd = openSync(temp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, file); values = next; }
const storage = {
  getItem: (k: string) => values[k] ?? null,
  setItem: (k: string, v: string) => persist({ ...values, [k]: v }),
  removeItem: (k: string) => { const next = { ...values }; delete next[k]; persist(next); },
  all: () => values,
};
const engine = createEngine({ origin, storage, scrambles: desktopEngine, emit: value => process.stdout.write(JSON.stringify(value) + '\n') });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  let req;
  try { req = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ event: 'error', value: 'Invalid engine request' }) + '\n'); return; }
  engine.request(req);
});
lines.on('close', () => { engine.stop(); process.exit(0); });
