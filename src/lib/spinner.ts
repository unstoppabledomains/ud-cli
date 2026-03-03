/**
 * Spinner wrapper that uses ora for npm installs and a lightweight
 * built-in spinner for pkg binaries (ora segfaults in pkg's patched V8).
 */

import chalk from 'chalk';
import type { OutputFormat } from './types.js';

export interface SpinnerLike {
  start(text?: string): SpinnerLike;
  stop(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  info(text?: string): SpinnerLike;
}

const noopSpinner: SpinnerLike = {
  start() { return this; },
  stop() { return this; },
  succeed() { return this; },
  fail() { return this; },
  info() { return this; },
};

// --- Lightweight spinner for pkg binaries ---

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class SimpleSpinner implements SpinnerLike {
  #text: string;
  #interval: ReturnType<typeof setInterval> | undefined;
  #frameIndex = 0;
  #stream = process.stderr;

  constructor(text: string) {
    this.#text = text;
  }

  start(text?: string): this {
    if (this.#interval) return this;
    if (text) this.#text = text;
    this.#interval = setInterval(() => {
      const frame = SPINNER_FRAMES[this.#frameIndex % SPINNER_FRAMES.length];
      this.#stream.write(`\r${chalk.cyan(frame)} ${this.#text}`);
      this.#frameIndex++;
    }, 80);
    return this;
  }

  stop(): this {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
    this.#stream.write('\r\x1b[K');
    return this;
  }

  succeed(text?: string): this {
    this.stop();
    this.#stream.write(`${chalk.green('✔')} ${text ?? this.#text}\n`);
    return this;
  }

  fail(text?: string): this {
    this.stop();
    this.#stream.write(`${chalk.red('✖')} ${text ?? this.#text}\n`);
    return this;
  }

  info(text?: string): this {
    this.stop();
    this.#stream.write(`${chalk.blue('ℹ')} ${text ?? this.#text}\n`);
    return this;
  }
}

// --- Factory ---

/** Returns true when running inside a @yao-pkg/pkg binary bundle. */
function isPkgBinary(): boolean {
  return !!(process as unknown as Record<string, unknown>).pkg;
}

export async function createSpinner(
  text: string,
  options: { quiet?: boolean; format?: OutputFormat } = {},
): Promise<SpinnerLike> {
  // No spinner for non-TTY, quiet mode, or machine-readable formats
  if (options.quiet || options.format === 'json' || options.format === 'csv' || !process.stderr.isTTY) {
    return noopSpinner;
  }

  // Use lightweight spinner in pkg binaries — ora segfaults in pkg's patched V8
  if (isPkgBinary()) {
    return new SimpleSpinner(text);
  }

  try {
    const ora = (await import('ora')).default;
    return ora({ text, discardStdin: false });
  } catch {
    return new SimpleSpinner(text);
  }
}
