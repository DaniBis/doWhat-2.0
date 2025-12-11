import { calculateNewScore } from "../reliability";

describe("calculateNewScore", () => {
  it.each([
    { current: 80, action: "attended", expected: 90 },
    { current: 95, action: "attended", expected: 100 },
    { current: 70, action: "cancel_early", expected: 70 },
    { current: 50, action: "cancel_late", expected: 40 },
    { current: 5, action: "cancel_late", expected: 0 },
    { current: 40, action: "no_show", expected: 10 },
    { current: 20, action: "no_show", expected: 0 },
  ])("handles %j", ({ current, action, expected }) => {
    expect(calculateNewScore(current, action as any)).toBe(expected);
  });

  it("treats non-finite inputs as max score before applying delta", () => {
    expect(calculateNewScore(Number.NaN, "attended")).toBe(100);
  });
});
