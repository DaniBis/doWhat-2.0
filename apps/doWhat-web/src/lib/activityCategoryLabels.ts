import { defaultTier3Index } from "@dowhat/shared";

export type CategoryDisplayMeta = {
  id: string;
  label: string;
  parent: string | null;
};

const tier3Lookup: Map<string, CategoryDisplayMeta> = (() => {
  const map = new Map<string, CategoryDisplayMeta>();
  defaultTier3Index.forEach((entry) => {
    map.set(entry.id, {
      id: entry.id,
      label: entry.label,
      parent: entry.tier1Label ?? entry.tier2Label ?? null,
    });
  });
  return map;
})();

const friendlyLabel = (value: string) => {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return value;
  return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
};

export function describeActivityCategories(ids: Array<string | null | undefined>): CategoryDisplayMeta[] {
  const seen = new Set<string>();
  const descriptors: CategoryDisplayMeta[] = [];
  ids.forEach((raw) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const dedupeKey = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const lookup = tier3Lookup.get(trimmed);
    if (lookup) {
      descriptors.push(lookup);
      return;
    }
    descriptors.push({ id: trimmed, label: friendlyLabel(trimmed), parent: null });
  });
  return descriptors;
}
