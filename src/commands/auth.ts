import { Command } from 'commander';
import chalk from 'chalk';
import { getActiveEnv, getEnvConfig, setEnvConfig, clearEnvConfig, apiBaseUrl } from '../lib/config.js';
import { saveApiKey, clearCredentials, getTokens } from '../lib/credentials.js';
import { performOAuthLogin, revokeToken, discoverMetadata } from '../lib/oauth.js';
import { verifyAuth } from '../lib/api.js';

const API_KEY_PATTERN = /^ud_mcp_[0-9a-f]{64}$/;

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Authenticate with Unstoppable Domains')
    .option('-m, --method <method>', 'auth method (oauth or api-key)', 'oauth')
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
    .command('whoami')
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

  await saveApiKey(key, env as 'production' | 'staging');
  setEnvConfig({ authMethod: 'api-key' }, env as 'production' | 'staging');

  // Verify the key actually works
  const status = await verifyAuth();

  if (status.authenticated) {
    console.log(chalk.green(`✓ API key saved and verified for ${env}.`));
  } else {
    console.log(chalk.yellow(`API key saved for ${env}, but verification failed: ${status.message}`));
  }
}

async function loginOAuth(env: string): Promise<void> {
  console.log(chalk.blue(`Starting OAuth login for ${env}...`));
  console.log('Opening browser for authorization...');

  try {
    await performOAuthLogin();
    setEnvConfig({ authMethod: 'oauth' }, env as 'production' | 'staging');
    console.log(chalk.green(`✓ OAuth login successful for ${env}.`));
  } catch (err) {
    console.error(chalk.red(`OAuth login failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
  }
}
