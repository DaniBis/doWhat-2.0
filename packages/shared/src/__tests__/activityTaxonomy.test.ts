import { describe, expect, it } from "@jest/globals";

import {
  activityTaxonomyVersion,
  buildTagLookup,
  flattenTaxonomy,
  getTier3Category,
  resolveTagToTier3,
} from "../taxonomy";

describe("activityTaxonomy", () => {
  it("uses a semantic date version string", () => {
    expect(activityTaxonomyVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("flattens to unique Tier3 IDs", () => {
    const flattened = flattenTaxonomy();
    expect(flattened.length).toBeGreaterThan(20);

    const idSet = new Set(flattened.map(entry => entry.id));
    expect(idSet.size).toBe(flattened.length);
  });

  it("attaches ancestry metadata", () => {
    const flattened = flattenTaxonomy();
    const sample = flattened.find(entry => entry.id === "city-run-crews");

    expect(sample).toBeDefined();
    expect(sample?.tier1Label).toBe("Move & Sweat");
    expect(sample?.tier2Label).toBe("Cardio Clubs");
  });

  it("builds a normalized tag lookup", () => {
    const lookup = buildTagLookup();
    const hit = lookup.get("run-club");

    expect(hit?.id).toBe("city-run-crews");
  });

  it("resolves Tier3 categories by id or tag", () => {
    expect(getTier3Category("specialty-coffee-crawls")).toBeDefined();
    expect(resolveTagToTier3("coffee")?.id).toBe("specialty-coffee-crawls");
  });

  it("ensures every Tier3 entry exposes tags", () => {
    flattenTaxonomy().forEach(entry => {
      expect(entry.tags.length).toBeGreaterThan(0);
    });
  });
});
