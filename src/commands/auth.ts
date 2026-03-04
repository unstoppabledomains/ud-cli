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
    .action(async () => {
      const env = getActiveEnv();
      await signupFlow(env);
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

async function signupFlow(env: string): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red('Signup requires an interactive terminal.'));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.blue(`Creating a new account on ${env}...\n`));

  // 1. Email
  const email = await promptInput('Email: ', { validate: EMAIL_PATTERN });
  if (!email) {
    console.error(chalk.red('A valid email address is required.'));
    process.exitCode = 1;
    return;
  }

  // 2. Password
  console.log(chalk.dim('Password must be at least 8 characters with uppercase, lowercase, number, and special character.'));
  const password = await promptPassword('Password: ');
  if (!password) {
    process.exitCode = 1;
    return;
  }

  if (!PASSWORD_PATTERN.test(password)) {
    console.error(chalk.red('Password does not meet requirements.'));
    process.exitCode = 1;
    return;
  }

  // 3. Confirm password
  const confirm = await promptPassword('Confirm password: ');
  if (!confirm) {
    process.exitCode = 1;
    return;
  }
  if (password !== confirm) {
    console.error(chalk.red('Passwords do not match.'));
    process.exitCode = 1;
    return;
  }

  // 4. Start signup
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

  // 5. Verification code
  console.log(`\n${chalk.cyan('Check your email')} for a 6-character verification code.`);
  const code = await promptInput('Verification code: ', { validate: /^[A-Z0-9]{6}$/i });
  if (!code) {
    console.error(chalk.red('Verification code is required.'));
    process.exitCode = 1;
    return;
  }

  // 6. Verify
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
    setEnvConfig({ authMethod: 'oauth' }, env as Environment);

    verifySpinner.succeed('Email verified');
    console.log(chalk.green(`\n✓ Account created and logged in to ${env}.`));
    console.log(chalk.dim('Tip: Run "ud install" to enable shell tab completion.'));
  } catch (err) {
    verifySpinner.fail('Verification failed');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}
