"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DATA_MUTATION_EVENT, shouldBroadcastMutation } from "@/lib/liveUpdates";

const FOCUS_REFRESH_COOLDOWN_MS = 15_000;
const MUTATION_REFRESH_DEBOUNCE_MS = 300;

export default function AppLiveUpdates() {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const mutationDebounce = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      lastRefreshAt.current = Date.now();
      router.refresh();
    };

    const refreshOnFocus = () => {
      const now = Date.now();
      if (now - lastRefreshAt.current >= FOCUS_REFRESH_COOLDOWN_MS) {
        refresh();
      }
    };

    const onDataMutation = () => {
      if (mutationDebounce.current) {
        window.clearTimeout(mutationDebounce.current);
      }
      mutationDebounce.current = window.setTimeout(() => {
        mutationDebounce.current = null;
        refresh();
      }, MUTATION_REFRESH_DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshOnFocus();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(DATA_MUTATION_EVENT, onDataMutation as EventListener);

    return () => {
      if (mutationDebounce.current) {
        window.clearTimeout(mutationDebounce.current);
      }
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(DATA_MUTATION_EVENT, onDataMutation as EventListener);
    };
  }, [router]);

  useEffect(() => {
    const marker = "__dowhatFetchMutationPatched" as const;
    const globalWindow = window as Window & { [marker]?: boolean; __dowhatOriginalFetch?: typeof window.fetch };
    if (globalWindow[marker]) return;

    const originalFetch = window.fetch.bind(window);
    globalWindow.__dowhatOriginalFetch = originalFetch;
    globalWindow[marker] = true;

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      if (response.ok && shouldBroadcastMutation(input, init)) {
        window.dispatchEvent(new CustomEvent(DATA_MUTATION_EVENT));
      }
      return response;
    }) as typeof window.fetch;

    return () => {
      if (globalWindow.__dowhatOriginalFetch) {
        window.fetch = globalWindow.__dowhatOriginalFetch;
      }
      globalWindow[marker] = false;
    };
  }, []);

  return null;
}
