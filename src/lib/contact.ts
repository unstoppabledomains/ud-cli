/**
 * Interactive ICANN contact creation for DNS domain checkout.
 *
 * Prompts the user through creating a contact when none exists,
 * following the sequential-prompt pattern from auth signup.
 */

import chalk from 'chalk';
import { createSpinner } from './spinner.js';

export interface ContactPromptContext {
  promptInput: (message: string, opts?: { validate?: RegExp }) => Promise<string>;
  callAction: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Prompt the user to create an ICANN contact interactively.
 * Returns true on success, false if the user cancels or creation fails.
 */
export async function promptContactCreation(
  ctx: ContactPromptContext,
  accountEmailHint?: string | null,
  opts?: { skipHeader?: boolean },
): Promise<boolean> {
  if (!opts?.skipHeader) {
    console.log(chalk.yellow('\nNo ICANN contact found.'));
    console.log('DNS domains (.com, .org, etc.) require contact information for registration.');
    console.log("Let's create one now.\n");
  }

  if (accountEmailHint) {
    console.log(chalk.dim(accountEmailHint) + '\n');
  }

  const firstName = await ctx.promptInput('First name: ', { validate: /^.{1,50}$/ });
  if (!firstName) return false;

  const lastName = await ctx.promptInput('Last name: ', { validate: /^.{1,50}$/ });
  if (!lastName) return false;

  const email = await ctx.promptInput('Email: ', { validate: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
  if (!email) return false;

  const dialingPrefix = await ctx.promptInput('Phone country code (e.g., 1): ', { validate: /^\d{1,4}$/ });
  if (!dialingPrefix) return false;

  const phoneNumber = await ctx.promptInput('Phone number: ', { validate: /^[\d\s\-().]{5,20}$/ });
  if (!phoneNumber) return false;

  const street = await ctx.promptInput('Street address: ', { validate: /^.{1,100}$/ });
  if (!street) return false;

  const city = await ctx.promptInput('City: ', { validate: /^.{1,50}$/ });
  if (!city) return false;

  const stateProvince = await ctx.promptInput('State/province (e.g., NY): ', { validate: /^.{1,50}$/ });
  if (!stateProvince) return false;

  const postalCode = await ctx.promptInput('Postal/ZIP code: ', { validate: /^.{1,20}$/ });
  if (!postalCode) return false;

  const countryCode = await ctx.promptInput('Country code (e.g., US): ', { validate: /^[A-Za-z]{2}$/ });
  if (!countryCode) return false;

  const spinner = await createSpinner('Creating ICANN contact...');
  spinner.start();

  try {
    await ctx.callAction('ud_contact_create', {
      firstName,
      lastName,
      email,
      phone: { dialingPrefix, number: phoneNumber },
      street,
      city,
      stateProvince,
      postalCode,
      countryCode: countryCode.toUpperCase(),
    });

    spinner.succeed('ICANN contact created');
    return true;
  } catch (err) {
    spinner.fail('Failed to create contact');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    return false;
  }
}
