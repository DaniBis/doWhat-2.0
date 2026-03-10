const CHUNK_LOAD_ERROR_PATTERNS = [
  /chunkloaderror/i,
  /loading chunk [^\n]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading chunk/i,
] as const;

export const CHUNK_RELOAD_SESSION_KEY = 'dowhat:chunk-reload-at';
export const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

const normalizeReasonMessage = (reason: unknown): string => {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) {
    return `${reason.name} ${reason.message}`.trim();
  }
  if (typeof reason === 'object') {
    const record = reason as { message?: unknown; reason?: unknown; type?: unknown };
    const message = typeof record.message === 'string' ? record.message : '';
    const nestedReason = typeof record.reason === 'string' ? record.reason : '';
    const type = typeof record.type === 'string' ? record.type : '';
    return `${message} ${nestedReason} ${type}`.trim();
  }
  return String(reason);
};

export const isChunkLoadFailureMessage = (reason: unknown): boolean => {
  const message = normalizeReasonMessage(reason);
  if (!message) return false;
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const shouldAttemptChunkReload = (
  lastAttemptRaw: string | null,
  now: number,
  cooldownMs = CHUNK_RELOAD_COOLDOWN_MS,
): boolean => {
  if (!lastAttemptRaw) return true;
  const lastAttempt = Number(lastAttemptRaw);
  if (!Number.isFinite(lastAttempt)) return true;
  return now - lastAttempt > cooldownMs;
};

export const chunkLoadRecoveryScript = `
(function () {
  var KEY = ${JSON.stringify(CHUNK_RELOAD_SESSION_KEY)};
  var COOLDOWN_MS = ${String(CHUNK_RELOAD_COOLDOWN_MS)};
  var patterns = [
    /chunkloaderror/i,
    /loading chunk [^\\n]+ failed/i,
    /failed to fetch dynamically imported module/i,
    /importing a module script failed/i,
    /error loading chunk/i
  ];

  function normalizeReasonMessage(reason) {
    if (!reason) return '';
    if (typeof reason === 'string') return reason;
    if (reason instanceof Error) return ((reason.name || '') + ' ' + (reason.message || '')).trim();
    if (typeof reason === 'object') {
      var message = typeof reason.message === 'string' ? reason.message : '';
      var nestedReason = typeof reason.reason === 'string' ? reason.reason : '';
      var type = typeof reason.type === 'string' ? reason.type : '';
      return (message + ' ' + nestedReason + ' ' + type).trim();
    }
    return String(reason);
  }

  function isChunkFailure(reason) {
    var message = normalizeReasonMessage(reason);
    if (!message) return false;
    return patterns.some(function (pattern) { return pattern.test(message); });
  }

  function shouldReload() {
    try {
      var lastAttemptRaw = window.sessionStorage.getItem(KEY);
      if (!lastAttemptRaw) return true;
      var lastAttempt = Number(lastAttemptRaw);
      if (!Number.isFinite(lastAttempt)) return true;
      return Date.now() - lastAttempt > COOLDOWN_MS;
    } catch (_error) {
      return true;
    }
  }

  function reload() {
    if (!shouldReload()) return;
    try {
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch (_error) {
      // ignore storage failures
    }
    window.location.reload();
  }

  window.addEventListener('error', function (event) {
    if (isChunkFailure(event && (event.error || event.message))) {
      reload();
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (isChunkFailure(event && event.reason)) {
      reload();
    }
  });
})();
`;