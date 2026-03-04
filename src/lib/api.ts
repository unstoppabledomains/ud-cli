import { getActiveEnv, getEnvConfig, mcpBaseUrl, apiBaseUrl } from './config.js';
import { getApiKey, getTokens, saveTokens } from './credentials.js';
import { refreshAccessToken, discoverMetadata } from './oauth.js';
import { ApiError } from './types.js';
import type { AuthStatus, TokenData } from './types.js';

const REFRESH_BUFFER_MS = 60_000; // Refresh 60s before expiry

async function getAuthHeader(): Promise<string | null> {
  const env = getActiveEnv();
  const envConfig = getEnvConfig(env);

  if (envConfig.authMethod === 'oauth') {
    let tokens = await getTokens(env);
    if (!tokens) return null;

    // Proactive refresh if token expires within buffer
    if (tokens.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
      tokens = await tryRefreshTokens(tokens);
    }

    return `Bearer ${tokens.accessToken}`;
  }

  // Default: API key
  const apiKey = await getApiKey(env);
  if (!apiKey) return null;
  return `Bearer ${apiKey}`;
}

async function tryRefreshTokens(tokens: TokenData): Promise<TokenData> {
  const envConfig = getEnvConfig();
  const clientId = envConfig.oauth?.clientId;
  if (!clientId) return tokens;

  try {
    const metadata = await discoverMetadata();
    const response = await refreshAccessToken(
      metadata.token_endpoint,
      tokens.refreshToken,
      clientId,
    );

    const refreshed: TokenData = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      scope: response.scope,
    };

    await saveTokens(refreshed);
    return refreshed;
  } catch {
    // If refresh fails, return original tokens and let the 401 retry handle it
    return tokens;
  }
}

async function request(
  url: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await fetch(url, { ...options, headers });

  // Reactive refresh: retry once on 401
  if (res.status === 401 && retry) {
    const envConfig = getEnvConfig();
    if (envConfig.authMethod === 'oauth') {
      const tokens = await getTokens();
      if (tokens) {
        const refreshed = await tryRefreshTokens(tokens);
        if (refreshed.accessToken !== tokens.accessToken) {
          return request(url, options, false);
        }
      }
    }
  }

  return res;
}

function parseError(status: number, body: string): ApiError {
  try {
    const json = JSON.parse(body) as { error?: string; message?: string };
    const message = json.message ?? json.error ?? body;

    switch (status) {
      case 400:
        return new ApiError(`Bad request: ${message}`, 400, 'BAD_REQUEST');
      case 401:
        return new ApiError('Authentication failed. Run `ud auth login` to authenticate.', 401, 'UNAUTHORIZED');
      case 403:
        return new ApiError(`Access denied: ${message}`, 403, 'FORBIDDEN');
      default:
        return new ApiError(`API error (${status}): ${message}`, status, 'API_ERROR');
    }
  } catch {
    return new ApiError(`API error (${status}): ${body}`, status, 'API_ERROR');
  }
}

// --- Public API ---

export async function callAction(
  toolName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const url = `${mcpBaseUrl()}/actions/${toolName}`;
  const res = await request(url, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw parseError(res.status, body);
  }

  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const url = `${mcpBaseUrl()}/health`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function verifyAuth(): Promise<AuthStatus> {
  const env = getActiveEnv();
  const envConfig = getEnvConfig(env);

  // Check if any credentials exist
  const hasApiKey = !!(await getApiKey(env));
  const hasTokens = !!(await getTokens(env));

  if (!hasApiKey && !hasTokens) {
    return {
      authenticated: false,
      environment: env,
      message: 'Not authenticated. Run `ud auth signup` to create an account or `ud auth login` to sign in.',
    };
  }

  const method = envConfig.authMethod ?? (hasApiKey ? 'api-key' : 'oauth');

  try {
    // Use portfolio list as a lightweight auth check
    const url = `${mcpBaseUrl()}/actions/ud_portfolio_list`;
    const res = await request(url, {
      method: 'POST',
      body: JSON.stringify({ limit: 1 }),
    });

    if (res.ok) {
      return {
        authenticated: true,
        method,
        environment: env,
        message: `Authenticated via ${method} to ${env}`,
      };
    }

    const body = await res.text();
    const error = parseError(res.status, body);
    return {
      authenticated: false,
      method,
      environment: env,
      message: error.message,
    };
  } catch (err) {
    return {
      authenticated: false,
      method,
      environment: env,
      message: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export { apiBaseUrl, mcpBaseUrl };
