import type { IncomingMessage } from 'node:http';

export interface AuthOptions {
  djangoUrl?: string;
  serviceToken?: string;
  sessionCookieName?: string;
}

export type AuthResult = string | number | null;

export async function authenticate(
  request: IncomingMessage,
  {
    djangoUrl = process.env.DJANGO_INTERNAL_URL,
    serviceToken = process.env.DJANGO_INTERNAL_AUTH_TOKEN,
    sessionCookieName = process.env.DJANGO_SESSION_COOKIE_NAME || 'sessionid',
  }: AuthOptions = {},
): Promise<AuthResult> {
  if (!djangoUrl || !serviceToken) return null;

  const prefix = `${sessionCookieName}=`;
  const cookie = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix) && value.length > prefix.length);
  if (!cookie) return null;

  try {
    const base = djangoUrl.endsWith('/') ? djangoUrl : `${djangoUrl}/`;
    const response = await fetch(new URL('internal/auth/', base), {
      headers: {
        Cookie: cookie,
        Authorization: `Bearer ${serviceToken}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    if (response.status !== 200) return null;

    const { user_id: userId } = await response.json();
    if (
      (typeof userId === 'string' && userId.length > 0)
      || (typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0)
    ) {
      return userId;
    }
  } catch {
    return null;
  }
  return null;
}
