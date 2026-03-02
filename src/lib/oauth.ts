import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { apiBaseUrl, getEnvConfig, setEnvConfig } from './config.js';
import { saveTokens } from './credentials.js';
import type { OAuthServerMetadata, OAuthTokenResponse, OAuthClientRegistration, TokenData } from './types.js';

const TIMEOUT_MS = 120_000;

// --- PKCE ---

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(64);
  let verifier = '';
  for (const b of bytes) {
    verifier += chars[b % chars.length];
  }
  return verifier.slice(0, 64);
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// --- Discovery & Registration ---

export async function discoverMetadata(baseUrl?: string): Promise<OAuthServerMetadata> {
  const url = `${baseUrl ?? apiBaseUrl()}/.well-known/oauth-authorization-server`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OAuth metadata discovery failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OAuthServerMetadata;
}

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<OAuthClientRegistration> {
  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ud-cli',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Client registration failed: ${res.status} ${body}`);
  }
  return (await res.json()) as OAuthClientRegistration;
}

// --- Token operations ---

export async function exchangeCode(
  tokenEndpoint: string,
  code: string,
  redirectUri: string,
  clientId: string,
  codeVerifier: string,
): Promise<OAuthTokenResponse> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

export async function refreshAccessToken(
  tokenEndpoint: string,
  refreshToken: string,
  clientId: string,
): Promise<OAuthTokenResponse> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

export async function revokeToken(
  revocationEndpoint: string,
  token: string,
  clientId: string,
): Promise<void> {
  await fetch(revocationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      client_id: clientId,
    }),
  }).catch(() => {
    // Best-effort revocation — don't fail logout
  });
}

// --- Full PKCE login flow ---

export async function performOAuthLogin(): Promise<TokenData> {
  // 1. Discover OAuth endpoints
  const metadata = await discoverMetadata();

  if (!metadata.registration_endpoint) {
    throw new Error('OAuth server does not support dynamic client registration');
  }

  // 2. Start local callback server to get a port
  const { server, port, waitForCallback } = await createCallbackServer();

  const redirectUri = `http://127.0.0.1:${port}/callback`;

  try {
    // 3. Register client (or reuse existing)
    const envConfig = getEnvConfig();
    let clientId = envConfig.oauth?.clientId;

    if (!clientId) {
      const registration = await registerClient(metadata.registration_endpoint, redirectUri);
      clientId = registration.client_id;
      setEnvConfig({
        oauth: {
          ...envConfig.oauth,
          clientId,
        },
      });
    }

    // 4. Generate PKCE pair
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');

    // 5. Open browser
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', state);

    const open = (await import('open')).default;
    await open(authorizeUrl.toString());

    // 6. Wait for callback
    const { code, returnedState } = await waitForCallback();

    if (returnedState !== state) {
      throw new Error('OAuth state mismatch — possible CSRF attack');
    }

    // 7. Exchange code for tokens
    const tokenResponse = await exchangeCode(
      metadata.token_endpoint,
      code,
      redirectUri,
      clientId,
      codeVerifier,
    );

    const tokens: TokenData = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope,
    };

    // 8. Store tokens
    await saveTokens(tokens);

    return tokens;
  } finally {
    server.close();
  }
}

// --- Local callback server ---

async function createCallbackServer(): Promise<{
  server: http.Server;
  port: number;
  waitForCallback: () => Promise<{ code: string; returnedState: string }>;
}> {
  let resolveCallback: (value: { code: string; returnedState: string }) => void;
  let rejectCallback: (reason: Error) => void;

  const callbackPromise = new Promise<{ code: string; returnedState: string }>(
    (resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    },
  );

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        const desc = url.searchParams.get('error_description') ?? error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization denied</h2><p>You can close this tab.</p></body></html>');
        rejectCallback(new Error(`OAuth authorization failed: ${desc}`));
        return;
      }

      if (!code || !returnedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Missing parameters</h2></body></html>');
        rejectCallback(new Error('Missing code or state in OAuth callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Login successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>');
      resolveCallback({ code, returnedState });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to obtain callback server address'));
        return;
      }
      resolve(addr as AddressInfo);
    });
  });

  const timeout = setTimeout(() => {
    rejectCallback(new Error('OAuth login timed out after 120 seconds'));
    server.close();
  }, TIMEOUT_MS);

  const waitForCallback = async () => {
    try {
      return await callbackPromise;
    } finally {
      clearTimeout(timeout);
    }
  };

  return { server, port: address.port, waitForCallback };
}
