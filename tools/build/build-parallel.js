#!/usr/bin/env bun
/**
 * Parallel production build driver.
 *
 * Runs prebuild and shared dependencies sequentially, then compiles the
 * Angular renderer and the Electron main process in parallel, then packages.
 *
 * Usage:
 *   bun tools/build/build-parallel.js <angular-config> [electron-builder flags...]
 *
 * Examples:
 *   bun tools/build/build-parallel.js electron --linux
 *   bun tools/build/build-parallel.js electron -w
 *   bun tools/build/build-parallel.js electron-dev -w
 *   bun tools/build/build-parallel.js electron -w -p always
 */

const { $ } = require('bun');

const [angularConfig = 'electron', ...builderFlags] = process.argv.slice(2);

// ── Publish guard ────────────────────────────────────────────────────────────
// Refuse to publish a Windows build without a code-signing certificate.
// A published unsigned installer would reach end-users without Authenticode,
// causing Windows SmartScreen warnings or outright rejection.
const isWindowsBuild = builderFlags.some(f => ['-w', '--win', '--windows'].includes(f));
const isPublish      = builderFlags.includes('-p') || builderFlags.some(f => f.startsWith('--publish'));

if (isWindowsBuild && isPublish) {
  const certPath = process.env.WIN_CSC_LINK;
  if (!certPath) {
    console.error('\n[build] ERROR: refusing to publish an unsigned Windows installer.');
    console.error('[build]        Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD to provide a certificate,');
    console.error('[build]        or use `bun run build:windows` (no -p flag) for a local unsigned build.\n');
    process.exit(1);
  }
  // Verify the cert is a local file that actually exists.
  // (WIN_CSC_LINK can also be a URL or base64; only validate when it looks like a path.)
  if (!certPath.startsWith('http') && !certPath.startsWith('data:')) {
    const { existsSync } = require('fs');
    if (!existsSync(certPath)) {
      console.error(`\n[build] ERROR: WIN_CSC_LINK points to a non-existent file: ${certPath}\n`);
      process.exit(1);
    }
  }
}

// Run an NX command with the daemon disabled.
// The two parallel NX processes share no daemon state and use the local file
// cache directly, which is safe for concurrent reads.
const nx = (...args) => {
  const proc = Bun.spawn(['bun', 'run', 'nx', ...args], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, NX_DAEMON: 'false' },
  });
  return proc.exited.then(code => {
    if (code !== 0) throw new Error(`nx ${args.join(' ')} exited with code ${code}`);
  });
};

// ── Phase 1: prebuild ────────────────────────────────────────────────────────
// Generates version.ts, lazy-files-list.ts, and copies tc-loader into assets.
// Must complete before either build reads those files.
console.log('\n[build] phase 1/3 — prebuild');
await $`bun run prebuild`;

// ── Phase 1b: warm shared NX dependency ─────────────────────────────────────
// Both builds depend on data:build. Running it once here populates the local
// file cache so the two parallel NX processes can restore it without conflict.
await nx('run', 'data:build');

// ── Phase 2: parallel compile ────────────────────────────────────────────────
console.log('\n[build] phase 2/3 — building client and electron in parallel');

await Promise.all([
  // Branch A: Angular renderer → hash output filenames
  nx('build', '--project=client', `--configuration=${angularConfig}`)
    .then(() => $`bun ./tools/build/prod-assets-hash.js`),

  // Branch B: Electron main (esbuild) → copy loader → compile preload
  nx('run', 'electron:build')
    .then(() => $`./node_modules/.bin/copyfiles ./libs/loader/tc-loader.js ./dist/apps/electron/ -f`)
    .then(() => $`bun node_modules/typescript/bin/tsc -p ./apps/electron/tsconfig.preload.json`),
]);

// ── Phase 3: package ─────────────────────────────────────────────────────────
console.log('\n[build] phase 3/3 — packaging');
// exitCode is null when killed by a signal (OOM, SIGKILL) — treat as failure.
process.exit(Bun.spawnSync(['./node_modules/.bin/electron-builder', ...builderFlags], { stdio: ['inherit', 'inherit', 'inherit'] }).exitCode || 1);
