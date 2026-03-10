export {};

jest.mock('cheerio', () => {
  type MockElement = {
    attrs: Record<string, string>;
    tagName: string;
    text?: string;
  };

  const parseAttributes = (tagSource: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const attributeRe = /([^\s"'=<>\/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attributeRe.exec(tagSource))) {
      const name = match[1]?.toLowerCase();
      if (!name) continue;
      attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return attrs;
  };

  const parseVoidElements = (html: string, tagName: 'meta' | 'link'): MockElement[] => {
    const elementRe = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
    const elements: MockElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = elementRe.exec(html))) {
      elements.push({
        attrs: parseAttributes(match[1] ?? ''),
        tagName,
      });
    }
    return elements;
  };

  const parseScripts = (html: string): MockElement[] => {
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const elements: MockElement[] = [];
    let match: RegExpExecArray | null;
    while ((match = scriptRe.exec(html))) {
      elements.push({
        attrs: parseAttributes(match[1] ?? ''),
        tagName: 'script',
        text: match[2] ?? '',
      });
    }
    return elements;
  };

  const matchesSelector = (element: MockElement, selector: string): boolean => {
    const selectorMatch = selector.match(/^([a-z]+)\[([a-z:-]+)(~?=)"([^"]+)"\]$/i);
    if (!selectorMatch) return false;
    const [, tagName, attributeName, operator, expectedValue] = selectorMatch;
    if (element.tagName !== tagName.toLowerCase()) return false;
    const actualValue = element.attrs[attributeName.toLowerCase()];
    if (typeof actualValue !== 'string') return false;
    if (operator === '~=') {
      return actualValue
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .includes(expectedValue.toLowerCase());
    }
    return actualValue.toLowerCase() === expectedValue.toLowerCase();
  };

  const wrap = (elements: MockElement[]) => ({
    each(callback: (index: number, element: MockElement) => void) {
      elements.forEach((element, index) => callback(index, element));
    },
    attr(name: string) {
      return elements[0]?.attrs[name.toLowerCase()];
    },
    contents() {
      return {
        text: () => elements[0]?.text ?? '',
      };
    },
  });

  const load = (html: string) => {
    const elements = [
      ...parseScripts(html),
      ...parseVoidElements(html, 'meta'),
      ...parseVoidElements(html, 'link'),
    ];

    return (input: string | MockElement) => {
      if (typeof input === 'string') {
        return wrap(elements.filter((element) => matchesSelector(element, input)));
      }
      return wrap([input]);
    };
  };

  return { load };
});

let GET: typeof import('../route').GET;

beforeAll(async () => {
  if (!globalThis.TextEncoder) {
    const { TextEncoder, TextDecoder } = await import('node:util');
    globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
    if (!globalThis.TextDecoder) {
      globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
    }
  }
  if (!globalThis.ReadableStream) {
    const { ReadableStream } = await import('node:stream/web');
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;
  }
  if (!globalThis.MessagePort) {
    const { MessagePort, MessageChannel } = await import('node:worker_threads');
    globalThis.MessagePort = MessagePort as unknown as typeof globalThis.MessagePort;
    if (!globalThis.MessageChannel) {
      globalThis.MessageChannel = MessageChannel as unknown as typeof globalThis.MessageChannel;
    }
  }
  if (!globalThis.Request) {
    const { Request, Response, Headers } = await import('undici');
    globalThis.Request = Request as unknown as typeof globalThis.Request;
    if (!globalThis.Response) {
      globalThis.Response = Response as unknown as typeof globalThis.Response;
    }
    if (!globalThis.Headers) {
      globalThis.Headers = Headers as unknown as typeof globalThis.Headers;
    }
  }
  const route = await import('../route');
  GET = route.GET;
});

describe('/api/place-logo', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
  });

  it('redirects to a JSON-LD logo from the official website', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        '<html><head><script type="application/ld+json">{"@context":"https://schema.org","logo":"/assets/logo.svg"}</script></head></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        },
      ),
    ) as typeof global.fetch;

    const response = await GET(new Request('http://localhost/api/place-logo?website=https://brand.example'));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://brand.example/assets/logo.svg');
  });

  it('redirects to a logo declared in meta tags when JSON-LD is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        '<html><head><meta itemprop="logo" content="/brand-mark.png" /></head></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        },
      ),
    ) as typeof global.fetch;

    const response = await GET(new Request('http://localhost/api/place-logo?website=https://meta.example'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://meta.example/brand-mark.png');
  });

  it('redirects to a branded icon link when no higher-priority logo exists', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        '<html><head><link rel="apple-touch-icon" href="/touch-icon.png" /></head></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        },
      ),
    ) as typeof global.fetch;

    const response = await GET(new Request('http://localhost/api/place-logo?website=https://icon.example'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://icon.example/touch-icon.png');
  });

  it('falls back to the favicon service when no official logo candidate is present', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('<html><head><title>No logo here</title></head><body></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as typeof global.fetch;

    const response = await GET(new Request('http://localhost/api/place-logo?website=fallback.example'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://www.google.com/s2/favicons?sz=128&domain_url=https%3A%2F%2Ffallback.example',
    );
  });
});
