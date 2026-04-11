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

export const hanoiCityConfig: CityConfig = {
  slug: "hanoi",
  name: "Hanoi",
  label: "Showing results near Hanoi, Vietnam",
  scopeAliases: ["Hanoi", "Ha Noi", "Hà Nội", "Hanoi, Vietnam", "Ha Noi, Vietnam", "Hà Nội, Việt Nam"],
  center: {
    lat: 21.0285,
    lng: 105.8542,
  },
  defaultZoom: 12,
  defaultRegion: {
    latitudeDelta: 0.26,
    longitudeDelta: 0.26,
  },
  bbox: {
    sw: { lat: 20.86, lng: 105.62 },
    ne: { lat: 21.26, lng: 106.10 },
  },
  enabledCategories: [
    category("climbing_bouldering", ["fitness"], ["climbing", "climbing gym", "bouldering", "bouldering gym", "rock_climbing", "leo nui", "leo núi", "phong tap leo nui", "phòng tập leo núi"]),
    category("padel", ["fitness"], ["padel", "pádel", "san padel", "sân padel", "padel club"]),
    category("running", ["outdoors"], ["running", "jogging", "track", "athletics", "chạy bộ", "điền kinh"]),
    category("yoga", ["fitness"], ["yoga", "yoga studio", "thiền", "phòng tập yoga"]),
    category("chess", ["community"], ["chess", "chess_club", "cờ vua", "câu lạc bộ cờ vua", "board_games"]),
  ],
};
