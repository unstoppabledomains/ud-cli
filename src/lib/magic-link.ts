/**
 * Magic link utilities for CLI-to-browser session handoff.
 *
 * Wraps raw website URLs in one-time authenticated links so users
 * are automatically signed in when they open the URL in a browser.
 * Falls back to the raw URL on any error (auth, rate-limit, network).
 */

import { apiBaseUrl, apiRequest } from './api.js';

/**
 * Check whether a URL is already a magic link (contains /api/oauth/link?token=).
 */
export function isMagicLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/api/oauth/link' && parsed.searchParams.has('token');
  } catch {
    return false;
  }
}

/**
 * Wrap a raw URL in a magic link for authenticated browser handoff.
 *
 * Calls POST /api/oauth/link to obtain a one-time token, then constructs
 * a URL that auto-signs the user in and redirects to the target page.
 *
 * Returns the raw URL unchanged if:
 * - The URL is already a magic link
 * - The user is not authenticated
 * - The API call fails for any reason (rate-limit, network, etc.)
 */
export async function createMagicLinkUrl(redirectUrl: string): Promise<string> {
  if (isMagicLinkUrl(redirectUrl)) return redirectUrl;

  try {
    const url = `${apiBaseUrl()}/api/oauth/link`;
    const res = await apiRequest(url, { method: 'POST' });

    if (!res.ok) return redirectUrl;

    const data = (await res.json()) as { link_token?: string };
    if (!data.link_token) return redirectUrl;

    const magicUrl = new URL(`${apiBaseUrl()}/api/oauth/link`);
    magicUrl.searchParams.set('token', data.link_token);
    magicUrl.searchParams.set('redirect', redirectUrl);
    return magicUrl.toString();
  } catch {
    return redirectUrl;
  }
}

/**
 * Walk an API result object and replace URL values at the given field paths
 * with magic link URLs. Paths support dot notation (e.g., 'nested.url').
 */
export async function applyMagicLinks(
  result: Record<string, unknown>,
  fieldPaths: string[],
): Promise<void> {
  for (const path of fieldPaths) {
    const segments = path.split('.');
    const lastSeg = segments.pop()!;

    let obj: Record<string, unknown> = result;
    for (const seg of segments) {
      const next = obj[seg];
      if (!next || typeof next !== 'object') {
        obj = undefined as unknown as Record<string, unknown>;
        break;
      }
      obj = next as Record<string, unknown>;
    }

    if (!obj) continue;

    const value = obj[lastSeg];
    if (typeof value !== 'string') continue;

    // Only attempt conversion for values that look like URLs
    try {
      new URL(value);
    } catch {
      continue;
    }

    obj[lastSeg] = await createMagicLinkUrl(value);
  }
}
