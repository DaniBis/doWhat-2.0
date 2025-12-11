const SPORT_TYPES = ["padel", "climbing", "running", "other"] as const;
const PLAY_STYLES = ["competitive", "fun"] as const;
const ATTENDANCE_STATUSES = ["registered", "attended", "late_cancel", "no_show"] as const;
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"] as const;

type SportType = (typeof SPORT_TYPES)[number];
type PlayStyle = (typeof PLAY_STYLES)[number];
type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

type SkillLabelMap = Record<SportType, string[]>;

const PadelLabels = [
  "1.0 - New to the sport",
  "2.5 - Casual social play",
  "3.5 - Consistent rallies",
  "4.5 - Competitive club",
  "6.0 - National level",
  "7.0 - World tour aspirant",
];

const ClimbingLabels = [
  "V0 / 5.7",
  "V2 / 5.10",
  "V4 / 5.11",
  "V6 / 5.12",
  "V8 / 5.13",
  "V10+ / 5.14",
];

const RunningLabels = [
  "Run/Walk · 7:00+/km",
  "Steady · 6:00/km",
  "Tempo · 5:00/km",
  "Fast Pack · 4:30/km",
  "Race Pace · 4:00/km",
  "Elite · sub 3:30/km",
];

const SPORT_SPECIFIC_LABELS: SkillLabelMap = {
  padel: PadelLabels,
  climbing: ClimbingLabels,
  running: RunningLabels,
  other: [...SKILL_LEVELS],
};

const SPORT_LABELS: Record<SportType, string> = {
  padel: "Padel",
  climbing: "Climbing",
  running: "Running",
  other: "Other",
};

const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  competitive: "Competitive",
  fun: "Fun",
};

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  registered: "Registered",
  attended: "Attended",
  late_cancel: "Late cancel",
  no_show: "No show",
};

const SPORT_TYPE_SET = new Set<SportType>(SPORT_TYPES);
const PLAY_STYLE_SET = new Set<PlayStyle>(PLAY_STYLES);
const ATTENDANCE_STATUS_SET = new Set<AttendanceStatus>(ATTENDANCE_STATUSES);

export const getSkillLabels = (sport?: SportType) => {
  if (!sport) return [...SKILL_LEVELS];
  return SPORT_SPECIFIC_LABELS[sport] ?? [...SKILL_LEVELS];
};

export const getSportLabel = (sport: SportType | null | undefined) => {
  if (!sport) return SPORT_LABELS.other;
  return SPORT_LABELS[sport] ?? SPORT_LABELS.other;
};

export const getPlayStyleLabel = (style: PlayStyle | null | undefined) => {
  if (!style) return PLAY_STYLE_LABELS.fun;
  return PLAY_STYLE_LABELS[style] ?? PLAY_STYLE_LABELS.fun;
};

export const getAttendanceStatusLabel = (status: AttendanceStatus | null | undefined) => {
  if (!status) return ATTENDANCE_STATUS_LABELS.registered;
  return ATTENDANCE_STATUS_LABELS[status] ?? ATTENDANCE_STATUS_LABELS.registered;
};

export const isSportType = (value: unknown): value is SportType =>
  typeof value === "string" && SPORT_TYPE_SET.has(value as SportType);

export const isPlayStyle = (value: unknown): value is PlayStyle =>
  typeof value === "string" && PLAY_STYLE_SET.has(value as PlayStyle);

export const isAttendanceStatus = (value: unknown): value is AttendanceStatus =>
  typeof value === "string" && ATTENDANCE_STATUS_SET.has(value as AttendanceStatus);

export {
  SPORT_TYPES,
  PLAY_STYLES,
  ATTENDANCE_STATUSES,
  SKILL_LEVELS,
  SPORT_LABELS,
  PLAY_STYLE_LABELS,
  ATTENDANCE_STATUS_LABELS,
};

export type { SportType, PlayStyle, AttendanceStatus };
