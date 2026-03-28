import type { CityCategoryConfig, CityConfig } from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  climbing_bouldering: "Climbing & Bouldering",
  padel: "Padel Courts",
  running: "Running Parks",
  yoga: "Yoga Studios",
  chess: "Chess Clubs",
};

const category = (
  key: keyof typeof CATEGORY_LABELS,
  queryCategories: CityCategoryConfig["queryCategories"],
  tagFilters: CityCategoryConfig["tagFilters"],
): CityCategoryConfig => ({
  key,
  label: CATEGORY_LABELS[key],
  queryCategories,
  tagFilters,
});

export const danangCityConfig: CityConfig = {
  slug: "danang",
  name: "Da Nang",
  label: "Showing results near Da Nang, Vietnam",
  scopeAliases: ["Da Nang", "DaNang", "Đà Nẵng", "Da Nang, Vietnam", "Đà Nẵng, Việt Nam", "Da Nang City", "Đà Nẵng City"],
  center: {
    lat: 16.0544,
    lng: 108.2022,
  },
  defaultZoom: 12.2,
  defaultRegion: {
    latitudeDelta: 0.22,
    longitudeDelta: 0.22,
  },
  bbox: {
    sw: { lat: 15.95, lng: 108.06 },
    ne: { lat: 16.20, lng: 108.33 },
  },
  enabledCategories: [
    category("climbing_bouldering", ["fitness"], ["climbing", "climbing gym", "bouldering", "bouldering gym", "rock_climbing", "leo nui", "leo núi", "phong tap leo nui", "phòng tập leo núi"]),
    category("padel", ["fitness"], ["padel", "pádel", "san padel", "sân padel", "padel club"]),
    category("running", ["outdoors"], ["running", "jogging", "track", "athletics", "chạy bộ", "điền kinh"]),
    category("yoga", ["fitness"], ["yoga", "yoga studio", "thiền", "phòng tập yoga"]),
    category("chess", ["community"], ["chess", "cờ vua", "câu lạc bộ cờ vua", "board_games"]),
  ],
};
