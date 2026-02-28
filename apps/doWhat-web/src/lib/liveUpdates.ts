export const DATA_MUTATION_EVENT = "dowhat:data-mutated";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function normalizeMethod(method: string | undefined | null): string {
  return (method ?? "GET").toUpperCase();
}

export function isMutationMethod(method: string | undefined | null): boolean {
  return !READ_METHODS.has(normalizeMethod(method));
}

export function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function shouldBroadcastMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = normalizeMethod(init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : undefined));
  if (!isMutationMethod(method)) return false;

  const rawUrl = resolveRequestUrl(input);
  if (!rawUrl) return false;

  if (rawUrl.startsWith("/api/")) return true;

  try {
    const resolved = new URL(rawUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const isApiPath = resolved.pathname.startsWith("/api/");
    const sameOrigin = typeof window === "undefined" || resolved.origin === window.location.origin;
    return isApiPath && sameOrigin;
  } catch {
    return false;
  }
}
