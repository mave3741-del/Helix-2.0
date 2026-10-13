import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sourceTests = (await Array.fromAsync(glob('src/**/*.test.ts', { cwd: fileURLToPath(new URL('..', import.meta.url)), exclude: ['node_modules/**'] })))
  .sort();

const scripts = packageJson.scripts ?? {};
const testScripts = Object.entries(scripts)
  .filter(([name]) => name === 'test' || /^phase[^:]*:/i.test(name))
  .map(([name, command]) => `${name}\n${command}`)
  .join('\n');

const referenced = new Set();
const pathPattern = /(?:^|\s)(src\/[^\s'"`]+\.test\.ts)(?=\s|$|['"`])/g;
for (const match of testScripts.matchAll(pathPattern)) referenced.add(match[1]);

const orphaned = sourceTests.filter((file) => !referenced.has(file));
if (orphaned.length) {
  console.error(`Test coverage integrity FAILED: ${orphaned.length} source test file(s) are not referenced by npm test or a phase* gate.`);
  for (const file of orphaned) console.error(` - ${file}`);
  process.exit(1);
}

console.log(`Test coverage integrity PASS: ${sourceTests.length}/${sourceTests.length} src/**/*.test.ts files are reachable from npm test or phase* gates.`);
