import { describeActivityCategories } from "../activityCategoryLabels";

jest.mock("@dowhat/shared", () => ({
  defaultTier3Index: [
    { id: "tier3-run", label: "Trail Run", tier1Label: "Outdoors" },
    { id: "tier3-dance", label: "Dance Flow", tier2Label: "Creative" },
  ],
}));

describe("describeActivityCategories", () => {
  it("returns normalized labels + parents for known tier3 ids", () => {
    const result = describeActivityCategories(["tier3-run", "tier3-dance"]);
    expect(result).toEqual([
      { id: "tier3-run", label: "Trail Run", parent: "Outdoors" },
      { id: "tier3-dance", label: "Dance Flow", parent: "Creative" },
    ]);
  });

  it("deduplicates and formats unknown ids", () => {
    const result = describeActivityCategories(["tier3-run", " freestyle_dance ", null, "freestyle-dance"]);
    expect(result).toEqual([
      { id: "tier3-run", label: "Trail Run", parent: "Outdoors" },
      { id: "freestyle_dance", label: "Freestyle Dance", parent: null },
    ]);
  });
});
