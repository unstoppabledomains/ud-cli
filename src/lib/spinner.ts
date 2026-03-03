/**
 * Thin ora wrapper that no-ops when output is not interactive.
 */

import type { OutputFormat } from './types.js';

interface SpinnerLike {
  start(text?: string): SpinnerLike;
  stop(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
}

const noopSpinner: SpinnerLike = {
  start() { return this; },
  stop() { return this; },
  succeed() { return this; },
  fail() { return this; },
};

export async function createSpinner(
  text: string,
  options: { quiet?: boolean; format?: OutputFormat },
): Promise<SpinnerLike> {
  // No spinner for non-TTY, quiet mode, or machine-readable formats
  if (options.quiet || options.format === 'json' || options.format === 'csv' || !process.stdout.isTTY) {
    return noopSpinner;
  }

  try {
    const ora = (await import('ora')).default;
    return ora({ text, discardStdin: false });
  } catch {
    return noopSpinner;
  }
}
