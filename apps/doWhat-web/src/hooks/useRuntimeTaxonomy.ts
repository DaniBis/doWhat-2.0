"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  activityTaxonomy,
  activityTaxonomyVersion,
  flattenTaxonomy,
  type ActivityTaxonomy,
  type ActivityTier3WithAncestors,
} from "@dowhat/shared";

import type { TaxonomyFetchResult } from "@/lib/taxonomy";

const normaliseTag = (value: string) => value.trim().toLowerCase().replace(/[^0-9a-z]+/g, "_");

const buildTagMap = (entries: ActivityTier3WithAncestors[]) => {
  const map = new Map<string, string[]>();
  entries.forEach((entry) => {
    const tags = (entry.tags ?? []).map(normaliseTag).filter(Boolean);
    if (tags.length) {
      map.set(entry.id, tags);
    }
  });
  return map;
};

const buildSnapshot = (taxonomy: ActivityTaxonomy, version: string, fetchedAt = Date.now()) => {
  const tier3Index = flattenTaxonomy(taxonomy);
  return {
    taxonomy,
    version,
    fetchedAt,
    tier3Index,
    tier3Ids: new Set(tier3Index.map((entry) => entry.id)),
    tier3ById: new Map(tier3Index.map((entry) => [entry.id, entry])),
    taxonomyTagMap: buildTagMap(tier3Index),
  } as const;
};

type Snapshot = ReturnType<typeof buildSnapshot>;

type Status = "idle" | "loading" | "ready" | "error";

const fallbackSnapshot = buildSnapshot(activityTaxonomy, activityTaxonomyVersion, 0);

export function useRuntimeTaxonomy() {
  const [snapshot, setSnapshot] = useState<Snapshot>(fallbackSnapshot);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const load = useCallback(
    async (force = false) => {
      setStatus((prev) => (prev === "ready" && !force ? prev : "loading"));
      setError(null);
      try {
        const url = force ? "/api/taxonomy?force=true" : "/api/taxonomy";
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load taxonomy (${response.status})`);
        }
        const payload = (await response.json()) as TaxonomyFetchResult;
        if (!mountedRef.current) return;
        setSnapshot(buildSnapshot(payload.taxonomy, payload.version, payload.fetchedAt));
        setStatus("ready");
      } catch (err) {
        console.error("[useRuntimeTaxonomy] failed to load taxonomy", err);
        if (!mountedRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return {
    ...snapshot,
    status,
    error,
    refresh,
  };
}
