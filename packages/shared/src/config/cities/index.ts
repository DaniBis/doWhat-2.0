import { bangkokCityConfig } from "./bangkok";
import type { CityCategoryConfig, CityConfig } from "./types";

const CITY_REGISTRY: Record<string, CityConfig> = {
  [bangkokCityConfig.slug]: bangkokCityConfig,
};

const normaliseEnvValue = (value?: string) => value?.trim().toLowerCase();

const DEFAULT_CITY_SLUG =
  normaliseEnvValue(process.env.NEXT_PUBLIC_DEFAULT_CITY) ||
  normaliseEnvValue(process.env.EXPO_PUBLIC_DEFAULT_CITY) ||
  normaliseEnvValue(process.env.DEFAULT_CITY) ||
  bangkokCityConfig.slug;

const CITY_SWITCHER_ENABLED =
  normaliseEnvValue(process.env.NEXT_PUBLIC_ENABLE_CITY_SWITCHER) === "true" ||
  normaliseEnvValue(process.env.EXPO_PUBLIC_ENABLE_CITY_SWITCHER) === "true" ||
  normaliseEnvValue(process.env.ENABLE_CITY_SWITCHER) === "true";

export const listCities = (): CityConfig[] => Object.values(CITY_REGISTRY);

export const getCityConfig = (slug?: string): CityConfig => {
  if (slug && CITY_REGISTRY[slug]) return CITY_REGISTRY[slug];
  return CITY_REGISTRY[DEFAULT_CITY_SLUG] ?? bangkokCityConfig;
};

export const getCityCategoryConfigMap = (city: CityConfig): Map<string, CityCategoryConfig> =>
  new Map(city.enabledCategories.map((category) => [category.key, category]));

export { CITY_SWITCHER_ENABLED, DEFAULT_CITY_SLUG };
export type { CityCategoryConfig, CityConfig };
