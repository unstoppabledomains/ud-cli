#!/usr/bin/env node

/**
 * Renames pkg output binaries from `ud-cli-<target>` to `ud-<platform>-<arch>`.
 *
 * pkg produces names like:
 *   ud-cli-macos-arm64, ud-cli-macos-x64, ud-cli-linux-x64, ud-cli-win-x64.exe
 *
 * This script renames them to:
 *   ud-macos-arm64, ud-macos-x64, ud-linux-x64, ud-win-x64.exe
 */

import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const BIN_DIR = 'bin';

const RENAME_MAP = {
  'ud-cli-macos-arm64': 'ud-macos-arm64',
  'ud-cli-macos-x64': 'ud-macos-x64',
  'ud-cli-linux-x64': 'ud-linux-x64',
  'ud-cli-win-x64.exe': 'ud-win-x64.exe',
};

const files = await readdir(BIN_DIR);
let renamed = 0;

for (const file of files) {
  const newName = RENAME_MAP[file];
  if (newName) {
    await rename(join(BIN_DIR, file), join(BIN_DIR, newName));
    console.log(`  ${file} → ${newName}`);
    renamed++;
  }
}

if (renamed === 0) {
  console.warn('Warning: no binaries matched for renaming in bin/');
} else {
  console.log(`Renamed ${renamed} binaries`);
}
