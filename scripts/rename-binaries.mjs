#!/usr/bin/env node

/**
 * Renames pkg output binaries to `ud-<platform>-<arch>`.
 *
 * When all targets are built in a single pkg invocation, pkg includes the arch
 * in the filename (e.g. ud-cli-macos-arm64). When targets are split by arch
 * (one arch per pkg invocation), pkg omits the arch (e.g. ud-cli-macos).
 *
 * Pass --arch <arch> to specify the arch suffix when pkg omits it.
 *
 * Usage:
 *   node scripts/rename-binaries.mjs              # all targets in one pkg run
 *   node scripts/rename-binaries.mjs --arch x64   # x64-only build
 *   node scripts/rename-binaries.mjs --arch arm64 # arm64-only build
 */

import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const BIN_DIR = 'bin';

// Parse --arch flag
const archIdx = process.argv.indexOf('--arch');
const arch = archIdx !== -1 ? process.argv[archIdx + 1] : null;

// When pkg builds multiple archs per platform, it includes the arch in filenames.
const FULL_RENAME_MAP = {
  'ud-cli-macos-arm64': 'ud-macos-arm64',
  'ud-cli-macos-x64': 'ud-macos-x64',
  'ud-cli-linux-x64': 'ud-linux-x64',
  'ud-cli-linux-arm64': 'ud-linux-arm64',
  'ud-cli-win-x64.exe': 'ud-win-x64.exe',
};

// When pkg builds one arch per platform, it omits the arch suffix.
// The --arch flag tells us what to append.
function buildArchRenameMap(arch) {
  const map = {
    'ud-cli-macos': `ud-macos-${arch}`,
    'ud-cli-linux': `ud-linux-${arch}`,
  };
  if (arch === 'x64') {
    map['ud-cli-win.exe'] = `ud-win-${arch}.exe`;
  }
  return map;
}

const renameMap = arch ? buildArchRenameMap(arch) : FULL_RENAME_MAP;

const files = await readdir(BIN_DIR);
let renamed = 0;

for (const file of files) {
  const newName = renameMap[file];
  if (newName) {
    await rename(join(BIN_DIR, file), join(BIN_DIR, newName));
    console.log(`  ${file} → ${newName}`);
    renamed++;
  }
}

if (renamed === 0) {
  console.error('Error: no binaries matched for renaming in bin/');
  console.error('Files found:', files.join(', '));
  process.exit(1);
} else {
  console.log(`Renamed ${renamed} binaries`);
}
