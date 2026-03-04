import { apiBaseUrl } from './config.js';

interface SignupResponse {
  signup_session_token: string;
  expires_in: number;
}

interface SignupVerifyResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface SignupErrorBody {
  error: string;
  error_description: string;
}

export async function startSignup(
  email: string,
  password: string,
): Promise<SignupResponse> {
  const url = `${apiBaseUrl()}/api/oauth/signup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as SignupErrorBody;
      throw new Error(body.error_description ?? 'Signup failed');
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error('Signup failed');
      throw err;
    }
  }

  return (await res.json()) as SignupResponse;
}

export async function verifySignup(
  sessionToken: string,
  verificationCode: string,
): Promise<SignupVerifyResponse> {
  const url = `${apiBaseUrl()}/api/oauth/signup/verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signup_session_token: sessionToken,
      verification_code: verificationCode,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as SignupErrorBody;
      throw new Error(body.error_description ?? 'Verification failed');
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error('Verification failed');
      throw err;
    }
  }

  return (await res.json()) as SignupVerifyResponse;
}
