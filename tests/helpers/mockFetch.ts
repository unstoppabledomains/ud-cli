type FetchHandler = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

let handlers: Array<{
  match: (url: string) => boolean;
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>;
}> = [];

let originalFetch: typeof globalThis.fetch;

export function setupMockFetch(): void {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
}

export function teardownMockFetch(): void {
  globalThis.fetch = originalFetch;
  handlers = [];
}

export function mockFetchRoute(
  pattern: string | RegExp | ((url: string) => boolean),
  response: Response | ((url: string, init?: RequestInit) => Response | Promise<Response>),
): void {
  const match =
    typeof pattern === 'string'
      ? (url: string) => url.includes(pattern)
      : pattern instanceof RegExp
        ? (url: string) => pattern.test(url)
        : pattern;

  const handler = typeof response === 'function' ? response : () => response;

  handlers.push({ match, handler });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

const mockFetch: FetchHandler = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  for (const { match, handler } of handlers) {
    if (match(url)) {
      return handler(url, init);
    }
  }

  return new Response('Not Found', { status: 404 });
};
