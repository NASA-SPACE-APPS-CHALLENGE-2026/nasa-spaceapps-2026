export type FetchImpl = typeof fetch;

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'http' | 'network' | 'format' | 'empty',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export const USER_AGENT = 'PlotTwist/0.1 (NASA Space Apps 2026 prototype)';

/** fetch with a hard timeout; converts every failure into a SourceError with a plain-language message. */
export async function fetchText(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit & { timeoutMs?: number; label: string },
): Promise<{ status: number; text: string }> {
  const { timeoutMs = 20000, label, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...rest,
      headers: { 'User-Agent': USER_AGENT, ...(rest.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new SourceError(`${label} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`, 'timeout');
    }
    throw new SourceError(`${label} could not be reached (${(err as Error).message}).`, 'network');
  }
  try {
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new SourceError(`${label} did not finish responding within ${Math.round(timeoutMs / 1000)} seconds.`, 'timeout');
    }
    throw new SourceError(`${label} response could not be read (${(err as Error).message}).`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOkText(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit & { timeoutMs?: number; label: string },
): Promise<string> {
  const { status, text } = await fetchText(fetchImpl, url, init);
  if (status < 200 || status >= 300) {
    throw new SourceError(`${init.label} returned an error (HTTP ${status}).`, 'http', status);
  }
  return text;
}

export function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(`${label} sent a response that was not the expected data format.`, 'format');
  }
}

/** Run async tasks with a concurrency limit, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
