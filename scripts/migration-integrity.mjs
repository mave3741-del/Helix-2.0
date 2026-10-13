#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(root, '..', 'migrations');
const files = (await readdir(migrationsDir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
if (!files.length) throw new Error('no_numbered_migrations');
const numbers = files.map((name) => Number(name.slice(0, 4)));
for (let i = 1; i < numbers.length; i += 1) {
  if (numbers[i] === numbers[i - 1]) throw new Error(`duplicate_migration_number:${numbers[i]}`);
  if (numbers[i] < numbers[i - 1]) throw new Error(`migration_order_invalid:${files[i]}`);
}
const manifest = {};
for (const name of files) {
  const text = await readFile(join(migrationsDir, name));
  manifest[name] = createHash('sha256').update(text).digest('hex');
}
const output = { schema: 1, migrations: manifest };
console.log(JSON.stringify(output, null, 2));
console.error(`[migration-integrity] PASS — ${files.length} numbered migrations hashed in deterministic order.`);
