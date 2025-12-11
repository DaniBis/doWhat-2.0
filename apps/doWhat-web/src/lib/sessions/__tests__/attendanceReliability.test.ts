import { normalizeVerifiedFlag } from "../attendanceReliability";

describe("attendanceReliability helpers", () => {
  it("only honors verified flags for attended rows", () => {
    expect(normalizeVerifiedFlag("attended", true)).toBe(true);
    expect(normalizeVerifiedFlag("attended", false)).toBe(false);
    expect(normalizeVerifiedFlag("no_show", true)).toBe(false);
    expect(normalizeVerifiedFlag("late_cancel", true)).toBe(false);
  });
});
