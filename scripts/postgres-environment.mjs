#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const DEFAULT_PORT = 5432;

function normalizePort(raw) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : DEFAULT_PORT;
}

function commandVersion(command, args = ['--version']) {
  const executable = process.platform === 'win32' && command === 'psql' ? 'psql.exe' : command;
  try {
    return execFileSync(executable, args, { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return null;
  }
}

function candidateExecutables() {
  const candidates = [];
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
    for (const base of roots) {
      const pgRoot = path.join(base, 'PostgreSQL');
      if (!fs.existsSync(pgRoot)) continue;
      for (const version of fs.readdirSync(pgRoot).sort().reverse()) {
        candidates.push(path.join(pgRoot, version, 'bin', 'pg_config.exe'));
        candidates.push(path.join(pgRoot, version, 'bin', 'psql.exe'));
      }
    }
  } else {
    candidates.push('/usr/bin/pg_config', '/usr/local/bin/pg_config', '/usr/bin/psql', '/usr/local/bin/psql');
  }
  return [...new Set(candidates)];
}

function probeTcp(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ reachable: true, host, port, protocol: 'tcp' }));
    socket.once('timeout', () => finish({ reachable: false, host, port, reason: 'timeout' }));
    socket.once('error', (error) => finish({ reachable: false, host, port, reason: error.code || 'connection_error' }));
  });
}

function findInstalledBinary() {
  const pathCandidates = process.platform === 'win32' ? ['psql', 'pg_config'] : ['pg_config', 'psql'];
  for (const command of pathCandidates) {
    const output = commandVersion(command);
    if (output) return { command, version: output, source: 'PATH' };
  }
  for (const file of candidateExecutables()) {
    if (!fs.existsSync(file)) continue;
    const output = commandVersion(file);
    if (output) return { command: file, version: output, source: 'standard-install-location' };
  }
  return null;
}

const host = process.env.PGHOST || '127.0.0.1';
const port = normalizePort(process.env.PGPORT);
const configuredDatabaseUrl = Boolean(process.env.DATABASE_URL);
const installed = findInstalledBinary();
const reachability = await probeTcp(host, port);
const safe = {
  schemaVersion: 1,
  gate: 'phase9-postgresql-environment',
  platform: process.platform,
  os: os.platform(),
  nodeVersion: process.version,
  host,
  port,
  installedBinary: installed,
  serverTcpReachable: reachability.reachable,
  serverProbeReason: reachability.reason || null,
  databaseUrlConfigured: configuredDatabaseUrl,
  passwordExposed: false,
  connectionStringExposed: false,
  status: installed && reachability.reachable ? 'READY_FOR_DATABASE_VERIFICATION' : 'PENDING_POSTGRESQL',
};

console.log(JSON.stringify(safe, null, 2));

// This probe only reports environment state. It does not authenticate, create databases, run migrations,
// or print secrets. A successful TCP probe is intentionally not treated as database certification.
process.exitCode = 0;
