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
 * Prompt the user for a password with masked input (echoes * per character).
 * Returns empty string in non-TTY environments.
 */
export async function promptPassword(message: string): Promise<string> {
  if (!process.stdin.isTTY) return '';

  process.stdout.write(message);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (chunk: string): void => {
      // Raw-mode stdin may deliver multiple characters in a single chunk
      // (e.g. pasted text), so iterate through each character individually.
      for (const char of chunk) {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(password);
            return;
          case '\u0003': // Ctrl+C
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            process.exitCode = 130;
            resolve('');
            return;
          case '\u007F': // Backspace
          case '\b':
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            // Ignore escape sequences (arrow keys, etc.) — only accept printable chars
            if (char >= ' ') {
              password += char;
              process.stdout.write('*');
            }
            break;
        }
      }
    };

    stdin.on('data', onData);
  });
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
