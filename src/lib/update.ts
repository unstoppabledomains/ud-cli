import { createRequire } from 'node:module';
import { chmod, rename, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

const GITHUB_REPO = 'unstoppabledomains/ud-cli';
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

declare const __PKG_VERSION__: string | undefined;

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

export function getCurrentVersion(): string {
  if (typeof __PKG_VERSION__ === 'string') return __PKG_VERSION__;
  const req = createRequire(import.meta.url);
  return (req('../../package.json') as { version: string }).version;
}

export async function getLatestVersion(): Promise<string> {
  const res = await fetch(RELEASES_LATEST_URL, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { tag_name: string };
  return data.tag_name.replace(/^v/, '');
}

/** Compare two semver strings. Returns true if latest > current. */
function isNewer(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Install-method detection
// ---------------------------------------------------------------------------

export function isBinaryInstall(): boolean {
  return !!(process as unknown as Record<string, unknown>).pkg;
}

// ---------------------------------------------------------------------------
// Platform / binary naming
// ---------------------------------------------------------------------------

const PLATFORM_MAP: Record<string, string> = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'win',
};

const ARCH_MAP: Record<string, string> = {
  arm64: 'arm64',
  x64: 'x64',
};

export function getBinaryName(): string {
  const os = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];
  if (!os || !arch) {
    throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
  }
  const ext = process.platform === 'win32' ? '.exe' : '';
  return `ud-${os}-${arch}${ext}`;
}

export function getDownloadUrl(version: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${getBinaryName()}`;
}

// ---------------------------------------------------------------------------
// Update check throttling
// ---------------------------------------------------------------------------

export function shouldCheckForUpdate(): boolean {
  const last = config.get('lastUpdateCheck') as number;
  return Date.now() - last > CHECK_INTERVAL_MS;
}

export function recordUpdateCheck(): void {
  config.set('lastUpdateCheck', Date.now());
}

// ---------------------------------------------------------------------------
// Core check / update logic
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = getCurrentVersion();
  const latest = await getLatestVersion();
  return { current, latest, updateAvailable: isNewer(current, latest) };
}

export async function selfUpdate(
  knownLatest?: string,
): Promise<{ previousVersion: string; newVersion: string }> {
  const current = getCurrentVersion();
  const latest = knownLatest ?? (await getLatestVersion());

  if (!isNewer(current, latest)) {
    return { previousVersion: current, newVersion: current };
  }

  const url = getDownloadUrl(latest);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download binary: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const tempPath = `${process.execPath}.update`;

  try {
    await writeFile(tempPath, buffer);
    await chmod(tempPath, 0o755);

    // Strip macOS quarantine attribute
    if (process.platform === 'darwin') {
      try {
        await execFileAsync('xattr', ['-d', 'com.apple.quarantine', tempPath]);
      } catch {
        // Attribute may not be set — ignore
      }
    }

    await rename(tempPath, process.execPath);
  } catch (err: unknown) {
    // Clean up temp file on failure
    await unlink(tempPath).catch(() => {});

    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(
        `Permission denied. Try running with elevated privileges:\n  sudo ud update`,
      );
    }
    throw err;
  }

  return { previousVersion: current, newVersion: latest };
}
