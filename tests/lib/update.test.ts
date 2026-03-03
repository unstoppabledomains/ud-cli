import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';
import { config } from '../../src/lib/config.js';

// Dynamic import so mock fetch is in place before the module loads
let update: typeof import('../../src/lib/update.js');

beforeEach(async () => {
  setupMockFetch();
  config.clear();
  // Fresh import each test to avoid stale module state
  update = await import('../../src/lib/update.js');
});

afterEach(() => {
  teardownMockFetch();
  jest.restoreAllMocks();
});

describe('isNewer', () => {
  it('returns true when latest is greater (patch)', () => {
    expect(update.isNewer('1.0.0', '1.0.1')).toBe(true);
  });

  it('returns true when latest is greater (minor)', () => {
    expect(update.isNewer('1.0.0', '1.1.0')).toBe(true);
  });

  it('returns true when latest is greater (major)', () => {
    expect(update.isNewer('1.0.0', '2.0.0')).toBe(true);
  });

  it('returns false when equal', () => {
    expect(update.isNewer('1.2.3', '1.2.3')).toBe(false);
  });

  it('returns false when current is greater', () => {
    expect(update.isNewer('2.0.0', '1.9.9')).toBe(false);
  });

  it('handles double-digit minor versions (1.9.0 vs 1.10.0)', () => {
    expect(update.isNewer('1.9.0', '1.10.0')).toBe(true);
  });

  it('handles missing patch segment', () => {
    expect(update.isNewer('1.0', '1.0.1')).toBe(true);
  });

  it('strips pre-release metadata before comparing', () => {
    expect(update.isNewer('1.0.0-beta.1', '1.0.0')).toBe(false);
    expect(update.isNewer('1.0.0', '1.0.1-rc.1')).toBe(true);
  });

  it('strips build metadata before comparing', () => {
    expect(update.isNewer('1.0.0+build.123', '1.0.0+build.456')).toBe(false);
  });
});

describe('getBinaryName', () => {
  it('returns expected name for current platform', () => {
    const name = update.getBinaryName();
    // Should match the pattern ud-{platform}-{arch}
    expect(name).toMatch(/^ud-(macos|linux|win)-(arm64|x64)(\.exe)?$/);
  });
});

describe('getDownloadUrl', () => {
  it('constructs correct GitHub release URL', () => {
    const url = update.getDownloadUrl('1.2.3');
    expect(url).toContain('github.com/unstoppabledomains/ud-cli/releases/download/v1.2.3/ud-');
  });
});

describe('isBinaryInstall', () => {
  it('returns false in normal Node.js environment', () => {
    expect(update.isBinaryInstall()).toBe(false);
  });
});

describe('getCurrentVersion', () => {
  it('returns a semver string', () => {
    const version = update.getCurrentVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('getLatestVersion', () => {
  it('parses tag_name from GitHub API response', async () => {
    mockFetchRoute('api.github.com', jsonResponse({ tag_name: 'v2.0.0' }));
    const version = await update.getLatestVersion();
    expect(version).toBe('2.0.0');
  });

  it('strips v prefix', async () => {
    mockFetchRoute('api.github.com', jsonResponse({ tag_name: 'v1.5.3' }));
    const version = await update.getLatestVersion();
    expect(version).toBe('1.5.3');
  });

  it('throws on non-200 response', async () => {
    mockFetchRoute('api.github.com', new Response('Not Found', { status: 404, statusText: 'Not Found' }));
    await expect(update.getLatestVersion()).rejects.toThrow('GitHub API returned 404');
  });
});

describe('checkForUpdate', () => {
  it('returns updateAvailable: true when newer version exists', async () => {
    mockFetchRoute('api.github.com', jsonResponse({ tag_name: 'v99.0.0' }));
    const result = await update.checkForUpdate();
    expect(result.updateAvailable).toBe(true);
    expect(result.latest).toBe('99.0.0');
  });

  it('returns updateAvailable: false when up to date', async () => {
    const current = update.getCurrentVersion();
    mockFetchRoute('api.github.com', jsonResponse({ tag_name: `v${current}` }));
    const result = await update.checkForUpdate();
    expect(result.updateAvailable).toBe(false);
  });
});

describe('shouldCheckForUpdate / recordUpdateCheck', () => {
  it('returns true when no previous check recorded', () => {
    expect(update.shouldCheckForUpdate()).toBe(true);
  });

  it('returns false immediately after recording a check', () => {
    update.recordUpdateCheck();
    expect(update.shouldCheckForUpdate()).toBe(false);
  });

  it('returns true when last check is older than 24 hours', () => {
    const pastTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    config.set('lastUpdateCheck', pastTimestamp);
    expect(update.shouldCheckForUpdate()).toBe(true);
  });
});
