import type { CityCategoryConfig, CityConfig } from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  badminton: "Badminton",
  chess: "Chess Clubs",
  art_gallery: "Art Galleries",
  board_games: "Board Games",
  padel: "Padel Courts",
  yoga: "Yoga Studios",
  rock_climbing: "Climbing Gyms",
  running_parks: "Running Parks",
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

export const bangkokCityConfig: CityConfig = {
  slug: "bangkok",
  name: "Bangkok",
  label: "Showing results near Bangkok, Thailand",
  scopeAliases: ["Bangkok", "Bangkok, Thailand", "Krung Thep", "Krung Thep Maha Nakhon", "กรุงเทพ", "กรุงเทพมหานคร"],
  center: {
    lat: 13.7563,
    lng: 100.5018,
  },
  defaultZoom: 11.5,
  defaultRegion: {
    latitudeDelta: 0.35,
    longitudeDelta: 0.35,
  },
  bbox: {
    sw: { lat: 13.55, lng: 100.3 },
    ne: { lat: 13.9, lng: 100.9 },
  },
  enabledCategories: [
    category("badminton", ["fitness"], ["badminton"]),
    category("chess", ["community"], ["chess", "หมากรุก", "ชมรมหมากรุก", "board_games", "board_game"]),
    category("art_gallery", ["arts_culture"], ["art_gallery", "gallery"]),
    category("board_games", ["community"], ["board_games", "board_game", "บอร์ดเกม"]),
    category("padel", ["fitness"], ["padel", "pádel", "padel club", "padel court", "สนามพาเดล"]),
    category("yoga", ["fitness"], ["yoga", "โยคะ", "yoga studio", "สตูดิโอโยคะ"]),
    category("rock_climbing", ["fitness"], ["climbing", "climbing gym", "rock_climbing", "bouldering", "ปีนผา", "โบลเดอร์"]),
    category("running_parks", ["outdoors"], ["running", "jogging", "track", "สวนวิ่ง", "สนามกรีฑา"]),
  ],
};
