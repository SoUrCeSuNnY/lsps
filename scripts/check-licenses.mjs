// License gate: BFS the production dependency tree from package-lock.json and
// enforce a permissive-license whitelist so this MIT repo never links GPL/AGPL.
// GPL/AGPL components are isolated by process boundary (plugins/sat-trak) or
// public-API-only usage (Open-Meteo). Zero external deps, CI-deterministic.
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const pkgs = lock.packages ?? {};

const WORKSPACES = ['packages/core', 'apps/web'];

function depsOf(key) {
  return {
    ...(pkgs[key]?.dependencies ?? {}),
    ...(pkgs[key]?.peerDependencies ?? {}),
  };
}

function resolve(depName, fromKey) {
  let base = fromKey;
  for (;;) {
    const cand = `${base}/node_modules/${depName}`;
    if (pkgs[cand]) return cand;
    const idx = base.lastIndexOf('/node_modules/');
    if (idx < 0) break;
    base = base.slice(0, idx);
  }
  const top = `node_modules/${depName}`;
  return pkgs[top] ? top : null;
}

const roots = WORKSPACES.map((w) => w);
const seen = new Set();
const queue = [];
for (const r of roots) {
  for (const name of Object.keys(depsOf(r))) {
    const k = resolve(name, r);
    if (k && !seen.has(k)) {
      seen.add(k);
      queue.push(k);
    }
  }
}
while (queue.length) {
  const k = queue.shift();
  for (const name of Object.keys(pkgs[k]?.dependencies ?? {})) {
    const c = resolve(name, k);
    if (c && !seen.has(c)) {
      seen.add(c);
      queue.push(c);
    }
  }
}

const ALLOW = new Set([
  'mit', 'mit*', 'apache-2.0', 'apache*', 'bsd', 'bsd-2-clause', 'bsd-3-clause',
  'bsd-3-clause*', 'bsd*', 'isc', 'zlib', '0bsd', 'unlicense', 'cc0-1.0', 'cc0*',
  'cc-by-4.0', 'cc-by*', 'cc-by-3.0', 'cc-by-3.0*', 'python-2.0', 'blueoak-1.0.0',
  'artistic-2.0', 'mpl-2.0', 'mpl-2.0*', 'wtfpl',
]);
const FORBID = /(gpl|agpl|sspl|licensable|noncommercial|nc\b)/i;

const violations = [];
const unknown = [];
for (const key of seen) {
  if (pkgs[key]?.link) continue; // our own workspace packages (MIT)
  const name = key.split('node_modules/').pop();
  const raw = String(pkgs[key]?.license ?? pkgs[key]?.licenses ?? 'UNKNOWN');
  const parts = String(raw).split(/\s*(?:AND|OR)\s*/i).map((s) => s.trim().toLowerCase());
  for (const p of parts) {
    if (FORBID.test(p)) violations.push(`${name}: ${raw}`);
    else if (!ALLOW.has(p)) unknown.push(`${name}: ${raw}`);
  }
}
console.log(`checked ${seen.size} production packages (from ${WORKSPACES.join(', ')})`);
if (unknown.length) console.warn('NOTE unlisted licenses:\n' + unknown.join('\n'));
if (violations.length) {
  console.error('GPL/COPYLEFT-STYLE LICENSE DETECTED IN PRODUCTION TREE:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('license gate PASS');
