export type Environment = 'production' | 'staging';

export type OutputFormat = 'table' | 'json' | 'csv';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  scope?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  method?: 'api-key' | 'oauth';
  environment: Environment;
  message: string;
}

export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported?: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface OAuthClientRegistration {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
}

export interface EnvironmentConfig {
  authMethod?: 'api-key' | 'oauth';
  oauth?: {
    clientId?: string;
  };
}

export interface CommandDefaults {
  fields?: string;
  format?: OutputFormat;
  quiet?: boolean;
}

export interface AppConfig {
  environment: Environment;
  environments: Record<Environment, EnvironmentConfig>;
  defaults: Record<string, CommandDefaults>;
  lastUpdateCheck: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
