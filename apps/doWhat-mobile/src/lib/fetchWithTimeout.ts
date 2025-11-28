const DEFAULT_TIMEOUT_MS = 8000;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export type FetchWithTimeoutOptions = (FetchInit extends undefined ? RequestInit : Exclude<FetchInit, undefined>) & {
  timeoutMs?: number;
};

const buildAbortError = () => {
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
};

const buildTimeoutReason = () => {
  if (typeof DOMException === 'function') {
    return new DOMException('Timeout exceeded', 'TimeoutError');
  }
  const error = new Error('Timeout exceeded');
  error.name = 'TimeoutError';
  return error;
};

export async function fetchWithTimeout(input: FetchInput, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const controller = new AbortController();
  const timeoutReason = buildTimeoutReason();
  const timer = setTimeout(() => controller.abort(timeoutReason), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  const cleanup = () => {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  if (signal) {
    if (signal.aborted) {
      cleanup();
      throw (signal.reason instanceof Error ? signal.reason : buildAbortError());
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    return await fetch(input, {
      ...(rest as RequestInit),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError' || (error as Error)?.name === 'TimeoutError') {
      throw buildAbortError();
    }
    throw error;
  } finally {
    cleanup();
  }
}
