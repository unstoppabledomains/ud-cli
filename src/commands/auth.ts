import { Command } from 'commander';
import chalk from 'chalk';
import { getActiveEnv, getEnvConfig, setEnvConfig, clearEnvConfig, apiBaseUrl } from '../lib/config.js';
import { saveApiKey, saveTokens, clearCredentials, getTokens } from '../lib/credentials.js';
import { performOAuthLogin, revokeToken, discoverMetadata } from '../lib/oauth.js';
import { startSignup, verifySignup } from '../lib/signup.js';
import { promptInput, promptPassword } from '../lib/prompt.js';
import { createSpinner } from '../lib/spinner.js';
import { verifyAuth } from '../lib/api.js';
import type { Environment, TokenData } from '../lib/types.js';

const API_KEY_PATTERN = /^ud_mcp_[0-9a-f]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
const SIGNUP_CLIENT_ID = 'ud-api-signup-client';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Authenticate with Unstoppable Domains')
    .option('-m, --method <method>', 'Auth method (oauth or api-key)', 'oauth')
    .option('-k, --key <key>', 'API key (for api-key method)')
    .action(async (options: { method: string; key?: string }) => {
      const env = getActiveEnv();

      // --key implies api-key method even without explicit --method
      if (options.key || options.method === 'api-key') {
        await loginApiKey(env, options.key);
      } else {
        await loginOAuth(env);
      }
    });

  auth
    .command('signup')
    .description('Create a new Unstoppable Domains account')
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .option('-c, --code <code>', 'Verification code')
    .option('-t, --token <token>', 'Session token from signup (for verification step)')
    .action(async (options: { email?: string; password?: string; code?: string; token?: string }) => {
      const env = getActiveEnv();
      await signupFlow(env, options);
    });

  auth
    .command('logout')
    .description('Clear stored credentials')
    .action(async () => {
      const env = getActiveEnv();

      // Best-effort token revocation for OAuth
      const envConfig = getEnvConfig(env);
      if (envConfig.authMethod === 'oauth') {
        const tokens = await getTokens(env);
        if (tokens && envConfig.oauth?.clientId) {
          try {
            const metadata = await discoverMetadata(apiBaseUrl(env));
            if (metadata.revocation_endpoint) {
              await revokeToken(
                metadata.revocation_endpoint,
                tokens.refreshToken,
                envConfig.oauth.clientId,
              );
            }
          } catch {
            // Best effort
          }
        }
      }

      await clearCredentials(env);
      clearEnvConfig(env);
      console.log(chalk.green(`Logged out of ${env}.`));
    });

  auth
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      const status = await verifyAuth();

      if (status.authenticated) {
        console.log(chalk.green(`✓ ${status.message}`));
      } else {
        console.log(chalk.yellow(`✗ ${status.message}`));
      }
    });
}

async function loginApiKey(env: string, key?: string): Promise<void> {
  if (!key) {
    console.error(chalk.red('API key is required. Use --key <key> or -k <key>.'));
    process.exitCode = 1;
    return;
  }

  if (!API_KEY_PATTERN.test(key)) {
    console.error(chalk.red('Invalid API key format. Expected: ud_mcp_ followed by 64 hex characters.'));
    process.exitCode = 1;
    return;
  }

  await saveApiKey(key, env as Environment);
  setEnvConfig({ authMethod: 'api-key' }, env as Environment);

  // Verify the key actually works
  const status = await verifyAuth();

  if (status.authenticated) {
    console.log(chalk.green(`✓ API key saved and verified for ${env}.`));
    console.log(chalk.dim('Tip: Run "ud install" to enable shell tab completion.'));
  } else {
    console.log(chalk.yellow(`API key saved for ${env}, but verification failed: ${status.message}`));
  }
}

async function loginOAuth(env: string): Promise<void> {
  console.log(chalk.blue(`Starting OAuth login for ${env}...`));
  console.log('Opening browser for authorization...');

  try {
    await performOAuthLogin();
    setEnvConfig({ authMethod: 'oauth' }, env as Environment);
    console.log(chalk.green(`✓ OAuth login successful for ${env}.`));
    console.log(chalk.dim('Tip: Run "ud install" to enable shell tab completion.'));
  } catch (err) {
    console.error(chalk.red(`OAuth login failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
  }
}

interface SignupOptions {
  email?: string;
  password?: string;
  code?: string;
  token?: string;
}

async function signupFlow(env: string, options: SignupOptions = {}): Promise<void> {
  // Verify-only mode: --token + --code skips account creation
  if (options.token) {
    if (!options.code) {
      console.error(chalk.red('--code is required when using --token.'));
      process.exitCode = 1;
      return;
    }
    await verifyAndLogin(env, options.token, options.code);
    return;
  }

  const headless = !!(options.email && options.password);

  if (!headless && !process.stdin.isTTY) {
    console.error(chalk.red('Signup requires an interactive terminal, or pass --email and --password.'));
    process.exitCode = 1;
    return;
  }

  // 1. Email
  let email: string;
  if (options.email) {
    if (!EMAIL_PATTERN.test(options.email)) {
      console.error(chalk.red('Invalid email address format.'));
      process.exitCode = 1;
      return;
    }
    email = options.email;
  } else {
    console.log(chalk.blue(`Creating a new account on ${env}...\n`));
    const prompted = await promptInput('Email: ', { validate: EMAIL_PATTERN });
    if (!prompted) {
      console.error(chalk.red('A valid email address is required.'));
      process.exitCode = 1;
      return;
    }
    email = prompted;
  }

  // 2. Password
  let password: string;
  if (options.password) {
    if (!PASSWORD_PATTERN.test(options.password)) {
      console.error(chalk.red('Password does not meet requirements (8+ chars, uppercase, lowercase, number, special character).'));
      process.exitCode = 1;
      return;
    }
    password = options.password;
  } else {
    console.log(chalk.dim('Password must be at least 8 characters with uppercase, lowercase, number, and special character.'));
    const prompted = await promptPassword('Password: ');
    if (!prompted) {
      process.exitCode ??= 1;
      return;
    }
    if (!PASSWORD_PATTERN.test(prompted)) {
      console.error(chalk.red('Password does not meet requirements.'));
      process.exitCode = 1;
      return;
    }

    // Confirm password (interactive only)
    const confirm = await promptPassword('Confirm password: ');
    if (!confirm) {
      process.exitCode ??= 1;
      return;
    }
    if (prompted !== confirm) {
      console.error(chalk.red('Passwords do not match.'));
      process.exitCode = 1;
      return;
    }
    password = prompted;
  }

  // 3. Start signup
  const spinner = await createSpinner('Creating account...');
  spinner.start();

  let sessionToken: string;
  try {
    const result = await startSignup(email, password);
    sessionToken = result.signup_session_token;
    spinner.succeed('Account created');
  } catch (err) {
    spinner.fail('Signup failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  // 4. Verification code
  if (!process.stdin.isTTY) {
    // Headless: print hint and the verify command
    console.log(`\nCheck your email for a 6-character verification code, then run:\n`);
    console.log(`  ud auth signup --token ${sessionToken} --code <CODE>`);
    return;
  }

  console.log(`\n${chalk.cyan('Check your email')} for a 6-character verification code.`);
  const code = await promptInput('Verification code: ', { validate: /^[A-Z0-9]{6}$/i });
  if (!code) {
    console.error(chalk.red('Verification code is required.'));
    process.exitCode = 1;
    return;
  }

  await verifyAndLogin(env, sessionToken, code);
}

async function verifyAndLogin(env: string, sessionToken: string, code: string): Promise<void> {
  if (!/^[A-Z0-9]{6}$/i.test(code)) {
    console.error(chalk.red('Invalid verification code format. Expected 6 alphanumeric characters.'));
    process.exitCode = 1;
    return;
  }

  const verifySpinner = await createSpinner('Verifying...');
  verifySpinner.start();

  try {
    const tokenResponse = await verifySignup(sessionToken, code.toUpperCase());

    const tokens: TokenData = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope,
    };

    await saveTokens(tokens, env as Environment);
    setEnvConfig({
      authMethod: 'oauth',
      oauth: { clientId: SIGNUP_CLIENT_ID },
    }, env as Environment);

    verifySpinner.succeed('Email verified');
    console.log(chalk.green(`\n✓ Account created and logged in to ${env}.`));
    console.log(chalk.dim('Tip: Run "ud install" to enable shell tab completion.'));
  } catch (err) {
    verifySpinner.fail('Verification failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}
