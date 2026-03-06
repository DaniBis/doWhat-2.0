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
    category("climbing_bouldering", ["fitness"], ["climbing", "bouldering", "rock_climbing", "leo nui"]),
    category("padel", ["fitness"], ["padel", "pádel"]),
    category("running", ["outdoors"], ["running", "jogging", "track", "chạy bộ"]),
    category("yoga", ["fitness"], ["yoga", "thiền"]),
    category("chess", ["community"], ["chess", "cờ vua", "board_games"]),
  ],
};
