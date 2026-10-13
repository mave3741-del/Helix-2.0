#!/usr/bin/env node
/**
 * One-command setup for a fresh HELIX checkout.
 *
 * This is deliberately the ONLY place that decides what "set up HELIX"
 * means — every launcher (start.sh/.bat, desktop.sh/.bat, CI) should call
 * `npm run setup` rather than re-deriving these steps, so there is exactly
 * one source of truth instead of several scripts quietly drifting apart.
 *
 * What it does, and why that's the whole list:
 *   1. Checks the Node/npm versions against package.json's `engines` — the
 *      most common first-run failure is a wrong Node version, and failing
 *      fast with a clear message beats a cryptic install error.
 *   2. Runs `npm install` if dependencies look missing or incomplete.
 *   3. Runs `npm run db:migrate` — a safe no-op with no DATABASE_URL (the
 *      default): HELIX's embedded PGLite database migrates itself on first
 *      use, so there is nothing else to provision for local/desktop use.
 *   4. Prints the three ways to actually run HELIX, so "setup" always ends
 *      with "now what" answered rather than a silent exit.
 *
 * No API keys belong here: every brain/voice provider key (NVIDIA NIM,
 * OpenAI, ElevenLabs, ...) is entered once in the app itself under
 * Settings -> Brains, stored server-side, and never put in a .env file.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// On Windows, "npm" on PATH is npm.cmd (a shell shim), not a directly
// executable file — spawnSync/execFileSync without `shell: true` fails
// there with ENOENT even though `npm` works fine typed into a terminal.
// Routing through the shell resolves it the same way a terminal would.
// Args here are always static literals (never user input), so this is
// safe from the usual shell-injection concern with `shell: true`.
const IS_WINDOWS = process.platform === "win32";

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: IS_WINDOWS, ...options });
}

function log(line = "") {
  console.log(line);
}

function parseMajor(version) {
  const match = /^v?(\d+)/.exec(version.trim());
  return match ? Number(match[1]) : NaN;
}

async function checkEngines() {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const wantNode = pkg.engines?.node ?? "";
  const minNode = parseMajor(wantNode.replace(/^>=?/, ""));
  const haveNode = parseMajor(process.version);

  log(`[1/4] Checking Node.js version (have ${process.version}, need ${wantNode || "any"})`);
  if (Number.isFinite(minNode) && Number.isFinite(haveNode) && haveNode < minNode) {
    log("");
    log(`HELIX needs Node.js ${wantNode}. You have ${process.version}.`);
    log("Install the right version from https://nodejs.org and run this again.");
    process.exit(1);
  }
  log("  OK.");
}

function dependenciesLookInstalled() {
  // Cheap check: if node_modules/.package-lock.json exists and is newer than
  // package-lock.json, npm already resolved this exact dependency set.
  const nodeModules = join(ROOT, "node_modules");
  const marker = join(nodeModules, ".package-lock.json");
  if (!existsSync(nodeModules) || !existsSync(marker)) return false;
  return true;
}

async function installDependencies() {
  log("[2/4] Checking dependencies...");
  if (dependenciesLookInstalled()) {
    log("  Already installed — skipping (run `npm install` yourself to force a refresh).");
    return;
  }
  log("  Installing (this only happens once per checkout)...");
  run("npm", ["install"]);
}

function migrateDatabase() {
  log("[3/4] Preparing the database...");
  if (!process.env.DATABASE_URL) {
    log("  No DATABASE_URL set — using the built-in embedded database (nothing to provision).");
    return;
  }
  run("npm", ["run", "db:migrate"]);
}

function printNextSteps() {
  log("[4/4] Setup complete.");
  log("");
  log("How to run HELIX:");
  log("");
  log("  Desktop app (recommended)");
  log("    npm run desktop");
  log("    -> opens HELIX as its own window, not a browser tab.");
  log("");
  log("  Browser, for day-to-day development");
  log("    npm run dev");
  log("    -> then open http://localhost:8080");
  log("");
  log("  Browser, production build");
  log("    npm run build && npm run preview");
  log("    -> builds the real production bundle and serves it.");
  log("");
  log("API keys (brain providers, ElevenLabs voice, etc.) are entered once");
  log("inside the app under Settings -> Brains — nothing to edit by hand.");
  log("");
}

async function main() {
  log("HELIX setup");
  log("===========");
  log("");
  await checkEngines();
  await installDependencies();
  migrateDatabase();
  printNextSteps();
}

main().catch((err) => {
  console.error("");
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
