import {
  ATTENDANCE_STATUSES,
  getAttendanceStatusLabel,
  getPlayStyleLabel,
  getSkillLabels,
  getSportLabel,
  isAttendanceStatus,
  isPlayStyle,
  isSportType,
  PLAY_STYLES,
  SKILL_LEVELS,
  SPORT_TYPES,
} from "../taxonomy";

describe("sports taxonomy", () => {
  it("exposes canonical sport list", () => {
    expect(SPORT_TYPES).toEqual(["padel", "climbing", "running", "other"]);
    expect(isSportType("other")).toBe(true);
    expect(isSportType("tennis")).toBe(false);
  });

  it("falls back to global skill levels", () => {
    expect(getSkillLabels(undefined)).toEqual(Array.from(SKILL_LEVELS));
    expect(getSkillLabels("other")).toEqual(Array.from(SKILL_LEVELS));
  });

  it("returns sport-specific labels", () => {
    expect(getSkillLabels("padel")[0]).toContain("1.0");
    expect(getSkillLabels("climbing")).toContain("V4 / 5.11");
  });

  it("exposes play styles and guards", () => {
    expect(PLAY_STYLES).toEqual(["competitive", "fun"]);
    expect(isPlayStyle("competitive")).toBe(true);
    expect(isPlayStyle("casual")).toBe(false);
    expect(getPlayStyleLabel("competitive")).toBe("Competitive");
    expect(getPlayStyleLabel(undefined)).toBe("Fun");
  });

  it("exposes attendance statuses and helpers", () => {
    expect(ATTENDANCE_STATUSES).toEqual(["registered", "attended", "late_cancel", "no_show"]);
    expect(isAttendanceStatus("registered")).toBe(true);
    expect(isAttendanceStatus("going")).toBe(false);
    expect(getAttendanceStatusLabel("late_cancel")).toBe("Late cancel");
  });

  it("provides display labels for sports", () => {
    expect(getSportLabel("running")).toBe("Running");
    expect(getSportLabel(undefined)).toBe("Other");
  });
});
