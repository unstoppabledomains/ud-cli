/**
 * Readline-based interactive prompt utilities.
 * Used for OTP prompts and destructive-action confirmations.
 */

import { createInterface } from 'node:readline/promises';

/**
 * Prompt the user for text input.
 * Returns empty string in non-TTY environments (piped input).
 */
export async function promptInput(
  message: string,
  opts?: { validate?: RegExp },
): Promise<string> {
  if (!process.stdin.isTTY) return '';

  const maxAttempts = 3;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rawAnswer = await rl.question(message);
      const answer = rawAnswer.trim();
      if (opts?.validate && !opts.validate.test(answer)) {
        const remaining = maxAttempts - attempt;
        if (remaining > 0) {
          console.error(`Invalid input: expected format ${opts.validate} (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`);
        } else {
          console.error(`Invalid input: expected format ${opts.validate}`);
        }
        continue;
      }
      return answer;
    }
    return '';
  } finally {
    rl.close();
  }
}

/**
 * Prompt the user for a yes/no confirmation.
 * Returns false in non-TTY environments.
 */
export async function promptConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
